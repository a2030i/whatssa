import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function logToSystem(
  client: any,
  level: string,
  message: string,
  metadata: Record<string, unknown> = {},
  orgId: string | null = null
) {
  try {
    await client.from("system_logs").insert({
      level,
      source: "edge_function",
      function_name: "auto-assign",
      message,
      metadata,
      org_id: orgId,
    });
  } catch (_) {
    // silent
  }
}

/** Insert a system message into the conversation timeline */
async function insertSystemMessage(client: any, conversationId: string, content: string) {
  try {
    await client.from("messages").insert({
      conversation_id: conversationId,
      content,
      sender: "system",
      message_type: "text",
    });
  } catch (_) {
    // silent
  }
}

/** Send a WhatsApp message to customer (best-effort) */
async function sendCustomerMessage(
  client: any,
  orgId: string,
  conversationId: string,
  phone: string,
  text: string,
  replacements: Record<string, string> = {}
) {
  try {
    let msg = text;
    for (const [key, val] of Object.entries(replacements)) {
      msg = msg.replace(new RegExp(`\\{${key}\\}`, "g"), val);
    }
    const { data: channel } = await client
      .from("whatsapp_config")
      .select("id")
      .eq("org_id", orgId)
      .eq("is_connected", true)
      .limit(1)
      .single();
    if (channel) {
      await client.functions.invoke("whatsapp-send", {
        body: { org_id: orgId, channel_id: channel.id, to: phone, text: msg, conversation_id: conversationId },
      });
    }
  } catch (_) {
    // silent — don't block assignment flow
  }
}

/** Check if currentTime falls within a shift, supporting overnight (e.g. 22:00→06:00) */
function isInShift(currentTime: string, currentDay: number, start: string, end: string, days: number[]): boolean {
  if (!days.includes(currentDay)) return false;
  if (start <= end) {
    return currentTime >= start && currentTime <= end;
  } else {
    return currentTime >= start || currentTime <= end;
  }
}

