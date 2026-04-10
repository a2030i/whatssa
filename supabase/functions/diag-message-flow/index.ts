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
    const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // ══════════════════════════════════════════════════
    // TEST 1: Webhook logs vs actual saved messages
    // ══════════════════════════════════════════════════
    // Get all webhook "رسالة واردة" logs in last 24h
    const { data: webhookLogs } = await db
      .from("system_logs")
      .select("created_at, message, metadata, org_id")
      .eq("function_name", "whatsapp-webhook")
      .eq("level", "info")
      .like("message", "رسالة واردة من%")
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(200);

    // Get all "مكررة" logs
    const { data: dupLogs } = await db
      .from("system_logs")
      .select("created_at, message, metadata, org_id")
      .eq("function_name", "whatsapp-webhook")
      .like("message", "%مكررة%")
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(100);

    // Get all error logs
    const { data: errorLogs } = await db
      .from("system_logs")
      .select("created_at, level, message, metadata, org_id")
      .eq("function_name", "whatsapp-webhook")
      .in("level", ["error", "critical", "warn"])
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(50);

    // ══════════════════════════════════════════════════
    // TEST 2: Per-phone analysis - find phones with webhook hits but few DB messages
    // ══════════════════════════════════════════════════
    const phoneWebhookCounts: Record<string, { count: number; wa_ids: string[]; times: string[] }> = {};
    for (const log of (webhookLogs || [])) {
      const phone = (log.message as string).replace("رسالة واردة من ", "").trim();
      const waId = (log.metadata as any)?.wa_message_id || "";
      if (!phoneWebhookCounts[phone]) {
        phoneWebhookCounts[phone] = { count: 0, wa_ids: [], times: [] };
      }
      phoneWebhookCounts[phone].count++;
      phoneWebhookCounts[phone].wa_ids.push(waId);
      phoneWebhookCounts[phone].times.push(log.created_at);
    }

    // For top active phones, check how many messages actually saved in DB
    const topPhones = Object.entries(phoneWebhookCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    const phoneAnalysis: any[] = [];
    for (const [phone, webhookData] of topPhones) {
      // Find conversations for this phone
      const { data: convs } = await db
        .from("conversations")
        .select("id, channel_id, status, customer_name, created_at, last_message_at, unread_count")
        .eq("customer_phone", phone)
        .eq("conversation_type", "private")
        .order("created_at", { ascending: false })
        .limit(5);

      let totalDbMessages = 0;
      let customerMessages = 0;
      const convDetails: any[] = [];

      for (const conv of (convs || [])) {
        const { count: totalCount } = await db
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .gte("created_at", since24h);

        const { count: custCount } = await db
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conv.id)
          .eq("sender", "customer")
          .gte("created_at", since24h);

        totalDbMessages += (totalCount || 0);
        customerMessages += (custCount || 0);

        // Get actual messages to check wa_message_ids
        const { data: msgs } = await db
          .from("messages")
          .select("id, wa_message_id, sender, content, created_at, status")
          .eq("conversation_id", conv.id)
          .eq("sender", "customer")
          .gte("created_at", since24h)
          .order("created_at", { ascending: false })
          .limit(20);

        const savedWaIds = (msgs || []).map((m: any) => m.wa_message_id).filter(Boolean);
        const missingWaIds = webhookData.wa_ids.filter(id => id && !savedWaIds.includes(id));

        convDetails.push({
          conv_id: conv.id,
          status: conv.status,
          channel_id: conv.channel_id,
          customer_name: conv.customer_name,
          db_customer_msgs_24h: custCount || 0,
          db_total_msgs_24h: totalCount || 0,
          saved_wa_ids: savedWaIds,
          missing_wa_ids: missingWaIds,
          last_message_at: conv.last_message_at,
        });
      }

      phoneAnalysis.push({
        phone,
        webhook_hits_24h: webhookData.count,
        db_customer_msgs_24h: customerMessages,
        gap: webhookData.count - customerMessages,
        conversations_count: (convs || []).length,
        conversations: convDetails,
        webhook_times: webhookData.times.slice(0, 5),
      });
    }

    // ══════════════════════════════════════════════════
    // TEST 3: Check for satisfaction_status = "pending" that might intercept messages
    // ══════════════════════════════════════════════════
    const { data: pendingSat, count: pendingSatCount } = await db
      .from("conversations")
      .select("id, customer_phone, customer_name, status, satisfaction_status", { count: "exact" })
      .eq("satisfaction_status", "pending")
      .eq("status", "closed")
      .limit(10);

    // ══════════════════════════════════════════════════
    // TEST 4: Check for active chatbot flows with trigger_type "always"
    // ══════════════════════════════════════════════════
    const { data: alwaysFlows } = await db
      .from("chatbot_flows")
      .select("id, name, trigger_type, is_active, org_id")
      .eq("is_active", true)
      .eq("trigger_type", "always");

    // ══════════════════════════════════════════════════
    // TEST 5: Check for duplicate conversations (same phone, multiple open convs)
    // ══════════════════════════════════════════════════
    const { data: recentConvs } = await db
      .from("conversations")
      .select("customer_phone, org_id, channel_id, status, id")
      .neq("status", "closed")
      .gte("created_at", since48h)
      .order("created_at", { ascending: false })
      .limit(200);

    const phoneConvMap: Record<string, any[]> = {};
    for (const c of (recentConvs || [])) {
      const key = `${c.org_id}_${c.customer_phone}_${c.channel_id || "null"}`;
      if (!phoneConvMap[key]) phoneConvMap[key] = [];
      phoneConvMap[key].push(c);
    }
    const duplicateConvs = Object.entries(phoneConvMap)
      .filter(([_, convs]) => convs.length > 1)
      .map(([key, convs]) => ({ key, count: convs.length, conv_ids: convs.map(c => c.id) }));

    // ══════════════════════════════════════════════════
    // TEST 6: Check conversation insert errors (23505 unique violation)
    // ══════════════════════════════════════════════════
    const { data: insertErrorLogs } = await db
      .from("system_logs")
      .select("created_at, message, metadata")
      .eq("function_name", "whatsapp-webhook")
      .eq("level", "error")
      .like("message", "%فشل إنشاء محادثة%")
      .gte("created_at", since48h)
      .limit(20);

    // ══════════════════════════════════════════════════
    // TEST 7: Check message save errors
    // ══════════════════════════════════════════════════
    const { data: msgSaveErrors } = await db
      .from("system_logs")
      .select("created_at, message, metadata")
      .eq("function_name", "whatsapp-webhook")
      .eq("level", "error")
      .like("message", "%فشل حفظ الرسالة%")
      .gte("created_at", since48h)
      .limit(20);

    // ══════════════════════════════════════════════════
    // TEST 8: Check critical/unexpected errors
    // ══════════════════════════════════════════════════
    const { data: criticalErrors } = await db
      .from("system_logs")
      .select("created_at, message, metadata")
      .eq("function_name", "whatsapp-webhook")
      .eq("level", "critical")
      .gte("created_at", since48h)
      .limit(10);

    // ══════════════════════════════════════════════════
    // SUMMARY
    // ══════════════════════════════════════════════════
    const totalWebhookHits = (webhookLogs || []).length;
    const totalDuplicatesSkipped = (dupLogs || []).length;
    const phonesWithGap = phoneAnalysis.filter(p => p.gap > 0);

    const diagnosis: string[] = [];

    if (phonesWithGap.length > 0) {
      diagnosis.push(`🔴 ${phonesWithGap.length} أرقام لديها فجوة: الويب هوك استقبل رسائل أكثر مما تم حفظه في القاعدة`);
      for (const p of phonesWithGap) {
        diagnosis.push(`   → ${p.phone}: webhook=${p.webhook_hits_24h}, DB=${p.db_customer_msgs_24h}, فقد=${p.gap} رسالة`);
      }
    } else if (totalWebhookHits > 0) {
      diagnosis.push("✅ لا توجد فجوة واضحة: كل الرسائل المسجلة في الويب هوك موجودة في القاعدة");
    }

    if (totalDuplicatesSkipped > 0) {
      diagnosis.push(`⚠️ ${totalDuplicatesSkipped} رسالة تم تجاهلها كـ "مكررة" خلال 24 ساعة`);
    }

    if ((pendingSatCount || 0) > 0) {
      diagnosis.push(`⚠️ ${pendingSatCount} محادثة مغلقة بحالة satisfaction_status="pending" - قد تعترض رسائل العملاء التي تحتوي أرقام 1-5`);
    }

    if ((alwaysFlows || []).length > 0) {
      diagnosis.push(`⚠️ يوجد ${alwaysFlows!.length} تدفق شات بوت بنوع "always" - يعترض كل رسالة واردة`);
    }

    if (duplicateConvs.length > 0) {
      diagnosis.push(`⚠️ ${duplicateConvs.length} حالة محادثات مكررة (نفس الرقم + القناة بأكثر من محادثة مفتوحة)`);
    }

    if ((insertErrorLogs || []).length > 0) {
      diagnosis.push(`🔴 ${insertErrorLogs!.length} خطأ في إنشاء محادثات جديدة`);
    }

    if ((msgSaveErrors || []).length > 0) {
      diagnosis.push(`🔴 ${msgSaveErrors!.length} خطأ في حفظ رسائل واردة`);
    }

    if ((criticalErrors || []).length > 0) {
      diagnosis.push(`🔴 ${criticalErrors!.length} خطأ حرج (crash) في الويب هوك`);
    }

    if ((errorLogs || []).length > 0) {
      diagnosis.push(`⚠️ ${errorLogs!.length} تحذير/خطأ في الويب هوك خلال 24 ساعة`);
    }

    return new Response(JSON.stringify({
      diagnosis,
      summary: {
        total_webhook_hits_24h: totalWebhookHits,
        total_duplicates_skipped: totalDuplicatesSkipped,
        phones_with_gap: phonesWithGap.length,
        pending_satisfaction_convs: pendingSatCount || 0,
        always_chatbot_flows: (alwaysFlows || []).length,
        duplicate_conversations: duplicateConvs.length,
        conv_insert_errors: (insertErrorLogs || []).length,
        msg_save_errors: (msgSaveErrors || []).length,
        critical_errors: (criticalErrors || []).length,
      },
      per_phone_analysis: phoneAnalysis,
      duplicate_conversations: duplicateConvs,
      pending_satisfaction: pendingSat,
      always_chatbot_flows: alwaysFlows,
      error_logs: (errorLogs || []).slice(0, 15),
      duplicate_logs: (dupLogs || []).slice(0, 10),
      conv_insert_errors: insertErrorLogs,
      msg_save_errors: msgSaveErrors,
      critical_errors: criticalErrors,
    }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? (error as Error).message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
