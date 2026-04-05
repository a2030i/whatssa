import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = async (supabase: any, level: string, message: string, metadata: any = {}, orgId?: string) => {
  await supabase.from("system_logs").insert({
    level,
    source: "payment",
    function_name: "moyasar-checkout",
    message,
    metadata,
    org_id: orgId || null,
  }).then(() => {});
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("EXTERNAL_SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { org_id, plan_id, payment_type, amount, billing_cycle, addon_quantity, callback_url } = await req.json();

    if (!org_id || !amount || !callback_url) {
      await log(supabase, "warn", "Checkout missing required fields", { org_id, amount, callback_url }, org_id);
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: corsHeaders });
    }

    await log(supabase, "info", "Checkout initiated", { org_id, plan_id, amount, payment_type }, org_id);

    const { data: moyasarSettings } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["moyasar_secret_key", "moyasar_publishable_key"]);

    const secretKey = moyasarSettings?.find(s => s.key === "moyasar_secret_key")?.value;
    const publishableKey = moyasarSettings?.find(s => s.key === "moyasar_publishable_key")?.value;

    if (!secretKey || !publishableKey) {
      await log(supabase, "error", "Payment gateway not configured", { has_secret: !!secretKey, has_pub: !!publishableKey });
      return new Response(JSON.stringify({ error: "Payment gateway not configured" }), { status: 500, headers: corsHeaders });
    }

    let description = "اشتراك Respondly";
    if (plan_id) {
      const { data: plan } = await supabase.from("plans").select("name_ar").eq("id", plan_id).maybeSingle();
      if (plan) description = `اشتراك باقة ${plan.name_ar}`;
    }
    if (payment_type === "addon_qr") {
      description = `ربط غير رسمي (${addon_quantity || 1} رقم)`;
    }

    const { data: payment, error: paymentError } = await supabase.from("payments").insert({
      org_id,
      plan_id,
      payment_type: payment_type || "subscription",
      amount,
      billing_cycle: billing_cycle || "monthly",
      addon_quantity: addon_quantity || 0,
      created_by: user.id,
      metadata: { description, callback_url },
    }).select().single();

    if (paymentError) {
      await log(supabase, "error", "Failed to create payment record", { error: paymentError.message }, org_id);
      return new Response(JSON.stringify({ error: "Failed to create payment record" }), { status: 500, headers: corsHeaders });
    }

    await log(supabase, "info", "Payment record created", { payment_id: payment.id, amount }, org_id);

    return new Response(JSON.stringify({
      payment_id: payment.id,
      publishable_key: publishableKey,
      amount: Math.round(amount * 100),
      currency: "SAR",
      description,
      callback_url: `${callback_url}?payment_id=${payment.id}`,
      metadata: { payment_id: payment.id, org_id, plan_id },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    await log(supabase, "critical", "Checkout failed", { error: e.message, stack: e.stack });
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
