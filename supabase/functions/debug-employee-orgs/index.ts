import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.24.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  names: z.array(z.string().min(1)).optional().default([]),
  limit: z.number().int().min(1).max(200).optional().default(50),
});

type OrgRow = {
  id: string;
  name: string;
  created_at?: string | null;
};

type ProfileRow = {
  id: string;
  full_name?: string | null;
  org_id?: string | null;
  created_at?: string | null;
};

type RoleRow = {
  user_id: string;
  role: string;
};

const normalize = (value: string | null | undefined) =>
  (value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

const stripOrgSuffix = (value: string | null | undefined) =>
  (value || "").replace(/\s*-\s*organization\s*$/i, "").trim();

const secondsBetween = (a?: string | null, b?: string | null) => {
  if (!a || !b) return null;
  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return Math.round(diff / 1000);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "External database secrets are missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const adminClient = createClient(supabaseUrl, serviceKey);

    const {
      data: { user: caller },
      error: callerError,
    } = await adminClient.auth.getUser(token);

    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .in("role", ["admin", "super_admin"])
      .maybeSingle();

    if (!callerRole) {
      return new Response(JSON.stringify({ error: "Forbidden — admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const parsed = BodySchema.safeParse(rawBody);

    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { names, limit } = parsed.data;
    const targetNames = names.map(normalize).filter(Boolean);

    const [orgsRes, profilesRes, rolesRes] = await Promise.all([
      adminClient.from("organizations").select("id, name, created_at").order("created_at", { ascending: false }).limit(1000),
      adminClient.from("profiles").select("id, full_name, org_id, created_at").limit(1000),
      adminClient.from("user_roles").select("user_id, role").limit(2000),
    ]);

    if (orgsRes.error) throw orgsRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (rolesRes.error) throw rolesRes.error;

    const orgs = (orgsRes.data || []) as OrgRow[];
    const profiles = (profilesRes.data || []) as ProfileRow[];
    const roleRows = (rolesRes.data || []) as RoleRow[];

    const roleMap = new Map<string, string[]>();
    for (const row of roleRows) {
      const current = roleMap.get(row.user_id) || [];
      current.push(row.role);
      roleMap.set(row.user_id, current);
    }

    const memberCountByOrg = new Map<string, number>();
    for (const profile of profiles) {
      if (!profile.org_id) continue;
      memberCountByOrg.set(profile.org_id, (memberCountByOrg.get(profile.org_id) || 0) + 1);
    }

    const orgMap = new Map(orgs.map((org) => [org.id, org]));

    const allUsers: Array<{ id: string; email?: string | null; created_at?: string | null; user_metadata?: Record<string, unknown> | null }> = [];
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const users = data?.users || [];
      allUsers.push(...users.map((user) => ({
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        user_metadata: user.user_metadata || null,
      })));
      if (users.length < 200) break;
    }

    const userMap = new Map(allUsers.map((user) => [user.id, user]));

    const suspiciousOrgs = orgs
      .filter((org) => (memberCountByOrg.get(org.id) || 0) === 0)
      .filter((org) => /\s*-\s*organization\s*$/i.test(org.name));

    const suspiciousWithMatches = suspiciousOrgs.map((org) => {
      const baseName = stripOrgSuffix(org.name);
      const normalizedBaseName = normalize(baseName);
      const matchingProfiles = profiles
        .filter((profile) => normalize(profile.full_name) === normalizedBaseName)
        .map((profile) => {
          const currentOrg = profile.org_id ? orgMap.get(profile.org_id) : null;
          const authUser = userMap.get(profile.id);
          const roles = roleMap.get(profile.id) || [];
          return {
            user_id: profile.id,
            full_name: profile.full_name || null,
            email: authUser?.email || null,
            profile_created_at: profile.created_at || null,
            auth_created_at: authUser?.created_at || null,
            current_org_id: profile.org_id || null,
            current_org_name: currentOrg?.name || null,
            current_roles: roles,
            likely_reassigned_from_phantom_org: !!profile.org_id && profile.org_id !== org.id,
            org_profile_created_diff_seconds: secondsBetween(org.created_at, profile.created_at),
            org_auth_created_diff_seconds: secondsBetween(org.created_at, authUser?.created_at || null),
            must_change_password: authUser?.user_metadata?.must_change_password ?? null,
          };
        });

      return {
        orphan_org_id: org.id,
        orphan_org_name: org.name,
        orphan_org_created_at: org.created_at || null,
        members_count: memberCountByOrg.get(org.id) || 0,
        base_name: baseName,
        matching_profiles_count: matchingProfiles.length,
        matching_profiles: matchingProfiles,
      };
    });

    const filteredResults = targetNames.length > 0
      ? suspiciousWithMatches.filter((item) => targetNames.includes(normalize(item.base_name)))
      : suspiciousWithMatches;

    const summary = {
      suspicious_orphan_orgs_total: suspiciousOrgs.length,
      suspicious_orphan_orgs_with_matching_profiles: suspiciousWithMatches.filter((item) => item.matching_profiles_count > 0).length,
      likely_reassigned_cases: suspiciousWithMatches.filter((item) => item.matching_profiles.some((profile) => profile.likely_reassigned_from_phantom_org)).length,
    };

    return new Response(JSON.stringify({
      summary,
      investigated_names: names,
      results: filteredResults.slice(0, limit),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
