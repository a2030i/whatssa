import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

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

  const { count: msgCount } = await client
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("sender", "customer");

  const isFirstMessage = (msgCount || 0) <= 1;

  let matchedFlow = null;
  for (const flow of filteredFlows) {
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
    // Fire-and-forget: don't block webhook processing
    client.from("system_logs").insert({
      level,
      source: "edge_function",
      function_name: "evolution-webhook",
      message,
      metadata,
      org_id: orgId || null,
    }).then(() => {}).catch((e) => console.error("Log write failed:", e));
  } catch (e) {
    console.error("Failed to write system log:", e);
  }
}

async function fetchEvolutionContactName(instanceName: string, phone: string): Promise<string | null> {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) return null;

  try {
    const contactRes = await fetch(`${EVOLUTION_API_URL}/chat/findContacts/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
      body: JSON.stringify({ where: { id: `${phone}@s.whatsapp.net` } }),
    });

    if (!contactRes.ok) return null;

    const contacts = await contactRes.json();
    const contact = Array.isArray(contacts)
      ? contacts[0]
      : Array.isArray(contacts?.data)
        ? contacts.data[0]
        : contacts?.data || contacts;

    const candidate = [
      contact?.pushName,
      contact?.name,
      contact?.notify,
      contact?.verifiedName,
      contact?.profileName,
    ].find((value) => typeof value === "string" && value.trim() && value.trim() !== phone);

    return candidate?.trim() || null;
  } catch {
    return null;
  }
}

// orgName is injected at runtime so the static blocked list stays pure
let _dynamicBlockedNames: Set<string> = new Set();

function setDynamicBlockedNames(orgName?: string | null) {
  _dynamicBlockedNames = new Set();
  if (orgName) {
    _dynamicBlockedNames.add(orgName.trim().toLowerCase());
  }
}

function chooseBestContactName(...values: Array<string | null | undefined>): string | null {
  const blocked = new Set([
    "whatsapp",
    "whatsapp business",
    "organization",
    "org",
    "respondly",
    "lamha",
  ]);

  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (!normalized) continue;
    const plain = normalized.toLowerCase().replace(/\s+/g, " ");
    if (blocked.has(plain)) continue;
    if (_dynamicBlockedNames.has(plain)) continue;
    if (/organization$/i.test(normalized)) continue;
    return normalized;
  }

  return null;
}

const mapEvolutionStatus = (status: unknown): "sent" | "delivered" | "read" | null => {
  const statusMap: Record<string, "sent" | "delivered" | "read"> = {
    SERVER_ACK: "sent",
    DELIVERY_ACK: "delivered",
    READ: "read",
    PLAYED: "read",
    DELETED: null as never,
    REVOKED: null as never,
    "2": "sent",
    "3": "delivered",
    "4": "read",
    "5": "read",
  };

  return statusMap[String(status)] || null;
};

const pickBestUpdatedStatus = (payload: any): "sent" | "delivered" | "read" | null => {
  const priority: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
  const candidates = [
    payload?.status,
    payload?.update?.status,
    payload?.messageStatus,
    payload?.ack,
    payload?.messageAck,
    payload?.receipt,
    payload?.update?.ack,
    ...(Array.isArray(payload?.MessageUpdate) ? payload.MessageUpdate.map((item: any) => item?.status) : []),
    ...(Array.isArray(payload?.messageUpdate) ? payload.messageUpdate.map((item: any) => item?.status) : []),
  ]
    .map(mapEvolutionStatus)
    .filter(Boolean) as Array<"sent" | "delivered" | "read">;

  return candidates.reduce<"sent" | "delivered" | "read" | null>((best, current) => {
    if (!best) return current;
    return (priority[current] || 0) > (priority[best] || 0) ? current : best;
  }, null);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();

    // Detect event from body.event OR from URL path (webhookByEvents appends /messages-update etc.)
    let event = body.event || "";
    if (!event) {
      const url = new URL(req.url);
      const pathSegments = url.pathname.split("/").filter(Boolean);
      // Last segment might be the event slug like "messages-update", "messages-upsert", etc.
      const lastSegment = pathSegments[pathSegments.length - 1] || "";
      const pathEventMap: Record<string, string> = {
        "messages-upsert": "MESSAGES_UPSERT",
        "messages-update": "MESSAGES_UPDATE",
        "messages-delete": "MESSAGES_DELETE",
        "messages-edited": "MESSAGES_EDITED",
        "connection-update": "CONNECTION_UPDATE",
        "qrcode-updated": "QRCODE_UPDATED",
        "presence-update": "PRESENCE_UPDATE",
        "send-message": "SEND_MESSAGE",
      };
      event = pathEventMap[lastSegment] || "";
    }

    // Evolution v2 may send instance as string or as object {instanceName: "..."}
    let instanceName = "";
    if (typeof body.instance === "string") {
      instanceName = body.instance;
    } else if (typeof body.instance === "object" && body.instance?.instanceName) {
      instanceName = body.instance.instanceName;
    } else if (typeof body.instanceName === "string") {
      instanceName = body.instanceName;
    }

    console.log(`[evolution-webhook] event=${event} instance="${instanceName}" bodyKeys=${Object.keys(body).join(",")}`);

    // Find the config for this instance
    const { data: config, error: configError } = await supabase
      .from("whatsapp_config")
      .select("id, org_id, default_team_id, default_agent_id")
      .eq("evolution_instance_name", instanceName)
      .eq("channel_type", "evolution")
      .maybeSingle();

    console.log(`[evolution-webhook] config found: ${!!config}, error: ${configError?.message || "none"}`);

    if (!config) {
      console.log(`[evolution-webhook] SKIPPED - no config for instance "${instanceName}"`);
      await logToSystem(supabase, "warn", `Webhook وارد لجلسة غير معروفة: ${instanceName}`, { event, instance: instanceName, bodyKeys: Object.keys(body), configError: configError?.message });
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = config.org_id;

    // Log every incoming event for debugging status updates
    if (event === "MESSAGES_UPDATE" || event === "SEND_MESSAGE") {
      await logToSystem(supabase, "info", `حدث Webhook وارد: ${event}`, {
        event, instance: instanceName, data_keys: Object.keys(body.data || body || {}),
        raw_snippet: JSON.stringify(body.data || body).slice(0, 500),
      }, orgId);
    }


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

    // ── Handle PRESENCE_UPDATE (customer typing) ──
    if (event === "PRESENCE_UPDATE" || event === "presence.update") {
      const presenceData = body.data || body;
      const participant = presenceData?.participant || presenceData?.id || "";
      const presenceStatus = presenceData?.status || presenceData?.type || "";
      const phone = participant.replace("@s.whatsapp.net", "").replace("@c.us", "");

      if (phone && (presenceStatus === "composing" || presenceStatus === "recording")) {
        // Find active conversation for this phone
        const { data: conv } = await supabase
          .from("conversations")
          .select("id")
          .eq("customer_phone", phone)
          .eq("org_id", orgId)
          .eq("channel_id", config.id)
          .neq("status", "closed")
          .limit(1)
          .maybeSingle();

        if (conv) {
          // Broadcast typing event to frontend via Supabase Realtime
          const channelName = `customer-typing:${conv.id}`;
          const channel = supabase.channel(channelName);
          await channel.send({ type: "broadcast", event: "typing", payload: { phone } });
          supabase.removeChannel(channel);
        }
      }
    }

    if (event === "MESSAGES_UPSERT" || event === "messages.upsert") {
      const messages = body.data || [];
      const messageList = Array.isArray(messages) ? messages : [messages];

      // Load org settings once
      const { data: orgData } = await supabase.from("organizations").select("settings, name").eq("id", orgId).single();
      const orgSettings = (orgData?.settings as Record<string, any>) || {};
      // Block org name from being used as customer name
      setDynamicBlockedNames(orgData?.name);

      for (const msg of messageList) {
        const key = msg.key || {};
        const messageContent = msg.message || {};

        const isFromMe = !!key.fromMe;

        // Extract senderPn — real phone number for @lid participants
        const senderPn: string = key.senderPn || msg.senderPn || "";

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
          // For private chats with @lid, use senderPn if available
          const rawPhone = remoteJid.replace("@s.whatsapp.net", "").replace("@lid", "");
          phone = (remoteJid.includes("@lid") && senderPn) ? senderPn.replace(/\D/g, "") : rawPhone;
        }
        if (!phone || phone.includes("status")) continue;

        // ── Handle reactionMessage inside MESSAGES_UPSERT (v2.3.7 has no separate event) ──
        if (messageContent.reactionMessage) {
          const reactionKey = messageContent.reactionMessage.key || {};
          const targetWaId = reactionKey.id;
          const emoji = messageContent.reactionMessage.text || "";
          const reactionFromMe = !!isFromMe;
          const reactionParticipant = (key.participant || "").replace("@s.whatsapp.net", "").replace("@lid", "");
          const reactionParticipantName = msg.pushName || "";

          if (targetWaId) {
            const { data: targetMsg } = await supabase
              .from("messages")
              .select("id, metadata")
              .eq("wa_message_id", targetWaId)
              .limit(1)
              .maybeSingle();

            if (targetMsg) {
              const meta = (targetMsg.metadata as Record<string, any>) || {};
              let reactions: Array<{ emoji: string; fromMe: boolean; timestamp?: string; participant?: string; participantName?: string }> = meta.reactions || [];

              if (emoji) {
                // In groups, identify by participant phone; in private, by fromMe
                const matchFn = reactionParticipant
                  ? (r: any) => r.participant === reactionParticipant
                  : (r: any) => r.fromMe === reactionFromMe;
                const existingIdx = reactions.findIndex(matchFn);
                const newReaction = {
                  emoji,
                  fromMe: reactionFromMe,
                  timestamp: new Date().toISOString(),
                  ...(reactionParticipant ? { participant: reactionParticipant } : {}),
                  ...(reactionParticipantName ? { participantName: reactionParticipantName } : {}),
                };
                if (existingIdx >= 0) {
                  reactions[existingIdx] = newReaction;
                } else {
                  reactions.push(newReaction);
                }
              } else {
                // Remove reaction
                const matchFn = reactionParticipant
                  ? (r: any) => r.participant !== reactionParticipant
                  : (r: any) => r.fromMe !== reactionFromMe;
                reactions = reactions.filter(matchFn);
              }

              await supabase.from("messages").update({
                metadata: { ...meta, reactions },
              }).eq("id", targetMsg.id);

              await logToSystem(supabase, "info", `تفاعل ${emoji || '(إزالة)'} على رسالة`, {
                wa_message_id: targetWaId, fromMe: reactionFromMe, participant: reactionParticipant,
              }, orgId);
            }
          }
          continue;
        }

        // ── Handle group membership changes (stub messages) ──
        const stubType = msg.messageStubType;
        if (stubType && conversationType === "group") {
          const stubParams = msg.messageStubParameters || [];
          let systemText = "";
          const affectedPhones = stubParams.map((p: string) => p.replace("@s.whatsapp.net", "").replace("@lid", ""));
          const actorName = msg.pushName || key.participant?.replace("@s.whatsapp.net", "").replace("@lid", "") || "";

          // 27=add, 28=remove, 32=join via link, 31=leave
          if (stubType === 27 || stubType === "27") {
            systemText = `${actorName} أضاف ${affectedPhones.join(", ")} إلى المجموعة`;
          } else if (stubType === 28 || stubType === "28" || stubType === 31 || stubType === "31") {
            systemText = `${affectedPhones.join(", ")} غادر المجموعة`;
          } else if (stubType === 32 || stubType === "32") {
            systemText = `${affectedPhones.join(", ")} انضم عبر رابط الدعوة`;
          }

          if (systemText && conversation) {
            // Insert system message
            await supabase.from("messages").insert({
              conversation_id: conversation.id,
              content: systemText,
              sender: "system",
              message_type: "text",
              wa_message_id: key.id || `stub_${Date.now()}`,
              metadata: { stub_type: stubType, affected_phones: affectedPhones },
            });
            await supabase.from("conversations").update({
              last_message: systemText,
              last_message_at: new Date().toISOString(),
            }).eq("id", conversation.id);
          }
          continue;
        }

        const text =
          messageContent.conversation ||
          messageContent.extendedTextMessage?.text ||
          messageContent.imageMessage?.caption ||
          messageContent.videoMessage?.caption ||
          messageContent.documentMessage?.caption ||
          "";

        let messageType = "text";
        let mediaUrl = null;
        let extraMetadata: Record<string, any> = {};

        if (messageContent.imageMessage) messageType = "image";
        else if (messageContent.videoMessage) messageType = "video";
        else if (messageContent.audioMessage) messageType = "audio";
        else if (messageContent.documentMessage) messageType = "document";
        else if (messageContent.stickerMessage) messageType = "sticker";
        else if (messageContent.locationMessage) {
          messageType = "location";
          extraMetadata.location = {
            latitude: messageContent.locationMessage.degreesLatitude,
            longitude: messageContent.locationMessage.degreesLongitude,
            name: messageContent.locationMessage.name || null,
            address: messageContent.locationMessage.address || null,
          };
        } else if (messageContent.contactMessage || messageContent.contactsArrayMessage) {
          messageType = "contacts";
          const contactArr = messageContent.contactsArrayMessage?.contacts || [messageContent.contactMessage];
          extraMetadata.contacts = contactArr.map((c: any) => ({
            name: c?.displayName || c?.vcard?.match(/FN:(.*)/)?.[1] || "",
            phone: c?.vcard?.match(/TEL.*:([\d+]+)/)?.[1] || "",
          }));
        } else if (messageContent.pollCreationMessage || messageContent.pollCreationMessageV3) {
          messageType = "poll";
          const pollMsg = messageContent.pollCreationMessage || messageContent.pollCreationMessageV3;
          extraMetadata.poll = {
            question: pollMsg.name || "",
            options: (pollMsg.options || []).map((o: any, i: number) => ({
              id: `opt_${i}`,
              title: o.optionName || o,
            })),
          };
        } else if (messageContent.pollUpdateMessage) {
          // Handle poll vote updates
          const pollUpdate = messageContent.pollUpdateMessage;
          const pollCreationMsgKey = pollUpdate.pollCreationMessageKey;
          const targetPollWaId = pollCreationMsgKey?.id;
          
          if (targetPollWaId) {
            try {
              // Decode vote from pollUpdateMessage
              const vote = pollUpdate.vote || {};
              const selectedOptions: string[] = (vote.selectedOptions || []).map((o: any) => {
                if (typeof o === "string") return o;
                // Binary data — try to decode UTF-8
                if (o instanceof Uint8Array || (o && o.type === "Buffer")) {
                  const bytes = o instanceof Uint8Array ? o : new Uint8Array(o.data || []);
                  return new TextDecoder().decode(bytes);
                }
                return String(o);
              });

              const voterJid = key.participant || remoteJid || "";
              const voterPhone = voterJid.replace("@s.whatsapp.net", "").replace("@lid", "").replace("@g.us", "");

              // Find the original poll message in DB
              const { data: pollMsg } = await supabase
                .from("messages")
                .select("id, metadata")
                .eq("wa_message_id", targetPollWaId)
                .maybeSingle();

              if (pollMsg) {
                const meta = (pollMsg.metadata as any) || {};
                const poll = meta.poll || {};
                const existingVotes: Record<string, string[]> = poll.votes || {};

                // Remove voter from all previous options
                for (const optId of Object.keys(existingVotes)) {
                  existingVotes[optId] = (existingVotes[optId] || []).filter((v: string) => v !== voterPhone);
                }

                // Add voter to selected options (match by title)
                const options: Array<{ id: string; title: string }> = poll.options || [];
                for (const selOpt of selectedOptions) {
                  const matchedOpt = options.find((o) => o.title === selOpt);
                  if (matchedOpt) {
                    if (!existingVotes[matchedOpt.id]) existingVotes[matchedOpt.id] = [];
                    if (!existingVotes[matchedOpt.id].includes(voterPhone)) {
                      existingVotes[matchedOpt.id].push(voterPhone);
                    }
                  }
                }

                // Update the message metadata with new votes
                await supabase.from("messages").update({
                  metadata: { ...meta, poll: { ...poll, votes: existingVotes } },
                }).eq("id", pollMsg.id);
              }
            } catch (pollErr: any) {
              await logToSystem(supabase, "error", "خطأ في معالجة تحديث التصويت", {
                error: pollErr.message, targetPollWaId,
              }, orgId);
            }
          }
          continue;
        }

        if (!text && messageType === "text") continue;

        // ── Handle outgoing messages sent from phone ──
        if (isFromMe) {
          const resolvedOutgoingName = conversationType === "private"
            ? await fetchEvolutionContactName(instanceName, phone)
            : null;

          // Find existing conversation to sync the outgoing message
          let { data: existingConv } = await supabase
            .from("conversations")
            .select("id")
            .eq("customer_phone", phone)
            .eq("org_id", orgId)
            .eq("conversation_type", conversationType)
            .eq("channel_id", config.id)
            .neq("status", "closed")
            .limit(1)
            .maybeSingle();

          // If no conversation exists, create one for the new contact
          if (!existingConv) {
            let outConvName = chooseBestContactName(resolvedOutgoingName, msg.pushName) || phone;
            if (conversationType === "group") {
              outConvName = `قروب ${phone}`;
              if (EVOLUTION_API_URL && EVOLUTION_API_KEY) {
                try {
                  const groupRes = await fetch(
                    `${EVOLUTION_API_URL}/group/findGroupInfos/${instanceName}?groupJid=${remoteJid}`,
                    { headers: { apikey: EVOLUTION_API_KEY } }
                  );
                  if (groupRes.ok) {
                    const groupData = await groupRes.json();
                    const subject = groupData?.subject || groupData?.data?.subject || groupData?.[0]?.subject;
                    if (subject) outConvName = subject;
                  }
                } catch {}
              }
            }

            // Fetch profile picture for outgoing new conversation
            let outProfilePic: string | null = null;
            if (conversationType === "private" && EVOLUTION_API_URL && EVOLUTION_API_KEY) {
              try {
                const picRes = await fetch(`${EVOLUTION_API_URL}/chat/fetchProfilePictureUrl/${instanceName}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
                  body: JSON.stringify({ number: `${phone}@s.whatsapp.net` }),
                });
                if (picRes.ok) {
                  const picData = await picRes.json();
                  outProfilePic = picData?.profilePictureUrl || picData?.url || picData?.picture || null;
                }
              } catch {}
            }

            const { data: newOutConv } = await supabase
              .from("conversations")
              .insert({
                customer_phone: phone,
                customer_name: outConvName,
                org_id: orgId,
                status: "active",
                conversation_type: conversationType,
                last_message: text || `[${messageType}]`,
                last_message_at: new Date().toISOString(),
                channel_id: config.id,
                customer_profile_pic: outProfilePic,
              })
              .select("id")
              .single();

            existingConv = newOutConv;
            await logToSystem(supabase, "info", `محادثة جديدة أُنشئت من رسالة صادرة (Evolution) إلى ${phone}`, {
              conversation_id: newOutConv?.id,
            }, orgId);
          } else if (resolvedOutgoingName) {
            const safeOutgoingName = chooseBestContactName(resolvedOutgoingName, msg.pushName);
            if (safeOutgoingName) {
              await supabase.from("conversations").update({ customer_name: safeOutgoingName }).eq("id", existingConv.id);
              await supabase.from("customers").update({ name: safeOutgoingName }).eq("org_id", orgId).eq("phone", phone);
            }
          }

          if (existingConv) {
            // Check duplicate by wa_message_id
            if (key.id) {
              const { data: existingMsg } = await supabase
                .from("messages")
                .select("id")
                .eq("wa_message_id", key.id)
                .limit(1)
                .maybeSingle();
              if (existingMsg) continue;
            }

            // Upload media for outgoing messages
            let outgoingMediaUrl: string | null = null;
            if (messageType !== "text") {
              outgoingMediaUrl = await uploadMediaFromEvolution({
                instanceName,
                key,
                conversationId: existingConv.id,
                messageType,
                supabase,
                orgId,
              });
            }

            await supabase.from("messages").insert({
              conversation_id: existingConv.id,
              sender: "agent",
              message_type: messageType,
              content: text || `[${messageType}]`,
              media_url: outgoingMediaUrl,
              wa_message_id: key.id || null,
              status: "delivered",
            });

            await supabase.from("conversations").update({
              last_message: text || `[${messageType}]`,
              last_message_at: new Date().toISOString(),
            }).eq("id", existingConv.id);

            // Also update channel_id if missing
            await supabase.from("conversations").update({ channel_id: config.id }).eq("id", existingConv.id).is("channel_id", null);

            await logToSystem(supabase, "info", `رسالة صادرة من الجوال (Evolution) إلى ${phone}`, {
              type: messageType, has_media: !!outgoingMediaUrl, wa_message_id: key.id,
            }, orgId);
          }
          continue;
        }

        await logToSystem(supabase, "info", `رسالة واردة (Evolution) من ${phone}`, {
          type: messageType, conversation_type: conversationType, wa_message_id: key.id,
        }, orgId);

        // ── Check for satisfaction rating response ──
        if (messageType === "text" && text) {
          const ratingNum = parseInt(text.trim());
          if (ratingNum >= 1 && ratingNum <= 5) {
            let satQuery = supabase
              .from("conversations")
              .select("id, assigned_to")
              .eq("customer_phone", phone)
              .eq("org_id", orgId)
              .eq("channel_id", config.id)
              .eq("status", "closed")
              .eq("satisfaction_status", "pending");
            const { data: pendingConv } = await satQuery
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

        const resolvedIncomingName = conversationType === "private"
          ? await fetchEvolutionContactName(instanceName, phone)
          : null;
        let conversationDisplayName = chooseBestContactName(resolvedIncomingName, msg.pushName) || phone;

        let { data: conversation } = await supabase
          .from("conversations")
          .select("id, status")
          .eq("customer_phone", phone)
          .eq("org_id", orgId)
          .eq("conversation_type", conversationType)
          .eq("channel_id", config.id)
          .neq("status", "closed")
          .limit(1)
          .maybeSingle();

        // If no open conversation, check for a closed one to reopen
        if (!conversation) {
            const { data: closedConv } = await supabase
              .from("conversations")
              .select("id, status, dedicated_agent_id, dedicated_agent_name")
              .eq("customer_phone", phone)
              .eq("org_id", orgId)
              .eq("conversation_type", conversationType)
              .eq("channel_id", config.id)
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
              last_message: text || `[${messageType}]`,
              last_message_at: new Date().toISOString(),
            };
            if (closedConv.dedicated_agent_id) {
              reopenUpdate.assigned_to_id = closedConv.dedicated_agent_id;
              reopenUpdate.assigned_to = closedConv.dedicated_agent_name;
              reopenUpdate.assigned_at = new Date().toISOString();
            } else {
              let smartReassigned = false;
              const { data: orgSettings } = await supabase.from("organizations").select("settings").eq("id", orgId).single();
              const smartMinutes = (orgSettings?.settings as any)?.smart_reassign_minutes;
              if (smartMinutes && smartMinutes > 0) {
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
                reopenUpdate.assigned_to_id = null;
                reopenUpdate.assigned_to = null;
                reopenUpdate.assigned_team_id = null;
                reopenUpdate.assigned_team = null;
                reopenUpdate.assigned_at = null;
              }
            }
            reopenUpdate.channel_id = config.id;
            await supabase.from("conversations").update(reopenUpdate).eq("id", closedConv.id);
            conversation = { ...closedConv, status: "active" };
            await supabase.from("messages").insert({
              conversation_id: closedConv.id,
              content: "تم إعادة فتح المحادثة تلقائياً بعد رسالة جديدة من العميل",
              sender: "system",
              message_type: "text",
            });
            await logToSystem(supabase, "info", `تم إعادة فتح محادثة مغلقة (Evolution) للعميل ${phone}`, { conversation_id: closedConv.id }, orgId);
          }
        }

        if (!conversation) {
          let convName = conversationDisplayName;

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
          }

          conversationDisplayName = convName;

          // ── Fetch profile picture URL ──
          let profilePicUrl: string | null = null;
          if (conversationType === "private" && EVOLUTION_API_URL && EVOLUTION_API_KEY) {
            try {
              const picRes = await fetch(
                `${EVOLUTION_API_URL}/chat/fetchProfilePictureUrl/${instanceName}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
                  body: JSON.stringify({ number: `${phone}@s.whatsapp.net` }),
                }
              );
              if (picRes.ok) {
                const picData = await picRes.json();
                profilePicUrl = picData?.profilePictureUrl || picData?.url || picData?.picture || picData?.data?.profilePictureUrl || null;
              }
            } catch {
              // Silent fail
            }
          }

          const convInsert: Record<string, any> = {
              customer_phone: phone,
              customer_name: convName,
              org_id: orgId,
              status: "active",
              conversation_type: conversationType,
              last_message: text || `[${messageType}]`,
              last_message_at: new Date().toISOString(),
              channel_id: config.id,
              customer_profile_pic: profilePicUrl,
            };
            // Apply channel routing
            if (config.default_agent_id) {
              convInsert.assigned_to = config.default_agent_id;
              convInsert.assigned_at = new Date().toISOString();
            } else if (config.default_team_id) {
              const { data: teamData } = await supabase.from("teams").select("name").eq("id", config.default_team_id).single();
              if (teamData) convInsert.assigned_team = teamData.name;
            }

          const { data: newConv, error: convError } = await supabase
            .from("conversations")
            .insert(convInsert)
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

            // Trigger auto-assign for new conversations with team routing
            if (newConv && config.default_team_id && !config.default_agent_id) {
              try {
                await supabase.functions.invoke("auto-assign", {
                  body: { conversation_id: newConv.id, org_id: orgId, message_text: text || "", exclude_supervisors: !!(config as any).exclude_supervisors },
                });
              } catch (_) {
                await logToSystem(supabase, "warn", "فشل التعيين التلقائي (Evolution)", { conversation_id: newConv?.id }, orgId);
              }
            }

            // Auto-register ALL group members on first group conversation
            if (newConv && conversationType === "group" && EVOLUTION_API_URL && EVOLUTION_API_KEY) {
              try {
                const membersRes = await fetch(
                  `${EVOLUTION_API_URL}/group/findGroupInfos/${instanceName}?groupJid=${remoteJid}`,
                  { headers: { apikey: EVOLUTION_API_KEY } }
                );
                if (membersRes.ok) {
                  const membersData = await membersRes.json();
                  const participants = membersData?.participants || membersData?.data?.participants || membersData?.[0]?.participants || [];
                  for (const p of participants) {
                    const rawParticipantId = p.id || p.jid || "";
                    const isLidParticipant = String(rawParticipantId).includes("@lid");
                    const memberPhone = [p.phone, p.number, p.senderPn, p.participantPn]
                      .map((value: unknown) => typeof value === "string" ? value.replace(/\D/g, "") : "")
                      .find(Boolean)
                      || (!isLidParticipant && String(rawParticipantId).includes("@s.whatsapp.net")
                        ? String(rawParticipantId).replace(/\D/g, "")
                        : "");
                    const memberName = chooseBestContactName(p.pushName, p.name, p.notify) || null;
                    if (memberPhone && memberPhone.length === 12) {
                      try {
                        await supabase.from("customers").upsert({
                          org_id: orgId,
                          phone: memberPhone,
                          name: memberName,
                          source: "whatsapp_group",
                        }, { onConflict: "org_id,phone", ignoreDuplicates: true });
                      } catch (_e) { /* ignore */ }
                    }
                  }
                  await logToSystem(supabase, "info", `تم تسجيل ${participants.length} عضو من القروب تلقائياً`, {
                    conversation_id: newConv.id, group_jid: remoteJid,
                  }, orgId);
                }
              } catch (e) {
                await logToSystem(supabase, "warn", "فشل تسجيل أعضاء القروب تلقائياً", {
                  error: e instanceof Error ? e.message : String(e), group_jid: remoteJid,
                }, orgId);
              }
            }
          }

        if (!conversation) continue;

        // Auto-save customer record (skip groups — save individual participants instead)
        try {
          if (conversationType === "group") {
            // For groups, save the actual sender (participant) as a customer, not the group JID
            const participantRaw = key.participant || "";
            const isLidParticipant = participantRaw.includes("@lid");
            // Use senderPn (real phone) for @lid participants, otherwise strip JID suffix
            // IMPORTANT: Never save @lid IDs as phone numbers — they are not real phones
            const senderPhone = (isLidParticipant && senderPn)
              ? senderPn.replace(/\D/g, "")
              : isLidParticipant
                ? "" // Skip — no real phone available for this LID participant
                : participantRaw.replace("@s.whatsapp.net", "");
            const senderPushName = msg.pushName || "";
            if (senderPhone && senderPhone.length === 12) {
              const { data: existingParticipant } = await supabase
                .from("customers")
                .select("id, name")
                .eq("org_id", orgId)
                .eq("phone", senderPhone)
                .maybeSingle();

              if (!existingParticipant) {
                await supabase.from("customers").insert({
                  org_id: orgId,
                  phone: senderPhone,
                  name: senderPushName || null,
                  source: "whatsapp_group",
                });
              } else if (senderPushName && (!existingParticipant.name || existingParticipant.name === senderPhone)) {
                await supabase.from("customers").update({ name: senderPushName }).eq("id", existingParticipant.id);
              }
            }
          } else {
            // Private conversations — save the contact as customer
            const contactDisplayName = chooseBestContactName(conversationDisplayName, resolvedIncomingName, msg.pushName) || "";
            const { data: existingCustomer } = await supabase
              .from("customers")
              .select("id, name")
              .eq("org_id", orgId)
              .eq("phone", phone)
              .maybeSingle();

            const phoneDigits = phone.replace(/\D/g, "");
            const isValidPhone = phoneDigits.length === 12;
            if (!existingCustomer && isValidPhone) {
              await supabase.from("customers").insert({
                org_id: orgId,
                phone: phone,
                name: contactDisplayName || null,
                source: "whatsapp",
              });
            } else if (contactDisplayName && (!existingCustomer.name || existingCustomer.name === phone)) {
              await supabase.from("customers").update({ name: contactDisplayName }).eq("id", existingCustomer.id);
            }

            // Link customer to conversation if not linked (private only)
            if (conversation) {
              const { data: convCheck } = await supabase.from("conversations").select("customer_id").eq("id", conversation.id).single();
              if (convCheck && !convCheck.customer_id) {
                const { data: cust } = await supabase.from("customers").select("id").eq("org_id", orgId).eq("phone", phone).maybeSingle();
                if (cust) {
                  await supabase.from("conversations").update({ customer_id: cust.id }).eq("id", conversation.id);
                }
              }
            }
          }

          if (conversation && conversationType === "private") {
            const safeIncomingName = chooseBestContactName(resolvedIncomingName, msg.pushName);
            const convUpdate: Record<string, any> = {};
            if (safeIncomingName) convUpdate.customer_name = safeIncomingName;

            // Update profile picture if missing
            const { data: convData } = await supabase.from("conversations").select("customer_profile_pic").eq("id", conversation.id).single();
            if (!convData?.customer_profile_pic && EVOLUTION_API_URL && EVOLUTION_API_KEY) {
              try {
                const picRes = await fetch(`${EVOLUTION_API_URL}/chat/fetchProfilePictureUrl/${instanceName}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
                  body: JSON.stringify({ number: `${phone}@s.whatsapp.net` }),
                });
                if (picRes.ok) {
                  const picData = await picRes.json();
                  const pic = picData?.profilePictureUrl || picData?.url || picData?.picture || picData?.data?.profilePictureUrl || null;
                  if (pic) convUpdate.customer_profile_pic = pic;
                }
              } catch {}
            }

            if (Object.keys(convUpdate).length > 0) {
              await supabase.from("conversations").update(convUpdate).eq("id", conversation.id);
            }
          }
        } catch (custErr) {
          // Non-critical — log and continue
        }

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

        const metadata: Record<string, unknown> = { ...extraMetadata };
        if (senderName) metadata.sender_name = senderName;
        if (conversationType === "group") {
          metadata.participant = participant;
          // Store senderPn (real phone) for @lid resolution
          if (senderPn) metadata.sender_pn = senderPn.replace(/\D/g, "");
          // Store mentioned JIDs for proper mention rendering
          const mentionedJid = contextInfo?.mentionedJid || [];
          if (Array.isArray(mentionedJid) && mentionedJid.length > 0) {
            metadata.mentioned = mentionedJid.map((jid: string) => jid.replace("@s.whatsapp.net", "").replace("@lid", ""));
          }
          // Auto-save group sender as customer with real phone
          if (participant && senderName) {
            const isLidPart = participant.includes("@lid");
            // Only save real phone numbers, never LID identifiers
            const realPhone = (isLidPart && senderPn)
              ? senderPn.replace(/\D/g, "")
              : isLidPart
                ? "" // Skip — no real phone for this LID
                : participant.replace("@s.whatsapp.net", "");
            if (realPhone && realPhone.length > 5) {
              try {
                await supabase.from("customers").upsert({
                  org_id: orgId,
                  phone: realPhone,
                  name: senderName,
                  source: "whatsapp_group",
                }, { onConflict: "org_id,phone", ignoreDuplicates: true });
              } catch (_e) { /* ignore upsert errors */ }
            }
          }
        }
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

        // ── Detect if our channel phone was mentioned in group ──
        if (conversationType === "group" && Array.isArray(metadata.mentioned) && (metadata.mentioned as string[]).length > 0) {
          const channelPhone = config.display_phone?.replace(/\D/g, "") || "";
          const mentionedList = metadata.mentioned as string[];
          const wasMentioned = channelPhone && mentionedList.some((m: string) => {
            const normalized = String(m).replace(/\D/g, "");
            return normalized === channelPhone || channelPhone.endsWith(normalized) || normalized.endsWith(channelPhone);
          });
          if (wasMentioned) {
            // Increment mention counter
            await supabase.rpc("increment_mention_count", { conv_id: conversation.id });
            // Create notification for assigned agent or all org agents
            const notifTargets: string[] = [];
            if (conversation.assigned_to_id) {
              notifTargets.push(conversation.assigned_to_id);
            } else {
              const { data: orgProfiles } = await supabase.from("profiles").select("id").eq("org_id", orgId).eq("is_active", true).limit(20);
              if (orgProfiles) notifTargets.push(...orgProfiles.map((p: any) => p.id));
            }
            for (const uid of notifTargets) {
              try {
                await supabase.from("notifications").insert({
                  org_id: orgId,
                  user_id: uid,
                  type: "mention",
                  title: `تم ذكرك في ${conversation.customer_name || "قروب"}`,
                  body: content.length > 100 ? content.slice(0, 100) + "..." : content,
                  reference_type: "conversation",
                  reference_id: conversation.id,
                });
              } catch (_e) { /* ignore */ }
            }
          }
        }

        await supabase
          .from("conversations")
          .update({
            last_message: content,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            channel_id: config.id, // Ensure channel_id is always set
          })
          .eq("id", conversation.id);

        // ── Out-of-hours check (per-channel first, then org fallback) ──
        if (messageType === "text") {
          let oohConfig: { enabled: boolean; message: string; work_start: string; work_end: string; work_days: number[] } | null = null;
          
          // Check channel-level OOH settings first
          if (config?.id) {
            const { data: chData } = await supabase.from("whatsapp_config").select("settings").eq("id", config.id).single();
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
            
            const isOutOfHours = !oohConfig.work_days.includes(dayOfWeek) || !(riyadhTime >= oohConfig.work_start && riyadhTime <= oohConfig.work_end);
            
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
                await sendBotMessage(supabase, orgId, conversation.id, phone, oohConfig.message, "evolution", logToSystem);
                await logToSystem(supabase, "info", "تم إرسال رسالة خارج الدوام (Evolution)", { conversation_id: conversation.id }, orgId);
              }
            }
          }
        }

        // ── Chatbot flow processing ──
        if (messageType === "text" && content) {
          const chatbotHandled = await processChatbotFlow(supabase, orgId, conversation.id, phone, content, "evolution", logToSystem, config.id);
          
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
              if (rule.channel_ids && rule.channel_ids.length > 0 && config.id) {
                if (!rule.channel_ids.includes(config.id)) return false;
              }
              return Array.isArray(rule.keywords) &&
                rule.keywords.some((kw: string) => kw?.trim() && normalizedContent.includes(kw.trim().toLowerCase()));
            });

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

            // ── AI Auto-Reply (only if no chatbot and no automation rule matched) ──
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
                  // Send the AI reply via Evolution
                  const sendResp = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
                    body: JSON.stringify({ number: phone, text: aiData.reply }),
                  });
                  if (sendResp.ok) {
                    await supabase.from("messages").insert({
                      conversation_id: conversation.id, sender: "agent", message_type: "text",
                      content: aiData.reply, status: "sent",
                      metadata: { ai_generated: true },
                    });
                    await supabase.from("conversations").update({
                      last_message: aiData.reply, last_message_at: new Date().toISOString(),
                    }).eq("id", conversation.id);
                    await logToSystem(supabase, "info", "رد AI تلقائي مرسل", {
                      conversation_id: conversation.id, reply_length: aiData.reply.length,
                    }, orgId);
                  }
                }
              } catch (aiErr) {
                await logToSystem(supabase, "warn", "فشل استدعاء AI auto-reply", {
                  error: (aiErr as Error).message,
                }, orgId);
              }
            }
          }
        }
      }
    }

    // ── Handle MESSAGES_UPDATE (status + edits + deletes) ──
    if (event === "MESSAGES_UPDATE" || event === "messages.update") {
      const updates = Array.isArray(body.data) ? body.data : [body.data];
      
      await logToSystem(supabase, "info", `معالجة تحديث حالات رسائل (${updates.length} تحديث)`, {
        event, updates_count: updates.length,
        sample: JSON.stringify(updates[0]).slice(0, 300),
      }, orgId);

      for (const upd of updates) {
        const waMessageId = upd?.key?.id || upd?.keyId || upd?.id || upd?.messageId;
        const newStatus = pickBestUpdatedStatus(upd);

        // ── Message edited by remote user ──
        if (upd?.update?.editedMessage || upd?.update?.message?.editedMessage) {
          const editedMsg = upd.update.editedMessage || upd.update.message.editedMessage;
          const editedText = editedMsg?.conversation || editedMsg?.extendedTextMessage?.text || editedMsg?.protocolMessage?.editedMessage?.conversation || "";
          if (waMessageId && editedText) {
            const { data: existingMsg } = await supabase
              .from("messages")
              .select("id, metadata")
              .eq("wa_message_id", waMessageId)
              .limit(1)
              .maybeSingle();
            if (existingMsg) {
              const meta = (existingMsg.metadata as Record<string, any>) || {};
              await supabase.from("messages").update({
                content: editedText,
                metadata: { ...meta, edited_at: new Date().toISOString(), original_content: meta.original_content || undefined },
              }).eq("id", existingMsg.id);
            }
          }
          continue;
        }

        // ── Message deleted (revoked) ──
        if (upd?.update?.messageStubType === 1 || upd?.update?.message?.protocolMessage?.type === 0 || String(newStatus) === "REVOKED") {
          if (waMessageId) {
            await supabase.from("messages").update({
              content: "تم حذف هذه الرسالة",
              metadata: { is_deleted: true, deleted_at: new Date().toISOString() },
            }).eq("wa_message_id", waMessageId);
          }
          continue;
        }

        if (!waMessageId || !newStatus) continue;

        const { data: existingMsg } = await supabase
          .from("messages")
          .select("id, status, metadata, conversation_id")
          .eq("wa_message_id", waMessageId)
          .limit(1)
          .maybeSingle();

        if (existingMsg) {
          const priority: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
          const meta = (existingMsg.metadata as Record<string, any>) || {};

          // Check if this message belongs to a group conversation
          const updParticipant = upd?.key?.participant || upd?.participant || "";
          const remoteJid = upd?.key?.remoteJid || "";
          const isGroupMsg = remoteJid.endsWith("@g.us");

          if (isGroupMsg && newStatus === "read" && updParticipant) {
            // Track individual readers for group messages
            const readBy: string[] = Array.isArray(meta.read_by) ? [...meta.read_by] : [];
            const readerPhone = updParticipant.replace("@s.whatsapp.net", "").replace("@lid", "");
            if (readerPhone && !readBy.includes(readerPhone)) {
              readBy.push(readerPhone);
            }

            // Fetch group participant count to determine if all read
            let totalParticipants = meta.group_size || 0;
            if (!totalParticipants && existingMsg.conversation_id) {
              const { data: conv } = await supabase
                .from("conversations")
                .select("customer_phone, channel_id")
                .eq("id", existingMsg.conversation_id)
                .maybeSingle();
              if (conv?.customer_phone && conv.customer_phone.includes("@g.us")) {
                // Try to get group size from Evolution API
                try {
                  const { data: chConfig } = await supabase
                    .from("whatsapp_config")
                    .select("evolution_instance_name")
                    .eq("id", conv.channel_id)
                    .maybeSingle();
                  if (chConfig?.evolution_instance_name) {
                    const EVOLUTION_URL = Deno.env.get("EVOLUTION_API_URL");
                    const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY");
                    if (EVOLUTION_URL && EVOLUTION_KEY) {
                      const gRes = await fetch(
                        `${EVOLUTION_URL}/group/findGroupInfos/${chConfig.evolution_instance_name}?groupJid=${conv.customer_phone}`,
                        { headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY } }
                      );
                      if (gRes.ok) {
                        const gData = await gRes.json();
                        const participants = gData?.participants || gData?.data?.participants || [];
                        totalParticipants = participants.length > 0 ? participants.length - 1 : 0; // exclude self
                      }
                    }
                  }
                } catch (_e) { /* ignore */ }
              }
            }

            const allRead = totalParticipants > 0 && readBy.length >= totalParticipants;
            const updateData: Record<string, any> = {
              metadata: { ...meta, read_by: readBy, group_size: totalParticipants || meta.group_size },
            };

            // Only set status to "read" when all participants have read
            if (allRead) {
              updateData.status = "read";
            } else if ((priority["delivered"] || 0) > (priority[existingMsg.status || ""] || 0)) {
              // At least mark as delivered if someone interacted
              updateData.status = "delivered";
            }

            await supabase.from("messages").update(updateData).eq("id", existingMsg.id);
          } else {
            // Private chats: direct status upgrade
            if ((priority[newStatus] || 0) > (priority[existingMsg.status || ""] || 0)) {
              await supabase.from("messages").update({ status: newStatus }).eq("id", existingMsg.id);
            }
          }
        }
      }
    }

    // ── Handle MESSAGES_EDITED (customer edited their message) ──
    if (event === "MESSAGES_EDITED" || event === "messages.edited") {
      const editData = body.data || body;
      const editKey = editData?.key || {};
      const waMessageId = editKey?.id || editData?.messageId;
      const editedContent =
        editData?.editedMessage?.conversation ||
        editData?.editedMessage?.extendedTextMessage?.text ||
        editData?.message?.conversation ||
        editData?.message?.extendedTextMessage?.text ||
        editData?.newBody ||
        editData?.editedMessage ||
        "";

      const editedText = typeof editedContent === "string" ? editedContent : JSON.stringify(editedContent);

      if (waMessageId && editedText) {
        const { data: existingMsg } = await supabase
          .from("messages")
          .select("id, content, metadata")
          .eq("wa_message_id", waMessageId)
          .limit(1)
          .maybeSingle();

        if (existingMsg) {
          const meta = (existingMsg.metadata as Record<string, any>) || {};
          await supabase.from("messages").update({
            content: editedText,
            metadata: {
              ...meta,
              edited: true,
              edited_at: new Date().toISOString(),
              original_content: meta.original_content || existingMsg.content,
            },
          }).eq("id", existingMsg.id);

          await logToSystem(supabase, "info", `رسالة معدلة من العميل`, {
            wa_message_id: waMessageId, new_text: editedText.slice(0, 100),
          }, orgId);
        } else {
          await logToSystem(supabase, "warn", `رسالة معدلة لم يتم العثور عليها`, {
            wa_message_id: waMessageId,
          }, orgId);
        }
      }
    }

    // ── Handle MESSAGES_DELETE (customer deleted a message) ──
    if (event === "MESSAGES_DELETE" || event === "messages.delete") {
      const deleteData = body.data || body;
      // Evolution v2.3.7 sends: { key: { remoteJid, fromMe, id }, ... } or array
      const deleteItems = Array.isArray(deleteData) ? deleteData : [deleteData];

      for (const item of deleteItems) {
        const waMessageId = item?.key?.id || item?.id || item?.messageId || item?.keyId;
        if (!waMessageId) continue;

        const { data: existingMsg } = await supabase
          .from("messages")
          .select("id")
          .eq("wa_message_id", waMessageId)
          .limit(1)
          .maybeSingle();

        if (existingMsg) {
          await supabase.from("messages").update({
            content: "تم حذف هذه الرسالة",
            metadata: { is_deleted: true, deleted_at: new Date().toISOString() },
          }).eq("id", existingMsg.id);

          await logToSystem(supabase, "info", `رسالة محذوفة من العميل`, {
            wa_message_id: waMessageId,
          }, orgId);
        }
      }
    }

    // ── Handle Reactions (v2.3.7: reactions come inside MESSAGES_UPSERT, no separate event) ──
    if (event === "MESSAGES_REACTION" || event === "messages.reaction") {
      const reactionData = body.data || body;
      const reactionKey = reactionData?.key || {};
      const waMessageId = reactionKey?.id || reactionData?.messageId;
      const reaction = reactionData?.reaction || reactionData;
      const emoji = reaction?.text || reaction?.emoji || "";
      const fromMe = !!reactionKey?.fromMe;

      if (waMessageId) {
        const { data: existingMsg } = await supabase
          .from("messages")
          .select("id, metadata")
          .eq("wa_message_id", waMessageId)
          .limit(1)
          .maybeSingle();

        if (existingMsg) {
          const meta = (existingMsg.metadata as Record<string, any>) || {};
          let reactions: Array<{ emoji: string; fromMe: boolean; timestamp?: string }> = meta.reactions || [];

          if (emoji) {
            const existingIdx = reactions.findIndex(r => r.fromMe === fromMe);
            if (existingIdx >= 0) {
              reactions[existingIdx] = { emoji, fromMe, timestamp: new Date().toISOString() };
            } else {
              reactions.push({ emoji, fromMe, timestamp: new Date().toISOString() });
            }
          } else {
            reactions = reactions.filter(r => r.fromMe !== fromMe);
          }

          await supabase.from("messages").update({
            metadata: { ...meta, reactions },
          }).eq("id", existingMsg.id);
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

  if (!["audio", "image", "video", "document", "sticker"].includes(messageType)) {
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
        ...(messageType === "video" ? { convertToMp4: true } : {}),
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

    const rawMimeType = media?.mimetype || media?.mimeType || media?.data?.mimetype || media?.data?.mimeType ||
      (messageType === "audio" ? "audio/ogg" : messageType === "image" ? "image/jpeg" : messageType === "video" ? "video/mp4" : "application/octet-stream");
    const mimeType = String(rawMimeType).split(";")[0].trim().toLowerCase();
    const extension = messageType === "audio"
      ? mimeType.includes("ogg") || mimeType.includes("opus")
        ? "ogg"
        : mimeType.includes("webm")
          ? "webm"
          : mimeType.includes("mpeg")
            ? "mp3"
            : mimeType.includes("mp4")
              ? "mp4"
              : "bin"
      : mimeType.split("/")[1]?.split(";")[0] || "bin";
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
