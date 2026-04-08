import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_CONCURRENT_CAMPAIGNS = 3;

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

async function processChunk(
  supabase: any,
  chunk: any,
  campaign: any,
  config: any,
  isEvolution: boolean,
  rateSettings: RateLimitSettings | null,
) {
  const templateVars = (campaign.template_variables as any[]) || [];

  // Fetch recipients for this chunk
  const { data: recipients } = await supabase
    .from("campaign_recipients")
    .select("*")
    .in("id", chunk.recipient_ids)
    .eq("status", "pending");

  if (!recipients || recipients.length === 0) {
    await supabase.from("campaign_queue").update({
      status: "done",
      completed_at: new Date().toISOString(),
    }).eq("id", chunk.id);
    return { sent: 0, failed: 0, paused: false };
  }

  let sentCount = 0;
  let failedCount = 0;
  let batchCounter = 0;
  let rateLimitPaused = false;

  for (const recipient of recipients) {
    // Per-message rate limit check for Evolution
    if (isEvolution && rateSettings?.enabled) {
      const { data: midCheck } = await supabase.rpc("check_channel_rate_limit", { _channel_id: config.id });
      if (midCheck && !midCheck.allowed) {
        rateLimitPaused = true;
        console.log(`[process-queue] Rate limit hit: ${midCheck.reason}`);
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

        // Log for rate tracking
        await supabase.from("channel_send_log").insert({
          channel_id: config.id,
          org_id: campaign.org_id,
          message_type: "campaign",
          recipient_phone: recipient.phone,
        });
      } else {
        // Meta API
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
            payload.template.components.push({ type: "body", parameters: bodyParams });
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
        if (!res.ok) throw new Error(result?.error?.message || `HTTP ${res.status}`);
        waMessageId = result.messages?.[0]?.id || null;
      }

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

    // Smart delay
    if (isEvolution && rateSettings?.enabled) {
      if (batchCounter >= rateSettings.batch_size) {
        batchCounter = 0;
        await new Promise((r) => setTimeout(r, rateSettings.batch_pause_seconds * 1000));
      } else {
        await new Promise((r) => setTimeout(r, randomDelay(rateSettings.min_delay_seconds, rateSettings.max_delay_seconds)));
      }
    } else if (isEvolution) {
      await new Promise((r) => setTimeout(r, 10000));
    } else {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  // Update chunk status
  await supabase.from("campaign_queue").update({
    status: rateLimitPaused ? "pending" : "done",
    sent_count: sentCount,
    failed_count: failedCount,
    completed_at: rateLimitPaused ? null : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", chunk.id);

  return { sent: sentCount, failed: failedCount, paused: rateLimitPaused };
}

async function updateCampaignStats(supabase: any, campaignId: string) {
  const { data: allRecipients } = await supabase
    .from("campaign_recipients")
    .select("status")
    .eq("campaign_id", campaignId);

  const { count: pendingChunks } = await supabase
    .from("campaign_queue")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "processing"]);

  if (!allRecipients) return;

  const sent = allRecipients.filter((r: any) => ["sent", "delivered", "read"].includes(r.status)).length;
  const delivered = allRecipients.filter((r: any) => ["delivered", "read"].includes(r.status)).length;
  const read = allRecipients.filter((r: any) => r.status === "read").length;
  const failed = allRecipients.filter((r: any) => r.status === "failed").length;
  const isComplete = (pendingChunks || 0) === 0;

  await supabase.from("campaigns").update({
    sent_count: sent,
    delivered_count: delivered,
    read_count: read,
    failed_count: failed,
    status: isComplete ? "sent" : "sending",
    completed_at: isComplete ? new Date().toISOString() : null,
    notes: isComplete ? null : `📤 جاري الإرسال... (${sent}/${allRecipients.length})`,
    updated_at: new Date().toISOString(),
  }).eq("id", campaignId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Check how many campaigns are currently being processed
    const { count: activeCampaigns } = await supabase
      .from("campaign_queue")
      .select("campaign_id", { count: "exact", head: true })
      .eq("status", "processing");

    // Get next pending chunks, respecting concurrency limit
    const availableSlots = MAX_CONCURRENT_CAMPAIGNS - (activeCampaigns || 0);

    if (availableSlots <= 0) {
      return new Response(JSON.stringify({ ok: true, message: "Max concurrent campaigns reached", active: activeCampaigns }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get one pending chunk per campaign, ordered by creation time
    const { data: pendingChunks } = await supabase
      .from("campaign_queue")
      .select("*, campaigns!inner(*, org_id)")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(availableSlots);

    if (!pendingChunks || pendingChunks.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduplicate by campaign_id (process one chunk per campaign per run)
    const seenCampaigns = new Set<string>();
    const chunksToProcess = pendingChunks.filter((c: any) => {
      if (seenCampaigns.has(c.campaign_id)) return false;
      seenCampaigns.add(c.campaign_id);
      return true;
    });

    let totalSent = 0;
    let totalFailed = 0;

    for (const chunk of chunksToProcess) {
      const campaign = chunk.campaigns;

      // Mark chunk as processing
      await supabase.from("campaign_queue").update({
        status: "processing",
        started_at: new Date().toISOString(),
      }).eq("id", chunk.id);

      // Update campaign status to sending
      await supabase.from("campaigns").update({ status: "sending" }).eq("id", chunk.campaign_id);

      // Get WhatsApp config
      const templateVars = (campaign.template_variables as any[]) || [];
      const isEvolution = templateVars[0]?.channel_type === "evolution";
      const channelId = templateVars[0]?.channel_id || null;

      let configQuery = supabase
        .from("whatsapp_config")
        .select("*")
        .eq("org_id", campaign.org_id)
        .eq("is_connected", true)
        .eq("channel_type", isEvolution ? "evolution" : "meta_api");

      if (channelId) configQuery = configQuery.eq("id", channelId);

      const { data: config } = await configQuery.limit(1).maybeSingle();

      if (!config) {
        await supabase.from("campaign_queue").update({
          status: "failed",
          error_message: "No WhatsApp channel connected",
          completed_at: new Date().toISOString(),
        }).eq("id", chunk.id);
        continue;
      }

      const rateSettings = isEvolution ? parseRateLimitSettings(config.rate_limit_settings) : null;

      // Rate limit pre-check for Evolution
      if (isEvolution && rateSettings?.enabled) {
        const { data: limitCheck } = await supabase.rpc("check_channel_rate_limit", { _channel_id: config.id });
        if (limitCheck && !limitCheck.allowed) {
          await supabase.from("campaign_queue").update({
            status: "pending",
            started_at: null,
          }).eq("id", chunk.id);

          await supabase.from("campaigns").update({
            status: "paused",
            notes: `⏸️ إيقاف مؤقت: حدود الإرسال. سيُستأنف تلقائياً.`,
            updated_at: new Date().toISOString(),
          }).eq("id", chunk.campaign_id);
          continue;
        }
      }

      const result = await processChunk(supabase, chunk, campaign, config, isEvolution, rateSettings);
      totalSent += result.sent;
      totalFailed += result.failed;

      // Update campaign stats
      await updateCampaignStats(supabase, chunk.campaign_id);
    }

    console.log(`[process-queue] Processed ${chunksToProcess.length} chunks: ${totalSent} sent, ${totalFailed} failed`);

    return new Response(JSON.stringify({
      ok: true,
      processed: chunksToProcess.length,
      sent: totalSent,
      failed: totalFailed,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("process-campaign-queue error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
