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

    const body = await req.json();
    
    // Moyasar sends webhook with payment data
    const moyasarId = body.id;
    const status = body.status; // paid, failed, refunded
    const metadata = body.metadata || {};
    const paymentId = metadata.payment_id;
    const sourceType = body.source?.type;

    if (!paymentId) {
      return new Response(JSON.stringify({ error: "Missing payment_id in metadata" }), { status: 400, headers: corsHeaders });
    }

    // Verify payment with Moyasar API
    const { data: moyasarSettings } = await supabase
      .from("system_settings")
      .select("key, value")
      .eq("key", "moyasar_secret_key")
      .maybeSingle();

    const secretKey = moyasarSettings?.value;
    if (!secretKey) {
      return new Response(JSON.stringify({ error: "Payment gateway not configured" }), { status: 500, headers: corsHeaders });
    }

    // Verify with Moyasar
    const verifyRes = await fetch(`https://api.moyasar.com/v1/payments/${moyasarId}`, {
      headers: { Authorization: `Basic ${btoa(secretKey + ":")}` },
    });
    const verifiedPayment = await verifyRes.json();

    if (verifiedPayment.status !== "paid") {
      await supabase.from("payments").update({
        status: verifiedPayment.status,
        moyasar_payment_id: moyasarId,
        moyasar_source_type: sourceType,
        updated_at: new Date().toISOString(),
      }).eq("id", paymentId);

      return new Response(JSON.stringify({ status: verifiedPayment.status }), { headers: corsHeaders });
    }

    // Payment is verified as paid
    const { data: payment } = await supabase.from("payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();

    if (!payment) {
      return new Response(JSON.stringify({ error: "Payment not found" }), { status: 404, headers: corsHeaders });
    }

    // Update payment record
    await supabase.from("payments").update({
      status: "paid",
      moyasar_payment_id: moyasarId,
      moyasar_source_type: sourceType,
      callback_verified: true,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", paymentId);

    // Activate subscription
    if (payment.payment_type === "subscription" && payment.plan_id) {
      const now = new Date();
      const endDate = new Date(now);
      if (payment.billing_cycle === "yearly") {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else {
        endDate.setMonth(endDate.getMonth() + 1);
      }

      await supabase.from("organizations").update({
        plan_id: payment.plan_id,
        subscription_status: "active",
        subscription_starts_at: now.toISOString(),
        subscription_ends_at: endDate.toISOString(),
        updated_at: now.toISOString(),
      }).eq("id", payment.org_id);
    }

    // Log activity
    await supabase.from("activity_logs").insert({
      action: "payment_completed",
      actor_id: payment.org_id,
      actor_type: "organization",
      target_type: "payment",
      target_id: paymentId,
      metadata: {
        amount: payment.amount,
        payment_type: payment.payment_type,
        moyasar_id: moyasarId,
        source_type: sourceType,
      },
    });

    return new Response(JSON.stringify({ status: "paid", activated: true }), { headers: corsHeaders });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
