import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Rate Limit Helpers ──
interface RateLimitSettings {
  enabled: boolean;
  min_delay_seconds: number;
  max_delay_seconds: number;
  batch_size: number;
  batch_pause_seconds: number;
  daily_limit: number;
  hourly_limit: number;
}

const DEFAULT_RATE_LIMIT: RateLimitSettings = {
  enabled: true,
  min_delay_seconds: 8,
  max_delay_seconds: 15,
  batch_size: 10,
  batch_pause_seconds: 30,
  daily_limit: 200,
  hourly_limit: 50,
};

function parseRateLimitSettings(raw: any): RateLimitSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_RATE_LIMIT;
  return {
    enabled: raw.enabled !== false,
    min_delay_seconds: Math.max(1, Number(raw.min_delay_seconds) || DEFAULT_RATE_LIMIT.min_delay_seconds),
    max_delay_seconds: Math.max(1, Number(raw.max_delay_seconds) || DEFAULT_RATE_LIMIT.max_delay_seconds),
    batch_size: Math.max(1, Number(raw.batch_size) || DEFAULT_RATE_LIMIT.batch_size),
    batch_pause_seconds: Math.max(5, Number(raw.batch_pause_seconds) || DEFAULT_RATE_LIMIT.batch_pause_seconds),
    daily_limit: Math.max(1, Number(raw.daily_limit) || DEFAULT_RATE_LIMIT.daily_limit),
    hourly_limit: Math.max(1, Number(raw.hourly_limit) || DEFAULT_RATE_LIMIT.hourly_limit),
  };
}

function randomDelay(min: number, max: number): number {
  return (Math.floor(Math.random() * (max - min + 1)) + min) * 1000;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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

    // ── Rate limit check for Evolution channels ──
    const rateSettings = isEvolution ? parseRateLimitSettings(config.rate_limit_settings) : null;

    if (isEvolution && rateSettings?.enabled) {
      const { data: limitCheck } = await supabase.rpc("check_channel_rate_limit", { _channel_id: config.id });
      if (limitCheck && !limitCheck.allowed) {
        const reason = limitCheck.reason === "hourly_limit_reached"
          ? `تم الوصول للحد الأقصى بالساعة (${limitCheck.hourly_count}/${limitCheck.hourly_limit})`
          : `تم الوصول للحد الأقصى اليومي (${limitCheck.daily_count}/${limitCheck.daily_limit})`;

        await supabase.from("campaigns").update({
          status: "paused",
          notes: `⏸️ إيقاف مؤقت: ${reason}. سيُستأنف الإرسال تلقائياً عند انتهاء الفترة.`,
          updated_at: new Date().toISOString(),
        }).eq("id", campaign_id);

        return new Response(JSON.stringify({ error: reason, paused: true }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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
    let batchCounter = 0;
    let rateLimitPaused = false;

    for (const recipient of recipients) {
      // ── Per-message rate limit check for Evolution ──
      if (isEvolution && rateSettings?.enabled) {
        const { data: midCheck } = await supabase.rpc("check_channel_rate_limit", { _channel_id: config.id });
        if (midCheck && !midCheck.allowed) {
          rateLimitPaused = true;
          console.log(`[send-campaign] Rate limit hit mid-campaign: ${midCheck.reason}`);
          break;
        }
      }

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

          // Log send for rate tracking
          await supabase.from("channel_send_log").insert({
            channel_id: config.id,
            org_id: campaign.org_id,
            message_type: "campaign",
            recipient_phone: recipient.phone,
          });
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

          if (templateVars.length > 0 && !templateVars[0]?.channel_type) {
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
        batchCounter++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await supabase.from("campaign_recipients").update({
          status: "failed",
          failed_at: new Date().toISOString(),
          error_message: errMsg,
        }).eq("id", recipient.id);
        failedCount++;
        batchCounter++;
      }

      // ── Smart delay logic ──
      if (isEvolution && rateSettings?.enabled) {
        // Batch pause: after N messages, take a longer break
        if (batchCounter >= rateSettings.batch_size) {
          batchCounter = 0;
          const pauseMs = rateSettings.batch_pause_seconds * 1000;
          console.log(`[send-campaign] Batch pause: ${rateSettings.batch_pause_seconds}s after ${rateSettings.batch_size} messages`);
          await new Promise((r) => setTimeout(r, pauseMs));
        } else {
          // Randomized delay between messages
          const delayMs = randomDelay(rateSettings.min_delay_seconds, rateSettings.max_delay_seconds);
          await new Promise((r) => setTimeout(r, delayMs));
        }
      } else if (isEvolution) {
        // Fallback: fixed 10s delay
        await new Promise((r) => setTimeout(r, 10000));
      } else {
        // Meta API: minimal delay
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    // ── Update campaign status ──
    const { count: pendingCount } = await supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id)
      .eq("status", "pending");

    const isComplete = (pendingCount || 0) === 0 && !rateLimitPaused;

    const { data: allRecipients } = await supabase
      .from("campaign_recipients")
      .select("status")
      .eq("campaign_id", campaign_id);

    if (allRecipients) {
      const sent = allRecipients.filter((r: any) => ["sent", "delivered", "read"].includes(r.status)).length;
      const delivered = allRecipients.filter((r: any) => ["delivered", "read"].includes(r.status)).length;
      const read = allRecipients.filter((r: any) => r.status === "read").length;
      const failed = allRecipients.filter((r: any) => r.status === "failed").length;

      const newStatus = rateLimitPaused ? "paused" : isComplete ? "sent" : "sending";

      await supabase.from("campaigns").update({
        sent_count: sent,
        delivered_count: delivered,
        read_count: read,
        failed_count: failed,
        status: newStatus,
        notes: rateLimitPaused ? "⏸️ إيقاف مؤقت بسبب حدود الإرسال (حماية من الحظر). سيُستأنف تلقائياً." : null,
        completed_at: isComplete ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", campaign_id);
    }

    return new Response(JSON.stringify({
      ok: true,
      sent: sentCount,
      failed: failedCount,
      complete: isComplete,
      paused: rateLimitPaused,
    }), {
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
