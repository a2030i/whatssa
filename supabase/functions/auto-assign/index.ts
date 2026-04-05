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
      .select("default_assignment_strategy, default_max_conversations")
      .eq("id", org_id)
      .single();

    const orgStrategy = org?.default_assignment_strategy || "round_robin";
    const orgMaxConv = org?.default_max_conversations;

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
      await logToSystem(supabase, "info", "لم يتم التوزيع: الاستراتيجية يدوية", { conversation_id, strategy }, org_id);
      return json({ assigned: false, reason: "manual_strategy" });
    }

    // Get members (filter by team if applicable)
    let membersQuery = supabase
      .from("profiles")
      .select("id, full_name, is_online, work_start, work_end, work_days, work_start_2, work_end_2, work_days_2, team_id")
      .eq("org_id", org_id)
      .eq("is_active", true);

    if (targetTeam) {
      membersQuery = membersQuery.eq("team_id", targetTeam.id);
    }

    const { data: members, error: membersErr } = await membersQuery;

    if (membersErr || !members || members.length === 0) {
      await logToSystem(supabase, "warn", "لم يتم التوزيع: لا يوجد أعضاء", { conversation_id, error: membersErr?.message, team: targetTeam?.name }, org_id);
      return json({ assigned: false, reason: "no_members" });
    }

    // Filter available agents: online AND within work shift
    const available = members.filter((m) => m.is_online && isAgentInShift(m, currentTime, currentDay));

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
        assigned_team: targetTeam?.name || null,
        assigned_at: new Date().toISOString(),
        first_response_at: null,
        escalated: false,
      }).eq("id", conversation_id);

      if (!fallback) {
        await supabase.from("messages").insert({
          conversation_id,
          content: `تم إسناد المحادثة تلقائياً إلى ${agent.full_name}`,
          sender: "system",
          message_type: "text",
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
      const result = await pickAgent(available);
      if (result) return result;
      await logToSystem(supabase, "warn", "جميع الوكلاء وصلوا للحد الأقصى", { conversation_id, available_count: available.length, max_conv: maxConv }, org_id);
      return json({ assigned: false, reason: "all_agents_at_capacity" });
    }

    // Fallback: anyone online regardless of shift hours
    const onlineOnly = members.filter((m) => m.is_online);
    if (onlineOnly.length > 0) {
      const result = await pickAgent(onlineOnly, true);
      if (result) return result;
      await logToSystem(supabase, "warn", "جميع الوكلاء المتصلين وصلوا للحد الأقصى (fallback)", { conversation_id, online_count: onlineOnly.length }, org_id);
      return json({ assigned: false, reason: "all_agents_at_capacity" });
    }

    await logToSystem(supabase, "warn", "لا يوجد وكلاء متاحين للتوزيع", { conversation_id, total_members: members.length }, org_id);
    return json({ assigned: false, reason: "no_available_agents" });
  } catch (err) {
    await logToSystem(supabase, "error", "خطأ في التوزيع التلقائي", { error: err.message, stack: err.stack });
    return json({ error: err.message }, 500);
  }
});
