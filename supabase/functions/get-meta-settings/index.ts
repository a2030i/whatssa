import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
    const ext = createClient(extUrl, extKey);

    // POST = upsert a setting
    if (req.method === "POST") {
      const { key, value } = await req.json();
      if (!key) throw new Error("key is required");
      const { error } = await ext
        .from("system_settings")
        .upsert({ key, value, description: `Meta setting: ${key}` }, { onConflict: "key" });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, key, value }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data } = await ext
      .from("system_settings")
      .select("key, value")
      .in("key", ["meta_app_id", "meta_config_id", "official_whatsapp_enabled"]);

    return new Response(JSON.stringify(data || []), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
