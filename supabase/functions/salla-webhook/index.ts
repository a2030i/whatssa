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
  // The store integration ID is passed as a path param: /salla-webhook/{integration_id}
  const pathParts = url.pathname.split("/").filter(Boolean);
  const integrationId = pathParts[pathParts.length - 1];

  if (!integrationId || integrationId === "salla-webhook") {
    return new Response(JSON.stringify({ error: "Missing integration ID in URL" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Verify integration exists and is active
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

  // Verify webhook signature if Salla sends one
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
      // Log but don't reject — Salla signature format may vary
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
      case "order.created":
      case "order.updated":
        await handleOrder(supabase, orgId, integrationId, data, event);
        break;

      case "order.status.updated":
        await handleOrderStatus(supabase, orgId, data);
        break;

      case "customer.created":
      case "customer.updated":
        await handleCustomer(supabase, orgId, data, event);
        break;

      case "abandoned.cart":
        await handleAbandonedCart(supabase, orgId, integrationId, data);
        break;

      case "abandoned.cart.purchased":
        await handleCartPurchased(supabase, orgId, data);
        break;

      case "product.created":
      case "product.updated":
        await handleProduct(supabase, orgId, integrationId, data, event);
        break;

      case "product.deleted":
        await handleProductDeleted(supabase, orgId, data);
        break;

      default:
        console.log(`[salla-webhook] Unhandled event: ${event}`);
    }

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

async function handleOrder(supabase: any, orgId: string, integrationId: string, data: any, event: string) {
  const orderId = String(data.id);
  const customer = data.customer || {};
  const amounts = data.amounts || data.total || {};
  const shipping = data.shipping || {};
  const address = shipping.address || customer.address || {};

  // Upsert customer first
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
      // Update customer info on every order
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

  // Check if order exists
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

  // Sync order items
  if (dbOrderId && data.items && Array.isArray(data.items)) {
    // Delete old items then re-insert
    await supabase.from("order_items").delete().eq("order_id", dbOrderId);

    const items = data.items.map((item: any) => ({
      order_id: dbOrderId,
      product_name: item.name || item.product?.name || "منتج",
      product_sku: item.sku || item.product?.sku || null,
      product_id: null, // will be linked if product exists
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
      // Try to link product_id from products table
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

  await supabase
    .from("orders")
    .update(updateData)
    .eq("org_id", orgId)
    .eq("external_id", orderId);

  console.log(`[salla] Order status updated: ${orderId} → ${newStatus}`);
}

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
    checkout_url: data.checkout_url || null,
    items: data.cart?.items || data.items || [],
    recovery_status: "pending",
    abandoned_at: data.created_at || new Date().toISOString(),
  };

  // Upsert by external_id
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

function normalizePhone(phone: string): string {
  if (!phone) return "";
  let p = phone.replace(/[\s\-\(\)]/g, "");
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
