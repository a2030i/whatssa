import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const db = createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const { data: { user: caller }, error: userError } = await db.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userError || !caller) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const { data: roleData } = await db.from("user_roles").select("role").eq("user_id", caller.id).eq("role", "super_admin").maybeSingle();
  if (!roleData) {
    return new Response(JSON.stringify({ error: "Forbidden — super_admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let reqPhone = "";
  try { const b = await req.json(); if (b?.phone) reqPhone = String(b.phone); } catch (_) {}

  try {
    const since30min = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    // Get ALL whatsapp-webhook logs from last 30 min
    const { data: allLogs, error: logsErr } = await db
      .from("system_logs")
      .select("created_at, level, message, metadata, org_id")
      .eq("function_name", "whatsapp-webhook")
      .gte("created_at", since30min)
      .order("created_at", { ascending: true })
      .limit(200);

    // Get ALL conversations for the target phone
    const { data: allConvs } = await db
      .from("conversations")
      .select("id, status, customer_phone, channel_id, conversation_type, created_at, closed_at, last_message_at, unread_count, org_id")
      .eq("customer_phone", reqPhone)
      .order("created_at", { ascending: false })
      .limit(20);

    // Also check without normalization
    const { data: allConvs2 } = await db
      .from("conversations")
      .select("id, status, customer_phone, channel_id, conversation_type, created_at")
      .like("customer_phone", `%${reqPhone.slice(-9)}%`)
      .order("created_at", { ascending: false })
      .limit(20);

    // Check errors specifically
    const { data: errorLogs } = await db
      .from("system_logs")
      .select("created_at, level, message, metadata")
      .eq("function_name", "whatsapp-webhook")
      .in("level", ["error", "critical", "warn"])
      .gte("created_at", since30min)
      .order("created_at", { ascending: false })
      .limit(20);

    return new Response(JSON.stringify({
      logs_error: logsErr?.message,
      total_logs_30min: (allLogs || []).length,
      logs: (allLogs || []).map(l => ({
        time: l.created_at,
        level: l.level,
        msg: (l.message as string)?.slice(0, 80),
        trace_step: (l.metadata as any)?.trace_step || null,
        wa_id: ((l.metadata as any)?.wa_message_id || "")?.toString().slice(-12),
        conv_id: ((l.metadata as any)?.conv_id || (l.metadata as any)?.conversation_id || "")?.toString().slice(0, 12),
        found: (l.metadata as any)?.found,
      })),
      conversations_exact: allConvs,
      conversations_like: (allConvs2 || []).length,
      errors_30min: errorLogs,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
