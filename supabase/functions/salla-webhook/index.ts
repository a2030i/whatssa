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

  // Map order.status.updated to specific sub-events
  let notifKey = event;
  if (event === "order.status.updated") {
    const statusSlug = data?.status?.slug || data?.status?.name || "";
    const mapped = mapSallaOrderStatus(statusSlug);
    if (mapped === "shipped") notifKey = "order.shipped";
    else if (mapped === "delivered") notifKey = "order.delivered";
    else if (mapped === "cancelled") notifKey = "order.cancelled";
    else if (mapped === "refunded") notifKey = "order.refunded";
    else return; // No notification for other statuses
  }

  const cfg = notifConfigs[notifKey];
  if (!cfg?.enabled || !cfg?.channel_id) return;

  // Get the WhatsApp config for the channel
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

  // Get recipient phone
  const customer = data?.customer || {};
  const phone = normalizePhone(customer.mobile || customer.phone || data?.customer_phone || "");
  if (!phone) {
    console.log(`[salla-notif] No phone for event ${notifKey}`);
    return;
  }

  // Build variables
  const vars = buildVariables(notifKey, data);
  const channelType = waConfig.channel_type || "meta_api";

  try {
    if (channelType === "meta_api" && cfg.template_name) {
      // Send via Meta template
      await sendMetaTemplate(waConfig, phone, cfg.template_name, cfg.template_language || "ar", vars);
      console.log(`[salla-notif] Meta template sent: ${cfg.template_name} → ${phone}`);
    } else if (channelType === "evolution" && cfg.message_text) {
      // Send via Evolution with variable replacement
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
    checkout_url: data?.checkout_url || "",
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
  // Build body parameters from variables in order
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
// Existing handlers (unchanged)
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
