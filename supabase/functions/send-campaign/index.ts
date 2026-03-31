import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { campaign_id } = await req.json();

    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get campaign
    const { data: campaign, error: campErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();

    if (campErr || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as sending
    await supabase.from("campaigns").update({ status: "sending", sent_at: new Date().toISOString() }).eq("id", campaign_id);

    // Get WhatsApp config
    const templateVars = (campaign.template_variables as any[]) || [];
    const isEvolution = templateVars[0]?.channel_type === "evolution";
    const channelId = templateVars[0]?.channel_id || null;

    let config: any = null;
    if (isEvolution) {
      const q = supabase.from("whatsapp_config").select("*").eq("org_id", campaign.org_id).eq("is_connected", true).eq("channel_type", "evolution");
      if (channelId) q.eq("id", channelId);
      const { data } = await q.limit(1).maybeSingle();
      config = data;
    } else {
      const q = supabase.from("whatsapp_config").select("*").eq("org_id", campaign.org_id).eq("is_connected", true).eq("channel_type", "meta_api");
      if (channelId) q.eq("id", channelId);
      const { data } = await q.order("created_at", { ascending: true }).limit(1).maybeSingle();
      config = data;
    }

    if (!config) {
      await supabase.from("campaigns").update({ status: "failed" }).eq("id", campaign_id);
      return new Response(JSON.stringify({ error: "No WhatsApp channel connected" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get recipients
    const { data: recipients } = await supabase
      .from("campaign_recipients")
      .select("*")
      .eq("campaign_id", campaign_id)
      .eq("status", "pending")
      .limit(1000);

    if (!recipients || recipients.length === 0) {
      await supabase.from("campaigns").update({ status: "sent", completed_at: new Date().toISOString() }).eq("id", campaign_id);
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sentCount = 0;
    let failedCount = 0;
    const delayMs = isEvolution ? ((templateVars[0]?.delay_seconds || 10) * 1000) : 100;

    for (const recipient of recipients) {
      try {
        let waMessageId: string | null = null;

        if (isEvolution) {
          const evoUrl = Deno.env.get("EVOLUTION_API_URL");
          const evoKey = Deno.env.get("EVOLUTION_API_KEY");
          if (!evoUrl || !evoKey) throw new Error("Evolution not configured");

          const messageText = templateVars[0]?.message_text || "";
          const res = await fetch(`${evoUrl}/message/sendText/${config.evolution_instance_name}`, {
            method: "POST",
            headers: { apikey: evoKey, "Content-Type": "application/json" },
            body: JSON.stringify({ number: recipient.phone, text: messageText }),
          });

          if (!res.ok) throw new Error(`Evolution error: ${res.status}`);
          const result = await res.json();
          waMessageId = result?.key?.id || null;
        } else {
          // Meta API - Template message
          const payload: any = {
            messaging_product: "whatsapp",
            to: recipient.phone,
            type: "template",
            template: {
              name: campaign.template_name,
              language: { code: campaign.template_language || "ar" },
              components: [],
            },
          };

          // Build components from template_variables if present
          if (templateVars.length > 0 && !templateVars[0]?.channel_type) {
            // Template variables are parameter mappings
            const bodyParams = templateVars
              .filter((v: any) => v.type === "body" || !v.type)
              .map((v: any) => {
                const value = v.column && recipient.variables
                  ? (recipient.variables as any)[v.column] || v.value || ""
                  : v.value || "";
                return { type: "text", text: value || recipient.customer_name || recipient.phone };
              });

            if (bodyParams.length > 0) {
              payload.template.components.push({
                type: "body",
                parameters: bodyParams,
              });
            }
          }

          const res = await fetch(`https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${config.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          const result = await res.json();
          if (!res.ok) {
            throw new Error(result?.error?.message || `HTTP ${res.status}`);
          }
          waMessageId = result.messages?.[0]?.id || null;
        }

        // Update recipient as sent
        await supabase.from("campaign_recipients").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          wa_message_id: waMessageId,
        }).eq("id", recipient.id);

        sentCount++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await supabase.from("campaign_recipients").update({
          status: "failed",
          failed_at: new Date().toISOString(),
          error_message: errMsg,
        }).eq("id", recipient.id);
        failedCount++;
      }

      // Delay between messages
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    // Check if all recipients processed
    const { count: pendingCount } = await supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id)
      .eq("status", "pending");

    const isComplete = (pendingCount || 0) === 0;

    // Update campaign aggregate counts
    const { data: allRecipients } = await supabase
      .from("campaign_recipients")
      .select("status")
      .eq("campaign_id", campaign_id);

    if (allRecipients) {
      const sent = allRecipients.filter((r: any) => ["sent", "delivered", "read"].includes(r.status)).length;
      const delivered = allRecipients.filter((r: any) => ["delivered", "read"].includes(r.status)).length;
      const read = allRecipients.filter((r: any) => r.status === "read").length;
      const failed = allRecipients.filter((r: any) => r.status === "failed").length;

      await supabase.from("campaigns").update({
        sent_count: sent,
        delivered_count: delivered,
        read_count: read,
        failed_count: failed,
        status: isComplete ? "sent" : "sending",
        completed_at: isComplete ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", campaign_id);
    }

    return new Response(JSON.stringify({ ok: true, sent: sentCount, failed: failedCount, complete: isComplete }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-campaign error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
