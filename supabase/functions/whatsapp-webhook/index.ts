import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS
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

    if (mode === "subscribe") {
      // Get stored verify token
      const { data: config } = await supabase
        .from("whatsapp_config")
        .select("webhook_verify_token")
        .limit(1)
        .single();

      if (config && token === config.webhook_verify_token) {
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
      console.log("Webhook received:", JSON.stringify(body));

      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (!value) {
        return new Response(JSON.stringify({ status: "no data" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Handle incoming messages
      if (value.messages && value.messages.length > 0) {
        for (const message of value.messages) {
          const customerPhone = message.from;
          const contactName = value.contacts?.[0]?.profile?.name || customerPhone;

          // Find or create conversation
          let { data: conversation } = await supabase
            .from("conversations")
            .select("id")
            .eq("customer_phone", customerPhone)
            .neq("status", "closed")
            .limit(1)
            .single();

          if (!conversation) {
            const { data: newConv } = await supabase
              .from("conversations")
              .insert({
                customer_phone: customerPhone,
                customer_name: contactName,
                status: "active",
                last_message: message.text?.body || `[${message.type}]`,
                unread_count: 1,
              })
              .select("id")
              .single();
            conversation = newConv;
          } else {
            await supabase
              .from("conversations")
              .update({
                last_message: message.text?.body || `[${message.type}]`,
                last_message_at: new Date().toISOString(),
                unread_count: supabase.rpc ? 1 : 1, // increment in real app
                updated_at: new Date().toISOString(),
              })
              .eq("id", conversation.id);
          }

          if (conversation) {
            // Store message
            let content = "";
            let messageType = message.type || "text";
            let mediaUrl = null;

            if (message.type === "text") {
              content = message.text.body;
            } else if (["image", "audio", "video", "document"].includes(message.type)) {
              content = message[message.type]?.caption || `[${message.type}]`;
              mediaUrl = message[message.type]?.id; // Media ID to fetch later
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

      // Handle status updates (sent, delivered, read)
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
    } catch (error) {
      console.error("Webhook error:", error);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 200, // Always return 200 to Meta
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
