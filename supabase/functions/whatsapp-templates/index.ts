import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TEMPLATE_NAME_REGEX = /^[a-z0-9_]+$/;
const ALLOWED_CATEGORIES = new Set(["MARKETING", "UTILITY", "AUTHENTICATION"]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function getUserContext(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization) return { error: json({ error: "Unauthorized" }, 401) };

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
  });
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) return { error: json({ error: "Unauthorized" }, 401) };

  const { data: profile } = await adminClient
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.org_id) return { error: json({ error: "لا توجد مؤسسة مرتبطة بهذا الحساب" }, 400) };

  const { data: config } = await adminClient
    .from("whatsapp_config")
    .select("business_account_id, access_token")
    .eq("org_id", profile.org_id)
    .eq("is_connected", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!config) return { error: json({ error: "لا يوجد رقم واتساب حقيقي مربوط حالياً" }, 400) };

  return { adminClient, user, orgId: profile.org_id, config };
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

  if (!["list", "create"].includes(action)) {
    return json({ error: "Invalid action" }, 400);
  }

  const context = await getUserContext(req);
  if ("error" in context) return context.error;

  const { config } = context;

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

    return json({ templates: result.data || [] });
  }

  const name = String(body?.name || "").trim().toLowerCase();
  const category = String(body?.category || "UTILITY").trim().toUpperCase();
  const language = String(body?.language || "ar").trim();
  const header = String(body?.header || "").trim();
  const content = String(body?.body || "").trim();
  const footer = String(body?.footer || "").trim();

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
  if (header) components.push({ type: "HEADER", format: "TEXT", text: header });
  components.push({ type: "BODY", text: content });
  if (footer) components.push({ type: "FOOTER", text: footer });

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
    return json({ error: result?.error?.message || "تعذر إنشاء القالب في Meta" }, response.status);
  }

  return json({ success: true, template: result });
});