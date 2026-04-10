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

    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const token = authHeader.replace("Bearer ", "");
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: { user: caller }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .in("role", ["admin", "super_admin"])
      .maybeSingle();

    if (!callerRole) {
      return new Response(JSON.stringify({ error: "Forbidden — admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("org_id")
      .eq("id", caller.id)
      .maybeSingle();

    if (!callerProfile?.org_id) {
      return new Response(JSON.stringify({ error: "No org found" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: profiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("id, full_name, is_supervisor")
      .eq("org_id", callerProfile.org_id);

    if (profilesError) throw profilesError;

    const userIds = (profiles || []).map((profile) => profile.id);
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ success: true, repaired: 0, repaired_users: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleRows, error: rolesError } = await adminClient
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds)
      .in("role", ["super_admin", "admin", "member"]);

    if (rolesError) throw rolesError;

    const roleMap = new Map<string, string[]>();
    for (const row of roleRows || []) {
      const current = roleMap.get(row.user_id) || [];
      current.push(row.role);
      roleMap.set(row.user_id, current);
    }

    const usersToRepair = (profiles || []).filter((profile) => {
      const currentRoles = roleMap.get(profile.id) || [];
      return currentRoles.includes("admin") && currentRoles.includes("member") && !currentRoles.includes("super_admin");
    });

    await Promise.all(
      usersToRepair.map((profile) =>
        adminClient.from("user_roles").delete().eq("user_id", profile.id).eq("role", "admin")
      )
    );

    return new Response(JSON.stringify({
      success: true,
      repaired: usersToRepair.length,
      repaired_users: usersToRepair.map((profile) => ({
        id: profile.id,
        full_name: profile.full_name,
        role: profile.is_supervisor ? "supervisor" : "member",
      })),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});