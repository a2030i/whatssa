import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Chatbot Flow Processor ──
async function processChatbotFlow(
  client: ReturnType<typeof createClient>,
  orgId: string,
  conversationId: string,
  customerPhone: string,
  messageText: string,
  channel: "meta" | "evolution",
  log: typeof logToSystem,
  channelConfigId?: string | null,
): Promise<boolean> {
  const normalizedText = messageText.trim().toLowerCase();

  // Check for existing active session
  const { data: session } = await client
    .from("chatbot_sessions")
    .select("id, flow_id, current_node_id, is_active")
    .eq("conversation_id", conversationId)
    .eq("is_active", true)
    .maybeSingle();

  if (session) {
    // User is in an active flow — find the current node and match button
    const { data: flow } = await client
      .from("chatbot_flows")
      .select("nodes, is_active, name")
      .eq("id", session.flow_id)
      .eq("is_active", true)
      .maybeSingle();

    if (!flow) {
      // Flow was deactivated, end session
      await client.from("chatbot_sessions").update({ is_active: false }).eq("id", session.id);
      return false;
    }

    const nodes = (flow.nodes as any[]) || [];
    const currentNode = nodes.find((n: any) => n.id === session.current_node_id);

    if (!currentNode || !currentNode.buttons || currentNode.buttons.length === 0) {
      // No buttons = end of flow
      await client.from("chatbot_sessions").update({ is_active: false }).eq("id", session.id);
      return false;
    }

    // Match by button label, number (1, 2, 3), or button ID (from interactive replies)
    let matchedButton = currentNode.buttons.find(
      (btn: any) => btn.label && normalizedText === btn.label.trim().toLowerCase()
    );
    if (!matchedButton) {
      // Match by button ID (Meta interactive replies send back the id)
      matchedButton = currentNode.buttons.find(
        (btn: any) => btn.id && normalizedText === btn.id
      );
    }
    if (!matchedButton) {
      const num = parseInt(normalizedText);
      if (num > 0 && num <= currentNode.buttons.length) {
        matchedButton = currentNode.buttons[num - 1];
      }
    }

    if (!matchedButton) {
      // No match — re-send current node options
      const btns = currentNode.buttons.map((b: any) => ({ id: b.id, label: b.label }));
      await sendBotMessage(client, orgId, conversationId, customerPhone, "اختر أحد الخيارات:", channel, log, btns);
      return true;
    }

    // Navigate to next node
    const nextNodeId = matchedButton.next_node_id;
    if (!nextNodeId) {
      await client.from("chatbot_sessions").update({ is_active: false }).eq("id", session.id);
      return true;
    }

    const nextNode = nodes.find((n: any) => n.id === nextNodeId);
    if (!nextNode) {
      await client.from("chatbot_sessions").update({ is_active: false }).eq("id", session.id);
      return true;
    }

    // Handle action node
    if (nextNode.type === "action") {
      await handleBotAction(client, orgId, conversationId, customerPhone, nextNode, channel, log);
      await client.from("chatbot_sessions").update({ is_active: false }).eq("id", session.id);
      return true;
    }

    // Send next message node
    const msgText = nextNode.content || "";
    const btns = (nextNode.buttons || []).filter((b: any) => b.label).map((b: any) => ({ id: b.id, label: b.label }));
    await sendBotMessage(client, orgId, conversationId, customerPhone, msgText, channel, log, btns);
    
    // Update session to new node
    await client.from("chatbot_sessions").update({
      current_node_id: nextNode.id,
      updated_at: new Date().toISOString(),
    }).eq("id", session.id);

    // If no buttons on next node, end session
    if (!nextNode.buttons || nextNode.buttons.length === 0) {
      await client.from("chatbot_sessions").update({ is_active: false }).eq("id", session.id);
    }

    return true;
  }

  // No active session — check if any flow should be triggered
  const { data: flows } = await client
    .from("chatbot_flows")
    .select("id, trigger_type, trigger_keywords, welcome_message, nodes, name, channel_ids")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (!flows || flows.length === 0) return false;

  // Filter flows by channel
  const filteredFlows = flows.filter((flow: any) => {
    if (!flow.channel_ids || flow.channel_ids.length === 0) return true;
    return channelConfigId ? flow.channel_ids.includes(channelConfigId) : true;
  });

  if (filteredFlows.length === 0) return false;

  // Check if this is the first message in conversation
  const { count: msgCount } = await client
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("sender", "customer");

  const isFirstMessage = (msgCount || 0) <= 1;

  let matchedFlow = null;
  for (const flow of filteredFlows) {
    if (flow.trigger_type === "first_message" && isFirstMessage) {
      matchedFlow = flow;
      break;
    }
    if (flow.trigger_type === "always") {
      matchedFlow = flow;
      break;
    }
    if (flow.trigger_type === "keyword" && Array.isArray(flow.trigger_keywords)) {
      const matched = flow.trigger_keywords.some(
        (kw: string) => kw?.trim() && normalizedText.includes(kw.trim().toLowerCase())
      );
      if (matched) {
        matchedFlow = flow;
        break;
      }
    }
  }

  if (!matchedFlow) return false;

  const nodes = (matchedFlow.nodes as any[]) || [];
  if (nodes.length === 0) return false;

  await log(client, "info", `تدفق شات بوت مطابق: ${matchedFlow.name}`, {
    flow_id: matchedFlow.id, trigger_type: matchedFlow.trigger_type,
  }, orgId);

  // Send welcome message if exists
  if (matchedFlow.welcome_message) {
    await sendBotMessage(client, orgId, conversationId, customerPhone, matchedFlow.welcome_message, channel, log);
  }

  // Send first node
  const firstNode = nodes[0];
  const msgText = firstNode.content || "";
  const btns = (firstNode.buttons || []).filter((b: any) => b.label).map((b: any) => ({ id: b.id, label: b.label }));
  await sendBotMessage(client, orgId, conversationId, customerPhone, msgText, channel, log, btns);

  // Create session
  if (firstNode.buttons && firstNode.buttons.length > 0) {
    await client.from("chatbot_sessions").upsert({
      conversation_id: conversationId,
      flow_id: matchedFlow.id,
      current_node_id: firstNode.id,
      is_active: true,
      org_id: orgId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "conversation_id" });
  }

  return true;
}

