import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WEBHOOK_EVENTS = [
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "MESSAGES_EDITED",
  "MESSAGES_DELETE",
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
  "PRESENCE_UPDATE",
  "SEND_MESSAGE",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
  const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";
  const CLOUD_URL = Deno.env.get("SUPABASE_URL") || "";
  const webhookUrl = `${CLOUD_URL}/functions/v1/evolution-webhook`;

  const supabase = createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return new Response(JSON.stringify({ error: "Evolution not configured" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];

  // Get all DB channels
  const { data: channels } = await supabase
    .from("whatsapp_config")
    .select("id, org_id, evolution_instance_name")
    .eq("channel_type", "evolution");

  if (!channels || channels.length === 0) {
    return new Response(JSON.stringify({ message: "No channels" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch all Evolution instances to get real names
  let evolutionInstances: any[] = [];
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/instance/fetchInstances`, {
      headers: { apikey: EVOLUTION_API_KEY },
    });
    const raw = await res.json();
    evolutionInstances = Array.isArray(raw) ? raw : [];
  } catch (e: any) {
    results.push({ error: "Failed to fetch instances", detail: e.message });
  }

  // Log raw structure of first instance for debugging
  if (evolutionInstances.length > 0) {
    const sample = evolutionInstances[0];
    results.push({
      step: "raw_instance_structure",
      keys: Object.keys(sample),
      instance_keys: sample.instance ? Object.keys(sample.instance) : "no_instance_key",
      sample_name: sample?.instance?.instanceName || sample?.instanceName || sample?.name || "NOT_FOUND",
    });
  }

  // For each DB channel, set webhook
  for (const channel of channels) {
    const instanceName = channel.evolution_instance_name;
    if (!instanceName) continue;

    try {
      // Set webhook using POST /webhook/set/{instanceName}
      const setRes = await fetch(`${EVOLUTION_API_URL}/webhook/set/${instanceName}`, {
        method: "POST",
        headers: { apikey: EVOLUTION_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          enabled: true,
          webhookByEvents: false,
          webhookBase64: false,
          events: WEBHOOK_EVENTS,
        }),
      });
      const setData = await setRes.json();

      // Verify
      const verifyRes = await fetch(`${EVOLUTION_API_URL}/webhook/find/${instanceName}`, {
        headers: { apikey: EVOLUTION_API_KEY },
      });
      const verifyData = await verifyRes.json();

      results.push({
        instance: instanceName,
        set_status: setRes.status,
        set_response: JSON.stringify(setData).slice(0, 200),
        verify_url: verifyData?.url || verifyData?.webhook?.url || "NOT_SET",
        verify_enabled: verifyData?.enabled ?? verifyData?.webhook?.enabled ?? false,
      });
    } catch (e: any) {
      results.push({ instance: instanceName, error: e.message });
    }
  }

  return new Response(JSON.stringify({ webhook_url: webhookUrl, results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
