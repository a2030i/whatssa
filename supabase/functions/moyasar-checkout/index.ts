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
    const supabase = createClient(supabaseUrl, serviceKey);

    // Validate JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { org_id, plan_id, payment_type, amount, billing_cycle, addon_quantity, callback_url } = await req.json();

    if (!org_id || !amount || !callback_url) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: corsHeaders });
    }

    // Get Moyasar keys from system_settings
    const { data: moyasarSettings } = await supabase
      .from("system_settings")
      .select("key, value")
      .in("key", ["moyasar_secret_key", "moyasar_publishable_key"]);

    const secretKey = moyasarSettings?.find(s => s.key === "moyasar_secret_key")?.value;
    const publishableKey = moyasarSettings?.find(s => s.key === "moyasar_publishable_key")?.value;

    if (!secretKey || !publishableKey) {
      return new Response(JSON.stringify({ error: "Payment gateway not configured" }), { status: 500, headers: corsHeaders });
    }

    // Get plan details
    let description = "اشتراك Respondly";
    if (plan_id) {
      const { data: plan } = await supabase.from("plans").select("name_ar").eq("id", plan_id).maybeSingle();
      if (plan) description = `اشتراك باقة ${plan.name_ar}`;
    }
    if (payment_type === "addon_qr") {
      description = `ربط غير رسمي (${addon_quantity || 1} رقم)`;
    }

    // Create payment record
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
      return new Response(JSON.stringify({ error: "Failed to create payment record" }), { status: 500, headers: corsHeaders });
    }

    // Return publishable key + payment ID for frontend Moyasar Form
    return new Response(JSON.stringify({
      payment_id: payment.id,
      publishable_key: publishableKey,
      amount: Math.round(amount * 100), // Moyasar uses halalas
      currency: "SAR",
      description,
      callback_url: `${callback_url}?payment_id=${payment.id}`,
      metadata: { payment_id: payment.id, org_id, plan_id },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
