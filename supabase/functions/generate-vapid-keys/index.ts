import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Convert ArrayBuffer to URL-safe base64
function bufToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const extServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(extUrl, extServiceKey);

    // Verify super_admin
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { data: roleData } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "super_admin").maybeSingle();
    if (!roleData) return new Response(JSON.stringify({ error: "Super admin only" }), { status: 403, headers: corsHeaders });

    // Generate VAPID key pair using Web Crypto (P-256 / ECDSA)
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );

    const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

    const vapidPublicKey = bufToBase64Url(publicKeyRaw);
    const vapidPrivateKey = privateKeyJwk.d!; // Already base64url

    // Store in system_settings
    for (const [key, value] of [
      ["vapid_public_key", vapidPublicKey],
      ["vapid_private_key", vapidPrivateKey],
    ]) {
      const { data: existing } = await admin.from("system_settings").select("key").eq("key", key).maybeSingle();
      if (existing) {
        await admin.from("system_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
      } else {
        await admin.from("system_settings").insert({ key, value, description: `VAPID ${key === "vapid_public_key" ? "Public" : "Private"} Key for Web Push` });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      public_key: vapidPublicKey,
      message: "VAPID keys generated and saved",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
