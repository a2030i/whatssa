import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const externalUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const externalServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is authenticated
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");

    // Admin client for external DB (where auth + data live)
    const adminClient = createClient(externalUrl, externalServiceKey);

    // Verify token against external project (where the user is authenticated)
    const { data: { user: caller }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !caller) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }

    // Check super_admin role
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) return jsonRes({ error: "Forbidden" }, 403);

    const { org_id } = await req.json();
    if (!org_id) return jsonRes({ error: "org_id required" }, 400);

    console.log(`[admin-delete-org] Deleting org ${org_id}`);

    // Get all users in this org
    const { data: members } = await adminClient.from("profiles").select("id").eq("org_id", org_id);

    // Delete messages (via conversations)
    const { data: convos } = await adminClient.from("conversations").select("id").eq("org_id", org_id);
    const convoIds = (convos || []).map((c: any) => c.id);
    if (convoIds.length > 0) {
      await adminClient.from("messages").delete().in("conversation_id", convoIds);
    }

    // Delete campaign recipients (via campaigns)
    const { data: camps } = await adminClient.from("campaigns").select("id").eq("org_id", org_id);
    const campIds = (camps || []).map((c: any) => c.id);
    if (campIds.length > 0) {
      await adminClient.from("campaign_recipients").delete().in("campaign_id", campIds);
    }

    // Delete order items (via orders)
    const { data: ords } = await adminClient.from("orders").select("id").eq("org_id", org_id);
    const ordIds = (ords || []).map((o: any) => o.id);
    if (ordIds.length > 0) {
      await adminClient.from("order_items").delete().in("order_id", ordIds);
    }

    // Delete org-related data
    await adminClient.from("internal_notes").delete().eq("org_id", org_id);
    await adminClient.from("chatbot_sessions").delete().eq("org_id", org_id);
    await adminClient.from("bot_analytics").delete().eq("org_id", org_id);
    await adminClient.from("automation_logs").delete().eq("org_id", org_id);
    await adminClient.from("conversations").delete().eq("org_id", org_id);
    await adminClient.from("customers").delete().eq("org_id", org_id);
    await adminClient.from("campaigns").delete().eq("org_id", org_id);
    await adminClient.from("orders").delete().eq("org_id", org_id);
    await adminClient.from("products").delete().eq("org_id", org_id);
    await adminClient.from("abandoned_carts").delete().eq("org_id", org_id);
    await adminClient.from("automation_rules").delete().eq("org_id", org_id);
    await adminClient.from("chatbot_flows").delete().eq("org_id", org_id);
    await adminClient.from("closure_reasons").delete().eq("org_id", org_id);
    await adminClient.from("customer_tag_definitions").delete().eq("org_id", org_id);
    await adminClient.from("custom_inboxes").delete().eq("org_id", org_id);
    await adminClient.from("blacklisted_numbers").delete().eq("org_id", org_id);
    await adminClient.from("api_tokens").delete().eq("org_id", org_id);
    await adminClient.from("api_request_logs").delete().eq("org_id", org_id);
    await adminClient.from("org_webhooks").delete().eq("org_id", org_id);
    await adminClient.from("ai_provider_configs").delete().eq("org_id", org_id);
    await adminClient.from("notifications").delete().eq("org_id", org_id);
    await adminClient.from("message_retry_queue").delete().eq("org_id", org_id);
    await adminClient.from("activity_logs").delete().eq("org_id", org_id);
    await adminClient.from("payments").delete().eq("org_id", org_id);
    await adminClient.from("teams").delete().eq("org_id", org_id);
    await adminClient.from("whatsapp_config").delete().eq("org_id", org_id);
    await adminClient.from("usage_tracking").delete().eq("org_id", org_id);
    await adminClient.from("coupon_redemptions").delete().eq("org_id", org_id);

    // Delete wallet transactions then wallet
    const { data: wallet } = await adminClient.from("wallets").select("id").eq("org_id", org_id).maybeSingle();
    if (wallet) {
      await adminClient.from("wallet_transactions").delete().eq("wallet_id", wallet.id);
      await adminClient.from("wallets").delete().eq("org_id", org_id);
    }

    // Delete each user from auth (cascade handles profiles, user_roles)
    // Some users may already be deleted from auth — skip errors gracefully
    for (const member of (members || [])) {
      try {
        const { error: authDelErr } = await adminClient.auth.admin.deleteUser(member.id);
        if (authDelErr) {
          console.warn(`[admin-delete-org] Auth delete skipped for ${member.id}: ${authDelErr.message}`);
        }
      } catch (authErr: any) {
        console.warn(`[admin-delete-org] Auth delete skipped for ${member.id}: ${authErr.message}`);
      }
      // Clean up profiles and roles manually in case cascade didn't run
      await adminClient.from("user_roles").delete().eq("user_id", member.id);
      await adminClient.from("profiles").delete().eq("id", member.id);
    }

    // Finally delete the org
    const { error: delErr } = await adminClient.from("organizations").delete().eq("id", org_id);
    if (delErr) {
      console.error(`[admin-delete-org] Failed to delete org: ${delErr.message}`);
      return jsonRes({ error: delErr.message }, 500);
    }

    console.log(`[admin-delete-org] Successfully deleted org ${org_id}`);
    return jsonRes({ success: true });
  } catch (e: any) {
    console.error(`[admin-delete-org] Error: ${e.message}`);
    return jsonRes({ error: e.message }, 500);
  }
});
