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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);

  // GET = Webhook verification from Meta
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token) {
      // Multi-tenant: find any config matching this verify token
      const { data: config } = await supabase
        .from("whatsapp_config")
        .select("webhook_verify_token")
        .eq("webhook_verify_token", token)
        .limit(1)
        .maybeSingle();

      if (config) {
        console.log("Webhook verified successfully");
        return new Response(challenge, { status: 200 });
      }
    }

    return new Response("Forbidden", { status: 403 });
  }

  // POST = Incoming messages from Meta
  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("Webhook received:", JSON.stringify(body).substring(0, 500));

      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (!value) {
        return new Response(JSON.stringify({ status: "no data" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Multi-tenant: resolve org from phone_number_id in metadata
      const metadataPhoneId = value.metadata?.phone_number_id;
      let orgId: string | null = null;

      if (metadataPhoneId) {
        const { data: config } = await supabase
          .from("whatsapp_config")
          .select("org_id")
          .eq("phone_number_id", metadataPhoneId)
          .eq("is_connected", true)
          .maybeSingle();

        orgId = config?.org_id || null;
      }

      if (!orgId) {
        console.warn("No org found for phone_number_id:", metadataPhoneId);
        // Still return 200 to Meta
        return new Response(JSON.stringify({ status: "no org matched" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Handle incoming messages
      if (value.messages && value.messages.length > 0) {
        for (const message of value.messages) {
          const customerPhone = message.from;
          const contactName = value.contacts?.[0]?.profile?.name || customerPhone;

          // Find or create conversation scoped to org
          let { data: conversation } = await supabase
            .from("conversations")
            .select("id, unread_count")
            .eq("customer_phone", customerPhone)
            .eq("org_id", orgId)
            .neq("status", "closed")
            .limit(1)
            .maybeSingle();

          const messageContent = message.text?.body || `[${message.type}]`;

          if (!conversation) {
            const { data: newConv } = await supabase
              .from("conversations")
              .insert({
                customer_phone: customerPhone,
                customer_name: contactName,
                org_id: orgId,
                status: "active",
                last_message: messageContent,
                unread_count: 1,
              })
              .select("id, unread_count")
              .single();
            conversation = newConv;
          } else {
            await supabase
              .from("conversations")
              .update({
                last_message: messageContent,
                last_message_at: new Date().toISOString(),
                unread_count: (conversation.unread_count || 0) + 1,
                updated_at: new Date().toISOString(),
                customer_name: contactName,
              })
              .eq("id", conversation.id);
          }

          if (conversation) {
            let content = "";
            let messageType = message.type || "text";
            let mediaUrl = null;

            if (message.type === "text") {
              content = message.text.body;
            } else if (["image", "audio", "video", "document"].includes(message.type)) {
              content = message[message.type]?.caption || `[${message.type}]`;
              mediaUrl = message[message.type]?.id;
              messageType = message.type;
            } else {
              content = `[${message.type}]`;
            }

            await supabase.from("messages").insert({
              conversation_id: conversation.id,
              wa_message_id: message.id,
              sender: "customer",
              message_type: messageType,
              content,
              media_url: mediaUrl,
              status: "delivered",
            });
          }
        }
      }

      // Handle status updates
      if (value.statuses && value.statuses.length > 0) {
        for (const status of value.statuses) {
          await supabase
            .from("messages")
            .update({ status: status.status })
            .eq("wa_message_id", status.id);
        }
      }

      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Webhook error:", err);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 200, // Always 200 to Meta
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
