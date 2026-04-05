import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function logToSystem(
  client: any,
  level: string,
  message: string,
  metadata: Record<string, unknown> = {},
  orgId: string | null = null
) {
  try {
    await client.from("system_logs").insert({
      level,
      source: "edge_function",
      function_name: "public-api",
      message,
      metadata,
      org_id: orgId,
    });
  } catch (_) {
    // silent
  }
}

async function authenticateToken(apiKey: string) {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Hash the incoming token to compare against stored hashes
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const tokenHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  // Try hash-based lookup first, fallback to plain text for un-migrated tokens
  let token = null;
  const { data: hashMatch } = await admin
    .from("api_tokens")
    .select("id, org_id, permissions, is_active, expires_at")
    .eq("token_hash", tokenHash)
    .eq("is_active", true)
    .maybeSingle();

  if (hashMatch) {
    token = hashMatch;
  } else {
    // Fallback for tokens not yet hashed
    const { data: plainMatch } = await admin
      .from("api_tokens")
      .select("id, org_id, permissions, is_active, expires_at")
      .eq("token", apiKey)
      .eq("is_active", true)
      .maybeSingle();
    token = plainMatch;
  }

  if (!token) return null;

  if (token.expires_at && new Date(token.expires_at) < new Date()) return null;

  // Update last_used_at
  await admin
    .from("api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", token.id);

  return token;
}

