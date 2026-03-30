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

/** Upload a media file to Meta's Graph API and return the media_id */
async function uploadMediaToMeta(
  phoneNumberId: string,
  accessToken: string,
  fileData: Uint8Array,
  contentType: string,
  fileName: string,
): Promise<string | null> {
  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append("file", new Blob([fileData], { type: contentType }), fileName);
  formData.append("type", contentType);

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  const result = await res.json();
  if (!res.ok) {
    console.error("Meta media upload error:", result);
    return null;
  }
  return result.id || null;
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

    const body = await req.json();
    const {
      to,
      message,
      type = "text",
      template_name,
      template_language,
      template_components,
      conversation_id,
      // Media fields
      media_url,
      media_type,
      caption,
      // Interactive message fields
      interactive,
      // Phone number selection (multi-number support)
      phone_number_id: requestedPhoneId,
    } = body;

    if (!to || typeof to !== "string") {
      return json({ error: "رقم المستلم مطلوب" }, 400);
    }

    // Pick config — if requestedPhoneId is provided, use that specific number
    let configQuery = adminClient
      .from("whatsapp_config")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_connected", true)
      .eq("channel_type", "meta_api");

    if (requestedPhoneId) {
      configQuery = configQuery.eq("phone_number_id", requestedPhoneId);
    }

    const { data: config, error: configError } = await configQuery
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (configError || !config) {
      await logToSystem(adminClient, "error", "واتساب غير مربوط - فشل الإرسال", { configError: configError?.message }, orgId, user.id);
      return json({ error: "واتساب غير مربوط بشكل حقيقي بعد" }, 400);
    }

    let messagePayload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to,
    };

    // ── Template message ──
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
    }
    // ── Media message (image/video/document/audio) ──
    else if (type === "media" || media_url) {
      const mType = media_type || "image";
      let mediaId: string | null = null;

      // If media_url is a storage path, download and upload to Meta
      if (media_url && media_url.startsWith("storage:chat-media/")) {
        const path = media_url.replace("storage:chat-media/", "");
        const { data: fileData, error: dlError } = await adminClient.storage.from("chat-media").download(path);
        if (dlError || !fileData) {
          return json({ error: "فشل تحميل الملف من التخزين" }, 400);
        }
        const bytes = new Uint8Array(await fileData.arrayBuffer());
        const fileName = path.split("/").pop() || "file";
        const contentType = fileData.type || "application/octet-stream";
        mediaId = await uploadMediaToMeta(config.phone_number_id, config.access_token, bytes, contentType, fileName);
      }
      // If it's a direct URL, pass as link
      else if (media_url && media_url.startsWith("http")) {
        // Meta supports sending by link for images/documents
        const mediaObj: Record<string, unknown> = { link: media_url };
        if (caption) mediaObj.caption = caption;
        messagePayload = { ...messagePayload, type: mType, [mType]: mediaObj };
      }

      if (mediaId) {
        const mediaObj: Record<string, unknown> = { id: mediaId };
        if (caption || message) mediaObj.caption = caption || message || "";
        messagePayload = { ...messagePayload, type: mType, [mType]: mediaObj };
      } else if (!messagePayload.type) {
        return json({ error: "فشل رفع الوسائط إلى واتساب" }, 400);
      }
    }
    // ── Interactive message (buttons/list/product) ──
    else if (type === "interactive" && interactive) {
      messagePayload = {
        ...messagePayload,
        type: "interactive",
        interactive,
      };
    }
    // ── Text message ──
    else {
      if (!message || typeof message !== "string") {
        return json({ error: "نص الرسالة مطلوب" }, 400);
      }
      messagePayload = {
        ...messagePayload,
        type: "text",
        text: { body: message },
      };
    }

    await logToSystem(adminClient, "info", `إرسال رسالة ${messagePayload.type} إلى ${to}`, { type: messagePayload.type, to, template_name: template_name || null }, orgId, user.id);

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
        type: messagePayload.type,
        http_status: response.status,
        wa_error: result?.error?.message || "unknown",
        wa_error_code: result?.error?.code || null,
        phone_number_id: config.phone_number_id,
      }, orgId, user.id);

      // Add to retry queue for transient errors
      const retryableStatuses = [429, 500, 502, 503, 504];
      if (retryableStatuses.includes(response.status)) {
        await adminClient.from("message_retry_queue").insert({
          org_id: orgId,
          conversation_id: conversation_id || null,
          to_phone: to,
          content: message || caption || `[${type}]`,
          message_type: type === "template" ? "template" : type === "media" ? (media_type || "image") : "text",
          media_url: media_url || null,
          template_name: template_name || null,
          template_language: template_language || "ar",
          template_components: template_components || [],
          channel_type: "meta_api",
          last_error: result?.error?.message || `HTTP ${response.status}`,
          metadata: { original_payload: messagePayload },
        });
        await logToSystem(adminClient, "info", `تمت إضافة الرسالة لقائمة إعادة المحاولة`, { to }, orgId, user.id);
      }

      return json({ error: result?.error?.message || "Failed to send message", details: result, retrying: retryableStatuses.includes(response.status) }, response.status);
    }

    const waMessageId = result.messages?.[0]?.id;

    await logToSystem(adminClient, "info", `تم إرسال رسالة بنجاح إلى ${to}`, {
      wa_message_id: waMessageId,
      type: messagePayload.type,
    }, orgId, user.id);

    // ── Save to conversation ──
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
      let content = message || "";
      let msgType = "text";

      if (type === "template") {
        content = `[قالب: ${template_name}]`;
        msgType = "template";
      } else if (type === "interactive" || interactive) {
        const interBody = interactive?.body?.text || "";
        content = interBody || "[رسالة تفاعلية]";
        msgType = "interactive";
      } else if (type === "media" || media_url) {
        const mType = media_type || "image";
        const label = mType === "image" ? "📷" : mType === "video" ? "🎬" : mType === "audio" ? "🎤" : "📎";
        content = caption || message || `${label} ${mType}`;
        msgType = mType;
      }

      await adminClient.from("messages").insert({
        conversation_id: conversation.id,
        wa_message_id: waMessageId,
        sender: "agent",
        message_type: msgType,
        content,
        media_url: media_url || null,
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
    await logToSystem(adminClient, "critical", `خطأ غير متوقع في إرسال رسالة واتساب`, {
      error: errMsg,
    }, null, null);
    console.error("Send error:", error);
    return json({ error: "Internal error" }, 500);
  }
});
