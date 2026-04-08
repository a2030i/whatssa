import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENAI_BASE = "https://api.openai.com/v1";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const LOVABLE_AI_BASE = "https://ai.gateway.lovable.dev/v1";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface AiConfig {
  provider: string;
  api_key: string;
  model: string;
  capabilities: Record<string, boolean>;
}

async function getOrgAiConfig(
  serviceClient: ReturnType<typeof createClient>,
  orgId: string,
  requiredCapability: string
): Promise<AiConfig | null> {
  const { data } = await serviceClient
    .from("ai_provider_configs")
    .select("provider, api_key, model, capabilities")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!data || !data.api_key) return null;

  const caps = (data.capabilities as Record<string, boolean>) || {};
  if (!caps[requiredCapability]) return null;

  return data as AiConfig;
}

async function callAi(config: AiConfig, systemPrompt: string, userMessage: string): Promise<string | null> {
  try {
    if (config.provider === "lovable_ai") {
      const lovableKey = Deno.env.get("LOVABLE_API_KEY");
      if (!lovableKey) return null;
      const res = await fetch(`${LOVABLE_AI_BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model || "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          max_tokens: 500,
          temperature: 0.7,
        }),
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content || null;
    }

    if (config.provider === "openai") {
      const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          max_tokens: 500,
          temperature: 0.7,
        }),
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content || null;
    }

    if (config.provider === "gemini") {
      const res = await fetch(`${GEMINI_BASE}/models/${config.model}:generateContent?key=${config.api_key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          generationConfig: { maxOutputTokens: 500, temperature: 0.7 },
        }),
      });
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }

    if (config.provider === "openrouter") {
      const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.api_key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://respondly.chat",
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          max_tokens: 500,
          temperature: 0.7,
        }),
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content || null;
    }

    return null;
  } catch (e) {
    console.error("AI call error:", e);
    return null;
  }
}

