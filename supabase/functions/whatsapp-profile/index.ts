import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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
      return json({ error: "Unauthorized" }, 401);
    }

    const authClient = createClient(
      Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: requesterProfile, error: authError } = await authClient
      .from("profiles")
      .select("id, org_id")
      .limit(1)
      .maybeSingle();

    if (authError || !requesterProfile?.id) {
      console.error("whatsapp-profile: Auth failed", authError?.message);
      return json({ error: "Unauthorized" }, 401);
    }
    console.log("whatsapp-profile: user", requesterProfile.id, "action requested");

    const body = await req.json();
    const { action, config_id } = body;

    if (!config_id) return json({ error: "config_id required" }, 400);

    console.log("whatsapp-profile: config_id=", config_id, "action=", action);

    // Get config
    const { data: config, error: cfgErr } = await supabase
      .from("whatsapp_config")
      .select("*")
      .eq("id", config_id)
      .maybeSingle();

    if (cfgErr || !config) {
      console.error("whatsapp-profile: Config not found", cfgErr?.message, "config_id=", config_id);
      return json({ error: "Config not found" }, 404);
    }
    console.log("whatsapp-profile: config found, channel_type=", config.channel_type, "phone_id=", config.phone_number_id);

    // Verify user belongs to same org
    const isSuperAdmin = await supabase.rpc("has_role", { _user_id: requesterProfile.id, _role: "super_admin" });
    if (!isSuperAdmin.data && requesterProfile.org_id !== config.org_id) {
      return json({ error: "Forbidden" }, 403);
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
    return json({ error: (e as Error).message, stack: (e as Error).stack }, 500);
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
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) }
    );
    const data = await res.json();
    console.log("whatsapp-profile META get response:", JSON.stringify(data).slice(0, 500));
    if (data.error) return json({ error: data.error.message }, 400);

    const profile = data.data?.[0] || {};
    return json({
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
    });
  }

  if (action === "update") {
    const { profile_data } = body;
    if (!profile_data) return json({ error: "profile_data required" }, 400);

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
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json();
    if (data.error) return json({ error: data.error.message }, 400);

    return json({ success: true });
  }

  if (action === "update_photo") {
    const { photo_url } = body;
    if (!photo_url) return json({ error: "photo_url required" }, 400);

    // First get upload handle
    const handleRes = await fetch(
      `https://graph.facebook.com/v21.0/${phoneId}/whatsapp_business_profile`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ messaging_product: "whatsapp", profile_picture_url: photo_url }),
      }
    );
    const handleData = await handleRes.json();
    if (handleData.error) return json({ error: handleData.error.message }, 400);

    return json({ success: true });
  }

  return json({ error: "Invalid action" }, 400);
}

async function handleEvolutionProfile(config: any, action: string, body: any) {
  const apiUrl = Deno.env.get("EVOLUTION_API_URL");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instanceName = config.evolution_instance_name;

  if (!apiUrl || !apiKey || !instanceName) {
    return json({ error: "Evolution API not configured" }, 400);
  }

  const baseUrl = apiUrl.replace(/\/$/, "");

  if (action === "get") {
    const res = await fetch(`${baseUrl}/chat/fetchProfile/${instanceName}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
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

    return json({
      success: true,
      profile,
      channel_type: "evolution",
    });
  }

  if (action === "update") {
    const { profile_data } = body;
    if (!profile_data) return json({ error: "profile_data required" }, 400);

    const results: string[] = [];

    // Update status/about
    if (profile_data.about !== undefined) {
      const res = await fetch(`${baseUrl}/chat/updateProfileStatus/${instanceName}`, {
        method: "PUT",
        headers: { apikey: apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ status: profile_data.about }),
      });
      if (res.ok) results.push("status");
    }

    // Update name
    if (profile_data.name !== undefined) {
      const res = await fetch(`${baseUrl}/chat/updateProfileName/${instanceName}`, {
        method: "PUT",
        headers: { apikey: apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ name: profile_data.name }),
      });
      if (res.ok) results.push("name");
    }

    return json({ success: true, updated: results });
  }

  if (action === "update_photo") {
    const { photo_url } = body;
    if (!photo_url) return json({ error: "photo_url required" }, 400);

    const res = await fetch(`${baseUrl}/chat/updateProfilePicture/${instanceName}`, {
      method: "PUT",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ picture: photo_url }),
    });

    if (!res.ok) return json({ error: "Failed to update photo" }, 400);
    return json({ success: true });
  }

  return json({ error: "Invalid action" }, 400);
}
