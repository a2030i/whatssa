import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_APP_ID = Deno.env.get("META_APP_ID") || "1306128431426603";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
    const metaAppSecret = Deno.env.get("META_APP_SECRET")!;

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Get all configs with tokens expiring in the next 7 days or already expired
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: configs, error: fetchErr } = await adminClient
      .from("whatsapp_config")
      .select("id, org_id, access_token, token_expires_at, display_phone")
      .eq("is_connected", true)
      .or(`token_expires_at.is.null,token_expires_at.lte.${sevenDaysFromNow}`);

    if (fetchErr) throw fetchErr;

    const results: any[] = [];

    for (const config of (configs || [])) {
      try {
        // Exchange token for a new long-lived token via Meta API
        const url = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${metaAppSecret}&fb_exchange_token=${config.access_token}`;
        const resp = await fetch(url);
        const data = await resp.json();

        if (data.error) {
          // Token refresh failed — store error
          await adminClient.from("whatsapp_config").update({
            token_refresh_error: data.error.message || "فشل تجديد التوكن",
            updated_at: new Date().toISOString(),
          }).eq("id", config.id);

          results.push({ id: config.id, phone: config.display_phone, status: "failed", error: data.error.message });
          continue;
        }

        // Calculate expiry (Meta returns expires_in in seconds)
        const expiresAt = data.expires_in
          ? new Date(Date.now() + data.expires_in * 1000).toISOString()
          : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // default 60 days

        // Update token
        await adminClient.from("whatsapp_config").update({
          access_token: data.access_token,
          token_expires_at: expiresAt,
          token_last_refreshed_at: new Date().toISOString(),
          token_refresh_error: null,
          updated_at: new Date().toISOString(),
        }).eq("id", config.id);

        results.push({ id: config.id, phone: config.display_phone, status: "refreshed", expires_at: expiresAt });
      } catch (e: any) {
        await adminClient.from("whatsapp_config").update({
          token_refresh_error: e.message || "خطأ غير متوقع",
          updated_at: new Date().toISOString(),
        }).eq("id", config.id);

        results.push({ id: config.id, phone: config.display_phone, status: "error", error: e.message });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