async function handleBotAction(
  client: ReturnType<typeof createClient>,
  orgId: string,
  conversationId: string,
  customerPhone: string,
  node: any,
  channel: "meta" | "evolution",
  log: typeof logToSystem,
) {
  const actionType = node.action_type || "transfer_agent";

  if (actionType === "transfer_agent") {
    const msg = node.content || "جاري تحويلك لأحد الموظفين...";
    await sendBotMessage(client, orgId, conversationId, customerPhone, msg, channel, log);
  } else if (actionType === "close") {
    const msg = node.content || "شكراً لتواصلك معنا!";
    await sendBotMessage(client, orgId, conversationId, customerPhone, msg, channel, log);
    await client.from("conversations").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", conversationId);
    await client.from("messages").insert({
      conversation_id: conversationId, content: "تم إغلاق المحادثة تلقائياً بواسطة البوت", sender: "system", message_type: "text",
    });
  } else if (actionType === "add_tag") {
    const tag = node.content || "";
    if (tag) {
      const { data: conv } = await client.from("conversations").select("tags").eq("id", conversationId).single();
      const tags: string[] = conv?.tags || [];
      if (!tags.includes(tag)) {
        await client.from("conversations").update({ tags: [...tags, tag] }).eq("id", conversationId);
      }
    }
  }
}

async function sendBotMessage(
  client: ReturnType<typeof createClient>,
  orgId: string,
  conversationId: string,
  customerPhone: string,
  text: string,
  channel: "meta" | "evolution",
  log: typeof logToSystem,
  buttons?: { id: string; label: string }[],
) {
  if (!text) return;

  const validButtons = (buttons || []).filter(b => b.label?.trim());

  if (channel === "meta") {
    const { data: config } = await client
      .from("whatsapp_config")
      .select("phone_number_id, access_token")
      .eq("org_id", orgId)
      .eq("is_connected", true)
      .eq("channel_type", "meta_api")
      .limit(1)
      .maybeSingle();

    if (config) {
      let messagePayload: Record<string, unknown> = { messaging_product: "whatsapp", to: customerPhone };

      if (validButtons.length > 0 && validButtons.length <= 3) {
        // Reply Buttons (1-3 buttons)
        messagePayload = {
          ...messagePayload,
          type: "interactive",
          interactive: {
            type: "button",
            body: { text },
            action: {
              buttons: validButtons.map(b => ({
                type: "reply",
                reply: { id: b.id, title: b.label.slice(0, 20) },
              })),
            },
          },
        };
      } else if (validButtons.length > 3 && validButtons.length <= 10) {
        // List message (4-10 buttons)
        messagePayload = {
          ...messagePayload,
          type: "interactive",
          interactive: {
            type: "list",
            body: { text },
            action: {
              button: "عرض الخيارات",
              sections: [{
                title: "الخيارات",
                rows: validButtons.map(b => ({
                  id: b.id,
                  title: b.label.slice(0, 24),
                })),
              }],
            },
          },
        };
      } else {
        // Plain text (no buttons or >10)
        if (validButtons.length > 0) {
          const buttonLabels = validButtons.map((b, i) => `${i + 1}. ${b.label}`).join("\n");
          text += `\n\n${buttonLabels}`;
        }
        messagePayload = { ...messagePayload, type: "text", text: { body: text } };
      }

      const resp = await fetch(`https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(messagePayload),
      });
      const result = await resp.json();
      if (resp.ok) {
        const msgType = (messagePayload.type === "interactive") ? "interactive" : "text";
        await client.from("messages").insert({
          conversation_id: conversationId, wa_message_id: result.messages?.[0]?.id || null,
          sender: "agent", message_type: msgType, content: text, status: "sent",
        });
        await client.from("conversations").update({
          last_message: text, last_message_at: new Date().toISOString(),
        }).eq("id", conversationId);
      } else {
        await log(client, "error", "فشل إرسال رسالة البوت (Meta)", { error: result?.error?.message, payload_type: messagePayload.type }, orgId);
      }
    }
  } else {
    // Evolution — always text-based with numbered options
    let fullText = text;
    if (validButtons.length > 0) {
      const buttonLabels = validButtons.map((b, i) => `${i + 1}. ${b.label}`).join("\n");
      fullText += `\n\n${buttonLabels}`;
    }

    const evoUrl = Deno.env.get("EVOLUTION_API_URL") || "";
    const evoKey = Deno.env.get("EVOLUTION_API_KEY") || "";
    const { data: config } = await client
      .from("whatsapp_config")
      .select("evolution_instance_name")
      .eq("org_id", orgId)
      .eq("channel_type", "evolution")
      .eq("is_connected", true)
      .limit(1)
      .maybeSingle();

    if (config && evoUrl && evoKey) {
      try {
        const resp = await fetch(`${evoUrl}/message/sendText/${config.evolution_instance_name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evoKey },
          body: JSON.stringify({ number: customerPhone, text: fullText }),
        });
        if (resp.ok) {
          await client.from("messages").insert({
            conversation_id: conversationId, sender: "agent", message_type: "text", content: fullText, status: "sent",
          });
          await client.from("conversations").update({
            last_message: fullText, last_message_at: new Date().toISOString(),
          }).eq("id", conversationId);
        }
      } catch (e) {
        await log(client, "error", "فشل إرسال رسالة البوت (Evolution)", { error: (e as Error).message }, orgId);
      }
    }
  }
}

