import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      code,
      access_token: directToken,
      redirect_uri: redirectUri,
      // From Embedded Signup sessionInfoListener
      waba_id: sessionWabaId,
      phone_number_id: sessionPhoneId,
      // For saving config
      org_id,
      // Whether to auto-register phone & subscribe webhook
      auto_register = true,
    } = body;

    const appId = "1276045851157317";
    const appSecret = Deno.env.get("META_APP_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!appSecret) {
      return error("META_APP_SECRET not configured", 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Step 1: Obtain access token ──
    let accessToken = directToken;

    if (code) {
      // Exchange authorization code → short-lived → long-lived token
      const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}${redirectUri ? `&redirect_uri=${encodeURIComponent(redirectUri)}` : ""}`;
      const tokenRes = await fetch(tokenUrl);
      const tokenData = await tokenRes.json();

      if (tokenData.error) {
        console.error("Token exchange error:", tokenData.error);
        return error(tokenData.error.message || "Failed to exchange token", 400);
      }

      const shortLived = tokenData.access_token;

      // Exchange for long-lived token
      const longUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLived}`;
      const longRes = await fetch(longUrl);
      const longData = await longRes.json();
      accessToken = longData.access_token || shortLived;
    }

    if (!accessToken) {
      return error("code or access_token is required", 400);
    }

    // ── Step 2: Resolve WABA ID & phone numbers ──
    let wabaIds: string[] = sessionWabaId ? [sessionWabaId] : [];
    let resolvedPhones: any[] = [];

    if (wabaIds.length === 0) {
      // Discover WABAs from token debug info
      const debugRes = await fetch(
        `https://graph.facebook.com/v21.0/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`
      );
      const debugData = await debugRes.json();
      const granularScopes = debugData.data?.granular_scopes || [];
      const waScope = granularScopes.find((s: any) => s.scope === "whatsapp_business_management");
      wabaIds = waScope?.target_ids || [];
    }

    // Fetch phone numbers for each WABA
    const results = [];
    for (const wabaId of wabaIds) {
      const phonesRes = await fetch(
        `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const phonesData = await phonesRes.json();
      const phones = phonesData.data || [];
      results.push({ waba_id: wabaId, phone_numbers: phones });
      resolvedPhones.push(...phones.map((p: any) => ({ ...p, waba_id: wabaId })));
    }

    // If Embedded Signup gave us a specific phone_number_id, auto-select it
    let selectedPhone = sessionPhoneId
      ? resolvedPhones.find((p: any) => p.id === sessionPhoneId)
      : null;

    // ── Step 3: If phone selected and org provided, save config ──
    let savedConfig = null;
    if (selectedPhone && org_id) {
      const wabaId = selectedPhone.waba_id;
      const phoneId = selectedPhone.id;
      const displayPhone = selectedPhone.display_phone_number || "";
      const businessName = selectedPhone.verified_name || "";

      // Upsert whatsapp_config for this org
      const { data: existingConfig } = await supabase
        .from("whatsapp_config")
        .select("id, webhook_verify_token")
        .eq("org_id", org_id)
        .maybeSingle();

      if (existingConfig) {
        await supabase.from("whatsapp_config").update({
          phone_number_id: phoneId,
          business_account_id: wabaId,
          access_token: accessToken,
          display_phone: displayPhone,
          business_name: businessName,
          is_connected: true,
        }).eq("id", existingConfig.id);
        savedConfig = { ...existingConfig, phone_number_id: phoneId, display_phone: displayPhone };
      } else {
        const { data: newConfig } = await supabase.from("whatsapp_config").insert({
          org_id,
          phone_number_id: phoneId,
          business_account_id: wabaId,
          access_token: accessToken,
          display_phone: displayPhone,
          business_name: businessName,
          is_connected: true,
        }).select().single();
        savedConfig = newConfig;
      }

      // ── Step 4: Register phone number (if new from Embedded Signup) ──
      if (auto_register) {
        try {
          const registerRes = await fetch(
            `https://graph.facebook.com/v21.0/${phoneId}/register`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                pin: "123456", // Default 2FA pin for Cloud API
              }),
            }
          );
          const registerData = await registerRes.json();
          console.log("Phone registration result:", registerData);
        } catch (regError) {
          console.error("Phone registration error (non-fatal):", regError);
        }
      }

      // ── Step 5: Subscribe app to WABA webhooks ──
      try {
        const subscribeRes = await fetch(
          `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );
        const subscribeData = await subscribeRes.json();
        console.log("Webhook subscription result:", subscribeData);
      } catch (subError) {
        console.error("Webhook subscription error (non-fatal):", subError);
      }
    }

    return new Response(
      JSON.stringify({
        access_token: accessToken,
        waba_ids: wabaIds,
        results,
        selected_phone: selectedPhone || null,
        saved_config: savedConfig,
        auto_registered: !!(selectedPhone && org_id && auto_register),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return error("Internal error", 500);
  }
});

function error(msg: string, status: number) {
  return new Response(
    JSON.stringify({ error: msg }),
    { status, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" } }
  );
}
