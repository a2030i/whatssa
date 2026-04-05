import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function getUserContext(req: Request, requestedChannelId?: string, requestedPhoneNumberId?: string) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return { error: json({ error: "Unauthorized" }, 401) };

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: userError } = await adminClient.auth.getUser(authorization.replace("Bearer ", ""));
  if (userError || !user) return { error: json({ error: "Unauthorized" }, 401) };

  const { data: profile } = await adminClient.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
  if (!profile?.org_id) return { error: json({ error: "لا توجد مؤسسة" }, 400) };

  let configQuery = adminClient
    .from("whatsapp_config")
    .select("business_account_id, access_token, phone_number_id")
    .eq("org_id", profile.org_id)
    .eq("is_connected", true)
    .eq("channel_type", "meta_api");

  if (requestedChannelId) {
    configQuery = configQuery.eq("id", requestedChannelId);
  } else if (requestedPhoneNumberId) {
    configQuery = configQuery.eq("phone_number_id", requestedPhoneNumberId);
  } else {
    configQuery = configQuery.order("created_at", { ascending: true }).limit(1);
  }

  const { data: config } = await configQuery.maybeSingle();

  if (!config) return { error: json({ error: "لا يوجد رقم واتساب رسمي مربوط" }) };
  return { adminClient, orgId: profile.org_id, config };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  const requestedChannelId = typeof body?.channel_id === "string" ? body.channel_id.trim() : "";
  const requestedPhoneNumberId = typeof body?.phone_number_id === "string" ? body.phone_number_id.trim() : "";

  const context = await getUserContext(req, requestedChannelId || undefined, requestedPhoneNumberId || undefined);
  if ("error" in context) return context.error;
  const { config } = context;

  const headers = { Authorization: `Bearer ${config.access_token}`, "Content-Type": "application/json" };

  // ── List catalogs ──
  if (action === "list_catalogs") {
    const res = await fetch(`https://graph.facebook.com/v21.0/${config.business_account_id}/product_catalogs?fields=id,name,product_count`, { headers });
    const data = await res.json();
    if (!res.ok) return json({ error: data?.error?.message || "تعذر جلب الكتالوجات" }, res.status);
    return json({ catalogs: data.data || [] });
  }

  // ── List products in a catalog ──
  if (action === "list_products") {
    const catalogId = String(body?.catalog_id || "").trim();
    if (!catalogId) return json({ error: "catalog_id مطلوب" }, 400);
    const limit = body?.limit || 50;
    const after = body?.after || "";
    let url = `https://graph.facebook.com/v21.0/${catalogId}/products?fields=id,name,description,url,image_url,price,currency,availability,retailer_id&limit=${limit}`;
    if (after) url += `&after=${after}`;
    const res = await fetch(url, { headers });
    const data = await res.json();
    if (!res.ok) return json({ error: data?.error?.message || "تعذر جلب المنتجات" }, res.status);
    return json({ products: data.data || [], paging: data.paging || null });
  }

  // ── Get WABA commerce settings ──
  if (action === "get_commerce_settings") {
    const res = await fetch(`https://graph.facebook.com/v21.0/${config.phone_number_id}/whatsapp_commerce_settings`, { headers });
    const data = await res.json();
    if (!res.ok) return json({ error: data?.error?.message || "تعذر جلب إعدادات التجارة" }, res.status);
    return json({ settings: data.data?.[0] || data });
  }

  // ── Update commerce settings (enable catalog) ──
  if (action === "update_commerce_settings") {
    const catalogId = String(body?.catalog_id || "").trim();
    const isCartEnabled = body?.is_cart_enabled ?? true;
    const isCatalogVisible = body?.is_catalog_visible ?? true;
    if (!catalogId) return json({ error: "catalog_id مطلوب" }, 400);

    const res = await fetch(`https://graph.facebook.com/v21.0/${config.phone_number_id}/whatsapp_commerce_settings`, {
      method: "POST",
      headers,
      body: JSON.stringify({ catalog_id: catalogId, is_cart_enabled: isCartEnabled, is_catalog_visible: isCatalogVisible }),
    });
    const data = await res.json();
    if (!res.ok) return json({ error: data?.error?.message || "تعذر تحديث إعدادات التجارة" }, res.status);
    return json({ success: true });
  }

  // ── Template analytics ──
  if (action === "template_analytics") {
    const templateIds = body?.template_ids || [];
    const startDate = body?.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const endDate = body?.end || new Date().toISOString().split("T")[0];
    const granularity = body?.granularity || "DAILY";

    const analyticsUrl = `https://graph.facebook.com/v21.0/${config.business_account_id}?fields=template_analytics.start(${startDate}).end(${endDate}).granularity(${granularity})${templateIds.length ? `.template_ids(${templateIds.join(",")})` : ""}`;
    const res = await fetch(analyticsUrl, { headers });
    const data = await res.json();
    if (!res.ok) return json({ error: data?.error?.message || "تعذر جلب تحليلات القوالب" }, res.status);
    return json({ analytics: data.template_analytics?.data || [] });
  }

  // ── Conversation analytics (pricing) ──
  if (action === "conversation_analytics") {
    const startDate = body?.start || Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    const endDate = body?.end || Math.floor(Date.now() / 1000);
    const granularity = body?.granularity || "DAILY";

    const url = `https://graph.facebook.com/v21.0/${config.business_account_id}?fields=conversation_analytics.start(${startDate}).end(${endDate}).granularity(${granularity}).dimensions(conversation_category,conversation_type,country,phone)`;
    const res = await fetch(url, { headers });
    const data = await res.json();
    if (!res.ok) return json({ error: data?.error?.message || "تعذر جلب تحليلات المحادثات" }, res.status);
    return json({ analytics: data.conversation_analytics?.data || [] });
  }

  // ── Mark as read ──
  if (action === "mark_read") {
    const messageId = String(body?.message_id || "").trim();
    if (!messageId) return json({ error: "message_id مطلوب" }, 400);
    const res = await fetch(`https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }),
    });
    const data = await res.json();
    if (!res.ok) return json({ error: data?.error?.message || "تعذر تعليم الرسالة كمقروءة" }, res.status);
    return json({ success: true });
  }

  // ── Two-step verification ──
  if (action === "set_two_step") {
    const pin = String(body?.pin || "").trim();
    if (!pin || pin.length !== 6 || !/^\d+$/.test(pin)) return json({ error: "PIN يجب أن يكون 6 أرقام" }, 400);
    const res = await fetch(`https://graph.facebook.com/v21.0/${config.phone_number_id}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ pin }),
    });
    const data = await res.json();
    if (!res.ok) return json({ error: data?.error?.message || "تعذر تعيين PIN" }, res.status);
    return json({ success: true });
  }

  // ── QR code generation ──
  if (action === "create_qr") {
    const prefillMessage = body?.prefill_message || "";
    const res = await fetch(`https://graph.facebook.com/v21.0/${config.phone_number_id}/message_qrdls`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prefilled_message: prefillMessage, generate_qr_image: "SVG" }),
    });
    const data = await res.json();
    if (!res.ok) return json({ error: data?.error?.message || "تعذر إنشاء QR" }, res.status);
    return json({ qr: data });
  }

  if (action === "list_qr") {
    const res = await fetch(`https://graph.facebook.com/v21.0/${config.phone_number_id}/message_qrdls`, { headers });
    const data = await res.json();
    if (!res.ok) return json({ error: data?.error?.message || "تعذر جلب رموز QR" }, res.status);
    return json({ qr_codes: data.data || [] });
  }

  if (action === "delete_qr") {
    const qrId = String(body?.qr_id || "").trim();
    if (!qrId) return json({ error: "qr_id مطلوب" }, 400);
    const res = await fetch(`https://graph.facebook.com/v21.0/${config.phone_number_id}/message_qrdls/${qrId}`, {
      method: "DELETE",
      headers,
    });
    if (!res.ok) {
      const data = await res.json();
      return json({ error: data?.error?.message || "تعذر حذف QR" }, res.status);
    }
    return json({ success: true });
  }

  return json({ error: "Invalid action" }, 400);
});
