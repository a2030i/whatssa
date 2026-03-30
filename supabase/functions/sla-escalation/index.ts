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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Get all teams with SLA enabled
    const { data: teams } = await supabase
      .from("teams")
      .select("id, name, org_id, sla_enabled, response_timeout_minutes, escalation_action, assignment_strategy, max_conversations_per_agent, last_assigned_index")
      .eq("sla_enabled", true);

    if (!teams || teams.length === 0) {
      return json({ escalated: 0, message: "No SLA-enabled teams" });
    }

    let totalEscalated = 0;

    for (const team of teams) {
      const timeoutMinutes = team.response_timeout_minutes || 30;
      const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();

      // Find conversations assigned to this team's members that haven't been responded to
      const { data: overdueConversations } = await supabase
        .from("conversations")
        .select("id, assigned_to, assigned_at, customer_phone, customer_name, org_id")
        .eq("org_id", team.org_id)
        .eq("assigned_team", team.name)
        .eq("status", "active")
        .eq("escalated", false)
        .not("assigned_to", "is", null)
        .not("assigned_at", "is", null)
        .is("first_response_at", null)
        .lt("assigned_at", cutoff);

      if (!overdueConversations || overdueConversations.length === 0) continue;

      for (const conv of overdueConversations) {
        const escalationAction = team.escalation_action || "reassign";

        if (escalationAction === "reassign") {
          // Find another available agent in the same team
          const { data: teamMembers } = await supabase
            .from("profiles")
            .select("id, full_name, is_online, is_active")
            .eq("team_id", team.id)
            .eq("is_active", true)
            .neq("full_name", conv.assigned_to);

          const onlineMembers = (teamMembers || []).filter((m: any) => m.is_online);

          if (onlineMembers.length > 0) {
            // Get loads
            const loadsPromises = onlineMembers.map(async (m: any) => {
              const { count } = await supabase
                .from("conversations")
                .select("*", { count: "exact", head: true })
                .eq("org_id", team.org_id)
                .eq("assigned_to", m.full_name)
                .eq("status", "active");
              return { ...m, load: count || 0 };
            });
            const withLoads = await Promise.all(loadsPromises);
            withLoads.sort((a, b) => a.load - b.load);
            const chosen = withLoads[0];

            await supabase.from("conversations").update({
              assigned_to: chosen.full_name,
              assigned_at: new Date().toISOString(),
              escalated: true,
              escalated_at: new Date().toISOString(),
            }).eq("id", conv.id);

            // System message
            await supabase.from("messages").insert({
              conversation_id: conv.id,
              content: `⚠️ تم تصعيد المحادثة من ${conv.assigned_to} إلى ${chosen.full_name} بسبب تجاوز مهلة الرد (${timeoutMinutes} دقيقة)`,
              sender: "system",
              message_type: "text",
            });

            // Notification
            await supabase.from("notifications").insert({
              org_id: team.org_id,
              user_id: chosen.id,
              type: "escalation",
              title: "تصعيد محادثة",
              body: `تم تصعيد محادثة ${conv.customer_name || conv.customer_phone} إليك بسبب عدم الرد خلال ${timeoutMinutes} دقيقة`,
              reference_type: "conversation",
              reference_id: conv.id,
            });

            totalEscalated++;
          }
        } else if (escalationAction === "supervisor") {
          // Find supervisor in the team
          const { data: teamMembers } = await supabase
            .from("profiles")
            .select("id, full_name")
            .eq("team_id", team.id)
            .eq("is_active", true);

          if (teamMembers && teamMembers.length > 0) {
            // Find supervisors
            const memberIds = teamMembers.map((m: any) => m.id);
            const { data: supervisorRoles } = await supabase
              .from("user_roles")
              .select("user_id")
              .in("user_id", memberIds)
              .in("role", ["supervisor", "admin"]);

            const supervisorIds = (supervisorRoles || []).map((r: any) => r.user_id);
            const supervisor = teamMembers.find((m: any) => supervisorIds.includes(m.id));

            if (supervisor) {
              await supabase.from("conversations").update({
                assigned_to: supervisor.full_name,
                assigned_at: new Date().toISOString(),
                escalated: true,
                escalated_at: new Date().toISOString(),
              }).eq("id", conv.id);

              await supabase.from("messages").insert({
                conversation_id: conv.id,
                content: `⚠️ تم تصعيد المحادثة إلى المشرف ${supervisor.full_name} بسبب تجاوز مهلة الرد (${timeoutMinutes} دقيقة)`,
                sender: "system",
                message_type: "text",
              });

              await supabase.from("notifications").insert({
                org_id: team.org_id,
                user_id: supervisor.id,
                type: "escalation",
                title: "تصعيد محادثة",
                body: `تم تصعيد محادثة ${conv.customer_name || conv.customer_phone} إليك — الموظف ${conv.assigned_to} لم يرد خلال ${timeoutMinutes} دقيقة`,
                reference_type: "conversation",
                reference_id: conv.id,
              });

              totalEscalated++;
            }
          }
        } else if (escalationAction === "unassign") {
          // Just unassign so it goes back to pool
          await supabase.from("conversations").update({
            assigned_to: null,
            assigned_at: null,
            escalated: true,
            escalated_at: new Date().toISOString(),
          }).eq("id", conv.id);

          await supabase.from("messages").insert({
            conversation_id: conv.id,
            content: `⚠️ تم إلغاء إسناد المحادثة بسبب تجاوز مهلة الرد (${timeoutMinutes} دقيقة) — ستتم إعادة توزيعها`,
            sender: "system",
            message_type: "text",
          });

          totalEscalated++;
        }
      }

      // Log
      await supabase.from("system_logs").insert({
        level: "info",
        source: "edge_function",
        function_name: "sla-escalation",
        message: `تم تصعيد ${overdueConversations.length} محادثة من فريق ${team.name}`,
        metadata: { team_id: team.id, timeout: timeoutMinutes, action: team.escalation_action },
        org_id: team.org_id,
      });
    }

    return json({ escalated: totalEscalated });
  } catch (err) {
    console.error("SLA Escalation Error:", err);
    return json({ error: err.message }, 500);
  }
});
