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

    // Caller must be admin
    const { data: callerRole } = await adminClient.from("user_roles").select("role").eq("user_id", caller.id).in("role", ["admin", "super_admin"]).maybeSingle();
    if (!callerRole) {
      return new Response(JSON.stringify({ error: "Forbidden — admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get caller org
    const { data: callerProfile } = await adminClient.from("profiles").select("org_id").eq("id", caller.id).maybeSingle();
    if (!callerProfile?.org_id) {
      return new Response(JSON.stringify({ error: "No org found" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { email, full_name, team_id, team_ids, role } = await req.json();
    if (!email || !full_name) {
      return new Response(JSON.stringify({ error: "email and full_name required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Resolve team — support both single team_id and team_ids array
    const resolvedTeamIds: string[] = team_ids || (team_id ? [team_id] : []);
    // Use first team as primary team_id on profile
    const primaryTeamId = resolvedTeamIds.length > 0 ? resolvedTeamIds[0] : null;

    // Create user with simple temp password
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const tempPassword = pin + pin; // e.g. "37423742"
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name, must_change_password: true },
    });

    if (createError) {
      if (createError.message?.includes("already been registered")) {
        return new Response(JSON.stringify({ error: "هذا البريد مسجل مسبقاً في منظمة أخرى. يجب استخدام بريد إلكتروني مختلف لكل منظمة." }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw createError;
    }

    const userId = newUser.user!.id;

    // The handle_new_user trigger may have auto-created a phantom org for this user.
    // We need to: 1) find the phantom org, 2) reassign profile to caller's org, 3) delete phantom org.
    const { data: autoProfile } = await adminClient.from("profiles").select("org_id").eq("id", userId).maybeSingle();
    const phantomOrgId = autoProfile?.org_id;

    // Update profile to caller's org
    const isSupervisor = role === "supervisor";
    const profileUpdate: Record<string, any> = {
      org_id: callerProfile.org_id,
      full_name,
      team_id: primaryTeamId,
      team_ids: resolvedTeamIds,
      is_active: true,
      is_supervisor: isSupervisor,
    };
    const { error: profErr } = await adminClient.from("profiles").update(profileUpdate).eq("id", userId);
    if (profErr && profErr.message?.includes("team_ids")) {
      delete profileUpdate.team_ids;
      await adminClient.from("profiles").update(profileUpdate).eq("id", userId);
    }

    // Delete phantom org if it was auto-created and is different from caller's org
    if (phantomOrgId && phantomOrgId !== callerProfile.org_id) {
      // Verify it's truly empty (no other members)
      const { count } = await adminClient.from("profiles").select("id", { count: "exact", head: true }).eq("org_id", phantomOrgId);
      if ((count || 0) === 0) {
        // Safe to delete — no members left
        await adminClient.from("wallets").delete().eq("org_id", phantomOrgId);
        await adminClient.from("usage_tracking").delete().eq("org_id", phantomOrgId);
        await adminClient.from("organizations").delete().eq("id", phantomOrgId);
      }
    }

    // Normalize roles — remove any auto-created admin/member role from signup trigger, then set the intended one only
    const dbRole = role === "admin" ? "admin" : "member";
    await adminClient.from("user_roles").delete().eq("user_id", userId).in("role", ["admin", "member"]);
    await adminClient.from("user_roles").insert({ user_id: userId, role: dbRole });

    // If multiple teams, insert into team_members junction table if it exists,
    // otherwise we just use primary team_id
    // Additional teams already saved via team_ids array above

    return new Response(JSON.stringify({
      success: true,
      user_id: userId,
      email,
      temp_password: tempPassword,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
