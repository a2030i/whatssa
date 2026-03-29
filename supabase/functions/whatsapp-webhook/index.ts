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
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token) {
      const { data: config } = await supabase
        .from("whatsapp_config")
        .select("webhook_verify_token")
        .eq("webhook_verify_token", token)
        .limit(1)
        .maybeSingle();

      if (config) {
        return new Response(challenge, { status: 200 });
      }
    }

    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (!value) {
        return new Response(JSON.stringify({ status: "no data" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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
        return new Response(JSON.stringify({ status: "no org matched" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (value.messages && value.messages.length > 0) {
        for (const incomingMessage of value.messages) {
          const customerPhone = incomingMessage.from;
          const contactName = value.contacts?.[0]?.profile?.name || customerPhone;

          let { data: conversation } = await supabase
            .from("conversations")
            .select("id, unread_count")
            .eq("customer_phone", customerPhone)
            .eq("org_id", orgId)
            .neq("status", "closed")
            .limit(1)
            .maybeSingle();

          const messageContent = incomingMessage.text?.body || `[${incomingMessage.type}]`;

          if (!conversation) {
            const { data: newConversation } = await supabase
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

            conversation = newConversation;

            if (conversation) {
              try {
                await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/auto-assign`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                  },
                  body: JSON.stringify({ conversation_id: conversation.id, org_id: orgId }),
                });
              } catch (error) {
                console.error("Auto-assign failed:", error);
              }
            }
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

          if (!conversation) continue;

          let content = "";
          let messageType = incomingMessage.type || "text";
          let mediaUrl = null;

          if (incomingMessage.type === "text") {
            content = incomingMessage.text.body;
          } else if (["image", "audio", "video", "document"].includes(incomingMessage.type)) {
            content = incomingMessage[incomingMessage.type]?.caption || `[${incomingMessage.type}]`;
            mediaUrl = incomingMessage[incomingMessage.type]?.id;
          } else {
            content = `[${incomingMessage.type}]`;
          }

          await supabase.from("messages").insert({
            conversation_id: conversation.id,
            wa_message_id: incomingMessage.id,
            sender: "customer",
            message_type: messageType,
            content,
            media_url: mediaUrl,
            status: "delivered",
          });

          if (incomingMessage.type === "text") {
            const normalizedContent = content.trim().toLowerCase();
            const { data: rules } = await supabase
              .from("automation_rules")
              .select("id, name, keywords, reply_text")
              .eq("org_id", orgId)
              .eq("enabled", true)
              .order("created_at", { ascending: true });

            const matchedRule = (rules || []).find((rule: any) =>
              Array.isArray(rule.keywords) &&
              rule.keywords.some((keyword: string) => keyword?.trim() && normalizedContent.includes(keyword.trim().toLowerCase())),
            );

            if (matchedRule) {
              const { data: config } = await supabase
                .from("whatsapp_config")
                .select("phone_number_id, access_token")
                .eq("org_id", orgId)
                .eq("is_connected", true)
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();

              if (config) {
                const response = await fetch(`https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${config.access_token}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    messaging_product: "whatsapp",
                    to: customerPhone,
                    type: "text",
                    text: { body: matchedRule.reply_text },
                  }),
                });

                const result = await response.json();
                if (response.ok) {
                  await supabase.from("messages").insert({
                    conversation_id: conversation.id,
                    wa_message_id: result.messages?.[0]?.id || null,
                    sender: "agent",
                    message_type: "text",
                    content: matchedRule.reply_text,
                    status: "sent",
                  });

                  await supabase
                    .from("conversations")
                    .update({
                      last_message: matchedRule.reply_text,
                      last_message_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", conversation.id);
                } else {
                  console.error("Automation send failed:", result);
                }
              }
            }
          }
        }
      }

      if (value.statuses && value.statuses.length > 0) {
        for (const status of value.statuses) {
          await supabase.from("messages").update({ status: status.status }).eq("wa_message_id", status.id);
        }
      }

      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Webhook error:", error);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});