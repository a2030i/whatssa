import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = async (supabase: any, level: string, message: string, metadata: any = {}, orgId?: string) => {
  await supabase.from("system_logs").insert({
    level,
    source: "webhook",
    function_name: "moyasar-webhook",
    message,
    metadata,
    org_id: orgId || null,
  }).then(() => {});
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const moyasarId = body.id;
    const status = body.status;
    const metadata = body.metadata || {};
    const paymentId = metadata.payment_id;
    const sourceType = body.source?.type;

    await log(supabase, "info", "Webhook received", { moyasar_id: moyasarId, status, payment_id: paymentId });

    if (!paymentId) {
      await log(supabase, "warn", "Missing payment_id in webhook metadata", { body });
      return new Response(JSON.stringify({ error: "Missing payment_id in metadata" }), { status: 400, headers: corsHeaders });
    }

    const { data: moyasarSettings } = await supabase
      .from("system_settings")
      .select("key, value")
      .eq("key", "moyasar_secret_key")
      .maybeSingle();

    const secretKey = moyasarSettings?.value;
    if (!secretKey) {
      await log(supabase, "error", "Payment gateway not configured - missing secret key");
      return new Response(JSON.stringify({ error: "Payment gateway not configured" }), { status: 500, headers: corsHeaders });
    }

    const verifyRes = await fetch(`https://api.moyasar.com/v1/payments/${moyasarId}`, {
      headers: { Authorization: `Basic ${btoa(secretKey + ":")}` },
    });
    const verifiedPayment = await verifyRes.json();

    await log(supabase, "info", "Moyasar verification response", { verified_status: verifiedPayment.status, moyasar_id: moyasarId });

    if (verifiedPayment.status !== "paid") {
      await supabase.from("payments").update({
        status: verifiedPayment.status,
        moyasar_payment_id: moyasarId,
        moyasar_source_type: sourceType,
        updated_at: new Date().toISOString(),
      }).eq("id", paymentId);

      await log(supabase, "warn", "Payment not verified as paid", { payment_id: paymentId, status: verifiedPayment.status });
      return new Response(JSON.stringify({ status: verifiedPayment.status }), { headers: corsHeaders });
    }

    const { data: payment } = await supabase.from("payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();

    if (!payment) {
      await log(supabase, "error", "Payment record not found", { payment_id: paymentId });
      return new Response(JSON.stringify({ error: "Payment not found" }), { status: 404, headers: corsHeaders });
    }

    await supabase.from("payments").update({
      status: "paid",
      moyasar_payment_id: moyasarId,
      moyasar_source_type: sourceType,
      callback_verified: true,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", paymentId);

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

      await log(supabase, "info", "Subscription activated", {
        org_id: payment.org_id,
        plan_id: payment.plan_id,
        ends_at: endDate.toISOString(),
      }, payment.org_id);
    }

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

    await log(supabase, "info", "Payment completed successfully", { payment_id: paymentId, amount: payment.amount }, payment.org_id);

    return new Response(JSON.stringify({ status: "paid", activated: true }), { headers: corsHeaders });

  } catch (e) {
    await log(supabase, "critical", "Webhook processing failed", { error: (e as Error).message });
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
