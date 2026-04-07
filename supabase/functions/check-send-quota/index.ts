import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function getWarmupMultiplier(ageDays: number): number {
  if (ageDays < 7) return 0.2;
  if (ageDays < 14) return 0.4;
  if (ageDays < 30) return 0.7;
  return 1.0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile } = await authClient
      .from("profiles")
      .select("id, org_id")
      .limit(1)
      .maybeSingle();

    if (!profile?.org_id) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const { channel_id } = body;

    if (!channel_id) {
      return json({ error: "channel_id is required" }, 400);
    }

    // Get channel config — use admin to bypass RLS, verify org ownership after
    const { data: channel } = await adminClient
      .from("whatsapp_config")
      .select("id, channel_type, safety_max_per_hour, safety_max_per_day, safety_max_unique_per_hour, safety_paused, safety_paused_at, safety_paused_reason, channel_age_days, org_id")
      .eq("id", channel_id)
      .maybeSingle();

    if (!channel) {
      return json({ error: "Channel not found" }, 404);
    }

    // Verify org ownership
    if (channel.org_id !== profile.org_id) {
      return json({ error: "Channel not found" }, 404);
    }

    // === EVOLUTION (unofficial) — safety limits ===
    if (channel.channel_type === "evolution") {
      const warmup = getWarmupMultiplier(channel.channel_age_days || 0);
      const maxHour = Math.floor((channel.safety_max_per_hour || 60) * warmup);
      const maxDay = Math.floor((channel.safety_max_per_day || 500) * warmup);
      const maxUnique = Math.floor((channel.safety_max_unique_per_hour || 30) * warmup);

      // Count usage from channel_send_log
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      const [hourlyRes, dailyRes, uniqueRes] = await Promise.all([
        adminClient
          .from("channel_send_log")
          .select("id", { count: "exact", head: true })
          .eq("channel_id", channel_id)
          .gte("sent_at", hourAgo),
        adminClient
          .from("channel_send_log")
          .select("id", { count: "exact", head: true })
          .eq("channel_id", channel_id)
          .gte("sent_at", dayAgo),
        adminClient
          .from("channel_send_log")
          .select("recipient_phone")
          .eq("channel_id", channel_id)
          .gte("sent_at", hourAgo),
      ]);

      const hourlyUsed = hourlyRes.count || 0;
      const dailyUsed = dailyRes.count || 0;
      const uniquePhones = new Set((uniqueRes.data || []).map((r: any) => r.recipient_phone).filter(Boolean));
      const uniqueUsed = uniquePhones.size;

      // Determine the most limiting factor
      const hourlyRemaining = Math.max(0, maxHour - hourlyUsed);
      const dailyRemaining = Math.max(0, maxDay - dailyUsed);
      const uniqueRemaining = Math.max(0, maxUnique - uniqueUsed);
      const remaining = Math.min(hourlyRemaining, dailyRemaining, uniqueRemaining);

      // Calculate reset time (when hourly window resets)
      let resetAt: string | null = null;
      if (remaining === 0) {
        // Find oldest send in the last hour to calculate when it falls out
        const { data: oldest } = await adminClient
          .from("channel_send_log")
          .select("sent_at")
          .eq("channel_id", channel_id)
          .gte("sent_at", hourAgo)
          .order("sent_at", { ascending: true })
          .limit(1);

        if (oldest && oldest.length > 0) {
          const oldestTime = new Date(oldest[0].sent_at);
          resetAt = new Date(oldestTime.getTime() + 60 * 60 * 1000).toISOString();
        }
      }

      return json({
        channel_type: "evolution",
        paused: channel.safety_paused || false,
        paused_reason: channel.safety_paused_reason,
        remaining,
        limits: {
          hourly: { used: hourlyUsed, max: maxHour, remaining: hourlyRemaining },
          daily: { used: dailyUsed, max: maxDay, remaining: dailyRemaining },
          unique: { used: uniqueUsed, max: maxUnique, remaining: uniqueRemaining },
        },
        warmup_pct: Math.round(warmup * 100),
        reset_at: resetAt,
      });
    }

    // === META API (official) — plan limits ===
    if (channel.channel_type === "meta_api") {
      const period = new Date().toISOString().slice(0, 7); // YYYY-MM

      const [usageRes, orgRes] = await Promise.all([
        adminClient
          .from("usage_tracking")
          .select("messages_sent, messages_received")
          .eq("org_id", profile.org_id)
          .eq("period", period)
          .maybeSingle(),
        adminClient
          .from("organizations")
          .select("plan_id")
          .eq("id", profile.org_id)
          .maybeSingle(),
      ]);

      let maxMessages = 999999;
      if (orgRes.data?.plan_id) {
        const { data: plan } = await adminClient
          .from("plans")
          .select("max_messages_per_month")
          .eq("id", orgRes.data.plan_id)
          .maybeSingle();
        if (plan) maxMessages = plan.max_messages_per_month || 999999;
      }

      const totalUsed = (usageRes.data?.messages_sent || 0) + (usageRes.data?.messages_received || 0);
      const remaining = Math.max(0, maxMessages - totalUsed);

      // Reset at start of next month
      const now = new Date();
      const resetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

      return json({
        channel_type: "meta_api",
        paused: false,
        remaining,
        limits: {
          monthly: { used: totalUsed, max: maxMessages, remaining },
        },
        reset_at: remaining === 0 ? resetAt : null,
      });
    }

    return json({ channel_type: channel.channel_type, paused: false, remaining: 999999, limits: {} });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
