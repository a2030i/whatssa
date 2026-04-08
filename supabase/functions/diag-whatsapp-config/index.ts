import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const db = createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await db.from("whatsapp_config").select("*").order("created_at", { ascending: true }).limit(20);

  return new Response(JSON.stringify({
    error: error?.message || null,
    count: data?.length || 0,
    rows: (data || []).map((row: any) => ({
      id: row.id,
      org_id: row.org_id,
      channel_type: row.channel_type,
      business_name: row.business_name ?? null,
      display_phone: row.display_phone ?? null,
      phone_number_id: row.phone_number_id ?? null,
      is_connected: row.is_connected ?? null,
      webhook_verify_token: row.webhook_verify_token ? "set" : null,
      last_webhook_at: row.last_webhook_at ?? null,
      updated_at: row.updated_at ?? null,
    })),
  }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});