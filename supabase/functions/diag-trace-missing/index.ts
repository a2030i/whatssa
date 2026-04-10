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

  let body: any = {};
  try { body = await req.json(); } catch (_) {}

  const { phone, org_id, channel_id, conv_id, wa_message_ids = [], since_minutes = 60 } = body;

  if (!phone) {
    return new Response(JSON.stringify({ error: "phone مطلوب في request body" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const since = new Date(Date.now() - since_minutes * 60 * 1000).toISOString();

    // TEST 1: Search for wa_message_ids in messages table
    const foundMsgs = wa_message_ids.length > 0
      ? (await db.from("messages").select("id, conversation_id, wa_message_id, sender, content, created_at, status").in("wa_message_id", wa_message_ids)).data
      : null;

    // TEST 2: All conversations for this phone
    const { data: allConvs } = await db
      .from("conversations")
      .select("id, channel_id, status, customer_phone, customer_name, created_at, updated_at, last_message_at, conversation_type, org_id")
      .eq("customer_phone", phone)
      .order("created_at", { ascending: false })
      .limit(20);

    // TEST 3: Messages in a specific conversation
    const convMsgs = conv_id
      ? (await db.from("messages")
          .select("id, wa_message_id, sender, content, created_at, status, message_type", { count: "exact" })
          .eq("conversation_id", conv_id)
          .order("created_at", { ascending: false })
          .limit(50)).data
      : null;

    // TEST 4: Open conversations for phone + channel
    const openConvQuery = (org_id && channel_id)
      ? await db.from("conversations")
          .select("id, status, customer_phone, channel_id, conversation_type, updated_at")
          .eq("org_id", org_id)
          .eq("conversation_type", "private")
          .eq("customer_phone", phone)
          .eq("channel_id", channel_id)
          .neq("status", "closed")
          .order("updated_at", { ascending: false })
      : null;

    // TEST 5: System logs for this phone in the time window
    const { data: phoneLogs } = await db
      .from("system_logs")
      .select("created_at, level, message, metadata")
      .eq("function_name", "whatsapp-webhook")
      .like("message", `%${phone}%`)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50);

    return new Response(JSON.stringify({
      params: { phone, org_id: org_id || null, channel_id: channel_id || null, conv_id: conv_id || null, wa_message_ids_count: wa_message_ids.length, since_minutes },
      test1_wa_ids_in_db: foundMsgs !== null ? { searched: wa_message_ids.length, found: foundMsgs?.length, messages: foundMsgs } : "skipped — no wa_message_ids provided",
      test2_all_conversations: allConvs,
      test3_conv_messages: convMsgs !== null ? convMsgs : "skipped — no conv_id provided",
      test4_open_conv: openConvQuery !== null ? { data: openConvQuery.data, error: openConvQuery.error?.message } : "skipped — org_id or channel_id missing",
      test5_phone_logs: phoneLogs,
    }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? (error as Error).message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
