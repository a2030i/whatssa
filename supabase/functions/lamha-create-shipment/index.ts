import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.100.1/cors";

// ─────────────────────────────────────────────
// Lamha Create Shipment
// Auto-creates a shipment in Lamha when a new order arrives
// Called internally after order creation from store webhooks
// ─────────────────────────────────────────────

const LAMHA_API_BASE = "https://api.lamha.sa/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
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

  const { order_id, org_id } = body;

  if (!order_id || !org_id) {
    return new Response(JSON.stringify({ error: "order_id and org_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Get order details
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .eq("org_id", org_id)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Lamha integration config
    const { data: integration } = await supabase
      .from("store_integrations")
      .select("*")
      .eq("org_id", org_id)
      .eq("platform", "lamha")
      .eq("is_active", true)
      .maybeSingle();

    if (!integration) {
      return new Response(JSON.stringify({ error: "Lamha integration not found or inactive" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const metadata = integration.metadata || {};
    const apiToken = metadata.api_token;

    if (!apiToken) {
      return new Response(JSON.stringify({ error: "Lamha API token not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get order items
    const { data: items } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order_id);

    // Build Lamha shipment payload
    const shipmentPayload = {
      reference_id: order.order_number || order.external_id || order.id,
      receiver_name: order.customer_name || "عميل",
      receiver_phone: order.customer_phone?.replace(/^\+/, "") || "",
      receiver_city: order.customer_city || "",
      receiver_address: order.customer_address || "",
      receiver_region: order.customer_region || "",
      cod_amount: order.payment_status === "unpaid" ? Number(order.total || 0) : 0,
      description: items?.map(i => `${i.product_name} x${i.quantity}`).join(", ") || "طلب",
      weight: metadata.default_weight || 1,
      pieces: items?.reduce((sum: number, i: any) => sum + (i.quantity || 1), 0) || 1,
    };

    console.log(`[lamha-create-shipment] Creating shipment for order ${order_id}`, shipmentPayload);

    // Call Lamha API
    const lamhaRes = await fetch(`${LAMHA_API_BASE}/shipments`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(shipmentPayload),
    });

    const lamhaData = await lamhaRes.json();

    if (!lamhaRes.ok) {
      console.error(`[lamha-create-shipment] Lamha API error:`, lamhaData);

      // Log the event as failed
      await supabase.from("shipment_events").insert({
        order_id,
        org_id,
        status_key: "creation_failed",
        status_label: "فشل إنشاء الشحنة",
        source: "lamha",
        metadata: { error: lamhaData },
      });

      return new Response(JSON.stringify({ error: "Lamha API error", details: lamhaData }), {
        status: lamhaRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract tracking number and shipment ID from response
    const trackingNumber = lamhaData.tracking_number || lamhaData.data?.tracking_number || lamhaData.waybill || "";
    const lamhaShipmentId = lamhaData.id || lamhaData.data?.id || lamhaData.shipment_id || "";

    // Update order with tracking info
    await supabase.from("orders").update({
      shipment_status: "new",
      shipment_carrier: "lamha",
      shipment_tracking_number: trackingNumber,
      updated_at: new Date().toISOString(),
    }).eq("id", order_id);

    // Log shipment creation event
    await supabase.from("shipment_events").insert({
      order_id,
      org_id,
      status_key: "created",
      status_label: "تم إنشاء الشحنة",
      source: "lamha",
      tracking_number: trackingNumber,
      carrier: "lamha",
      metadata: { lamha_shipment_id: lamhaShipmentId, lamha_response: lamhaData },
    });

    console.log(`[lamha-create-shipment] Shipment created: tracking=${trackingNumber}`);

    return new Response(JSON.stringify({
      success: true,
      tracking_number: trackingNumber,
      lamha_shipment_id: lamhaShipmentId,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[lamha-create-shipment] Error:`, err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
