import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const EVOLUTION_URL = Deno.env.get("EVOLUTION_API_URL");
  const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY");

  try {
    // Fetch pending retries where next_retry_at <= now
    const { data: pendingMessages, error } = await supabase
      .from("message_retry_queue")
      .select("*")
      .eq("status", "pending")
      .lte("next_retry_at", new Date().toISOString())
      .order("next_retry_at")
      .limit(20);

    if (error || !pendingMessages?.length) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let successCount = 0;
    let failCount = 0;

    for (const msg of pendingMessages) {
      // === IDEMPOTENCY LOCK ===
      // Atomically claim this message by setting status to 'processing'.
      // If another worker already claimed it, the update returns 0 rows.
      const { data: claimed } = await supabase
        .from("message_retry_queue")
        .update({ status: "processing", last_attempted_at: new Date().toISOString() })
        .eq("id", msg.id)
        .eq("status", "pending") // only claim if still pending
        .select("id")
        .maybeSingle();

      if (!claimed) {
        // Another worker already processing this message — skip
        continue;
      }

      try {
        let success = false;
        let lastError = "";

        if (msg.channel_type === "evolution") {
          if (!EVOLUTION_URL || !EVOLUTION_KEY) {
            lastError = "Evolution API not configured";
          } else {
            const { data: config } = await supabase
              .from("whatsapp_config")
              .select("evolution_instance_name")
              .eq("org_id", msg.org_id)
              .eq("channel_type", "evolution")
              .eq("is_connected", true)
              .limit(1)
              .maybeSingle();

            if (!config) {
              lastError = "No connected Evolution instance";
            } else {
              const endpoint =
                msg.message_type === "text"
                  ? `${EVOLUTION_URL}/message/sendText/${config.evolution_instance_name}`
                  : `${EVOLUTION_URL}/message/sendMedia/${config.evolution_instance_name}`;

              const body =
                msg.message_type === "text"
                  ? { number: msg.to_phone, text: msg.content }
                  : { number: msg.to_phone, mediatype: msg.message_type, media: msg.media_url, caption: msg.content };

              const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
                body: JSON.stringify(body),
              });

              if (res.ok) {
                success = true;
              } else {
                const result = await res.json();
                lastError = result?.message || `HTTP ${res.status}`;
              }
            }
          }
        } else {
          // Meta API
          const { data: config } = await supabase
            .from("whatsapp_config")
            .select("phone_number_id, access_token")
            .eq("org_id", msg.org_id)
            .eq("channel_type", "meta_api")
            .eq("is_connected", true)
            .limit(1)
            .maybeSingle();

          if (!config) {
            lastError = "No connected Meta API config";
          } else {
            let messagePayload: Record<string, unknown> = {
              messaging_product: "whatsapp",
              to: msg.to_phone,
            };

            if (msg.message_type === "template" && msg.template_name) {
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
                text: { body: msg.content || "" },
              };
            }

            const res = await fetch(
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

            if (res.ok) {
              success = true;
            } else {
              const result = await res.json();
              lastError = result?.error?.message || `HTTP ${res.status}`;
            }
          }
        }

        const newRetryCount = msg.retry_count + 1;

        if (success) {
          await supabase
            .from("message_retry_queue")
            .update({
              status: "sent",
              resolved_at: new Date().toISOString(),
              retry_count: newRetryCount,
            })
            .eq("id", msg.id);
          successCount++;
        } else if (newRetryCount >= msg.max_retries) {
          // Exhausted all retries — mark as permanently failed
          await supabase
            .from("message_retry_queue")
            .update({
              status: "failed",
              retry_count: newRetryCount,
              last_error: lastError,
              resolved_at: new Date().toISOString(),
            })
            .eq("id", msg.id);

          await supabase.from("system_logs").insert({
            level: "error",
            source: "retry",
            function_name: "retry-messages",
            message: `فشل نهائي في إرسال رسالة بعد ${newRetryCount} محاولات`,
            metadata: { to: msg.to_phone, last_error: lastError, message_id: msg.id },
            org_id: msg.org_id,
          });
          failCount++;
        } else {
          // Backoff schedule: attempt 1 → 2min, attempt 2 → 8min, attempt 3 → 18min
          // Formula: (retryCount ^ 2) * 2 minutes
          const delayMinutes = Math.pow(newRetryCount, 2) * 2;
          const nextRetry = new Date(Date.now() + delayMinutes * 60 * 1000);

          await supabase
            .from("message_retry_queue")
            .update({
              status: "pending", // release lock back to pending for next attempt
              retry_count: newRetryCount,
              last_error: lastError,
              next_retry_at: nextRetry.toISOString(),
            })
            .eq("id", msg.id);
          failCount++;
        }
      } catch (e) {
        // On unexpected error, release lock with backoff
        await supabase
          .from("message_retry_queue")
          .update({
            status: "pending",
            retry_count: msg.retry_count + 1,
            last_error: e.message,
            next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          })
          .eq("id", msg.id);
        failCount++;
      }
    }

    if (successCount > 0 || failCount > 0) {
      await supabase.from("system_logs").insert({
        level: "info",
        source: "retry",
        function_name: "retry-messages",
        message: `Retry batch complete: ${successCount} sent, ${failCount} failed/retrying`,
        metadata: { total: pendingMessages.length, success: successCount, fail: failCount },
      });
    }

    return new Response(
      JSON.stringify({ processed: pendingMessages.length, success: successCount, failed: failCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Retry error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