async function logLovableAiUsage(
  serviceClient: ReturnType<typeof createClient>,
  orgId: string,
  action: string,
  model: string,
  userId?: string
) {
  await serviceClient.from("ai_usage_logs").insert({
    org_id: orgId,
    action,
    model,
    tokens_used: 1, // count as 1 call
    triggered_by: userId || null,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const serviceClient = createClient(supabaseUrl, serviceKey);

  try {
    // Auth check
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return json({ error: "Unauthorized" }, 401);

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    // Use RLS-scoped query instead of auth.getUser()
    const { data: profile, error: profileError } = await authClient
      .from("profiles").select("id, org_id").limit(1).maybeSingle();
    if (profileError || !profile?.org_id) return json({ error: "Unauthorized" }, 401);

    const orgId = profile.org_id;
    const body = await req.json();
    const { action } = body;

    // ── SUGGEST REPLIES ──
    if (action === "suggest_replies") {
      const { conversation_messages, customer_name } = body;
      const config = await getOrgAiConfig(serviceClient, orgId, "chat_reply");
      if (!config) return json({ error: "ai_not_configured", suggestions: [] });

      const systemPrompt = `أنت مساعد ذكي لخدمة العملاء في منصة دعم. مهمتك اقتراح 3 ردود مختصرة ومهنية باللغة العربية على رسالة العميل.
أرجع الردود بالتنسيق التالي (كل رد في سطر منفصل):
1. [الرد الأول]
2. [الرد الثاني]
3. [الرد الثالث]
لا تضف أي شرح أو مقدمة.`;

      const lastMessages = (conversation_messages || []).slice(-5)
        .map((m: any) => `${m.sender === "customer" ? customer_name || "العميل" : "الموظف"}: ${m.content}`)
        .join("\n");

      const reply = await callAi(config, systemPrompt, `آخر رسائل المحادثة:\n${lastMessages}\n\nاقترح 3 ردود:`);
      if (config.provider === "lovable_ai") await logLovableAiUsage(serviceClient, orgId, "suggest_replies", config.model, profile.id);
      if (!reply) return json({ suggestions: [] });

      const suggestions = reply
        .split("\n")
        .map((line: string) => line.replace(/^\d+[\.\)]\s*/, "").trim())
        .filter((line: string) => line.length > 0)
        .slice(0, 3);

      return json({ suggestions });
    }

    // ── CLASSIFY CONVERSATION ──
    if (action === "classify") {
      const { messages: convMessages } = body;
      const config = await getOrgAiConfig(serviceClient, orgId, "smart_analysis");
      if (!config) return json({ error: "ai_not_configured" });

      const systemPrompt = `صنف المحادثة التالية إلى فئة واحدة فقط من: شكوى، استفسار، طلب، مدح، أخرى.
أرجع كلمة واحدة فقط (الفئة).`;

      const text = (convMessages || []).slice(-10)
        .map((m: any) => m.content).join("\n");

      const reply = await callAi(config, systemPrompt, text);
      if (config.provider === "lovable_ai") await logLovableAiUsage(serviceClient, orgId, "classify", config.model, profile.id);
      return json({ category: reply?.trim() || "أخرى" });
    }

    // ── SUMMARIZE CONVERSATION ──
    if (action === "summarize") {
      const { conversation_id } = body;
      const config = await getOrgAiConfig(serviceClient, orgId, "conversation_summary");
      if (!config) return json({ error: "ai_not_configured" });

      const { data: msgs } = await serviceClient
        .from("messages")
        .select("content, sender, created_at")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: true })
        .limit(50);

      if (!msgs || msgs.length === 0) return json({ summary: "لا توجد رسائل" });

      const systemPrompt = `لخص المحادثة التالية في 2-3 جمل باللغة العربية. ركز على: موضوع المحادثة، طلب العميل، والنتيجة النهائية.`;

      const text = msgs.map((m: any) =>
        `${m.sender === "customer" ? "العميل" : m.sender === "agent" ? "الموظف" : "النظام"}: ${m.content}`
      ).join("\n");

      const reply = await callAi(config, systemPrompt, text);
      if (config.provider === "lovable_ai") await logLovableAiUsage(serviceClient, orgId, "summarize", config.model, profile.id);
      return json({ summary: reply || "تعذر التلخيص" });
    }

    // ── TRANSLATE MESSAGE ──
    if (action === "translate") {
      const { text, target_language } = body;
      const config = await getOrgAiConfig(serviceClient, orgId, "chat_reply");
      if (!config) return json({ error: "ai_not_configured" });

      const systemPrompt = `ترجم النص التالي إلى ${target_language || "العربية"}. أرجع الترجمة فقط بدون أي شرح.`;
      const reply = await callAi(config, systemPrompt, text);
      if (config.provider === "lovable_ai") await logLovableAiUsage(serviceClient, orgId, "translate", config.model, profile.id);
      return json({ translation: reply || text });
    }

    // ── AUTO-REPLY (called from webhook) ──
    if (action === "auto_reply") {
      const { conversation_id, customer_message, customer_name, org_id: reqOrgId } = body;
      // This action is called internally from webhook with service key
      const targetOrgId = reqOrgId || orgId;
      
      const config = await getOrgAiConfig(serviceClient, targetOrgId, "chat_reply");
      if (!config) return json({ reply: null, reason: "ai_not_configured" });

      const { data: recentMsgs } = await serviceClient
        .from("messages")
        .select("content, sender")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: false })
        .limit(10);

      const context = (recentMsgs || []).reverse()
        .map((m: any) => `${m.sender === "customer" ? (customer_name || "العميل") : "الموظف"}: ${m.content}`)
        .join("\n");

      const systemPrompt = `أنت مساعد ذكي لخدمة العملاء. أجب على رسالة العميل بشكل مختصر ومهني باللغة العربية.
إذا كان السؤال يحتاج تدخل بشري أو لا تعرف الإجابة، أرجع الكلمة: ESCALATE
لا تبالغ في الوعود ولا تفترض معلومات ليست لديك.`;

      const reply = await callAi(config, systemPrompt, `${context}\n\nالعميل: ${customer_message}`);
      
      if (!reply || reply.trim() === "ESCALATE") {
        return json({ reply: null, reason: "escalate" });
      }

      return json({ reply: reply.trim() });
    }

    return json({ error: "إجراء غير معروف" }, 400);
  } catch (e) {
    console.error("AI features error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
