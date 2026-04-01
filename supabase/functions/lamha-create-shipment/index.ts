import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";

// ─────────────────────────────────────────────
// Lamha v2 API - Two flows:
// 1. create-order: POST /create-order (create_shippment=false) → order only
// 2. create-order-shipment: POST /create-order (create_shippment=true) with carrier_id
// 3. create-shipment: POST /create-shipment → shipment for existing Lamha order
// ─────────────────────────────────────────────

const LAMHA_API_BASE = "https://app.lamha.sa/api/v2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

  // action: "create-order" | "create-order-shipment" | "create-shipment"
  const { order_id, org_id, action = "create-order-shipment", carrier_id } = body;

  if (!order_id || !org_id) {
    return new Response(JSON.stringify({ error: "order_id and org_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Get order
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

    // Get Lamha integration
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

    // ─── Flow: create-shipment (for existing Lamha order) ───
    if (action === "create-shipment") {
      if (!carrier_id) {
        return new Response(JSON.stringify({ error: "carrier_id required for create-shipment" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find lamha_order_id from shipment_events
      const { data: events } = await supabase
        .from("shipment_events")
        .select("metadata")
        .eq("order_id", order_id)
        .eq("source", "lamha")
        .in("status_key", ["order_only", "created"])
        .order("created_at", { ascending: false })
        .limit(1);

      const lamhaOrderId = (events?.[0]?.metadata as any)?.lamha_order_id;
      if (!lamhaOrderId) {
        return new Response(JSON.stringify({ error: "Lamha order not found. Create order first." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const shipperConfig = metadata.shipper || {};
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", org_id)
        .single();

      const shipmentPayload = {
        shipper: {
          name: shipperConfig.name || org?.name || "المتجر",
          phone: shipperConfig.phone || "",
          Country: shipperConfig.country || "SA",
          District: shipperConfig.district || "",
          City: shipperConfig.city || "",
          AddressLine1: shipperConfig.address_line1 || "",
          AddressLine2: shipperConfig.address_line2 || "",
          national_address: shipperConfig.national_address || "",
        },
        coupon: "",
        parcels: "1",
        carrier_id: Number(carrier_id),
        order_id: String(lamhaOrderId),
      };

      console.log(`[lamha] Creating shipment for lamha order ${lamhaOrderId} with carrier ${carrier_id}`);

      const res = await fetch(`${LAMHA_API_BASE}/create-shipment`, {
        method: "POST",
        headers: {
          "X-LAMHA-TOKEN": apiToken,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(shipmentPayload),
      });

      const resData = await res.json();

      if (!res.ok || !resData.success) {
        console.error(`[lamha] Create shipment error:`, resData);
        return new Response(JSON.stringify({ error: "Lamha API error", details: resData }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update order
      await supabase.from("orders").update({
        shipment_status: "new",
        shipment_carrier: "lamha",
        updated_at: new Date().toISOString(),
      }).eq("id", order_id);

      // Log event
      await supabase.from("shipment_events").insert({
        order_id,
        org_id,
        status_key: "created",
        status_label: "تم إنشاء الشحنة",
        source: "lamha",
        carrier: "lamha",
        metadata: { lamha_order_id: lamhaOrderId, carrier_id, lamha_response: resData },
      });

      return new Response(JSON.stringify({ success: true, lamha_order_id: lamhaOrderId }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Flow: create-order or create-order-shipment ───
    const createShipment = action === "create-order-shipment";

    if (createShipment && !carrier_id) {
      return new Response(JSON.stringify({ error: "carrier_id required when creating shipment" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get order items
    const { data: items } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order_id);

    // Get org info
    const { data: org } = await supabase
      .from("organizations")
      .select("name, settings")
      .eq("id", org_id)
      .single();

    const shipperConfig = metadata.shipper || {};
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const callbackUrl = `${supabaseUrl}/functions/v1/lamha-webhook`;

    const orderPayload: any = {
      sub_total: Number(order.subtotal || order.total || 0),
      discount: String(order.discount_amount || 0),
      shopping_cost: Number(order.shipping_amount || 0),
      total: Number(order.total || 0),
      payment_method: mapPaymentMethod(order.payment_method, order.payment_status),
      date: order.created_at || new Date().toISOString(),
      ShipmentCurrency: order.currency || "SAR",
      reference_id: order.order_number || order.external_id || order.id,
      order_id: order.order_number || order.external_id || order.id,
      create_shippment: createShipment,
      shipper: {
        name: shipperConfig.name || org?.name || "المتجر",
        phone: shipperConfig.phone || "",
        Country: shipperConfig.country || "SA",
        District: shipperConfig.district || "",
        City: shipperConfig.city || "",
        AddressLine1: shipperConfig.address_line1 || "",
        AddressLine2: shipperConfig.address_line2 || "",
        national_address: shipperConfig.national_address || "",
      },
      customer: {
        name: order.customer_name || "عميل",
        phone1: normalizePhone(order.customer_phone || ""),
        phone2: "",
        Country: "SA",
        District: "",
        City: order.customer_city || "",
        AddressLine1: order.customer_address || "",
        AddressLine2: "",
        email: order.customer_email || "",
        national_address: "",
      },
      items: (items || []).map((item: any) => ({
        name: item.product_name,
        quantity: item.quantity || 1,
        Sku: item.product_sku || "",
        amount: String(item.unit_price || 0),
        weight: String(metadata.default_weight || "0.5"),
      })),
      callback_url: callbackUrl,
      callback_pdf_url: "",
      carrier_id: createShipment ? String(carrier_id) : "",
      coupon: "",
      parcels: String(items?.reduce((sum: number, i: any) => sum + (i.quantity || 1), 0) || 1),
    };

    // Fallback: if no items
    if (orderPayload.items.length === 0) {
      orderPayload.items = [{
        name: "طلب",
        quantity: 1,
        Sku: "",
        amount: String(order.total || 0),
        weight: String(metadata.default_weight || "0.5"),
      }];
    }

    console.log(`[lamha] Creating order for ${order_id}`, {
      action,
      reference_id: orderPayload.reference_id,
      carrier_id: orderPayload.carrier_id,
    });

    // Call Lamha API
    const lamhaRes = await fetch(`${LAMHA_API_BASE}/create-order`, {
      method: "POST",
      headers: {
        "X-LAMHA-TOKEN": apiToken,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    const lamhaData = await lamhaRes.json();

    if (!lamhaRes.ok || !lamhaData.success) {
      console.error(`[lamha] Lamha API error:`, lamhaData);

      await supabase.from("shipment_events").insert({
        order_id,
        org_id,
        status_key: "creation_failed",
        status_label: "فشل إنشاء الشحنة",
        source: "lamha",
        metadata: { error: lamhaData, payload: { reference_id: orderPayload.reference_id } },
      });

      return new Response(JSON.stringify({ error: "Lamha API error", details: lamhaData }), {
        status: lamhaRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lamhaOrderId = String(lamhaData.order_id || "");
    const trackingNumber = lamhaData.tracking_number || lamhaData.shipment?.tracking_number || "";

    // Update order
    const updateData: any = {
      shipment_carrier: "lamha",
      updated_at: new Date().toISOString(),
    };

    if (createShipment) {
      updateData.shipment_status = "new";
      if (trackingNumber) updateData.shipment_tracking_number = trackingNumber;
    }

    await supabase.from("orders").update(updateData).eq("id", order_id);

    // Log event
    await supabase.from("shipment_events").insert({
      order_id,
      org_id,
      status_key: createShipment ? "created" : "order_only",
      status_label: createShipment ? "تم إنشاء الشحنة" : "تم إنشاء الطلب في لمحة",
      source: "lamha",
      tracking_number: trackingNumber || null,
      carrier: "lamha",
      metadata: { lamha_order_id: lamhaOrderId, carrier_id: carrier_id || null, lamha_response: lamhaData },
    });

    console.log(`[lamha] Success: lamha_order_id=${lamhaOrderId}, tracking=${trackingNumber}`);

    return new Response(JSON.stringify({
      success: true,
      lamha_order_id: lamhaOrderId,
      tracking_number: trackingNumber,
      shipment_created: createShipment,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[lamha] Error:`, err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Helpers ────────────────────────────────

function mapPaymentMethod(method: string | null, paymentStatus: string | null): string {
  if (!method) return paymentStatus === "paid" ? "paid" : "cod";
  const lower = method.toLowerCase();
  if (lower === "cod" || lower.includes("استلام") || lower.includes("عند")) return "cod";
  return "paid";
}

function normalizePhone(phone: string): string {
  let p = phone.replace(/\s+/g, "");
  if (p.startsWith("00")) p = "+" + p.substring(2);
  if (!p.startsWith("+") && p.startsWith("05")) p = "+966" + p.substring(1);
  if (!p.startsWith("+") && p.startsWith("5")) p = "+966" + p;
  return p;
}
