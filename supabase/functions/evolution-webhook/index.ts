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
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
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

    const instanceName = body.instance || body.instanceName || "";

    // Find the config for this instance
    const { data: config } = await supabase
      .from("whatsapp_config")
      .select("id, org_id, default_team_id, default_agent_id")
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
          // Poll vote update — skip for now, handled separately
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

        const resolvedIncomingName = conversationType === "private"
          ? await fetchEvolutionContactName(instanceName, phone)
          : null;
        let conversationDisplayName = chooseBestContactName(resolvedIncomingName, msg.pushName) || phone;

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
                  body: { conversation_id: newConv.id, org_id: orgId, message_text: text || "" },
                });
              } catch (_) {
                await logToSystem(supabase, "warn", "فشل التعيين التلقائي (Evolution)", { conversation_id: newConv?.id }, orgId);
              }
            }
          }

        if (!conversation) continue;

        // Auto-save customer record
        try {
          const contactDisplayName = chooseBestContactName(conversationDisplayName, resolvedIncomingName, msg.pushName) || "";
          const { data: existingCustomer } = await supabase
            .from("customers")
            .select("id, name")
            .eq("org_id", orgId)
            .eq("phone", phone)
            .maybeSingle();

          if (!existingCustomer) {
            await supabase.from("customers").insert({
              org_id: orgId,
              phone: phone,
              name: contactDisplayName || null,
              source: "whatsapp",
            });
          } else if (contactDisplayName && (!existingCustomer.name || existingCustomer.name === phone)) {
            await supabase.from("customers").update({ name: contactDisplayName }).eq("id", existingCustomer.id);
          }

          // Link customer to conversation if not linked
          if (conversation) {
            const { data: convCheck } = await supabase.from("conversations").select("customer_id").eq("id", conversation.id).single();
            if (convCheck && !convCheck.customer_id) {
              const { data: cust } = await supabase.from("customers").select("id").eq("org_id", orgId).eq("phone", phone).maybeSingle();
              if (cust) {
                await supabase.from("conversations").update({ customer_id: cust.id }).eq("id", conversation.id);
              }
            }
          }

          if (conversation && conversationType === "private") {
            const safeIncomingName = chooseBestContactName(resolvedIncomingName, msg.pushName);
            if (safeIncomingName) {
              await supabase.from("conversations").update({ customer_name: safeIncomingName }).eq("id", conversation.id);
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
          }
        }
      }
    }

    // ── Handle MESSAGES_UPDATE (status + edits + deletes) ──
    if (event === "MESSAGES_UPDATE" || event === "messages.update") {
      const updates = Array.isArray(body.data) ? body.data : [body.data];
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
          .select("id, status")
          .eq("wa_message_id", waMessageId)
          .limit(1)
          .maybeSingle();

        if (existingMsg) {
          // Only upgrade status (sent→delivered→read), never downgrade
          const priority: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
          if ((priority[newStatus] || 0) > (priority[existingMsg.status || ""] || 0)) {
            await supabase.from("messages").update({ status: newStatus }).eq("id", existingMsg.id);
          }
        }
      }
    }

    // ── Handle Reactions (v2.3.7: reactions come inside MESSAGES_UPSERT, no separate event) ──
    if (event === "MESSAGES_REACTION" || event === "messages.reaction" || event === "MESSAGES_EDITED") {
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
            // Add or update reaction
            const existingIdx = reactions.findIndex(r => r.fromMe === fromMe);
            if (existingIdx >= 0) {
              reactions[existingIdx] = { emoji, fromMe, timestamp: new Date().toISOString() };
            } else {
              reactions.push({ emoji, fromMe, timestamp: new Date().toISOString() });
            }
          } else {
            // Empty emoji = remove reaction
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
