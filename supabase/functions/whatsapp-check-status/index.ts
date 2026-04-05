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
    const { config_id } = await req.json();
    if (!config_id) {
      return new Response(JSON.stringify({ error: "config_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || Deno.env.get("EXTERNAL_SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: config } = await supabase
      .from("whatsapp_config")
      .select("access_token, phone_number_id, business_account_id")
      .eq("id", config_id)
      .single();

    if (!config) {
      return new Response(JSON.stringify({ error: "Config not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = config.access_token;
    const phoneId = config.phone_number_id;
    const wabaId = config.business_account_id;

    // Fetch phone status with extended fields
    const phoneRes = await fetch(
      `https://graph.facebook.com/v21.0/${phoneId}?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,account_mode,is_official_business_account,messaging_limit_tier,name_status,status,certificate,health_status,platform_type,is_pin_enabled,last_onboarded_time`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const phoneData = await phoneRes.json();

    // Handle Meta rate limit
    if (phoneData.error?.code === 4 || phoneData.error?.code === 80004 || phoneRes.status === 429) {
      return new Response(
        JSON.stringify({ error: "rate_limit", message: "تم إرسال طلبات كثيرة. انتظر بضع دقائق ثم أعد المحاولة" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch WABA status
    const wabaRes = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}?fields=id,name,currency,timezone_id,message_template_namespace,account_review_status,business_verification_status,ownership_type,on_behalf_of_business_info`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const wabaData = await wabaRes.json();

    // Fetch business verification from the linked business if available
    let businessVerification = null;
    if (wabaData.on_behalf_of_business_info?.id) {
      const bizId = wabaData.on_behalf_of_business_info.id;
      const bizRes = await fetch(
        `https://graph.facebook.com/v21.0/${bizId}?fields=id,name,verification_status`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      businessVerification = await bizRes.json();
    }

    // Determine overall health
    const issues: string[] = [];
    
    // Check WABA review status
    if (wabaData.account_review_status && wabaData.account_review_status !== "APPROVED") {
      issues.push(`waba_review:${wabaData.account_review_status}`);
    }

    // Check business verification
    const bizStatus = wabaData.business_verification_status || businessVerification?.verification_status;
    if (bizStatus && bizStatus !== "verified") {
      issues.push(`business_verification:${bizStatus}`);
    }

    // Check phone quality
    if (phoneData.quality_rating && !["GREEN", "UNKNOWN"].includes(phoneData.quality_rating)) {
      issues.push(`quality:${phoneData.quality_rating}`);
    }

    // Check phone name status
    if (phoneData.name_status && !["APPROVED", "AVAILABLE_WITHOUT_REVIEW"].includes(phoneData.name_status)) {
      issues.push(`name_status:${phoneData.name_status}`);
    }

    // Check messaging limit
    const limitTier = phoneData.messaging_limit_tier || "UNKNOWN";

    // Check health_status if available
    let healthEntities: any[] = [];
    if (phoneData.health_status?.entities) {
      healthEntities = phoneData.health_status.entities;
    }

    const overallStatus = issues.length === 0 ? "healthy" : "issues_found";

    return new Response(
      JSON.stringify({
        status: overallStatus,
        issues,
        phone: {
          id: phoneData.id,
          display_phone_number: phoneData.display_phone_number,
          verified_name: phoneData.verified_name,
          quality_rating: phoneData.quality_rating,
          code_verification_status: phoneData.code_verification_status,
          account_mode: phoneData.account_mode,
          messaging_limit_tier: limitTier,
          name_status: phoneData.name_status,
          status: phoneData.status,
          is_official_business_account: phoneData.is_official_business_account,
          is_pin_enabled: phoneData.is_pin_enabled,
          platform_type: phoneData.platform_type,
          health_status: healthEntities,
        },
        waba: {
          id: wabaData.id,
          name: wabaData.name,
          account_review_status: wabaData.account_review_status,
          business_verification_status: wabaData.business_verification_status,
          ownership_type: wabaData.ownership_type,
          on_behalf_of_business: wabaData.on_behalf_of_business_info,
        },
        business_verification: businessVerification
          ? {
              id: businessVerification.id,
              name: businessVerification.name,
              verification_status: businessVerification.verification_status,
            }
          : null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
