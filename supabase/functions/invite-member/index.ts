import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
        return new Response(JSON.stringify({ error: "هذا البريد مسجل مسبقاً" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw createError;
    }

    const userId = newUser.user!.id;

    // Update profile
    const isSupervisor = role === "supervisor";
    await adminClient.from("profiles").update({
      org_id: callerProfile.org_id,
      full_name,
      team_id: primaryTeamId,
      is_active: true,
      is_supervisor: isSupervisor,
    }).eq("id", userId);

    // Set role
    if (role === "admin") {
      await adminClient.from("user_roles").upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
    }
    // member and supervisor both use 'member' role in user_roles (supervisor is a profile flag)

    // If multiple teams, insert into team_members junction table if it exists,
    // otherwise we just use primary team_id
    if (resolvedTeamIds.length > 1) {
      // Try adding to additional teams via profile updates or a junction approach
      // For now, store additional teams in profile metadata
      await adminClient.from("profiles").update({
        additional_team_ids: resolvedTeamIds.slice(1),
      }).eq("id", userId);
    }

    // Generate recovery link
    const { data: linkData } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    return new Response(JSON.stringify({
      success: true,
      user_id: userId,
      email,
      recovery_link: linkData?.properties?.action_link || null,
      temp_password: tempPassword,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
