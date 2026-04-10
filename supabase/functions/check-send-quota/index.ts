import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type DbClient = ReturnType<typeof createClient>;
type ProfileRow = { id: string; org_id: string };
type ChannelRow = {
  id: string;
  channel_type: string | null;
  safety_max_per_hour: number | null;
  safety_max_per_day: number | null;
  safety_max_unique_per_hour: number | null;
  safety_paused: boolean | null;
  safety_paused_at: string | null;
  safety_paused_reason: string | null;
  channel_age_days: number | null;
  org_id: string;
  safety_limits_enabled: boolean | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXT_URL = Deno.env.get("EXTERNAL_SUPABASE_URL");
const EXT_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
const CLOUD_URL = Deno.env.get("SUPABASE_URL")!;
const CLOUD_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

function getUserIdFromJwt(authorization: string): string | null {
  try {
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const decoded = JSON.parse(atob(padded));
    return typeof decoded?.sub === "string" ? decoded.sub : null;
  } catch {
    return null;
  }
}

async function fetchProfile(client: DbClient, userId: string) {
  const { data } = await client
    .from("profiles")
    .select("id, org_id")
    .eq("id", userId)
    .maybeSingle();

  return (data as ProfileRow | null) ?? null;
}

async function fetchChannel(client: DbClient, channelId: string) {
  const channelSelect = "id, channel_type, safety_max_per_hour, safety_max_per_day, safety_max_unique_per_hour, safety_paused, safety_paused_at, safety_paused_reason, channel_age_days, org_id, safety_limits_enabled";

  const { data } = await client
    .from("whatsapp_config")
    .select(channelSelect)
    .eq("id", channelId)
    .maybeSingle();

  return (data as ChannelRow | null) ?? null;
}

async function resolveAccess(userId: string, channelId: string, extClient: DbClient | null, cloudClient: DbClient) {
  const candidates: Array<{ name: "external" | "cloud"; client: DbClient }> = [];
  if (extClient) candidates.push({ name: "external", client: extClient });
  candidates.push({ name: "cloud", client: cloudClient });

  let fallbackProfile: ProfileRow | null = null;

  for (const source of candidates) {
    const [profile, channel] = await Promise.all([
      fetchProfile(source.client, userId),
      fetchChannel(source.client, channelId),
    ]);

    if (profile && !fallbackProfile) fallbackProfile = profile;

    if (profile && channel && profile.org_id === channel.org_id) {
      return { profile, channel, adminClient: source.client, source: source.name };
    }
  }

  if (fallbackProfile) {
    for (const source of candidates) {
      const channel = await fetchChannel(source.client, channelId);
      if (channel) {
        return {
          profile: fallbackProfile,
          channel,
          adminClient: source.client,
          source: source.name,
          orgMismatch: fallbackProfile.org_id !== channel.org_id,
        };
      }
    }
  }

  return { profile: fallbackProfile, channel: null, adminClient: candidates[0]?.client ?? cloudClient, source: candidates[0]?.name ?? "cloud" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authorization = req.headers.get("Authorization") || "";
    const userId = getUserIdFromJwt(authorization);
    if (!userId) {
      return json({ error: "Unauthorized" }, 401);
    }

    const extClient = EXT_URL && EXT_KEY
      ? createClient(EXT_URL, EXT_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;
    const cloudClient = createClient(CLOUD_URL, CLOUD_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    const body = await req.json().catch(() => ({}));
    const { channel_id } = body;

    if (!channel_id) {
      return json({ error: "channel_id is required" }, 400);
    }

    const resolved = await resolveAccess(userId, channel_id, extClient, cloudClient);
    const { profile, channel, adminClient } = resolved;

    if (!profile?.org_id) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (!channel) {
      console.warn(`[check-send-quota] channel_missing user=${userId} channel=${channel_id} ext=${Boolean(extClient)}`);
      return json({ error: "Channel not found" }, 404);
    }

    if (resolved.orgMismatch) {
      console.warn(`[check-send-quota] org_mismatch user=${userId} profile_org=${profile.org_id} channel_org=${channel.org_id} source=${resolved.source}`);
      return json({ error: "Channel not found" }, 404);
    }

    if (channel.channel_type === "evolution") {
      if (!channel.safety_limits_enabled) {
        return json({
          channel_type: "evolution",
          paused: false,
          safety_limits_enabled: false,
          remaining: 999,
          limits: {
            hourly: { used: 0, max: 999, remaining: 999 },
            daily: { used: 0, max: 999, remaining: 999 },
            unique: { used: 0, max: 999, remaining: 999 },
          },
          warmup_pct: 100,
          reset_at: null,
        });
      }

      const warmup = getWarmupMultiplier(channel.channel_age_days || 0);
      const maxHour = Math.floor((channel.safety_max_per_hour || 60) * warmup);
      const maxDay = Math.floor((channel.safety_max_per_day || 500) * warmup);
      const maxUnique = Math.floor((channel.safety_max_unique_per_hour || 30) * warmup);
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
      const uniquePhones = new Set((uniqueRes.data || []).map((r: { recipient_phone: string | null }) => r.recipient_phone).filter(Boolean));
      const uniqueUsed = uniquePhones.size;
      const hourlyRemaining = Math.max(0, maxHour - hourlyUsed);
      const dailyRemaining = Math.max(0, maxDay - dailyUsed);
      const uniqueRemaining = Math.max(0, maxUnique - uniqueUsed);
      const remaining = Math.min(hourlyRemaining, dailyRemaining, uniqueRemaining);

      let resetAt: string | null = null;
      if (remaining === 0) {
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

    if (channel.channel_type === "meta_api") {
      const effectiveOrgId = channel.org_id || profile.org_id;
      const period = new Date().toISOString().slice(0, 7);

      const [usageRes, orgRes] = await Promise.all([
        adminClient
          .from("usage_tracking")
          .select("messages_sent, messages_received")
          .eq("org_id", effectiveOrgId)
          .eq("period", period)
          .maybeSingle(),
        adminClient
          .from("organizations")
          .select("plan_id")
          .eq("id", effectiveOrgId)
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

    return json({ channel_type: channel.channel_type, paused: false, remaining: 999999, limits: {}, reset_at: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("[check-send-quota] unexpected_error", message);
    return json({ error: message }, 500);
  }
});
