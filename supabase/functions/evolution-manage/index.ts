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

const EVOLUTION_WEBHOOK_EVENTS = [
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "MESSAGES_EDITED",
  "MESSAGES_DELETE",
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
  "PRESENCE_UPDATE",
  "SEND_MESSAGE",
];

const mapEvolutionMessageStatus = (status: unknown): "sent" | "delivered" | "read" | null => {
  const statusMap: Record<string, "sent" | "delivered" | "read"> = {
    SERVER_ACK: "sent",
    DELIVERY_ACK: "delivered",
    READ: "read",
    PLAYED: "read",
    "2": "sent",
    "3": "delivered",
    "4": "read",
    "5": "read",
  };

  return statusMap[String(status)] || null;
};

const pickBestEvolutionStatus = (payload: any): "sent" | "delivered" | "read" | null => {
  const priority: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
  const candidates = [
    payload?.status,
    payload?.messageStatus,
    payload?.update?.status,
    payload?.data?.status,
    ...(Array.isArray(payload?.MessageUpdate) ? payload.MessageUpdate.map((item: any) => item?.status) : []),
    ...(Array.isArray(payload?.messageUpdate) ? payload.messageUpdate.map((item: any) => item?.status) : []),
  ]
    .map(mapEvolutionMessageStatus)
    .filter(Boolean) as Array<"sent" | "delivered" | "read">;

  return candidates.reduce<"sent" | "delivered" | "read" | null>((best, current) => {
    if (!best) return current;
    return (priority[current] || 0) > (priority[best] || 0) ? current : best;
  }, null);
};

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
      function_name: "evolution-manage",
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
    if (!authorization) return json({ error: "Unauthorized" }, 401);

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
    });

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.org_id) return json({ error: "لا توجد مؤسسة مرتبطة" }, 400);

    const orgId = profile.org_id;
    const userId = user.id;

    const EVOLUTION_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY");

    if (!EVOLUTION_URL || !EVOLUTION_KEY) {
      await logToSystem(adminClient, "error", "إعدادات Evolution API غير مكتملة", {}, orgId, userId);
      return json({ error: "إعدادات Evolution API غير مكتملة" }, 500);
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "بيانات الطلب غير صالحة" }, 400);
    }

    const payload = body as Record<string, any>;
    const action = typeof payload.action === "string" ? payload.action : "";
    const instance_name = typeof payload.instance_name === "string" ? payload.instance_name : undefined;
    const asString = (value: unknown) => typeof value === "string" ? value.trim() : "";
    const asStringArray = (value: unknown) =>
      Array.isArray(value)
        ? value
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
    const asNumber = (value: unknown, fallback = 0) =>
      typeof value === "number" && Number.isFinite(value) ? value : fallback;
    const instanceName = instance_name || `org_${orgId.replace(/-/g, "").slice(0, 12)}`;

    const evoHeaders = {
      "Content-Type": "application/json",
      apikey: EVOLUTION_KEY,
    };

    const webhookUrl = `${SUPABASE_URL}/functions/v1/evolution-webhook`;

    await logToSystem(adminClient, "info", `طلب إدارة Evolution: ${action}`, {
      action, instance: instanceName,
    }, orgId, userId);

    // ── CREATE INSTANCE ──
    if (action === "create") {
      const createRes = await fetch(`${EVOLUTION_URL}/instance/create`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({
          instanceName,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
          webhook: {
            url: webhookUrl,
            byEvents: true,
            webhookBase64: false,
            events: EVOLUTION_WEBHOOK_EVENTS,
          },
        }),
      });

      const createData = await createRes.json();

      if (!createRes.ok && !createData?.instance) {
        const errMsg = JSON.stringify(createData || {});
        const isAlreadyExists = errMsg.toLowerCase().includes("already in use") ||
          errMsg.toLowerCase().includes("already exists") ||
          createData?.message?.includes?.("already") ||
          createData?.error?.includes?.("already") ||
          (Array.isArray(createData?.response?.message) && createData.response.message.some((m: string) => m.toLowerCase().includes("already")));

        if (isAlreadyExists) {
          await logToSystem(adminClient, "info", `الجلسة موجودة مسبقاً، إعادة ربط: ${instanceName}`, {}, orgId, userId);
          await setWebhook(EVOLUTION_URL, evoHeaders, instanceName, webhookUrl, adminClient, orgId);
          const connectRes = await fetch(`${EVOLUTION_URL}/instance/connect/${instanceName}`, {
            headers: evoHeaders,
          });
          const connectData = await connectRes.json();
          await upsertConfig(adminClient, orgId, instanceName);
          return json({
            success: true,
            instance_name: instanceName,
            qr_code: connectData.base64 || connectData.qrcode?.base64 || null,
            status: connectData.instance?.state || "connecting",
            already_existed: true,
          });
        }

        await logToSystem(adminClient, "error", "فشل إنشاء جلسة Evolution", {
          http_status: createRes.status, error: createData?.message || errMsg.slice(0, 300),
        }, orgId, userId);
        return json({ error: createData?.response?.message?.[0] || createData?.message || "فشل إنشاء الجلسة" }, 400);
      }

      await setWebhook(EVOLUTION_URL, evoHeaders, instanceName, webhookUrl, adminClient, orgId);
      await upsertConfig(adminClient, orgId, instanceName);

      const qr = createData?.qrcode?.base64 || createData?.base64 || null;

      await logToSystem(adminClient, "info", `تم إنشاء جلسة Evolution بنجاح: ${instanceName}`, {
        has_qr: !!qr,
      }, orgId, userId);

      return json({
        success: true,
        instance_name: instanceName,
        qr_code: qr,
        status: qr ? "qr_ready" : "created",
      });
    }

    // ── GET QR CODE ──
    if (action === "connect" || action === "qr") {
      try {
        const stateRes = await fetch(`${EVOLUTION_URL}/instance/connectionState/${instanceName}`, {
          headers: evoHeaders,
        });
        const stateData = await stateRes.json();
        const currentState = stateData.instance?.state || stateData.state || "unknown";

        if (currentState === "open") {
          await syncInstanceIdentity(adminClient, orgId, instanceName, EVOLUTION_URL, evoHeaders);
          return json({ success: true, qr_code: null, status: "open" });
        }
      } catch (e) {
        await logToSystem(adminClient, "warn", "فشل التحقق من حالة الجلسة", {
          error: e instanceof Error ? e.message : String(e), instance: instanceName,
        }, orgId, userId);
      }

      const connectRes = await fetch(`${EVOLUTION_URL}/instance/connect/${instanceName}`, {
        headers: evoHeaders,
      });
      const connectData = await connectRes.json();
      const qr = connectData.base64 || connectData.qrcode?.base64 || null;

      return json({
        success: true,
        qr_code: qr,
        status: qr ? "qr_ready" : "waiting",
      });
    }

    // ── CHECK STATUS ──
    if (action === "status") {
      await setWebhook(EVOLUTION_URL, evoHeaders, instanceName, webhookUrl, adminClient, orgId);

      const res = await fetch(`${EVOLUTION_URL}/instance/connectionState/${instanceName}`, {
        headers: evoHeaders,
      });
      const data = await res.json();
      const state = data.instance?.state || data.state || "unknown";

      if (state === "open") {
        const identity = await syncInstanceIdentity(adminClient, orgId, instanceName, EVOLUTION_URL, evoHeaders);
        await adminClient
          .from("whatsapp_config")
          .update({
            evolution_instance_status: "connected",
            is_connected: true,
            registration_status: "connected",
            ...(identity.display_phone ? { display_phone: identity.display_phone } : {}),
            ...(identity.business_name ? { business_name: identity.business_name } : {}),
          })
          .eq("evolution_instance_name", instanceName)
          .eq("org_id", orgId);
      }

      return json({
        success: true,
        status: state,
        instance_name: instanceName,
      });
    }

    // ── SYNC MESSAGE STATUS UPDATES ──
    if (action === "sync_message_statuses") {
      const phone = asString(payload.phone);
      const messages = Array.isArray(payload.messages) ? payload.messages : [];

      if (!phone || messages.length === 0) {
        return json({ success: true, updated: 0 });
      }

      const remoteJid = phone.includes("@") ? phone : `${phone.replace(/\D/g, "")}@s.whatsapp.net`;
      const priority: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
      let updated = 0;

      for (const item of messages) {
        const messageId = asString(item?.message_id || item?.id || item?.wa_message_id);
        if (!messageId) continue;

        try {
          const statusRes = await fetch(`${EVOLUTION_URL}/chat/findStatusMessage/${instanceName}`, {
            method: "POST",
            headers: evoHeaders,
            body: JSON.stringify({
              where: {
                id: messageId,
                remoteJid,
                fromMe: true,
              },
              limit: 1,
            }),
          });

          const statusData = await statusRes.json().catch(() => ({}));
          if (!statusRes.ok) continue;

          const statusPayload = Array.isArray(statusData)
            ? statusData[0]
            : Array.isArray(statusData?.data)
              ? statusData.data[0]
              : statusData?.data || statusData;

          const mappedStatus = pickBestEvolutionStatus(statusPayload);
          if (!mappedStatus) continue;

          const { data: existingMsg } = await adminClient
            .from("messages")
            .select("id, status")
            .eq("wa_message_id", messageId)
            .limit(1)
            .maybeSingle();

          if (!existingMsg) continue;

          if ((priority[mappedStatus] || 0) > (priority[existingMsg.status || ""] || 0)) {
            await adminClient.from("messages").update({ status: mappedStatus }).eq("id", existingMsg.id);
            updated += 1;
          }
        } catch {
          continue;
        }
      }

      return json({ success: true, updated });
    }

    // ── DELETE INSTANCE ──
    if (action === "delete") {
      await fetch(`${EVOLUTION_URL}/instance/delete/${instanceName}`, {
        method: "DELETE",
        headers: evoHeaders,
      });

      await adminClient
        .from("whatsapp_config")
        .delete()
        .eq("evolution_instance_name", instanceName)
        .eq("org_id", orgId);

      await logToSystem(adminClient, "warn", `تم حذف جلسة Evolution: ${instanceName}`, {}, orgId, userId);

      return json({ success: true, deleted: instanceName });
    }

    // ── LOGOUT ──
    if (action === "logout") {
      await fetch(`${EVOLUTION_URL}/instance/logout/${instanceName}`, {
        method: "DELETE",
        headers: evoHeaders,
      });

      await adminClient
        .from("whatsapp_config")
        .update({
          evolution_instance_status: "disconnected",
          is_connected: false,
          registration_status: "pending",
        })
        .eq("evolution_instance_name", instanceName)
        .eq("org_id", orgId);

      await logToSystem(adminClient, "info", `تم تسجيل الخروج من جلسة Evolution: ${instanceName}`, {}, orgId, userId);

      return json({ success: true, logged_out: instanceName });
    }

    // ── PAIRING CODE (Phone Number Linking) ──
    if (action === "pairing_code") {
      const phoneNumber = asString(payload.phone_number);
      if (!phoneNumber) {
        return json({ error: "رقم الهاتف مطلوب" }, 400);
      }

      // Ensure instance exists and is in connecting state
      try {
        const stateRes = await fetch(`${EVOLUTION_URL}/instance/connectionState/${instanceName}`, {
          headers: evoHeaders,
        });
        const stateData = await stateRes.json();
        const currentState = stateData.instance?.state || stateData.state || "unknown";

        if (currentState === "open") {
          return json({ success: true, status: "open", pairing_code: null });
        }
      } catch {
        // Instance might not exist, continue
      }

      const cleanPhone = phoneNumber.replace(/\D/g, "");
      const connectUrl = `${EVOLUTION_URL}/instance/connect/${instanceName}`;

      let codeRes = await fetch(`${connectUrl}?number=${encodeURIComponent(cleanPhone)}`, {
        headers: evoHeaders,
      });
      let codeData = await codeRes.json().catch(() => ({}));

      if (!codeRes.ok || !(codeData?.pairingCode || codeData?.code)) {
        const fallbackRes = await fetch(connectUrl, {
          method: "POST",
          headers: evoHeaders,
          body: JSON.stringify({ number: cleanPhone }),
        });
        codeRes = fallbackRes;
        codeData = await fallbackRes.json().catch(() => ({}));
      }

      if (!codeRes.ok) {
        await logToSystem(adminClient, "error", "فشل الحصول على كود الربط", {
          http_status: codeRes.status, error: JSON.stringify(codeData).slice(0, 300),
        }, orgId, userId);
        return json({ error: codeData?.message || "فشل الحصول على كود الربط — تأكد أن السيرفر يدعم هذه الميزة" }, 400);
      }

      // pairingCode is 8 alphanumeric chars; codeData.code is the QR string — never use it as pairing code
      const rawCode = codeData?.pairingCode || null;
      const pairingCode = rawCode && /^[A-Z0-9]{4,8}$/i.test(rawCode) ? rawCode : null;

      if (!pairingCode) {
        await logToSystem(adminClient, "warn", "لم يتم إرجاع كود الربط من السيرفر", {
          response: JSON.stringify(codeData).slice(0, 500),
        }, orgId, userId);
        return json({ error: "السيرفر لا يدعم الربط بالكود — تأكد من تحديث Evolution API لإصدار v2+" }, 400);
      }

      await logToSystem(adminClient, "info", `تم توليد كود ربط لـ ${phoneNumber}`, {
        instance: instanceName,
      }, orgId, userId);

      return json({
        success: true,
        pairing_code: pairingCode,
        status: "pairing_code_ready",
      });
    }

    // ── SEND READ RECEIPT ──
    if (action === "read_messages") {
      const messageKeys = Array.isArray(payload.messages) ? payload.messages : [];
      if (!messageKeys || !Array.isArray(messageKeys) || messageKeys.length === 0) {
        return json({ success: true }); // Nothing to mark
      }

      try {
        const readRes = await fetch(`${EVOLUTION_URL}/chat/markMessageAsRead/${instanceName}`, {
          method: "PUT",
          headers: evoHeaders,
          body: JSON.stringify({
            readMessages: messageKeys,
          }),
        });

        if (!readRes.ok) {
          // Silent fail — not critical
          await logToSystem(adminClient, "warn", "فشل إرسال إشعار قراءة إلى Evolution", {
            http_status: readRes.status, count: messageKeys.length,
          }, orgId, userId);
        }
      } catch {
        // Silent fail
      }

      return json({ success: true });
    }

    // ── BLOCK CONTACT ──
    if (action === "block_contact") {
      const blockPhone = asString(payload.phone);
      if (!blockPhone) return json({ error: "رقم الهاتف مطلوب" }, 400);
      const blockRes = await fetch(`${EVOLUTION_URL}/chat/updateBlockStatus/${instanceName}`, {
        method: "PUT",
        headers: evoHeaders,
        body: JSON.stringify({ number: blockPhone.replace(/\D/g, ""), status: "block" }),
      });
      const blockData = await blockRes.json();
      await logToSystem(adminClient, "info", `تم حظر جهة اتصال: ${blockPhone}`, { instance: instanceName }, orgId, userId);
      return json({ success: blockRes.ok, data: blockData });
    }

    // ── UNBLOCK CONTACT ──
    if (action === "unblock_contact") {
      const unblockPhone = asString(payload.phone);
      if (!unblockPhone) return json({ error: "رقم الهاتف مطلوب" }, 400);
      const unblockRes = await fetch(`${EVOLUTION_URL}/chat/updateBlockStatus/${instanceName}`, {
        method: "PUT",
        headers: evoHeaders,
        body: JSON.stringify({ number: unblockPhone.replace(/\D/g, ""), status: "unblock" }),
      });
      const unblockData = await unblockRes.json();
      await logToSystem(adminClient, "info", `تم إلغاء حظر جهة اتصال: ${unblockPhone}`, { instance: instanceName }, orgId, userId);
      return json({ success: unblockRes.ok, data: unblockData });
    }

    // ── ARCHIVE CHAT ──
    if (action === "archive_chat") {
      const archivePhone = asString(payload.phone);
      const archive = typeof payload.archive === "boolean" ? payload.archive : true;
      if (!archivePhone) return json({ error: "رقم الهاتف مطلوب" }, 400);
      const archiveRes = await fetch(`${EVOLUTION_URL}/chat/archiveChat/${instanceName}`, {
        method: "PUT",
        headers: evoHeaders,
        body: JSON.stringify({
          lastMessage: { key: { remoteJid: `${archivePhone.replace(/\D/g, "")}@s.whatsapp.net` } },
          archive,
        }),
      });
      return json({ success: archiveRes.ok });
    }

    // ── SEND POLL ──
    if (action === "send_poll") {
      const pollPhone = asString(payload.phone);
      const question = asString(payload.question);
      const options = asStringArray(payload.options);
      if (!pollPhone || !question || !options?.length) return json({ error: "البيانات ناقصة" }, 400);
      const pollRes = await fetch(`${EVOLUTION_URL}/message/sendPoll/${instanceName}`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({
          number: pollPhone.replace(/\D/g, ""),
          name: question,
          values: options,
          selectableCount: options.length,
        }),
      });
      const pollData = await pollRes.json();
      if (!pollRes.ok) {
        await logToSystem(adminClient, "error", "فشل إرسال استطلاع", { error: JSON.stringify(pollData).slice(0, 300) }, orgId, userId);
        return json({ error: "فشل إرسال الاستطلاع" }, 400);
      }
      await logToSystem(adminClient, "info", `تم إرسال استطلاع إلى ${pollPhone}`, { question }, orgId, userId);
      return json({ success: true, data: pollData });
    }

    // ── SEND STICKER ──
    if (action === "send_sticker") {
      const stickerPhone = asString(payload.phone);
      const sticker_url = asString(payload.sticker_url);
      if (!stickerPhone || !sticker_url) return json({ error: "البيانات ناقصة" }, 400);
      const stickerRes = await fetch(`${EVOLUTION_URL}/message/sendSticker/${instanceName}`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({ number: stickerPhone.replace(/\D/g, ""), sticker: sticker_url }),
      });
      const stickerData = await stickerRes.json();
      return json({ success: stickerRes.ok, data: stickerData });
    }

    // ── GROUP: GET INFO ──
    if (action === "group_info") {
      const group_jid = asString(payload.group_jid);
      if (!group_jid) return json({ error: "معرف المجموعة مطلوب" }, 400);
      const infoRes = await fetch(`${EVOLUTION_URL}/group/findGroupInfos/${instanceName}?groupJid=${group_jid}`, {
        headers: evoHeaders,
      });
      const infoData = await infoRes.json();
      return json({ success: infoRes.ok, data: infoData });
    }

    // ── GROUP: ADD PARTICIPANTS ──
    if (action === "group_add") {
      const group_jid = asString(payload.group_jid);
      const participants = asStringArray(payload.participants);
      if (!group_jid || !participants?.length) return json({ error: "البيانات ناقصة" }, 400);
      const addRes = await fetch(`${EVOLUTION_URL}/group/updateParticipant/${instanceName}?groupJid=${group_jid}`, {
        method: "PUT",
        headers: evoHeaders,
        body: JSON.stringify({ action: "add", participants: participants.map((p: string) => `${p.replace(/\D/g, "")}@s.whatsapp.net`) }),
      });
      const addData = await addRes.json();
      await logToSystem(adminClient, "info", `تمت إضافة أعضاء للمجموعة`, { group_jid, count: participants.length }, orgId, userId);
      return json({ success: addRes.ok, data: addData });
    }

    // ── GROUP: REMOVE PARTICIPANTS ──
    if (action === "group_remove") {
      const group_jid = asString(payload.group_jid);
      const participants = asStringArray(payload.participants);
      if (!group_jid || !participants?.length) return json({ error: "البيانات ناقصة" }, 400);
      const removeRes = await fetch(`${EVOLUTION_URL}/group/updateParticipant/${instanceName}?groupJid=${group_jid}`, {
        method: "PUT",
        headers: evoHeaders,
        body: JSON.stringify({ action: "remove", participants: participants.map((p: string) => `${p.replace(/\D/g, "")}@s.whatsapp.net`) }),
      });
      const removeData = await removeRes.json();
      await logToSystem(adminClient, "info", `تمت إزالة أعضاء من المجموعة`, { group_jid, count: participants.length }, orgId, userId);
      return json({ success: removeRes.ok, data: removeData });
    }

    // ── GROUP: UPDATE SETTINGS ──
    if (action === "group_settings") {
      const group_jid = asString(payload.group_jid);
      const subject = asString(payload.subject);
      const description = asString(payload.description);
      if (!group_jid) return json({ error: "معرف المجموعة مطلوب" }, 400);
      if (subject) {
        await fetch(`${EVOLUTION_URL}/group/updateGroupSubject/${instanceName}?groupJid=${group_jid}`, {
          method: "PUT", headers: evoHeaders,
          body: JSON.stringify({ subject }),
        });
      }
      if (description) {
        await fetch(`${EVOLUTION_URL}/group/updateGroupDescription/${instanceName}?groupJid=${group_jid}`, {
          method: "PUT", headers: evoHeaders,
          body: JSON.stringify({ description }),
        });
      }
      await logToSystem(adminClient, "info", `تم تحديث إعدادات المجموعة`, { group_jid }, orgId, userId);
      return json({ success: true });
    }

    // ── SET DISAPPEARING MESSAGES ──
    if (action === "set_disappearing") {
      const disappearPhone = asString(payload.phone);
      const expiration = asNumber(payload.expiration, 0);
      if (!disappearPhone) return json({ error: "رقم الهاتف مطلوب" }, 400);
      const disappearRes = await fetch(`${EVOLUTION_URL}/chat/setDisappearingMessages/${instanceName}`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({
          number: `${disappearPhone.replace(/\D/g, "")}@s.whatsapp.net`,
          expiration, // 0=off, 86400=24h, 604800=7d, 7776000=90d
        }),
      });
      return json({ success: disappearRes.ok });
    }

    // ── FETCH PROFILE PICTURE ──
    if (action === "profile_picture") {
      const picPhone = asString(payload.phone);
      if (!picPhone) return json({ error: "رقم الهاتف مطلوب" }, 400);
      const picRes = await fetch(`${EVOLUTION_URL}/chat/fetchProfilePictureUrl/${instanceName}`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({ number: `${picPhone.replace(/\D/g, "")}@s.whatsapp.net` }),
      });
      const picData = await picRes.json();
      return json({ success: picRes.ok, url: picData?.profilePictureUrl || picData?.url || null });
    }

    // ── CHECK IF NUMBER EXISTS ON WHATSAPP ──
    if (action === "check_number") {
      const checkPhone = asString(payload.phone);
      if (!checkPhone) return json({ error: "رقم الهاتف مطلوب" }, 400);
      const checkRes = await fetch(`${EVOLUTION_URL}/chat/whatsappNumbers/${instanceName}`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({ numbers: [checkPhone.replace(/\D/g, "")] }),
      });
      const checkData = await checkRes.json();
      return json({ success: checkRes.ok, data: checkData });
    }

    // ── SEND REACTION ──
    if (action === "send_reaction") {
      const reactPhone = asString(payload.phone);
      const message_id = asString(payload.message_id);
      const emoji = asString(payload.emoji);
      if (!reactPhone || !message_id) return json({ error: "البيانات ناقصة" }, 400);
      const reactRes = await fetch(`${EVOLUTION_URL}/message/sendReaction/${instanceName}`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({
          key: {
            remoteJid: `${reactPhone.replace(/\D/g, "")}@s.whatsapp.net`,
            id: message_id,
          },
          reaction: emoji || "", // empty = remove reaction
        }),
      });
      return json({ success: reactRes.ok });
    }

    // ── POST STATUS/STORY ──
    if (action === "post_status") {
      const statusContent = asString(payload.content);
      const statusMediaUrl = asString(payload.media_url);
      const statusMediaType = asString(payload.media_type);
      const background_color = asString(payload.background_color);
      const font = asNumber(payload.font, 1);
      const statusCaption = asString(payload.caption);
      
      if (statusMediaUrl) {
        // Media status (image/video)
        const statusRes = await fetch(`${EVOLUTION_URL}/message/sendStatus/${instanceName}`, {
          method: "POST",
          headers: evoHeaders,
          body: JSON.stringify({
            type: statusMediaType || "image",
            content: statusMediaUrl,
            caption: statusCaption || "",
            statusJidList: ["broadcast"],
          }),
        });
        const statusData = await statusRes.json();
        await logToSystem(adminClient, "info", `تم نشر حالة (وسائط)`, { type: statusMediaType }, orgId, userId);
        return json({ success: statusRes.ok, data: statusData });
      } else if (statusContent) {
        // Text status
        const statusRes = await fetch(`${EVOLUTION_URL}/message/sendStatus/${instanceName}`, {
          method: "POST",
          headers: evoHeaders,
          body: JSON.stringify({
            type: "text",
            content: statusContent,
            backgroundColor: background_color || "#00bfa5",
            font: font || 1,
            statusJidList: ["broadcast"],
          }),
        });
        const statusData = await statusRes.json();
        await logToSystem(adminClient, "info", `تم نشر حالة (نص)`, {}, orgId, userId);
        return json({ success: statusRes.ok, data: statusData });
      }
      return json({ error: "محتوى الحالة مطلوب" }, 400);
    }

    // ── GET STATUS UPDATES ──
    if (action === "get_status") {
      const statusRes = await fetch(`${EVOLUTION_URL}/chat/findStatusMessage/${instanceName}`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({}),
      });
      const statusData = await statusRes.json();
      return json({ success: statusRes.ok, data: statusData });
    }

    // ── EDIT MESSAGE ──
    if (action === "edit_message") {
      const editPhone = asString(payload.phone);
      const editMsgId = asString(payload.message_id);
      const new_text = asString(payload.new_text);
      if (!editPhone || !editMsgId || !new_text) return json({ error: "البيانات ناقصة" }, 400);
      const editRes = await fetch(`${EVOLUTION_URL}/message/editMessage/${instanceName}`, {
        method: "PUT",
        headers: evoHeaders,
        body: JSON.stringify({
          number: editPhone.replace(/\D/g, ""),
          key: { id: editMsgId, fromMe: true, remoteJid: `${editPhone.replace(/\D/g, "")}@s.whatsapp.net` },
          text: new_text,
        }),
      });
      const editData = await editRes.json();
      if (editRes.ok) {
        // Update in DB
        await adminClient.from("messages").update({
          content: new_text,
          metadata: { edited_at: new Date().toISOString() },
        }).eq("wa_message_id", editMsgId);
        await logToSystem(adminClient, "info", `تم تعديل رسالة`, { message_id: editMsgId }, orgId, userId);
      }
      return json({ success: editRes.ok, data: editData });
    }

    // ── DELETE MESSAGE ──
    if (action === "delete_message") {
      const delPhone = asString(payload.phone);
      const delMsgId = asString(payload.message_id);
      if (!delPhone || !delMsgId) return json({ error: "البيانات ناقصة" }, 400);
      const delRes = await fetch(`${EVOLUTION_URL}/message/deleteMessage/${instanceName}`, {
        method: "DELETE",
        headers: evoHeaders,
        body: JSON.stringify({
          number: delPhone.replace(/\D/g, ""),
          key: { id: delMsgId, fromMe: true, remoteJid: `${delPhone.replace(/\D/g, "")}@s.whatsapp.net` },
        }),
      });
      const delData = await delRes.json();
      if (delRes.ok) {
        await adminClient.from("messages").update({
          content: "تم حذف هذه الرسالة",
          metadata: { is_deleted: true, deleted_at: new Date().toISOString() },
        }).eq("wa_message_id", delMsgId);
        await logToSystem(adminClient, "info", `تم حذف رسالة`, { message_id: delMsgId }, orgId, userId);
      }
      return json({ success: delRes.ok, data: delData });
    }

    // ── PIN MESSAGE ──
    if (action === "pin_message") {
      const pinPhone = asString(payload.phone);
      const pinMsgId = asString(payload.message_id);
      const duration = asNumber(payload.duration, 604800);
      if (!pinPhone || !pinMsgId) return json({ error: "البيانات ناقصة" }, 400);
      const pinRes = await fetch(`${EVOLUTION_URL}/chat/pinMessage/${instanceName}`, {
        method: "PUT",
        headers: evoHeaders,
        body: JSON.stringify({
          key: { id: pinMsgId, remoteJid: `${pinPhone.replace(/\D/g, "")}@s.whatsapp.net` },
          duration, // seconds: 86400=24h, 604800=7d, 2592000=30d
        }),
      });
      const pinData = await pinRes.json();
      await logToSystem(adminClient, "info", `تم تثبيت رسالة`, { message_id: pinMsgId, duration }, orgId, userId);
      return json({ success: pinRes.ok, data: pinData });
    }

    // ── UNPIN MESSAGE ──
    if (action === "unpin_message") {
      const unpinPhone = asString(payload.phone);
      const unpinMsgId = asString(payload.message_id);
      if (!unpinPhone || !unpinMsgId) return json({ error: "البيانات ناقصة" }, 400);
      const unpinRes = await fetch(`${EVOLUTION_URL}/chat/unpinMessage/${instanceName}`, {
        method: "PUT",
        headers: evoHeaders,
        body: JSON.stringify({
          key: { id: unpinMsgId, remoteJid: `${unpinPhone.replace(/\D/g, "")}@s.whatsapp.net` },
        }),
      });
      return json({ success: unpinRes.ok });
    }

    // ── SEND BROADCAST (List Message) ──
    if (action === "send_broadcast") {
      const phones = asStringArray(payload.phones);
      const broadcastText = asString(payload.text);
      const bcMediaUrl = asString(payload.media_url);
      const bcMediaType = asString(payload.media_type);
      if (!phones || !Array.isArray(phones) || phones.length === 0) return json({ error: "قائمة الأرقام مطلوبة" }, 400);
      if (!broadcastText && !bcMediaUrl) return json({ error: "نص الرسالة أو الوسائط مطلوبة" }, 400);

      const results: Array<{ phone: string; success: boolean; error?: string }> = [];
      const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

      for (const phone of phones) {
        try {
          const cleanPhone = phone.replace(/\D/g, "");
          let sendRes;
          if (bcMediaUrl) {
            sendRes = await fetch(`${EVOLUTION_URL}/message/sendMedia/${instanceName}`, {
              method: "POST",
              headers: evoHeaders,
              body: JSON.stringify({
                number: cleanPhone,
                mediatype: bcMediaType || "image",
                media: bcMediaUrl,
                caption: broadcastText || "",
              }),
            });
          } else {
            sendRes = await fetch(`${EVOLUTION_URL}/message/sendText/${instanceName}`, {
              method: "POST",
              headers: evoHeaders,
              body: JSON.stringify({ number: cleanPhone, text: broadcastText }),
            });
          }
          results.push({ phone: cleanPhone, success: sendRes.ok });
          // Rate limit: 1 message per second
          await delay(1000);
        } catch (e) {
          results.push({ phone, success: false, error: (e as Error).message });
        }
      }

      const successCount = results.filter(r => r.success).length;
      await logToSystem(adminClient, "info", `إرسال جماعي (بث): ${successCount}/${phones.length} نجحت`, { total: phones.length }, orgId, userId);
      return json({ success: true, results, sent: successCount, total: phones.length });
    }

    return json({ error: "إجراء غير معروف" }, 400);
  } catch (err: any) {
    await logToSystem(adminClient, "critical", "خطأ غير متوقع في إدارة Evolution", {
      error: err.message,
    });
    console.error("Evolution manage error:", err);
    return json({ error: err.message }, 500);
  }
});

