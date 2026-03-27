import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { conversation_id, org_id } = await req.json();
    if (!conversation_id || !org_id) {
      return new Response(JSON.stringify({ error: "Missing conversation_id or org_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get current day (0=Sun) and time
    const now = new Date();
    const currentDay = now.getDay();
    // Convert to HH:MM for comparison
    const currentTime = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" });

    // Get all active members in this org who are available
    const { data: members, error: membersErr } = await supabase
      .from("profiles")
      .select("id, full_name, is_online, work_start, work_end, work_days")
      .eq("org_id", org_id)
      .eq("is_active", true);

    if (membersErr || !members || members.length === 0) {
      return new Response(JSON.stringify({ assigned: false, reason: "no_members" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter available agents: online AND within work hours
    const available = members.filter((m) => {
      const workDays: number[] = m.work_days || [0, 1, 2, 3, 4];
      const inWorkDay = workDays.includes(currentDay);
      const workStart = m.work_start || "09:00";
      const workEnd = m.work_end || "17:00";
      const inWorkHours = currentTime >= workStart && currentTime <= workEnd;
      return m.is_online && inWorkDay && inWorkHours;
    });

    if (available.length === 0) {
      // Fallback: try anyone who is online regardless of hours
      const onlineOnly = members.filter((m) => m.is_online);
      if (onlineOnly.length === 0) {
        return new Response(JSON.stringify({ assigned: false, reason: "no_available_agents" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Assign to online agent with fewest active conversations
      const agentLoads = await Promise.all(
        onlineOnly.map(async (agent) => {
          const { count } = await supabase
            .from("conversations")
            .select("*", { count: "exact", head: true })
            .eq("org_id", org_id)
            .eq("assigned_to", agent.full_name)
            .eq("status", "active");
          return { ...agent, load: count || 0 };
        })
      );
      agentLoads.sort((a, b) => a.load - b.load);
      const chosen = agentLoads[0];
      await supabase.from("conversations").update({ assigned_to: chosen.full_name }).eq("id", conversation_id);
      return new Response(JSON.stringify({ assigned: true, agent: chosen.full_name, fallback: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Round-robin by load: assign to agent with fewest active conversations
    const agentLoads = await Promise.all(
      available.map(async (agent) => {
        const { count } = await supabase
          .from("conversations")
          .select("*", { count: "exact", head: true })
          .eq("org_id", org_id)
          .eq("assigned_to", agent.full_name)
          .eq("status", "active");
        return { ...agent, load: count || 0 };
      })
    );
    agentLoads.sort((a, b) => a.load - b.load);
    const chosen = agentLoads[0];

    await supabase.from("conversations").update({ assigned_to: chosen.full_name }).eq("id", conversation_id);

    // Insert system message
    await supabase.from("messages").insert({
      conversation_id,
      content: `تم إسناد المحادثة تلقائياً إلى ${chosen.full_name}`,
      sender: "system",
      message_type: "text",
    });

    return new Response(JSON.stringify({ assigned: true, agent: chosen.full_name }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
