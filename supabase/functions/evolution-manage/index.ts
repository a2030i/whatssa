import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return json({ error: "Unauthorized" }, 401);

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.org_id) return json({ error: "لا توجد مؤسسة مرتبطة" }, 400);

    const EVOLUTION_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY");

    if (!EVOLUTION_URL || !EVOLUTION_KEY) {
      return json({ error: "إعدادات Evolution API غير مكتملة" }, 500);
    }

    const { action, instance_name } = await req.json();
    const instanceName = instance_name || `org_${profile.org_id.replace(/-/g, "").slice(0, 12)}`;

    const evoHeaders = {
      "Content-Type": "application/json",
      apikey: EVOLUTION_KEY,
    };

    const webhookUrl = `${SUPABASE_URL}/functions/v1/evolution-webhook`;

    // ── CREATE INSTANCE ──
    if (action === "create") {
      const createRes = await fetch(`${EVOLUTION_URL}/instance/create`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({
          instanceName,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
          webhook: {
            url: webhookUrl,
            byEvents: true,
            webhookBase64: false,
            events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
          },
        }),
      });

      const createData = await createRes.json();

      if (!createRes.ok && !createData?.instance) {
        // Instance might already exist, try to connect instead
        if (createData?.message?.includes?.("already") || createData?.error?.includes?.("already")) {
          // Instance exists, just get QR
          const connectRes = await fetch(`${EVOLUTION_URL}/instance/connect/${instanceName}`, {
            headers: evoHeaders,
          });
          const connectData = await connectRes.json();

          // Save/update config
          await upsertConfig(adminClient, profile.org_id, instanceName);

          return json({
            success: true,
            instance_name: instanceName,
            qr_code: connectData.base64 || connectData.qrcode?.base64 || null,
            status: connectData.instance?.state || "connecting",
            already_existed: true,
          });
        }
        return json({ error: createData?.message || "فشل إنشاء الجلسة" }, 400);
      }

      // Save config
      await upsertConfig(adminClient, profile.org_id, instanceName);

      // Get QR code
      const qr = createData?.qrcode?.base64 || createData?.base64 || null;

      return json({
        success: true,
        instance_name: instanceName,
        qr_code: qr,
        status: "created",
      });
    }

    // ── GET QR CODE ──
    if (action === "connect" || action === "qr") {
      // Check current state first
      const stateRes = await fetch(`${EVOLUTION_URL}/instance/connectionState/${instanceName}`, {
        headers: evoHeaders,
      });
      const stateText = await stateRes.text();
      console.log("State check:", stateText);
      let stateData: any;
      try { stateData = JSON.parse(stateText); } catch { stateData = {}; }
      const currentState = stateData.instance?.state || stateData.state || "unknown";

      if (currentState === "open") {
        return json({ success: true, qr_code: null, status: "open" });
      }

      // If instance is in 'close' state, delete and recreate to get fresh QR
      console.log("Instance state:", currentState, "- deleting and recreating for fresh QR...");
      
      // Delete existing instance
      try {
        await fetch(`${EVOLUTION_URL}/instance/delete/${instanceName}`, {
          method: "DELETE",
          headers: evoHeaders,
        });
        console.log("Deleted old instance");
      } catch (e) {
        console.log("Delete failed (ok):", e);
      }

      // Wait briefly
      await new Promise(r => setTimeout(r, 1500));

      // Recreate with QR
      const createRes = await fetch(`${EVOLUTION_URL}/instance/create`, {
        method: "POST",
        headers: evoHeaders,
        body: JSON.stringify({
          instanceName,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
          webhook: {
            url: webhookUrl,
            byEvents: true,
            webhookBase64: false,
            events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
          },
        }),
      });

      const createText = await createRes.text();
      console.log("Recreate response:", createText);
      
      let createData: any;
      try { createData = JSON.parse(createText); } catch { createData = {}; }

      // Update config
      await upsertConfig(adminClient, profile.org_id, instanceName);

      // QR may not be available immediately - poll connect endpoint
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise(r => setTimeout(r, 2000));
        console.log(`QR poll attempt ${attempt + 1}...`);
        
        const connectRes = await fetch(`${EVOLUTION_URL}/instance/connect/${instanceName}`, {
          headers: evoHeaders,
        });
        const connectText = await connectRes.text();
        console.log(`Connect attempt ${attempt + 1}:`, connectText.substring(0, 200));
        
        let connectData: any;
        try { connectData = JSON.parse(connectText); } catch { connectData = {}; }
        
        const qr = connectData.base64 || connectData.qrcode?.base64 || connectData.code || null;
        
        if (qr) {
          console.log("QR found on attempt", attempt + 1);
          return json({ success: true, qr_code: qr, status: "qr_ready" });
        }
        
        // Check if qrcode object has pairingCode
        if (connectData.pairingCode) {
          return json({ success: true, qr_code: null, pairing_code: connectData.pairingCode, status: "pairing" });
        }
      }
      
      return json({
        success: true,
        qr_code: null,
        status: "qr_timeout",
        message: "لم يتم توليد QR بعد. حاول مرة أخرى بعد ثوانٍ."
      });
    }

    // ── CHECK STATUS ──
    if (action === "status") {
      const res = await fetch(`${EVOLUTION_URL}/instance/connectionState/${instanceName}`, {
        headers: evoHeaders,
      });
      const data = await res.json();
      const state = data.instance?.state || data.state || "unknown";

      // Sync status to DB
      if (state === "open") {
        await adminClient
          .from("whatsapp_config")
          .update({
            evolution_instance_status: "connected",
            is_connected: true,
            registration_status: "connected",
          })
          .eq("evolution_instance_name", instanceName)
          .eq("org_id", profile.org_id);
      }

      return json({
        success: true,
        status: state,
        instance_name: instanceName,
      });
    }

    // ── DELETE INSTANCE ──
    if (action === "delete") {
      await fetch(`${EVOLUTION_URL}/instance/delete/${instanceName}`, {
        method: "DELETE",
        headers: evoHeaders,
      });

      await adminClient
        .from("whatsapp_config")
        .delete()
        .eq("evolution_instance_name", instanceName)
        .eq("org_id", profile.org_id);

      return json({ success: true, deleted: instanceName });
    }

    // ── LOGOUT ──
    if (action === "logout") {
      await fetch(`${EVOLUTION_URL}/instance/logout/${instanceName}`, {
        method: "DELETE",
        headers: evoHeaders,
      });

      await adminClient
        .from("whatsapp_config")
        .update({
          evolution_instance_status: "disconnected",
          is_connected: false,
          registration_status: "pending",
        })
        .eq("evolution_instance_name", instanceName)
        .eq("org_id", profile.org_id);

      return json({ success: true, logged_out: instanceName });
    }

    return json({ error: "إجراء غير معروف" }, 400);
  } catch (err: any) {
    console.error("Evolution manage error:", err);
    return json({ error: err.message }, 500);
  }
});

async function upsertConfig(adminClient: any, orgId: string, instanceName: string) {
  // Check if config exists
  const { data: existing } = await adminClient
    .from("whatsapp_config")
    .select("id")
    .eq("org_id", orgId)
    .eq("channel_type", "evolution")
    .maybeSingle();

  if (existing) {
    await adminClient
      .from("whatsapp_config")
      .update({
        evolution_instance_name: instanceName,
        evolution_instance_status: "connecting",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await adminClient.from("whatsapp_config").insert({
      org_id: orgId,
      channel_type: "evolution",
      evolution_instance_name: instanceName,
      evolution_instance_status: "connecting",
      phone_number_id: `evo_${instanceName}`,
      business_account_id: `evo_${instanceName}`,
      access_token: "evolution",
      is_connected: false,
      registration_status: "pending",
    });
  }
}
