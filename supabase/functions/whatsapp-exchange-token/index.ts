import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function resolveMetaCredentials() {
  const fallbackAppId = Deno.env.get("META_APP_ID") || "1306128431426603";
  const fallbackSecret = Deno.env.get("META_APP_SECRET") || "";
  const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) return { appId: fallbackAppId, appSecret: fallbackSecret };

  try {
    const admin = createClient(supabaseUrl, serviceKey);
    const { data } = await admin
      .from("system_settings")
      .select("key, value")
      .in("key", ["meta_app_id", "meta_app_secret"]);

    let appId = fallbackAppId;
    let appSecret = fallbackSecret;
    (data || []).forEach((row: any) => {
      if (row.key === "meta_app_id" && row.value) appId = String(row.value);
      if (row.key === "meta_app_secret" && row.value) appSecret = String(row.value);
    });
    return { appId, appSecret };
  } catch {
    return { appId: fallbackAppId, appSecret: fallbackSecret };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { code, access_token: directToken, redirect_uri: redirectUri } = body;

    const { appId, appSecret } = await resolveMetaCredentials();

    if (!appSecret) {
      return new Response(
        JSON.stringify({ error: "META_APP_SECRET not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken = directToken;

    // If code provided, exchange it for a token
    if (code) {
      const tokenUrl = `https://graph.facebook.com/v22.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}${redirectUri ? `&redirect_uri=${encodeURIComponent(redirectUri)}` : ""}`;
      const tokenRes = await fetch(tokenUrl);
      const tokenData = await tokenRes.json();

      if (tokenData.error) {
        console.error("Token exchange error:", tokenData.error);
        return new Response(
          JSON.stringify({ error: tokenData.error.message || "Failed to exchange token" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const shortLivedToken = tokenData.access_token;

      // Exchange for long-lived token
      const longTokenUrl = `https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
      const longTokenRes = await fetch(longTokenUrl);
      const longTokenData = await longTokenRes.json();

      accessToken = longTokenData.access_token || shortLivedToken;
    }

    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "code or access_token is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get WhatsApp Business Account info using the token
    const debugRes = await fetch(
      `https://graph.facebook.com/v22.0/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`
    );
    const debugData = await debugRes.json();

    // Get shared WhatsApp Business Account IDs from the token debug info
    const granularScopes = debugData.data?.granular_scopes || [];
    const waScope = granularScopes.find(
      (s: any) => s.scope === "whatsapp_business_management"
    );
    const wabaIds = waScope?.target_ids || [];

    if (wabaIds.length === 0) {
      const businessRes = await fetch(
        `https://graph.facebook.com/v22.0/me/businesses?access_token=${accessToken}`
      );
      const businessData = await businessRes.json();

      return new Response(
        JSON.stringify({
          access_token: accessToken,
          waba_ids: [],
          businesses: businessData.data || [],
          message: "Token obtained but no WABA found.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For each WABA, get phone numbers
    const results = [];
    for (const wabaId of wabaIds) {
      const phonesRes = await fetch(
        `https://graph.facebook.com/v22.0/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const phonesData = await phonesRes.json();

      results.push({
        waba_id: wabaId,
        phone_numbers: phonesData.data || [],
      });
    }

    return new Response(
      JSON.stringify({
        access_token: accessToken,
        waba_ids: wabaIds,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
