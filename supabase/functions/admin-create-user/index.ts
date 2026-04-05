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

    const body = await req.json();

    // Handle email update action (allowed for org admins)
    if (body.action === "update_email") {
      const { user_id, new_email } = body;
      if (!user_id || !new_email) {
        return new Response(JSON.stringify({ error: "Missing user_id or new_email" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Verify caller is admin or super_admin
      const { data: callerRole } = await adminClient.from("user_roles").select("role").eq("user_id", caller.id).in("role", ["admin", "super_admin"]).maybeSingle();
      if (!callerRole) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // If not super_admin, verify target user is in the same org
      if (callerRole.role !== "super_admin") {
        const { data: callerProfile } = await adminClient.from("profiles").select("org_id").eq("id", caller.id).maybeSingle();
        const { data: targetProfile } = await adminClient.from("profiles").select("org_id").eq("id", user_id).maybeSingle();
        if (!callerProfile?.org_id || callerProfile.org_id !== targetProfile?.org_id) {
          return new Response(JSON.stringify({ error: "Cannot modify users outside your organization" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      const { error: updateError } = await adminClient.auth.admin.updateUserById(user_id, { email: new_email });
      if (updateError) throw updateError;

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Original create user flow — super_admin only
    const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", caller.id).eq("role", "super_admin").maybeSingle();
    if (!roleData) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { email, full_name, org_name } = body;
    if (!email || !full_name) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: corsHeaders });
    }

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) throw createError;

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${supabaseUrl.replace('.supabase.co', '.lovable.app')}/auth` },
    });

    if (newUser.user && org_name) {
      const { data: profile } = await adminClient.from("profiles").select("org_id").eq("id", newUser.user.id).maybeSingle();
      if (profile?.org_id) {
        await adminClient.from("organizations").update({ name: org_name }).eq("id", profile.org_id);
      }
    }

    return new Response(JSON.stringify({ success: true, user_id: newUser.user?.id, invite_sent: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
