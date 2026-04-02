import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";

// ─────────────────────────────────────────────
// Lamha v2 API - POST /create-order
// Always creates order + shipment (create_shippment=true) with carrier_id
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

  const { order_id, org_id, carrier_id, warehouse_id } = body;

  if (!order_id || !org_id) {
    return new Response(JSON.stringify({ error: "order_id and org_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!carrier_id) {
    return new Response(JSON.stringify({ error: "carrier_id مطلوب — يرجى اختيار شركة الشحن" }), {
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
      return new Response(JSON.stringify({ error: "توكن API لمحة غير مُعد — اذهب للإعدادات → التكاملات" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine shipper: selected warehouse -> default warehouse -> integration config
    let shipperConfig: any = metadata.shipper || {};
    let shipperSource = "integration";

    if (warehouse_id) {
      const { data: warehouse } = await supabase
        .from("warehouses")
        .select("*")
        .eq("id", warehouse_id)
        .eq("org_id", org_id)
        .eq("is_active", true)
        .maybeSingle();

      if (warehouse) {
        shipperConfig = {
          name: warehouse.name,
          phone: warehouse.phone,
          city: warehouse.city,
          address_line1: warehouse.address_line1,
          address_line2: warehouse.address_line2 || "",
          district: warehouse.district || "",
          country: warehouse.country || "SA",
          national_address: warehouse.national_address || "",
        };
        shipperSource = "selected_warehouse";
      } else {
        console.warn(`[lamha] warehouse not found or inactive`, { warehouse_id, org_id });
      }
    }

    if ((!shipperConfig.phone || !shipperConfig.city || !shipperConfig.address_line1) && shipperSource === "integration") {
      const { data: defaultWarehouse } = await supabase
        .from("warehouses")
        .select("*")
        .eq("org_id", org_id)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (defaultWarehouse) {
        shipperConfig = {
          name: defaultWarehouse.name,
          phone: defaultWarehouse.phone,
          city: defaultWarehouse.city,
          address_line1: defaultWarehouse.address_line1,
          address_line2: defaultWarehouse.address_line2 || "",
          district: defaultWarehouse.district || "",
          country: defaultWarehouse.country || "SA",
          national_address: defaultWarehouse.national_address || "",
        };
        shipperSource = warehouse_id ? "fallback_default_warehouse" : "default_warehouse";
      }
    }

    // Validate shipper config
    if (!shipperConfig.phone || !shipperConfig.city || !shipperConfig.address_line1) {
      return new Response(JSON.stringify({ 
        error: "بيانات المرسل ناقصة (الجوال، المدينة، العنوان) — أضف مستودعاً من صفحة المستودعات أو أكمل إعدادات لمحة",
        missing_fields: {
          phone: !shipperConfig.phone,
          city: !shipperConfig.city,
          address_line1: !shipperConfig.address_line1,
        },
        shipper_source: shipperSource,
        warehouse_id: warehouse_id || null,
      }), {
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

    // Callback URL must point to Lovable Cloud (where edge functions are hosted)
    const cloudUrl = Deno.env.get("SUPABASE_URL")!;
    const callbackUrl = `${cloudUrl}/functions/v1/lamha-webhook`;

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
      create_shippment: true,
      shipper: {
        name: shipperConfig.name || org?.name || "المتجر",
        phone: normalizePhone(shipperConfig.phone),
        Country: shipperConfig.country || "SA",
        District: shipperConfig.district || "",
        City: shipperConfig.city,
        AddressLine1: shipperConfig.address_line1,
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
      carrier_id: String(carrier_id),
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

    console.log(`[lamha] Creating order+shipment for ${order_id}`, {
      reference_id: orderPayload.reference_id,
      carrier_id: orderPayload.carrier_id,
      shipper_source: shipperSource,
      shipper_phone: orderPayload.shipper.phone,
      shipper_city: orderPayload.shipper.City,
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
      console.error(`[lamha] Lamha API error:`, JSON.stringify(lamhaData));

      // Build readable error from fields
      let errorMsg = lamhaData.msg || "خطأ من لمحة";
      if (lamhaData.fields) {
        const fieldErrors = Object.entries(lamhaData.fields)
          .map(([k, v]: [string, any]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(" | ");
        errorMsg += ` — ${fieldErrors}`;
      }

      await supabase.from("shipment_events").insert({
        order_id,
        org_id,
        status_key: "creation_failed",
        status_label: "فشل إنشاء الشحنة",
        source: "lamha",
        metadata: { error: lamhaData, payload: { reference_id: orderPayload.reference_id } },
      });

      return new Response(JSON.stringify({ error: errorMsg, details: lamhaData }), {
        status: lamhaRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lamhaOrderId = String(lamhaData.order_id || "");
    const trackingNumber = lamhaData.tracking_number || lamhaData.shipment?.tracking_number || "";

    // Update order
    const updateData: any = {
      shipment_carrier: "lamha",
      shipment_status: "new",
      updated_at: new Date().toISOString(),
    };
    if (trackingNumber) updateData.shipment_tracking_number = trackingNumber;

    await supabase.from("orders").update(updateData).eq("id", order_id);

    // Log event
    await supabase.from("shipment_events").insert({
      order_id,
      org_id,
      status_key: "created",
      status_label: "تم إنشاء الشحنة",
      source: "lamha",
      tracking_number: trackingNumber || null,
      carrier: "lamha",
      metadata: { lamha_order_id: lamhaOrderId, carrier_id, lamha_response: lamhaData },
    });

    console.log(`[lamha] Success: lamha_order_id=${lamhaOrderId}, tracking=${trackingNumber}`);

    return new Response(JSON.stringify({
      success: true,
      lamha_order_id: lamhaOrderId,
      tracking_number: trackingNumber,
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
