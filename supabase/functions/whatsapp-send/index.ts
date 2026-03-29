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

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.org_id) {
      return json({ error: "لا توجد مؤسسة مرتبطة بهذا الحساب" }, 400);
    }

    const { data: config, error: configError } = await adminClient
      .from("whatsapp_config")
      .select("*")
      .eq("org_id", profile.org_id)
      .eq("is_connected", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (configError || !config) {
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
      console.error("WhatsApp API error:", result);
      return json({ error: result?.error?.message || "Failed to send message", details: result }, response.status);
    }

    const waMessageId = result.messages?.[0]?.id;
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
    console.error("Send error:", error);
    return json({ error: "Internal error" }, 500);
  }
});