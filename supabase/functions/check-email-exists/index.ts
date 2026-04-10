import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ exists: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Check profiles table for this email — profiles don't have email, so check auth.users
    const { data: { users }, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    
    const found = users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase().trim());

    if (!found) {
      return new Response(JSON.stringify({ exists: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch profile and roles for richer info
    const [profileRes, rolesRes] = await Promise.all([
      adminClient.from("profiles").select("full_name, org_id, is_supervisor, team_id, is_active").eq("id", found.id).maybeSingle(),
      adminClient.from("user_roles").select("role").eq("user_id", found.id),
    ]);

    return new Response(JSON.stringify({
      exists: true,
      user_id: found.id,
      email: found.email,
      profile: profileRes.data || null,
      roles: (rolesRes.data || []).map((r: any) => r.role),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ exists: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
