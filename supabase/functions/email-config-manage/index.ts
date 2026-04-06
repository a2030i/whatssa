import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getExternalClient() {
  const url = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
  const key = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

async function getCallerOrgId(authHeader: string | null) {
  if (!authHeader) {
    console.error("[email-config-manage] No auth header provided");
    return null;
  }

  // Use a user-scoped client with the external anon key + user's JWT
  // RLS on profiles table validates the JWT automatically
  const url = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
  const anonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!;
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // Query profiles via RLS — this validates the JWT against the DB
  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("org_id")
    .limit(1)
    .maybeSingle();

  if (profileError) {
    console.error("[email-config-manage] Profile query error:", profileError.message, profileError.code);
    return null;
  }
  if (!profile?.org_id) {
    console.error("[email-config-manage] No profile/org_id found");
    return null;
  }

  console.log("[email-config-manage] Resolved org_id:", profile.org_id);
  return profile.org_id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const orgId = await getCallerOrgId(authHeader);
    if (!orgId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = getExternalClient();
    const rawBody = await req.json();
    const { action, ...body } = rawBody;
    console.log("[email-config-manage] action:", action, "orgId:", orgId);

    // LIST
    if (action === "list") {
      const { data, error } = await admin
        .from("email_configs")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CREATE
    if (action === "create") {
      console.log("[email-config-manage] creating with payload:", JSON.stringify(body.payload));
      const { data, error } = await admin
        .from("email_configs")
        .insert({ ...body.payload, org_id: orgId })
        .select();
      console.log("[email-config-manage] create result:", JSON.stringify({ data, error }));
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // UPDATE
    if (action === "update") {
      const { error } = await admin
        .from("email_configs")
        .update(body.payload)
        .eq("id", body.id)
        .eq("org_id", orgId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE
    if (action === "delete") {
      const { error } = await admin
        .from("email_configs")
        .delete()
        .eq("id", body.id)
        .eq("org_id", orgId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[email-config-manage] ERROR:", e.message, e.details || "", e.hint || "");
    return new Response(JSON.stringify({ error: e.message, details: e.details, hint: e.hint }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
