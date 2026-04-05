import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const EXTERNAL_URL = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
  const EXTERNAL_KEY = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!;
  const EXTERNAL_SERVICE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
  const CLOUD_URL = Deno.env.get("SUPABASE_URL")!;
  const CLOUD_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const cloudSupabase = createClient(CLOUD_URL, CLOUD_SERVICE_KEY);

  const results: Record<string, any> = {
    checked_at: new Date().toISOString(),
    db_reachable: false,
    auth_reachable: false,
    latency_ms: 0,
    errors: [],
  };

  const start = Date.now();

  // Check external DB
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${EXTERNAL_URL}/rest/v1/organizations?select=id&limit=1`, {
      signal: controller.signal,
      headers: {
        apikey: EXTERNAL_KEY,
        Authorization: `Bearer ${EXTERNAL_SERVICE_KEY}`,
      },
    });
    clearTimeout(timeout);
    results.db_reachable = res.ok;
    results.db_status_code = res.status;
  } catch (e: any) {
    results.errors.push(`DB: ${e.message}`);
  }

  // Check external Auth
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${EXTERNAL_URL}/auth/v1/settings`, {
      signal: controller.signal,
      headers: { apikey: EXTERNAL_KEY },
    });
    clearTimeout(timeout);
    results.auth_reachable = res.ok;
  } catch (e: any) {
    results.errors.push(`Auth: ${e.message}`);
  }

  results.latency_ms = Date.now() - start;

  // Log to Cloud DB
  try {
    await cloudSupabase.from("health_check_logs").insert({
      service: "external_supabase",
      status: results.db_reachable && results.auth_reachable ? "healthy" : "unhealthy",
      latency_ms: results.latency_ms,
      metadata: results,
    });
  } catch {
    // table might not exist yet, that's fine
  }

  // If external DB is DOWN, send alert via Evolution API (WhatsApp)
  if (!results.db_reachable || !results.auth_reachable) {
    const EVOLUTION_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY");

    if (EVOLUTION_URL && EVOLUTION_KEY) {
      try {
        // Read alert phone and instance from Cloud system_settings
        const { data: settings } = await cloudSupabase
          .from("system_settings")
          .select("key, value")
          .in("key", ["emergency_phone", "alert_evolution_instance"]);

        const settingsMap: Record<string, string> = {};
        for (const s of settings || []) {
          settingsMap[s.key] = String(s.value);
        }

        const alertPhone = settingsMap["emergency_phone"];
        const alertInstance = settingsMap["alert_evolution_instance"];

        if (alertPhone && alertInstance) {
          const message = `🚨 تنبيه طوارئ - النظام متوقف!\n\n` +
            `⏰ الوقت: ${new Date().toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}\n` +
            `🔴 قاعدة البيانات: ${results.db_reachable ? "تعمل" : "متوقفة"}\n` +
            `🔴 المصادقة: ${results.auth_reachable ? "تعمل" : "متوقفة"}\n` +
            `⏱️ زمن الفحص: ${results.latency_ms}ms\n\n` +
            `يرجى التحقق فوراً من لوحة Supabase.`;

          await fetch(`${EVOLUTION_URL}/message/sendText/${alertInstance}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: EVOLUTION_KEY,
            },
            body: JSON.stringify({
              number: alertPhone,
              text: message,
            }),
          });

          results.alert_sent = true;
          results.alert_phone = alertPhone;
          results.alert_instance = alertInstance;
        } else {
          results.alert_sent = false;
          results.alert_reason = !alertPhone ? "no_emergency_phone" : "no_alert_instance";
        }
      } catch (e: any) {
        results.alert_sent = false;
        results.alert_error = e.message;
      }
    }
  }

  return new Response(JSON.stringify(results), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});