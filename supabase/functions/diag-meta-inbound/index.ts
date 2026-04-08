import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const db = createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: metaChannels, error: channelsError } = await db
      .from("whatsapp_config")
      .select("id, org_id, label, business_name, display_phone, phone_number_id, is_connected, last_webhook_at, updated_at")
      .eq("channel_type", "meta_api")
      .order("created_at", { ascending: true });

    const channelIds = (metaChannels || []).map((c) => c.id);

    const [webhookLogsRes, sendLogsRes, conversationsRes, recentInboundRes] = await Promise.all([
      db
        .from("system_logs")
        .select("created_at, level, message, metadata, org_id")
        .eq("function_name", "whatsapp-webhook")
        .gte("created_at", since7d)
        .order("created_at", { ascending: false })
        .limit(30),
      db
        .from("system_logs")
        .select("created_at, level, message, metadata, org_id")
        .eq("function_name", "whatsapp-send")
        .gte("created_at", since7d)
        .order("created_at", { ascending: false })
        .limit(20),
      channelIds.length
        ? db
            .from("conversations")
            .select("id, channel_id, customer_name, customer_phone, status, last_message, last_message_at, last_message_sender, updated_at")
            .in("channel_id", channelIds)
            .order("last_message_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [], error: null }),
      channelIds.length
        ? db
            .from("messages")
            .select("id, conversation_id, sender, content, created_at, wa_message_id, conversations!inner(channel_id, customer_name, customer_phone)")
            .eq("sender", "customer")
            .in("conversations.channel_id", channelIds)
            .gte("created_at", since24h)
            .order("created_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const webhookLogs = webhookLogsRes.data || [];
    const sendLogs = sendLogsRes.data || [];
    const conversations = conversationsRes.data || [];
    const recentInbound = recentInboundRes.data || [];

    const latestWebhookAt = (metaChannels || [])
      .map((c) => c.last_webhook_at)
      .filter(Boolean)
      .sort()
      .reverse()[0] || null;

    const warnings: string[] = [];

    if (channelsError) warnings.push(`channels_error: ${channelsError.message}`);
    if ((metaChannels || []).length === 0) warnings.push("لا توجد أي قناة Meta API مسجلة في قاعدة البيانات الفعلية");
    if ((metaChannels || []).some((c) => !c.phone_number_id)) warnings.push("يوجد قناة Meta بدون phone_number_id وهذا يمنع ربط الرسائل الواردة بها");
    if ((metaChannels || []).every((c) => !c.last_webhook_at)) warnings.push("لا يوجد last_webhook_at لأي قناة Meta — هذا يعني أن الويب هوك لم يضرب القنوات أو أن الربط بالـ phone_number_id لا يطابق");
    if ((metaChannels || []).some((c) => c.last_webhook_at && c.last_webhook_at < since24h)) warnings.push("آخر نشاط webhook لبعض القنوات أقدم من 24 ساعة");
    if (webhookLogs.some((log) => String(log.message || "").includes("Webhook وارد بدون مؤسسة مطابقة"))) warnings.push("تم العثور على ضربات Webhook لا تطابق أي org/channel — غالباً phone_number_id مختلف أو القناة غير معلمة كمتصلة");
    if (sendLogs.length > 0 && webhookLogs.length === 0) warnings.push("يوجد إرسال حديث لكن لا توجد أي سجلات استقبال حديثة — المشكلة غالباً من Meta webhook أو الاشتراك الخارجي");
    if (recentInbound.length === 0) warnings.push("لا توجد أي رسائل عميل واردة خلال آخر 24 ساعة على القنوات الرسمية المسجلة");

    return new Response(JSON.stringify({
      summary: {
        meta_channels_count: (metaChannels || []).length,
        latest_webhook_at: latestWebhookAt,
        webhook_logs_count_7d: webhookLogs.length,
        send_logs_count_7d: sendLogs.length,
        inbound_customer_messages_24h: recentInbound.length,
      },
      meta_channels: (metaChannels || []).map((c) => ({
        id: c.id,
        org_id: c.org_id,
        label: c.label || c.business_name || null,
        display_phone: c.display_phone || null,
        phone_number_id: c.phone_number_id || null,
        is_connected: c.is_connected,
        last_webhook_at: c.last_webhook_at,
        updated_at: c.updated_at,
      })),
      recent_webhook_logs: webhookLogs,
      recent_send_logs: sendLogs,
      recent_meta_conversations: conversations,
      recent_inbound_messages: recentInbound,
      warnings,
    }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
