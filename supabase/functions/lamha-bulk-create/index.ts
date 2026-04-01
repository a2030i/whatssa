import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";

// ─────────────────────────────────────────────
// Lamha Bulk Create — send multiple orders to Lamha
// Accepts array of order_ids, processes sequentially
// with rate limiting (Lamha: 60 req/min)
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

  const { order_ids, org_id, create_shipment = true } = body;

  if (!org_id || !Array.isArray(order_ids) || order_ids.length === 0) {
    return new Response(JSON.stringify({ error: "org_id and order_ids[] required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (order_ids.length > 50) {
    return new Response(JSON.stringify({ error: "Maximum 50 orders per batch" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Get Lamha integration config
    const { data: integration } = await supabase
      .from("store_integrations")
      .select("*")
      .eq("org_id", org_id)
      .eq("platform", "lamha")
      .eq("is_active", true)
      .maybeSingle();

    if (!integration) {
      return new Response(JSON.stringify({ error: "Lamha integration not found" }), {
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

    // Get org info
    const { data: org } = await supabase
      .from("organizations")
      .select("name, settings")
      .eq("id", org_id)
      .single();

    // Get all orders
    const { data: orders } = await supabase
      .from("orders")
      .select("*")
      .in("id", order_ids)
      .eq("org_id", org_id);

    if (!orders || orders.length === 0) {
      return new Response(JSON.stringify({ error: "No orders found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all order items in one query
    const { data: allItems } = await supabase
      .from("order_items")
      .select("*")
      .in("order_id", order_ids);

    const itemsByOrder: Record<string, any[]> = {};
    for (const item of (allItems || [])) {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      itemsByOrder[item.order_id].push(item);
    }

    const shipperConfig = metadata.shipper || {};
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const callbackUrl = `${supabaseUrl}/functions/v1/lamha-webhook`;

    const results: any[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const order of orders) {
      // Skip already shipped orders
      if (order.shipment_carrier === "lamha" && order.shipment_status && order.shipment_status !== "creation_failed") {
        results.push({
          order_id: order.id,
          status: "skipped",
          reason: "Already sent to Lamha",
        });
        continue;
      }

      const items = itemsByOrder[order.id] || [];

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
        create_shippment: create_shipment,
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
        items: items.length > 0
          ? items.map((item: any) => ({
              name: item.product_name,
              quantity: item.quantity || 1,
              Sku: item.product_sku || "",
              amount: String(item.unit_price || 0),
              weight: String(metadata.default_weight || "0.5"),
            }))
          : [{
              name: "طلب",
              quantity: 1,
              Sku: "",
              amount: String(order.total || 0),
              weight: String(metadata.default_weight || "0.5"),
            }],
        callback_url: callbackUrl,
        callback_pdf_url: "",
        carrier_id: String(metadata.carrier_id || ""),
        coupon: "",
        parcels: String(items.reduce((sum: number, i: any) => sum + (i.quantity || 1), 0) || 1),
      };

      try {
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

        if (lamhaRes.ok && lamhaData.success) {
          const lamhaOrderId = String(lamhaData.order_id || "");
          const trackingNumber = lamhaData.tracking_number || lamhaData.shipment?.tracking_number || "";

          const updateData: any = {
            shipment_carrier: "lamha",
            updated_at: new Date().toISOString(),
          };
          if (create_shipment) {
            updateData.shipment_status = "new";
            if (trackingNumber) updateData.shipment_tracking_number = trackingNumber;
          }

          await supabase.from("orders").update(updateData).eq("id", order.id);

          await supabase.from("shipment_events").insert({
            order_id: order.id,
            org_id,
            status_key: create_shipment ? "created" : "order_only",
            status_label: create_shipment ? "تم إنشاء الشحنة" : "تم إنشاء الطلب في لمحة",
            source: "lamha",
            tracking_number: trackingNumber || null,
            carrier: "lamha",
            metadata: { lamha_order_id: lamhaOrderId, bulk: true },
          });

          successCount++;
          results.push({
            order_id: order.id,
            status: "success",
            lamha_order_id: lamhaOrderId,
            tracking_number: trackingNumber,
          });
        } else {
          failCount++;

          await supabase.from("shipment_events").insert({
            order_id: order.id,
            org_id,
            status_key: "creation_failed",
            status_label: "فشل إنشاء الشحنة",
            source: "lamha",
            metadata: { error: lamhaData, bulk: true },
          });

          results.push({
            order_id: order.id,
            status: "failed",
            error: lamhaData.msg || "API error",
          });
        }
      } catch (err: any) {
        failCount++;
        results.push({
          order_id: order.id,
          status: "failed",
          error: err.message || "Connection error",
        });
      }

      // Rate limiting: 1 second delay between requests
      if (orders.indexOf(order) < orders.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    console.log(`[lamha-bulk] org=${org_id} success=${successCount} failed=${failCount} total=${orders.length}`);

    return new Response(JSON.stringify({
      success: true,
      total: orders.length,
      succeeded: successCount,
      failed: failCount,
      results,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(`[lamha-bulk] Error:`, err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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
