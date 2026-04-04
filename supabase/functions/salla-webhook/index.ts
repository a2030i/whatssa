import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const integrationId = pathParts[pathParts.length - 1];

  if (!integrationId || integrationId === "salla-webhook") {
    return new Response(JSON.stringify({ error: "Missing integration ID in URL" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: integration, error: intError } = await supabase
    .from("store_integrations")
    .select("*")
    .eq("id", integrationId)
    .eq("is_active", true)
    .single();

  if (intError || !integration) {
    console.error("Integration not found:", integrationId, intError);
    return new Response(JSON.stringify({ error: "Integration not found or inactive" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const orgId = integration.org_id;

  // Verify webhook signature
  const sallaSignature = req.headers.get("x-salla-signature");
  if (sallaSignature && integration.webhook_secret) {
    const encoder = new TextEncoder();
    const bodyBytes = await req.clone().arrayBuffer();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(integration.webhook_secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, bodyBytes);
    const computed = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (computed !== sallaSignature) {
      console.warn("Invalid Salla signature for integration:", integrationId);
    }
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const event = body.event;
  const data = body.data;
  const merchantId = body.merchant;

  console.log(`[salla-webhook] org=${orgId} event=${event} merchant=${merchantId}`);

  // Update last_webhook_at
  await supabase
    .from("store_integrations")
    .update({ last_webhook_at: new Date().toISOString(), webhook_error: null })
    .eq("id", integrationId);

  try {
    switch (event) {
      // ── Order lifecycle (Partners API only) ──
      case "order.created":
      case "order.updated":
        await handleOrder(supabase, orgId, integrationId, data, event);
        break;
      case "order.status.updated":
        await handleOrderStatus(supabase, orgId, data);
        break;
      case "order.cancelled":
        await handleOrderCancelled(supabase, orgId, data);
        break;
      case "order.refunded":
        await handleOrderRefunded(supabase, orgId, data);
        break;
      case "order.deleted":
        await handleOrderDeleted(supabase, orgId, data);
        break;
      case "order.payment.updated":
        await handleOrderPaymentUpdated(supabase, orgId, data);
        break;
      case "order.products.updated":
        await handleOrderProductsUpdated(supabase, orgId, integrationId, data);
        break;
      case "order.coupon.updated":
      case "order.total.price.updated":
        await handleOrderFinancialUpdate(supabase, orgId, data, event);
        break;

      // ── Invoice (Merchant dashboard — best alternative for order tracking) ──
      case "invoice.created":
        await handleInvoiceCreated(supabase, orgId, integrationId, data);
        break;

      // ── Shipment events ──
      case "order.shipment.creating":
      case "order.shipment.created":
      case "shipment.creating":
      case "shipment.created":
        await handleShipmentCreated(supabase, orgId, data, event);
        break;
      case "order.shipment.cancelled":
      case "shipment.cancelled":
        await handleShipmentCancelled(supabase, orgId, data);
        break;
      case "shipment.updated":
        await handleShipmentUpdated(supabase, orgId, data);
        break;
      case "order.shipment.return.creating":
      case "order.shipment.return.created":
      case "order.shipment.return.cancelled":
        await handleShipmentReturn(supabase, orgId, data, event);
        break;
      case "order.shipping.address.updated":
        await handleShippingAddressUpdated(supabase, orgId, data);
        break;

      // ── Customer ──
      case "customer.created":
      case "customer.updated":
      case "customer.login":
        await handleCustomer(supabase, orgId, data, event);
        break;

      // ── Cart ──
      case "abandoned.cart":
      case "abandoned.cart.updated":
        await handleAbandonedCart(supabase, orgId, integrationId, data);
        break;
      case "abandoned.cart.purchased":
        await handleCartPurchased(supabase, orgId, data);
        break;

      // ── Product ──
      case "product.created":
      case "product.updated":
      case "product.price.updated":
      case "product.status.updated":
      case "product.image.updated":
      case "product.option.updated":
      case "product.variant.updated":
      case "product.available":
        await handleProduct(supabase, orgId, integrationId, data, event);
        break;
      case "product.deleted":
        await handleProductDeleted(supabase, orgId, data);
        break;
      case "product.quantity.low":
        await handleProductLowStock(supabase, orgId, data);
        break;

      // ── Other merchant events ──
      case "coupon.applied":
      case "review.added":
        // These are tracked for notifications only, no DB action needed
        console.log(`[salla-webhook] Event tracked for notifications: ${event}`);
        break;

      default:
        console.log(`[salla-webhook] Unhandled event: ${event}`);
    }

    // ──── Send event notification if configured ────
    await sendEventNotification(supabase, integration, event, data);

    return new Response(JSON.stringify({ success: true, event }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[salla-webhook] Error processing ${event}:`, err);
    await supabase
      .from("store_integrations")
      .update({ webhook_error: `${event}: ${(err as Error).message}` })
      .eq("id", integrationId);

    return new Response(JSON.stringify({ error: "Processing failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─────────────────────────────────────────────
// Event Notification Sender
// ─────────────────────────────────────────────
async function sendEventNotification(supabase: any, integration: any, event: string, data: any) {
  const metadata = integration.metadata || {};
  const notifConfigs = metadata.event_notifications || {};

  // Map event to notification key — direct match for merchant events
  let notifKey = event;

  // Partners API events: map status changes to specific keys
  if (event === "order.status.updated") {
    const statusSlug = data?.status?.slug || data?.status?.name || "";
    const mapped = mapSallaOrderStatus(statusSlug);
    if (mapped === "shipped") notifKey = "shipment.created";
    else if (mapped === "delivered") notifKey = "shipment.updated";
    else return;
  }

  // Normalize shipment event names (order.shipment.* → shipment.*)
  if (event === "order.shipment.creating") notifKey = "shipment.creating";
  if (event === "order.shipment.created") notifKey = "shipment.created";
  if (event === "order.shipment.cancelled") notifKey = "shipment.cancelled";

  // Partners-only order events → try invoice.created config as fallback
  if ((event === "order.created" || event === "order.updated") && !notifConfigs[notifKey]?.enabled) {
    notifKey = "invoice.created";
  }

  const cfg = notifConfigs[notifKey];
  if (!cfg?.enabled || !cfg?.channel_id) return;

  const { data: waConfig } = await supabase
    .from("whatsapp_config")
    .select("*")
    .eq("id", cfg.channel_id)
    .eq("is_connected", true)
    .maybeSingle();

  if (!waConfig) {
    console.log(`[salla-notif] Channel ${cfg.channel_id} not connected, skipping`);
    return;
  }

  const customer = data?.customer || {};
  const phone = normalizePhone(customer.mobile || customer.phone || data?.customer_phone || "");
  if (!phone) {
    console.log(`[salla-notif] No phone for event ${notifKey}`);
    return;
  }

  const vars = buildVariables(notifKey, data);
  const channelType = waConfig.channel_type || "meta_api";

  try {
    if (channelType === "meta_api" && cfg.template_name) {
      await sendMetaTemplate(waConfig, phone, cfg.template_name, cfg.template_language || "ar", vars);
      console.log(`[salla-notif] Meta template sent: ${cfg.template_name} → ${phone}`);
    } else if (channelType === "evolution" && cfg.message_text) {
      const message = replaceVariables(cfg.message_text, vars);
      await sendEvolutionMessage(waConfig, phone, message);
      console.log(`[salla-notif] Evolution message sent → ${phone}`);
    }
  } catch (err) {
    console.error(`[salla-notif] Failed to send ${notifKey}:`, err);
  }
}

function buildVariables(event: string, data: any): Record<string, string> {
  const customer = data?.customer || {};
  const amounts = data?.amounts || data?.total || {};
  const vars: Record<string, string> = {
    customer_name: customer.first_name
      ? `${customer.first_name} ${customer.last_name || ""}`.trim()
      : customer.name || "",
    order_number: data?.reference_id ? String(data.reference_id) : String(data?.id || ""),
    total: String(amounts?.total?.amount || amounts?.amount || data?.total?.amount || data?.total || 0),
    currency: amounts?.total?.currency || amounts?.currency || data?.currency || "SAR",
    payment_method: data?.payment?.method || data?.payment?.slug || "",
    payment_status: data?.payment?.status || "",
    checkout_url: data?.urls?.checkout || data?.checkout_url || "",
    status: data?.status?.name || data?.status?.slug || "",
    tracking_number: data?.shipping?.tracking_number || data?.tracking_number || data?.shipment?.tracking_number || "",
    shipping_company: data?.shipping?.company || data?.shipment?.company?.name || data?.shipment?.courier_name || "",
    product_name: data?.name || data?.product?.name || "",
    price: String(data?.price?.amount || data?.price || ""),
    quantity: String(data?.quantity || data?.stock_quantity || ""),
    coupon_code: data?.code || data?.coupon?.code || "",
    rating: String(data?.rating || data?.stars || ""),
  };

  // Build items summary
  const items = data?.items || data?.cart?.items || [];
  if (Array.isArray(items) && items.length > 0) {
    vars.items_summary = items
      .slice(0, 5)
      .map((i: any) => `${i.name || i.product?.name || "منتج"} x${i.quantity || 1}`)
      .join("، ");
    if (items.length > 5) vars.items_summary += ` و ${items.length - 5} أخرى`;
  } else {
    vars.items_summary = "";
  }

  return vars;
}

function replaceVariables(text: string, vars: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || "");
  }
  return result;
}

async function sendMetaTemplate(
  config: any,
  phone: string,
  templateName: string,
  language: string,
  vars: Record<string, string>
) {
  const components: any[] = [];
  const bodyParams = Object.values(vars).filter(Boolean).map((v) => ({
    type: "text",
    text: v,
  }));
  if (bodyParams.length > 0) {
    components.push({ type: "body", parameters: bodyParams });
  }

  const payload = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      ...(components.length > 0 ? { components } : {}),
    },
  };

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const result = await res.json();
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result;
}

async function sendEvolutionMessage(config: any, phone: string, message: string) {
  const apiUrl = Deno.env.get("EVOLUTION_API_URL");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instanceName = config.evolution_instance_name;

  if (!apiUrl || !apiKey || !instanceName) {
    throw new Error("Evolution API not configured");
  }

  const baseUrl = apiUrl.replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      number: phone,
      text: message,
    }),
  });

  if (!res.ok) {
    const errData = await res.text();
    throw new Error(`Evolution send failed: ${errData}`);
  }
}

// ─────────────────────────────────────────────
// Order Handlers
// ─────────────────────────────────────────────
async function handleOrder(supabase: any, orgId: string, integrationId: string, data: any, event: string) {
  const orderId = String(data.id);
  const customer = data.customer || {};
  const amounts = data.amounts || data.total || {};
  const shipping = data.shipping || {};
  const address = shipping.address || customer.address || {};

  let customerId: string | null = null;
  const customerName = customer.first_name ? `${customer.first_name} ${customer.last_name || ""}`.trim() : null;
  if (customer.mobile || customer.phone) {
    const phone = normalizePhone(customer.mobile || customer.phone);
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("org_id", orgId)
      .eq("phone", phone)
      .maybeSingle();

    if (existing) {
      customerId = existing.id;
      await supabase.from("customers").update({
        name: customerName || undefined,
        email: customer.email || undefined,
        lifecycle_stage: "customer",
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      const { data: created } = await supabase
        .from("customers")
        .insert({
          org_id: orgId,
          phone,
          name: customerName,
          email: customer.email || null,
          source: "salla",
          lifecycle_stage: "customer",
        })
        .select("id")
        .single();
      if (created) customerId = created.id;
    }
  }

  const orderData: any = {
    org_id: orgId,
    external_id: orderId,
    order_number: data.reference_id ? String(data.reference_id) : orderId,
    customer_id: customerId,
    customer_name: customerName,
    customer_phone: normalizePhone(customer.mobile || customer.phone || ""),
    customer_email: customer.email || null,
    customer_city: address.city || customer.city || null,
    customer_region: address.region || address.state || null,
    customer_address: [address.street_number, address.block, address.district, address.zipcode].filter(Boolean).join(", ") || null,
    status: mapSallaOrderStatus(data.status?.slug || data.status?.name || "pending"),
    payment_status: data.payment?.status || "unpaid",
    payment_method: data.payment?.method || data.payment?.slug || null,
    subtotal: amounts.sub_total?.amount || amounts.subtotal || 0,
    discount_amount: amounts.discount?.amount || amounts.discount || 0,
    shipping_amount: amounts.shipping?.amount || amounts.shipping_cost || 0,
    tax_amount: amounts.tax?.amount || amounts.tax || 0,
    total: amounts.total?.amount || amounts.amount || 0,
    currency: amounts.total?.currency || amounts.currency || "SAR",
    source: "salla",
    updated_at: new Date().toISOString(),
  };

  const { data: existingOrder } = await supabase
    .from("orders")
    .select("id")
    .eq("org_id", orgId)
    .eq("external_id", orderId)
    .maybeSingle();

  let dbOrderId: string;
  if (existingOrder) {
    await supabase.from("orders").update(orderData).eq("id", existingOrder.id);
    dbOrderId = existingOrder.id;
  } else {
    const { data: newOrder } = await supabase.from("orders").insert(orderData).select("id").single();
    dbOrderId = newOrder?.id;
  }

  if (dbOrderId && data.items && Array.isArray(data.items)) {
    await supabase.from("order_items").delete().eq("order_id", dbOrderId);
    const items = data.items.map((item: any) => ({
      order_id: dbOrderId,
      product_name: item.name || item.product?.name || "منتج",
      product_sku: item.sku || item.product?.sku || null,
      product_id: null,
      quantity: item.quantity || 1,
      unit_price: item.price?.amount || item.price || 0,
      total_price: (item.price?.amount || item.price || 0) * (item.quantity || 1),
      metadata: {
        salla_product_id: item.product_id || item.id,
        thumbnail: item.thumbnail || item.image?.url || null,
        options: item.options || [],
      },
    }));

    if (items.length > 0) {
      for (const item of items) {
        if (item.metadata.salla_product_id) {
          const { data: prod } = await supabase
            .from("products")
            .select("id")
            .eq("org_id", orgId)
            .eq("external_id", String(item.metadata.salla_product_id))
            .maybeSingle();
          if (prod) item.product_id = prod.id;
        }
      }
      await supabase.from("order_items").insert(items);
    }
  }

  console.log(`[salla] Order ${event}: ${orderId} (${data.items?.length || 0} items) for org ${orgId}`);
}

async function handleOrderStatus(supabase: any, orgId: string, data: any) {
  const orderId = String(data.id);
  const newStatus = mapSallaOrderStatus(data.status?.slug || data.status?.name || "");
  const updateData: any = { status: newStatus, updated_at: new Date().toISOString() };
  if (newStatus === "shipped") updateData.shipped_at = new Date().toISOString();
  if (newStatus === "delivered") updateData.delivered_at = new Date().toISOString();
  if (newStatus === "cancelled") updateData.cancelled_at = new Date().toISOString();
  if (newStatus === "refunded") updateData.refunded_at = new Date().toISOString();

  await supabase.from("orders").update(updateData).eq("org_id", orgId).eq("external_id", orderId);
  console.log(`[salla] Order status updated: ${orderId} → ${newStatus}`);
}

async function handleOrderCancelled(supabase: any, orgId: string, data: any) {
  const orderId = String(data.id);
  await supabase.from("orders").update({
    status: "cancelled",
    cancelled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("org_id", orgId).eq("external_id", orderId);
  console.log(`[salla] Order cancelled: ${orderId}`);
}

async function handleOrderRefunded(supabase: any, orgId: string, data: any) {
  const orderId = String(data.id);
  await supabase.from("orders").update({
    status: "refunded",
    refunded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("org_id", orgId).eq("external_id", orderId);
  console.log(`[salla] Order refunded: ${orderId}`);
}

async function handleOrderDeleted(supabase: any, orgId: string, data: any) {
  const orderId = String(data.id);
  // Soft delete - mark as cancelled rather than removing data
  await supabase.from("orders").update({
    status: "cancelled",
    cancelled_at: new Date().toISOString(),
    notes: "تم حذف الطلب من المتجر",
    updated_at: new Date().toISOString(),
  }).eq("org_id", orgId).eq("external_id", orderId);
  console.log(`[salla] Order deleted (soft): ${orderId}`);
}

async function handleOrderPaymentUpdated(supabase: any, orgId: string, data: any) {
  const orderId = String(data.id);
  const payment = data.payment || {};
  await supabase.from("orders").update({
    payment_status: payment.status || undefined,
    payment_method: payment.method || payment.slug || undefined,
    updated_at: new Date().toISOString(),
  }).eq("org_id", orgId).eq("external_id", orderId);
  console.log(`[salla] Order payment updated: ${orderId} → ${payment.status}`);
}

async function handleOrderProductsUpdated(supabase: any, orgId: string, integrationId: string, data: any) {
  const orderId = String(data.id);
  const { data: existingOrder } = await supabase
    .from("orders")
    .select("id")
    .eq("org_id", orgId)
    .eq("external_id", orderId)
    .maybeSingle();

  if (!existingOrder) {
    console.log(`[salla] Order not found for products update: ${orderId}`);
    return;
  }

  // Update amounts if provided
  const amounts = data.amounts || data.total || {};
  if (amounts) {
    await supabase.from("orders").update({
      subtotal: amounts.sub_total?.amount || amounts.subtotal || undefined,
      total: amounts.total?.amount || amounts.amount || undefined,
      discount_amount: amounts.discount?.amount || undefined,
      updated_at: new Date().toISOString(),
    }).eq("id", existingOrder.id);
  }

  // Re-sync items if provided
  if (data.items && Array.isArray(data.items)) {
    await supabase.from("order_items").delete().eq("order_id", existingOrder.id);
    const items = data.items.map((item: any) => ({
      order_id: existingOrder.id,
      product_name: item.name || item.product?.name || "منتج",
      product_sku: item.sku || item.product?.sku || null,
      product_id: null,
      quantity: item.quantity || 1,
      unit_price: item.price?.amount || item.price || 0,
      total_price: (item.price?.amount || item.price || 0) * (item.quantity || 1),
      metadata: {
        salla_product_id: item.product_id || item.id,
        thumbnail: item.thumbnail || item.image?.url || null,
        options: item.options || [],
      },
    }));

    if (items.length > 0) {
      for (const item of items) {
        if (item.metadata.salla_product_id) {
          const { data: prod } = await supabase
            .from("products")
            .select("id")
            .eq("org_id", orgId)
            .eq("external_id", String(item.metadata.salla_product_id))
            .maybeSingle();
          if (prod) item.product_id = prod.id;
        }
      }
      await supabase.from("order_items").insert(items);
    }
  }

  console.log(`[salla] Order products updated: ${orderId}`);
}

async function handleOrderFinancialUpdate(supabase: any, orgId: string, data: any, event: string) {
  const orderId = String(data.id);
  const amounts = data.amounts || data.total || {};
  const updateData: any = { updated_at: new Date().toISOString() };

  if (event === "order.coupon.updated") {
    updateData.discount_amount = amounts.discount?.amount || amounts.discount || undefined;
  }
  if (amounts.total?.amount || amounts.amount) {
    updateData.total = amounts.total?.amount || amounts.amount;
  }
  if (amounts.sub_total?.amount || amounts.subtotal) {
    updateData.subtotal = amounts.sub_total?.amount || amounts.subtotal;
  }

  await supabase.from("orders").update(updateData).eq("org_id", orgId).eq("external_id", orderId);
  console.log(`[salla] Order financial update (${event}): ${orderId}`);
}

// ─────────────────────────────────────────────
// Shipment Handlers
// ─────────────────────────────────────────────
async function handleShipmentCreated(supabase: any, orgId: string, data: any, event: string) {
  const orderId = String(data.order_id || data.id);
  const shipment = data.shipment || data;
  const trackingNumber = shipment.tracking_number || shipment.tracking_link || null;
  const carrier = shipment.company?.name || shipment.shipping_company || null;

  await supabase.from("orders").update({
    shipment_tracking_number: trackingNumber,
    shipment_carrier: carrier,
    shipment_status: event.includes("creating") ? "processing" : "shipped",
    shipped_at: event.includes("creating") ? undefined : new Date().toISOString(),
    status: event.includes("creating") ? undefined : "shipped",
    updated_at: new Date().toISOString(),
  }).eq("org_id", orgId).eq("external_id", orderId);

  console.log(`[salla] Shipment ${event}: order ${orderId}, tracking: ${trackingNumber}`);
}

async function handleShipmentCancelled(supabase: any, orgId: string, data: any) {
  const orderId = String(data.order_id || data.id);
  await supabase.from("orders").update({
    shipment_status: "cancelled",
    updated_at: new Date().toISOString(),
  }).eq("org_id", orgId).eq("external_id", orderId);
  console.log(`[salla] Shipment cancelled: order ${orderId}`);
}

async function handleShipmentUpdated(supabase: any, orgId: string, data: any) {
  const orderId = String(data.order_id || data.id);
  const shipment = data.shipment || data;
  const trackingNumber = shipment.tracking_number || null;

  await supabase.from("orders").update({
    shipment_tracking_number: trackingNumber || undefined,
    shipment_status: shipment.status || undefined,
    updated_at: new Date().toISOString(),
  }).eq("org_id", orgId).eq("external_id", orderId);
  console.log(`[salla] Shipment updated: order ${orderId}`);
}

async function handleShipmentReturn(supabase: any, orgId: string, data: any, event: string) {
  const orderId = String(data.order_id || data.id);
  const isCancel = event.includes("cancelled");

  if (isCancel) {
    await supabase.from("orders").update({
      shipment_status: "shipped",
      updated_at: new Date().toISOString(),
    }).eq("org_id", orgId).eq("external_id", orderId);
  } else {
    await supabase.from("orders").update({
      shipment_status: "return_requested",
      updated_at: new Date().toISOString(),
    }).eq("org_id", orgId).eq("external_id", orderId);
  }
  console.log(`[salla] Shipment return ${event}: order ${orderId}`);
}

async function handleShippingAddressUpdated(supabase: any, orgId: string, data: any) {
  const orderId = String(data.id);
  const address = data.shipping?.address || data.address || {};
  await supabase.from("orders").update({
    customer_city: address.city || undefined,
    customer_region: address.region || address.state || undefined,
    customer_address: [address.street_number, address.block, address.district, address.zipcode].filter(Boolean).join(", ") || undefined,
    updated_at: new Date().toISOString(),
  }).eq("org_id", orgId).eq("external_id", orderId);
  console.log(`[salla] Shipping address updated: order ${orderId}`);
}

// ─────────────────────────────────────────────
// Customer, Cart, Product Handlers
// ─────────────────────────────────────────────
async function handleCustomer(supabase: any, orgId: string, data: any, event: string) {
  const phone = normalizePhone(data.mobile || data.phone || "");
  if (!phone) return;

  const customerData: any = {
    org_id: orgId,
    phone,
    name: data.first_name ? `${data.first_name} ${data.last_name || ""}`.trim() : null,
    email: data.email || null,
    source: "salla",
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("org_id", orgId)
    .eq("phone", phone)
    .maybeSingle();

  if (existing) {
    await supabase.from("customers").update(customerData).eq("id", existing.id);
  } else {
    customerData.lifecycle_stage = "lead";
    await supabase.from("customers").insert(customerData);
  }

  console.log(`[salla] Customer ${event}: ${phone}`);
}

async function handleAbandonedCart(supabase: any, orgId: string, integrationId: string, data: any) {
  const cartId = String(data.id);
  const customer = data.customer || {};
  const total = data.total || {};

  const cartData: any = {
    org_id: orgId,
    external_id: cartId,
    customer_name: customer.first_name ? `${customer.first_name} ${customer.last_name || ""}`.trim() : null,
    customer_phone: normalizePhone(customer.mobile || customer.phone || ""),
    customer_email: customer.email || null,
    total: total.amount || 0,
    currency: total.currency || "SAR",
    checkout_url: data.urls?.checkout || data.checkout_url || null,
    items: data.cart?.items || data.items || [],
    recovery_status: "pending",
    abandoned_at: data.created_at || new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("abandoned_carts")
    .select("id")
    .eq("org_id", orgId)
    .eq("external_id", cartId)
    .maybeSingle();

  if (existing) {
    await supabase.from("abandoned_carts").update(cartData).eq("id", existing.id);
  } else {
    await supabase.from("abandoned_carts").insert(cartData);
  }

  console.log(`[salla] Abandoned cart: ${cartId}`);
}

async function handleCartPurchased(supabase: any, orgId: string, data: any) {
  const cartId = String(data.id);
  await supabase
    .from("abandoned_carts")
    .update({ recovery_status: "recovered", recovered_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("external_id", cartId);
  console.log(`[salla] Cart purchased: ${cartId}`);
}

async function handleProduct(supabase: any, orgId: string, integrationId: string, data: any, event: string) {
  const productId = String(data.id);
  const price = data.price?.amount || data.price || 0;
  const productData: any = {
    org_id: orgId,
    external_id: productId,
    name: data.name || "",
    name_ar: data.name || "",
    price,
    currency: data.price?.currency || "SAR",
    sku: data.sku || null,
    image_url: data.main_image || data.image?.url || null,
    is_active: data.status === "sale" || data.status === "active",
    stock_quantity: data.quantity || 0,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("products")
    .select("id")
    .eq("org_id", orgId)
    .eq("external_id", productId)
    .maybeSingle();

  if (existing) {
    await supabase.from("products").update(productData).eq("id", existing.id);
  } else {
    await supabase.from("products").insert(productData);
  }

  console.log(`[salla] Product ${event}: ${productId}`);
}

async function handleProductDeleted(supabase: any, orgId: string, data: any) {
  const productId = String(data.id);
  await supabase
    .from("products")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("external_id", productId);
  console.log(`[salla] Product deleted: ${productId}`);
}

// ─────────────────────────────────────────────
// Invoice Handler (Merchant dashboard alternative for order tracking)
// ─────────────────────────────────────────────
async function handleInvoiceCreated(supabase: any, orgId: string, integrationId: string, data: any) {
  // invoice.created contains order data — use it to create/update the order
  const orderId = String(data.order_id || data.id);
  const customer = data.customer || {};
  const amounts = data.amounts || data.total || {};

  let customerId: string | null = null;
  const customerName = customer.first_name ? `${customer.first_name} ${customer.last_name || ""}`.trim() : customer.name || null;

  if (customer.mobile || customer.phone) {
    const phone = normalizePhone(customer.mobile || customer.phone);
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("org_id", orgId)
      .eq("phone", phone)
      .maybeSingle();

    if (existing) {
      customerId = existing.id;
      await supabase.from("customers").update({
        name: customerName || undefined,
        email: customer.email || undefined,
        lifecycle_stage: "customer",
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      const { data: created } = await supabase
        .from("customers")
        .insert({
          org_id: orgId,
          phone,
          name: customerName,
          email: customer.email || null,
          source: "salla",
          lifecycle_stage: "customer",
        })
        .select("id")
        .single();
      if (created) customerId = created.id;
    }
  }

  const orderData: any = {
    org_id: orgId,
    external_id: orderId,
    order_number: data.reference_id ? String(data.reference_id) : orderId,
    customer_id: customerId,
    customer_name: customerName,
    customer_phone: normalizePhone(customer.mobile || customer.phone || ""),
    customer_email: customer.email || null,
    total: amounts.total?.amount || amounts.amount || data.total || 0,
    currency: amounts.total?.currency || amounts.currency || "SAR",
    status: "pending",
    payment_status: data.payment?.status || "unpaid",
    source: "salla",
    updated_at: new Date().toISOString(),
  };

  const { data: existingOrder } = await supabase
    .from("orders")
    .select("id")
    .eq("org_id", orgId)
    .eq("external_id", orderId)
    .maybeSingle();

  if (existingOrder) {
    await supabase.from("orders").update(orderData).eq("id", existingOrder.id);
  } else {
    await supabase.from("orders").insert(orderData);
  }

  console.log(`[salla] Invoice created (order tracked): ${orderId}`);
}

// ─────────────────────────────────────────────
// Product Low Stock Handler
// ─────────────────────────────────────────────
async function handleProductLowStock(supabase: any, orgId: string, data: any) {
  const productId = String(data.id);
  const quantity = data.quantity || data.stock_quantity || 0;

  await supabase
    .from("products")
    .update({ stock_quantity: quantity, updated_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("external_id", productId);

  console.log(`[salla] Product low stock: ${productId} (qty: ${quantity})`);
}

function normalizePhone(phone: unknown): string {
  if (!phone) return "";
  const str = String(phone);
  let p = str.replace(/[\s\-\(\)]/g, "");
  if (p.startsWith("05")) p = "966" + p.slice(1);
  if (p.startsWith("+")) p = p.slice(1);
  return p;
}

function mapSallaOrderStatus(status: string): string {
  const map: Record<string, string> = {
    "created": "pending",
    "pending": "pending",
    "in_progress": "processing",
    "processing": "processing",
    "completed": "delivered",
    "delivered": "delivered",
    "shipped": "shipped",
    "under_delivery": "shipped",
    "cancelled": "cancelled",
    "refunded": "refunded",
    "restored": "pending",
  };
  return map[status.toLowerCase()] || status.toLowerCase();
}
