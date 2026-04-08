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
    const phone = "966552266038";
    const orgId = "a7dff01c-cfb3-46c5-a422-c82a19e02fee"; // from earlier logs

    // Test 1: Exact same query as findPrivateConversation
    const { data: test1, error: err1 } = await db
      .from("conversations")
      .select("id, unread_count, status, dedicated_agent_id, dedicated_agent_name, customer_phone, channel_id, conversation_type, org_id")
      .eq("org_id", orgId)
      .eq("conversation_type", "private")
      .eq("customer_phone", phone)
      .neq("status", "closed")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Test 2: Without channel_id filter
    const { data: test2, error: err2 } = await db
      .from("conversations")
      .select("id, status, customer_phone, channel_id, conversation_type, org_id")
      .eq("org_id", orgId)
      .eq("conversation_type", "private")
      .eq("customer_phone", phone)
      .neq("status", "closed")
      .limit(5);

    // Test 3: With channel_id filter (like webhook does)
    const channelId = "0fbd9d5b-059d-482c-9e4a-e9be5c5717b9";
    const { data: test3, error: err3 } = await db
      .from("conversations")
      .select("id, status, customer_phone, channel_id")
      .eq("org_id", orgId)
      .eq("conversation_type", "private")
      .eq("customer_phone", phone)
      .eq("channel_id", channelId)
      .neq("status", "closed")
      .limit(5);

    // Test 4: All conversations for this phone (no filters)
    const { data: test4, error: err4 } = await db
      .from("conversations")
      .select("id, status, customer_phone, channel_id, conversation_type, org_id, created_at")
      .eq("customer_phone", phone)
      .limit(20);

    // Test 5: Check what org_id the webhook uses
    const { data: configs } = await db
      .from("whatsapp_config")
      .select("id, org_id, phone_number_id, is_connected, channel_type")
      .eq("is_connected", true)
      .eq("channel_type", "meta_api");

    // Test 6: Check if conversation exists in LOCAL DB (Lovable Cloud)
    const localDb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: localConvs, error: localErr } = await localDb
      .from("conversations")
      .select("id, status, customer_phone, channel_id, org_id")
      .eq("customer_phone", phone)
      .limit(10);

    // Test 7: Check if conversation 93447077 exists in external with DIFFERENT phone format
    const { data: conv93 } = await db
      .from("conversations")
      .select("id, status, customer_phone, channel_id, conversation_type, org_id")
      .eq("id", "93447077-2702-4eaf-b264-d7319d1b6edf");

    return new Response(JSON.stringify({
      test1_exact_query: { data: test1, error: err1?.message },
      test2_no_channel: { data: test2, error: err2?.message },
      test3_with_channel: { data: test3, error: err3?.message },
      test4_all_convs: { data: test4, error: err4?.message },
      test5_configs: configs,
      test6_local_convs: { data: localConvs, error: localErr?.message },
      test7_conv_detail: conv93,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message, stack: (e as Error).stack }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
