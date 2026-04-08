import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("whatsapp-profile: No auth header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      console.error("whatsapp-profile: Auth failed", authError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    console.log("whatsapp-profile: user", user.id, "action requested");

    const body = await req.json();
    const { action, config_id } = body;

    if (!config_id) return new Response(JSON.stringify({ error: "config_id required" }), { status: 400, headers: corsHeaders });

    console.log("whatsapp-profile: config_id=", config_id, "action=", action);

    // Get config
    const { data: config, error: cfgErr } = await supabase
      .from("whatsapp_config")
      .select("*")
      .eq("id", config_id)
      .maybeSingle();

    if (cfgErr || !config) {
      console.error("whatsapp-profile: Config not found", cfgErr?.message, "config_id=", config_id);
      return new Response(JSON.stringify({ error: "Config not found" }), { status: 404, headers: corsHeaders });
    }
    console.log("whatsapp-profile: config found, channel_type=", config.channel_type, "phone_id=", config.phone_number_id);

    // Verify user belongs to same org
    const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    const isSuperAdmin = await supabase.rpc("has_role", { _user_id: user.id, _role: "super_admin" });
    if (!isSuperAdmin.data && profile?.org_id !== config.org_id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const channelType = config.channel_type || "meta_api";

    if (channelType === "meta_api") {
      return await handleMetaProfile(config, action, body);
    } else if (channelType === "evolution") {
      return await handleEvolutionProfile(config, action, body);
    }

    return new Response(JSON.stringify({ error: "Unsupported channel type" }), { status: 400, headers: corsHeaders });
  } catch (e) {
    console.error("whatsapp-profile error:", e);
    return new Response(JSON.stringify({ error: e.message, stack: e.stack }), { status: 500, headers: corsHeaders });
  }
});

async function handleMetaProfile(config: any, action: string, body: any) {
  const token = config.access_token;
  const phoneId = config.phone_number_id;

  if (action === "get") {
    // Get business profile
    const fields = "about,address,description,email,profile_picture_url,websites,vertical";
    console.log("whatsapp-profile META get: phoneId=", phoneId, "token length=", token?.length);
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneId}/whatsapp_business_profile?fields=${fields}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    console.log("whatsapp-profile META get response:", JSON.stringify(data).slice(0, 500));
    if (data.error) return new Response(JSON.stringify({ error: data.error.message }), { status: 400, headers: corsHeaders });

    const profile = data.data?.[0] || {};
    return new Response(JSON.stringify({
      success: true,
      profile: {
        about: profile.about || "",
        address: profile.address || "",
        description: profile.description || "",
        email: profile.email || "",
        profile_picture_url: profile.profile_picture_url || "",
        websites: profile.websites || [],
        vertical: profile.vertical || "",
      },
      channel_type: "meta_api",
    }), { headers: corsHeaders });
  }

  if (action === "update") {
    const { profile_data } = body;
    if (!profile_data) return new Response(JSON.stringify({ error: "profile_data required" }), { status: 400, headers: corsHeaders });

    // Build payload - only include non-empty fields
    const payload: Record<string, any> = { messaging_product: "whatsapp" };
    if (profile_data.about !== undefined) payload.about = profile_data.about.slice(0, 139);
    if (profile_data.address !== undefined) payload.address = profile_data.address;
    if (profile_data.description !== undefined) payload.description = profile_data.description.slice(0, 512);
    if (profile_data.email !== undefined) payload.email = profile_data.email;
    if (profile_data.websites !== undefined) payload.websites = (profile_data.websites || []).slice(0, 2);
    if (profile_data.vertical !== undefined) payload.vertical = profile_data.vertical;

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneId}/whatsapp_business_profile`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json();
    if (data.error) return new Response(JSON.stringify({ error: data.error.message }), { status: 400, headers: corsHeaders });

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  }

  if (action === "update_photo") {
    const { photo_url } = body;
    if (!photo_url) return new Response(JSON.stringify({ error: "photo_url required" }), { status: 400, headers: corsHeaders });

    // First get upload handle
    const handleRes = await fetch(
      `https://graph.facebook.com/v21.0/${phoneId}/whatsapp_business_profile`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", profile_picture_url: photo_url }),
      }
    );
    const handleData = await handleRes.json();
    if (handleData.error) return new Response(JSON.stringify({ error: handleData.error.message }), { status: 400, headers: corsHeaders });

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  }

  return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: corsHeaders });
}

async function handleEvolutionProfile(config: any, action: string, body: any) {
  const apiUrl = Deno.env.get("EVOLUTION_API_URL");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instanceName = config.evolution_instance_name;

  if (!apiUrl || !apiKey || !instanceName) {
    return new Response(JSON.stringify({ error: "Evolution API not configured" }), { status: 400, headers: corsHeaders });
  }

  const baseUrl = apiUrl.replace(/\/$/, "");

  if (action === "get") {
    const res = await fetch(`${baseUrl}/chat/fetchProfile/${instanceName}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number: config.display_phone?.replace(/\D/g, "") || "" }),
    });

    let profile: any = {};
    try {
      const data = await res.json();
      profile = {
        about: data?.status || data?.about || "",
        profile_picture_url: data?.picture || data?.profilePictureUrl || "",
        name: data?.name || data?.pushName || "",
      };
    } catch { /* empty */ }

    return new Response(JSON.stringify({
      success: true,
      profile,
      channel_type: "evolution",
    }), { headers: corsHeaders });
  }

  if (action === "update") {
    const { profile_data } = body;
    if (!profile_data) return new Response(JSON.stringify({ error: "profile_data required" }), { status: 400, headers: corsHeaders });

    const results: string[] = [];

    // Update status/about
    if (profile_data.about !== undefined) {
      const res = await fetch(`${baseUrl}/chat/updateProfileStatus/${instanceName}`, {
        method: "PUT",
        headers: { apikey: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ status: profile_data.about }),
      });
      if (res.ok) results.push("status");
    }

    // Update name
    if (profile_data.name !== undefined) {
      const res = await fetch(`${baseUrl}/chat/updateProfileName/${instanceName}`, {
        method: "PUT",
        headers: { apikey: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ name: profile_data.name }),
      });
      if (res.ok) results.push("name");
    }

    return new Response(JSON.stringify({ success: true, updated: results }), { headers: corsHeaders });
  }

  if (action === "update_photo") {
    const { photo_url } = body;
    if (!photo_url) return new Response(JSON.stringify({ error: "photo_url required" }), { status: 400, headers: corsHeaders });

    const res = await fetch(`${baseUrl}/chat/updateProfilePicture/${instanceName}`, {
      method: "PUT",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ picture: photo_url }),
    });

    if (!res.ok) return new Response(JSON.stringify({ error: "Failed to update photo" }), { status: 400, headers: corsHeaders });
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  }

  return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: corsHeaders });
}
