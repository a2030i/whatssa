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

    const { action, instance_name } = await req.json();
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
            events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
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
      const res = await fetch(`${EVOLUTION_URL}/instance/connectionState/${instanceName}`, {
        headers: evoHeaders,
      });
      const data = await res.json();
      const state = data.instance?.state || data.state || "unknown";

      if (state === "open") {
        await adminClient
          .from("whatsapp_config")
          .update({
            evolution_instance_status: "connected",
            is_connected: true,
            registration_status: "connected",
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
      const { phone_number } = await req.json().catch(() => ({}));
      if (!phone_number) {
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

      // Request pairing code from Evolution API
      const pairingRes = await fetch(`${EVOLUTION_URL}/instance/connect/${instanceName}`, {
        method: "GET",
        headers: evoHeaders,
      });

      // Now request the pairing code
      const codeRes = await fetch(`${EVOLUTION_URL}/instance/connect/${instanceName}`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({
          number: phone_number.replace(/\D/g, ""),
        }),
      });

      const codeData = await codeRes.json();

      if (!codeRes.ok) {
        await logToSystem(adminClient, "error", "فشل الحصول على كود الربط", {
          http_status: codeRes.status, error: JSON.stringify(codeData).slice(0, 300),
        }, orgId, userId);
        return json({ error: codeData?.message || "فشل الحصول على كود الربط — تأكد أن السيرفر يدعم هذه الميزة" }, 400);
      }

      const pairingCode = codeData?.pairingCode || codeData?.code || null;

      if (!pairingCode) {
        await logToSystem(adminClient, "warn", "لم يتم إرجاع كود الربط من السيرفر", {
          response: JSON.stringify(codeData).slice(0, 500),
        }, orgId, userId);
        return json({ error: "السيرفر لا يدعم الربط بالكود — تأكد من تحديث Evolution API لإصدار v2+" }, 400);
      }

      await logToSystem(adminClient, "info", `تم توليد كود ربط لـ ${phone_number}`, {
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
      const { messages: messageKeys } = await req.json().catch(() => ({ messages: [] }));
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
    const res = await fetch(`${evolutionUrl}/webhook/set/${instanceName}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: webhookUrl,
        webhook_by_events: true,
        webhook_base64: false,
        events: [
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE",
          "MESSAGES_REACTION",
          "CONNECTION_UPDATE",
          "QRCODE_UPDATED",
          "PRESENCE_UPDATE",
        ],
      }),
    });
    const data = await res.json();
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
    });
  }
}
