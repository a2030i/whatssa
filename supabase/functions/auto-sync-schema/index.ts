import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Auto-sync schema: ensures all required columns exist in the external DB.
 * Called on deploy, by cron, or by webhooks when they detect a missing column.
 * Uses the Supabase REST API (not direct SQL) for compatibility.
 */

interface ColumnDef {
  name: string;
  type: string;
  default_value?: string;
  nullable?: boolean;
}

const REQUIRED_CONVERSATION_COLUMNS: ColumnDef[] = [
  { name: "dedicated_agent_id", type: "uuid", nullable: true },
  { name: "dedicated_agent_name", type: "text", nullable: true },
  { name: "sentiment", type: "text", nullable: true },
  { name: "sentiment_score", type: "numeric", nullable: true },
  { name: "sentiment_updated_at", type: "timestamptz", nullable: true },
  { name: "satisfaction_status", type: "text", nullable: true },
  { name: "wa_conversation_id", type: "text", nullable: true },
  { name: "last_message_sender", type: "text", nullable: true },
  { name: "unread_mention_count", type: "integer", default_value: "0", nullable: false },
  { name: "is_pinned", type: "boolean", default_value: "false", nullable: false },
  { name: "is_archived", type: "boolean", default_value: "false", nullable: false },
  { name: "escalated", type: "boolean", nullable: true },
  { name: "escalated_at", type: "timestamptz", nullable: true },
  { name: "first_response_at", type: "timestamptz", nullable: true },
  { name: "closed_by", type: "text", nullable: true },
  { name: "closure_reason_id", type: "uuid", nullable: true },
  { name: "conversation_type", type: "text", default_value: "'private'", nullable: false },
  { name: "customer_profile_pic", type: "text", nullable: true },
  { name: "customer_id", type: "uuid", nullable: true },
];

const REQUIRED_WHATSAPP_CONFIG_COLUMNS: ColumnDef[] = [
  { name: "channel_label", type: "text", nullable: true },
  { name: "channel_age_days", type: "integer", nullable: true },
  { name: "rate_limit_settings", type: "jsonb", nullable: true },
  { name: "safety_limits_enabled", type: "boolean", default_value: "false", nullable: true },
  { name: "ai_auto_reply_enabled", type: "boolean", default_value: "false", nullable: true },
  { name: "ai_max_attempts", type: "integer", default_value: "3", nullable: true },
  { name: "ai_transfer_keywords", type: "text[]", nullable: true },
  { name: "exclude_supervisors", type: "boolean", default_value: "false", nullable: true },
];


  { name: "wa_message_id", type: "text", nullable: true },
  { name: "status", type: "text", nullable: true },
  { name: "metadata", type: "jsonb", nullable: true },
  { name: "media_url", type: "text", nullable: true },
  { name: "media_mime_type", type: "text", nullable: true },
  { name: "reply_to_message_id", type: "text", nullable: true },
  { name: "is_edited", type: "boolean", default_value: "false", nullable: true },
  { name: "edited_at", type: "timestamptz", nullable: true },
  { name: "reaction", type: "text", nullable: true },
];

function getExternalDbUrl(): string | null {
  let dbUrl = Deno.env.get("EXTERNAL_SUPABASE_DB_URL");
  if (!dbUrl) return null;

  // If using pooler, switch to direct connection
  if (dbUrl.includes("pooler.supabase.com")) {
    const match = dbUrl.match(/postgres\.([a-z]+):(.*?)@/);
    if (match) {
      const ref = match[1];
      const pass = match[2];
      dbUrl = `postgresql://postgres:${pass}@db.${ref}.supabase.co:5432/postgres`;
    }
  }
  return dbUrl;
}

