import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_AI_BASE = "https://ai.gateway.lovable.dev/v1";
const OPENAI_BASE = "https://api.openai.com/v1";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface AiConfig {
  provider: string;
  api_key: string;
  model: string;
}

async function callAi(config: AiConfig, systemPrompt: string, userMessage: string, maxTokens = 2000): Promise<string | null> {
  try {
    if (config.provider === "lovable_ai") {
      const lovableKey = Deno.env.get("LOVABLE_API_KEY");
      if (!lovableKey) return null;
      const res = await fetch(`${LOVABLE_AI_BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model || "google/gemini-3-flash-preview",
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
          max_tokens: maxTokens, temperature: 0.7,
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
          model: config.model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
          max_tokens: maxTokens, temperature: 0.7,
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
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
        }),
      });
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }
    if (config.provider === "openrouter") {
      const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.api_key}`, "Content-Type": "application/json", "HTTP-Referer": "https://respondly.chat" },
        body: JSON.stringify({
          model: config.model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
          max_tokens: maxTokens, temperature: 0.7,
        }),
      });
      const data = await res.json();
      return data.choices?.[0]?.message?.content || null;
    }
    return null;
  } catch (e) { console.error("AI call error:", e); return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const serviceClient = createClient(supabaseUrl, serviceKey);

  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return json({ error: "Unauthorized" }, 401);

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: profile } = await authClient.from("profiles").select("id, org_id").limit(1).maybeSingle();
    if (!profile?.org_id) return json({ error: "Unauthorized" }, 401);

    const orgId = profile.org_id;
    const body = await req.json();
    const { action } = body;

    // Get AI config
    const { data: aiConfig } = await serviceClient
      .from("ai_provider_configs")
      .select("provider, api_key, model")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!aiConfig?.api_key) return json({ error: "ai_not_configured" }, 400);

    const config: AiConfig = aiConfig as AiConfig;

    // Log usage for lovable_ai
    const logUsage = async (actionName: string) => {
      if (config.provider === "lovable_ai") {
        await serviceClient.from("ai_usage_logs").insert({
          org_id: orgId, action: actionName, model: config.model, tokens_used: 1, triggered_by: profile.id,
        });
      }
    };

    // ── ANALYZE CONVERSATIONS → SUGGEST BOT SCENARIO ──
    if (action === "analyze_for_bot") {
      const { channel_id, days = 7 } = body;

      const since = new Date(Date.now() - days * 86400000).toISOString();
      let query = serviceClient
        .from("messages")
        .select("content, sender, conversation_id, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(200);

      // Filter by channel if specified
      if (channel_id) {
        const { data: convIds } = await serviceClient
          .from("conversations")
          .select("id")
          .eq("org_id", orgId)
          .eq("channel_id", channel_id);
        if (convIds && convIds.length > 0) {
          query = query.in("conversation_id", convIds.map((c: any) => c.id));
        }
      } else {
        const { data: convIds } = await serviceClient
          .from("conversations")
          .select("id")
          .eq("org_id", orgId);
        if (convIds && convIds.length > 0) {
          query = query.in("conversation_id", convIds.map((c: any) => c.id));
        }
      }

      const { data: messages } = await query;
      if (!messages || messages.length < 5) {
        return json({ error: "لا توجد محادثات كافية للتحليل (نحتاج 5 رسائل على الأقل)" });
      }

      const conversationTexts = messages.map((m: any) =>
        `${m.sender === "customer" ? "عميل" : "موظف"}: ${m.content}`
      ).join("\n");

      const systemPrompt = `أنت خبير في تصميم الشات بوت وأتمتة المحادثات. حلل المحادثات التالية واقترح سيناريو شات بوت مثالي.

يجب أن يتضمن ردك:
1. **الأنماط المتكررة**: أكثر الأسئلة والطلبات شيوعاً (مع النسب التقديرية)
2. **سيناريو البوت المقترح**: تدفق كامل مع:
   - رسالة ترحيب مقترحة
   - الأزرار/الخيارات الرئيسية (3-5 خيارات)
   - ردود آلية لكل فرع
   - نقاط التحويل للموظف البشري
3. **توصيات**: نصائح لتحسين تجربة العميل
4. **الأسئلة الشائعة (FAQ)**: قائمة بأهم 5-10 أسئلة مع إجاباتها المقترحة

اكتب بالعربية بشكل مهني ومنظم.`;

      const reply = await callAi(config, systemPrompt, `محادثات آخر ${days} أيام:\n${conversationTexts}`);
      await logUsage("analyze_for_bot");
      return json({ analysis: reply || "تعذر التحليل" });
    }

    // ── BOT ADVISOR ──
    if (action === "bot_advisor") {
      const { business_description, business_type, goals } = body;

      const systemPrompt = `أنت مستشار خبير في الشات بوت وأتمتة خدمة العملاء. بناءً على وصف النشاط التجاري، قدم خطة شات بوت شاملة.

يجب أن يتضمن ردك:
1. **الخطة الاستراتيجية**: رؤية شاملة للبوت وأهدافه
2. **هيكل التدفق**: 
   - رسالة الترحيب المثالية
   - القائمة الرئيسية (أزرار/خيارات) مع وصف كل فرع
   - تدفقات فرعية لكل خيار (3-4 مستويات عمق)
3. **ردود ذكية**: أمثلة على ردود آلية مع شخصية تناسب العلامة التجارية
4. **سيناريوهات متقدمة**:
   - ساعات العمل والرد خارج الدوام
   - تصعيد للموظف البشري (متى ولماذا)
   - رسائل المتابعة
5. **قوالب WhatsApp مقترحة**: 2-3 قوالب رسائل معتمدة من Meta
6. **مؤشرات النجاح**: KPIs لقياس فعالية البوت

اكتب بالعربية بشكل احترافي ومنظم.`;

      const userMsg = `النشاط التجاري: ${business_description || "غير محدد"}
نوع النشاط: ${business_type || "غير محدد"}
الأهداف: ${goals || "تحسين خدمة العملاء وتقليل وقت الاستجابة"}`;

      const reply = await callAi(config, systemPrompt, userMsg, 3000);
      await logUsage("bot_advisor");
      return json({ plan: reply || "تعذر إنشاء الخطة" });
    }

    // ── SMART PERFORMANCE REPORT ──
    if (action === "smart_report") {
      const { period = "week" } = body;
      const days = period === "month" ? 30 : 7;
      const since = new Date(Date.now() - days * 86400000).toISOString();

      // Gather stats
      const [convResult, msgResult, closedResult] = await Promise.all([
        serviceClient.from("conversations").select("id, status, created_at, assigned_to, tags, first_response_at, closed_at", { count: "exact" })
          .eq("org_id", orgId).gte("created_at", since),
        serviceClient.from("messages").select("id, sender, created_at, conversation_id")
          .gte("created_at", since).limit(500),
        serviceClient.from("conversations").select("id, created_at, closed_at, first_response_at")
          .eq("org_id", orgId).eq("status", "closed").gte("closed_at", since),
      ]);

      const conversations = convResult.data || [];
      const messages = msgResult.data || [];
      const closed = closedResult.data || [];

      const stats = {
        total_conversations: conversations.length,
        active: conversations.filter((c: any) => c.status === "active").length,
        closed: closed.length,
        total_messages: messages.length,
        customer_messages: messages.filter((m: any) => m.sender === "customer").length,
        agent_messages: messages.filter((m: any) => m.sender === "agent").length,
        avg_first_response: closed.filter((c: any) => c.first_response_at && c.created_at).map((c: any) => {
          return (new Date(c.first_response_at).getTime() - new Date(c.created_at).getTime()) / 60000;
        }),
        tags: conversations.flatMap((c: any) => c.tags || []),
      };

      const avgFrt = stats.avg_first_response.length > 0
        ? (stats.avg_first_response.reduce((a: number, b: number) => a + b, 0) / stats.avg_first_response.length).toFixed(1)
        : "N/A";

      const tagCounts: Record<string, number> = {};
      stats.tags.forEach((t: string) => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
      const topTags = Object.entries(tagCounts).sort(([, a], [, b]) => b - a).slice(0, 5);

      const systemPrompt = `أنت محلل بيانات خبير. حلل إحصائيات خدمة العملاء التالية وقدم تقريراً ذكياً.

يجب أن يتضمن:
1. **ملخص تنفيذي**: نظرة سريعة على الأداء (جيد/متوسط/يحتاج تحسين)
2. **تحليل الأرقام**: تفسير الإحصائيات وماذا تعني
3. **نقاط القوة**: ما يعمل بشكل جيد
4. **نقاط التحسين**: ما يحتاج عمل
5. **توصيات عملية**: 3-5 خطوات قابلة للتنفيذ
6. **توقعات**: ماذا نتوقع للفترة القادمة

اكتب بالعربية بشكل مهني ومختصر.`;

      const dataText = `تقرير أداء آخر ${days} يوم:
- إجمالي المحادثات: ${stats.total_conversations}
- محادثات نشطة: ${stats.active}
- محادثات مغلقة: ${stats.closed}
- إجمالي الرسائل: ${stats.total_messages}
- رسائل العملاء: ${stats.customer_messages}
- رسائل الموظفين: ${stats.agent_messages}
- متوسط وقت الاستجابة الأولى: ${avgFrt} دقيقة
- أكثر الوسوم: ${topTags.map(([t, c]) => `${t}(${c})`).join(", ") || "لا يوجد"}
- نسبة الإغلاق: ${stats.total_conversations > 0 ? ((stats.closed / stats.total_conversations) * 100).toFixed(1) : 0}%`;

      const reply = await callAi(config, systemPrompt, dataText);
      await logUsage("smart_report");
      return json({ report: reply || "تعذر إنشاء التقرير", stats });
    }

    // ── DETECT CUSTOMER INTENT ──
    if (action === "detect_intent") {
      const { message_text, conversation_context } = body;

      const systemPrompt = `أنت خبير في تحليل نوايا العملاء. حلل رسالة العميل وحدد:

1. **النية الرئيسية**: (شراء، استفسار، شكوى، إرجاع، دعم فني، طلب سعر، حجز، إلغاء، مدح، أخرى)
2. **مستوى الإلحاح**: (عالي، متوسط، منخفض)
3. **المشاعر**: (إيجابي، محايد، سلبي، غاضب)
4. **الإجراء المقترح**: ماذا يجب على الموظف فعله
5. **رد مقترح**: رد سريع مناسب

أرجع الإجابة بتنسيق JSON فقط:
{"intent":"...","urgency":"...","sentiment":"...","action":"...","suggested_reply":"..."}`;

      const context = conversation_context
        ? `سياق المحادثة:\n${conversation_context}\n\nالرسالة الأخيرة: ${message_text}`
        : message_text;

      const reply = await callAi(config, systemPrompt, context, 500);
      await logUsage("detect_intent");

      try {
        const parsed = JSON.parse(reply || "{}");
        return json(parsed);
      } catch {
        return json({ intent: "أخرى", urgency: "متوسط", sentiment: "محايد", action: reply, suggested_reply: "" });
      }
    }

    return json({ error: "إجراء غير معروف" }, 400);
  } catch (e) {
    console.error("AI Advanced error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
