import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TEMPLATE_NAME_REGEX = /^[a-z0-9_]+$/;
const ALLOWED_CATEGORIES = new Set(["MARKETING", "UTILITY", "AUTHENTICATION"]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function getUserContext(req: Request, body: Record<string, unknown>) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return { error: json({ error: "Unauthorized" }, 401) };

  const token = authorization.replace("Bearer ", "");
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !user) {
    console.error("[whatsapp-templates] getUser failed:", userError?.message);
    return { error: json({ error: "Unauthorized" }, 401) };
  }

  const userId = user.id;
  console.log("[whatsapp-templates] userId:", userId, "email:", user.email);

  const [{ data: profile, error: profileError }, { data: superAdminRole }] = await Promise.all([
    adminClient
      .from("profiles")
      .select("org_id")
      .eq("id", userId)
      .maybeSingle(),
    adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle(),
  ]);

  console.log("[whatsapp-templates] profile:", JSON.stringify(profile), "profileError:", profileError?.message, "superAdminRole:", JSON.stringify(superAdminRole));

  if (!profile?.org_id) return { error: json({ error: "لا توجد مؤسسة مرتبطة بهذا الحساب" }, 400) };

  // Allow super_admin to override org_id for impersonation
  let effectiveOrgId = profile.org_id;
  const overrideOrgId = body?.org_id ? String(body.org_id).trim() : null;
  if (overrideOrgId && overrideOrgId !== profile.org_id && !!superAdminRole) {
    effectiveOrgId = overrideOrgId;
    console.log("[whatsapp-templates] super_admin impersonation, using org_id:", effectiveOrgId);
  }

  // If channel_id provided, use that specific channel
  const channelId = body?.channel_id ? String(body.channel_id).trim() : null;

  if (channelId) {
    const { data: config } = await adminClient
      .from("whatsapp_config")
      .select("id, business_account_id, access_token, display_phone, business_name, channel_label")
      .eq("id", channelId)
      .eq("org_id", effectiveOrgId)
      .eq("is_connected", true)
      .eq("channel_type", "meta_api")
      .maybeSingle();

    if (!config) return { error: json({ error: "القناة المحددة غير متصلة أو غير موجودة" }, 400) };
    return { adminClient, userId, orgId: effectiveOrgId, config };
  }

  // No channel_id: get all connected meta channels
  const { data: configs } = await adminClient
    .from("whatsapp_config")
    .select("id, business_account_id, access_token, display_phone, business_name, channel_label")
    .eq("org_id", effectiveOrgId)
    .eq("is_connected", true)
    .eq("channel_type", "meta_api")
    .order("created_at", { ascending: true });

  if (!configs || configs.length === 0) {
    return { error: json({ error: "لا يوجد رقم واتساب مربوط عبر WhatsApp Cloud API. القوالب تتطلب ربط رقم عبر Meta API الرسمي", meta_configured: false, templates: [] }) };
  }

  // Return first config as default, but also all configs
  return { adminClient, userId, orgId: effectiveOrgId, config: configs[0], allConfigs: configs };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  if (!["list", "list_all", "create", "edit", "delete", "get", "channels"].includes(action)) {
    return json({ error: "Invalid action" }, 400);
  }

  // Special action: list available meta channels
  if (action === "channels") {
    const context = await getUserContext(req, body);
    if ("error" in context) return context.error;
    const allConfigs = (context as any).allConfigs || [context.config];
    return json({
      channels: allConfigs.map((c: any) => ({
        id: c.id,
        display_phone: c.display_phone,
        business_name: c.business_name,
          channel_label: c.channel_label,
          business_account_id: c.business_account_id,
      })),
    });
  }

  const context = await getUserContext(req, body);
  if ("error" in context) return context.error;

  const { config } = context;

  // ── List all templates across all channels ──
  if (action === "list_all") {
    const allConfigs = (context as any).allConfigs || [config];
    const allTemplates: any[] = [];
    console.log("list_all: configs count =", allConfigs.length);

    // Pull latest status/reason from webhook cache
    const { data: cacheRows } = await (context as any).adminClient
      .from("template_status_cache")
      .select("template_meta_id,status,reason")
      .eq("org_id", (context as any).orgId)
      .limit(2000);
    const cacheMap = new Map<string, { status?: string; reason?: string }>();
    (cacheRows || []).forEach((r: any) => {
      if (r?.template_meta_id) cacheMap.set(String(r.template_meta_id), { status: r.status, reason: r.reason });
    });

    for (const cfg of allConfigs) {
      console.log("list_all: fetching for channel", cfg.id, "biz_account_id=", cfg.business_account_id, "token_len=", cfg.access_token?.length);
      
      if (!cfg.business_account_id) {
        console.warn("list_all: skipping channel", cfg.id, "- no business_account_id");
        continue;
      }

      try {
        const url = `https://graph.facebook.com/v21.0/${cfg.business_account_id}/message_templates?fields=id,name,status,language,category,components&limit=250`;
        const response = await fetch(url, { headers: { Authorization: `Bearer ${cfg.access_token}` } });
        const result = await response.json();
        console.log("list_all: response status=", response.status, "templates count=", result.data?.length || 0, "error=", result.error?.message || "none");
        
        if (response.ok && result.data) {
          for (const t of result.data) {
            const cached = cacheMap.get(String(t?.id || "")) || cacheMap.get(String((t as any)?.message_template_id || "")) || undefined;
            allTemplates.push({
              ...t,
              channel_id: cfg.id,
              channel_phone: cfg.display_phone,
              channel_name: cfg.channel_label || cfg.business_name || cfg.display_phone,
              // Prefer webhook cache when available (includes REJECTED reason codes)
              status: (cached?.status || t.status) ?? t.status,
              status_reason: cached?.reason || (t as any).reason || "",
            });
          }
        } else if (result.error) {
          console.error("list_all: Meta API error for channel", cfg.id, ":", result.error.message);
        }
      } catch (fetchErr) {
        console.error("list_all: fetch error for channel", cfg.id, ":", (fetchErr as Error).message);
      }
    }

    console.log("list_all: total templates =", allTemplates.length);
    return json({ templates: allTemplates });
  }

  if (action === "list") {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${config.business_account_id}/message_templates?fields=id,name,status,language,category,components`,
      {
        headers: { Authorization: `Bearer ${config.access_token}` },
      },
    );
    const result = await response.json();

    if (!response.ok) {
      return json({ error: result?.error?.message || "تعذر جلب القوالب من Meta" }, response.status);
    }

    // Attach channel info to each template
    const templates = (result.data || []).map((t: any) => ({
      ...t,
      channel_id: config.id,
      channel_phone: config.display_phone,
      channel_name: (config as any).channel_label || config.business_name || config.display_phone,
    }));

    return json({ templates });
  }

  // ── Get single template ──
  if (action === "get") {
    const templateId = String(body?.template_id || "").trim();
    if (!templateId) return json({ error: "template_id مطلوب" }, 400);

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${templateId}?fields=id,name,status,language,category,components`,
      { headers: { Authorization: `Bearer ${config.access_token}` } },
    );
    const result = await response.json();
    if (!response.ok) return json({ error: result?.error?.message || "تعذر جلب القالب" }, response.status);
    return json({ template: result });
  }

  // ── Delete template ──
  if (action === "delete") {
    const templateName = String(body?.name || "").trim();
    if (!templateName) return json({ error: "اسم القالب مطلوب للحذف" }, 400);

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${config.business_account_id}/message_templates?name=${encodeURIComponent(templateName)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${config.access_token}` },
      },
    );
    const result = await response.json();
    if (!response.ok) return json({ error: result?.error?.message || "تعذر حذف القالب" }, response.status);
    return json({ success: true });
  }

  // ── Edit template (delete + recreate since Meta doesn't support direct edit) ──
  if (action === "edit") {
    const templateName = String(body?.name || "").trim();
    if (!templateName) return json({ error: "اسم القالب مطلوب" }, 400);

    // Step 2: Recreate with new content
    const category = String(body?.category || "UTILITY").trim().toUpperCase();
    const language = String(body?.language || "ar").trim();
    const headerType = String(body?.header_type || "NONE").trim().toUpperCase();
    const header = String(body?.header || "").trim();
    const headerUrl = String(body?.header_url || "").trim();
    const content = String(body?.body || "").trim();
    const footer = String(body?.footer || "").trim();
    const buttons: Array<{type: string; text: string; value?: string}> = Array.isArray(body?.buttons) ? body.buttons : [];

    const headerExampleValues: string[] = Array.isArray(body?.header_example_values) ? body.header_example_values.filter((v: unknown) => typeof v === "string") : [];
    const bodyExampleValues: string[] = Array.isArray(body?.body_example_values) ? body.body_example_values.filter((v: unknown) => typeof v === "string") : [];

    if (!content) return json({ error: "محتوى الرسالة مطلوب" }, 400);

    const components: Array<Record<string, unknown>> = [];
    if (headerType === "TEXT" && header) {
      const headerComp: Record<string, unknown> = { type: "HEADER", format: "TEXT", text: header };
      if (headerExampleValues.length > 0) headerComp.example = { header_text: headerExampleValues };
      components.push(headerComp);
    } else if ((headerType === "IMAGE" || headerType === "VIDEO") && headerUrl) {
      components.push({ type: "HEADER", format: headerType, example: { header_url: [headerUrl] } });
    }
    const bodyComp: Record<string, unknown> = { type: "BODY", text: content };
    // Cloud API expects body_text as array of example sets: [["v1","v2",...]]
    if (bodyExampleValues.length > 0) bodyComp.example = { body_text: [bodyExampleValues] };
    components.push(bodyComp);
    if (footer) components.push({ type: "FOOTER", text: footer });

    if (buttons.length > 0) {
      components.push({
        type: "BUTTONS",
        buttons: buttons.map((b: any) => {
          if (b.type === "phone" || b.type === "phone_number") return { type: "PHONE_NUMBER", text: b.text, phone_number: b.value };
          if (b.type === "quick_reply") return { type: "QUICK_REPLY", text: b.text, payload: b.value || b.text };
          return { type: "URL", text: b.text, url: b.value };
        }),
      });
    }

    const createRes = await fetch(
      `https://graph.facebook.com/v21.0/${templateId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ components }),
      },
    );
    const createResult = await createRes.json();
    if (!createRes.ok) {
      return json({ error: createResult?.error?.message || "تعذر إعادة إنشاء القالب" }, createRes.status);
    }

    return json({ success: true, template: createResult });
  }

  // ── Create template ──
  const name = String(body?.name || "").trim().toLowerCase();
  const category = String(body?.category || "UTILITY").trim().toUpperCase();
  const language = String(body?.language || "ar").trim();
  const headerType = String(body?.header_type || "NONE").trim().toUpperCase();
  const header = String(body?.header || "").trim();
  const headerUrl = String(body?.header_url || "").trim();
  const content = String(body?.body || "").trim();
  const footer = String(body?.footer || "").trim();
  const buttons: Array<{type: string; text: string; value?: string}> = Array.isArray(body?.buttons) ? body.buttons : [];

  const headerExampleValues: string[] = Array.isArray(body?.header_example_values) ? body.header_example_values.filter((v: unknown) => typeof v === "string") : [];
  const bodyExampleValues: string[] = Array.isArray(body?.body_example_values) ? body.body_example_values.filter((v: unknown) => typeof v === "string") : [];

  if (!name || !content) {
    return json({ error: "الاسم ومحتوى الرسالة مطلوبان" }, 400);
  }

  if (!TEMPLATE_NAME_REGEX.test(name)) {
    return json({ error: "اسم القالب في Meta يجب أن يكون بالإنجليزية الصغيرة والأرقام وشرطة سفلية فقط" }, 400);
  }

  if (!ALLOWED_CATEGORIES.has(category)) {
    return json({ error: "تصنيف القالب غير صالح" }, 400);
  }

  const components: Array<Record<string, unknown>> = [];
  if (headerType === "TEXT" && header) {
    const headerComp: Record<string, unknown> = { type: "HEADER", format: "TEXT", text: header };
    if (headerExampleValues.length > 0) headerComp.example = { header_text: headerExampleValues };
    components.push(headerComp);
  } else if ((headerType === "IMAGE" || headerType === "VIDEO") && headerUrl) {
    components.push({ type: "HEADER", format: headerType, example: { header_url: [headerUrl] } });
  }
  const bodyComp: Record<string, unknown> = { type: "BODY", text: content };
  // Cloud API expects body_text as array of example sets: [["v1","v2",...]]
  if (bodyExampleValues.length > 0) bodyComp.example = { body_text: [bodyExampleValues] };
  components.push(bodyComp);
  if (footer) components.push({ type: "FOOTER", text: footer });

  if (buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: buttons.map((b: any) => {
        if (b.type === "phone" || b.type === "phone_number") return { type: "PHONE_NUMBER", text: b.text, phone_number: b.value };
        if (b.type === "quick_reply") return { type: "QUICK_REPLY", text: b.text, payload: b.value || b.text };
        return { type: "URL", text: b.text, url: b.value };
      }),
    });
  }

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${config.business_account_id}/message_templates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, category, language, components }),
    },
  );
  const result = await response.json();

  if (!response.ok) {
    const metaError = result?.error;
    const errorDetail = metaError?.error_user_msg || metaError?.message || "تعذر إنشاء القالب في Meta";
    const errorCode = metaError?.code || response.status;
    console.error("[whatsapp-templates] create failed:", JSON.stringify(metaError), "payload:", JSON.stringify({ name, category, language, components }));
    return json({ error: errorDetail, meta_error_code: errorCode, meta_error_subcode: metaError?.error_subcode }, response.status);
  }

  return json({ success: true, template: result });
});


