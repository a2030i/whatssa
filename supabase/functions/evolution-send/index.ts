import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("EXTERNAL_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;

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
    // Fire-and-forget: don't block the main flow
    client.from("system_logs").insert({
      level,
      source: "edge_function",
      function_name: "evolution-send",
      message,
      metadata,
      org_id: orgId || null,
      user_id: userId || null,
    }).then(() => {}).catch((e) => console.error("Log write failed:", e));
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
      logToSystem(adminClient, "warn", "طلب إرسال Evolution بدون توثيق");
      return json({ error: "Unauthorized" }, 401);
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
    });

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      logToSystem(adminClient, "warn", "فشل التحقق من المستخدم (Evolution Send)", { error: userError?.message });
      return json({ error: "Unauthorized" }, 401);
    }

    // Parallel: fetch profile and parse body simultaneously
    const [profileResult, body] = await Promise.all([
      adminClient.from("profiles").select("org_id").eq("id", user.id).maybeSingle(),
      req.json(),
    ]);
    const profile = profileResult.data;

    if (!profile?.org_id) {
      logToSystem(adminClient, "warn", "مستخدم بدون مؤسسة حاول إرسال رسالة Evolution", {}, null, user.id);
      return json({ error: "لا توجد مؤسسة مرتبطة" }, 400);
    }

    const orgId = profile.org_id;

    const { to, message, conversation_id, reply_to, media_url, media_type, channel_id, customer_name: reqCustomerName, type, edit_message_id, delete_message_id, action, group_name, members, sender_name, poll_name, poll_options } = body;

    // ── Create Group (Evolution API) ──
    if (action === "create_group") {
      const EVOLUTION_URL = Deno.env.get("EVOLUTION_API_URL");
      const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY");
      if (!EVOLUTION_URL || !EVOLUTION_KEY) return json({ error: "إعدادات Evolution API غير مكتملة" }, 500);

      if (!group_name || !members || !Array.isArray(members) || members.length < 1) {
        return json({ error: "اسم القروب وعضو واحد على الأقل مطلوبين" }, 400);
      }

      // Resolve channel config
      let configQuery = adminClient.from("whatsapp_config")
        .select("id, evolution_instance_name, display_phone")
        .eq("org_id", orgId).eq("channel_type", "evolution").eq("is_connected", true);
      if (channel_id) configQuery = configQuery.eq("id", channel_id);
      const { data: config } = await configQuery.limit(1).maybeSingle();

      if (!config?.evolution_instance_name) {
        return json({ error: "لا يوجد رقم واتساب ويب مربوط" }, 400);
      }

      const instanceName = config.evolution_instance_name;
      const evoHeaders = { "Content-Type": "application/json", apikey: EVOLUTION_KEY };

      // Format member numbers for Evolution API
      const formattedMembers = members.map((m: string) => m.replace(/\D/g, ""));

      // Call Evolution API to create group
      const createRes = await fetch(`${EVOLUTION_URL}/group/create/${instanceName}`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({
          subject: group_name,
          participants: formattedMembers,
        }),
      });

      const createData = await createRes.json().catch(() => ({}));

      if (!createRes.ok) {
        logToSystem(adminClient, "error", "فشل إنشاء قروب Evolution", {
          error: createData, group_name, members: formattedMembers,
        }, orgId, user.id);
        return json({ error: createData?.message || createData?.response?.message || "فشل إنشاء القروب" }, createRes.status);
      }

      // Extract group JID from response
      const groupJid = createData?.id || createData?.groupId || createData?.jid || createData?.groupMetadata?.id || "";
      const groupPhone = groupJid.replace("@g.us", "");

      if (groupPhone) {
        // Create conversation entry for this group
        const { error: convError } = await adminClient.from("conversations").insert({
          customer_phone: groupPhone,
          customer_name: group_name,
          org_id: orgId,
          channel_id: config.id,
          conversation_type: "group",
          status: "open",
          last_message: `تم إنشاء القروب "${group_name}"`,
          last_message_at: new Date().toISOString(),
        });

        if (convError) {
          console.error("Failed to create group conversation:", convError);
          logToSystem(adminClient, "error", "فشل إنشاء محادثة القروب في قاعدة البيانات", {
            error: convError, group_jid: groupJid, group_name,
          }, orgId, user.id);
        }
      }

      logToSystem(adminClient, "info", `تم إنشاء قروب "${group_name}" بنجاح`, {
        group_jid: groupJid, members: formattedMembers, instance: instanceName,
      }, orgId, user.id);

      return json({ success: true, group_jid: groupJid, group_name });
    }

    // ── Delete message (Evolution API) ──
    if (delete_message_id && to) {
      const EVOLUTION_URL = Deno.env.get("EVOLUTION_API_URL");
      const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY");
      if (!EVOLUTION_URL || !EVOLUTION_KEY) return json({ error: "إعدادات Evolution API غير مكتملة" }, 500);

      // Parallel: fetch config + update DB immediately
      const [configResult] = await Promise.all([
        adminClient.from("whatsapp_config")
          .select("evolution_instance_name")
          .eq("org_id", orgId).eq("channel_type", "evolution").eq("is_connected", true)
          .limit(1).maybeSingle(),
        adminClient.from("messages").update({
          content: "تم حذف هذه الرسالة",
          metadata: { is_deleted: true, deleted_at: new Date().toISOString() },
        }).eq("wa_message_id", delete_message_id),
      ]);

      const config = configResult.data;
      if (!config?.evolution_instance_name) return json({ error: "لا يوجد رقم واتساب ويب مربوط" }, 400);

      const remoteJid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
      // Fire-and-forget: call Evolution API in background, respond immediately
      const deletePromise = fetch(`${EVOLUTION_URL}/chat/deleteMessageForEveryone/${config.evolution_instance_name}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
        body: JSON.stringify({ id: delete_message_id, remoteJid, fromMe: true }),
      }).then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          logToSystem(adminClient, "error", `فشل حذف رسالة Evolution`, { error: errData, to, id: delete_message_id }, orgId, user.id);
        }
      }).catch((e) => {
        logToSystem(adminClient, "error", `خطأ في حذف رسالة Evolution`, { error: e.message }, orgId, user.id);
      });

      // Don't await — respond immediately
      // Use waitUntil-like pattern: edge runtime will keep the promise alive
      deletePromise;

      return json({ success: true, deleted: true });
    }

    // ── Edit message (Evolution API) ──
    if (type === "edit" && edit_message_id && message && to) {
      const EVOLUTION_URL = Deno.env.get("EVOLUTION_API_URL");
      const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY");
      if (!EVOLUTION_URL || !EVOLUTION_KEY) return json({ error: "إعدادات Evolution API غير مكتملة" }, 500);

      const { data: config } = await adminClient.from("whatsapp_config")
        .select("evolution_instance_name")
        .eq("org_id", orgId).eq("channel_type", "evolution").eq("is_connected", true)
        .limit(1).maybeSingle();
      if (!config?.evolution_instance_name) return json({ error: "لا يوجد رقم واتساب ويب مربوط" }, 400);

      const cleanPhone = to.replace(/\D/g, "");
      let remoteJid = to.includes("@") ? to : `${cleanPhone}@s.whatsapp.net`;

      try {
        const statusEndpoints = [
          `${EVOLUTION_URL}/chat/findStatusMessage/${config.evolution_instance_name}`,
          `${EVOLUTION_URL}/chat/findMessages/${config.evolution_instance_name}`,
        ];

        for (const endpoint of statusEndpoints) {
          const findRes = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
            body: JSON.stringify({ where: { id: edit_message_id }, limit: 1 }),
          });

          if (!findRes.ok) continue;

          const findData = await findRes.json().catch(() => ({}));
          const rawItems = Array.isArray(findData)
            ? findData
            : Array.isArray(findData?.messages?.records)
              ? findData.messages.records
              : Array.isArray(findData?.messages)
                ? findData.messages
                : Array.isArray(findData?.data)
                  ? findData.data
                  : Array.isArray(findData?.response)
                    ? findData.response
                    : findData?.data
                      ? [findData.data]
                      : [];

          const found = rawItems.find((item: any) => (
            item?.key?.id === edit_message_id ||
            item?.keyId === edit_message_id ||
            item?.id === edit_message_id ||
            item?.messageId === edit_message_id
          ));

          const foundJid = found?.key?.remoteJid || found?.remoteJid || found?.jid || "";
          if (foundJid) {
            remoteJid = foundJid;
            break;
          }
        }
      } catch {
      }

      const editRes = await fetch(`${EVOLUTION_URL}/chat/updateMessage/${config.evolution_instance_name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
        body: JSON.stringify({
          number: cleanPhone,
          key: {
            id: edit_message_id,
            fromMe: true,
            remoteJid,
          },
          text: message,
        }),
      });

      if (!editRes.ok) {
        const errData = await editRes.json().catch(() => ({}));
        logToSystem(adminClient, "error", "فشل تعديل رسالة Evolution", {
          error: errData,
          to,
          id: edit_message_id,
          remoteJid,
          endpoint: "/chat/updateMessage",
        }, orgId, user.id);
        return json({ error: errData?.message || errData?.response?.message || "فشل تعديل الرسالة" }, editRes.status);
      }

      // Update in DB
      await adminClient.from("messages").update({
        content: message,
        metadata: { is_edited: true, edited_at: new Date().toISOString() },
      }).eq("wa_message_id", edit_message_id);

      return json({ success: true, edited: true });
    }

    if (!to || (!message && !media_url && type !== "poll")) return json({ error: "الرقم والرسالة أو الوسائط مطلوبة" }, 400);

    const EVOLUTION_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY");
    if (!EVOLUTION_URL || !EVOLUTION_KEY) {
      logToSystem(adminClient, "error", "إعدادات Evolution API غير مكتملة", {}, orgId, user.id);
      return json({ error: "إعدادات Evolution API غير مكتملة" }, 500);
    }

    // Parallel: fetch config + resolve conversation simultaneously
    const [configResult, convResult] = await Promise.all([
      adminClient.from("whatsapp_config").select("*").eq("org_id", orgId).eq("channel_type", "evolution").eq("is_connected", true).limit(1).maybeSingle(),
      conversation_id
        ? adminClient.from("conversations").select("id").eq("id", conversation_id).eq("org_id", orgId).maybeSingle()
        : adminClient.from("conversations").select("id").eq("customer_phone", to).eq("org_id", orgId).neq("status", "closed").limit(1).maybeSingle(),
    ]);

    const config = configResult.data;
    if (!config || !config.evolution_instance_name) {
      logToSystem(adminClient, "error", "واتساب ويب غير مربوط - فشل الإرسال", {}, orgId, user.id);
      return json({ error: "لا يوجد رقم واتساب ويب مربوط" }, 400);
    }

    let conversation = convResult.data;

    const instanceName = config.evolution_instance_name;
    const evoHeaders = { "Content-Type": "application/json", apikey: EVOLUTION_KEY };

    // Determine the correct remoteJid for groups
    const isGroup = to.includes("@g.us");
    const remoteJid = isGroup ? to : to.includes("@") ? to : `${to}@s.whatsapp.net`;

    let waMessageId: string | null = null;
    let sentContent = message || "";
    let sentMediaUrl: string | null = null;
    let sentMessageType = "text";

    // ── Send media if provided ──
    if (media_url) {
      sentMessageType = media_type || "image";
      // Get signed URL if it's a storage path
      let publicUrl = media_url;
      if (media_url.startsWith("storage:chat-media/")) {
        const path = media_url.replace("storage:chat-media/", "");
        const { data: signedData } = await adminClient.storage.from("chat-media").createSignedUrl(path, 3600);
        if (signedData?.signedUrl) publicUrl = signedData.signedUrl;
      }

      sentMediaUrl = media_url;

      // For audio, use sendWhatsAppAudio endpoint for proper voice note delivery
      if (sentMessageType === "audio") {
        const audioBody: Record<string, unknown> = {
          number: to,
          audio: publicUrl,
        };

        if (reply_to?.wa_message_id) {
          audioBody.quoted = {
            key: { remoteJid, fromMe: false, id: reply_to.wa_message_id },
            message: { conversation: reply_to.text || "" },
          };
        }

        logToSystem(adminClient, "info", `إرسال صوت Evolution إلى ${to}`, {
          to, instance: instanceName, media_type: "audio",
        }, orgId, user.id);

        const response = await fetch(`${EVOLUTION_URL}/message/sendWhatsAppAudio/${instanceName}`, {
          method: "POST", headers: evoHeaders, body: JSON.stringify(audioBody),
        });

        const result = await response.json();
        if (!response.ok) {
          logToSystem(adminClient, "error", `فشل إرسال صوت Evolution إلى ${to}`, {
            to, http_status: response.status, error: result?.message || "unknown",
          }, orgId, user.id);
          return json({ error: result?.message || "فشل إرسال الصوت عبر Evolution" }, response.status);
        }

        waMessageId = result.key?.id || null;
        sentContent = "[audio]";
      } else {
        // Non-audio media (image, video, document)
        const mediaBody: Record<string, unknown> = {
          number: to,
          mediatype: sentMessageType === "image" ? "image" : sentMessageType === "video" ? "video" : "document",
          media: publicUrl,
          caption: message || "",
        };

        if (reply_to?.wa_message_id) {
          mediaBody.quoted = {
            key: { remoteJid, fromMe: false, id: reply_to.wa_message_id },
            message: { conversation: reply_to.text || "" },
          };
        }

        logToSystem(adminClient, "info", `إرسال وسائط Evolution (${sentMessageType}) إلى ${to}`, {
          to, instance: instanceName, media_type: sentMessageType,
        }, orgId, user.id);

        const response = await fetch(`${EVOLUTION_URL}/message/sendMedia/${instanceName}`, {
          method: "POST", headers: evoHeaders, body: JSON.stringify(mediaBody),
        });

        const result = await response.json();
        if (!response.ok) {
          logToSystem(adminClient, "error", `فشل إرسال وسائط Evolution إلى ${to}`, {
            to, http_status: response.status, error: result?.message || "unknown",
          }, orgId, user.id);
          return json({ error: result?.message || "فشل إرسال الوسائط عبر Evolution" }, response.status);
        }

        waMessageId = result.key?.id || null;
        sentContent = message || `[${sentMessageType}]`;
      }
    } else if (type === "poll" && poll_name && Array.isArray(poll_options) && poll_options.length >= 2) {
      // ── Send poll ──
      const pollBody: Record<string, unknown> = {
        number: to,
        name: poll_name,
        values: poll_options,
        selectableCount: 1,
      };

      logToSystem(adminClient, "info", `إرسال تصويت Evolution إلى ${to}`, {
        to, instance: instanceName, poll_name,
      }, orgId, user.id);

      const response = await fetch(`${EVOLUTION_URL}/message/sendPoll/${instanceName}`, {
        method: "POST", headers: evoHeaders, body: JSON.stringify(pollBody),
      });

      const result = await response.json();
      if (!response.ok) {
        logToSystem(adminClient, "error", `فشل إرسال تصويت Evolution إلى ${to}`, {
          to, http_status: response.status, error: result?.message || "unknown",
        }, orgId, user.id);
        return json({ error: result?.message || "فشل إرسال التصويت عبر Evolution" }, response.status);
      }

      waMessageId = result.key?.id || null;
      sentContent = `📊 ${poll_name}`;
      sentMessageType = "poll";
    } else {
      // ── Send text message ──
      const sendBody: Record<string, unknown> = { number: to, text: message };

      // Support mentions in group messages
      if (isGroup && message) {
        const mentionPattern = /@(\d+)/g;
        const mentionedNumbers: string[] = [];
        let match;
        while ((match = mentionPattern.exec(message)) !== null) {
          mentionedNumbers.push(`${match[1]}@s.whatsapp.net`);
        }
        if (mentionedNumbers.length > 0) {
          sendBody.mentioned = mentionedNumbers;
        }
      }

      if (reply_to?.wa_message_id) {
        sendBody.quoted = {
          key: { remoteJid, fromMe: false, id: reply_to.wa_message_id },
          message: { conversation: reply_to.text || "" },
        };
      }

      logToSystem(adminClient, "info", `إرسال رسالة Evolution إلى ${to}`, {
        to, instance: instanceName, has_reply: !!reply_to,
      }, orgId, user.id);

      const response = await fetch(`${EVOLUTION_URL}/message/sendText/${instanceName}`, {
        method: "POST", headers: evoHeaders, body: JSON.stringify(sendBody),
      });

      const result = await response.json();
      if (!response.ok) {
        logToSystem(adminClient, "error", `فشل إرسال رسالة Evolution إلى ${to}`, {
          to, http_status: response.status, error: result?.message || "unknown", instance: instanceName,
        }, orgId, user.id);
        return json({ error: result?.message || "فشل إرسال الرسالة عبر Evolution" }, response.status);
      }

      waMessageId = result.key?.id || null;
    }

    logToSystem(adminClient, "info", `تم إرسال رسالة Evolution بنجاح إلى ${to}`, {
      wa_message_id: waMessageId, type: sentMessageType,
    }, orgId, user.id);

    // Create conversation if none exists
    if (!conversation) {
      const { data: newConv } = await adminClient
        .from("conversations")
        .insert({
          org_id: orgId,
          customer_phone: to,
          customer_name: reqCustomerName || to,
          channel_id: channel_id || config.id,
          status: "active",
          last_message: sentContent,
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      conversation = newConv;
      logToSystem(adminClient, "info", `تم إنشاء محادثة جديدة (Evolution Send) للرقم ${to}`, {
        conversation_id: newConv?.id,
      }, orgId, user.id);
    }

    if (conversation) {
      const msgMetadata: Record<string, unknown> = {};
      if (sender_name) {
        msgMetadata.sender_name = sender_name;
      }
      if (reply_to) {
        msgMetadata.quoted = {
          message_id: reply_to.message_id,
          sender_name: reply_to.sender_name || "",
          text: reply_to.text || "",
        };
      }
      if (type === "poll" && poll_name && poll_options) {
        msgMetadata.poll = {
          question: poll_name,
          options: poll_options.map((opt: string, i: number) => ({ id: `opt_${i}`, title: opt })),
          votes: {},
        };
      }

      // Parallel: insert message + update conversation simultaneously
      await Promise.all([
        adminClient.from("messages").insert({
          conversation_id: conversation.id,
          wa_message_id: waMessageId,
          sender: "agent",
          message_type: sentMessageType,
          content: sentContent,
          media_url: sentMediaUrl,
          status: "sent",
          metadata: Object.keys(msgMetadata).length > 0 ? msgMetadata : {},
        }),
        adminClient.from("conversations").update({
          last_message: sentContent,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", conversation.id),
      ]);
    }

    return json({ success: true, message_id: waMessageId, conversation_id: conversation?.id || null });
  } catch (err: any) {
    logToSystem(adminClient, "critical", "خطأ غير متوقع في إرسال رسالة Evolution", {
      error: err.message,
    });
    console.error("Evolution send error:", err);
    return json({ error: err.message }, 500);
  }
});
