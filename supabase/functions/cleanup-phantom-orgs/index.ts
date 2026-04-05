import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const dryRun = body.dry_run !== false; // default to dry run for safety

    // Get all orgs and profiles
    const [orgsRes, profilesRes] = await Promise.all([
      adminClient.from("organizations").select("id, name, created_at").limit(1000),
      adminClient.from("profiles").select("id, org_id").limit(1000),
    ]);

    if (orgsRes.error) throw orgsRes.error;
    if (profilesRes.error) throw profilesRes.error;

    const orgs = orgsRes.data || [];
    const profiles = profilesRes.data || [];

    // Find orphan orgs (0 members)
    const memberCountByOrg = new Map<string, number>();
    for (const p of profiles) {
      if (!p.org_id) continue;
      memberCountByOrg.set(p.org_id, (memberCountByOrg.get(p.org_id) || 0) + 1);
    }

    // Get super_admin org IDs to exclude
    const { data: saRoles } = await adminClient.from("user_roles").select("user_id").eq("role", "super_admin");
    const saUserIds = new Set((saRoles || []).map((r: any) => r.user_id));
    const saOrgIds = new Set(
      profiles.filter((p: any) => saUserIds.has(p.id)).map((p: any) => p.org_id).filter(Boolean)
    );

    const orphanOrgs = orgs.filter((o: any) => {
      if (saOrgIds.has(o.id)) return false; // don't delete super admin orgs
      return (memberCountByOrg.get(o.id) || 0) === 0;
    });

    if (dryRun) {
      return new Response(JSON.stringify({
        mode: "dry_run",
        orphan_orgs_to_delete: orphanOrgs.length,
        orgs: orphanOrgs.map((o: any) => ({ id: o.id, name: o.name, created_at: o.created_at })),
        message: "Send { dry_run: false } to actually delete these orgs",
      }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Actually delete
    let deleted = 0;
    const errors: string[] = [];
    for (const org of orphanOrgs) {
      try {
        await adminClient.from("wallets").delete().eq("org_id", org.id);
        await adminClient.from("usage_tracking").delete().eq("org_id", org.id);
        const { error } = await adminClient.from("organizations").delete().eq("id", org.id);
        if (error) throw error;
        deleted++;
      } catch (e: any) {
        errors.push(`${org.name}: ${e.message}`);
      }
    }

    return new Response(JSON.stringify({
      mode: "execute",
      deleted,
      failed: errors.length,
      errors,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
