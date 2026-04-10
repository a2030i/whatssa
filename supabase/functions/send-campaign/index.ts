import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHUNK_SIZE = 500;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Require authenticated caller
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: callerProfile } = await callerClient
    .from("profiles")
    .select("id, org_id")
    .limit(1)
    .maybeSingle();

  if (!callerProfile?.org_id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const { campaign_id } = await req.json();

    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get campaign
    const { data: campaign, error: campErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();

    if (campErr || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller belongs to the campaign's org
    if (campaign.org_id !== callerProfile.org_id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify WhatsApp config exists
    const templateVars = (campaign.template_variables as any[]) || [];
    const isEvolution = templateVars[0]?.channel_type === "evolution";
    const channelId = templateVars[0]?.channel_id || null;

    let configQuery = supabase
      .from("whatsapp_config")
      .select("id")
      .eq("org_id", campaign.org_id)
      .eq("is_connected", true)
      .eq("channel_type", isEvolution ? "evolution" : "meta_api");

    if (channelId) configQuery = configQuery.eq("id", channelId);

    const { data: config } = await configQuery.limit(1).maybeSingle();

    if (!config) {
      await supabase.from("campaigns").update({ status: "failed" }).eq("id", campaign_id);
      return new Response(JSON.stringify({ error: "No WhatsApp channel connected" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark campaign as queued
    await supabase.from("campaigns").update({
      status: "queued",
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", campaign_id);

    // Fetch ALL pending recipients (paginated to handle >1000)
    const allRecipientIds: string[] = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data: batch } = await supabase
        .from("campaign_recipients")
        .select("id")
        .eq("campaign_id", campaign_id)
        .eq("status", "pending")
        .range(from, from + pageSize - 1);

      if (!batch || batch.length === 0) break;
      allRecipientIds.push(...batch.map((r: any) => r.id));
      if (batch.length < pageSize) break;
      from += pageSize;
    }

    if (allRecipientIds.length === 0) {
      await supabase.from("campaigns").update({
        status: "sent",
        completed_at: new Date().toISOString(),
      }).eq("id", campaign_id);

      return new Response(JSON.stringify({ ok: true, queued: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Split into chunks and insert into queue
    const chunks: { campaign_id: string; org_id: string; chunk_index: number; recipient_ids: string[]; chunk_size: number }[] = [];

    for (let i = 0; i < allRecipientIds.length; i += CHUNK_SIZE) {
      const slice = allRecipientIds.slice(i, i + CHUNK_SIZE);
      chunks.push({
        campaign_id,
        org_id: campaign.org_id,
        chunk_index: Math.floor(i / CHUNK_SIZE),
        recipient_ids: slice,
        chunk_size: slice.length,
      });
    }

    // Insert chunks in batches of 50 to avoid payload limits
    for (let i = 0; i < chunks.length; i += 50) {
      const batch = chunks.slice(i, i + 50);
      const { error: insertErr } = await supabase.from("campaign_queue").insert(batch);
      if (insertErr) {
        console.error("Error inserting queue chunks:", insertErr);
        throw new Error(`Failed to queue campaign: ${insertErr.message}`);
      }
    }

    // Update total recipients
    await supabase.from("campaigns").update({
      total_recipients: allRecipientIds.length,
      status: "queued",
      notes: `📋 تم تقسيم الحملة إلى ${chunks.length} دفعة (${allRecipientIds.length} مستلم)`,
      updated_at: new Date().toISOString(),
    }).eq("id", campaign_id);

    console.log(`[send-campaign] Queued ${allRecipientIds.length} recipients in ${chunks.length} chunks for campaign ${campaign_id}`);

    return new Response(JSON.stringify({
      ok: true,
      queued: allRecipientIds.length,
      chunks: chunks.length,
      chunk_size: CHUNK_SIZE,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-campaign error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
