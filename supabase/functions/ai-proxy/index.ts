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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, provider, api_key, model, messages, system_prompt } = body;

    // Test connection
    if (action === "test") {
      const result = await testConnection(provider, api_key, model);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Chat completion
    if (action === "chat") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "غير مصرح" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
      const anonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
      const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      const supabase = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, org_id")
        .limit(1)
        .maybeSingle();

      if (profileError || !profile?.id || !profile?.org_id) {
        return new Response(JSON.stringify({ error: "غير مصرح" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const serviceClient = createClient(supabaseUrl, serviceKey);

      const { data: aiConfig } = await serviceClient
        .from("ai_provider_configs")
        .select("*")
        .eq("org_id", profile.org_id)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (!aiConfig || !aiConfig.api_key) {
        return new Response(JSON.stringify({ error: "لم يتم إعداد مزود AI — اذهب للإعدادات" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await chatCompletion(
        aiConfig.provider,
        aiConfig.provider === "lovable_ai" ? "LOVABLE" : aiConfig.api_key,
        aiConfig.model,
        messages || [],
        system_prompt || "أنت مساعد ذكي للمحادثات. أجب بشكل مختصر ومهني باللغة العربية."
      );

      // Log usage for lovable_ai
      if (aiConfig.provider === "lovable_ai") {
        await serviceClient.from("ai_usage_logs").insert({
          org_id: profile.org_id,
          action: "chat",
          model: aiConfig.model,
          tokens_used: result.usage?.total_tokens || result.usage?.totalTokenCount || 0,
          triggered_by: profile.id,
        });
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "إجراء غير معروف" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("AI Proxy error:", err);
    return new Response(JSON.stringify({ error: "خطأ في الخادم" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function testConnection(provider: string, apiKey: string, model: string) {
  try {
    if (provider === "lovable_ai") {
      const lovableKey = Deno.env.get("LOVABLE_API_KEY");
      if (!lovableKey) return { error: "LOVABLE_API_KEY غير مُعد في الخادم" };
      const res = await fetch(`${LOVABLE_AI_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model || "google/gemini-3-flash-preview",
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 5,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { error: err?.error?.message || `خطأ ${res.status}` };
      }
      return { success: true };
    }

    if (provider === "openai") {
      const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "Hi" }], max_tokens: 5 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { error: err?.error?.message || `خطأ ${res.status}` };
      }
      return { success: true };
    }

    if (provider === "gemini") {
      const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Hi" }] }], generationConfig: { maxOutputTokens: 5 } }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { error: err?.error?.message || `خطأ ${res.status}` };
      }
      return { success: true };
    }

    if (provider === "openrouter") {
      const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://respondly.chat" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "Hi" }], max_tokens: 5 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { error: err?.error?.message || `خطأ ${res.status}` };
      }
      return { success: true };
    }

    return { error: "مزود غير مدعوم" };
  } catch (err) {
    return { error: `فشل الاتصال: ${(err as Error).message}` };
  }
}

async function chatCompletion(
  provider: string,
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string
) {
  const fullMessages = [{ role: "system", content: systemPrompt }, ...messages];

  try {
    if (provider === "lovable_ai") {
      const lovableKey = Deno.env.get("LOVABLE_API_KEY");
      if (!lovableKey) return { error: "LOVABLE_API_KEY غير مُعد" };
      const res = await fetch(`${LOVABLE_AI_BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: model || "google/gemini-3-flash-preview", messages: fullMessages, max_tokens: 1000 }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data?.error?.message || "فشل" };
      return { reply: data.choices?.[0]?.message?.content || "", usage: data.usage };
    }

    if (provider === "openai") {
      const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: fullMessages, max_tokens: 1000 }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data?.error?.message || "فشل" };
      return { reply: data.choices?.[0]?.message?.content || "", usage: data.usage };
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
          generationConfig: { maxOutputTokens: 1000 },
        }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data?.error?.message || "فشل" };
      return { reply: data.candidates?.[0]?.content?.parts?.[0]?.text || "", usage: data.usageMetadata };
    }

    if (provider === "openrouter") {
      const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://respondly.chat" },
        body: JSON.stringify({ model, messages: fullMessages, max_tokens: 1000 }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data?.error?.message || "فشل" };
      return { reply: data.choices?.[0]?.message?.content || "", usage: data.usage };
    }

    return { error: "مزود غير مدعوم" };
  } catch (err) {
    return { error: `خطأ: ${(err as Error).message}` };
  }
}
