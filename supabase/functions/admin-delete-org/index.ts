import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is super_admin
    const authHeader = req.headers.get("authorization") || "";
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", caller.id).eq("role", "super_admin").maybeSingle();
    if (!roleData) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });

    const { org_id } = await req.json();
    if (!org_id) return new Response(JSON.stringify({ error: "org_id required" }), { status: 400, headers: corsHeaders });

    // Get all users in this org
    const { data: members } = await adminClient.from("profiles").select("id").eq("org_id", org_id);

    // Delete each user from auth (cascade will handle profiles, user_roles)
    for (const member of (members || [])) {
      await adminClient.auth.admin.deleteUser(member.id);
    }

    // Delete org-related data
    await adminClient.from("conversations").delete().eq("org_id", org_id);
    await adminClient.from("customers").delete().eq("org_id", org_id);
    await adminClient.from("campaigns").delete().eq("org_id", org_id);
    await adminClient.from("automation_rules").delete().eq("org_id", org_id);
    await adminClient.from("whatsapp_config").delete().eq("org_id", org_id);
    await adminClient.from("usage_tracking").delete().eq("org_id", org_id);
    
    // Delete wallet transactions then wallet
    const { data: wallet } = await adminClient.from("wallets").select("id").eq("org_id", org_id).maybeSingle();
    if (wallet) {
      await adminClient.from("wallet_transactions").delete().eq("wallet_id", wallet.id);
      await adminClient.from("wallets").delete().eq("org_id", org_id);
    }

    // Finally delete the org
    await adminClient.from("organizations").delete().eq("id", org_id);

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
