import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function error(msg: string, status: number) {
  return new Response(
    JSON.stringify({ error: msg }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

function log(step: string, detail: unknown) {
  console.log(`[whatsapp-complete-signup] [${step}]`, JSON.stringify(detail));
}

/** Check if the phone number is already registered by requesting its status */
async function checkPhoneStatus(phoneId: string, accessToken: string): Promise<{ registered: boolean; status?: string; error?: string }> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneId}?fields=id,display_phone_number,verified_name,code_verification_status,account_mode,status,health_status`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    log("check_phone_status", { status: res.status, data });

    if (!res.ok) {
      return { registered: false, error: data?.error?.message };
    }

    // Use the actual 'status' field from Meta — CONNECTED means registered, PENDING means not
    const phoneStatus = data.status || "UNKNOWN";
    const isRegistered = phoneStatus === "CONNECTED";
    
    // Also check health_status for PHONE_NUMBER entity — if can_send_message is BLOCKED with error 141000, not registered
    if (!isRegistered && data.health_status?.entities) {
      const phoneEntity = data.health_status.entities.find((e: any) => e.entity_type === "PHONE_NUMBER");
      if (phoneEntity?.errors?.some((e: any) => e.error_code === 141000)) {
        log("check_phone_status_not_registered", { phoneId, reason: "error_141000" });
        return { registered: false, status: phoneStatus };
      }
    }

    return { registered: isRegistered, status: phoneStatus };
  } catch (err: any) {
    log("check_phone_status_error", { error: err.message });
    return { registered: false, error: err.message };
  }
}

async function registerPhone(phoneId: string, accessToken: string, retries = 2, pin = "123456"): Promise<{ success: boolean; data?: any; error?: string; details?: string }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    log("register", { attempt, phoneId });
    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${phoneId}/register`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messaging_product: "whatsapp", pin }),
        }
      );
      const data = await res.json();
      log("register_response", { attempt, status: res.status, data });

      if (res.ok && data.success) {
        return { success: true, data };
      }

      const errMsg = data?.error?.message || JSON.stringify(data);
      const errDetails = data?.error?.error_data?.details || "";

      // Non-retryable errors
      if (res.status === 400 || res.status === 403) {
        return { success: false, error: errMsg, details: errDetails };
      }

      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      } else {
        return { success: false, error: errMsg, details: errDetails };
      }
    } catch (err: any) {
      log("register_error", { attempt, error: err.message });
      if (attempt >= retries) {
        return { success: false, error: err.message };
      }
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  return { success: false, error: "Max retries exceeded" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      code,
      access_token: directToken,
      config_id: configId,
      redirect_uri: redirectUri,
      waba_id: sessionWabaId,
      phone_number_id: sessionPhoneId,
      org_id,
      auto_register = true,
      pin: userPin,
    } = body;

    const appId = "1239578701681497";
    const appSecret = Deno.env.get("META_APP_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!appSecret) return error("META_APP_SECRET not configured", 500);

    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Step 1: Obtain access token ──
    log("step1_token", { hasCode: !!code, hasDirect: !!directToken, hasConfigId: !!configId });
    let accessToken = directToken;

    // If config_id provided (retry scenario), fetch token from DB
    if (!accessToken && configId) {
      const { data: configData } = await supabase
        .from("whatsapp_config")
        .select("access_token")
        .eq("id", configId)
        .single();
      if (configData?.access_token) {
        accessToken = configData.access_token;
        log("step1_token_from_db", { configId });
      }
    }

    if (code) {
      const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}${redirectUri ? `&redirect_uri=${encodeURIComponent(redirectUri)}` : ""}`;
      const tokenRes = await fetch(tokenUrl);
      const tokenData = await tokenRes.json();

      if (tokenData.error) {
        log("token_exchange_error", tokenData.error);
        return error(tokenData.error.message || "Failed to exchange token", 400);
      }

      const shortLived = tokenData.access_token;
      const longUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLived}`;
      const longRes = await fetch(longUrl);
      const longData = await longRes.json();
      accessToken = longData.access_token || shortLived;
      log("step1_token_obtained", { longLived: !!longData.access_token });
    }

    if (!accessToken) return error("code, access_token, or config_id is required", 400);

    // ── Step 2: Resolve WABA ID & phone numbers ──
    log("step2_resolve", { sessionWabaId, sessionPhoneId });
    let wabaIds: string[] = sessionWabaId ? [sessionWabaId] : [];
    let resolvedPhones: any[] = [];

    if (wabaIds.length === 0) {
      const debugRes = await fetch(
        `https://graph.facebook.com/v21.0/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`
      );
      const debugData = await debugRes.json();
      const granularScopes = debugData.data?.granular_scopes || [];
      const waScope = granularScopes.find((s: any) => s.scope === "whatsapp_business_management");
      wabaIds = waScope?.target_ids || [];
      log("step2_discovered_wabas", { wabaIds });
    }

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

    log("step2_phones", { count: resolvedPhones.length });

    let selectedPhone = sessionPhoneId
      ? resolvedPhones.find((p: any) => p.id === sessionPhoneId)
      : null;

    // ── Step 3: Save config ──
    let savedConfig = null;
    let registrationResult: { success: boolean; error?: string; skipped?: boolean; details?: string } = { success: false, error: "Not attempted" };

    if (selectedPhone && org_id) {
      const wabaId = selectedPhone.waba_id;
      const phoneId = selectedPhone.id;
      const displayPhone = selectedPhone.display_phone_number || "";
      const businessName = selectedPhone.verified_name || "";

      log("step3_save", { orgId: org_id, phoneId, wabaId });

      const { data: existingConfig } = await supabase
        .from("whatsapp_config")
        .select("id, webhook_verify_token")
        .eq("org_id", org_id)
        .maybeSingle();

      // ── Step 3.5: Check if phone is already registered ──
      const phoneStatus = await checkPhoneStatus(phoneId, accessToken);
      log("step3_phone_check", phoneStatus);

      const alreadyRegistered = phoneStatus.registered;

      const configPayload = {
        phone_number_id: phoneId,
        business_account_id: wabaId,
        access_token: accessToken,
        display_phone: displayPhone,
        business_name: businessName,
        is_connected: alreadyRegistered,
        registration_status: alreadyRegistered ? "connected" : "registering",
        registration_error: null,
        last_register_attempt_at: new Date().toISOString(),
        ...(alreadyRegistered ? { registered_at: new Date().toISOString() } : {}),
      };

      if (existingConfig) {
        await supabase.from("whatsapp_config").update(configPayload).eq("id", existingConfig.id);
        savedConfig = { ...existingConfig, ...configPayload };
      } else {
        const { data: newConfig } = await supabase.from("whatsapp_config").insert({
          org_id,
          ...configPayload,
        }).select().single();
        savedConfig = newConfig;
      }

      // ── Step 4: Register phone number (only if not already registered) ──
      if (auto_register && !alreadyRegistered) {
        registrationResult = await registerPhone(phoneId, accessToken, 3, userPin || "123456");

        const configId = savedConfig?.id || existingConfig?.id;

        if (registrationResult.success) {
          log("step4_register_success", { phoneId });
          await supabase.from("whatsapp_config").update({
            is_connected: true,
            registration_status: "connected",
            registration_error: null,
            registered_at: new Date().toISOString(),
          }).eq("id", configId);
        } else {
          // Store the detailed error for better user messaging
          const detailedError = registrationResult.details || registrationResult.error || "Unknown error";
          log("step4_register_failed", { phoneId, error: detailedError });
          await supabase.from("whatsapp_config").update({
            is_connected: false,
            registration_status: "failed",
            registration_error: detailedError,
          }).eq("id", configId);
        }
      } else if (alreadyRegistered) {
        log("step4_skipped", { phoneId, reason: "already_registered" });
        registrationResult = { success: true, skipped: true };
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
        log("step5_webhook_subscribe", { ok: subscribeRes.ok, data: subscribeData });
      } catch (subError: any) {
        log("step5_webhook_error", { error: subError.message });
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
        registration: registrationResult,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    log("fatal_error", { error: err.message, stack: err.stack });
    return error("Internal error", 500);
  }
});
