import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, message, type = "text", template_name, template_language, template_components } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get WhatsApp config
    const { data: config, error: configError } = await supabase
      .from("whatsapp_config")
      .select("*")
      .limit(1)
      .single();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ error: "WhatsApp not configured. Please add your API credentials in Settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let messagePayload: any = {
      messaging_product: "whatsapp",
      to,
    };

    if (type === "template") {
      messagePayload.type = "template";
      messagePayload.template = {
        name: template_name,
        language: { code: template_language || "ar" },
        components: template_components || [],
      };
    } else {
      messagePayload.type = "text";
      messagePayload.text = { body: message };
    }

    // Send via WhatsApp API
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messagePayload),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("WhatsApp API error:", result);
      return new Response(
        JSON.stringify({ error: "Failed to send message", details: result }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store sent message
    const waMessageId = result.messages?.[0]?.id;

    // Find conversation
    let { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("customer_phone", to)
      .neq("status", "closed")
      .limit(1)
      .single();

    if (conversation) {
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        wa_message_id: waMessageId,
        sender: "agent",
        message_type: type === "template" ? "template" : "text",
        content: type === "template" ? `[قالب: ${template_name}]` : message,
        status: "sent",
      });

      await supabase
        .from("conversations")
        .update({
          last_message: type === "template" ? `[قالب: ${template_name}]` : message,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversation.id);
    }

    return new Response(
      JSON.stringify({ success: true, message_id: waMessageId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Send error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
