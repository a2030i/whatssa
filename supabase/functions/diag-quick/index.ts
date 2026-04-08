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

  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 1. Get webhook logs for incoming messages
    const { data: webhookLogs, error: wErr } = await db
      .from("system_logs")
      .select("created_at, message, metadata, org_id")
      .eq("function_name", "whatsapp-webhook")
      .eq("level", "info")
      .like("message", "رسالة واردة من%")
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(100);

    // 2. Get duplicate logs
    const { data: dupLogs } = await db
      .from("system_logs")
      .select("created_at, message, metadata")
      .eq("function_name", "whatsapp-webhook")
      .like("message", "%مكررة%")
      .gte("created_at", since24h)
      .limit(50);

    // 3. Get error logs
    const { data: errorLogs } = await db
      .from("system_logs")
      .select("created_at, level, message, metadata")
      .eq("function_name", "whatsapp-webhook")
      .in("level", ["error", "critical", "warn"])
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(30);

    // 4. Per-phone analysis
    const phoneMap: Record<string, { count: number; wa_ids: string[] }> = {};
    for (const log of (webhookLogs || [])) {
      const phone = (log.message as string).replace("رسالة واردة من ", "").trim();
      const waId = (log.metadata as any)?.wa_message_id || "";
      if (!phoneMap[phone]) phoneMap[phone] = { count: 0, wa_ids: [] };
      phoneMap[phone].count++;
      if (waId) phoneMap[phone].wa_ids.push(waId);
    }

    // Top 5 phones - check DB messages
    const topPhones = Object.entries(phoneMap).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
    const analysis: any[] = [];

    for (const [phone, data] of topPhones) {
      // Find conversations
      const { data: convs } = await db
        .from("conversations")
        .select("id, status, channel_id, customer_name")
        .eq("customer_phone", phone)
        .eq("conversation_type", "private")
        .order("created_at", { ascending: false })
        .limit(3);

      let dbMsgCount = 0;
      const convInfo: any[] = [];
      for (const conv of (convs || [])) {
        const { count } = await db
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .eq("sender", "customer")
          .gte("created_at", since24h);
        dbMsgCount += (count || 0);
        convInfo.push({ id: conv.id, status: conv.status, msgs_24h: count || 0 });
      }

      // Check duplicate conversations (same phone, multiple non-closed)
      const openConvs = (convs || []).filter(c => c.status !== "closed");

      analysis.push({
        phone,
        webhook_hits: data.count,
        db_customer_msgs: dbMsgCount,
        gap: data.count - dbMsgCount,
        conversations: convInfo,
        duplicate_open: openConvs.length > 1,
      });
    }

    // 5. Check for conversation insert errors
    const { data: insertErrors } = await db
      .from("system_logs")
      .select("created_at, message, metadata")
      .eq("function_name", "whatsapp-webhook")
      .eq("level", "error")
      .gte("created_at", since24h)
      .limit(20);

    return new Response(JSON.stringify({
      webhook_log_error: wErr?.message || null,
      total_webhook_hits: (webhookLogs || []).length,
      total_duplicates: (dupLogs || []).length,
      total_errors: (errorLogs || []).length,
      per_phone: analysis,
      errors: (errorLogs || []).slice(0, 10),
      duplicates: (dupLogs || []).slice(0, 5),
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
