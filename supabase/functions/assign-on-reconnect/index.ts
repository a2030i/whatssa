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

/**
 * assign-on-reconnect
 * Called when an agent comes online. Picks up conversations marked "pending_assignment"
 * and runs auto-assign for each one.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { org_id, agent_id } = await req.json();
    if (!org_id) return json({ error: "Missing org_id" }, 400);

    // Check if org has auto_assign_on_reconnect enabled
    const { data: org } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", org_id)
      .single();

    const settings = ((org as any)?.settings as Record<string, any>) || {};
    if (!settings.auto_assign_on_reconnect) {
      return json({ processed: 0, reason: "feature_disabled" });
    }

    // Find conversations pending assignment for this org
    const { data: pending } = await supabase
      .from("conversations")
      .select("id")
      .eq("org_id", org_id)
      .eq("status", "pending_assignment")
      .order("created_at", { ascending: true })
      .limit(20);

    if (!pending || pending.length === 0) {
      return json({ processed: 0, reason: "no_pending" });
    }

    let assignedCount = 0;

    // Use the internal Supabase URL for function invocations
    const internalUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    for (const conv of pending) {
      try {
        // Reset status to active before attempting assignment
        await supabase
          .from("conversations")
          .update({ status: "active" })
          .eq("id", conv.id);

        // Call auto-assign for this conversation
        const resp = await fetch(`${internalUrl}/functions/v1/auto-assign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            conversation_id: conv.id,
            org_id,
            message_text: "",
          }),
        });

        const result = await resp.json();
        if (result.assigned) {
          assignedCount++;
        } else {
          // If still can't assign, mark pending again
          await supabase
            .from("conversations")
            .update({ status: "pending_assignment" } as any)
            .eq("id", conv.id);
          break; // If this one failed, no point trying more
        }
      } catch (_) {
        // continue with next
      }
    }

    // Log system message
    if (assignedCount > 0) {
      try {
        await supabase.from("system_logs").insert({
          level: "info",
          source: "edge_function",
          function_name: "assign-on-reconnect",
          message: `تم إسناد ${assignedCount} محادثة معلقة عند اتصال موظف`,
          metadata: { org_id, agent_id, total_pending: pending.length, assigned: assignedCount },
          org_id,
        });
      } catch (_) {}
    }

    return json({ processed: assignedCount, total_pending: pending.length });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});