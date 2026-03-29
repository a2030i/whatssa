import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    console.log("Evolution webhook event:", JSON.stringify(body).slice(0, 500));

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
      console.log(`No config found for instance: ${instanceName}`);
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

      console.log(`Instance ${instanceName} status updated to: ${newStatus}`);
    }

    // Handle QRCODE_UPDATED
    if (event === "QRCODE_UPDATED" || event === "qrcode.updated") {
      // QR code is handled client-side via polling, just log
      console.log(`QR code updated for instance: ${instanceName}`);
    }

    // Handle MESSAGES_UPSERT (incoming messages)
    if (event === "MESSAGES_UPSERT" || event === "messages.upsert") {
      const messages = body.data || [];
      const messageList = Array.isArray(messages) ? messages : [messages];

      for (const msg of messageList) {
        const key = msg.key || {};
        const messageContent = msg.message || {};

        // Skip outgoing messages (fromMe)
        if (key.fromMe) continue;

      const remoteJid = key.remoteJid || "";
        // Determine conversation type from JID
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

        // Get message text
        const text =
          messageContent.conversation ||
          messageContent.extendedTextMessage?.text ||
          messageContent.imageMessage?.caption ||
          messageContent.videoMessage?.caption ||
          messageContent.documentMessage?.caption ||
          "";

        // Determine message type
        let messageType = "text";
        let mediaUrl = null;

        if (messageContent.imageMessage) {
          messageType = "image";
        } else if (messageContent.videoMessage) {
          messageType = "video";
        } else if (messageContent.audioMessage) {
          messageType = "audio";
        } else if (messageContent.documentMessage) {
          messageType = "document";
        }

        if (!text && messageType === "text") continue; // Skip empty text messages

        // Find or create conversation
        let { data: conversation } = await supabase
          .from("conversations")
          .select("id")
          .eq("customer_phone", phone)
          .eq("org_id", config.org_id)
          .eq("conversation_type", conversationType)
          .neq("status", "closed")
          .limit(1)
          .maybeSingle();

        if (!conversation) {
          let convName = msg.pushName || phone;

          // For groups, fetch the group name from Evolution API
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
              console.log("Failed to fetch group info:", e);
              convName = `قروب ${phone}`;
            }
          } else if (conversationType === "group") {
            convName = `قروب ${phone}`;
          }

          const { data: newConv } = await supabase
            .from("conversations")
            .insert({
              customer_phone: phone,
              customer_name: pushName,
              org_id: config.org_id,
              status: "active",
              conversation_type: conversationType,
              last_message: text || `[${messageType}]`,
              last_message_at: new Date().toISOString(),
            })
            .select("id")
            .single();

          conversation = newConv;
        }

        if (!conversation) continue;

        // Insert message
        const content = text || `[${messageType}]`;
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          content,
          sender: "customer",
          message_type: messageType,
          media_url: mediaUrl,
          wa_message_id: key.id || null,
          status: "received",
        });

        // Update conversation
        await supabase.rpc('increment_unread', { conv_id: conversation.id }).catch(() => {
          // Fallback if RPC doesn't exist
          supabase
            .from("conversations")
            .update({
              last_message: content,
              last_message_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", conversation.id);
        });

        await supabase
          .from("conversations")
          .update({
            last_message: content,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversation.id);

        console.log(`Message saved from ${phone} in conversation ${conversation.id}`);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Evolution webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
