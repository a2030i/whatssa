import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";

// ─────────────────────────────────────────────
// Dispatch Webhook — sends events to org outgoing webhooks
// Called internally from other edge functions when events occur
// Supports: message.received, message.sent, order.created, order.updated,
//           conversation.created, conversation.closed, customer.created, etc.
// ─────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
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

  const { org_id, event, data } = body;

  if (!org_id || !event) {
    return new Response(JSON.stringify({ error: "org_id and event required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Get active webhooks for this org that subscribe to this event
    const { data: webhooks } = await supabase
      .from("org_webhooks")
      .select("*")
      .eq("org_id", org_id)
      .eq("is_active", true);

    if (!webhooks || webhooks.length === 0) {
      return new Response(JSON.stringify({ dispatched: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter webhooks that subscribe to this event
    const matchingWebhooks = webhooks.filter((wh: any) => {
      if (!wh.events || wh.events.length === 0) return true; // Empty = all events
      return wh.events.includes(event) || wh.events.includes("*");
    });

    let dispatched = 0;
    const results: any[] = [];

    for (const webhook of matchingWebhooks) {
      const startTime = Date.now();
      let statusCode = 0;
      let responseBody = "";
      let error = "";

      try {
        // Build HMAC signature for security
        const encoder = new TextEncoder();
        const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
        const key = await crypto.subtle.importKey(
          "raw",
          encoder.encode(webhook.secret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );
        const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
        const signatureHex = Array.from(new Uint8Array(signature))
          .map(b => b.toString(16).padStart(2, "0"))
          .join("");

        const res = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Signature": signatureHex,
            "X-Webhook-Event": event,
            "X-Webhook-Timestamp": new Date().toISOString(),
          },
          body: payload,
          signal: AbortSignal.timeout(10000), // 10s timeout
        });

        statusCode = res.status;
        responseBody = await res.text().catch(() => "");

        if (res.ok) {
          dispatched++;
          // Reset failure count on success
          await supabase.from("org_webhooks").update({
            failure_count: 0,
            last_triggered_at: new Date().toISOString(),
          }).eq("id", webhook.id);
        } else {
          error = `HTTP ${statusCode}: ${responseBody.substring(0, 200)}`;
          // Increment failure count
          const newFailureCount = (webhook.failure_count || 0) + 1;
          const update: any = {
            failure_count: newFailureCount,
            last_triggered_at: new Date().toISOString(),
          };
          // Auto-disable after 10 consecutive failures
          if (newFailureCount >= 10) {
            update.is_active = false;
          }
          await supabase.from("org_webhooks").update(update).eq("id", webhook.id);
        }
      } catch (err: any) {
        error = err.message || "Connection failed";
        const newFailureCount = (webhook.failure_count || 0) + 1;
        const update: any = { failure_count: newFailureCount };
        if (newFailureCount >= 10) update.is_active = false;
        await supabase.from("org_webhooks").update(update).eq("id", webhook.id);
      }

      const durationMs = Date.now() - startTime;

      // Log the webhook dispatch
      await supabase.from("webhook_logs").insert({
        org_id,
        webhook_id: webhook.id,
        event,
        url: webhook.url,
        status_code: statusCode || null,
        response_body: responseBody.substring(0, 500) || null,
        error: error || null,
        duration_ms: durationMs,
      });

      results.push({ webhook_id: webhook.id, status: statusCode, error, duration_ms: durationMs });
    }

    console.log(`[dispatch-webhook] org=${org_id} event=${event} dispatched=${dispatched}/${matchingWebhooks.length}`);

    return new Response(JSON.stringify({ dispatched, total: matchingWebhooks.length, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error(`[dispatch-webhook] Error:`, err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
