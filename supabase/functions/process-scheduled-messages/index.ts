import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Get pending scheduled messages that are due
    const { data: messages, error } = await supabase
      .from("scheduled_messages")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .limit(50);

    if (error) throw error;
    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;

    for (const msg of messages) {
      try {
        // Get WhatsApp config for the org
        const { data: config } = await supabase
          .from("whatsapp_config")
          .select("*")
          .eq("org_id", msg.org_id)
          .eq("is_connected", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!config) {
          await supabase.from("scheduled_messages").update({
            status: "failed",
            error_message: "واتساب غير مربوط",
            updated_at: new Date().toISOString(),
          }).eq("id", msg.id);
          continue;
        }

        let messagePayload: Record<string, unknown> = {
          messaging_product: "whatsapp",
          to: msg.to_phone,
        };

        if (msg.message_type === "template") {
          messagePayload = {
            ...messagePayload,
            type: "template",
            template: {
              name: msg.template_name,
              language: { code: msg.template_language || "ar" },
              components: msg.template_components || [],
            },
          };
        } else {
          messagePayload = {
            ...messagePayload,
            type: "text",
            text: { body: msg.content },
          };
        }

        // Check channel type
        if (config.channel_type === "evolution") {
          const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
          const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
          
          if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
            throw new Error("Evolution API not configured");
          }

          const evoRes = await fetch(`${EVOLUTION_API_URL}/message/sendText/${config.evolution_instance_name}`, {
            method: "POST",
            headers: {
              apikey: EVOLUTION_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              number: msg.to_phone,
              text: msg.content,
            }),
          });

          if (!evoRes.ok) throw new Error("Evolution send failed");
        } else {
          // Meta API
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

          if (!response.ok) {
            const result = await response.json();
            throw new Error(result?.error?.message || "Failed to send");
          }
        }

        // Update conversation if exists
        if (msg.conversation_id) {
          const content = msg.message_type === "template" 
            ? `[قالب مجدول: ${msg.template_name}]` 
            : msg.content;

          await supabase.from("messages").insert({
            conversation_id: msg.conversation_id,
            sender: "agent",
            message_type: msg.message_type === "template" ? "template" : "text",
            content,
            status: "sent",
          });

          await supabase.from("conversations").update({
            last_message: content,
            last_message_at: new Date().toISOString(),
          }).eq("id", msg.conversation_id);
        }

        await supabase.from("scheduled_messages").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", msg.id);

        processed++;
      } catch (err) {
        const errMsg = err instanceof Error ? (err as Error).message : String(err);
        await supabase.from("scheduled_messages").update({
          status: "failed",
          error_message: errMsg,
          updated_at: new Date().toISOString(),
        }).eq("id", msg.id);
      }
    }

    return new Response(JSON.stringify({ processed, total: messages.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Process scheduled messages error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
