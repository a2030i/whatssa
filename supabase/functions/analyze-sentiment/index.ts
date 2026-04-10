import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_BASE = "https://api.openai.com/v1";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

const SENTIMENT_SYSTEM_PROMPT = `أنت محلل مشاعر عملاء محترف. حلل النص المعطى وحدد مشاعر العميل.
قواعد:
- ركّز على رسائل العميل فقط وليس ردود الموظف
- إذا كان العميل غاضباً أو محبطاً أو يشتكي = negative
- إذا كان العميل راضياً أو يشكر أو سعيد = positive
- إذا كان العميل يسأل بشكل عادي أو محايد = neutral

أجب بصيغة JSON فقط بدون أي نص إضافي:
{"sentiment":"positive|neutral|negative","score":0.5,"reason":"السبب بالعربي","is_angry":false}

score: درجة من 0 إلى 1 (0 = إيجابي جداً، 1 = سلبي جداً)`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { conversation_id, messages_text, org_id } = await req.json();
    if (!conversation_id || !messages_text || !org_id) {
      return new Response(JSON.stringify({ error: "بيانات ناقصة" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Check org has active AI config
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

    // 2. Call AI using org's own provider
    const userMessage = `حلل مشاعر العميل في هذه المحادثة:\n\n${messages_text.slice(0, 2000)}`;
    const result = await chatCompletion(
      aiConfig.provider,
      aiConfig.api_key,
      aiConfig.model,
      [{ role: "user", content: userMessage }],
      SENTIMENT_SYSTEM_PROMPT
    );

    if (result.error) {
      console.error("AI sentiment error:", result.error);
      return new Response(JSON.stringify({ error: "فشل تحليل المشاعر" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Parse JSON response
    let sentiment = "neutral";
    let score = 0.5;
    let reason = "";
    let isAngry = false;

    try {
      const jsonMatch = result.reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        sentiment = parsed.sentiment || "neutral";
        score = typeof parsed.score === "number" ? parsed.score : 0.5;
        reason = parsed.reason || "";
        isAngry = parsed.is_angry || false;
      }
    } catch (e) {
      console.error("Failed to parse sentiment JSON:", e);
    }

    // 4. Update conversation sentiment
    await serviceClient
      .from("conversations")
      .update({
        sentiment,
        sentiment_score: score,
        sentiment_updated_at: new Date().toISOString(),
      })
      .eq("id", conversation_id);

    // 5. If angry, notify ONLY the assigned agent
    if (isAngry) {
      const { data: conv } = await serviceClient
        .from("conversations")
        .select("assigned_to_id, customer_name, customer_phone")
        .eq("id", conversation_id)
        .single();

      if (conv?.assigned_to_id) {
        const customerName = conv.customer_name || conv.customer_phone || "عميل";
        await serviceClient.from("notifications").insert({
          org_id,
          user_id: conv.assigned_to_id,
          type: "warning",
          title: `⚠️ عميل غاضب: ${customerName}`,
          body: reason || "تم اكتشاف مشاعر سلبية قوية في المحادثة",
          reference_type: "conversation",
          reference_id: conversation_id,
        });
      }
    }

    return new Response(JSON.stringify({ sentiment, score, reason, is_angry: isAngry }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Sentiment analysis error:", err);
    return new Response(JSON.stringify({ error: "خطأ في الخادم" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        body: JSON.stringify({ model, messages: fullMessages, max_tokens: 300, temperature: 0.2 }),
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
          generationConfig: { maxOutputTokens: 300, temperature: 0.2 },
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
        body: JSON.stringify({ model, messages: fullMessages, max_tokens: 300, temperature: 0.2 }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data?.error?.message || "فشل" };
      return { reply: data.choices?.[0]?.message?.content || "" };
    }
    return { error: "مزود غير مدعوم" };
  } catch (err) {
    return { error: `خطأ: ${(err as Error).message}` };
  }
}
