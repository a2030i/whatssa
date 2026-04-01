import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";

const LAMHA_API_BASE = "https://app.lamha.sa/api/v2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { org_id } = body;

  if (!org_id) {
    return new Response(JSON.stringify({ error: "org_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Get Lamha integration config
    const { data: integration } = await supabase
      .from("store_integrations")
      .select("*")
      .eq("org_id", org_id)
      .eq("platform", "lamha")
      .eq("is_active", true)
      .maybeSingle();

    if (!integration) {
      return new Response(JSON.stringify({ error: "Lamha integration not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiToken = integration.metadata?.api_token;
    if (!apiToken) {
      return new Response(JSON.stringify({ error: "Lamha API token not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch carriers from Lamha API
    const res = await fetch(`${LAMHA_API_BASE}/carriers`, {
      method: "GET",
      headers: {
        "X-LAMHA-TOKEN": apiToken,
        "Accept": "application/json",
      },
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      return new Response(JSON.stringify({ error: "Failed to fetch carriers", details: data }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      carriers: data.data || [],
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[lamha-carriers] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