async function ensureColumnsViaSql(
  dbUrl: string,
  tableName: string,
  columns: ColumnDef[],
): Promise<{ added: string[]; existing: string[]; errors: string[] }> {
  const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.5/mod.js");
  const sql = postgres(dbUrl, { ssl: "prefer" });

  const added: string[] = [];
  const existing: string[] = [];
  const errors: string[] = [];

  try {
    // Get existing columns in one query
    const existingCols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tableName}
    `;
    const existingSet = new Set(existingCols.map((c: any) => c.column_name));

    for (const col of columns) {
      if (existingSet.has(col.name)) {
        existing.push(col.name);
        continue;
      }

      try {
        const defaultClause = col.default_value
          ? `DEFAULT ${col.default_value}`
          : col.nullable !== false ? "" : "";
        const nullClause = col.nullable === false ? "NOT NULL" : "";

        await sql.unsafe(
          `ALTER TABLE public.${tableName} ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type} ${nullClause} ${defaultClause}`.trim()
        );
        added.push(col.name);
        console.log(`[auto-sync] Added ${tableName}.${col.name} (${col.type})`);
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes("already exists")) {
          existing.push(col.name);
        } else {
          errors.push(`${tableName}.${col.name}: ${msg}`);
          console.error(`[auto-sync] Error adding ${tableName}.${col.name}:`, msg);
        }
      }
    }

    await sql.end();
  } catch (e) {
    errors.push(`Connection error: ${(e as Error).message}`);
    try { await sql.end(); } catch (_) {}
  }

  return { added, existing, errors };
}

/**
 * Lightweight check using Supabase REST API (no direct DB connection needed).
 * Tries to select the required columns; if any fail, returns the missing ones.
 */
async function checkColumnsViaRest(
  tableName: string,
  columns: string[],
): Promise<string[]> {
  const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
  const extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
  if (!extUrl || !extKey) return [];

  const client = createClient(extUrl, extKey);
  const selectStr = columns.join(",");

  const { error } = await client
    .from(tableName)
    .select(selectStr)
    .limit(0);

  if (!error) return []; // All columns exist

  // Parse error to find missing column
  const match = error.message.match(/column (\w+)\.(\w+) does not exist/i)
    || error.message.match(/Could not find.*column '?(\w+)'?/i);

  if (match) {
    // Return the problematic column, but there might be more
    // We need to check one by one
    const missing: string[] = [];
    for (const col of columns) {
      const { error: colErr } = await client.from(tableName).select(col).limit(0);
      if (colErr) missing.push(col);
    }
    return missing;
  }

  return [];
}

// Global cache to avoid running the check too frequently
let _lastSyncTime = 0;
const SYNC_INTERVAL_MS = 3600_000; // 1 hour

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
  const extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authClient = createClient(extUrl, extKey);
  const { data: { user: caller }, error: userError } = await authClient.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userError || !caller) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const { data: roleData } = await authClient.from("user_roles").select("role").eq("user_id", caller.id).eq("role", "super_admin").maybeSingle();
  if (!roleData) {
    return new Response(JSON.stringify({ error: "Forbidden — super_admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    let force = false;
    try {
      const body = await req.json();
      force = body?.force === true;
    } catch (_) {}

    // Check if we should skip (unless forced)
    const now = Date.now();
    if (!force && _lastSyncTime > 0 && (now - _lastSyncTime) < SYNC_INTERVAL_MS) {
      return new Response(JSON.stringify({
        status: "skipped",
        reason: "sync ran recently",
        last_sync_ago_minutes: Math.round((now - _lastSyncTime) / 60000),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dbUrl = getExternalDbUrl();
    if (!dbUrl) {
      // Fallback: try REST API check
      const missingConv = await checkColumnsViaRest(
        "conversations",
        REQUIRED_CONVERSATION_COLUMNS.map(c => c.name),
      );
      const missingMsg = await checkColumnsViaRest(
        "messages",
        REQUIRED_MESSAGE_COLUMNS.map(c => c.name),
      );

      if (missingConv.length === 0 && missingMsg.length === 0) {
        _lastSyncTime = now;
        return new Response(JSON.stringify({
          status: "ok",
          method: "rest_check",
          message: "All columns present",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        status: "missing_columns_detected",
        method: "rest_check",
        missing_conversations: missingConv,
        missing_messages: missingMsg,
        fix: "Set EXTERNAL_SUPABASE_DB_URL secret to enable auto-fix",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Full sync with direct DB connection
    console.log("[auto-sync] Running full schema sync...");

    const convResult = await ensureColumnsViaSql(dbUrl, "conversations", REQUIRED_CONVERSATION_COLUMNS);
    const msgResult = await ensureColumnsViaSql(dbUrl, "messages", REQUIRED_MESSAGE_COLUMNS);

    _lastSyncTime = now;

    const totalAdded = convResult.added.length + msgResult.added.length;
    const totalErrors = convResult.errors.length + msgResult.errors.length;

    return new Response(JSON.stringify({
      status: totalErrors > 0 ? "partial" : "ok",
      conversations: convResult,
      messages: msgResult,
      total_added: totalAdded,
      total_errors: totalErrors,
      synced_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[auto-sync] Error:", (err as Error).message);
    return new Response(JSON.stringify({
      error: (err as Error).message,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
