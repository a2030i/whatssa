import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Structured Audit Logger
 * 
 * Records: actor (who) + action (what) + entity (on what) + metadata (details)
 * 
 * Usage from edge functions:
 *   await auditLog(supabase, {
 *     actor_id: user.id,
 *     actor_type: "user",        // user | system | api | cron
 *     action: "conversation.closed",
 *     target_type: "conversation",
 *     target_id: convId,
 *     org_id: orgId,
 *     metadata: { reason: "resolved", closure_reason_id: "..." }
 *   });
 * 
 * Actions follow entity.verb format:
 *   conversation.created, conversation.assigned, conversation.closed
 *   message.sent, message.failed, message.retried
 *   customer.created, customer.updated, customer.deleted, customer.merged
 *   team.member_added, team.member_removed
 *   campaign.sent, campaign.completed
 *   payment.completed, payment.failed
 *   settings.updated
 *   user.login, user.logout
 */

interface AuditEntry {
  actor_id?: string | null;
  actor_type?: string; // user | system | api | cron
  action: string;      // entity.verb format
  target_type?: string | null;
  target_id?: string | null;
  org_id?: string | null;
  metadata?: Record<string, unknown>;
}

export async function auditLog(
  supabase: ReturnType<typeof createClient>,
  entry: AuditEntry
) {
  try {
    await supabase.from("activity_logs").insert({
      actor_id: entry.actor_id || null,
      actor_type: entry.actor_type || "system",
      action: entry.action,
      target_type: entry.target_type || null,
      target_id: entry.target_id || null,
      org_id: entry.org_id || null,
      metadata: entry.metadata || {},
    });
  } catch (e) {
    console.error("Audit log failed:", e);
  }
}

// Edge function endpoint for client-side audit logging
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    if (!profile?.org_id) {
      return new Response(JSON.stringify({ error: "No org" }), { status: 400, headers: corsHeaders });
    }

    const body = await req.json();
    const { action, target_type, target_id, metadata } = body;

    if (!action || typeof action !== "string") {
      return new Response(JSON.stringify({ error: "action required" }), { status: 400, headers: corsHeaders });
    }

    await auditLog(supabase, {
      actor_id: user.id,
      actor_type: "user",
      action,
      target_type: target_type || null,
      target_id: target_id || null,
      org_id: profile.org_id,
      metadata: metadata || {},
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
