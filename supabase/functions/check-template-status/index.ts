import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STATUS_AR: Record<string, string> = {
  APPROVED: "تمت الموافقة",
  REJECTED: "مرفوض",
  PENDING: "قيد المراجعة",
  PAUSED: "متوقف مؤقتاً",
  DISABLED: "معطّل",
  IN_APPEAL: "قيد الاستئناف",
  PENDING_DELETION: "قيد الحذف",
  DELETED: "محذوف",
  LIMIT_EXCEEDED: "تجاوز الحد",
};

function log(step: string, detail: unknown) {
  console.log(`[check-template-status] [${step}]`, JSON.stringify(detail));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all connected Meta API configs
    const { data: configs, error: configErr } = await supabase
      .from("whatsapp_config")
      .select("id, org_id, business_account_id, access_token")
      .eq("is_connected", true)
      .eq("channel_type", "meta_api");

    if (configErr || !configs?.length) {
      log("no_configs", { error: configErr?.message });
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalNotifications = 0;

    for (const config of configs) {
      try {
        // Fetch templates from Meta
        const res = await fetch(
          `https://graph.facebook.com/v21.0/${config.business_account_id}/message_templates?fields=id,name,status,category,language&limit=250`,
          { headers: { Authorization: `Bearer ${config.access_token}` } }
        );
        const data = await res.json();

        if (!res.ok) {
          log("meta_error", { org_id: config.org_id, error: data?.error?.message });
          continue;
        }

        const templates = data.data || [];
        log("fetched", { org_id: config.org_id, count: templates.length });

        // Get cached statuses
        const { data: cached } = await supabase
          .from("template_status_cache")
          .select("template_meta_id, status, template_name")
          .eq("org_id", config.org_id);

        const cacheMap = new Map(
          (cached || []).map((c: any) => [c.template_meta_id, c])
        );

        // Get admin users for this org (to send notifications)
        const { data: orgAdmins } = await supabase
          .from("profiles")
          .select("id")
          .eq("org_id", config.org_id)
          .eq("is_active", true);

        const adminIds = (orgAdmins || []).map((a: any) => a.id);

        for (const tpl of templates) {
          const prev = cacheMap.get(tpl.id) as any;
          const newStatus = tpl.status;
          const templateName = tpl.name;

          // Upsert cache
          await supabase.from("template_status_cache").upsert(
            {
              org_id: config.org_id,
              template_meta_id: tpl.id,
              template_name: templateName,
              status: newStatus,
              category: tpl.category,
              language: tpl.language,
              last_checked_at: new Date().toISOString(),
            },
            { onConflict: "org_id,template_meta_id" }
          );

          // If status changed and we had a previous record, notify
          if (prev && prev.status !== newStatus) {
            const statusAr = STATUS_AR[newStatus] || newStatus;
            const prevStatusAr = STATUS_AR[prev.status] || prev.status;

            let title = "";
            let body = "";

            if (newStatus === "APPROVED") {
              title = `✅ تمت الموافقة على قالب "${templateName}"`;
              body = `القالب جاهز للاستخدام في الحملات والرسائل.`;
            } else if (newStatus === "REJECTED") {
              title = `❌ تم رفض قالب "${templateName}"`;
              body = `راجع محتوى القالب وأعد تقديمه. السبب المحتمل: مخالفة سياسات Meta.`;
            } else if (newStatus === "PAUSED") {
              title = `⏸ تم إيقاف قالب "${templateName}" مؤقتاً`;
              body = `القالب متوقف بسبب تقييمات جودة منخفضة. راجع المحتوى لتحسينه.`;
            } else {
              title = `📋 تغيّرت حالة قالب "${templateName}"`;
              body = `من "${prevStatusAr}" إلى "${statusAr}".`;
            }

            // Create notification for all org admins
            const notifications = adminIds.map((userId: string) => ({
              user_id: userId,
              org_id: config.org_id,
              title,
              body,
              type: "template_status",
              reference_type: "template",
              reference_id: tpl.id,
            }));

            if (notifications.length > 0) {
              await supabase.from("notifications").insert(notifications);
              totalNotifications += notifications.length;
              log("notified", { org_id: config.org_id, template: templateName, from: prev.status, to: newStatus, users: adminIds.length });
            }
          }
        }

        // Small delay between orgs to avoid Meta rate limits
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err: any) {
        log("org_error", { org_id: config.org_id, error: err.message });
      }
    }

    log("done", { orgs: configs.length, notifications: totalNotifications });

    return new Response(
      JSON.stringify({ processed: configs.length, notifications: totalNotifications }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    log("fatal", { error: err.message });
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
