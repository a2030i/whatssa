import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function logToSystem(
  client: ReturnType<typeof createClient>,
  level: string,
  message: string,
  metadata: Record<string, unknown> = {},
  orgId?: string | null,
) {
  try {
    await client.from("system_logs").insert({
      level,
      source: "edge_function",
      function_name: "whatsapp-webhook",
      message,
      metadata,
      org_id: orgId || null,
    });
  } catch (e) {
    console.error("Failed to write system log:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);

  // ── GET: Webhook verification ──
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
        await logToSystem(supabase, "info", "تم التحقق من Webhook بنجاح", { mode, token });
        return new Response(challenge, { status: 200 });
      }
    }

    await logToSystem(supabase, "warn", "فشل التحقق من Webhook", { mode, token });
    return new Response("Forbidden", { status: 403 });
  }

  // ── POST: Incoming messages & statuses ──
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
        await logToSystem(supabase, "warn", "Webhook وارد بدون مؤسسة مطابقة", { phone_number_id: metadataPhoneId });
        return new Response(JSON.stringify({ status: "no org matched" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Handle incoming messages ──
      if (value.messages && value.messages.length > 0) {
        for (const incomingMessage of value.messages) {
          const customerPhone = incomingMessage.from;
          const contactName = value.contacts?.[0]?.profile?.name || customerPhone;

          await logToSystem(supabase, "info", `رسالة واردة من ${customerPhone}`, {
            type: incomingMessage.type,
            wa_message_id: incomingMessage.id,
            contact_name: contactName,
          }, orgId);

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
            const { data: newConversation, error: convError } = await supabase
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

            if (convError) {
              await logToSystem(supabase, "error", "فشل إنشاء محادثة جديدة", {
                error: convError.message,
                customer_phone: customerPhone,
              }, orgId);
            }

            conversation = newConversation;

            if (conversation) {
              await logToSystem(supabase, "info", `محادثة جديدة أُنشئت للعميل ${customerPhone}`, {
                conversation_id: conversation.id,
              }, orgId);

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
                const errMsg = error instanceof Error ? error.message : String(error);
                await logToSystem(supabase, "error", "فشل التعيين التلقائي للمحادثة", {
                  conversation_id: conversation.id,
                  error: errMsg,
                }, orgId);
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

          const { error: msgError } = await supabase.from("messages").insert({
            conversation_id: conversation.id,
            wa_message_id: incomingMessage.id,
            sender: "customer",
            message_type: messageType,
            content,
            media_url: mediaUrl,
            status: "delivered",
          });

          if (msgError) {
            await logToSystem(supabase, "error", "فشل حفظ الرسالة الواردة في قاعدة البيانات", {
              error: msgError.message,
              wa_message_id: incomingMessage.id,
              conversation_id: conversation.id,
            }, orgId);
          }

          // ── Chatbot flow processing ──
          if (incomingMessage.type === "text") {
            const chatbotHandled = await processChatbotFlow(supabase, orgId, conversation.id, customerPhone, content, "meta", logToSystem);
            
            // ── Automation rules (only if chatbot didn't handle) ──
            if (!chatbotHandled) {
              const normalizedContent = content.trim().toLowerCase();
              const { data: rules } = await supabase
                .from("automation_rules")
                .select("id, name, keywords, reply_text, action_type, action_tag, action_team_id")
                .eq("org_id", orgId)
                .eq("enabled", true)
                .order("created_at", { ascending: true });

              const matchedRule = (rules || []).find((rule: any) =>
                Array.isArray(rule.keywords) &&
                rule.keywords.some((keyword: string) => keyword?.trim() && normalizedContent.includes(keyword.trim().toLowerCase())),
              );

              if (matchedRule) {
                const actionType = matchedRule.action_type || "reply";
                await logToSystem(supabase, "info", `قاعدة أتمتة مطابقة: ${matchedRule.name} (${actionType})`, {
                  rule_id: matchedRule.id,
                  rule_name: matchedRule.name,
                  action_type: actionType,
                  customer_phone: customerPhone,
                }, orgId);

                // ── Action: Add tag ──
                if (actionType === "add_tag" || actionType === "reply_and_tag") {
                  const tag = matchedRule.action_tag;
                  if (tag) {
                    const { data: conv } = await supabase
                      .from("conversations")
                      .select("tags")
                      .eq("id", conversation.id)
                      .single();
                    const currentTags: string[] = conv?.tags || [];
                    if (!currentTags.includes(tag)) {
                      await supabase
                        .from("conversations")
                        .update({ tags: [...currentTags, tag] })
                        .eq("id", conversation.id);
                      await logToSystem(supabase, "info", `تم تطبيق الوسم "${tag}" تلقائياً`, { conversation_id: conversation.id, tag }, orgId);
                    }
                  }
                }

                // ── Action: Assign team ──
                if (actionType === "assign_team") {
                  const teamId = matchedRule.action_team_id;
                  if (teamId) {
                    const { data: team } = await supabase
                      .from("teams")
                      .select("name")
                      .eq("id", teamId)
                      .single();
                    if (team) {
                      await supabase
                        .from("conversations")
                        .update({ assigned_team: team.name })
                        .eq("id", conversation.id);
                      await supabase.from("messages").insert({
                        conversation_id: conversation.id,
                        content: `تم إسناد المحادثة تلقائياً لفريق: ${team.name}`,
                        sender: "system",
                        message_type: "text",
                      });
                      await logToSystem(supabase, "info", `تم إسناد المحادثة لفريق "${team.name}" تلقائياً`, { conversation_id: conversation.id, team_id: teamId }, orgId);

                      // Trigger auto-assign within that team
                      try {
                        await supabase.functions.invoke("auto-assign", {
                          body: { conversation_id: conversation.id, org_id: orgId, message_text: content },
                        });
                      } catch (_) { /* silent */ }
                    }
                  }
                }

                // ── Action: Reply ──
                if (actionType === "reply" || actionType === "reply_and_tag") {
                  const { data: config } = await supabase
                    .from("whatsapp_config")
                    .select("phone_number_id, access_token")
                    .eq("org_id", orgId)
                    .eq("is_connected", true)
                    .order("created_at", { ascending: true })
                    .limit(1)
                    .maybeSingle();

                  if (config && matchedRule.reply_text) {
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
                      await logToSystem(supabase, "error", `فشل إرسال الرد التلقائي إلى ${customerPhone}`, {
                        rule_name: matchedRule.name,
                        http_status: response.status,
                        wa_error: result?.error?.message || "unknown",
                      }, orgId);
                    }
                  }
                }
              }
            }
          }
        }
      }

      // ── Handle status updates ──
      if (value.statuses && value.statuses.length > 0) {
        for (const status of value.statuses) {
          await supabase.from("messages").update({ status: status.status }).eq("wa_message_id", status.id);

          if (status.status === "failed") {
            await logToSystem(supabase, "error", `فشل تسليم رسالة واتساب`, {
              wa_message_id: status.id,
              recipient: status.recipient_id,
              error_code: status.errors?.[0]?.code || null,
              error_title: status.errors?.[0]?.title || null,
            }, orgId);
          }
        }
      }

      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      await logToSystem(supabase, "critical", "خطأ غير متوقع في Webhook واتساب", { error: errMsg });
      console.error("Webhook error:", error);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
