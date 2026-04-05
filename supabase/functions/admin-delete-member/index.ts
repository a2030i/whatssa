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

    const { user_id } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Prevent self-deletion
    if (user_id === caller.id) {
      return new Response(JSON.stringify({ error: "لا يمكنك حذف نفسك" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify target user belongs to same org
    const { data: targetProfile } = await adminClient.from("profiles").select("org_id").eq("id", user_id).maybeSingle();
    if (!targetProfile || targetProfile.org_id !== callerProfile.org_id) {
      return new Response(JSON.stringify({ error: "User not found in your organization" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check if target is an admin — if so, ensure at least 1 admin remains
    const { data: targetRole } = await adminClient.from("user_roles").select("role").eq("user_id", user_id).eq("role", "admin").maybeSingle();
    if (targetRole) {
      // Count how many admins in this org
      const { data: orgProfiles } = await adminClient.from("profiles").select("id").eq("org_id", callerProfile.org_id);
      const orgUserIds = (orgProfiles || []).map((p: any) => p.id);
      const { data: adminRoles } = await adminClient.from("user_roles").select("user_id").eq("role", "admin").in("user_id", orgUserIds);
      if ((adminRoles || []).length <= 1) {
        return new Response(JSON.stringify({ error: "لا يمكن حذف آخر مدير في المؤسسة — يجب وجود مدير واحد على الأقل" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Delete user roles
    await adminClient.from("user_roles").delete().eq("user_id", user_id);

    // Unassign conversations
    await adminClient.from("conversations").update({ assigned_to: null, assigned_to_id: null }).eq("assigned_to_id", user_id);

    // Delete profile
    await adminClient.from("profiles").delete().eq("id", user_id);

    // Delete auth user
    try {
      await adminClient.auth.admin.deleteUser(user_id);
    } catch (_e) {
      // User might already be removed from auth
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
