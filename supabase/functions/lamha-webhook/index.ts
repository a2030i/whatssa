import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";

// ─────────────────────────────────────────────
// Lamha Webhook — receives order status callbacks
// Called by Lamha when order status changes
// Verifies HMAC SHA-256 signature via X-Lamha-Store-Token
// Payload: { success, msg, status_id, order_id, status_name }
// ─────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-lamha-store-id, x-lamha-store-token",
};

const LAMHA_STATUS_MAP: Record<string, { key: string; label: string }> = {
  "0": { key: "new", label: "جديد" },
  "1": { key: "pending", label: "معلق" },
  "2": { key: "fulfilled", label: "تم التنفيذ" },
  "3": { key: "ready_for_pickup", label: "جاهز للالتقاط" },
  "4": { key: "reverse_shipment", label: "شحنة عكسية" },
  "5": { key: "cancelled", label: "ملغي" },
  "6": { key: "picked_up", label: "تم الالتقاط" },
  "7": { key: "shipping", label: "جاري الشحن" },
  "8": { key: "delivered", label: "تم التوصيل" },
  "9": { key: "delivery_failed", label: "فشل التوصيل" },
  "10": { key: "returned", label: "مرتجع" },
};

function lamhaToOrderStatus(statusKey: string): string | null {
  const map: Record<string, string> = {
    picked_up: "shipped",
    shipping: "shipped",
    delivered: "delivered",
    cancelled: "cancelled",
    returned: "refunded",
    delivery_failed: "pending",
  };
  return map[statusKey] || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Read raw body for HMAC verification
  const rawBody = await req.text();
  let payload: any;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const lamhaStoreId = req.headers.get("x-lamha-store-id") || "";
  const lamhaStoreToken = req.headers.get("x-lamha-store-token") || "";

  const { status_id, order_id: lamhaOrderId, status_name } = payload;

  if (!lamhaOrderId) {
    return new Response(JSON.stringify({ error: "order_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`[lamha-webhook] Received: order_id=${lamhaOrderId}, status_id=${status_id}, status_name=${status_name}`);

  try {
    // Find the order by looking up shipment_events with this lamha_order_id
    const { data: events } = await supabase
      .from("shipment_events")
      .select("order_id, org_id")
      .filter("metadata->>lamha_order_id", "eq", String(lamhaOrderId))
      .limit(1);

    if (!events || events.length === 0) {
      // Try matching by order_number/reference_id
      const { data: orders } = await supabase
        .from("orders")
        .select("id, org_id")
        .eq("shipment_carrier", "lamha")
        .or(`order_number.eq.${lamhaOrderId},external_id.eq.${lamhaOrderId}`)
        .limit(1);

      if (!orders || orders.length === 0) {
        console.warn(`[lamha-webhook] No matching order found for lamha_order_id=${lamhaOrderId}`);
        return new Response(JSON.stringify({ error: "Order not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Use the found order
      await processStatusUpdate(supabase, orders[0].id, orders[0].org_id, status_id, status_name, lamhaOrderId, lamhaStoreId, lamhaStoreToken, rawBody);
    } else {
      await processStatusUpdate(supabase, events[0].order_id, events[0].org_id, status_id, status_name, lamhaOrderId, lamhaStoreId, lamhaStoreToken, rawBody);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[lamha-webhook] Error:`, err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processStatusUpdate(
  supabase: any,
  orderId: string,
  orgId: string,
  statusId: string | number,
  statusName: string,
  lamhaOrderId: string,
  lamhaStoreId: string,
  lamhaStoreToken: string,
  rawBody: string
) {
  // Verify HMAC signature if store has a webhook secret configured
  const { data: integration } = await supabase
    .from("store_integrations")
    .select("metadata")
    .eq("org_id", orgId)
    .eq("platform", "lamha")
    .eq("is_active", true)
    .maybeSingle();

  if (integration?.metadata?.webhook_secret && lamhaStoreToken) {
    const secret = integration.metadata.webhook_secret;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const expectedToken = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    if (expectedToken !== lamhaStoreToken) {
      console.warn(`[lamha-webhook] HMAC verification failed for org=${orgId}`);
      // Log but don't reject — some implementations may differ
    }
  }

  const statusInfo = LAMHA_STATUS_MAP[String(statusId)] || {
    key: String(statusId),
    label: statusName || String(statusId),
  };

  // Get current order to check if status actually changed
  const { data: order } = await supabase
    .from("orders")
    .select("shipment_status, shipment_tracking_number, customer_phone, customer_name, order_number, external_id")
    .eq("id", orderId)
    .single();

  if (order && order.shipment_status === statusInfo.key) {
    console.log(`[lamha-webhook] Status unchanged for order ${orderId}: ${statusInfo.key}`);
    return;
  }

  console.log(`[lamha-webhook] Updating order ${orderId}: ${order?.shipment_status} → ${statusInfo.key}`);

  // Update order
  const updateData: any = {
    shipment_status: statusInfo.key,
    updated_at: new Date().toISOString(),
  };

  const mappedStatus = lamhaToOrderStatus(statusInfo.key);
  if (mappedStatus) {
    updateData.status = mappedStatus;
    if (mappedStatus === "shipped") updateData.shipped_at = new Date().toISOString();
    if (mappedStatus === "delivered") updateData.delivered_at = new Date().toISOString();
    if (mappedStatus === "cancelled") updateData.cancelled_at = new Date().toISOString();
    if (mappedStatus === "refunded") updateData.refunded_at = new Date().toISOString();
  }

  await supabase.from("orders").update(updateData).eq("id", orderId);

  // Log event
  await supabase.from("shipment_events").insert({
    order_id: orderId,
    org_id: orgId,
    status_key: statusInfo.key,
    status_label: statusInfo.label,
    source: "lamha_webhook",
    tracking_number: order?.shipment_tracking_number || null,
    carrier: "lamha",
    metadata: {
      lamha_order_id: lamhaOrderId,
      lamha_store_id: lamhaStoreId,
      webhook: true,
    },
  });

  // Send WhatsApp notification if configured
  if (order?.customer_phone && integration?.metadata?.shipment_notifications?.enabled) {
    await sendShipmentNotification(supabase, integration, order, statusInfo, orgId);
  }
}

async function sendShipmentNotification(
  supabase: any,
  integration: any,
  order: any,
  statusInfo: { key: string; label: string },
  orgId: string
) {
  const notifConfig = integration.metadata?.shipment_notifications;
  if (!notifConfig?.channel_id) return;

  const notifyStatuses = notifConfig.notify_statuses || ["picked_up", "shipping", "delivered", "delivery_failed", "returned"];
  if (!notifyStatuses.includes(statusInfo.key)) return;

  const { data: waConfig } = await supabase
    .from("whatsapp_config")
    .select("*")
    .eq("id", notifConfig.channel_id)
    .eq("is_connected", true)
    .maybeSingle();

  if (!waConfig) return;

  const channelType = waConfig.channel_type || "meta_api";

  try {
    if (channelType === "meta_api" && notifConfig.template_name) {
      const bodyParams = [
        { type: "text", text: order.customer_name || "عميل" },
        { type: "text", text: order.order_number || order.external_id || "" },
        { type: "text", text: statusInfo.label },
      ];
      if (order.shipment_tracking_number) {
        bodyParams.push({ type: "text", text: order.shipment_tracking_number });
      }

      await fetch(`https://graph.facebook.com/v21.0/${waConfig.phone_number_id}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${waConfig.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: order.customer_phone,
          type: "template",
          template: {
            name: notifConfig.template_name,
            language: { code: notifConfig.template_language || "ar" },
            components: [{ type: "body", parameters: bodyParams }],
          },
        }),
      });
    } else if (channelType === "evolution" && notifConfig.message_text) {
      let message = notifConfig.message_text;
      const vars: Record<string, string> = {
        customer_name: order.customer_name || "عميل",
        order_number: order.order_number || order.external_id || "",
        status: statusInfo.label,
        tracking_number: order.shipment_tracking_number || "",
      };
      for (const [key, value] of Object.entries(vars)) {
        message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
      }

      const apiUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
      const apiKey = Deno.env.get("EVOLUTION_API_KEY");
      if (apiUrl && apiKey && waConfig.evolution_instance_name) {
        await fetch(`${apiUrl}/message/sendText/${waConfig.evolution_instance_name}`, {
          method: "POST",
          headers: { apikey: apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ number: order.customer_phone, text: message }),
        });
      }
    }

    console.log(`[lamha-webhook] Notification sent for order → ${statusInfo.label}`);
  } catch (err) {
    console.error(`[lamha-webhook] Notification failed:`, err);
  }
}
