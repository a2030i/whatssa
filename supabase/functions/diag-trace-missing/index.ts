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
    // Missing wa_message_ids from the previous diagnostic
    const missingIds = [
      "wamid.HBgMOTY2NTUyMjY2MDM4FQIAEhgUM0FCMERGMUFEOTNENTBDOEJGMjMA",
      "wamid.HBgMOTY2NTUyMjY2MDM4FQIAEhgUM0ExMTJCREFDRjM3NzA2NEI2NTQA",
      "wamid.HBgMOTY2NTUyMjY2MDM4FQIAEhgUM0E0QzRBQUYwNjY5QTdCN0EwNkYA",
      "wamid.HBgMOTY2NTUyMjY2MDM4FQIAEhgUM0FDM0Y0MjIyQzQyQUUxQkVCQjgA",
      "wamid.HBgMOTY2NTUyMjY2MDM4FQIAEhgUM0FCNzA4RTQyMjk1MkE4MDZBRkEA",
      "wamid.HBgMOTY2NTQwOTYwMjUyFQIAEhgUM0FGOTM0QUM1OTI0MEE1ODEwREIA",
      "wamid.HBgMOTY2NTAzMDI0NjY4FQIAEhgUM0FFRjlERjIzQTVBQkVGQzM5RUEA",
      "wamid.HBgMOTY2NTAzMDI0NjY4FQIAEhgUM0EwRUY2MjI5OUM3NEYyREJFRjkA",
    ];

    // TEST 1: Search for these wa_message_ids in messages table (any conversation)
    const { data: foundMsgs } = await db
      .from("messages")
      .select("id, conversation_id, wa_message_id, sender, content, created_at, status")
      .in("wa_message_id", missingIds);

    // TEST 2: Get ALL conversations for phone 966552266038 (including closed, all channels)
    const { data: allConvs552 } = await db
      .from("conversations")
      .select("id, channel_id, status, customer_phone, customer_name, created_at, updated_at, last_message_at, conversation_type, org_id")
      .eq("customer_phone", "966552266038")
      .order("created_at", { ascending: false });

    // TEST 3: Also check with different phone formats
    const { data: altConvs552 } = await db
      .from("conversations")
      .select("id, customer_phone, status, created_at, channel_id")
      .or("customer_phone.eq.+966552266038,customer_phone.eq.966552266038,customer_phone.like.%552266038")
      .order("created_at", { ascending: false })
      .limit(20);

    // TEST 4: Get ALL customer messages in the main conversation (no time filter)
    const mainConvId = "93447077-2702-4eaf-b264-d7319d1b6edf";
    const { data: allMsgsInConv, count: totalMsgCount } = await db
      .from("messages")
      .select("id, wa_message_id, sender, content, created_at, status, message_type", { count: "exact" })
      .eq("conversation_id", mainConvId)
      .order("created_at", { ascending: false })
      .limit(50);

    // TEST 5: Check if there's another conversation that got the messages
    const otherConvId = "e269444e-3342-46a5-ae97-8d50326f4d0f"; // from webhook log
    const { data: otherConvMsgs } = await db
      .from("messages")
      .select("id, wa_message_id, sender, content, created_at")
      .eq("conversation_id", otherConvId)
      .order("created_at", { ascending: false })
      .limit(30);

    // TEST 6: Check findPrivateConversation logic - 
    // Is there any conversation with status != 'closed' for this phone+channel?
    const channelId = "0fbd9d5b-059d-482c-9e4a-e9be5c5717b9";
    const orgId = "92efa9a4-8334-4704-9093-822af6fc1995";
    
    const { data: openConvQuery, error: openConvErr } = await db
      .from("conversations")
      .select("id, status, customer_phone, channel_id, conversation_type, updated_at")
      .eq("org_id", orgId)
      .eq("conversation_type", "private")
      .eq("customer_phone", "966552266038")
      .eq("channel_id", channelId)
      .neq("status", "closed")
      .order("updated_at", { ascending: false });

    // TEST 7: Check system_logs for any errors related to this phone
    const { data: phoneLogs } = await db
      .from("system_logs")
      .select("created_at, level, message, metadata")
      .eq("function_name", "whatsapp-webhook")
      .or("message.like.%966552266038%,metadata->>wa_message_id.in.(wamid.HBgMOTY2NTUyMjY2MDM4FQIAEhgUM0FCMERGMUFEOTNENTBDOEJGMjMA)")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(50);

    // TEST 8: Check if the webhook is processing these as "status updates" instead of messages
    // by looking at the raw system_logs timing
    const { data: allWebhookLogs } = await db
      .from("system_logs")
      .select("created_at, level, message, metadata")
      .eq("function_name", "whatsapp-webhook")
      .gte("created_at", "2026-04-08T13:44:00+00:00")
      .lte("created_at", "2026-04-08T13:47:00+00:00")
      .order("created_at", { ascending: true })
      .limit(100);

    return new Response(JSON.stringify({
      test1_missing_wa_ids_in_db: {
        searched: missingIds.length,
        found: (foundMsgs || []).length,
        messages: foundMsgs,
      },
      test2_all_conversations_for_phone: allConvs552,
      test3_alt_format_conversations: altConvs552,
      test4_all_messages_in_main_conv: {
        total_count: totalMsgCount,
        messages: allMsgsInConv,
      },
      test5_other_conv_messages: otherConvMsgs,
      test6_find_private_conv_result: {
        data: openConvQuery,
        error: openConvErr?.message || null,
      },
      test7_phone_specific_logs: phoneLogs,
      test8_detailed_timeline: allWebhookLogs,
    }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
