import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Also connect to external Supabase if configured (where chat-media bucket lives)
    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    const extSupabase = extUrl && extKey ? createClient(extUrl, extKey) : null;

    const retentionDays = 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffISO = cutoffDate.toISOString();

    console.log(`[cleanup-old-media] Starting cleanup for media older than ${retentionDays} days (before ${cutoffISO})`);

    // Step 1: Find messages with media older than retention period
    let allMessages: any[] = [];
    let from = 0;
    const pageSize = 500;

    while (true) {
      const { data, error } = await supabase
        .from("messages")
        .select("id, media_url, conversation_id, created_at")
        .not("media_url", "is", null)
        .lt("created_at", cutoffISO)
        .range(from, from + pageSize - 1);

      if (error) {
        console.error("[cleanup-old-media] Error fetching messages:", error.message);
        break;
      }

      if (!data || data.length === 0) break;
      allMessages = allMessages.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    console.log(`[cleanup-old-media] Found ${allMessages.length} messages with media to clean`);

    let deletedStorageCount = 0;
    let clearedUrlCount = 0;
    let errorCount = 0;

    // Step 2: Delete files from storage and clear media_url
    for (const msg of allMessages) {
      try {
        // Try to extract storage path from media_url
        const storagePath = extractStoragePath(msg.media_url);

        if (storagePath) {
          // Try external storage first, then internal
          const storageClient = extSupabase || supabase;
          const { error: deleteError } = await storageClient.storage
            .from("chat-media")
            .remove([storagePath]);

          if (deleteError) {
            console.warn(`[cleanup-old-media] Storage delete failed for ${storagePath}: ${deleteError.message}`);
            // Still clear the URL even if storage delete fails
          } else {
            deletedStorageCount++;
          }
        }

        // Clear media_url from message record
        const { error: updateError } = await supabase
          .from("messages")
          .update({ media_url: null })
          .eq("id", msg.id);

        if (updateError) {
          console.error(`[cleanup-old-media] Failed to clear media_url for message ${msg.id}: ${updateError.message}`);
          errorCount++;
        } else {
          clearedUrlCount++;
        }
      } catch (err) {
        console.error(`[cleanup-old-media] Error processing message ${msg.id}:`, err);
        errorCount++;
      }
    }

    const summary = {
      retention_days: retentionDays,
      cutoff_date: cutoffISO,
      total_messages_found: allMessages.length,
      storage_files_deleted: deletedStorageCount,
      media_urls_cleared: clearedUrlCount,
      errors: errorCount,
      completed_at: new Date().toISOString(),
    };

    console.log("[cleanup-old-media] Completed:", JSON.stringify(summary));

    // Log to activity_logs for audit trail
    await supabase.from("activity_logs").insert({
      action: "media_cleanup",
      actor_type: "system",
      metadata: summary,
    });

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("[cleanup-old-media] Fatal error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

/**
 * Extract the storage path from a media URL.
 * Handles signed URLs and direct paths.
 */
function extractStoragePath(mediaUrl: string): string | null {
  if (!mediaUrl) return null;

  try {
    // Pattern: /storage/v1/object/sign/chat-media/... or /storage/v1/object/public/chat-media/...
    const match = mediaUrl.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/chat-media\/(.+?)(?:\?|$)/);
    if (match) return decodeURIComponent(match[1]);

    // Pattern: direct path like "org-id/conv-id/filename.jpg"
    if (!mediaUrl.startsWith("http") && mediaUrl.includes("/")) {
      return mediaUrl;
    }

    return null;
  } catch {
    return null;
  }
}
