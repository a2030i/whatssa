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

  let reqBody: any = {};
  try { reqBody = await req.json(); } catch (_) {}

  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const phone = reqBody?.phone ? String(reqBody.phone) : "";

    // 1. Get ALL system_logs for this phone in 24h
    const { data: allLogs } = await db
      .from("system_logs")
      .select("created_at, level, message, metadata, function_name")
      .or(`message.like.%${phone}%,metadata->>wa_message_id.not.is.null`)
      .eq("function_name", "whatsapp-webhook")
      .gte("created_at", since24h)
      .order("created_at", { ascending: true })
      .limit(200);

    // 2. Get ALL messages in conversation for this phone
    const { data: convs } = await db
      .from("conversations")
      .select("id, status, customer_phone, channel_id")
      .eq("customer_phone", phone)
      .eq("conversation_type", "private");

    let allMessages: any[] = [];
    for (const conv of (convs || [])) {
      const { data: msgs } = await db
        .from("messages")
        .select("id, wa_message_id, sender, content, created_at, status, message_type")
        .eq("conversation_id", conv.id)
        .gte("created_at", since24h)
        .order("created_at", { ascending: true });
      allMessages.push(...(msgs || []).map(m => ({ ...m, conversation_id: conv.id })));
    }

    // 3. Check if there's a chatbot session active
    const convIds = (convs || []).map(c => c.id);
    let chatbotSessions: any[] = [];
    if (convIds.length > 0) {
      const { data: sessions } = await db
        .from("chatbot_sessions")
        .select("id, flow_id, is_active, conversation_id, current_node_id")
        .in("conversation_id", convIds);
      chatbotSessions = sessions || [];
    }

    // 4. Check active chatbot flows for this org
    // First get org_id from conversation
    const orgId = convs?.[0] ? (await db.from("conversations").select("org_id").eq("id", convs[0].id).single()).data?.org_id : null;
    
    let activeFlows: any[] = [];
    if (orgId) {
      const { data: flows } = await db
        .from("chatbot_flows")
        .select("id, name, trigger_type, is_active, trigger_keywords")
        .eq("org_id", orgId)
        .eq("is_active", true);
      activeFlows = flows || [];
    }

    // 5. Check satisfaction_status on conversations
    let satConvs: any[] = [];
    if (orgId) {
      const { data: sConvs } = await db
        .from("conversations")
        .select("id, customer_phone, satisfaction_status, status")
        .eq("org_id", orgId)
        .eq("satisfaction_status", "pending")
        .limit(10);
      satConvs = sConvs || [];
    }

    // 6. Check automation_rules
    let automationRules: any[] = [];
    if (orgId) {
      const { data: rules } = await db
        .from("automation_rules")
        .select("id, name, keywords, action_type, enabled")
        .eq("org_id", orgId)
        .eq("enabled", true);
      automationRules = rules || [];
    }

    // 7. Get all webhook log wa_message_ids for this phone
    const webhookWaIds: string[] = [];
    const { data: wLogs } = await db
      .from("system_logs")
      .select("metadata")
      .eq("function_name", "whatsapp-webhook")
      .eq("level", "info")
      .like("message", `رسالة واردة من ${phone}`)
      .gte("created_at", since24h);
    for (const l of (wLogs || [])) {
      const wid = (l.metadata as any)?.wa_message_id;
      if (wid) webhookWaIds.push(wid);
    }

    // Get saved wa_message_ids
    const savedWaIds = allMessages.filter(m => m.wa_message_id).map(m => m.wa_message_id);
    const missingWaIds = webhookWaIds.filter(id => !savedWaIds.includes(id));

    // 8. For missing wa_ids, check if there's ANY log mentioning them
    const missingTraces: any[] = [];
    for (const waId of missingWaIds.slice(0, 5)) {
      const { data: traces } = await db
        .from("system_logs")
        .select("created_at, level, message, metadata")
        .like("metadata", `%${waId}%`)
        .gte("created_at", since24h)
        .limit(5);
      missingTraces.push({ wa_id: waId, traces: traces || [] });
    }

    return new Response(JSON.stringify({
      phone,
      conversations: convs,
      messages_in_db: allMessages.length,
      messages_detail: allMessages,
      chatbot_sessions: chatbotSessions,
      active_chatbot_flows: activeFlows,
      pending_satisfaction_convs: satConvs,
      automation_rules: automationRules,
      webhook_wa_ids_count: webhookWaIds.length,
      saved_wa_ids_count: savedWaIds.length,
      missing_wa_ids: missingWaIds,
      missing_traces: missingTraces,
      all_logs_for_phone: (allLogs || []).slice(0, 30),
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
