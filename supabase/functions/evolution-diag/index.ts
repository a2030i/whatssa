import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
  const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
  const CLOUD_URL = Deno.env.get("SUPABASE_URL") || "";

  const supabase = createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results: any[] = [];

  // 1. Check DB channels
  const { data: channels, error: dbErr } = await supabase
    .from("whatsapp_config")
    .select("id, org_id, evolution_instance_name, is_connected, evolution_instance_status, channel_type")
    .eq("channel_type", "evolution");

  results.push({ step: "db_channels", count: channels?.length || 0, error: dbErr?.message, channels: channels?.map(c => ({ name: c.evolution_instance_name, connected: c.is_connected, status: c.evolution_instance_status })) });

  // 2. Check Evolution API instances
  if (EVOLUTION_API_URL && EVOLUTION_API_KEY) {
    try {
      const res = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
        headers: { apikey: EVOLUTION_API_KEY },
      });
      const instances = await res.json();
      const instanceList = Array.isArray(instances) ? instances : [];

      for (const inst of instanceList) {
        const name = inst?.instance?.instanceName || inst?.instanceName || "unknown";
        const state = inst?.instance?.state || inst?.state || "unknown";

        // Check webhook config
        let webhookInfo: any = null;
        try {
          const whRes = await fetch(`${EVOLUTION_API_URL}/webhook/find/${name}`, {
            headers: { apikey: EVOLUTION_API_KEY },
          });
          webhookInfo = await whRes.json();
        } catch {}

        results.push({
          step: "evolution_instance",
          name,
          state,
          webhook_url: webhookInfo?.url || webhookInfo?.webhook?.url || "NOT_SET",
          webhook_enabled: webhookInfo?.enabled ?? webhookInfo?.webhook?.enabled ?? false,
          webhook_events: webhookInfo?.events || webhookInfo?.webhook?.events || [],
        });
      }
    } catch (e: any) {
      results.push({ step: "evolution_api_error", error: e.message });
    }
  } else {
    results.push({ step: "evolution_api", error: "EVOLUTION_API_URL or KEY not set" });
  }

  // 3. Expected webhook URL
  const expectedUrl = `${CLOUD_URL}/functions/v1/evolution-webhook`;
  results.push({ step: "expected_webhook_url", url: expectedUrl });

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
