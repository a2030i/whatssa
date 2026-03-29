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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return json({ error: "Unauthorized" }, 401);

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.org_id) return json({ error: "لا توجد مؤسسة مرتبطة" }, 400);

    // Find Evolution config for this org
    const { data: config } = await adminClient
      .from("whatsapp_config")
      .select("*")
      .eq("org_id", profile.org_id)
      .eq("channel_type", "evolution")
      .eq("is_connected", true)
      .limit(1)
      .maybeSingle();

    if (!config || !config.evolution_instance_name) {
      return json({ error: "لا يوجد رقم واتساب ويب مربوط" }, 400);
    }

    const { to, message, conversation_id, reply_to } = await req.json();
    if (!to || !message) return json({ error: "الرقم والرسالة مطلوبان" }, 400);

    const EVOLUTION_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY");

    if (!EVOLUTION_URL || !EVOLUTION_KEY) {
      return json({ error: "إعدادات Evolution API غير مكتملة" }, 500);
    }

    // Send via Evolution API
    const instanceName = config.evolution_instance_name;
    // Build send payload with optional quoted reply
    const sendBody: Record<string, unknown> = {
      number: to,
      text: message,
    };

    if (reply_to?.wa_message_id) {
      sendBody.quoted = {
        key: {
          remoteJid: to.includes("@") ? to : `${to}@s.whatsapp.net`,
          fromMe: false,
          id: reply_to.wa_message_id,
        },
        message: {
          conversation: reply_to.text || "",
        },
      };
    }

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
      console.error("Evolution send error:", result);
      return json({ error: result?.message || "فشل إرسال الرسالة عبر Evolution" }, response.status);
    }

    const waMessageId = result.key?.id || null;

    // Save message to DB
    let conversation = null;
    if (conversation_id) {
      const { data } = await adminClient
        .from("conversations")
        .select("id")
        .eq("id", conversation_id)
        .eq("org_id", profile.org_id)
        .maybeSingle();
      conversation = data;
    }

    if (!conversation) {
      const { data } = await adminClient
        .from("conversations")
        .select("id")
        .eq("customer_phone", to)
        .eq("org_id", profile.org_id)
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
    console.error("Evolution send error:", err);
    return json({ error: err.message }, 500);
  }
});
