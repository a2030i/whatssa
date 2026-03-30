import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// ── Chatbot Flow Processor ──
async function processChatbotFlow(
  client: ReturnType<typeof createClient>,
  orgId: string,
  conversationId: string,
  customerPhone: string,
  messageText: string,
  channel: "meta" | "evolution",
  log: typeof logToSystem,
): Promise<boolean> {
  const normalizedText = messageText.trim().toLowerCase();

  const { data: session } = await client
    .from("chatbot_sessions")
    .select("id, flow_id, current_node_id, is_active")
    .eq("conversation_id", conversationId)
    .eq("is_active", true)
    .maybeSingle();

  if (session) {
    const { data: flow } = await client
      .from("chatbot_flows")
      .select("nodes, is_active, name")
      .eq("id", session.flow_id)
      .eq("is_active", true)
      .maybeSingle();

    if (!flow) {
      await client.from("chatbot_sessions").update({ is_active: false }).eq("id", session.id);
      return false;
    }

    const nodes = (flow.nodes as any[]) || [];
    const currentNode = nodes.find((n: any) => n.id === session.current_node_id);

    if (!currentNode || !currentNode.buttons || currentNode.buttons.length === 0) {
      await client.from("chatbot_sessions").update({ is_active: false }).eq("id", session.id);
      return false;
    }

    let matchedButton = currentNode.buttons.find(
      (btn: any) => btn.label && normalizedText === btn.label.trim().toLowerCase()
    );
    if (!matchedButton) {
      const num = parseInt(normalizedText);
      if (num > 0 && num <= currentNode.buttons.length) {
        matchedButton = currentNode.buttons[num - 1];
      }
    }

    if (!matchedButton) {
      const buttonLabels = currentNode.buttons.map((b: any, i: number) => `${i + 1}. ${b.label}`).join("\n");
      const retryMsg = `اختر أحد الخيارات:\n${buttonLabels}`;
      await sendBotMessage(client, orgId, conversationId, customerPhone, retryMsg, channel, log);
      return true;
    }

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

    if (nextNode.type === "action") {
      await handleBotAction(client, orgId, conversationId, customerPhone, nextNode, channel, log);
      await client.from("chatbot_sessions").update({ is_active: false }).eq("id", session.id);
      return true;
    }

    let msgText = nextNode.content || "";
    if (nextNode.buttons && nextNode.buttons.length > 0) {
      const buttonLabels = nextNode.buttons.map((b: any, i: number) => `${i + 1}. ${b.label}`).join("\n");
      msgText += `\n\n${buttonLabels}`;
    }

    await sendBotMessage(client, orgId, conversationId, customerPhone, msgText, channel, log);
    await client.from("chatbot_sessions").update({
      current_node_id: nextNode.id, updated_at: new Date().toISOString(),
    }).eq("id", session.id);

    if (!nextNode.buttons || nextNode.buttons.length === 0) {
      await client.from("chatbot_sessions").update({ is_active: false }).eq("id", session.id);
    }

    return true;
  }

  const { data: flows } = await client
    .from("chatbot_flows")
    .select("id, trigger_type, trigger_keywords, welcome_message, nodes, name")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (!flows || flows.length === 0) return false;

  const { count: msgCount } = await client
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("sender", "customer");

  const isFirstMessage = (msgCount || 0) <= 1;

  let matchedFlow = null;
  for (const flow of flows) {
    if (flow.trigger_type === "first_message" && isFirstMessage) { matchedFlow = flow; break; }
    if (flow.trigger_type === "always") { matchedFlow = flow; break; }
    if (flow.trigger_type === "keyword" && Array.isArray(flow.trigger_keywords)) {
      if (flow.trigger_keywords.some((kw: string) => kw?.trim() && normalizedText.includes(kw.trim().toLowerCase()))) {
        matchedFlow = flow; break;
      }
    }
  }

  if (!matchedFlow) return false;

  const nodes = (matchedFlow.nodes as any[]) || [];
  if (nodes.length === 0) return false;

  await log(client, "info", `تدفق شات بوت مطابق (Evolution): ${matchedFlow.name}`, { flow_id: matchedFlow.id }, orgId);

  if (matchedFlow.welcome_message) {
    await sendBotMessage(client, orgId, conversationId, customerPhone, matchedFlow.welcome_message, channel, log);
  }

  const firstNode = nodes[0];
  let msgText = firstNode.content || "";
  if (firstNode.buttons && firstNode.buttons.length > 0) {
    const buttonLabels = firstNode.buttons.map((b: any, i: number) => `${i + 1}. ${b.label}`).join("\n");
    msgText += `\n\n${buttonLabels}`;
  }

  await sendBotMessage(client, orgId, conversationId, customerPhone, msgText, channel, log);

  if (firstNode.buttons && firstNode.buttons.length > 0) {
    await client.from("chatbot_sessions").upsert({
      conversation_id: conversationId, flow_id: matchedFlow.id,
      current_node_id: firstNode.id, is_active: true, org_id: orgId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "conversation_id" });
  }

  return true;
}

