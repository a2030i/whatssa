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

    // Caller must be admin or super_admin
    const { data: callerRole } = await adminClient.from("user_roles").select("role").eq("user_id", caller.id).in("role", ["admin", "super_admin"]).maybeSingle();
    if (!callerRole) {
      return new Response(JSON.stringify({ error: "Forbidden — admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { user_id, new_password } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify target user is in same org (unless super_admin)
    if (callerRole.role !== "super_admin") {
      const { data: callerProfile } = await adminClient.from("profiles").select("org_id").eq("id", caller.id).maybeSingle();
      const { data: targetProfile } = await adminClient.from("profiles").select("org_id").eq("id", user_id).maybeSingle();
      if (!callerProfile?.org_id || callerProfile.org_id !== targetProfile?.org_id) {
        return new Response(JSON.stringify({ error: "Cannot reset password for user outside your organization" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (new_password) {
      // Direct password reset
      const { error: updateError } = await adminClient.auth.admin.updateUser(user_id, {
        password: new_password,
        user_metadata: { must_change_password: true },
      });
      if (updateError) throw updateError;

      return new Response(JSON.stringify({
        success: true,
        method: "direct",
        temp_password: new_password,
        message: "تم تعيين كلمة مرور مؤقتة — سيُطلب من الموظف تغييرها عند الدخول",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else {
      // Get user email and generate recovery link
      const { data: { user: targetUser }, error: getUserErr } = await adminClient.auth.admin.getUserById(user_id);
      if (getUserErr || !targetUser?.email) {
        return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email: targetUser.email,
      });
      if (linkErr) throw linkErr;

      return new Response(JSON.stringify({
        success: true,
        method: "recovery_link",
        recovery_link: linkData?.properties?.action_link || null,
        email: targetUser.email,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});