import { corsHeaders } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });
    }

    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: profile } = await userClient.from("profiles").select("org_id").single();
    if (!profile?.org_id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });
    }

    const orgId = profile.org_id;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Check admin role
    const { data: role } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", (await userClient.auth.getUser()).data.user?.id)
      .single();

    if (!role || (role.role !== "admin" && role.role !== "super_admin")) {
      return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: CORS });
    }

    // Fetch all org data
    const [conversations, customers, messages, campaigns, automationRules, templates] = await Promise.all([
      adminClient.from("conversations").select("*").eq("org_id", orgId).limit(1000),
      adminClient.from("customers").select("*").eq("org_id", orgId).limit(1000),
      adminClient.from("messages").select("id, conversation_id, sender, body, message_type, status, created_at")
        .limit(1000),
      adminClient.from("campaigns").select("*").eq("org_id", orgId),
      adminClient.from("automation_rules").select("*").eq("org_id", orgId),
      adminClient.from("whatsapp_templates").select("*").eq("org_id", orgId),
    ]);

    const backup = {
      version: "1.0",
      exported_at: new Date().toISOString(),
      org_id: orgId,
      data: {
        conversations: conversations.data || [],
        customers: customers.data || [],
        messages: messages.data || [],
        campaigns: campaigns.data || [],
        automation_rules: automationRules.data || [],
        templates: templates.data || [],
      },
      summary: {
        conversations_count: conversations.data?.length || 0,
        customers_count: customers.data?.length || 0,
        messages_count: messages.data?.length || 0,
        campaigns_count: campaigns.data?.length || 0,
      },
    };

    return new Response(JSON.stringify(backup, null, 2), {
      headers: {
        ...CORS,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="backup_${orgId}_${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
