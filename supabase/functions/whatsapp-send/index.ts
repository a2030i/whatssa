import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function logToSystem(
  client: ReturnType<typeof createClient>,
  level: string,
  message: string,
  metadata: Record<string, unknown> = {},
  orgId?: string | null,
  userId?: string | null,
) {
  try {
    await client.from("system_logs").insert({
      level,
      source: "edge_function",
      function_name: "whatsapp-send",
      message,
      metadata,
      org_id: orgId || null,
      user_id: userId || null,
    });
  } catch (e) {
    console.error("Failed to write system log:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) {
      await logToSystem(adminClient, "warn", "طلب إرسال بدون توثيق (Authorization header مفقود)");
      return json({ error: "Unauthorized" }, 401);
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      await logToSystem(adminClient, "warn", "فشل التحقق من المستخدم", { error: userError?.message });
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.org_id) {
      await logToSystem(adminClient, "warn", "مستخدم بدون مؤسسة حاول إرسال رسالة", {}, null, user.id);
      return json({ error: "لا توجد مؤسسة مرتبطة بهذا الحساب" }, 400);
    }

    const orgId = profile.org_id;

    const { data: config, error: configError } = await adminClient
      .from("whatsapp_config")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_connected", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (configError || !config) {
      await logToSystem(adminClient, "error", "واتساب غير مربوط - فشل الإرسال", { configError: configError?.message }, orgId, user.id);
      return json({ error: "واتساب غير مربوط بشكل حقيقي بعد" }, 400);
    }

    const {
      to,
      message,
      type = "text",
      template_name,
      template_language,
      template_components,
      conversation_id,
    } = await req.json();

    if (!to || typeof to !== "string") {
      return json({ error: "رقم المستلم مطلوب" }, 400);
    }

    let messagePayload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to,
    };

    if (type === "template") {
      if (!template_name || typeof template_name !== "string") {
        return json({ error: "اسم القالب مطلوب" }, 400);
      }

      messagePayload = {
        ...messagePayload,
        type: "template",
        template: {
          name: template_name,
          language: { code: template_language || "ar" },
          components: Array.isArray(template_components) ? template_components : [],
        },
      };
    } else {
      if (!message || typeof message !== "string") {
        return json({ error: "نص الرسالة مطلوب" }, 400);
      }

      messagePayload = {
        ...messagePayload,
        type: "text",
        text: { body: message },
      };
    }

    await logToSystem(adminClient, "info", `إرسال رسالة ${type} إلى ${to}`, { type, to, template_name: template_name || null }, orgId, user.id);

    const response = await fetch(`https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messagePayload),
    });

    const result = await response.json();

    if (!response.ok) {
      await logToSystem(adminClient, "error", `فشل إرسال رسالة واتساب إلى ${to}`, {
        to,
        type,
        http_status: response.status,
        wa_error: result?.error?.message || "unknown",
        wa_error_code: result?.error?.code || null,
        phone_number_id: config.phone_number_id,
      }, orgId, user.id);
      return json({ error: result?.error?.message || "Failed to send message", details: result }, response.status);
    }

    const waMessageId = result.messages?.[0]?.id;

    await logToSystem(adminClient, "info", `تم إرسال رسالة بنجاح إلى ${to}`, {
      wa_message_id: waMessageId,
      type,
    }, orgId, user.id);

    let conversation = null;

    if (conversation_id) {
      const { data } = await adminClient
        .from("conversations")
        .select("id")
        .eq("id", conversation_id)
        .eq("org_id", orgId)
        .maybeSingle();
      conversation = data;
    }

    if (!conversation) {
      const { data } = await adminClient
        .from("conversations")
        .select("id")
        .eq("customer_phone", to)
        .eq("org_id", orgId)
        .neq("status", "closed")
        .limit(1)
        .maybeSingle();
      conversation = data;
    }

    if (conversation) {
      const content = type === "template" ? `[قالب: ${template_name}]` : message;

      await adminClient.from("messages").insert({
        conversation_id: conversation.id,
        wa_message_id: waMessageId,
        sender: "agent",
        message_type: type === "template" ? "template" : "text",
        content,
        status: "sent",
      });

      await adminClient
        .from("conversations")
        .update({
          last_message: content,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversation.id);
    }

    return json({ success: true, message_id: waMessageId });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    await logToSystem(adminClient, "critical", `خطأ غير متوقع في إرسال رسالة واتساب`, {
      error: errMsg,
    }, null, null);
    console.error("Send error:", error);
    return json({ error: "Internal error" }, 500);
  }
});
