import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ─────────────────────────────────────────────
// Evolution Health Check
// Periodically checks Evolution API instance status
// Auto-reconnects if disconnected and notifies admin
// ─────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Primary DB (external if configured, otherwise Cloud)
  const supabase = createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Cloud DB (always write here too so UI stays in sync)
  const cloudDb = Deno.env.get("EXTERNAL_SUPABASE_URL")
    ? createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
    : null;

  const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
  const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return new Response(JSON.stringify({ error: "Evolution API not configured" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Get ALL Evolution channels (including disconnected/refused for recovery)
    const { data: channels } = await supabase
      .from("whatsapp_config")
      .select("id, org_id, evolution_instance_name, display_phone, is_connected, business_name")
      .eq("channel_type", "evolution");

    if (!channels || channels.length === 0) {
      return new Response(JSON.stringify({ checked: 0, message: "No Evolution channels" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const channel of channels) {
      const instanceName = channel.evolution_instance_name;
      if (!instanceName) continue;

      try {
        // Check instance connection status
        const statusRes = await fetch(
          `${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`,
          {
            headers: {
              apikey: EVOLUTION_API_KEY,
              "Content-Type": "application/json",
            },
          }
        );

        const statusData = await statusRes.json();
        const state = statusData?.instance?.state || statusData?.state || "unknown";
        const isConnected = state === "open" || state === "connected";

        if (!isConnected) {
          console.log(`[evolution-health] Instance ${instanceName} disconnected (state: ${state}). Attempting reconnect...`);

          // Try to restart the instance
          try {
            await fetch(`${EVOLUTION_API_URL}/instance/restart/${instanceName}`, {
              method: "PUT",
              headers: {
                apikey: EVOLUTION_API_KEY,
                "Content-Type": "application/json",
              },
            });
            console.log(`[evolution-health] Restart requested for ${instanceName}`);
          } catch (restartErr) {
            console.error(`[evolution-health] Restart failed for ${instanceName}:`, restartErr);
          }

          // Update DB status (primary + Cloud)
          const disconnectUpdate = {
            is_connected: false,
            registration_status: "disconnected",
            registration_error: `انقطع الاتصال — الحالة: ${state}. تمت محاولة إعادة الاتصال تلقائياً.`,
          };
          await supabase.from("whatsapp_config").update(disconnectUpdate).eq("id", channel.id);
          if (cloudDb) await cloudDb.from("whatsapp_config").update(disconnectUpdate).eq("id", channel.id);

          // Notify org admins
          const { data: admins } = await supabase
            .from("profiles")
            .select("id")
            .eq("org_id", channel.org_id)
            .eq("is_active", true);

          if (admins) {
            const { data: adminRoles } = await supabase
              .from("user_roles")
              .select("user_id")
              .in("user_id", admins.map(a => a.id))
              .eq("role", "admin");

            if (adminRoles) {
              for (const admin of adminRoles) {
                await supabase.from("notifications").insert({
                  org_id: channel.org_id,
                  user_id: admin.user_id,
                  type: "alert",
                  title: "⚠️ انقطاع اتصال واتساب",
                  body: `الرقم ${channel.display_phone || instanceName} انقطع اتصاله. تمت محاولة إعادة الاتصال تلقائياً — تحقق من صفحة التكامل.`,
                  reference_type: "whatsapp_config",
                  reference_id: channel.id,
                });
              }
            }
          }

          // Log to activity
          await supabase.from("activity_logs").insert({
            org_id: channel.org_id,
            action: "evolution_disconnected",
            actor_type: "system",
            target_type: "whatsapp_config",
            target_id: channel.id,
            metadata: { instance: instanceName, state, auto_restart: true },
          });

          results.push({ instance: instanceName, status: "disconnected", action: "restart_requested" });
        } else {
          // Instance is healthy — skip DB write if already connected (reduces IO)
          if (!channel.is_connected) {
            const connectUpdate = {
              is_connected: true,
              registration_status: "connected",
              registration_error: null,
            };
            await supabase.from("whatsapp_config").update(connectUpdate).eq("id", channel.id);
            if (cloudDb) await cloudDb.from("whatsapp_config").update(connectUpdate).eq("id", channel.id);
          }

          results.push({ instance: instanceName, status: "connected" });
        }
      } catch (err: any) {
        console.error(`[evolution-health] Error checking ${instanceName}:`, err);
        results.push({ instance: instanceName, status: "error", error: err.message });
      }

      // Small delay between checks to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    const disconnected = results.filter(r => r.status === "disconnected").length;
    console.log(`[evolution-health] Checked ${results.length} instances. ${disconnected} disconnected.`);

    return new Response(JSON.stringify({
      checked: results.length,
      disconnected,
      results,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error(`[evolution-health] Error:`, err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
