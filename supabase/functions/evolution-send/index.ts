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
      function_name: "evolution-send",
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
      await logToSystem(adminClient, "warn", "طلب إرسال Evolution بدون توثيق");
      return json({ error: "Unauthorized" }, 401);
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
    });

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      await logToSystem(adminClient, "warn", "فشل التحقق من المستخدم (Evolution Send)", { error: userError?.message });
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.org_id) {
      await logToSystem(adminClient, "warn", "مستخدم بدون مؤسسة حاول إرسال رسالة Evolution", {}, null, user.id);
      return json({ error: "لا توجد مؤسسة مرتبطة" }, 400);
    }

    const orgId = profile.org_id;

    const { data: config } = await adminClient
      .from("whatsapp_config")
      .select("*")
      .eq("org_id", orgId)
      .eq("channel_type", "evolution")
      .eq("is_connected", true)
      .limit(1)
      .maybeSingle();

    if (!config || !config.evolution_instance_name) {
      await logToSystem(adminClient, "error", "واتساب ويب غير مربوط - فشل الإرسال", {}, orgId, user.id);
      return json({ error: "لا يوجد رقم واتساب ويب مربوط" }, 400);
    }

    const { to, message, conversation_id, reply_to } = await req.json();
    if (!to || !message) return json({ error: "الرقم والرسالة مطلوبان" }, 400);

    const EVOLUTION_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY");

    if (!EVOLUTION_URL || !EVOLUTION_KEY) {
      await logToSystem(adminClient, "error", "إعدادات Evolution API غير مكتملة", {}, orgId, user.id);
      return json({ error: "إعدادات Evolution API غير مكتملة" }, 500);
    }

    const instanceName = config.evolution_instance_name;
    const sendBody: Record<string, unknown> = { number: to, text: message };

    if (reply_to?.wa_message_id) {
      sendBody.quoted = {
        key: {
          remoteJid: to.includes("@") ? to : `${to}@s.whatsapp.net`,
          fromMe: false,
          id: reply_to.wa_message_id,
        },
        message: { conversation: reply_to.text || "" },
      };
    }

    await logToSystem(adminClient, "info", `إرسال رسالة Evolution إلى ${to}`, {
      to, instance: instanceName, has_reply: !!reply_to,
    }, orgId, user.id);

    const response = await fetch(`${EVOLUTION_URL}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: EVOLUTION_KEY,
      },
      body: JSON.stringify(sendBody),
    });

    const result = await response.json();

    if (!response.ok) {
      await logToSystem(adminClient, "error", `فشل إرسال رسالة Evolution إلى ${to}`, {
        to, http_status: response.status, error: result?.message || "unknown", instance: instanceName,
      }, orgId, user.id);
      return json({ error: result?.message || "فشل إرسال الرسالة عبر Evolution" }, response.status);
    }

    const waMessageId = result.key?.id || null;

    await logToSystem(adminClient, "info", `تم إرسال رسالة Evolution بنجاح إلى ${to}`, {
      wa_message_id: waMessageId,
    }, orgId, user.id);

    // Save message to DB
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
      const msgMetadata: Record<string, unknown> = {};
      if (reply_to) {
        msgMetadata.quoted = {
          message_id: reply_to.message_id,
          sender_name: reply_to.sender_name || "",
          text: reply_to.text || "",
        };
      }

      await adminClient.from("messages").insert({
        conversation_id: conversation.id,
        wa_message_id: waMessageId,
        sender: "agent",
        message_type: "text",
        content: message,
        status: "sent",
        metadata: Object.keys(msgMetadata).length > 0 ? msgMetadata : {},
      });

      await adminClient.from("conversations").update({
        last_message: message,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", conversation.id);
    }

    return json({ success: true, message_id: waMessageId });
  } catch (err: any) {
    await logToSystem(adminClient, "critical", "خطأ غير متوقع في إرسال رسالة Evolution", {
      error: err.message,
    });
    console.error("Evolution send error:", err);
    return json({ error: err.message }, 500);
  }
});
