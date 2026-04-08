import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

async function resolveMetaCredentials(serviceClient: ReturnType<typeof createClient>) {
  const fallbackAppId = Deno.env.get("META_APP_ID") || "1239578701681497";
  const fallbackSecret = Deno.env.get("META_APP_SECRET") || "";

  try {
    const { data } = await serviceClient
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

// ── Helpers ──

async function fetchPhoneDetails(phoneId: string, accessToken: string) {
  const fields = "id,display_phone_number,verified_name,quality_rating,code_verification_status,account_mode,status,health_status,name_status,messaging_limit_tier,throughput,platform_type";
  const res = await fetch(
    `https://graph.facebook.com/v22.0/${phoneId}?fields=${fields}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  log("fetch_phone_details", { status: res.status, data });
  return { ok: res.ok, data };
}

async function fetchWabaDetails(wabaId: string, accessToken: string) {
  const fields = "id,name,currency,timezone_id,message_template_namespace,business_verification_status,account_review_status,on_behalf_of_business_info";
  const res = await fetch(
    `https://graph.facebook.com/v22.0/${wabaId}?fields=${fields}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  log("fetch_waba_details", { status: res.status, data });
  return { ok: res.ok, data };
}

async function fetchPhoneNumbersForWaba(wabaId: string, accessToken: string) {
  const res = await fetch(
    `https://graph.facebook.com/v22.0/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,status,account_mode,platform_type,name_status,messaging_limit_tier,throughput`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  const phones = (data.data || []).map((phone: any) => ({ ...phone, waba_id: wabaId }));
  log("fetch_waba_phones", { wabaId, status: res.status, count: phones.length, error: data?.error || null });
  return { ok: res.ok, data, phones };
}

function normalizeSelectedPhone(phoneData: any, wabaId: string, fallbackPhoneId?: string) {
  return {
    id: phoneData?.id || fallbackPhoneId || "",
    waba_id: wabaId,
    display_phone_number: phoneData?.display_phone_number || "",
    verified_name: phoneData?.verified_name || "",
    quality_rating: phoneData?.quality_rating || "",
    code_verification_status: phoneData?.code_verification_status || null,
    status: phoneData?.status || null,
    account_mode: phoneData?.account_mode || null,
    platform_type: phoneData?.platform_type || null,
    name_status: phoneData?.name_status || null,
    messaging_limit_tier: phoneData?.messaging_limit_tier || null,
    throughput: phoneData?.throughput || null,
    health_status: phoneData?.health_status || null,
  };
}

/** Determine onboarding type based on phone status and platform_type */
function detectOnboardingType(phoneData: any): {
  onboarding_type: "new" | "existing" | "migrated";
  migration_source: string | null;
  migration_status: string;
} {
  const status = phoneData.status || "UNKNOWN";
  const platformType = phoneData.platform_type || "";
  
  // If phone is already CONNECTED on Cloud API — it's an existing number being re-linked
  if (status === "CONNECTED") {
    // Check if it was migrated from on-premise or another provider
    if (platformType === "ON_PREMISE") {
      return {
        onboarding_type: "migrated",
        migration_source: "on_premise_api",
        migration_status: "completed",
      };
    }
    return {
      onboarding_type: "existing",
      migration_source: null,
      migration_status: "none",
    };
  }
  
  // PENDING status could mean: new signup, or migration in progress
  if (status === "PENDING" || status === "OFFLINE") {
    // If platform_type exists and is not CLOUD_API, it's a migration
    if (platformType && platformType !== "CLOUD_API" && platformType !== "NOT_APPLICABLE") {
      return {
        onboarding_type: "migrated",
        migration_source: platformType === "ON_PREMISE" ? "on_premise_api" : "business_app",
        migration_status: "pending",
      };
    }
    return {
      onboarding_type: "new",
      migration_source: null,
      migration_status: "none",
    };
  }
  
  // Default: new number
  return {
    onboarding_type: "new",
    migration_source: null,
    migration_status: "none",
  };
}

/** Extract health issues into a structured format */
function extractHealthStatus(phoneData: any): any[] {
  const entities = phoneData.health_status?.entities || [];
  return entities.map((e: any) => ({
    entity_type: e.entity_type,
    can_send_message: e.can_send_message,
    errors: (e.errors || []).map((err: any) => ({
      error_code: err.error_code,
      error_description: err.error_description,
      possible_solution: err.possible_solution,
    })),
  }));
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

/** Check migration prerequisites */
function checkMigrationPrereqs(phoneData: any, wabaData: any): { ready: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // Check business verification
  if (wabaData?.business_verification_status && wabaData.business_verification_status !== "verified") {
    issues.push("business_not_verified");
  }
  
  // Check account review
  if (wabaData?.account_review_status && wabaData.account_review_status !== "APPROVED") {
    issues.push("account_not_approved");
  }
  
  // Check for health errors blocking send
  const healthEntities = phoneData?.health_status?.entities || [];
  for (const entity of healthEntities) {
    if (entity.can_send_message === "BLOCKED") {
      for (const err of (entity.errors || [])) {
        if (err.error_code === 141006) issues.push("payment_method_missing");
        if (err.error_code === 141000) issues.push("phone_not_registered");
      }
    }
  }
  
  return { ready: issues.length === 0, issues };
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
      migration_source: userMigrationSource,
      previous_provider: userPreviousProvider,
    } = body;

    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceKey);
    const { appId, appSecret } = await resolveMetaCredentials(supabase);

    if (!appSecret) return error("META_APP_SECRET not configured — احفظه من إعدادات السوبر أدمن أو كـ Edge Function Secret", 500);

    // ── Step 1: Obtain access token ──
    log("step1_token", { hasCode: !!code, hasDirect: !!directToken, hasConfigId: !!configId });
    let accessToken = directToken;

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
      const tokenUrl = `https://graph.facebook.com/v22.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}${redirectUri ? `&redirect_uri=${encodeURIComponent(redirectUri)}` : ""}`;
      const tokenRes = await fetch(tokenUrl);
      const tokenData = await tokenRes.json();

      if (tokenData.error) {
        log("token_exchange_error", tokenData.error);
        return error(tokenData.error.message || "Failed to exchange token", 400);
      }

      const shortLived = tokenData.access_token;
      const longUrl = `https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(shortLived)}`;
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
    let appScopedUserId: string | null = null;

    if (wabaIds.length === 0) {
      const debugRes = await fetch(
        `https://graph.facebook.com/v22.0/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`
      );
      const debugData = await debugRes.json();
      const granularScopes = debugData.data?.granular_scopes || [];
      const waScope = granularScopes.find((s: any) => s.scope === "whatsapp_business_management");
      wabaIds = waScope?.target_ids || [];
      appScopedUserId = debugData.data?.user_id || null;
      log("step2_discovered_wabas", { wabaIds, appScopedUserId });
    }

    const results = [];
    for (const wabaId of wabaIds) {
      const phonesResult = await fetchPhoneNumbersForWaba(wabaId, accessToken);
      results.push({ waba_id: wabaId, phone_numbers: phonesResult.phones });
      resolvedPhones.push(...phonesResult.phones);
    }

    log("step2_phones", { count: resolvedPhones.length });

    let selectedPhone = sessionPhoneId
      ? resolvedPhones.find((p: any) => p.id === sessionPhoneId)
      : null;

    if (sessionPhoneId && !selectedPhone) {
      const directPhoneDetails = await fetchPhoneDetails(sessionPhoneId, accessToken);
      if (directPhoneDetails.ok && !directPhoneDetails.data?.error) {
        const normalizedPhone = normalizeSelectedPhone(
          directPhoneDetails.data,
          sessionWabaId || directPhoneDetails.data?.waba_id || wabaIds[0] || "",
          sessionPhoneId,
        );
        selectedPhone = normalizedPhone;

        if (normalizedPhone.waba_id && !wabaIds.includes(normalizedPhone.waba_id)) {
          wabaIds.push(normalizedPhone.waba_id);
          results.push({ waba_id: normalizedPhone.waba_id, phone_numbers: [normalizedPhone] });
        }

        resolvedPhones.push(normalizedPhone);
        log("step2_selected_phone_direct_lookup", {
          sessionPhoneId,
          found: true,
          resolvedWabaId: normalizedPhone.waba_id,
          status: normalizedPhone.status,
          platformType: normalizedPhone.platform_type,
        });
      }
    }

    if (sessionPhoneId && !selectedPhone) {
      const debugRes = await fetch(
        `https://graph.facebook.com/v22.0/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`
      );
      const debugData = await debugRes.json();
      const granularScopes = debugData.data?.granular_scopes || [];
      const waScope = granularScopes.find((s: any) => s.scope === "whatsapp_business_management");
      const fallbackWabaIds = [...new Set((waScope?.target_ids || []).filter((id: string) => !wabaIds.includes(id)))];

      for (const fallbackWabaId of fallbackWabaIds) {
        const phonesResult = await fetchPhoneNumbersForWaba(fallbackWabaId, accessToken);
        results.push({ waba_id: fallbackWabaId, phone_numbers: phonesResult.phones });
        resolvedPhones.push(...phonesResult.phones);
      }

      selectedPhone = resolvedPhones.find((p: any) => p.id === sessionPhoneId) || null;
      if (selectedPhone?.waba_id && !wabaIds.includes(selectedPhone.waba_id)) {
        wabaIds.push(selectedPhone.waba_id);
      }

      log("step2_selected_phone_fallback", {
        sessionPhoneId,
        searchedWabas: fallbackWabaIds,
        found: !!selectedPhone,
      });
    }

    if (sessionPhoneId && !selectedPhone) {
      return error("تعذر مطابقة الرقم المختار مع حسابات واتساب المصرح بها", 400);
    }

    // ── Step 3: Save config with full metadata ──
    let savedConfig = null;
    let registrationResult: { success: boolean; error?: string; skipped?: boolean; details?: string } = { success: false, error: "Not attempted" };
    let onboardingInfo: any = null;
    let migrationPrereqs: any = null;
    let wabaDetails: any = null;

    if (selectedPhone && org_id) {
      const wabaId = selectedPhone.waba_id;
      const phoneId = selectedPhone.id;
      const displayPhone = selectedPhone.display_phone_number || "";
      const businessName = selectedPhone.verified_name || "";

      log("step3_save", { orgId: org_id, phoneId, wabaId });

      // Fetch detailed phone and WABA info
      const [phoneDetails, wabaDetailsRes] = await Promise.all([
        fetchPhoneDetails(phoneId, accessToken),
        fetchWabaDetails(wabaId, accessToken),
      ]);

      const phoneData = phoneDetails.ok ? phoneDetails.data : selectedPhone;
      wabaDetails = wabaDetailsRes.ok ? wabaDetailsRes.data : null;

      // Detect onboarding type
      onboardingInfo = detectOnboardingType(phoneData);
      
      // Override with user-provided migration info if present
      if (userMigrationSource) {
        onboardingInfo.onboarding_type = "migrated";
        onboardingInfo.migration_source = userMigrationSource;
        if (onboardingInfo.migration_status === "none") {
          onboardingInfo.migration_status = "pending";
        }
      }

      // Check migration prerequisites
      migrationPrereqs = checkMigrationPrereqs(phoneData, wabaDetails);
      log("step3_onboarding", { onboardingInfo, migrationPrereqs });

      const { data: existingConfig } = await supabase
        .from("whatsapp_config")
        .select("id, webhook_verify_token")
        .eq("org_id", org_id)
        .eq("channel_type", "meta_api")
        .eq("phone_number_id", phoneId)
        .maybeSingle();

      const alreadyRegistered = phoneData.status === "CONNECTED";
      const healthStatus = extractHealthStatus(phoneData);

      // Get business ID from WABA info
      const metaBusinessId = wabaDetails?.on_behalf_of_business_info?.id || null;

      const configPayload: Record<string, any> = {
        phone_number_id: phoneId,
        business_account_id: wabaId,
        access_token: accessToken,
        display_phone: displayPhone,
        business_name: businessName,
        is_connected: alreadyRegistered,
        registration_status: alreadyRegistered ? "connected" : "registering",
        registration_error: null,
        channel_type: "meta_api",
        last_register_attempt_at: new Date().toISOString(),
        // New metadata fields
        onboarding_type: onboardingInfo.onboarding_type,
        migration_source: onboardingInfo.migration_source,
        migration_status: onboardingInfo.migration_status,
        previous_provider: userPreviousProvider || null,
        meta_business_id: metaBusinessId,
        quality_rating: phoneData.quality_rating || null,
        messaging_limit_tier: phoneData.messaging_limit_tier || null,
        account_mode: phoneData.account_mode || null,
        code_verification_status: phoneData.code_verification_status || null,
        name_status: phoneData.name_status || null,
        health_status: healthStatus,
        app_scoped_user_id: appScopedUserId,
        throughput_level: phoneData.throughput?.level || null,
        ...(alreadyRegistered ? { registered_at: new Date().toISOString() } : {}),
        ...(onboardingInfo.onboarding_type === "migrated" && alreadyRegistered ? { migrated_at: new Date().toISOString(), migration_status: "completed" } : {}),
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

        const cId = savedConfig?.id || existingConfig?.id;

        if (registrationResult.success) {
          log("step4_register_success", { phoneId });
          const updatePayload: Record<string, any> = {
            is_connected: true,
            registration_status: "connected",
            registration_error: null,
            registered_at: new Date().toISOString(),
          };
          if (onboardingInfo.onboarding_type === "migrated") {
            updatePayload.migration_status = "completed";
            updatePayload.migrated_at = new Date().toISOString();
          }
          await supabase.from("whatsapp_config").update(updatePayload).eq("id", cId);
        } else {
          const detailedError = registrationResult.details || registrationResult.error || "Unknown error";
          log("step4_register_failed", { phoneId, error: detailedError });
          await supabase.from("whatsapp_config").update({
            is_connected: false,
            registration_status: "failed",
            registration_error: detailedError,
            ...(onboardingInfo.onboarding_type === "migrated" ? { migration_status: "failed", migration_error: detailedError } : {}),
          }).eq("id", cId);
        }
      } else if (alreadyRegistered) {
        log("step4_skipped", { phoneId, reason: "already_registered" });
        registrationResult = { success: true, skipped: true };
      }

      // ── Step 5: Subscribe app to WABA webhooks ──
      let wabaWebhookOk = false;
      try {
        const subscribeRes = await fetch(
          `https://graph.facebook.com/v22.0/${wabaId}/subscribed_apps`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );
        const subscribeData = await subscribeRes.json();
        wabaWebhookOk = subscribeRes.ok && subscribeData.success;
        log("step5_webhook_subscribe", { ok: wabaWebhookOk, data: subscribeData });
      } catch (subError: any) {
        log("step5_webhook_error", { error: subError.message });
      }

      // ── Step 5.5: Register app-level webhook URL ──
      let appWebhookOk = false;
      try {
        const webhookVerifyToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") || "respondly_verify";
        const webhookUrl = `${Deno.env.get("SUPABASE_URL") || Deno.env.get("EXTERNAL_SUPABASE_URL")}/functions/v1/whatsapp-webhook`;
        const appToken = `${appId}|${appSecret}`;
        const whRes = await fetch(
          `https://graph.facebook.com/v22.0/${appId}/subscriptions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              object: "whatsapp_business_account",
              callback_url: webhookUrl,
              verify_token: webhookVerifyToken,
              fields: ["messages"],
              access_token: appToken,
            }),
          }
        );
        const whData = await whRes.json();
        appWebhookOk = whRes.ok && whData.success;
        log("step5_5_app_webhook", { ok: appWebhookOk, status: whRes.status, data: whData });
      } catch (whErr: any) {
        log("step5_5_app_webhook_error", { error: whErr.message });
      }

      // Store webhook status in config
      const cId2 = savedConfig?.id;
      if (cId2) {
        await supabase.from("whatsapp_config").update({
          settings: {
            ...(savedConfig?.settings || {}),
            webhook_auto_registered: appWebhookOk && wabaWebhookOk,
          },
        }).eq("id", cId2);
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
        onboarding: onboardingInfo,
        migration_prereqs: migrationPrereqs,
        webhook_status: {
          app_webhook: typeof appWebhookOk !== "undefined" ? appWebhookOk : null,
          waba_subscription: typeof wabaWebhookOk !== "undefined" ? wabaWebhookOk : null,
          auto_configured: (typeof appWebhookOk !== "undefined" && appWebhookOk) && (typeof wabaWebhookOk !== "undefined" && wabaWebhookOk),
        },
        waba_details: wabaDetails ? {
          name: wabaDetails.name,
          business_verification_status: wabaDetails.business_verification_status,
          account_review_status: wabaDetails.account_review_status,
          currency: wabaDetails.currency,
        } : null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    log("fatal_error", { error: err.message, stack: err.stack });
    return error("Internal error", 500);
  }
});
