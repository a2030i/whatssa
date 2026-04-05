import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.100.1/cors";

const OPENAI_BASE = "https://api.openai.com/v1";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { conversation_id, customer_message, org_id } = await req.json();
    if (!conversation_id || !customer_message || !org_id) {
      return new Response(JSON.stringify({ error: "بيانات ناقصة" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") || Deno.env.get("EXTERNAL_SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Check org has AI config with auto_reply capability
    const { data: aiConfig } = await serviceClient
      .from("ai_provider_configs")
      .select("*")
      .eq("org_id", org_id)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!aiConfig?.api_key) {
      return new Response(JSON.stringify({ skip: true, reason: "no_ai_config" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if auto_reply is enabled in capabilities
    const capabilities = aiConfig.capabilities || {};
    if (!capabilities.auto_reply) {
      return new Response(JSON.stringify({ skip: true, reason: "auto_reply_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fetch knowledge base
    const { data: knowledgeEntries } = await serviceClient
      .from("ai_knowledge_base")
      .select("title, content, category")
      .eq("org_id", org_id)
      .eq("is_active", true);

    if (!knowledgeEntries || knowledgeEntries.length === 0) {
      return new Response(JSON.stringify({ skip: true, reason: "no_knowledge_base" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Fetch recent feedback/corrections for learning
    const { data: recentFeedback } = await serviceClient
      .from("ai_reply_feedback")
      .select("ai_response, corrected_response, feedback_type")
      .eq("org_id", org_id)
      .in("feedback_type", ["correction", "rejected"])
      .order("created_at", { ascending: false })
      .limit(20);

    // 4. Fetch recent conversation messages for context
    const { data: recentMessages } = await serviceClient
      .from("messages")
      .select("content, sender, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(10);

    const messagesContext = (recentMessages || []).reverse().map(
      (m: any) => `${m.sender === "customer" ? "العميل" : "الموظف"}: ${m.content}`
    ).join("\n");

    // 5. Build knowledge context
    const knowledgeContext = knowledgeEntries.map(
      (k: any) => `[${k.category}] ${k.title}:\n${k.content}`
    ).join("\n\n---\n\n");

    // 6. Build corrections context
    let correctionsContext = "";
    if (recentFeedback && recentFeedback.length > 0) {
      correctionsContext = "\n\n⚠️ تصحيحات سابقة من الفريق (تعلّم منها):\n" +
        recentFeedback.map((f: any) => {
          if (f.feedback_type === "correction") {
            return `- رد AI السابق: "${f.ai_response}" → الرد الصحيح: "${f.corrected_response}"`;
          }
          return `- رد مرفوض: "${f.ai_response}" (لا تكرره)`;
        }).join("\n");
    }

    // 7. Build system prompt
    const systemPrompt = `أنت مساعد ذكي لخدمة العملاء تابع لمؤسسة. عليك الرد بناءً على قاعدة المعرفة فقط.

قواعد صارمة:
1. أجب فقط من المعلومات الموجودة في قاعدة المعرفة أدناه
2. إذا لم تجد إجابة في قاعدة المعرفة، قل: "سأحول سؤالك لفريق الدعم المختص للمساعدة"
3. كن مهنياً ومختصراً وودوداً
4. استخدم اللغة العربية
5. لا تخترع معلومات أو أسعار أو سياسات غير موجودة في قاعدة المعرفة
6. إذا كان هناك تصحيحات سابقة من الفريق، تعلّم منها ولا تكرر نفس الأخطاء

قاعدة المعرفة:
${knowledgeContext}
${correctionsContext}

سياق المحادثة الأخيرة:
${messagesContext}`;

    // 8. Call AI
    const result = await chatCompletion(
      aiConfig.provider,
      aiConfig.api_key,
      aiConfig.model,
      [{ role: "user", content: customer_message }],
      systemPrompt
    );

    if (result.error) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ reply: result.reply, auto: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("AI Auto-reply error:", err);
    return new Response(JSON.stringify({ error: "خطأ في الخادم" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function chatCompletion(
  provider: string, apiKey: string, model: string,
  messages: Array<{ role: string; content: string }>, systemPrompt: string
) {
  const fullMessages = [{ role: "system", content: systemPrompt }, ...messages];
  try {
    if (provider === "openai") {
      const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: fullMessages, max_tokens: 500, temperature: 0.3 }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data?.error?.message || "فشل" };
      return { reply: data.choices?.[0]?.message?.content || "" };
    }
    if (provider === "gemini") {
      const contents = fullMessages.filter(m => m.role !== "system").map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
      const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { maxOutputTokens: 500, temperature: 0.3 },
        }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data?.error?.message || "فشل" };
      return { reply: data.candidates?.[0]?.content?.parts?.[0]?.text || "" };
    }
    if (provider === "openrouter") {
      const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://respondly.chat" },
        body: JSON.stringify({ model, messages: fullMessages, max_tokens: 500, temperature: 0.3 }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data?.error?.message || "فشل" };
      return { reply: data.choices?.[0]?.message?.content || "" };
    }
    return { error: "مزود غير مدعوم" };
  } catch (err) {
    return { error: `خطأ: ${err.message}` };
  }
}
