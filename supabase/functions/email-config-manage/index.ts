import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getExternalClient() {
  const url = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
  const key = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

async function getCallerContext(authHeader: string | null) {
  if (!authHeader) {
    console.error("[email-config-manage] No auth header provided");
    return null;
  }

  const admin = getExternalClient();
  const token = authHeader.replace("Bearer ", "");
  const { data: authData, error: authError } = await admin.auth.getUser(token);

  if (authError || !authData.user?.id) {
    console.error("[email-config-manage] Auth validation failed:", authError?.message);
    return null;
  }

  const userId = authData.user.id;
  const [{ data: profile, error: profileError }, { data: rolesData, error: rolesError }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, org_id, team_id, team_ids, is_supervisor")
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId),
  ]);

  if (profileError) {
    console.error("[email-config-manage] Profile query error:", profileError.message, profileError.code);
    return null;
  }

  if (rolesError) {
    console.error("[email-config-manage] Role query error:", rolesError.message, rolesError.code);
    return null;
  }

  if (!profile?.org_id) {
    console.error("[email-config-manage] No profile/org_id found");
    return null;
  }

  const roles = (rolesData || []).map((row: { role: string }) => row.role);
  const teamIds = Array.from(new Set([
    profile.team_id,
    ...(Array.isArray(profile.team_ids) ? profile.team_ids : []),
  ].filter(Boolean)));

  console.log("[email-config-manage] Resolved caller context for org:", profile.org_id);

  return {
    userId,
    orgId: profile.org_id,
    isSuperAdmin: roles.includes("super_admin"),
    isAdmin: roles.includes("super_admin") || roles.includes("admin"),
    teamIds,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const caller = await getCallerContext(authHeader);
    if (!caller?.orgId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = getExternalClient();
    const rawBody = await req.json();
    const { action, org_id: overrideOrgId, ...body } = rawBody;

    // Allow super_admin to override org_id for impersonation
    let orgId = caller.orgId;
    if (overrideOrgId && overrideOrgId !== caller.orgId) {
      if (caller.isSuperAdmin) {
        orgId = overrideOrgId;
        console.log("[email-config-manage] super_admin impersonation, using org_id:", orgId);
      }
    }
    console.log("[email-config-manage] action:", action, "orgId:", orgId);

    // LIST
    if (action === "list") {
      let query = admin
        .from("email_configs")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (!caller.isAdmin && orgId === caller.orgId) {
        const conditions = [
          `dedicated_agent_id.eq.${caller.userId}`,
          ...caller.teamIds.map((teamId: string) => `dedicated_team_id.eq.${teamId}`),
        ];

        if (conditions.length === 0) {
          return new Response(JSON.stringify({ data: [] }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        query = query.or(conditions.join(","));
      }

      const { data, error } = await query;
      if (error) throw error;
      return new Response(JSON.stringify({ data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CREATE
    if (action === "create") {
      console.log("[email-config-manage] creating with payload:", JSON.stringify(body.payload));
      const { data, error } = await admin
        .from("email_configs")
        .insert({ ...body.payload, org_id: orgId })
        .select();
      console.log("[email-config-manage] create result:", JSON.stringify({ data, error }));
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // UPDATE
    if (action === "update") {
      const { error } = await admin
        .from("email_configs")
        .update(body.payload)
        .eq("id", body.id)
        .eq("org_id", orgId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE
    if (action === "delete") {
      const { error } = await admin
        .from("email_configs")
        .delete()
        .eq("id", body.id)
        .eq("org_id", orgId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[email-config-manage] ERROR:", e.message, e.details || "", e.hint || "");
    return new Response(JSON.stringify({ error: e.message, details: e.details, hint: e.hint }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
