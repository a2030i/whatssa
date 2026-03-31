import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    await logToSystem(admin, "info", `API request: ${method} /${path}`, { request_id: requestId, method, path, token_id: token.id }, token.org_id);

    // ── MESSAGES ──
    if (path === "messages/send" && method === "POST") {
      if (!hasPermission(token, "messages")) {
        await logToSystem(admin, "warn", "محاولة إرسال رسالة بدون صلاحية", { request_id: requestId, token_id: token.id }, token.org_id);
        return json({ error: "لا تملك صلاحية الرسائل" }, 403);
      }

      const body = await req.json();
      const { to, message, template_name, template_language, template_variables } = body;
      if (!to) return json({ error: "الحقل to مطلوب" }, 400);
      if (!message && !template_name) return json({ error: "الحقل message أو template_name مطلوب" }, 400);

      // Find WhatsApp config
      const { data: configs } = await admin
        .from("whatsapp_config")
        .select("*")
        .eq("org_id", token.org_id)
        .eq("is_connected", true)
        .limit(1);

      const config = configs?.[0];
      if (!config) {
        await logToSystem(admin, "error", "لا يوجد رقم واتساب مربوط عند محاولة إرسال عبر API", { request_id: requestId, to }, token.org_id);
        return json({ error: "لا يوجد رقم واتساب مربوط" }, 400);
      }

      if (config.channel_type === "evolution") {
        const EVOLUTION_URL = Deno.env.get("EVOLUTION_API_URL");
        const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY");
        if (!EVOLUTION_URL || !EVOLUTION_KEY) return json({ error: "إعدادات Evolution غير مكتملة" }, 500);

        const response = await fetch(`${EVOLUTION_URL}/message/sendText/${config.evolution_instance_name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
          body: JSON.stringify({ number: to, text: message }),
        });
        const result = await response.json();
        if (!response.ok) {
          await logToSystem(admin, "error", "فشل إرسال رسالة عبر Evolution API", { request_id: requestId, to, error: result?.message, status: response.status }, token.org_id);
          return json({ error: result?.message || "فشل الإرسال" }, response.status);
        }

        // Save to DB
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
              last_message: message,
              last_message_at: new Date().toISOString(),
            })
            .select("id")
            .single();
          conv = newConv;
        }

        if (conv) {
          await admin.from("messages").insert({
            conversation_id: conv.id,
            wa_message_id: result.key?.id || null,
            sender: "agent",
            message_type: "text",
            content: message,
            status: "sent",
            metadata: { source: "api" },
          });
          await admin.from("conversations").update({
            last_message: message,
            last_message_at: new Date().toISOString(),
          }).eq("id", conv.id);
        }

        await logToSystem(admin, "info", "تم إرسال رسالة عبر API (Evolution)", { request_id: requestId, to, message_id: result.key?.id }, token.org_id);
        return json({ success: true, message_id: result.key?.id });
      }

      // Meta Cloud API
      if (template_name) {
        const components: unknown[] = [];
        if (template_variables?.length) {
          components.push({
            type: "body",
            parameters: template_variables.map((v: string) => ({ type: "text", text: v })),
          });
        }
        const response = await fetch(`https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.access_token}`,
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "template",
            template: { name: template_name, language: { code: template_language || "ar" }, components },
          }),
        });
        const result = await response.json();
        if (!response.ok) {
          await logToSystem(admin, "error", "فشل إرسال قالب عبر Meta API", { request_id: requestId, to, template_name, error: result?.error?.message }, token.org_id);
          return json({ error: result?.error?.message || "فشل إرسال القالب" }, response.status);
        }
        await logToSystem(admin, "info", "تم إرسال قالب عبر API (Meta)", { request_id: requestId, to, template_name, message_id: result.messages?.[0]?.id }, token.org_id);
        return json({ success: true, message_id: result.messages?.[0]?.id });
      }

      const response = await fetch(`https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.access_token}`,
        },
        body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: message } }),
      });
      const result = await response.json();
      if (!response.ok) {
        await logToSystem(admin, "error", "فشل إرسال رسالة عبر Meta API", { request_id: requestId, to, error: result?.error?.message }, token.org_id);
        return json({ error: result?.error?.message || "فشل الإرسال" }, response.status);
      }
      await logToSystem(admin, "info", "تم إرسال رسالة عبر API (Meta)", { request_id: requestId, to, message_id: result.messages?.[0]?.id }, token.org_id);
      return json({ success: true, message_id: result.messages?.[0]?.id });
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

    await logToSystem(admin, "warn", `مسار API غير موجود: ${method} /${path}`, { request_id: requestId }, token.org_id);
    return json({ error: `المسار ${path} غير موجود`, available_endpoints: [
      "POST /messages/send",
      "GET /customers", "POST /customers", "PUT /customers/:id", "DELETE /customers/:id",
      "GET /orders", "POST /orders", "PUT /orders/:id",
      "GET /conversations", "GET /conversations/:id/messages",
      "GET /abandoned-carts", "POST /abandoned-carts",
    ] }, 404);
  } catch (err: any) {
    console.error("Public API error:", err);
    await logToSystem(admin, "error", "خطأ غير متوقع في Public API", { request_id: requestId, error: err.message, stack: err.stack });
    return json({ error: err.message }, 500);
  }
});
