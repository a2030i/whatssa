import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Check if currentTime falls within a shift, supporting overnight (e.g. 22:00→06:00) */
function isInShift(currentTime: string, currentDay: number, start: string, end: string, days: number[]): boolean {
  if (!days.includes(currentDay)) return false;
  if (start <= end) {
    // Normal shift: e.g. 09:00→17:00
    return currentTime >= start && currentTime <= end;
  } else {
    // Overnight shift: e.g. 22:00→06:00
    // Either current time is after start (same day) OR before end (next morning)
    return currentTime >= start || currentTime <= end;
  }
}

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

    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" });

    const { data: members, error: membersErr } = await supabase
      .from("profiles")
      .select("id, full_name, is_online, work_start, work_end, work_days, work_start_2, work_end_2, work_days_2")
      .eq("org_id", org_id)
      .eq("is_active", true);

    if (membersErr || !members || members.length === 0) {
      return new Response(JSON.stringify({ assigned: false, reason: "no_members" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter available agents: online AND within any of their work shifts
    const available = members.filter((m) => {
      if (!m.is_online) return false;

      const shift1Days: number[] = m.work_days || [0, 1, 2, 3, 4];
      const shift1Start = m.work_start || "09:00";
      const shift1End = m.work_end || "17:00";
      const inShift1 = isInShift(currentTime, currentDay, shift1Start, shift1End, shift1Days);

      let inShift2 = false;
      if (m.work_start_2 && m.work_end_2) {
        const shift2Days: number[] = m.work_days_2 || shift1Days;
        inShift2 = isInShift(currentTime, currentDay, m.work_start_2, m.work_end_2, shift2Days);
      }

      return inShift1 || inShift2;
    });

    const assignAgent = async (pool: typeof members, fallback = false) => {
      const agentLoads = await Promise.all(
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
      agentLoads.sort((a, b) => a.load - b.load);
      const chosen = agentLoads[0];
      await supabase.from("conversations").update({ assigned_to: chosen.full_name }).eq("id", conversation_id);

      if (!fallback) {
        await supabase.from("messages").insert({
          conversation_id,
          content: `تم إسناد المحادثة تلقائياً إلى ${chosen.full_name}`,
          sender: "system",
          message_type: "text",
        });
      }

      return new Response(JSON.stringify({ assigned: true, agent: chosen.full_name, fallback }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    };

    if (available.length > 0) {
      return await assignAgent(available);
    }

    // Fallback: anyone online regardless of hours
    const onlineOnly = members.filter((m) => m.is_online);
    if (onlineOnly.length > 0) {
      return await assignAgent(onlineOnly, true);
    }

    return new Response(JSON.stringify({ assigned: false, reason: "no_available_agents" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