function isAgentInShift(agent: any, currentTime: string, currentDay: number): boolean {
  const shift1Days: number[] = agent.work_days || [0, 1, 2, 3, 4];
  const shift1Start = agent.work_start || "09:00";
  const shift1End = agent.work_end || "17:00";
  const inShift1 = isInShift(currentTime, currentDay, shift1Start, shift1End, shift1Days);

  let inShift2 = false;
  if (agent.work_start_2 && agent.work_end_2) {
    const shift2Days: number[] = agent.work_days_2 || shift1Days;
    inShift2 = isInShift(currentTime, currentDay, agent.work_start_2, agent.work_end_2, shift2Days);
  }

  return inShift1 || inShift2;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { conversation_id, org_id, message_text, exclude_supervisors } = await req.json();
    if (!conversation_id || !org_id) {
      return json({ error: "Missing conversation_id or org_id" }, 400);
    }

    await logToSystem(supabase, "info", "بدء التوزيع التلقائي", { conversation_id, message_text: message_text?.substring(0, 100) }, org_id);

    // Get conversation to find assigned_team
    const { data: conversation } = await supabase
      .from("conversations")
      .select("assigned_team, customer_phone")
      .eq("id", conversation_id)
      .single();

    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.toLocaleTimeString("en-US", {
      hour12: false, hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh",
    });

    // Get org defaults
    const { data: org } = await supabase
      .from("organizations")
      .select("default_assignment_strategy, default_max_conversations, settings")
      .eq("id", org_id)
      .single();

    const orgStrategy = org?.default_assignment_strategy || "round_robin";
    const orgMaxConv = org?.default_max_conversations;
    const orgSettings = ((org as any)?.settings as Record<string, any>) || {};
    const autoAssignOnReconnect = !!orgSettings.auto_assign_on_reconnect;
    const failMessage: string = orgSettings.auto_assign_fail_message || "";
    const successMessage: string = orgSettings.auto_assign_success_message || "";

    // Get all teams for skill-based routing
    const { data: allTeams } = await supabase
      .from("teams")
      .select("id, name, assignment_strategy, max_conversations_per_agent, last_assigned_index, skill_keywords")
      .eq("org_id", org_id);

    // Determine which team to use
    let targetTeam: any = null;

    // 1. If conversation already has assigned_team, use that
    if (conversation?.assigned_team && allTeams) {
      targetTeam = allTeams.find((t: any) => t.name === conversation.assigned_team || t.id === conversation.assigned_team);
    }

    // 2. Skill-based routing: check message text against team keywords
    if (!targetTeam && message_text && allTeams) {
      const msgLower = (message_text || "").toLowerCase();
      for (const team of allTeams) {
        const keywords: string[] = Array.isArray(team.skill_keywords) ? team.skill_keywords : [];
        if (keywords.length > 0 && keywords.some((kw: string) => msgLower.includes(kw.toLowerCase()))) {
          targetTeam = team;
          await logToSystem(supabase, "info", `توجيه بناءً على المهارة إلى فريق: ${team.name}`, { conversation_id, team_id: team.id, matched_keywords: keywords }, org_id);
          break;
        }
      }
    }

    const strategy = targetTeam?.assignment_strategy || orgStrategy;
    const maxConv = targetTeam?.max_conversations_per_agent ?? orgMaxConv;

    // If strategy is manual, don't auto-assign
    if (strategy === "manual") {
      await insertSystemMessage(supabase, conversation_id, "⚙️ الإسناد التلقائي: الاستراتيجية يدوية — بانتظار إسناد يدوي من المدير");
      await logToSystem(supabase, "info", "لم يتم التوزيع: الاستراتيجية يدوية", { conversation_id, strategy }, org_id);
      return json({ assigned: false, reason: "manual_strategy" });
    }

    // Get members (filter by team if applicable)
    // Always exclude supervisors and admins from auto-assign — only regular members
    let membersQuery = supabase
      .from("profiles")
      .select("id, full_name, is_online, is_supervisor, is_on_break, work_start, work_end, work_days, work_start_2, work_end_2, work_days_2, team_id, team_ids")
      .eq("org_id", org_id)
      .eq("is_active", true)
      .eq("is_supervisor", false);

    // Also exclude admins by checking user_roles
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "super_admin"]);
    const adminUserIds = (adminRoles || []).map((r: any) => r.user_id);

    const { data: allMembers, error: membersErr } = await membersQuery;

    // Filter: exclude admins + filter by team (checking both team_id and team_ids array)
    let members = (allMembers || []).filter((m: any) => !adminUserIds.includes(m.id));

    if (targetTeam) {
      members = members.filter((m: any) => {
        if (Array.isArray(m.team_ids) && m.team_ids.length > 0) {
          return m.team_ids.includes(targetTeam.id);
        }
        return m.team_id === targetTeam.id;
      });
    }

    if (membersErr || !members || members.length === 0) {
      await insertSystemMessage(supabase, conversation_id, `⚙️ الإسناد التلقائي: لا يوجد موظفين في ${targetTeam ? `فريق "${targetTeam.name}"` : "المنظمة"}`);
      await logToSystem(supabase, "warn", "لم يتم التوزيع: لا يوجد موظفين (تم استثناء المشرفين والمدراء)", { conversation_id, error: membersErr?.message, team: targetTeam?.name }, org_id);
      return json({ assigned: false, reason: "no_members" });
    }

    // Filter available agents: online AND within work shift
    const available = members.filter((m) => m.is_online && !m.is_on_break && isAgentInShift(m, currentTime, currentDay));

    // Get conversation loads for available agents
    const getAgentLoads = async (pool: typeof members) => {
      return Promise.all(
        pool.map(async (agent) => {
          const { count } = await supabase
            .from("conversations")
            .select("*", { count: "exact", head: true })
            .eq("org_id", org_id)
            .eq("assigned_to", agent.full_name)
            .eq("status", "active");
          return { ...agent, load: count || 0 };
        })
      );
    };

    const assignTo = async (agent: any, fallback = false) => {
      await supabase.from("conversations").update({
        assigned_to: agent.full_name,
        assigned_to_id: agent.id,
        assigned_team: targetTeam?.name || null,
        assigned_team_id: targetTeam?.id || null,
        assigned_at: new Date().toISOString(),
        first_response_at: null,
        escalated: false,
      }).eq("id", conversation_id);

      // Log assignment step in conversation timeline
      const stepMsg = fallback
        ? `⚙️ الإسناد التلقائي: تم الإسناد إلى ${agent.full_name} (خارج الوردية — fallback)`
        : `⚙️ الإسناد التلقائي: تم الإسناد إلى ${agent.full_name}${targetTeam ? ` — فريق "${targetTeam.name}"` : ""} (${strategy})`;
      await insertSystemMessage(supabase, conversation_id, stepMsg);

      // Optional: send success message to customer
      if (successMessage && conversation?.customer_phone) {
        await sendCustomerMessage(supabase, org_id, conversation_id, conversation.customer_phone, successMessage, {
          agent_name: agent.full_name || "",
          team_name: targetTeam?.name || "",
        });
      }

      await logToSystem(supabase, "info", `تم إسناد المحادثة إلى ${agent.full_name}`, {
        conversation_id,
        agent_id: agent.id,
        agent_name: agent.full_name,
        strategy,
        fallback,
        team: targetTeam?.name || null,
      }, org_id);

      return json({ assigned: true, agent: agent.full_name, strategy, fallback });
    };

    const pickAgent = async (pool: typeof members, fallback = false) => {
      if (pool.length === 0) return null;

      let agentsWithLoad = await getAgentLoads(pool);

      // Apply max conversations cap
      if (maxConv && maxConv > 0) {
        agentsWithLoad = agentsWithLoad.filter((a) => a.load < maxConv);
        if (agentsWithLoad.length === 0) {
          return null; // All agents at capacity
        }
      }

      let chosen: any;

      switch (strategy) {
        case "round_robin": {
          agentsWithLoad.sort((a, b) => a.full_name.localeCompare(b.full_name));
          const lastIdx = targetTeam?.last_assigned_index || 0;
          const nextIdx = lastIdx % agentsWithLoad.length;
          chosen = agentsWithLoad[nextIdx];

          if (targetTeam) {
            await supabase.from("teams")
              .update({ last_assigned_index: nextIdx + 1 })
              .eq("id", targetTeam.id);
          }
          break;
        }

        case "least_busy": {
          agentsWithLoad.sort((a, b) => a.load - b.load);
          chosen = agentsWithLoad[0];
          break;
        }

        case "skill_based": {
          agentsWithLoad.sort((a, b) => a.load - b.load);
          chosen = agentsWithLoad[0];
          break;
        }

        default: {
          agentsWithLoad.sort((a, b) => a.load - b.load);
          chosen = agentsWithLoad[0];
          break;
        }
      }

      if (chosen) {
        return assignTo(chosen, fallback);
      }
      return null;
    };

    // Try available agents first
    if (available.length > 0) {
      await insertSystemMessage(supabase, conversation_id, `⚙️ الإسناد التلقائي: ${available.length} موظف متاح — جاري التوزيع بـ "${strategy}"`);
      const result = await pickAgent(available);
      if (result) return result;
      await insertSystemMessage(supabase, conversation_id, `⚙️ الإسناد التلقائي: جميع الموظفين وصلوا للحد الأقصى (${maxConv} محادثة)`);
      await logToSystem(supabase, "warn", "جميع الوكلاء وصلوا للحد الأقصى", { conversation_id, available_count: available.length, max_conv: maxConv }, org_id);
    }

    // Fallback: anyone online regardless of shift hours
    const onlineOnly = members.filter((m) => m.is_online);
    if (onlineOnly.length > 0 && available.length === 0) {
      await insertSystemMessage(supabase, conversation_id, `⚙️ الإسناد التلقائي: لا يوجد موظف في الوردية — محاولة مع ${onlineOnly.length} موظف متصل`);
      const result = await pickAgent(onlineOnly, true);
      if (result) return result;
      await insertSystemMessage(supabase, conversation_id, "⚙️ الإسناد التلقائي: جميع الموظفين المتصلين وصلوا للحد الأقصى");
      await logToSystem(supabase, "warn", "جميع الوكلاء المتصلين وصلوا للحد الأقصى (fallback)", { conversation_id, online_count: onlineOnly.length }, org_id);
    }

    // === No agent could be assigned ===
    const noAgentMsg = autoAssignOnReconnect
      ? `⚠️ الإسناد التلقائي: لا يوجد موظف متاح حالياً — سيتم الإسناد تلقائياً عند اتصال أول موظف`
      : `⚠️ الإسناد التلقائي: لا يوجد موظف متاح حالياً (${members.length} موظف مسجل)`;
    await insertSystemMessage(supabase, conversation_id, noAgentMsg);

    // Mark conversation for deferred assignment
    if (autoAssignOnReconnect) {
      await supabase.from("conversations").update({
        status: "pending_assignment",
      } as any).eq("id", conversation_id);
    }

    // Optional: send failure message to customer
    if (failMessage && conversation?.customer_phone) {
      await sendCustomerMessage(supabase, org_id, conversation_id, conversation.customer_phone, failMessage);
    }

    await logToSystem(supabase, "warn", "لا يوجد وكلاء متاحين للتوزيع", { conversation_id, total_members: members.length, pending_reconnect: autoAssignOnReconnect }, org_id);
    return json({ assigned: false, reason: "no_available_agents", pending_reconnect: autoAssignOnReconnect });
  } catch (err) {
    await logToSystem(supabase, "error", "خطأ في التوزيع التلقائي", { error: err.message, stack: err.stack });
    return json({ error: err.message }, 500);
  }
});