async function handleBotAction(
  client: ReturnType<typeof createClient>, orgId: string, conversationId: string,
  customerPhone: string, node: any, channel: "meta" | "evolution", log: typeof logToSystem,
) {
  const actionType = node.action_type || "transfer_agent";
  if (actionType === "transfer_agent") {
    await sendBotMessage(client, orgId, conversationId, customerPhone, node.content || "جاري تحويلك لأحد الموظفين...", channel, log);
  } else if (actionType === "close") {
    await sendBotMessage(client, orgId, conversationId, customerPhone, node.content || "شكراً لتواصلك معنا!", channel, log);
    await client.from("conversations").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", conversationId);
    await client.from("messages").insert({ conversation_id: conversationId, content: "تم إغلاق المحادثة تلقائياً بواسطة البوت", sender: "system", message_type: "text" });
  } else if (actionType === "add_tag" && node.content) {
    const { data: conv } = await client.from("conversations").select("tags").eq("id", conversationId).single();
    const tags: string[] = conv?.tags || [];
    if (!tags.includes(node.content)) {
      await client.from("conversations").update({ tags: [...tags, node.content] }).eq("id", conversationId);
    }
  }
}

async function sendBotMessage(
  client: ReturnType<typeof createClient>, orgId: string, conversationId: string,
  customerPhone: string, text: string, channel: "meta" | "evolution", log: typeof logToSystem,
) {
  if (!text) return;
  if (channel === "evolution") {
    const { data: config } = await client
      .from("whatsapp_config")
      .select("evolution_instance_name")
      .eq("org_id", orgId).eq("channel_type", "evolution").eq("is_connected", true)
      .limit(1).maybeSingle();
    if (config && EVOLUTION_API_URL && EVOLUTION_API_KEY) {
      try {
        const resp = await fetch(`${EVOLUTION_API_URL}/message/sendText/${config.evolution_instance_name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
          body: JSON.stringify({ number: customerPhone, text }),
        });
        if (resp.ok) {
          await client.from("messages").insert({ conversation_id: conversationId, sender: "agent", message_type: "text", content: text, status: "sent" });
          await client.from("conversations").update({ last_message: text, last_message_at: new Date().toISOString() }).eq("id", conversationId);
        }
      } catch (e) {
        await log(client, "error", "فشل إرسال رسالة البوت (Evolution)", { error: (e as Error).message }, orgId);
      }
    }
  } else {
    const { data: config } = await client
      .from("whatsapp_config")
      .select("phone_number_id, access_token")
      .eq("org_id", orgId).eq("channel_type", "meta_api").eq("is_connected", true)
      .limit(1).maybeSingle();
    if (config) {
      const resp = await fetch(`https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: customerPhone, type: "text", text: { body: text } }),
      });
      const result = await resp.json();
      if (resp.ok) {
        await client.from("messages").insert({ conversation_id: conversationId, wa_message_id: result.messages?.[0]?.id || null, sender: "agent", message_type: "text", content: text, status: "sent" });
        await client.from("conversations").update({ last_message: text, last_message_at: new Date().toISOString() }).eq("id", conversationId);
      } else {
        await log(client, "error", "فشل إرسال رسالة البوت (Meta)", { error: result?.error?.message }, orgId);
      }
    }
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
      function_name: "evolution-webhook",
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
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const event = body.event;
    const instanceName = body.instance || body.instanceName || "";

    // Find the config for this instance
    const { data: config } = await supabase
      .from("whatsapp_config")
      .select("id, org_id")
      .eq("evolution_instance_name", instanceName)
      .eq("channel_type", "evolution")
      .maybeSingle();

    if (!config) {
      await logToSystem(supabase, "warn", `Webhook وارد لجلسة غير معروفة: ${instanceName}`, { event, instance: instanceName });
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = config.org_id;

    // Handle CONNECTION_UPDATE
    if (event === "CONNECTION_UPDATE" || event === "connection.update") {
      const state = body.data?.state || body.state || "";
      const statusMap: Record<string, string> = {
        open: "connected",
        close: "disconnected",
        connecting: "connecting",
      };
      const newStatus = statusMap[state] || state;

      await supabase
        .from("whatsapp_config")
        .update({
          evolution_instance_status: newStatus,
          is_connected: newStatus === "connected",
          registration_status: newStatus === "connected" ? "connected" : "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", config.id);

      await logToSystem(supabase, newStatus === "disconnected" ? "warn" : "info",
        `حالة اتصال Evolution تغيرت: ${newStatus}`, { instance: instanceName, state }, orgId);

      // ── Auto-reconnect on disconnect ──
      if (newStatus === "disconnected" && EVOLUTION_API_URL && EVOLUTION_API_KEY) {
        await logToSystem(supabase, "info", `محاولة إعادة اتصال تلقائي للجلسة: ${instanceName}`, {}, orgId);
        try {
          const reconnectRes = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instanceName}`, {
            headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
          });
          const reconnectData = await reconnectRes.json();
          const reconnectState = reconnectData.instance?.state || reconnectData.state || "";
          if (reconnectState === "open") {
            await supabase.from("whatsapp_config").update({
              evolution_instance_status: "connected", is_connected: true, registration_status: "connected",
              updated_at: new Date().toISOString(),
            }).eq("id", config.id);
            await logToSystem(supabase, "info", `✅ تم إعادة الاتصال تلقائياً: ${instanceName}`, {}, orgId);
          } else {
            await logToSystem(supabase, "warn", `فشل إعادة الاتصال التلقائي — يتطلب QR جديد`, { state: reconnectState }, orgId);
            // Create notification for org admins
            const { data: orgAdmins } = await supabase.from("profiles").select("id").eq("org_id", orgId);
            if (orgAdmins && orgAdmins.length > 0) {
              const notifications = orgAdmins.map((admin: any) => ({
                org_id: orgId,
                user_id: admin.id,
                type: "alert",
                title: "⚠️ انقطع اتصال واتساب ويب",
                body: `انقطع اتصال جلسة واتساب ويب (${instanceName}). يرجى إعادة المسح من صفحة التكامل.`,
              }));
              await supabase.from("notifications").insert(notifications);
            }
          }
        } catch (e) {
          await logToSystem(supabase, "error", "فشل محاولة إعادة الاتصال التلقائي", {
            error: e instanceof Error ? e.message : String(e), instance: instanceName,
          }, orgId);
        }
      }
    }

    // Handle QRCODE_UPDATED
    if (event === "QRCODE_UPDATED" || event === "qrcode.updated") {
      await logToSystem(supabase, "info", `تم تحديث رمز QR للجلسة: ${instanceName}`, {}, orgId);
    }

    // Handle MESSAGES_UPSERT (incoming messages)
    if (event === "MESSAGES_UPSERT" || event === "messages.upsert") {
      const messages = body.data || [];
      const messageList = Array.isArray(messages) ? messages : [messages];

      // Load org settings once
      const { data: orgData } = await supabase.from("organizations").select("settings").eq("id", orgId).single();
      const orgSettings = (orgData?.settings as Record<string, any>) || {};

      for (const msg of messageList) {
        const key = msg.key || {};
        const messageContent = msg.message || {};

        if (key.fromMe) continue;

        const remoteJid = key.remoteJid || "";
        let conversationType = "private";
        let phone = "";
        if (remoteJid.endsWith("@g.us")) {
          conversationType = "group";
          phone = remoteJid.replace("@g.us", "");
        } else if (remoteJid.endsWith("@broadcast")) {
          conversationType = "broadcast";
          phone = remoteJid.replace("@broadcast", "");
        } else {
          phone = remoteJid.replace("@s.whatsapp.net", "");
        }
        if (!phone || phone.includes("status")) continue;

        const text =
          messageContent.conversation ||
          messageContent.extendedTextMessage?.text ||
          messageContent.imageMessage?.caption ||
          messageContent.videoMessage?.caption ||
          messageContent.documentMessage?.caption ||
          "";

        let messageType = "text";
        let mediaUrl = null;

        if (messageContent.imageMessage) messageType = "image";
        else if (messageContent.videoMessage) messageType = "video";
        else if (messageContent.audioMessage) messageType = "audio";
        else if (messageContent.documentMessage) messageType = "document";

        if (!text && messageType === "text") continue;

        await logToSystem(supabase, "info", `رسالة واردة (Evolution) من ${phone}`, {
          type: messageType, conversation_type: conversationType, wa_message_id: key.id,
        }, orgId);

        // ── Check for satisfaction rating response ──
        if (messageType === "text" && text) {
          const ratingNum = parseInt(text.trim());
          if (ratingNum >= 1 && ratingNum <= 5) {
            const { data: pendingConv } = await supabase
              .from("conversations")
              .select("id, assigned_to")
              .eq("customer_phone", phone)
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
              await sendBotMessage(supabase, orgId, pendingConv.id, phone, "شكراً لتقييمك! 🙏 نسعد بخدمتك دائماً.", "evolution", logToSystem);
              await logToSystem(supabase, "info", `تم تسجيل تقييم العميل (Evolution): ${ratingNum}/5`, { conversation_id: pendingConv.id, rating: ratingNum }, orgId);
              continue;
            }
          }
        }

        let { data: conversation } = await supabase
          .from("conversations")
          .select("id")
          .eq("customer_phone", phone)
          .eq("org_id", orgId)
          .eq("conversation_type", conversationType)
          .neq("status", "closed")
          .limit(1)
          .maybeSingle();

        if (!conversation) {
          let convName = msg.pushName || phone;

          if (conversationType === "group" && EVOLUTION_API_URL && EVOLUTION_API_KEY) {
            try {
              const groupRes = await fetch(
                `${EVOLUTION_API_URL}/group/findGroupInfos/${instanceName}?groupJid=${remoteJid}`,
                { headers: { apikey: EVOLUTION_API_KEY } }
              );
              if (groupRes.ok) {
                const groupData = await groupRes.json();
                const subject = groupData?.subject || groupData?.data?.subject || groupData?.[0]?.subject;
                if (subject) convName = subject;
                else convName = `قروب ${phone}`;
              } else {
                convName = `قروب ${phone}`;
              }
            } catch (e) {
              await logToSystem(supabase, "warn", "فشل جلب معلومات المجموعة من Evolution", {
                error: e instanceof Error ? e.message : String(e), remoteJid,
              }, orgId);
              convName = `قروب ${phone}`;
            }
          } else if (conversationType === "group") {
            convName = `قروب ${phone}`;
          } else if (conversationType === "private" && EVOLUTION_API_URL && EVOLUTION_API_KEY && (!convName || convName === phone)) {
            // ── Contact sync: fetch contact name from Evolution ──
            try {
              const contactRes = await fetch(
                `${EVOLUTION_API_URL}/chat/findContacts/${instanceName}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
                  body: JSON.stringify({ where: { id: `${phone}@s.whatsapp.net` } }),
                }
              );
              if (contactRes.ok) {
                const contacts = await contactRes.json();
                const contact = Array.isArray(contacts) ? contacts[0] : contacts;
                const contactName = contact?.pushName || contact?.name || contact?.notify || contact?.verifiedName;
                if (contactName && contactName !== phone) {
                  convName = contactName;
                  // Also update customer record if exists
                  await supabase.from("customers").update({ name: contactName }).eq("phone", phone).eq("org_id", orgId);
                }
              }
            } catch (e) {
              // Silent fail — pushName fallback is fine
            }
          }

          const { data: newConv, error: convError } = await supabase
            .from("conversations")
            .insert({
              customer_phone: phone,
              customer_name: convName,
              org_id: orgId,
              status: "active",
              conversation_type: conversationType,
              last_message: text || `[${messageType}]`,
              last_message_at: new Date().toISOString(),
            })
            .select("id")
            .single();

          if (convError) {
            await logToSystem(supabase, "error", "فشل إنشاء محادثة جديدة (Evolution)", {
              error: convError.message, customer_phone: phone,
            }, orgId);
          } else {
            await logToSystem(supabase, "info", `محادثة جديدة أُنشئت (Evolution) للعميل ${phone}`, {
              conversation_id: newConv?.id,
            }, orgId);
          }

          conversation = newConv;
        }

        if (!conversation) continue;

        if (messageType !== "text") {
          mediaUrl = await uploadMediaFromEvolution({
            instanceName,
            key,
            conversationId: conversation.id,
            messageType,
            supabase,
            orgId,
          });
        }

        const content = text || `[${messageType}]`;
        const senderName = msg.pushName || "";
        const participant = key.participant || key.participantAlt || "";

        const contextInfo =
          messageContent.extendedTextMessage?.contextInfo ||
          messageContent.imageMessage?.contextInfo ||
          messageContent.videoMessage?.contextInfo ||
          messageContent.audioMessage?.contextInfo ||
          messageContent.documentMessage?.contextInfo ||
          messageContent.contextInfo ||
          null;

        const quotedMessage = contextInfo?.quotedMessage || null;
        const quotedStanzaId = contextInfo?.stanzaId || null;
        const quotedParticipant = contextInfo?.participant || "";
        const quotedSenderName = quotedParticipant
          ? quotedParticipant.replace("@s.whatsapp.net", "").replace("@lid", "")
          : "";

        let quotedText = "";
        if (quotedMessage) {
          quotedText =
            quotedMessage.conversation ||
            quotedMessage.extendedTextMessage?.text ||
            quotedMessage.imageMessage?.caption ||
            quotedMessage.videoMessage?.caption ||
            quotedMessage.audioMessage ? "[مقطع صوتي]" :
            quotedMessage.documentMessage?.caption ||
            "[مرفق]";
        }

        const metadata: Record<string, unknown> = {};
        if (senderName) metadata.sender_name = senderName;
        if (conversationType === "group") metadata.participant = participant;
        if (quotedStanzaId && quotedMessage) {
          metadata.quoted = {
            stanza_id: quotedStanzaId,
            sender_name: quotedSenderName,
            text: quotedText,
          };
          const { data: originalMsg } = await supabase
            .from("messages")
            .select("id, content, sender, metadata")
            .eq("wa_message_id", quotedStanzaId)
            .limit(1)
            .maybeSingle();
          if (originalMsg) {
            metadata.quoted.message_id = originalMsg.id;
            metadata.quoted.text = originalMsg.content;
            metadata.quoted.sender_name =
              (originalMsg.metadata as any)?.sender_name || (originalMsg.sender === "agent" ? "أنت" : quotedSenderName);
          }
        }

        const { error: messageInsertError } = await supabase.from("messages").insert({
          conversation_id: conversation.id,
          content,
          sender: "customer",
          message_type: messageType,
          media_url: mediaUrl,
          wa_message_id: key.id || null,
          status: "received",
          metadata,
        });

        if (messageInsertError) {
          await logToSystem(supabase, "error", "فشل حفظ الرسالة الواردة (Evolution)", {
            error: messageInsertError.message, wa_message_id: key.id, conversation_id: conversation.id,
          }, orgId);
          continue;
        }

        const { error: unreadError } = await supabase.rpc("increment_unread", { conv_id: conversation.id });
        if (unreadError) {
          await logToSystem(supabase, "warn", "فشل تحديث عداد الرسائل غير المقروءة", {
            error: unreadError.message, conversation_id: conversation.id,
          }, orgId);
        }

        await supabase
          .from("conversations")
          .update({
            last_message: content,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversation.id);

        // ── Out-of-hours check ──
        if (orgSettings.out_of_hours_enabled && messageType === "text") {
          const now = new Date();
          const riyadhTime = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" });
          const dayOfWeek = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Riyadh" })).getDay();
          const workStart = orgSettings.work_start || "09:00";
          const workEnd = orgSettings.work_end || "17:00";
          const workDays: number[] = orgSettings.work_days || [0, 1, 2, 3, 4];
          
          const isOutOfHours = !workDays.includes(dayOfWeek) || !(riyadhTime >= workStart && riyadhTime <= workEnd);
          
          if (isOutOfHours && orgSettings.out_of_hours_message) {
            const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
            const { count: recentOoh } = await supabase
              .from("messages")
              .select("id", { count: "exact", head: true })
              .eq("conversation_id", conversation.id)
              .eq("sender", "agent")
              .eq("content", orgSettings.out_of_hours_message)
              .gte("created_at", fourHoursAgo);
            
            if (!recentOoh || recentOoh === 0) {
              await sendBotMessage(supabase, orgId, conversation.id, phone, orgSettings.out_of_hours_message, "evolution", logToSystem);
              await logToSystem(supabase, "info", "تم إرسال رسالة خارج الدوام (Evolution)", { conversation_id: conversation.id }, orgId);
            }
          }
        }

        // ── Chatbot flow processing ──
        if (messageType === "text" && content) {
          const chatbotHandled = await processChatbotFlow(supabase, orgId, conversation.id, phone, content, "evolution", logToSystem);
          
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
              rule.keywords.some((kw: string) => kw?.trim() && normalizedContent.includes(kw.trim().toLowerCase())),
            );

            if (matchedRule) {
              const actionType = matchedRule.action_type || "reply";
              await logToSystem(supabase, "info", `قاعدة أتمتة مطابقة (Evolution): ${matchedRule.name} (${actionType})`, {
                rule_id: matchedRule.id, action_type: actionType,
              }, orgId);

              if (actionType === "add_tag" || actionType === "reply_and_tag") {
                const tag = matchedRule.action_tag;
                if (tag) {
                  const { data: conv } = await supabase.from("conversations").select("tags").eq("id", conversation.id).single();
                  const currentTags: string[] = conv?.tags || [];
                  if (!currentTags.includes(tag)) {
                    await supabase.from("conversations").update({ tags: [...currentTags, tag] }).eq("id", conversation.id);
                  }
                }
              }

              if (actionType === "assign_team" && matchedRule.action_team_id) {
                const { data: team } = await supabase.from("teams").select("name").eq("id", matchedRule.action_team_id).single();
                if (team) {
                  await supabase.from("conversations").update({ assigned_team: team.name }).eq("id", conversation.id);
                  await supabase.from("messages").insert({
                    conversation_id: conversation.id, content: `تم إسناد المحادثة تلقائياً لفريق: ${team.name}`, sender: "system", message_type: "text",
                  });
                  try { await supabase.functions.invoke("auto-assign", { body: { conversation_id: conversation.id, org_id: orgId, message_text: content } }); } catch (_) {}
                }
              }

              if ((actionType === "reply" || actionType === "reply_and_tag") && matchedRule.reply_text) {
                try {
                  const sendResp = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
                    body: JSON.stringify({ number: phone, text: matchedRule.reply_text }),
                  });
                  if (sendResp.ok) {
                    await supabase.from("messages").insert({
                      conversation_id: conversation.id, sender: "agent", message_type: "text", content: matchedRule.reply_text, status: "sent",
                    });
                    await supabase.from("conversations").update({
                      last_message: matchedRule.reply_text, last_message_at: new Date().toISOString(),
                    }).eq("id", conversation.id);
                  }
                } catch (e) {
                  await logToSystem(supabase, "error", "فشل إرسال الرد التلقائي (Evolution)", { error: (e as Error).message }, orgId);
                }
              }
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    await logToSystem(supabase, "critical", "خطأ غير متوقع في Evolution Webhook", {
      error: err.message, stack: err.stack,
    });
    console.error("Evolution webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function uploadMediaFromEvolution(params: {
  instanceName: string;
  key: Record<string, unknown>;
  conversationId: string;
  messageType: string;
  supabase: ReturnType<typeof createClient>;
  orgId: string;
}) {
  const { instanceName, key, conversationId, messageType, supabase, orgId } = params;

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  if (!["audio", "image", "video", "document"].includes(messageType)) {
    return null;
  }

  try {
    const response = await fetch(`${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        message: { key },
        convertToMp4: messageType === "audio",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      await logToSystem(supabase, "error", "فشل جلب الوسائط من Evolution API", {
        http_status: response.status, error: errText.slice(0, 300), messageType,
      }, orgId);
      return null;
    }

    const media = await response.json();
    const base64 = media?.base64 || media?.data?.base64;
    if (!base64) return null;

    const mimeType = media?.mimetype || media?.mimeType || media?.data?.mimetype || media?.data?.mimeType ||
      (messageType === "audio" ? "audio/mp4" : messageType === "image" ? "image/jpeg" : messageType === "video" ? "video/mp4" : "application/octet-stream");
    const extension = mimeType.split("/")[1]?.split(";")[0] || (messageType === "audio" ? "mp4" : "bin");
    const fileName = `${conversationId}/${crypto.randomUUID()}.${extension}`;

    const adminStorage = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const binary = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

    const { error: uploadError } = await adminStorage.storage
      .from("chat-media")
      .upload(fileName, binary, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      await logToSystem(supabase, "error", "فشل رفع الوسائط إلى التخزين", {
        error: uploadError.message, fileName, messageType,
      }, orgId);
      return null;
    }

    // Return the storage path (not public URL) — frontend will create signed URLs
    return `storage:chat-media/${fileName}`;
  } catch (error) {
    await logToSystem(supabase, "error", "خطأ غير متوقع في رفع الوسائط (Evolution)", {
      error: error instanceof Error ? error.message : String(error),
    }, orgId);
    return null;
  }
}
