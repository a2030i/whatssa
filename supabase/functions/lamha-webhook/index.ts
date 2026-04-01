import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.100.1/cors";

// ─────────────────────────────────────────────
// Lamha Shipping Webhook
// Receives shipment status updates from Lamha (lamha.sa)
// and updates order shipment_status + sends WhatsApp notification
// ─────────────────────────────────────────────

// Lamha status codes → Arabic labels
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

// Map Lamha status to our order status
function lamhaToOrderStatus(statusId: string): string | null {
  const map: Record<string, string> = {
    "6": "shipped",      // picked up = shipped
    "7": "shipped",      // shipping
    "8": "delivered",    // delivered
    "5": "cancelled",    // cancelled
    "10": "refunded",    // returned
  };
  return map[statusId] || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Extract store integration ID from URL path
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const integrationId = pathParts[pathParts.length - 1];

  if (!integrationId || integrationId === "lamha-webhook") {
    return new Response(JSON.stringify({ error: "Missing integration ID" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Load store integration config
  const { data: integration, error: intError } = await supabase
    .from("store_integrations")
    .select("*")
    .eq("id", integrationId)
    .eq("platform", "lamha")
    .eq("is_active", true)
    .single();

  if (intError || !integration) {
    return new Response(JSON.stringify({ error: "Lamha integration not found or inactive" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const orgId = integration.org_id;

  // Verify HMAC signature
  const bodyText = await req.text();
  const storeId = req.headers.get("x-lamha-store-id") || "";
  const storeToken = req.headers.get("x-lamha-store-token") || "";
  
  if (integration.webhook_secret && storeToken) {
    const isValid = await verifyLamhaSignature(bodyText, integration.webhook_secret, storeToken);
    if (!isValid) {
      console.warn(`[lamha-webhook] Invalid signature for integration: ${integrationId}`);
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let body: any;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Update last_webhook_at
  await supabase
    .from("store_integrations")
    .update({ last_webhook_at: new Date().toISOString(), webhook_error: null })
    .eq("id", integrationId);

  console.log(`[lamha-webhook] org=${orgId} status_id=${body.status_id} order_id=${body.order_id}`);

  try {
    const statusId = String(body.status_id || "");
    const orderId = String(body.order_id || "");
    const statusName = body.status_name || "";

    if (!orderId) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "no order_id" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const statusInfo = LAMHA_STATUS_MAP[statusId] || { key: statusName, label: statusName };

    // Find order by external_id or order_number
    const { data: order } = await supabase
      .from("orders")
      .select("id, external_id, order_number, customer_phone, customer_name, status")
      .eq("org_id", orgId)
      .or(`external_id.eq.${orderId},order_number.eq.${orderId}`)
      .maybeSingle();

    if (!order) {
      console.warn(`[lamha-webhook] Order not found: ${orderId} in org ${orgId}`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "order_not_found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update shipment status
    const updateData: any = {
      shipment_status: statusInfo.key,
      updated_at: new Date().toISOString(),
    };

    // Also update main order status for significant events
    const mappedStatus = lamhaToOrderStatus(statusId);
    if (mappedStatus) {
      updateData.status = mappedStatus;
      if (mappedStatus === "shipped") updateData.shipped_at = new Date().toISOString();
      if (mappedStatus === "delivered") updateData.delivered_at = new Date().toISOString();
      if (mappedStatus === "cancelled") updateData.cancelled_at = new Date().toISOString();
      if (mappedStatus === "refunded") updateData.refunded_at = new Date().toISOString();
    }

    await supabase.from("orders").update(updateData).eq("id", order.id);

    console.log(`[lamha-webhook] Updated order ${order.id}: shipment_status=${statusInfo.key}, order_status=${mappedStatus || "unchanged"}`);

    // Send WhatsApp notification if configured
    await sendShipmentNotification(supabase, integration, order, statusInfo, orderId);

    return new Response(JSON.stringify({
      success: true,
      order_id: order.id,
      shipment_status: statusInfo.key,
      order_status: mappedStatus || order.status,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[lamha-webhook] Error:`, err);
    await supabase
      .from("store_integrations")
      .update({ webhook_error: (err as Error).message })
      .eq("id", integrationId);

    return new Response(JSON.stringify({ error: "Processing failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─────────────────────────────────────────────
// HMAC Signature Verification
// ─────────────────────────────────────────────
async function verifyLamhaSignature(body: string, secret: string, token: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const computed = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return computed === token;
  } catch (e) {
    console.warn(`[lamha-webhook] Signature verification error:`, e);
    return false;
  }
}

// ─────────────────────────────────────────────
// WhatsApp Notification for Shipment Updates
// ─────────────────────────────────────────────
async function sendShipmentNotification(
  supabase: any,
  integration: any,
  order: any,
  statusInfo: { key: string; label: string },
  lamhaOrderId: string
) {
  const metadata = integration.metadata || {};
  const notifConfig = metadata.shipment_notifications;

  if (!notifConfig?.enabled || !notifConfig?.channel_id) return;
  if (!order.customer_phone) return;

  // Check if this status should trigger notification
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
      // Send template message
      const bodyParams = [
        { type: "text", text: order.customer_name || "عميل" },
        { type: "text", text: order.order_number || lamhaOrderId },
        { type: "text", text: statusInfo.label },
      ];
      const components = [{ type: "body", parameters: bodyParams }];

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
            components,
          },
        }),
      });
    } else if (channelType === "evolution" && notifConfig.message_text) {
      // Send text message via Evolution API
      let message = notifConfig.message_text;
      const vars: Record<string, string> = {
        customer_name: order.customer_name || "عميل",
        order_number: order.order_number || lamhaOrderId,
        status: statusInfo.label,
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

        await supabase.from("channel_send_log").insert({
          channel_id: waConfig.id,
          org_id: integration.org_id,
          message_type: "lamha_shipment",
          recipient_phone: order.customer_phone,
        });
      }
    }

    console.log(`[lamha-webhook] Notification sent for order ${order.id} → ${statusInfo.label}`);
  } catch (err) {
    console.error(`[lamha-webhook] Notification failed:`, err);
  }
}
