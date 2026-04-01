import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.100.1/cors";

// ─────────────────────────────────────────────
// Lamha Sync Status (Polling)
// Checks Lamha API for shipment status updates
// Can be called via cron or manually
// ─────────────────────────────────────────────

const LAMHA_API_BASE = "https://api.lamha.sa/v1";

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
    "picked_up": "shipped",
    "shipping": "shipped",
    "delivered": "delivered",
    "cancelled": "cancelled",
    "returned": "refunded",
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

  // Optional: sync specific org only
  let targetOrgId: string | null = null;
  try {
    const body = await req.json();
    targetOrgId = body.org_id || null;
  } catch { /* no body = sync all */ }

  try {
    // Get all active Lamha integrations
    let query = supabase
      .from("store_integrations")
      .select("*")
      .eq("platform", "lamha")
      .eq("is_active", true);

    if (targetOrgId) {
      query = query.eq("org_id", targetOrgId);
    }

    const { data: integrations } = await query;

    if (!integrations || integrations.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No active Lamha integrations" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalUpdated = 0;
    let totalChecked = 0;

    for (const integration of integrations) {
      const metadata = integration.metadata || {};
      const apiToken = metadata.api_token;
      if (!apiToken) continue;

      const orgId = integration.org_id;

      // Get orders with active shipments (not delivered/cancelled/returned)
      const { data: orders } = await supabase
        .from("orders")
        .select("id, shipment_status, shipment_tracking_number, order_number, external_id, customer_phone, customer_name")
        .eq("org_id", orgId)
        .eq("shipment_carrier", "lamha")
        .not("shipment_status", "in", '("delivered","cancelled","returned")')
        .not("shipment_tracking_number", "is", null);

      if (!orders || orders.length === 0) continue;

      for (const order of orders) {
        totalChecked++;
        try {
          // Check shipment status from Lamha API
          const trackingNum = order.shipment_tracking_number;
          const lamhaRes = await fetch(`${LAMHA_API_BASE}/shipments/track/${trackingNum}`, {
            headers: {
              "Authorization": `Bearer ${apiToken}`,
              "Accept": "application/json",
            },
          });

          if (!lamhaRes.ok) {
            console.warn(`[lamha-sync] Failed to check ${trackingNum}: ${lamhaRes.status}`);
            continue;
          }

          const lamhaData = await lamhaRes.json();
          const statusId = String(lamhaData.status_id ?? lamhaData.data?.status_id ?? lamhaData.status ?? "");
          const statusInfo = LAMHA_STATUS_MAP[statusId] || { key: statusId, label: lamhaData.status_name || statusId };

          // Skip if status hasn't changed
          if (statusInfo.key === order.shipment_status) continue;

          console.log(`[lamha-sync] Order ${order.id}: ${order.shipment_status} → ${statusInfo.key}`);

          // Update order status
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

          await supabase.from("orders").update(updateData).eq("id", order.id);

          // Log shipment event
          await supabase.from("shipment_events").insert({
            order_id: order.id,
            org_id: orgId,
            status_key: statusInfo.key,
            status_label: statusInfo.label,
            source: "lamha",
            tracking_number: trackingNum,
            carrier: "lamha",
            metadata: { lamha_response: lamhaData },
          });

          totalUpdated++;

          // Send WhatsApp notification if configured
          await sendShipmentNotification(supabase, integration, order, statusInfo);

        } catch (orderErr) {
          console.error(`[lamha-sync] Error checking order ${order.id}:`, orderErr);
        }
      }

      // Update last sync time
      await supabase.from("store_integrations").update({
        last_webhook_at: new Date().toISOString(),
        webhook_error: null,
      }).eq("id", integration.id);
    }

    console.log(`[lamha-sync] Done: checked=${totalChecked}, updated=${totalUpdated}`);

    return new Response(JSON.stringify({
      success: true,
      checked: totalChecked,
      updated: totalUpdated,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[lamha-sync] Error:`, err);
    return new Response(JSON.stringify({ error: "Sync failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─────────────────────────────────────────────
// WhatsApp Notification for Shipment Updates
// ─────────────────────────────────────────────
async function sendShipmentNotification(
  supabase: any,
  integration: any,
  order: any,
  statusInfo: { key: string; label: string }
) {
  const metadata = integration.metadata || {};
  const notifConfig = metadata.shipment_notifications;

  if (!notifConfig?.enabled || !notifConfig?.channel_id) return;
  if (!order.customer_phone) return;

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

    console.log(`[lamha-sync] Notification sent for order ${order.id} → ${statusInfo.label}`);
  } catch (err) {
    console.error(`[lamha-sync] Notification failed:`, err);
  }
}