async function setWebhook(
  evolutionUrl: string,
  headers: Record<string, string>,
  instanceName: string,
  webhookUrl: string,
  adminClient: ReturnType<typeof createClient>,
  orgId: string,
) {
  try {
    let res = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        webhook: {
          url: webhookUrl,
          byEvents: true,
          webhookBase64: false,
          events: EVOLUTION_WEBHOOK_EVENTS,
        },
      }),
    });

    let data = await res.json().catch(() => ({}));

    if (!res.ok) {
      res = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          url: webhookUrl,
          webhook_by_events: true,
          webhook_base64: false,
          events: EVOLUTION_WEBHOOK_EVENTS,
        }),
      });
      data = await res.json().catch(() => ({}));
    }

    if (!res.ok) {
      await logToSystem(adminClient, "error", "فشل تعيين Webhook لجلسة Evolution", {
        http_status: res.status, instance: instanceName, error: JSON.stringify(data).slice(0, 300),
      }, orgId);
    }
  } catch (e) {
    await logToSystem(adminClient, "error", "خطأ في تعيين Webhook لجلسة Evolution", {
      error: e instanceof Error ? e.message : String(e), instance: instanceName,
    }, orgId);
  }
}

async function syncInstanceIdentity(
  adminClient: ReturnType<typeof createClient>,
  orgId: string,
  instanceName: string,
  evolutionUrl: string,
  headers: Record<string, string>,
) {
  try {
    const res = await fetch(`${evolutionUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`, {
      headers,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { display_phone: null, business_name: null };

    const root = Array.isArray(data)
      ? data[0]
      : Array.isArray(data?.data)
        ? data.data[0]
        : data;
    const instance = root?.instance || root?.data?.instance || root;

    const ownerRaw = instance?.owner || instance?.ownerJid || instance?.wid || instance?.wuid || root?.owner || root?.ownerJid || root?.number || instance?.number || "";
    const displayPhoneCandidates = [
      ownerRaw,
      instance?.number,
      root?.number,
      instance?.phone,
      root?.phone,
      instance?.instancePhone,
      root?.instancePhone,
    ];
    const display_phone = displayPhoneCandidates
      .map((value) => typeof value === "string" ? value.replace(/@.*$/, "").replace(/\D/g, "") : "")
      .find((value) => value.length >= 6) || "";
    const business_name = [
      instance?.profileName,
      instance?.profile?.name,
      root?.profileName,
      root?.name,
    ].find((value) => typeof value === "string" && value.trim()) || "";

    if (display_phone || business_name) {
      await adminClient
        .from("whatsapp_config")
        .update({
          ...(display_phone ? { display_phone } : {}),
          ...(business_name ? { business_name } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("org_id", orgId)
        .eq("channel_type", "evolution")
        .eq("evolution_instance_name", instanceName);
    }

    return {
      display_phone: display_phone || null,
      business_name: business_name || null,
    };
  } catch {
    return { display_phone: null, business_name: null };
  }
}

async function upsertConfig(adminClient: ReturnType<typeof createClient>, orgId: string, instanceName: string) {
  const { data: existing } = await adminClient
    .from("whatsapp_config")
    .select("id")
    .eq("org_id", orgId)
    .eq("channel_type", "evolution")
    .maybeSingle();

  if (existing) {
    await adminClient
      .from("whatsapp_config")
      .update({
        evolution_instance_name: instanceName,
        evolution_instance_status: "connecting",
        display_phone: null,
        business_name: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await adminClient.from("whatsapp_config").insert({
      org_id: orgId,
      channel_type: "evolution",
      evolution_instance_name: instanceName,
      evolution_instance_status: "connecting",
      phone_number_id: `evo_${instanceName}`,
      business_account_id: `evo_${instanceName}`,
      access_token: "evolution",
      is_connected: false,
      registration_status: "pending",
      display_phone: null,
      business_name: null,
    });
  }
}