async function logToSystem(
  client: ReturnType<typeof createClient>,
  level: string,
  message: string,
  metadata: Record<string, unknown> = {},
  orgId?: string | null,
) {
  try {
    client.from("system_logs").insert({
      level,
      source: "edge_function",
      function_name: "whatsapp-webhook",
      message,
      metadata,
      org_id: orgId || null,
    }).then(() => {}).catch((e) => console.error("Log write failed:", e));
  } catch (e) {
    console.error("Failed to write system log:", e);
  }
}

// ── Fire outgoing webhook (non-blocking) ──
function fireWebhook(orgId: string, event: string, data: Record<string, unknown>) {
  const baseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!baseUrl || !serviceKey) return;
  fetch(`${baseUrl}/functions/v1/dispatch-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ org_id: orgId, event, data }),
  }).catch(e => console.error("dispatch-webhook fire failed:", e));
}
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);

  // ── GET: Webhook verification ──
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token) {
      // Check against env fallback first (for new app setup)
      const envVerifyToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN");
      if (envVerifyToken && token === envVerifyToken) {
        await logToSystem(supabase, "info", "تم التحقق من Webhook بنجاح (env)", { mode });
        return new Response(challenge, { status: 200 });
      }

      // Then check against stored channel tokens
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

      var channelConfigId: string | null = null;
      if (metadataPhoneId) {
        const { data: config } = await supabase
          .from("whatsapp_config")
          .select("id, org_id, default_team_id, default_agent_id")
          .eq("phone_number_id", metadataPhoneId)
          .eq("is_connected", true)
          .maybeSingle();

        orgId = config?.org_id || null;
        channelConfigId = config?.id || null;
        var channelDefaultTeamId = config?.default_team_id || null;
        var channelDefaultAgentId = config?.default_agent_id || null;
        var channelExcludeSupervisors = !!(config as any)?.exclude_supervisors;
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
        // Load org settings once for this batch
        const { data: orgData } = await supabase.from("organizations").select("settings").eq("id", orgId).single();
        const orgSettings = (orgData?.settings as Record<string, any>) || {};

        for (const incomingMessage of value.messages) {
          const customerPhone = incomingMessage.from;
          const contactName = value.contacts?.[0]?.profile?.name || customerPhone;
          const messageContent = incomingMessage.text?.body || `[${incomingMessage.type}]`;

          await logToSystem(supabase, "info", `رسالة واردة من ${customerPhone}`, {
            type: incomingMessage.type,
            wa_message_id: incomingMessage.id,
            contact_name: contactName,
          }, orgId);

          // ── Check for satisfaction rating response ──
          if (incomingMessage.type === "text") {
            const ratingNum = parseInt(messageContent.trim());
            if (ratingNum >= 1 && ratingNum <= 5) {
              const { data: pendingConv } = await supabase
                .from("conversations")
                .select("id, assigned_to")
                .eq("customer_phone", customerPhone)
                .eq("org_id", orgId)
                .eq("status", "closed")
                .eq("satisfaction_status", "pending")
                .order("closed_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (pendingConv) {
                await supabase.from("satisfaction_ratings").insert({
                  conversation_id: pendingConv.id,
                  org_id: orgId,
                  agent_name: pendingConv.assigned_to,
                  rating: ratingNum,
                });
                await supabase.from("conversations").update({ satisfaction_status: "rated" }).eq("id", pendingConv.id);
                // Send thank you message
                await sendBotMessage(supabase, orgId, pendingConv.id, customerPhone, "شكراً لتقييمك! 🙏 نسعد بخدمتك دائماً.", "meta", logToSystem);
                await logToSystem(supabase, "info", `تم تسجيل تقييم العميل: ${ratingNum}/5`, { conversation_id: pendingConv.id, rating: ratingNum }, orgId);
                continue; // Skip normal processing for this message
              }
            }
          }

          let { data: conversation } = await supabase
            .from("conversations")
            .select("id, unread_count, status")
            .eq("customer_phone", customerPhone)
            .eq("org_id", orgId)
            .neq("status", "closed")
            .limit(1)
            .maybeSingle();

          // If no open conversation, check for a closed one to reopen
          if (!conversation) {
            const { data: closedConv } = await supabase
              .from("conversations")
              .select("id, unread_count, status, dedicated_agent_id, dedicated_agent_name")
              .eq("customer_phone", customerPhone)
              .eq("org_id", orgId)
              .eq("status", "closed")
              .order("closed_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (closedConv) {
              // Determine assignment: sticky (dedicated) or smart reassign or reset
              const reopenUpdate: Record<string, any> = {
                status: "active",
                closed_at: null,
                closed_by: null,
                closure_reason_id: null,
                unread_count: 1,
                last_message: messageContent,
                last_message_at: new Date().toISOString(),
              };
              if (closedConv.dedicated_agent_id) {
                // Sticky assignment: reassign to dedicated agent
                reopenUpdate.assigned_to_id = closedConv.dedicated_agent_id;
                reopenUpdate.assigned_to = closedConv.dedicated_agent_name;
                reopenUpdate.assigned_at = new Date().toISOString();
              } else {
                // Smart reassignment: check org settings for smart_reassign_minutes
                let smartReassigned = false;
                const { data: orgSettings } = await supabase.from("organizations").select("settings").eq("id", orgId).single();
                const smartMinutes = (orgSettings?.settings as any)?.smart_reassign_minutes;
                if (smartMinutes && smartMinutes > 0) {
                  // Find last agent message in this conversation within the time window
                  const cutoff = new Date(Date.now() - smartMinutes * 60 * 1000).toISOString();
                  const { data: lastAgentMsg } = await supabase
                    .from("messages")
                    .select("sender, metadata, created_at")
                    .eq("conversation_id", closedConv.id)
                    .eq("sender", "agent")
                    .gte("created_at", cutoff)
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();
                  if (lastAgentMsg) {
                    const agentId = (lastAgentMsg.metadata as any)?.sent_by_id;
                    const agentName = (lastAgentMsg.metadata as any)?.sent_by_name;
                    if (agentId) {
                      reopenUpdate.assigned_to_id = agentId;
                      reopenUpdate.assigned_to = agentName || null;
                      reopenUpdate.assigned_at = new Date().toISOString();
                      smartReassigned = true;
                      await logToSystem(supabase, "info", `إسناد ذكي: تم إعادة إسناد المحادثة لـ ${agentName || agentId} (آخر رد خلال ${smartMinutes} دقيقة)`, { conversation_id: closedConv.id, agent_id: agentId }, orgId);
                    }
                  }
                }
                if (!smartReassigned) {
                  // Normal: reset to unassigned
                  reopenUpdate.assigned_to_id = null;
                  reopenUpdate.assigned_to = null;
                  reopenUpdate.assigned_team_id = null;
                  reopenUpdate.assigned_team = null;
                  reopenUpdate.assigned_at = null;
                }
              }
              await supabase.from("conversations").update(reopenUpdate).eq("id", closedConv.id);
              conversation = { ...closedConv, status: "active", unread_count: 1 };
              await supabase.from("messages").insert({
                conversation_id: closedConv.id,
                content: "تم إعادة فتح المحادثة تلقائياً بعد رسالة جديدة من العميل",
                sender: "system",
                message_type: "text",
              });
              await logToSystem(supabase, "info", `تم إعادة فتح محادثة مغلقة للعميل ${customerPhone}`, { conversation_id: closedConv.id }, orgId);
            }
          }

          if (!conversation) {
            // Build initial routing from channel config
            const convInsert: Record<string, any> = {
              customer_phone: customerPhone,
              customer_name: contactName,
              org_id: orgId,
              status: "active",
              last_message: messageContent,
              unread_count: 1,
              conversation_type: "meta_api",
            };
            if (channelDefaultAgentId) {
              convInsert.assigned_to = channelDefaultAgentId;
              convInsert.assigned_at = new Date().toISOString();
            } else if (channelDefaultTeamId) {
              // Fetch team name for assigned_team column
              const { data: teamData } = await supabase.from("teams").select("name").eq("id", channelDefaultTeamId).single();
              if (teamData) convInsert.assigned_team = teamData.name;
            }

            const { data: newConversation, error: convError } = await supabase
              .from("conversations")
              .insert(convInsert)
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
              fireWebhook(orgId, "conversation.created", { conversation_id: conversation.id, customer_phone: customerPhone, customer_name: contactName });

              try {
                // Internal function call must use Lovable Cloud URL + its own service role key
                await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/auto-assign`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                  },
                  body: JSON.stringify({ conversation_id: conversation.id, org_id: orgId, message_text: messageContent, exclude_supervisors: channelExcludeSupervisors }),
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

          // Auto-save customer record
          try {
            const { data: existingCustomer } = await supabase
              .from("customers")
              .select("id, name")
              .eq("org_id", orgId)
              .eq("phone", customerPhone)
              .maybeSingle();

            if (!existingCustomer) {
              await supabase.from("customers").insert({
                org_id: orgId,
                phone: customerPhone,
                name: contactName || null,
                source: "whatsapp",
              });
            } else if (contactName && (!existingCustomer.name || existingCustomer.name === customerPhone)) {
              await supabase.from("customers").update({ name: contactName }).eq("id", existingCustomer.id);
            }

            // Link customer to conversation if not linked
            if (conversation) {
              const { data: convCheck } = await supabase.from("conversations").select("customer_id").eq("id", conversation.id).single();
              if (convCheck && !convCheck.customer_id) {
                const { data: cust } = await supabase.from("customers").select("id").eq("org_id", orgId).eq("phone", customerPhone).maybeSingle();
                if (cust) {
                  await supabase.from("conversations").update({ customer_id: cust.id }).eq("id", conversation.id);
                }
              }
            }
          } catch (custErr) {
            // Non-critical — log and continue
          }

          let content = "";
          let messageType = incomingMessage.type || "text";
          let mediaUrl = null;
          let messageMetadata: Record<string, unknown> = {};

          // ── Reaction handling ──
          if (incomingMessage.type === "reaction") {
            const reaction = incomingMessage.reaction;
            const targetMsgId = reaction?.message_id;
            const emoji = reaction?.emoji || "";

            if (targetMsgId) {
              // Find the target message and update its metadata with the reaction
              const { data: targetMsg } = await supabase
                .from("messages")
                .select("id, metadata")
                .eq("wa_message_id", targetMsgId)
                .maybeSingle();

              if (targetMsg) {
                const existingMeta = (targetMsg.metadata as Record<string, any>) || {};
                const reactions = (existingMeta.reactions as any[]) || [];
                
                if (emoji) {
                  // Add or update reaction
                  const existingIdx = reactions.findIndex((r: any) => r.from === customerPhone);
                  if (existingIdx >= 0) {
                    reactions[existingIdx] = { emoji, from: customerPhone, timestamp: new Date().toISOString() };
                  } else {
                    reactions.push({ emoji, from: customerPhone, timestamp: new Date().toISOString() });
                  }
                } else {
                  // Remove reaction (empty emoji = unreact)
                  const filtered = reactions.filter((r: any) => r.from !== customerPhone);
                  existingMeta.reactions = filtered;
                }

                await supabase.from("messages").update({
                  metadata: { ...existingMeta, reactions },
                }).eq("id", targetMsg.id);
              }
            }
            continue; // Don't create a separate message for reactions
          }

          // ── Location handling ──
          if (incomingMessage.type === "location") {
            const loc = incomingMessage.location;
            content = loc?.name || loc?.address || "📍 موقع";
            messageMetadata.location = {
              latitude: loc?.latitude,
              longitude: loc?.longitude,
              name: loc?.name || null,
              address: loc?.address || null,
            };
          }
          // ── Contacts handling ──
          else if (incomingMessage.type === "contacts") {
            const contacts = incomingMessage.contacts || [];
            const contactsList = contacts.map((c: any) => ({
              name: c.name?.formatted_name || [c.name?.first_name, c.name?.last_name].filter(Boolean).join(" ") || "جهة اتصال",
              phone: c.phones?.[0]?.phone || c.phones?.[0]?.wa_id || "",
              email: c.emails?.[0]?.email || null,
            }));
            content = contactsList.map((c: any) => `👤 ${c.name}: ${c.phone}`).join("\n") || "[جهة اتصال]";
            messageMetadata.contacts = contactsList;
          }
          // ── Sticker handling ──
          else if (incomingMessage.type === "sticker") {
            content = "[ملصق]";
            const stickerId = incomingMessage.sticker?.id;
            if (stickerId) {
              try {
                const { data: metaConfig } = await supabase
                  .from("whatsapp_config")
                  .select("access_token")
                  .eq("org_id", orgId)
                  .eq("is_connected", true)
                  .eq("channel_type", "meta_api")
                  .limit(1)
                  .maybeSingle();

                if (metaConfig) {
                  const mediaInfoRes = await fetch(`https://graph.facebook.com/v21.0/${stickerId}`, {
                    headers: { Authorization: `Bearer ${metaConfig.access_token}` },
                  });
                  const mediaInfo = await mediaInfoRes.json();

                  if (mediaInfo.url) {
                    const mediaFileRes = await fetch(mediaInfo.url, {
                      headers: { Authorization: `Bearer ${metaConfig.access_token}` },
                    });

                    if (mediaFileRes.ok) {
                      const fileBuffer = await mediaFileRes.arrayBuffer();
                      const ext = "webp";
                      const storagePath = `${conversation.id}/${Date.now()}_sticker.${ext}`;

                      const { error: uploadErr } = await supabase.storage
                        .from("chat-media")
                        .upload(storagePath, new Uint8Array(fileBuffer), {
                          contentType: "image/webp",
                          upsert: false,
                        });

                      if (!uploadErr) {
                        mediaUrl = `storage:chat-media/${storagePath}`;
                      }
                    }
                  }
                }
              } catch (stickerErr) {
                await logToSystem(supabase, "warn", "فشل تحميل الملصق", { error: (stickerErr as Error).message }, orgId);
              }
            }
          }
          // ── Text handling ──
          else if (incomingMessage.type === "text") {
            content = incomingMessage.text.body;
          } else if (["image", "audio", "video", "document"].includes(incomingMessage.type)) {
            content = incomingMessage[incomingMessage.type]?.caption || `[${incomingMessage.type}]`;
            const mediaId = incomingMessage[incomingMessage.type]?.id;
            
            // Download media from Meta and upload to Supabase storage
            if (mediaId) {
              try {
                // Step 1: Get media URL from Meta
                const { data: metaConfig } = await supabase
                  .from("whatsapp_config")
                  .select("access_token")
                  .eq("org_id", orgId)
                  .eq("is_connected", true)
                  .eq("channel_type", "meta_api")
                  .limit(1)
                  .maybeSingle();

                if (metaConfig) {
                  const mediaInfoRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
                    headers: { Authorization: `Bearer ${metaConfig.access_token}` },
                  });
                  const mediaInfo = await mediaInfoRes.json();

                  if (mediaInfo.url) {
                    // Step 2: Download the actual media file
                    const mediaFileRes = await fetch(mediaInfo.url, {
                      headers: { Authorization: `Bearer ${metaConfig.access_token}` },
                    });

                    if (mediaFileRes.ok) {
                      const fileBuffer = await mediaFileRes.arrayBuffer();
                      const mimeType = mediaInfo.mime_type || "application/octet-stream";
                      const ext = mimeType.split("/")[1]?.split(";")[0] || "bin";
                      const storagePath = `${conversation.id}/${Date.now()}_${mediaId}.${ext}`;

                      const { error: uploadErr } = await supabase.storage
                        .from("chat-media")
                        .upload(storagePath, new Uint8Array(fileBuffer), {
                          contentType: mimeType,
                          upsert: false,
                        });

                      if (!uploadErr) {
                        mediaUrl = `storage:chat-media/${storagePath}`;
                      } else {
                        await logToSystem(supabase, "warn", "فشل رفع الوسائط للتخزين", { error: uploadErr.message, mediaId }, orgId);
                        mediaUrl = mediaId; // fallback to media ID
                      }
                    }
                  }
                }
              } catch (mediaErr) {
                await logToSystem(supabase, "warn", "فشل تحميل الوسائط من Meta", { error: (mediaErr as Error).message, mediaId }, orgId);
                mediaUrl = mediaId; // fallback
              }
            }
          } else if (incomingMessage.type === "interactive") {
            // Handle interactive message responses (button replies, list replies, product inquiries)
            const interReply = incomingMessage.interactive;
            if (interReply?.type === "button_reply") {
              content = interReply.button_reply?.title || "[رد زر]";
            } else if (interReply?.type === "list_reply") {
              content = interReply.list_reply?.title || "[رد قائمة]";
            } else if (interReply?.type === "product_list_reply") {
              content = `🛒 ${interReply.product_list_reply?.product_retailer_id || "[طلب منتجات]"}`;
            } else if (interReply?.type === "nfm_reply") {
              // WhatsApp Flow response
              content = "[استجابة نموذج]";
              messageMetadata.flow_response = interReply.nfm_reply?.response_json || null;
            } else {
              content = `[${incomingMessage.type}]`;
            }
          } else if (incomingMessage.type === "order") {
            // Product catalog order
            const order = incomingMessage.order;
            const items = (order?.product_items || []).map((item: any) => ({
              product_retailer_id: item.product_retailer_id,
              quantity: item.quantity,
              item_price: item.item_price,
              currency: item.currency,
            }));
            content = `🛒 طلب جديد (${items.length} منتج)`;
            messageType = "order";
            messageMetadata.order = { catalog_id: order?.catalog_id, items, text: order?.text || "" };
          } else {
            content = `[${incomingMessage.type}]`;
          }

          // ── Reply context (quote) ──
          if (incomingMessage.context?.id) {
            const quotedWaId = incomingMessage.context.id;
            const { data: quotedMsg } = await supabase
              .from("messages")
              .select("id, content, sender, metadata")
              .eq("wa_message_id", quotedWaId)
              .maybeSingle();
            if (quotedMsg) {
              messageMetadata.quoted = {
                message_id: quotedWaId,
                sender_name: quotedMsg.sender === "agent" ? "أنت" : (quotedMsg.metadata as any)?.sender_name || contactName,
                text: quotedMsg.content?.slice(0, 200) || "",
              };
            }
          }

          const msgInsert: Record<string, unknown> = {
            conversation_id: conversation.id,
            wa_message_id: incomingMessage.id,
            sender: "customer",
            message_type: messageType,
            content,
            media_url: mediaUrl,
            status: "delivered",
          };
          if (Object.keys(messageMetadata).length > 0) {
            msgInsert.metadata = messageMetadata;
          }

          const { error: msgError } = await supabase.from("messages").insert(msgInsert);

          if (msgError) {
            await logToSystem(supabase, "error", "فشل حفظ الرسالة الواردة في قاعدة البيانات", {
              error: msgError.message, wa_message_id: incomingMessage.id, conversation_id: conversation.id,
            }, orgId);
          } else {
            // Fire outgoing webhook for message received
            fireWebhook(orgId!, "message.received", { conversation_id: conversation.id, customer_phone: customerPhone, content, message_type: messageType });
          }

          // ── Mark as read (send read receipt to Meta) ──
          try {
            let metaCfgQuery = supabase
              .from("whatsapp_config")
              .select("phone_number_id, access_token")
              .eq("is_connected", true)
              .eq("channel_type", "meta_api");

            if (channelConfigId) {
              metaCfgQuery = metaCfgQuery.eq("id", channelConfigId);
            } else if (metadataPhoneId) {
              metaCfgQuery = metaCfgQuery.eq("phone_number_id", metadataPhoneId);
            } else {
              metaCfgQuery = metaCfgQuery.eq("org_id", orgId).limit(1);
            }

            const { data: metaCfg } = await metaCfgQuery.maybeSingle();
            if (metaCfg) {
              await fetch(`https://graph.facebook.com/v21.0/${metaCfg.phone_number_id}/messages`, {
                method: "POST",
                headers: { Authorization: `Bearer ${metaCfg.access_token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: incomingMessage.id }),
              });
            }
          } catch { /* non-critical */ }

          // ── Out-of-hours check (per-channel first, then org fallback) ──
          if (incomingMessage.type === "text") {
            let oohConfig: { enabled: boolean; message: string; work_start: string; work_end: string; work_days: number[] } | null = null;
            
            // Check channel-level OOH settings first
            if (channelConfigId) {
              const { data: chData } = await supabase.from("whatsapp_config").select("settings").eq("id", channelConfigId).single();
              const chSettings = (chData?.settings as Record<string, any>) || {};
              if (chSettings.ooh?.enabled) {
                oohConfig = chSettings.ooh;
              }
            }
            // Fallback to org-level
            if (!oohConfig && orgSettings.out_of_hours_enabled) {
              oohConfig = {
                enabled: true,
                message: orgSettings.out_of_hours_message,
                work_start: orgSettings.work_start || "09:00",
                work_end: orgSettings.work_end || "17:00",
                work_days: orgSettings.work_days || [0, 1, 2, 3, 4],
              };
            }

            if (oohConfig) {
              const now = new Date();
              const riyadhTime = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" });
              const dayOfWeek = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Riyadh" })).getDay();
              
              const isWorkDay = oohConfig.work_days.includes(dayOfWeek);
              const isWorkHour = riyadhTime >= oohConfig.work_start && riyadhTime <= oohConfig.work_end;
              const isOutOfHours = !isWorkDay || !isWorkHour;
              
              if (isOutOfHours && oohConfig.message) {
                const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
                const { count: recentOoh } = await supabase
                  .from("messages")
                  .select("id", { count: "exact", head: true })
                  .eq("conversation_id", conversation.id)
                  .eq("sender", "agent")
                  .eq("content", oohConfig.message)
                  .gte("created_at", fourHoursAgo);
                
                if (!recentOoh || recentOoh === 0) {
                  await sendBotMessage(supabase, orgId, conversation.id, customerPhone, oohConfig.message, "meta", logToSystem);
                  await logToSystem(supabase, "info", "تم إرسال رسالة خارج الدوام", { conversation_id: conversation.id }, orgId);
                }
              }
            }
          }

          // ── Chatbot flow processing ──
          if (incomingMessage.type === "text") {
            const chatbotHandled = await processChatbotFlow(supabase, orgId, conversation.id, customerPhone, content, "meta", logToSystem, channelConfigId);
            
            // ── Automation rules (only if chatbot didn't handle) ──
            if (!chatbotHandled) {
              const normalizedContent = content.trim().toLowerCase();
              const { data: rules } = await supabase
                .from("automation_rules")
                .select("id, name, keywords, reply_text, action_type, action_tag, action_team_id, channel_ids")
                .eq("org_id", orgId)
                .eq("enabled", true)
                .order("created_at", { ascending: true });

              const matchedRule = (rules || []).find((rule: any) => {
                // Channel filter: if channel_ids is set and non-empty, only match if current channel is included
                if (rule.channel_ids && rule.channel_ids.length > 0 && channelConfigId) {
                  if (!rule.channel_ids.includes(channelConfigId)) return false;
                }
                return Array.isArray(rule.keywords) &&
                  rule.keywords.some((keyword: string) => keyword?.trim() && normalizedContent.includes(keyword.trim().toLowerCase()));
              });

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

                // ── AI Auto-Reply (only if no automation rule matched) ──
                if (!matchedRule) {
                  try {
                    const aiResp = await supabase.functions.invoke("ai-auto-reply", {
                      body: {
                        conversation_id: conversation.id,
                        customer_message: content,
                        org_id: orgId,
                      },
                    });
                    const aiData = aiResp.data;
                    if (aiData?.reply && !aiData?.skip) {
                      const { data: waConfig } = await supabase
                        .from("whatsapp_config")
                        .select("phone_number_id, access_token")
                        .eq("org_id", orgId)
                        .eq("is_connected", true)
                        .limit(1)
                        .maybeSingle();

                      if (waConfig) {
                        const sendResp = await fetch(`https://graph.facebook.com/v21.0/${waConfig.phone_number_id}/messages`, {
                          method: "POST",
                          headers: {
                            Authorization: `Bearer ${waConfig.access_token}`,
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            messaging_product: "whatsapp",
                            to: customerPhone,
                            type: "text",
                            text: { body: aiData.reply },
                          }),
                        });
                        const sendResult = await sendResp.json();
                        if (sendResp.ok) {
                          await supabase.from("messages").insert({
                            conversation_id: conversation.id,
                            wa_message_id: sendResult.messages?.[0]?.id || null,
                            sender: "agent", message_type: "text",
                            content: aiData.reply, status: "sent",
                            metadata: { ai_generated: true },
                          });
                          await supabase.from("conversations").update({
                            last_message: aiData.reply,
                            last_message_at: new Date().toISOString(),
                          }).eq("id", conversation.id);
                          await logToSystem(supabase, "info", "رد AI تلقائي مرسل (Meta)", {
                            conversation_id: conversation.id,
                          }, orgId);
                        }
                      }
                    }
                  } catch (aiErr) {
                    await logToSystem(supabase, "warn", "فشل AI auto-reply (Meta)", {
                      error: (aiErr as Error).message,
                    }, orgId);
                  }
                }
              }
            }
          }
        }
      }

      // ── Handle status updates (delivered/read/failed) ──
      if (value.statuses && value.statuses.length > 0) {
        const affectedCampaignIds = new Set<string>();

        for (const statusUpdate of value.statuses) {
          const newStatus = statusUpdate.status;
          const waMessageId = statusUpdate.id;

          // Update message status
          const updateData: Record<string, unknown> = { status: newStatus };
          if (newStatus === "failed") {
            const errCode = statusUpdate.errors?.[0]?.code || null;
            const errTitle = statusUpdate.errors?.[0]?.title || null;
            const errMessage = statusUpdate.errors?.[0]?.message || null;
            updateData.metadata = {
              error_code: errCode,
              error_title: errTitle,
              error_message: errMessage,
            };
          }

          await supabase.from("messages").update(updateData).eq("wa_message_id", waMessageId);

          // ── Update campaign_recipients status ──
          if (waMessageId && ["delivered", "read", "failed"].includes(newStatus)) {
            const recipientUpdate: Record<string, unknown> = { status: newStatus };
            const now = new Date().toISOString();
            if (newStatus === "delivered") recipientUpdate.delivered_at = now;
            else if (newStatus === "read") {
              recipientUpdate.read_at = now;
              // Also mark as delivered if not yet
              recipientUpdate.delivered_at = now;
            } else if (newStatus === "failed") {
              recipientUpdate.failed_at = now;
              recipientUpdate.error_code = statusUpdate.errors?.[0]?.code || null;
              recipientUpdate.error_message = statusUpdate.errors?.[0]?.message || null;
            }

            const { data: updatedRecipient } = await supabase
              .from("campaign_recipients")
              .update(recipientUpdate)
              .eq("wa_message_id", waMessageId)
              .select("campaign_id")
              .maybeSingle();

            if (updatedRecipient?.campaign_id) {
              affectedCampaignIds.add(updatedRecipient.campaign_id);
            }
          }

          if (newStatus === "failed") {
            await logToSystem(supabase, "error", `فشل تسليم رسالة واتساب`, {
              wa_message_id: waMessageId,
              recipient: statusUpdate.recipient_id,
              error_code: statusUpdate.errors?.[0]?.code || null,
              error_title: statusUpdate.errors?.[0]?.title || null,
              error_message: statusUpdate.errors?.[0]?.message || null,
            }, orgId);
          }
        }

        // ── Recalculate campaign aggregate counts ──
        for (const campaignId of affectedCampaignIds) {
          const { data: stats } = await supabase
            .from("campaign_recipients")
            .select("status")
            .eq("campaign_id", campaignId);

          if (stats) {
            const sent = stats.filter((r: any) => ["sent", "delivered", "read"].includes(r.status)).length;
            const delivered = stats.filter((r: any) => ["delivered", "read"].includes(r.status)).length;
            const read = stats.filter((r: any) => r.status === "read").length;
            const failed = stats.filter((r: any) => r.status === "failed").length;

            await supabase.from("campaigns").update({
              sent_count: sent,
              delivered_count: delivered,
              read_count: read,
              failed_count: failed,
              updated_at: new Date().toISOString(),
            }).eq("id", campaignId);
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
