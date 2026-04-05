import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();

    // Find recurring campaigns that are due
    const { data: recurringCampaigns, error } = await supabase
      .from("campaigns")
      .select("*")
      .not("recurring_type", "is", null)
      .in("status", ["scheduled", "sent"])
      .or(`recurring_end_at.is.null,recurring_end_at.gt.${now.toISOString()}`);

    if (error) throw error;

    let processed = 0;

    for (const campaign of recurringCampaigns || []) {
      const lastRun = campaign.last_recurring_at ? new Date(campaign.last_recurring_at) : 
                      campaign.sent_at ? new Date(campaign.sent_at) : null;
      
      if (!lastRun && campaign.status !== "sent") continue; // Never sent yet, skip
      if (!lastRun) continue;

      // Check if it's time for next run
      const diffMs = now.getTime() - lastRun.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      
      let isDue = false;
      switch (campaign.recurring_type) {
        case "daily": isDue = diffHours >= 23; break;
        case "weekly": isDue = diffHours >= 167; break; // ~7 days
        case "monthly": isDue = diffHours >= 719; break; // ~30 days
      }

      if (!isDue) continue;

      // Get recipients from original campaign
      const { data: originalRecipients } = await supabase
        .from("campaign_recipients")
        .select("phone, customer_name, variables")
        .eq("campaign_id", campaign.id);

      if (!originalRecipients || originalRecipients.length === 0) continue;

      // Re-fetch audience if dynamic (all/tags)
      let recipientList = originalRecipients;
      if (campaign.audience_type === "all" || campaign.audience_type === "tags") {
        let query = supabase.from("customers").select("phone, name").eq("org_id", campaign.org_id);
        
        if (campaign.audience_type === "tags" && campaign.audience_tags?.length > 0) {
          query = query.overlaps("tags", campaign.audience_tags);
        }
        
        const { data: freshCustomers } = await query;
        if (freshCustomers && freshCustomers.length > 0) {
          recipientList = freshCustomers.map((c: any) => ({ 
            phone: c.phone, 
            customer_name: c.name, 
            variables: {} 
          }));

          // Apply exclude tags
          if (campaign.exclude_tags?.length > 0) {
            const { data: excludeCustomers } = await supabase
              .from("customers")
              .select("phone")
              .eq("org_id", campaign.org_id)
              .overlaps("tags", campaign.exclude_tags);
            
            const excludePhones = new Set((excludeCustomers || []).map((c: any) => c.phone));
            recipientList = recipientList.filter((r: any) => !excludePhones.has(r.phone));
          }
        }
      }

      // Create child campaign
      const { data: childCampaign, error: childError } = await supabase
        .from("campaigns")
        .insert({
          org_id: campaign.org_id,
          name: `${campaign.name} — تكرار ${(campaign.recurring_count || 0) + 1}`,
          template_name: campaign.template_name,
          template_language: campaign.template_language,
          template_variables: campaign.template_variables,
          audience_type: campaign.audience_type,
          audience_tags: campaign.audience_tags,
          exclude_tags: campaign.exclude_tags,
          status: "scheduled",
          scheduled_at: now.toISOString(),
          total_recipients: recipientList.length,
          parent_campaign_id: campaign.id,
        })
        .select()
        .single();

      if (childError) {
        console.error(`Failed to create child campaign for ${campaign.id}:`, childError);
        continue;
      }

      // Insert recipients
      const batchSize = 500;
      for (let i = 0; i < recipientList.length; i += batchSize) {
        const batch = recipientList.slice(i, i + batchSize).map((r: any) => ({
          campaign_id: childCampaign.id,
          phone: r.phone,
          customer_name: r.customer_name || null,
          variables: r.variables || {},
        }));
        await supabase.from("campaign_recipients").insert(batch);
      }

      // Update parent campaign
      await supabase
        .from("campaigns")
        .update({
          last_recurring_at: now.toISOString(),
          recurring_count: (campaign.recurring_count || 0) + 1,
        })
        .eq("id", campaign.id);

      processed++;
      console.log(`Created recurring child campaign for ${campaign.name} (${childCampaign.id})`);
    }

    return new Response(JSON.stringify({ ok: true, processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error processing recurring campaigns:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
