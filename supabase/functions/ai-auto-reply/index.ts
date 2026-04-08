import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_BASE = "https://api.openai.com/v1";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const LOVABLE_AI_BASE = "https://ai.gateway.lovable.dev/v1";

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
      Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
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

    // 3. Fetch recent feedback/corrections
    const { data: recentFeedback } = await serviceClient
      .from("ai_reply_feedback")
      .select("ai_response, corrected_response, feedback_type")
      .eq("org_id", org_id)
      .in("feedback_type", ["correction", "rejected"])
      .order("created_at", { ascending: false })
      .limit(20);

    // 4. Fetch recent conversation messages
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

    // 7. Build STRICT system prompt with JSON output requirement
    const systemPrompt = `أنت مساعد ذكي لخدمة العملاء. يجب أن ترد **حصرياً** من قاعدة المعرفة المرفقة.

⛔ قواعد صارمة لا يمكن تجاوزها:
1. أجب فقط وحصرياً من المعلومات الموجودة في قاعدة المعرفة أدناه
2. لا تخترع أي معلومة أو سعر أو سياسة أو رقم هاتف أو رابط غير موجود حرفياً في قاعدة المعرفة
3. لا تستنتج أو تخمّن إجابات — إذا المعلومة غير موجودة بالنص، فهي غير موجودة
4. إذا لم تجد إجابة واضحة ومباشرة في قاعدة المعرفة، يجب أن تحدد found_in_knowledge = false
5. كن مهنياً ومختصراً وودوداً واستخدم العربية
6. تعلّم من التصحيحات السابقة ولا تكرر نفس الأخطاء

⚠️ عندما لا تجد إجابة (found_in_knowledge = false):
- اكتب رد مهذب للعميل تخبره أنك ستحول سؤاله للفريق المختص
- اقترح 3-5 أسئلة واضحة ومحددة لمدير النظام ليجيب عليها حتى تُثري قاعدة المعرفة
- الأسئلة يجب أن تكون عملية وقابلة للإجابة بنص قصير

يجب أن ترد بصيغة JSON فقط بهذا الشكل:
{
  "reply": "الرد للعميل",
  "found_in_knowledge": true/false,
  "confidence": 0.0-1.0,
  "suggested_questions": ["سؤال 1 للمدير", "سؤال 2", ...]
}

- found_in_knowledge = true فقط إذا الإجابة موجودة حرفياً أو مباشرة في قاعدة المعرفة
- confidence = مدى ثقتك بدقة الإجابة (0.0 = لا أعرف، 1.0 = متأكد 100%)
- suggested_questions = فارغة [] إذا وجدت الإجابة، أو 3-5 أسئلة للمدير إذا لم تجدها

قاعدة المعرفة:
${knowledgeContext}
${correctionsContext}

سياق المحادثة الأخيرة:
${messagesContext}`;

    // 8. Call AI
    const isLovable = aiConfig.provider === "lovable_ai";
    const result = await chatCompletion(
      aiConfig.provider,
      isLovable ? "LOVABLE" : aiConfig.api_key,
      aiConfig.model,
      [{ role: "user", content: customer_message }],
      systemPrompt
    );

    // Log usage for lovable_ai
    if (isLovable) {
      serviceClient.from("ai_usage_logs").insert({
        org_id, action: "auto_reply", model: aiConfig.model, tokens_used: 1,
      }).then(() => {});
    }

    if (result.error) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 9. Parse structured response
    let parsed: any = null;
    try {
      // Try to extract JSON from the response
      const raw = result.reply || "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback: treat entire reply as plain text with high confidence
      parsed = {
        reply: result.reply,
        found_in_knowledge: true,
        confidence: 0.7,
        suggested_questions: [],
      };
    }

    if (!parsed || !parsed.reply) {
      parsed = {
        reply: result.reply || "سأحول سؤالك لفريق الدعم المختص",
        found_in_knowledge: false,
        confidence: 0,
        suggested_questions: [],
      };
    }

    // 10. If NOT found in knowledge or low confidence → save pending question
    const shouldEscalate = !parsed.found_in_knowledge || parsed.confidence < 0.5;

    if (shouldEscalate && parsed.suggested_questions?.length > 0) {
      // Get customer phone from conversation
      const { data: conv } = await serviceClient
        .from("conversations")
        .select("customer_phone")
        .eq("id", conversation_id)
        .single();

      serviceClient.from("ai_pending_questions").insert({
        org_id,
        conversation_id,
        customer_phone: conv?.customer_phone || null,
        customer_question: customer_message,
        suggested_questions: parsed.suggested_questions,
        status: "pending",
      }).then(() => {});

      console.log(`[ai-auto-reply] Question escalated to admin: "${customer_message.substring(0, 50)}..."`);
    }

    // 11. Return the reply (always respond to the customer)
    return new Response(JSON.stringify({
      reply: parsed.reply,
      auto: true,
      found_in_knowledge: parsed.found_in_knowledge,
      confidence: parsed.confidence,
      escalated: shouldEscalate,
    }), {
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
    if (provider === "lovable_ai") {
      const lovableKey = Deno.env.get("LOVABLE_API_KEY");
      if (!lovableKey) return { error: "LOVABLE_API_KEY غير مُعد" };
      const res = await fetch(`${LOVABLE_AI_BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: model || "google/gemini-3-flash-preview", messages: fullMessages, max_tokens: 800, temperature: 0.1 }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data?.error?.message || "فشل" };
      return { reply: data.choices?.[0]?.message?.content || "" };
    }
    if (provider === "openai") {
      const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: fullMessages, max_tokens: 800, temperature: 0.1, response_format: { type: "json_object" } }),
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
          generationConfig: { maxOutputTokens: 800, temperature: 0.1, responseMimeType: "application/json" },
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
        body: JSON.stringify({ model, messages: fullMessages, max_tokens: 800, temperature: 0.1 }),
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