function hasPermission(token: { permissions: string[] }, required: string) {
  return token.permissions.includes(required);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const requestId = crypto.randomUUID();

  try {
    const apiKey = req.headers.get("x-api-key") || "";
    if (!apiKey) {
      await logToSystem(admin, "warn", "طلب API بدون مفتاح", { request_id: requestId });
      return json({ error: "مطلوب API Key في الهيدر x-api-key" }, 401);
    }

    const token = await authenticateToken(apiKey);
    if (!token) {
      await logToSystem(admin, "warn", "مفتاح API غير صالح أو منتهي", { request_id: requestId, api_key_prefix: apiKey.substring(0, 8) + "..." });
      return json({ error: "API Key غير صالح أو منتهي" }, 401);
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/public-api\/?/, "").replace(/\/$/, "");
    const method = req.method;

    // ── RATE LIMITING ──
    const rateLimitEndpoint = `${method}:${path.split("/")[0] || "root"}`;
    const { data: rlResult } = await admin.rpc("check_rate_limit", {
      _org_id: token.org_id,
      _endpoint: rateLimitEndpoint,
      _max_requests: 100,
      _window_seconds: 60,
    });
    if (rlResult && !rlResult.allowed) {
      await logToSystem(admin, "warn", "Rate limit exceeded", { request_id: requestId, token_id: token.id, endpoint: rateLimitEndpoint, count: rlResult.count }, token.org_id);
      return new Response(JSON.stringify({ error: "تجاوزت الحد الأقصى للطلبات (100/دقيقة). حاول لاحقاً.", remaining: 0, limit: rlResult.limit }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60", "X-RateLimit-Limit": String(rlResult.limit), "X-RateLimit-Remaining": "0" },
      });
    }

    const rateLimitHeaders = rlResult ? { "X-RateLimit-Limit": String(rlResult.limit), "X-RateLimit-Remaining": String(rlResult.remaining) } : {};

    await logToSystem(admin, "info", `API request: ${method} /${path}`, { request_id: requestId, method, path, token_id: token.id }, token.org_id);

    // ── MESSAGES ──
    if (path === "messages/send" && method === "POST") {
      if (!hasPermission(token, "messages")) {
        await logToSystem(admin, "warn", "محاولة إرسال رسالة بدون صلاحية", { request_id: requestId, token_id: token.id }, token.org_id);
        return json({ error: "لا تملك صلاحية الرسائل" }, 403);
      }

      const body = await req.json();
      const { to, message, template_name, template_language, template_variables, header_variables, channel_id, media_url, media_type } = body;
      if (!to) return json({ error: "الحقل to مطلوب" }, 400);
      if (!message && !template_name) return json({ error: "الحقل message أو template_name مطلوب" }, 400);

      // Find WhatsApp config — prefer channel_id if given
      let configQuery = admin
        .from("whatsapp_config")
        .select("*")
        .eq("org_id", token.org_id)
        .eq("is_connected", true);

      if (channel_id) {
        configQuery = configQuery.eq("id", channel_id);
      }

      const { data: configs } = await configQuery.limit(1);
      const config = configs?.[0];
      if (!config) {
        await logToSystem(admin, "error", "لا يوجد رقم واتساب مربوط عند محاولة إرسال عبر API", { request_id: requestId, to, channel_id }, token.org_id);
        return json({ error: channel_id ? "القناة المحددة غير موجودة أو غير متصلة" : "لا يوجد رقم واتساب مربوط" }, 400);
      }

      // Helper: save conversation & message to DB
      const saveToDb = async (content: string, msgId: string | null, msgType = "text", mediaUrl: string | null = null) => {
        let { data: conv } = await admin
          .from("conversations")
          .select("id")
          .eq("customer_phone", to)
          .eq("org_id", token.org_id)
          .neq("status", "closed")
          .limit(1)
          .maybeSingle();

        if (!conv) {
          const { data: newConv } = await admin
            .from("conversations")
            .insert({
              customer_phone: to,
              customer_name: to,
              org_id: token.org_id,
              status: "active",
              last_message: content.substring(0, 200),
              last_message_at: new Date().toISOString(),
              channel_id: config.id,
            })
            .select("id")
            .single();
          conv = newConv;
        }

        if (conv) {
          await admin.from("messages").insert({
            conversation_id: conv.id,
            wa_message_id: msgId,
            sender: "agent",
            message_type: msgType,
            content,
            media_url: mediaUrl,
            status: "sent",
            metadata: { source: "api" },
          });
          await admin.from("conversations").update({
            last_message: content.substring(0, 200),
            last_message_at: new Date().toISOString(),
          }).eq("id", conv.id);
        }
        return conv?.id;
      };

      // ── Evolution (unofficial) ──
      if (config.channel_type === "evolution") {
        const EVOLUTION_URL = Deno.env.get("EVOLUTION_API_URL");
        const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY");
        if (!EVOLUTION_URL || !EVOLUTION_KEY) return json({ error: "إعدادات Evolution غير مكتملة" }, 500);
        const evoHeaders = { "Content-Type": "application/json", apikey: EVOLUTION_KEY };

        // Media message
        if (media_url && media_type) {
          const evoMediaType = media_type === "image" ? "sendMedia" : media_type === "document" ? "sendMedia" : media_type === "audio" ? "sendWhatsAppAudio" : "sendMedia";
          const mediaBody: any = { number: to, media: media_url, caption: message || "" };
          if (media_type === "document") mediaBody.fileName = body.file_name || "file";
          const response = await fetch(`${EVOLUTION_URL}/message/${evoMediaType}/${config.evolution_instance_name}`, {
            method: "POST", headers: evoHeaders, body: JSON.stringify(mediaBody),
          });
          const result = await response.json();
          if (!response.ok) return json({ error: result?.message || "فشل إرسال الوسائط" }, response.status);
          await saveToDb(message || `[${media_type}]`, result.key?.id, media_type, media_url);
          return json({ success: true, message_id: result.key?.id, channel: config.evolution_instance_name });
        }

        // Text message
        const response = await fetch(`${EVOLUTION_URL}/message/sendText/${config.evolution_instance_name}`, {
          method: "POST", headers: evoHeaders, body: JSON.stringify({ number: to, text: message }),
        });
        const result = await response.json();
        if (!response.ok) {
          await logToSystem(admin, "error", "فشل إرسال رسالة عبر Evolution API", { request_id: requestId, to, error: result?.message }, token.org_id);
          return json({ error: result?.message || "فشل الإرسال" }, response.status);
        }
        await saveToDb(message, result.key?.id);
        await logToSystem(admin, "info", "تم إرسال رسالة عبر API (Evolution)", { request_id: requestId, to, message_id: result.key?.id }, token.org_id);
        return json({ success: true, message_id: result.key?.id, channel: config.evolution_instance_name });
      }

      // ── Meta Cloud API (official) ──
      const metaHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${config.access_token}` };
      const metaUrl = `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`;

      // Template message
      if (template_name) {
        const components: unknown[] = [];

        // Header variables (image, video, document, or text)
        if (header_variables?.length) {
          const headerParams = header_variables.map((v: any) => {
            if (typeof v === "string") return { type: "text", text: v };
            // Object form: { type: "image", link: "..." } or { type: "document", link: "...", filename: "..." }
            return v;
          });
          components.push({ type: "header", parameters: headerParams });
        }

        // Body variables
        if (template_variables?.length) {
          components.push({
            type: "body",
            parameters: template_variables.map((v: string) => ({ type: "text", text: v })),
          });
        }

        // Button variables (optional)
        if (body.button_variables?.length) {
          body.button_variables.forEach((btn: any, idx: number) => {
            components.push({
              type: "button",
              sub_type: btn.sub_type || "url",
              index: btn.index ?? idx,
              parameters: btn.parameters || [{ type: "text", text: btn.text }],
            });
          });
        }

        const templatePayload = {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: template_name,
            language: { code: template_language || "ar" },
            components: components.length > 0 ? components : undefined,
          },
        };

        const response = await fetch(metaUrl, {
          method: "POST", headers: metaHeaders, body: JSON.stringify(templatePayload),
        });
        const result = await response.json();
        if (!response.ok) {
          await logToSystem(admin, "error", "فشل إرسال قالب عبر Meta API", { request_id: requestId, to, template_name, error: result?.error?.message, components }, token.org_id);
          return json({ error: result?.error?.message || "فشل إرسال القالب", details: result?.error }, response.status);
        }
        const msgId = result.messages?.[0]?.id;
        await saveToDb(`📋 ${template_name}`, msgId, "template");
        await logToSystem(admin, "info", "تم إرسال قالب عبر API (Meta)", { request_id: requestId, to, template_name, message_id: msgId, channel: config.display_phone }, token.org_id);
        return json({ success: true, message_id: msgId, channel: config.display_phone || config.phone_number_id });
      }

      // Media message (Meta)
      if (media_url && media_type) {
        const mediaPayload: any = {
          messaging_product: "whatsapp",
          to,
          type: media_type,
          [media_type]: { link: media_url },
        };
        if (message && (media_type === "image" || media_type === "video")) {
          mediaPayload[media_type].caption = message;
        }
        if (media_type === "document") {
          mediaPayload.document.filename = body.file_name || "file";
          if (message) mediaPayload.document.caption = message;
        }
        const response = await fetch(metaUrl, { method: "POST", headers: metaHeaders, body: JSON.stringify(mediaPayload) });
        const result = await response.json();
        if (!response.ok) return json({ error: result?.error?.message || "فشل إرسال الوسائط" }, response.status);
        const msgId = result.messages?.[0]?.id;
        await saveToDb(message || `[${media_type}]`, msgId, media_type, media_url);
        return json({ success: true, message_id: msgId, channel: config.display_phone || config.phone_number_id });
      }

      // Plain text message (Meta)
      const response = await fetch(metaUrl, {
        method: "POST", headers: metaHeaders,
        body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: message } }),
      });
      const result = await response.json();
      if (!response.ok) {
        await logToSystem(admin, "error", "فشل إرسال رسالة عبر Meta API", { request_id: requestId, to, error: result?.error?.message }, token.org_id);
        return json({ error: result?.error?.message || "فشل الإرسال", details: result?.error }, response.status);
      }
      const msgId = result.messages?.[0]?.id;
      await saveToDb(message, msgId);
      await logToSystem(admin, "info", "تم إرسال رسالة عبر API (Meta)", { request_id: requestId, to, message_id: msgId }, token.org_id);
      return json({ success: true, message_id: msgId, channel: config.display_phone || config.phone_number_id });
    }

    // ── LIST CHANNELS ──
    if (path === "channels" && method === "GET") {
      if (!hasPermission(token, "messages")) return json({ error: "لا تملك صلاحية الرسائل" }, 403);
      const { data: channels } = await admin.from("whatsapp_config")
        .select("id, display_phone, business_name, channel_type, channel_label, is_connected, evolution_instance_name, evolution_instance_status")
        .eq("org_id", token.org_id)
        .eq("is_connected", true);
      return json({ channels: channels || [] });
    }

    // ── LIST TEMPLATES ──
    if (path === "templates" && method === "GET") {
      if (!hasPermission(token, "messages")) return json({ error: "لا تملك صلاحية الرسائل" }, 403);

      // Get a connected Meta config
      const { data: metaConfig } = await admin.from("whatsapp_config")
        .select("business_account_id, access_token")
        .eq("org_id", token.org_id)
        .eq("is_connected", true)
        .eq("channel_type", "meta_api")
        .limit(1)
        .maybeSingle();

      if (!metaConfig?.business_account_id || !metaConfig?.access_token) {
        return json({ error: "لا يوجد حساب واتساب رسمي مربوط" }, 400);
      }

      const statusFilter = url.searchParams.get("status") || "APPROVED";
      const tplRes = await fetch(
        `https://graph.facebook.com/v21.0/${metaConfig.business_account_id}/message_templates?status=${statusFilter}&limit=200`,
        { headers: { Authorization: `Bearer ${metaConfig.access_token}` } }
      );
      const tplData = await tplRes.json();
      if (!tplRes.ok) return json({ error: tplData?.error?.message || "فشل جلب القوالب" }, tplRes.status);

      const templates = (tplData.data || []).map((t: any) => ({
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        components: t.components,
      }));
      return json({ templates, total: templates.length });
    }

    // ── CUSTOMERS ──
    if (path === "customers" && method === "GET") {
      if (!hasPermission(token, "customers")) return json({ error: "لا تملك صلاحية العملاء" }, 403);
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const search = url.searchParams.get("search") || "";

      let query = admin.from("customers").select("*", { count: "exact" }).eq("org_id", token.org_id).range(offset, offset + limit - 1).order("created_at", { ascending: false });
      if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);

      const { data, count, error } = await query;
      if (error) return json({ error: error.message }, 500);
      return json({ data, total: count, limit, offset });
    }

    if (path === "customers" && method === "POST") {
      if (!hasPermission(token, "customers")) return json({ error: "لا تملك صلاحية العملاء" }, 403);
      const body = await req.json();
      if (!body.phone) return json({ error: "الحقل phone مطلوب" }, 400);
      const { data, error } = await admin.from("customers").insert({ ...body, org_id: token.org_id }).select().single();
      if (error) {
        await logToSystem(admin, "error", "فشل إنشاء عميل عبر API", { request_id: requestId, error: error.message }, token.org_id);
        return json({ error: error.message }, 500);
      }
      await logToSystem(admin, "info", "تم إنشاء عميل عبر API", { request_id: requestId, customer_id: data.id }, token.org_id);
      return json({ data }, 201);
    }

    if (path.startsWith("customers/") && method === "PUT") {
      if (!hasPermission(token, "customers")) return json({ error: "لا تملك صلاحية العملاء" }, 403);
      const id = path.split("/")[1];
      const body = await req.json();
      delete body.id; delete body.org_id;
      const { data, error } = await admin.from("customers").update(body).eq("id", id).eq("org_id", token.org_id).select().single();
      if (error) return json({ error: error.message }, 500);
      await logToSystem(admin, "info", "تم تحديث عميل عبر API", { request_id: requestId, customer_id: id }, token.org_id);
      return json({ data });
    }

    if (path.startsWith("customers/") && method === "DELETE") {
      if (!hasPermission(token, "customers")) return json({ error: "لا تملك صلاحية العملاء" }, 403);
      const id = path.split("/")[1];
      const { error } = await admin.from("customers").delete().eq("id", id).eq("org_id", token.org_id);
      if (error) return json({ error: error.message }, 500);
      await logToSystem(admin, "info", "تم حذف عميل عبر API", { request_id: requestId, customer_id: id }, token.org_id);
      return json({ success: true });
    }

    // ── ORDERS ──
    if (path === "orders" && method === "GET") {
      if (!hasPermission(token, "orders")) return json({ error: "لا تملك صلاحية الطلبات" }, 403);
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const status = url.searchParams.get("status");

      let query = admin.from("orders").select("*", { count: "exact" }).eq("org_id", token.org_id).range(offset, offset + limit - 1).order("created_at", { ascending: false });
      if (status) query = query.eq("status", status);

      const { data, count, error } = await query;
      if (error) return json({ error: error.message }, 500);
      return json({ data, total: count, limit, offset });
    }

    if (path === "orders" && method === "POST") {
      if (!hasPermission(token, "orders")) return json({ error: "لا تملك صلاحية الطلبات" }, 403);
      const body = await req.json();
      const { items, ...orderData } = body;
      const { data: order, error } = await admin.from("orders").insert({ ...orderData, org_id: token.org_id }).select().single();
      if (error) {
        await logToSystem(admin, "error", "فشل إنشاء طلب عبر API", { request_id: requestId, error: error.message }, token.org_id);
        return json({ error: error.message }, 500);
      }
      if (items?.length) {
        await admin.from("order_items").insert(items.map((item: any) => ({ ...item, order_id: order.id })));
      }
      await logToSystem(admin, "info", "تم إنشاء طلب عبر API", { request_id: requestId, order_id: order.id }, token.org_id);
      return json({ data: order }, 201);
    }

    if (path.startsWith("orders/") && method === "PUT") {
      if (!hasPermission(token, "orders")) return json({ error: "لا تملك صلاحية الطلبات" }, 403);
      const id = path.split("/")[1];
      const body = await req.json();
      delete body.id; delete body.org_id;
      const { data, error } = await admin.from("orders").update(body).eq("id", id).eq("org_id", token.org_id).select().single();
      if (error) return json({ error: error.message }, 500);
      await logToSystem(admin, "info", "تم تحديث طلب عبر API", { request_id: requestId, order_id: id }, token.org_id);
      return json({ data });
    }

    // ── CONVERSATIONS ──
    if (path === "conversations" && method === "GET") {
      if (!hasPermission(token, "conversations")) return json({ error: "لا تملك صلاحية المحادثات" }, 403);
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const status = url.searchParams.get("status");

      let query = admin.from("conversations").select("*", { count: "exact" }).eq("org_id", token.org_id).range(offset, offset + limit - 1).order("last_message_at", { ascending: false });
      if (status) query = query.eq("status", status);

      const { data, count, error } = await query;
      if (error) return json({ error: error.message }, 500);
      return json({ data, total: count, limit, offset });
    }

    if (path.startsWith("conversations/") && path.endsWith("/messages") && method === "GET") {
      if (!hasPermission(token, "conversations")) return json({ error: "لا تملك صلاحية المحادثات" }, 403);
      const convId = path.split("/")[1];
      const limit = parseInt(url.searchParams.get("limit") || "50");

      const { data: conv } = await admin.from("conversations").select("id").eq("id", convId).eq("org_id", token.org_id).maybeSingle();
      if (!conv) return json({ error: "المحادثة غير موجودة" }, 404);

      const { data, error } = await admin.from("messages").select("*").eq("conversation_id", convId).order("created_at", { ascending: false }).limit(limit);
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    // ── ABANDONED CARTS ──
    if (path === "abandoned-carts" && method === "GET") {
      if (!hasPermission(token, "orders")) return json({ error: "لا تملك صلاحية الطلبات" }, 403);
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const offset = parseInt(url.searchParams.get("offset") || "0");

      const { data, count, error } = await admin.from("abandoned_carts").select("*", { count: "exact" }).eq("org_id", token.org_id).range(offset, offset + limit - 1).order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ data, total: count, limit, offset });
    }

    if (path === "abandoned-carts" && method === "POST") {
      if (!hasPermission(token, "orders")) return json({ error: "لا تملك صلاحية الطلبات" }, 403);
      const body = await req.json();
      const { data, error } = await admin.from("abandoned_carts").insert({ ...body, org_id: token.org_id }).select().single();
      if (error) return json({ error: error.message }, 500);
      await logToSystem(admin, "info", "تم إنشاء سلة مهجورة عبر API", { request_id: requestId, cart_id: data.id }, token.org_id);
      return json({ data }, 201);
    }

    // ── WHATSAPP QR (Evolution) ──
    const EVOLUTION_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY");
    const CLOUD_URL = Deno.env.get("SUPABASE_URL")!;

    const EVOLUTION_WEBHOOK_EVENTS = [
      "MESSAGES_UPSERT", "MESSAGES_UPDATE", "MESSAGES_EDITED", "MESSAGES_DELETE",
      "CONNECTION_UPDATE", "QRCODE_UPDATED", "PRESENCE_UPDATE", "SEND_MESSAGE",
    ];

    if (path === "whatsapp/create-instance" && method === "POST") {
      if (!hasPermission(token, "whatsapp")) return json({ error: "لا تملك صلاحية واتساب" }, 403);
      if (!EVOLUTION_URL || !EVOLUTION_KEY) return json({ error: "إعدادات Evolution غير مكتملة" }, 500);

      const body = await req.json().catch(() => ({}));
      const instanceName = `org_${token.org_id.replace(/-/g, "").slice(0, 12)}_${Date.now().toString(36)}`;
      const webhookUrl = `${CLOUD_URL}/functions/v1/evolution-webhook`;
      const evoHeaders = { "Content-Type": "application/json", apikey: EVOLUTION_KEY };

      const createRes = await fetch(`${EVOLUTION_URL}/instance/create`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({
          instanceName,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
          webhook: {
            enabled: true,
            url: webhookUrl,
            webhookByEvents: false,
            webhookBase64: false,
            events: EVOLUTION_WEBHOOK_EVENTS,
          },
        }),
      });
      const createData = await createRes.json();

      if (!createRes.ok && !createData?.instance) {
        await logToSystem(admin, "error", "فشل إنشاء جلسة عبر API", { request_id: requestId, error: JSON.stringify(createData).slice(0, 300) }, token.org_id);
        return json({ error: createData?.response?.message?.[0] || createData?.message || "فشل إنشاء الجلسة" }, 400);
      }

      // Upsert whatsapp_config
      await admin.from("whatsapp_config").insert({
        org_id: token.org_id,
        channel_type: "evolution",
        evolution_instance_name: instanceName,
        evolution_instance_status: "connecting",
        is_connected: false,
        registration_status: "pending",
      });

      const qr = createData?.qrcode?.base64 || createData?.base64 || null;
      await logToSystem(admin, "info", "تم إنشاء رقم QR عبر API", { request_id: requestId, instance: instanceName }, token.org_id);
      return json({ success: true, instance_name: instanceName, qr_code: qr, status: qr ? "qr_ready" : "created" }, 201);
    }

    if (path === "whatsapp/qr" && method === "POST") {
      if (!hasPermission(token, "whatsapp")) return json({ error: "لا تملك صلاحية واتساب" }, 403);
      if (!EVOLUTION_URL || !EVOLUTION_KEY) return json({ error: "إعدادات Evolution غير مكتملة" }, 500);

      const body = await req.json().catch(() => ({}));
      const instName = body?.instance_name;
      if (!instName) return json({ error: "instance_name مطلوب" }, 400);

      // Verify instance belongs to org
      const { data: config } = await admin.from("whatsapp_config")
        .select("id").eq("evolution_instance_name", instName).eq("org_id", token.org_id).maybeSingle();
      if (!config) return json({ error: "الجلسة غير موجودة أو لا تتبع لمؤسستك" }, 404);

      const evoHeaders = { "Content-Type": "application/json", apikey: EVOLUTION_KEY };
      const connectRes = await fetch(`${EVOLUTION_URL}/instance/connect/${instName}`, { headers: evoHeaders });
      const connectData = await connectRes.json();
      const qr = connectData.base64 || connectData.qrcode?.base64 || null;

      return json({ success: true, qr_code: qr, status: qr ? "qr_ready" : (connectData.instance?.state || "waiting") });
    }

    if (path === "whatsapp/status" && method === "GET") {
      if (!hasPermission(token, "whatsapp")) return json({ error: "لا تملك صلاحية واتساب" }, 403);

      // List all QR channels for this org
      const { data: channels } = await admin.from("whatsapp_config")
        .select("id, evolution_instance_name, evolution_instance_status, is_connected, display_phone, business_name, label, created_at")
        .eq("org_id", token.org_id)
        .eq("channel_type", "evolution");

      if (!channels?.length) return json({ channels: [] });

      // If Evolution is configured, fetch live status for each
      if (EVOLUTION_URL && EVOLUTION_KEY) {
        const evoHeaders = { "Content-Type": "application/json", apikey: EVOLUTION_KEY };
        const enriched = await Promise.all(channels.map(async (ch) => {
          if (!ch.evolution_instance_name) return { ...ch, live_status: "unknown" };
          try {
            const res = await fetch(`${EVOLUTION_URL}/instance/connectionState/${ch.evolution_instance_name}`, { headers: evoHeaders });
            const data = await res.json();
            return { ...ch, live_status: data.instance?.state || data.state || "unknown" };
          } catch {
            return { ...ch, live_status: "error" };
          }
        }));
        return json({ channels: enriched });
      }

      return json({ channels });
    }

    if (path === "whatsapp/logout" && method === "POST") {
      if (!hasPermission(token, "whatsapp")) return json({ error: "لا تملك صلاحية واتساب" }, 403);
      if (!EVOLUTION_URL || !EVOLUTION_KEY) return json({ error: "إعدادات Evolution غير مكتملة" }, 500);

      const body = await req.json().catch(() => ({}));
      const instName = body?.instance_name;
      if (!instName) return json({ error: "instance_name مطلوب" }, 400);

      const { data: config } = await admin.from("whatsapp_config")
        .select("id").eq("evolution_instance_name", instName).eq("org_id", token.org_id).maybeSingle();
      if (!config) return json({ error: "الجلسة غير موجودة" }, 404);

      const evoHeaders = { "Content-Type": "application/json", apikey: EVOLUTION_KEY };
      await fetch(`${EVOLUTION_URL}/instance/logout/${instName}`, { method: "DELETE", headers: evoHeaders });

      await admin.from("whatsapp_config").update({
        evolution_instance_status: "disconnected",
        is_connected: false,
        registration_status: "pending",
      }).eq("evolution_instance_name", instName).eq("org_id", token.org_id);

      await logToSystem(admin, "info", "تم قطع اتصال QR عبر API", { request_id: requestId, instance: instName }, token.org_id);
      return json({ success: true, logged_out: instName });
    }

    if (path.startsWith("whatsapp/instance/") && method === "DELETE") {
      if (!hasPermission(token, "whatsapp")) return json({ error: "لا تملك صلاحية واتساب" }, 403);
      if (!EVOLUTION_URL || !EVOLUTION_KEY) return json({ error: "إعدادات Evolution غير مكتملة" }, 500);

      const instName = path.split("/")[2];
      if (!instName) return json({ error: "instance_name مطلوب في المسار" }, 400);

      const { data: config } = await admin.from("whatsapp_config")
        .select("id").eq("evolution_instance_name", instName).eq("org_id", token.org_id).maybeSingle();
      if (!config) return json({ error: "الجلسة غير موجودة" }, 404);

      const evoHeaders = { "Content-Type": "application/json", apikey: EVOLUTION_KEY };
      await fetch(`${EVOLUTION_URL}/instance/delete/${instName}`, { method: "DELETE", headers: evoHeaders });

      await admin.from("whatsapp_config").delete().eq("evolution_instance_name", instName).eq("org_id", token.org_id);

      await logToSystem(admin, "info", "تم حذف جلسة QR عبر API", { request_id: requestId, instance: instName }, token.org_id);
      return json({ success: true, deleted: instName });
    }

    await logToSystem(admin, "warn", `مسار API غير موجود: ${method} /${path}`, { request_id: requestId }, token.org_id);
    return json({ error: `المسار ${path} غير موجود`, available_endpoints: [
      "POST /messages/send",
      "GET /channels",
      "GET /templates",
      "GET /customers", "POST /customers", "PUT /customers/:id", "DELETE /customers/:id",
      "GET /orders", "POST /orders", "PUT /orders/:id",
      "GET /conversations", "GET /conversations/:id/messages",
      "GET /abandoned-carts", "POST /abandoned-carts",
      "POST /whatsapp/create-instance",
      "POST /whatsapp/qr",
      "GET /whatsapp/status",
      "POST /whatsapp/logout",
      "DELETE /whatsapp/instance/:name",
    ] }, 404);
  } catch (err: any) {
    console.error("Public API error:", err);
    await logToSystem(admin, "error", "خطأ غير متوقع في Public API", { request_id: requestId, error: err.message, stack: err.stack });
    return json({ error: err.message }, 500);
  }
});
