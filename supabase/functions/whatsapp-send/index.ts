import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLOUD_SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const CLOUD_SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    client.from("system_logs").insert({
      level,
      source: "edge_function",
      function_name: "whatsapp-send",
      message,
      metadata,
      org_id: orgId || null,
      user_id: userId || null,
    }).then(() => {}).catch((e) => console.error("Log write failed:", e));
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
  const storageClient = createClient(CLOUD_SUPABASE_URL, CLOUD_SUPABASE_SERVICE_ROLE_KEY);

  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) {
      await logToSystem(adminClient, "warn", "طلب إرسال بدون توثيق (Authorization header مفقود)");
      return json({ error: "Unauthorized" }, 401);
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
    });

    // Use RLS-scoped query instead of auth.getUser()
    const { data: profile, error: profileError } = await authClient
      .from("profiles")
      .select("id, org_id")
      .limit(1)
      .maybeSingle();

    if (profileError || !profile?.id) {
      await logToSystem(adminClient, "warn", "فشل التحقق من المستخدم", { error: profileError?.message });
      return json({ error: "Unauthorized" }, 401);
    }

    if (!profile?.org_id) {
      await logToSystem(adminClient, "warn", "مستخدم بدون مؤسسة حاول إرسال رسالة", {}, null, profile.id);
      return json({ error: "لا توجد مؤسسة مرتبطة بهذا الحساب" }, 400);
    }

    const orgId = profile.org_id;
    const requesterUserId = profile.id;

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
      channel_id: requestedChannelId,
      // Reaction fields
      reaction_emoji,
      reaction_message_id,
      // Location fields
      location,
      // Contact fields
      contacts,
      // Reply context
      reply_to,
      // Edit/Delete
      edit_message_id,
      delete_message_id,
      sender_name,
    } = body;

    if (!to || typeof to !== "string") {
      return json({ error: "رقم المستلم مطلوب" }, 400);
    }

    // Pick config — prefer the exact channel, then exact phone number, then fallback
    let configQuery = adminClient
      .from("whatsapp_config")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_connected", true)
      .eq("channel_type", "meta_api");

    if (requestedChannelId) {
      configQuery = configQuery.eq("id", requestedChannelId);
    } else if (requestedPhoneId) {
      configQuery = configQuery.eq("phone_number_id", requestedPhoneId);
    }

    const { data: config, error: configError } = await configQuery
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (configError || !config) {
      await logToSystem(adminClient, "warn", "واتساب غير مربوط - تم وضع الرسالة في قائمة الانتظار", { configError: configError?.message }, orgId, requesterUserId);

      // Queue for later delivery
      const queueContent = message || caption || `[${type}]`;
      const queueType = type === "template" ? "template" : type === "media" ? (media_type || "image") : "text";
      
      // Save message to conversation first so it appears in UI
      let convId = conversation_id || null;
      if (to && !convId) {
        let convQuery = adminClient.from("conversations").select("id").eq("customer_phone", to).eq("org_id", orgId).neq("status", "closed");
        if (requestedChannelId) convQuery = convQuery.eq("channel_id", requestedChannelId);
        const { data: conv } = await convQuery.limit(1).maybeSingle();
        convId = conv?.id || null;
      }
      if (convId) {
        await adminClient.from("messages").insert({
          conversation_id: convId,
          sender: "agent",
          content: queueContent,
          message_type: queueType === "template" ? "template" : queueType,
          status: "pending",
          metadata: { queued: true, queued_at: new Date().toISOString(), sent_by: requesterUserId },
        });
      }

      await adminClient.from("message_retry_queue").insert({
        org_id: orgId,
        conversation_id: convId,
        to_phone: to,
        content: queueContent,
        message_type: queueType,
        media_url: media_url || null,
        template_name: template_name || null,
        template_language: template_language || "ar",
        template_components: template_components || [],
        channel_type: "meta_api",
        last_error: "واتساب غير مربوط",
        metadata: { phone_number_id: requestedPhoneId, channel_id: requestedChannelId },
      });

      return json({ success: true, queued: true, message: "الرسالة في قائمة الانتظار - سيتم إرسالها عند اتصال القناة" });
    }

    // ── Delete message ──
    if (delete_message_id) {
      const deleteRes = await fetch(`https://graph.facebook.com/v21.0/${delete_message_id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${config.access_token}` },
      });
      const deleteResult = await deleteRes.json();
      if (!deleteRes.ok) {
        return json({ error: deleteResult?.error?.message || "فشل حذف الرسالة" }, deleteRes.status);
      }
      // Mark message as deleted in DB
      if (conversation_id) {
        await adminClient.from("messages").update({
          content: "تم حذف هذه الرسالة",
          metadata: { is_deleted: true, deleted_at: new Date().toISOString() },
        }).eq("wa_message_id", delete_message_id);
      }
      return json({ success: true, deleted: true });
    }

    // ── Edit message ──
    if (type === "edit" && edit_message_id && message) {
      const editPayload = {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message },
        context: { message_id: edit_message_id },
      };
      // Meta uses PUT for editing
      const editRes = await fetch(`https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${config.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(editPayload),
      });
      const editResult = await editRes.json();
      if (!editRes.ok) {
        return json({ error: editResult?.error?.message || "فشل تعديل الرسالة" }, editRes.status);
      }
      // Update message in DB
      await adminClient.from("messages").update({
        content: message,
        metadata: { edited_at: new Date().toISOString() },
      }).eq("wa_message_id", edit_message_id);
      return json({ success: true, edited: true });
    }

    let messagePayload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to,
    };

    // Add reply context if provided
    if (reply_to?.wa_message_id) {
      messagePayload.context = { message_id: reply_to.wa_message_id };
    }

    // ── Reaction message ──
    if (type === "reaction" && reaction_message_id) {
      messagePayload = {
        ...messagePayload,
        type: "reaction",
        reaction: {
          message_id: reaction_message_id,
          emoji: reaction_emoji || "",
        },
      };
    }
    // ── Location message ──
    else if (type === "location" && location) {
      messagePayload = {
        ...messagePayload,
        type: "location",
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          name: location.name || undefined,
          address: location.address || undefined,
        },
      };
    }
    // ── Contacts message ──
    else if (type === "contacts" && contacts && Array.isArray(contacts)) {
      messagePayload = {
        ...messagePayload,
        type: "contacts",
        contacts: contacts.map((c: any) => ({
          name: { formatted_name: c.name || "", first_name: c.name || "" },
          phones: c.phone ? [{ phone: c.phone, type: "CELL" }] : [],
          emails: c.email ? [{ email: c.email, type: "WORK" }] : [],
        })),
      };
    }
    // ── Template message ──
    else if (type === "template") {
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

      // If media_url is a storage path, download from the primary storage first,
      // then fall back to legacy cloud storage if needed.
      if (media_url && media_url.startsWith("storage:chat-media/")) {
        const path = media_url.replace("storage:chat-media/", "");
        let fileData: Blob | null = null;

        const { data: primaryFile } = await adminClient.storage.from("chat-media").download(path);
        if (primaryFile) {
          fileData = primaryFile;
        } else {
          const { data: legacyFile, error: dlError } = await storageClient.storage.from("chat-media").download(path);
          if (legacyFile) fileData = legacyFile;
          if (dlError && !legacyFile) {
            console.error("Storage download error:", dlError);
          }
        }

        if (!fileData) {
          return json({ error: "فشل تحميل الملف من التخزين" }, 400);
        }
        const bytes = new Uint8Array(await fileData.arrayBuffer());
        const fileName = path.split("/").pop() || "file";
        const contentType = fileData.type || "application/octet-stream";
        mediaId = await uploadMediaToMeta(config.phone_number_id, config.access_token, bytes, contentType, fileName);
      }
      // If it's a direct URL, pass as link
      else if (media_url && media_url.startsWith("http")) {
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
    // ── Interactive message (buttons/list/product/product_list) ──
    else if (type === "interactive" && interactive) {
      messagePayload = {
        ...messagePayload,
        type: "interactive",
        interactive,
      };
    }
    // ── Single product message ──
    else if (type === "product") {
      const { catalog_id, product_retailer_id } = body;
      if (!catalog_id || !product_retailer_id) return json({ error: "catalog_id و product_retailer_id مطلوبين" }, 400);
      messagePayload = {
        ...messagePayload,
        type: "interactive",
        interactive: {
          type: "product",
          body: { text: message || "" },
          footer: body.footer ? { text: body.footer } : undefined,
          action: {
            catalog_id,
            product_retailer_id,
          },
        },
      };
    }
    // ── Multi-product message ──
    else if (type === "product_list") {
      const { catalog_id, sections } = body;
      if (!catalog_id || !sections || !Array.isArray(sections)) return json({ error: "catalog_id و sections مطلوبين" }, 400);
      messagePayload = {
        ...messagePayload,
        type: "interactive",
        interactive: {
          type: "product_list",
          header: { type: "text", text: body.header_text || "منتجاتنا" },
          body: { text: message || "اختر من المنتجات التالية:" },
          footer: body.footer ? { text: body.footer } : undefined,
          action: {
            catalog_id,
            sections: sections.map((s: any) => ({
              title: s.title,
              product_items: (s.products || []).map((p: any) => ({ product_retailer_id: p.product_retailer_id || p.id })),
            })),
          },
        },
      };
    }
    // ── Address message (request delivery address) ──
    else if (type === "address") {
      const { address_body, address_values } = body;
      messagePayload = {
        ...messagePayload,
        type: "interactive",
        interactive: {
          type: "address_message",
          body: { text: address_body || message || "يرجى إدخال عنوان التوصيل" },
          action: {
            name: "address_message",
            parameters: {
              country: body.country || "SA",
              values: address_values || {},
            },
          },
        },
      };
    }
    // ── CTA URL button message ──
    else if (type === "cta_url") {
      const { cta_display_text, cta_url } = body;
      if (!cta_url || !cta_display_text) return json({ error: "cta_url و cta_display_text مطلوبين" }, 400);
      messagePayload = {
        ...messagePayload,
        type: "interactive",
        interactive: {
          type: "cta_url",
          body: { text: message || "" },
          action: {
            name: "cta_url",
            parameters: {
              display_text: cta_display_text,
              url: cta_url,
            },
          },
        },
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

    await logToSystem(adminClient, "info", `إرسال رسالة ${messagePayload.type} إلى ${to}`, { type: messagePayload.type, to, template_name: template_name || null }, orgId, requesterUserId);

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
      }, orgId, requesterUserId);

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
        await logToSystem(adminClient, "info", `تمت إضافة الرسالة لقائمة إعادة المحاولة`, { to }, orgId, requesterUserId);
      }

      return json({ error: result?.error?.message || "Failed to send message", details: result, retrying: retryableStatuses.includes(response.status) }, response.status);
    }

    const waMessageId = result.messages?.[0]?.id;

    await logToSystem(adminClient, "info", `تم إرسال رسالة بنجاح إلى ${to}`, {
      wa_message_id: waMessageId,
      type: messagePayload.type,
    }, orgId, requesterUserId);

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
      let convLookup = adminClient
        .from("conversations")
        .select("id")
        .eq("customer_phone", to)
        .eq("org_id", orgId)
        .neq("status", "closed");
      if (requestedChannelId) convLookup = convLookup.eq("channel_id", requestedChannelId);
      const { data } = await convLookup.limit(1).maybeSingle();
      conversation = data;
    }

    // Create conversation if none exists (for new conversations from the dialog or first-time sends)
    if (!conversation && type !== "reaction") {
      const customerName = body.customer_name || to;
      const { data: newConv, error: newConvErr } = await adminClient
        .from("conversations")
        .insert({
          org_id: orgId,
          customer_phone: to,
          customer_name: customerName,
          channel_id: requestedChannelId || config.id,
          conversation_type: "private",
          status: "active",
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (!newConvErr && newConv) {
        conversation = newConv;
        await logToSystem(adminClient, "info", `تم إنشاء محادثة جديدة مع ${to}`, { conversation_id: newConv.id }, orgId, requesterUserId);
      } else {
        console.error("Failed to create conversation:", newConvErr);
      }
    }

    let outboundContent = message || caption || "";

    if (conversation) {
      let content = message || "";
      let msgType = "text";
      let msgMetadata: Record<string, unknown> = {};

      if (type === "reaction") {
        // For reactions, update the target message metadata instead of creating new message
        if (reaction_message_id) {
          const { data: targetMsg } = await adminClient
            .from("messages")
            .select("id, metadata")
            .eq("wa_message_id", reaction_message_id)
            .maybeSingle();

          if (targetMsg) {
            const existingMeta = (targetMsg.metadata as Record<string, any>) || {};
            const reactions = (existingMeta.reactions as any[]) || [];
            if (reaction_emoji) {
              reactions.push({ emoji: reaction_emoji, from: "agent", timestamp: new Date().toISOString() });
            }
            await adminClient.from("messages").update({
              metadata: { ...existingMeta, reactions },
            }).eq("id", targetMsg.id);
          }
        }
        // Don't create a separate message or update last_message for reactions
      } else {
        if (type === "template") {
          content = `[قالب: ${template_name}]`;
          msgType = "template";
        } else if (type === "location" && location) {
          content = location.name || location.address || "📍 موقع";
          msgType = "location";
          msgMetadata.location = location;
        } else if (type === "contacts" && contacts) {
          content = contacts.map((c: any) => `👤 ${c.name}`).join(", ") || "[جهة اتصال]";
          msgType = "contacts";
          msgMetadata.contacts = contacts;
        } else if (type === "product") {
          content = `🛍️ ${body.product_retailer_id || "منتج"}`;
          msgType = "interactive";
        } else if (type === "product_list") {
          content = `🛒 ${body.header_text || "كتالوج منتجات"}`;
          msgType = "interactive";
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

        const msgInsert: Record<string, unknown> = {
          conversation_id: conversation.id,
          wa_message_id: waMessageId,
          sender: "agent",
          message_type: msgType,
          content,
          media_url: media_url || null,
          status: "sent",
        };
        if (sender_name) {
          msgMetadata.sender_name = sender_name;
        }
        if (Object.keys(msgMetadata).length > 0) {
          msgInsert.metadata = msgMetadata;
        }
        // Add reply context to metadata
        if (reply_to) {
          const existing = (msgInsert.metadata as Record<string, any>) || {};
          existing.quoted = {
            message_id: reply_to.wa_message_id || reply_to.message_id,
            sender_name: reply_to.sender_name || "العميل",
            text: reply_to.text?.slice(0, 200) || "",
          };
          msgInsert.metadata = existing;
        }

        await adminClient.from("messages").insert(msgInsert);
        outboundContent = content;

        await adminClient
          .from("conversations")
          .update({
            last_message: content,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversation.id);
      }
    }

    // Fire outgoing webhook for message sent (non-blocking)
    if (orgId) {
      const baseUrl = Deno.env.get("SUPABASE_URL");
      const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (baseUrl && svcKey) {
        fetch(`${baseUrl}/functions/v1/dispatch-webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${svcKey}` },
          body: JSON.stringify({ org_id: orgId, event: "message.sent", data: { conversation_id: conversation_id, phone: to, content: outboundContent, message_id: waMessageId } }),
        }).catch(() => {});
      }
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
