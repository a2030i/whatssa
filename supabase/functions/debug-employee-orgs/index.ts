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
    const names: string[] = body.names || [];

    // Fetch all data
    const [orgsRes, profilesRes, rolesRes] = await Promise.all([
      adminClient.from("organizations").select("id, name, created_at").order("created_at", { ascending: false }).limit(1000),
      adminClient.from("profiles").select("id, full_name, org_id, created_at").limit(1000),
      adminClient.from("user_roles").select("user_id, role").limit(2000),
    ]);

    if (orgsRes.error) throw orgsRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (rolesRes.error) throw rolesRes.error;

    const orgs = orgsRes.data || [];
    const profiles = profilesRes.data || [];
    const roleRows = rolesRes.data || [];

    // Build maps
    const roleMap = new Map<string, string[]>();
    for (const row of roleRows) {
      const current = roleMap.get(row.user_id) || [];
      current.push(row.role);
      roleMap.set(row.user_id, current);
    }

    const memberCountByOrg = new Map<string, number>();
    for (const p of profiles) {
      if (!p.org_id) continue;
      memberCountByOrg.set(p.org_id, (memberCountByOrg.get(p.org_id) || 0) + 1);
    }

    const orgMap = new Map(orgs.map((o: any) => [o.id, o]));

    // Get auth users
    const allUsers: any[] = [];
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const users = data?.users || [];
      allUsers.push(...users);
      if (users.length < 200) break;
    }
    const userMap = new Map(allUsers.map((u: any) => [u.id, u]));

    // Find orphan orgs that match "Name - Organization" pattern
    const orphanOrgs = orgs.filter((o: any) => (memberCountByOrg.get(o.id) || 0) === 0);

    const results = orphanOrgs.map((org: any) => {
      const baseName = (org.name || "").replace(/\s*-\s*Organization\s*$/i, "").trim();
      const normalizedBase = baseName.toLowerCase();

      // Find profiles with matching name
      const matchingProfiles = profiles
        .filter((p: any) => (p.full_name || "").toLowerCase().trim() === normalizedBase)
        .map((p: any) => {
          const authUser = userMap.get(p.id);
          const currentOrg = p.org_id ? orgMap.get(p.org_id) : null;
          return {
            user_id: p.id,
            full_name: p.full_name,
            email: authUser?.email || null,
            current_org_id: p.org_id,
            current_org_name: currentOrg?.name || null,
            current_org_members: p.org_id ? (memberCountByOrg.get(p.org_id) || 0) : 0,
            roles: roleMap.get(p.id) || [],
            must_change_password: authUser?.user_metadata?.must_change_password ?? null,
            auth_created_at: authUser?.created_at || null,
            profile_created_at: p.created_at || null,
          };
        });

      return {
        orphan_org_id: org.id,
        orphan_org_name: org.name,
        orphan_org_created_at: org.created_at,
        base_name: baseName,
        matching_profiles: matchingProfiles,
      };
    });

    // Filter by names if provided
    const targetNames = names.map((n: string) => n.toLowerCase().trim());
    const filtered = targetNames.length > 0
      ? results.filter((r: any) => targetNames.some((t: string) => r.base_name.toLowerCase().includes(t)))
      : results.filter((r: any) => r.matching_profiles.length > 0);

    return new Response(JSON.stringify({
      total_orgs: orgs.length,
      total_orphan_orgs: orphanOrgs.length,
      total_auth_users: allUsers.length,
      total_profiles: profiles.length,
      investigated: filtered,
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
