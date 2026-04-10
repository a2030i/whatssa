import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────
// Unified Store Webhook — Zid, WooCommerce, Shopify, Generic
// ─────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const integrationId = pathParts[pathParts.length - 1];

  if (!integrationId || integrationId === "store-webhook") {
    return new Response(JSON.stringify({ error: "Missing integration ID" }), {
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
    return new Response(JSON.stringify({ error: "Integration not found or inactive" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const platform = integration.platform;
  const orgId = integration.org_id;

  // Verify webhook signature per platform
  const bodyText = await req.text();
  const signatureValid = await verifySignature(req, bodyText, integration, platform);
  if (!signatureValid) {
    console.warn(`[store-webhook] Invalid signature for ${platform} integration: ${integrationId}`);
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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

  console.log(`[store-webhook] platform=${platform} org=${orgId}`);

  try {
    // Normalize event data based on platform
    const normalized = normalizeEvent(platform, body, req.headers);

    if (!normalized) {
      console.log(`[store-webhook] Unhandled event for ${platform}`);
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process normalized event
    await processEvent(supabase, orgId, integrationId, platform, normalized);

    // Send event notification if configured
    await sendEventNotification(supabase, integration, normalized);

    return new Response(JSON.stringify({ success: true, event: normalized.event }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[store-webhook] Error:`, err);
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
// Types
// ─────────────────────────────────────────────
interface NormalizedEvent {
  event: string; // order.created, order.updated, order.status_updated, customer.created, customer.updated, cart.abandoned, product.created, product.updated, product.deleted
  order?: NormalizedOrder;
  customer?: NormalizedCustomer;
  cart?: NormalizedCart;
  product?: NormalizedProduct;
  raw?: any;
}

interface NormalizedOrder {
  external_id: string;
  order_number: string;
  customer_name: string | null;
  customer_phone: string;
  customer_email: string | null;
  customer_city: string | null;
  customer_region: string | null;
  customer_address: string | null;
  status: string;
  payment_status: string;
  payment_method: string | null;
  subtotal: number;
  discount_amount: number;
  shipping_amount: number;
  tax_amount: number;
  total: number;
  currency: string;
  items: NormalizedOrderItem[];
}

interface NormalizedOrderItem {
  product_name: string;
  product_sku: string | null;
  external_product_id: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  thumbnail: string | null;
}

interface NormalizedCustomer {
  name: string | null;
  phone: string;
  email: string | null;
}

interface NormalizedCart {
  external_id: string;
  customer_name: string | null;
  customer_phone: string;
  customer_email: string | null;
  total: number;
  currency: string;
  checkout_url: string | null;
  items: any[];
}

interface NormalizedProduct {
  external_id: string;
  name: string;
  price: number;
  currency: string;
  sku: string | null;
  image_url: string | null;
  is_active: boolean;
  stock_quantity: number;
}

// ─────────────────────────────────────────────
// Signature Verification
// ─────────────────────────────────────────────
async function verifySignature(req: Request, body: string, integration: any, platform: string): Promise<boolean> {
  const secret = integration.webhook_secret;
  if (!secret) return true;

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const computed = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");

    if (platform === "shopify") {
      const shopifySig = req.headers.get("x-shopify-hmac-sha256") || "";
      const computedBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
      return computedBase64 === shopifySig;
    } else if (platform === "woocommerce") {
      const wooSig = req.headers.get("x-wc-webhook-signature") || "";
      const computedBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
      return computedBase64 === wooSig;
    } else if (platform === "zid") {
      const zidSig = req.headers.get("x-zid-signature") || req.headers.get("x-webhook-signature") || "";
      return computed === zidSig;
    }
  } catch (e) {
    console.warn(`[store-webhook] Signature verification error:`, e);
  }
  return true; // Don't block on signature failure for now
}

// ─────────────────────────────────────────────
// Event Normalization per Platform
// ─────────────────────────────────────────────
function normalizeEvent(platform: string, body: any, headers: Headers): NormalizedEvent | null {
  switch (platform) {
    case "zid": return normalizeZid(body);
    case "woocommerce": return normalizeWooCommerce(body, headers);
    case "shopify": return normalizeShopify(body, headers);
    case "generic": return normalizeGeneric(body);
    default: return null;
  }
}

// ── Zid ──
function normalizeZid(body: any): NormalizedEvent | null {
  const event = body.event || body.type;
  if (!event) return null;

  const data = body.data || body;
  const eventMap: Record<string, string> = {
    "order.create": "order.created",
    "order.update": "order.updated",
    "order.status.update": "order.status_updated",
    "customer.create": "customer.created",
    "customer.update": "customer.updated",
    "abandoned_cart.create": "cart.abandoned",
    "product.create": "product.created",
    "product.update": "product.updated",
    "product.delete": "product.deleted",
  };

  const normalized = eventMap[event];
  if (!normalized) return null;

  if (normalized.startsWith("order")) {
    const customer = data.customer || {};
    const items = (data.order_products || data.items || []).map((i: any) => ({
      product_name: i.name || i.product_name || "منتج",
      product_sku: i.sku || null,
      external_product_id: i.product_id ? String(i.product_id) : null,
      quantity: i.quantity || 1,
      unit_price: parseFloat(i.price || i.unit_price || 0),
      total_price: parseFloat(i.total || i.price || 0) * (i.quantity || 1),
      thumbnail: i.image || i.thumbnail || null,
    }));

    return {
      event: normalized,
      order: {
        external_id: String(data.id),
        order_number: data.order_number || String(data.id),
        customer_name: customer.name || null,
        customer_phone: normalizePhone(customer.mobile || customer.phone || ""),
        customer_email: customer.email || null,
        customer_city: customer.city?.name || customer.city || null,
        customer_region: customer.region || null,
        customer_address: customer.address || null,
        status: mapOrderStatus(data.status?.slug || data.status || "pending"),
        payment_status: data.payment_status || "unpaid",
        payment_method: data.payment_method || null,
        subtotal: parseFloat(data.sub_total || 0),
        discount_amount: parseFloat(data.discount || 0),
        shipping_amount: parseFloat(data.shipping_cost || data.shipping || 0),
        tax_amount: parseFloat(data.tax || 0),
        total: parseFloat(data.total || data.grand_total || 0),
        currency: data.currency || "SAR",
        items,
      },
      raw: data,
    };
  }

  if (normalized.startsWith("customer")) {
    return {
      event: normalized,
      customer: {
        name: data.name || null,
        phone: normalizePhone(data.mobile || data.phone || ""),
        email: data.email || null,
      },
      raw: data,
    };
  }

  if (normalized === "cart.abandoned") {
    return {
      event: normalized,
      cart: {
        external_id: String(data.id),
        customer_name: data.customer?.name || null,
        customer_phone: normalizePhone(data.customer?.mobile || data.customer?.phone || ""),
        customer_email: data.customer?.email || null,
        total: parseFloat(data.total || 0),
        currency: data.currency || "SAR",
        checkout_url: data.url || data.checkout_url || null,
        items: data.products || data.items || [],
      },
      raw: data,
    };
  }

  if (normalized.startsWith("product")) {
    return {
      event: normalized,
      product: {
        external_id: String(data.id),
        name: data.name || "",
        price: parseFloat(data.price || 0),
        currency: data.currency || "SAR",
        sku: data.sku || null,
        image_url: data.image?.url || data.images?.[0]?.url || null,
        is_active: data.status === "active",
        stock_quantity: data.quantity || 0,
      },
      raw: data,
    };
  }

  return null;
}

// ── WooCommerce ──
function normalizeWooCommerce(body: any, headers: Headers): NormalizedEvent | null {
  const topic = headers.get("x-wc-webhook-topic") || "";
  if (!topic) return null;

  const eventMap: Record<string, string> = {
    "order.created": "order.created",
    "order.updated": "order.updated",
    "order.deleted": "order.status_updated",
    "customer.created": "customer.created",
    "customer.updated": "customer.updated",
    "product.created": "product.created",
    "product.updated": "product.updated",
    "product.deleted": "product.deleted",
  };

  const normalized = eventMap[topic];
  if (!normalized) return null;

  if (normalized.startsWith("order")) {
    const billing = body.billing || {};
    const shipping = body.shipping || {};
    const items = (body.line_items || []).map((i: any) => ({
      product_name: i.name || "Product",
      product_sku: i.sku || null,
      external_product_id: i.product_id ? String(i.product_id) : null,
      quantity: i.quantity || 1,
      unit_price: parseFloat(i.price || 0),
      total_price: parseFloat(i.total || 0),
      thumbnail: i.image?.src || null,
    }));

    return {
      event: normalized,
      order: {
        external_id: String(body.id),
        order_number: body.number ? String(body.number) : String(body.id),
        customer_name: [billing.first_name, billing.last_name].filter(Boolean).join(" ") || null,
        customer_phone: normalizePhone(billing.phone || ""),
        customer_email: billing.email || null,
        customer_city: billing.city || shipping.city || null,
        customer_region: billing.state || shipping.state || null,
        customer_address: [billing.address_1, billing.address_2].filter(Boolean).join(", ") || null,
        status: mapOrderStatus(body.status || "pending"),
        payment_status: body.date_paid ? "paid" : "unpaid",
        payment_method: body.payment_method_title || body.payment_method || null,
        subtotal: parseFloat(body.subtotal || 0) || items.reduce((s: number, i: any) => s + i.total_price, 0),
        discount_amount: parseFloat(body.discount_total || 0),
        shipping_amount: parseFloat(body.shipping_total || 0),
        tax_amount: parseFloat(body.total_tax || 0),
        total: parseFloat(body.total || 0),
        currency: (body.currency || "SAR").toUpperCase(),
        items,
      },
      raw: body,
    };
  }

  if (normalized.startsWith("customer")) {
    return {
      event: normalized,
      customer: {
        name: [body.first_name, body.last_name].filter(Boolean).join(" ") || body.username || null,
        phone: normalizePhone(body.billing?.phone || ""),
        email: body.email || null,
      },
      raw: body,
    };
  }

  if (normalized.startsWith("product")) {
    return {
      event: normalized,
      product: {
        external_id: String(body.id),
        name: body.name || "",
        price: parseFloat(body.price || body.regular_price || 0),
        currency: "SAR",
        sku: body.sku || null,
        image_url: body.images?.[0]?.src || null,
        is_active: body.status === "publish",
        stock_quantity: body.stock_quantity || 0,
      },
      raw: body,
    };
  }

  return null;
}

// ── Shopify ──
function normalizeShopify(body: any, headers: Headers): NormalizedEvent | null {
  const topic = headers.get("x-shopify-topic") || "";
  if (!topic) return null;

  const eventMap: Record<string, string> = {
    "orders/create": "order.created",
    "orders/updated": "order.updated",
    "orders/cancelled": "order.status_updated",
    "orders/fulfilled": "order.status_updated",
    "customers/create": "customer.created",
    "customers/update": "customer.updated",
    "products/create": "product.created",
    "products/update": "product.updated",
    "products/delete": "product.deleted",
    "carts/create": "cart.abandoned",
    "carts/update": "cart.abandoned",
    "checkouts/create": "cart.abandoned",
    "checkouts/update": "cart.abandoned",
  };

  const normalized = eventMap[topic];
  if (!normalized) return null;

  if (normalized.startsWith("order")) {
    const customer = body.customer || {};
    const shippingAddr = body.shipping_address || {};
    const items = (body.line_items || []).map((i: any) => ({
      product_name: i.title || i.name || "Product",
      product_sku: i.sku || null,
      external_product_id: i.product_id ? String(i.product_id) : null,
      quantity: i.quantity || 1,
      unit_price: parseFloat(i.price || 0),
      total_price: parseFloat(i.price || 0) * (i.quantity || 1),
      thumbnail: null,
    }));

    let status = "pending";
    if (topic === "orders/cancelled") status = "cancelled";
    else if (topic === "orders/fulfilled") status = "delivered";
    else status = mapOrderStatus(body.financial_status || body.fulfillment_status || "pending");

    return {
      event: normalized,
      order: {
        external_id: String(body.id),
        order_number: body.order_number ? String(body.order_number) : body.name || String(body.id),
        customer_name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null,
        customer_phone: normalizePhone(customer.phone || shippingAddr.phone || ""),
        customer_email: customer.email || body.email || null,
        customer_city: shippingAddr.city || null,
        customer_region: shippingAddr.province || null,
        customer_address: [shippingAddr.address1, shippingAddr.address2].filter(Boolean).join(", ") || null,
        status,
        payment_status: body.financial_status || "unpaid",
        payment_method: body.gateway || body.payment_gateway_names?.[0] || null,
        subtotal: parseFloat(body.subtotal_price || 0),
        discount_amount: parseFloat(body.total_discounts || 0),
        shipping_amount: body.shipping_lines?.reduce((s: number, l: any) => s + parseFloat(l.price || 0), 0) || 0,
        tax_amount: parseFloat(body.total_tax || 0),
        total: parseFloat(body.total_price || 0),
        currency: (body.currency || "SAR").toUpperCase(),
        items,
      },
      raw: body,
    };
  }

  if (normalized.startsWith("customer")) {
    return {
      event: normalized,
      customer: {
        name: [body.first_name, body.last_name].filter(Boolean).join(" ") || null,
        phone: normalizePhone(body.phone || body.default_address?.phone || ""),
        email: body.email || null,
      },
      raw: body,
    };
  }

  if (normalized === "cart.abandoned") {
    const customer = body.customer || {};
    return {
      event: normalized,
      cart: {
        external_id: String(body.id || body.token),
        customer_name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || body.email || null,
        customer_phone: normalizePhone(customer.phone || body.phone || body.shipping_address?.phone || ""),
        customer_email: body.email || customer.email || null,
        total: parseFloat(body.total_price || body.subtotal_price || 0),
        currency: (body.currency || "SAR").toUpperCase(),
        checkout_url: body.abandoned_checkout_url || null,
        items: body.line_items || [],
      },
      raw: body,
    };
  }

  if (normalized.startsWith("product")) {
    return {
      event: normalized,
      product: {
        external_id: String(body.id),
        name: body.title || "",
        price: parseFloat(body.variants?.[0]?.price || 0),
        currency: "SAR",
        sku: body.variants?.[0]?.sku || null,
        image_url: body.image?.src || body.images?.[0]?.src || null,
        is_active: body.status === "active",
        stock_quantity: body.variants?.reduce((s: number, v: any) => s + (v.inventory_quantity || 0), 0) || 0,
      },
      raw: body,
    };
  }

  return null;
}

// ── Generic ──
function normalizeGeneric(body: any): NormalizedEvent | null {
  // Generic expects a pre-formatted payload:
  // { event: "order.created|customer.created|...", data: { ... } }
  const event = body.event;
  const data = body.data || body;
  if (!event) return null;

  if (event.startsWith("order")) {
    return {
      event,
      order: {
        external_id: String(data.id || data.order_id || ""),
        order_number: data.order_number || String(data.id || ""),
        customer_name: data.customer_name || null,
        customer_phone: normalizePhone(data.customer_phone || ""),
        customer_email: data.customer_email || null,
        customer_city: data.city || null,
        customer_region: data.region || null,
        customer_address: data.address || null,
        status: mapOrderStatus(data.status || "pending"),
        payment_status: data.payment_status || "unpaid",
        payment_method: data.payment_method || null,
        subtotal: parseFloat(data.subtotal || 0),
        discount_amount: parseFloat(data.discount || 0),
        shipping_amount: parseFloat(data.shipping || 0),
        tax_amount: parseFloat(data.tax || 0),
        total: parseFloat(data.total || 0),
        currency: data.currency || "SAR",
        items: (data.items || []).map((i: any) => ({
          product_name: i.name || "Product",
          product_sku: i.sku || null,
          external_product_id: i.product_id ? String(i.product_id) : null,
          quantity: i.quantity || 1,
          unit_price: parseFloat(i.price || 0),
          total_price: parseFloat(i.price || 0) * (i.quantity || 1),
          thumbnail: i.image || null,
        })),
      },
      raw: data,
    };
  }

  if (event.startsWith("customer")) {
    return {
      event,
      customer: {
        name: data.name || null,
        phone: normalizePhone(data.phone || ""),
        email: data.email || null,
      },
      raw: data,
    };
  }

  if (event.startsWith("cart") || event.includes("abandoned")) {
    return {
      event: "cart.abandoned",
      cart: {
        external_id: String(data.id || ""),
        customer_name: data.customer_name || null,
        customer_phone: normalizePhone(data.customer_phone || ""),
        customer_email: data.customer_email || null,
        total: parseFloat(data.total || 0),
        currency: data.currency || "SAR",
        checkout_url: data.checkout_url || null,
        items: data.items || [],
      },
      raw: data,
    };
  }

  if (event.startsWith("product")) {
    return {
      event,
      product: {
        external_id: String(data.id || ""),
        name: data.name || "",
        price: parseFloat(data.price || 0),
        currency: data.currency || "SAR",
        sku: data.sku || null,
        image_url: data.image || null,
        is_active: data.is_active !== false,
        stock_quantity: data.stock || 0,
      },
      raw: data,
    };
  }

  return null;
}

// ─────────────────────────────────────────────
// Process Normalized Event
// ─────────────────────────────────────────────
async function processEvent(supabase: any, orgId: string, integrationId: string, platform: string, evt: NormalizedEvent) {
  switch (evt.event) {
    case "order.created":
    case "order.updated":
      if (evt.order) await upsertOrder(supabase, orgId, platform, evt.order);
      break;
    case "order.status_updated":
      if (evt.order) await updateOrderStatus(supabase, orgId, evt.order);
      break;
    case "customer.created":
    case "customer.updated":
      if (evt.customer) await upsertCustomer(supabase, orgId, platform, evt.customer);
      break;
    case "cart.abandoned":
      if (evt.cart) await upsertAbandonedCart(supabase, orgId, platform, evt.cart);
      break;
    case "product.created":
    case "product.updated":
      if (evt.product) await upsertProduct(supabase, orgId, platform, evt.product);
      break;
    case "product.deleted":
      if (evt.product) await deactivateProduct(supabase, orgId, evt.product.external_id);
      break;
  }
}

async function upsertOrder(supabase: any, orgId: string, platform: string, order: NormalizedOrder) {
  let customerId: string | null = null;
  if (order.customer_phone) {
    const { data: existing } = await supabase.from("customers").select("id").eq("org_id", orgId).eq("phone", order.customer_phone).maybeSingle();
    if (existing) {
      customerId = existing.id;
      await supabase.from("customers").update({ name: order.customer_name, email: order.customer_email, lifecycle_stage: "customer", updated_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      const { data: created } = await supabase.from("customers").insert({ org_id: orgId, phone: order.customer_phone, name: order.customer_name, email: order.customer_email, source: platform, lifecycle_stage: "customer" }).select("id").single();
      if (created) customerId = created.id;
    }
  }

  const orderData: any = {
    org_id: orgId, external_id: order.external_id, order_number: order.order_number,
    customer_id: customerId, customer_name: order.customer_name, customer_phone: order.customer_phone,
    customer_email: order.customer_email, customer_city: order.customer_city, customer_region: order.customer_region,
    customer_address: order.customer_address, status: order.status, payment_status: order.payment_status,
    payment_method: order.payment_method, subtotal: order.subtotal, discount_amount: order.discount_amount,
    shipping_amount: order.shipping_amount, tax_amount: order.tax_amount, total: order.total,
    currency: order.currency, source: platform, updated_at: new Date().toISOString(),
  };

  const { data: existingOrder } = await supabase.from("orders").select("id").eq("org_id", orgId).eq("external_id", order.external_id).maybeSingle();
  let dbOrderId: string;
  if (existingOrder) {
    await supabase.from("orders").update(orderData).eq("id", existingOrder.id);
    dbOrderId = existingOrder.id;
  } else {
    const { data: newOrder } = await supabase.from("orders").insert(orderData).select("id").single();
    dbOrderId = newOrder?.id;
  }

  if (dbOrderId && order.items.length > 0) {
    await supabase.from("order_items").delete().eq("order_id", dbOrderId);
    const items = order.items.map(i => {
      const item: any = { order_id: dbOrderId, product_name: i.product_name, product_sku: i.product_sku, quantity: i.quantity, unit_price: i.unit_price, total_price: i.total_price, metadata: { external_product_id: i.external_product_id, thumbnail: i.thumbnail } };
      return item;
    });
    await supabase.from("order_items").insert(items);
  }

  console.log(`[store-webhook] Order upserted: ${order.external_id} (${order.items.length} items)`);
}

async function updateOrderStatus(supabase: any, orgId: string, order: NormalizedOrder) {
  const updateData: any = { status: order.status, updated_at: new Date().toISOString() };
  if (order.status === "shipped") updateData.shipped_at = new Date().toISOString();
  if (order.status === "delivered") updateData.delivered_at = new Date().toISOString();
  if (order.status === "cancelled") updateData.cancelled_at = new Date().toISOString();
  if (order.status === "refunded") updateData.refunded_at = new Date().toISOString();

  await supabase.from("orders").update(updateData).eq("org_id", orgId).eq("external_id", order.external_id);
}

async function upsertCustomer(supabase: any, orgId: string, platform: string, customer: NormalizedCustomer) {
  if (!customer.phone) return;
  const { data: existing } = await supabase.from("customers").select("id").eq("org_id", orgId).eq("phone", customer.phone).maybeSingle();
  if (existing) {
    await supabase.from("customers").update({ name: customer.name, email: customer.email, updated_at: new Date().toISOString() }).eq("id", existing.id);
  } else {
    await supabase.from("customers").insert({ org_id: orgId, phone: customer.phone, name: customer.name, email: customer.email, source: platform, lifecycle_stage: "lead" });
  }
}

async function upsertAbandonedCart(supabase: any, orgId: string, platform: string, cart: NormalizedCart) {
  const cartData: any = {
    org_id: orgId, external_id: cart.external_id, customer_name: cart.customer_name,
    customer_phone: cart.customer_phone, customer_email: cart.customer_email,
    total: cart.total, currency: cart.currency, checkout_url: cart.checkout_url,
    items: cart.items, recovery_status: "pending", abandoned_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase.from("abandoned_carts").select("id").eq("org_id", orgId).eq("external_id", cart.external_id).maybeSingle();
  if (existing) {
    await supabase.from("abandoned_carts").update(cartData).eq("id", existing.id);
  } else {
    await supabase.from("abandoned_carts").insert(cartData);
  }
}

async function upsertProduct(supabase: any, orgId: string, platform: string, product: NormalizedProduct) {
  const productData: any = {
    org_id: orgId, external_id: product.external_id, name: product.name, name_ar: product.name,
    price: product.price, currency: product.currency, sku: product.sku,
    image_url: product.image_url, is_active: product.is_active, stock_quantity: product.stock_quantity,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase.from("products").select("id").eq("org_id", orgId).eq("external_id", product.external_id).maybeSingle();
  if (existing) {
    await supabase.from("products").update(productData).eq("id", existing.id);
  } else {
    await supabase.from("products").insert(productData);
  }
}

async function deactivateProduct(supabase: any, orgId: string, externalId: string) {
  await supabase.from("products").update({ is_active: false, updated_at: new Date().toISOString() }).eq("org_id", orgId).eq("external_id", externalId);
}

// ─────────────────────────────────────────────
// Event Notification Sender (reused from salla pattern)
// ─────────────────────────────────────────────
async function sendEventNotification(supabase: any, integration: any, evt: NormalizedEvent) {
  const metadata = integration.metadata || {};
  const notifConfigs = metadata.event_notifications || {};

  // Map normalized events to notification keys
  // For status_updated events, derive key from order status (shipped, delivered, cancelled, refunded)
  let notifKey = evt.event;
  if (evt.event === "order.status_updated" && evt.order) {
    const statusMap: Record<string, string> = {
      shipped: "order.shipped",
      delivered: "order.delivered",
      cancelled: "order.cancelled",
      refunded: "order.refunded",
    };
    notifKey = statusMap[evt.order.status] || evt.event;
  }

  // Try multiple keys for matching
  const keysToTry = [notifKey, evt.event];

  // Also check for unpaid order notification
  if (evt.event === "order.created" && evt.order?.payment_status === "unpaid") {
    keysToTry.unshift("order.created_unpaid");
  }

  let cfg: any = null;
  for (const key of keysToTry) {
    if (notifConfigs[key]?.enabled && notifConfigs[key]?.channel_id) {
      cfg = notifConfigs[key];
      break;
    }
  }
  if (!cfg) return;

  const { data: waConfig } = await supabase
    .from("whatsapp_config")
    .select("*")
    .eq("id", cfg.channel_id)
    .eq("is_connected", true)
    .maybeSingle();

  if (!waConfig) return;

  const phone = evt.order?.customer_phone || evt.customer?.phone || evt.cart?.customer_phone || "";
  if (!phone) return;

  const itemsSummary = evt.order?.items?.map(i => `${i.product_name} x${i.quantity}`).join("، ") || "";
  const vars: Record<string, string> = {
    customer_name: evt.order?.customer_name || evt.customer?.name || evt.cart?.customer_name || "",
    order_number: evt.order?.order_number || "",
    total: String(evt.order?.total || evt.cart?.total || 0),
    currency: evt.order?.currency || evt.cart?.currency || "SAR",
    checkout_url: evt.cart?.checkout_url || "",
    payment_method: evt.order?.payment_method || "",
    items_summary: itemsSummary,
    status: evt.order?.status || "",
  };

  const channelType = waConfig.channel_type || "meta_api";

  try {
    if (channelType === "meta_api" && cfg.template_name) {
      const bodyParams = Object.values(vars).filter(Boolean).map(v => ({ type: "text", text: v }));
      const components: any[] = bodyParams.length > 0 ? [{ type: "body", parameters: bodyParams }] : [];
      const res = await fetch(`https://graph.facebook.com/v21.0/${waConfig.phone_number_id}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${waConfig.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "template", template: { name: cfg.template_name, language: { code: cfg.template_language || "ar" }, ...(components.length > 0 ? { components } : {}) } }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error.message);
    } else if (channelType === "evolution" && cfg.message_text) {
      // Check rate limit before sending via Evolution
      const rateSettings = waConfig.rate_limit_settings;
      if (rateSettings?.enabled) {
        const { data: limitCheck } = await supabase.rpc("check_channel_rate_limit", { _channel_id: waConfig.id });
        if (limitCheck && !limitCheck.allowed) {
          console.warn(`[store-webhook] Rate limit hit for channel ${waConfig.id}: ${limitCheck.reason}`);
          return; // Skip sending, don't block webhook processing
        }
      }

      let message = cfg.message_text;
      for (const [key, value] of Object.entries(vars)) {
        message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || "");
      }
      const apiUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
      const apiKey = Deno.env.get("EVOLUTION_API_KEY");
      if (apiUrl && apiKey && waConfig.evolution_instance_name) {
        await fetch(`${apiUrl}/message/sendText/${waConfig.evolution_instance_name}`, {
          method: "POST",
          headers: { apikey: apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ number: phone, text: message }),
        });
        // Log send for rate tracking
        await supabase.from("channel_send_log").insert({
          channel_id: waConfig.id,
          org_id: integration.org_id,
          message_type: "store_notification",
          recipient_phone: phone,
        });
      }
    }
  } catch (err) {
    console.error(`[store-webhook] Notification failed:`, err);
  }
}

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────
function normalizePhone(phone: string): string {
  if (!phone) return "";
  let p = phone.replace(/[\s\-\(\)]/g, "");
  if (p.startsWith("05")) p = "966" + p.slice(1);
  if (p.startsWith("+")) p = p.slice(1);
  return p;
}

function mapOrderStatus(status: string): string {
  const s = status.toLowerCase().replace(/-/g, "_");
  const map: Record<string, string> = {
    created: "pending", pending: "pending", "pending-payment": "pending", "on-hold": "pending",
    in_progress: "processing", processing: "processing",
    completed: "delivered", delivered: "delivered", fulfilled: "delivered",
    shipped: "shipped", under_delivery: "shipped",
    cancelled: "cancelled", failed: "cancelled", refunded: "refunded",
    paid: "processing", authorized: "processing",
  };
  return map[s] || s;
}
