import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call Lovable AI with tool calling for structured output
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `أنت محلل مشاعر عملاء محترف. حلل النص المعطى وحدد مشاعر العميل.
قواعد:
- ركّز على رسائل العميل فقط وليس ردود الموظف
- إذا كان العميل غاضباً أو محبطاً أو يشتكي = negative
- إذا كان العميل راضياً أو يشكر أو سعيد = positive
- إذا كان العميل يسأل بشكل عادي أو محايد = neutral
- أعطِ درجة من 0 إلى 1 تمثل شدة المشاعر السلبية (0 = إيجابي جداً، 1 = سلبي جداً)`
          },
          {
            role: "user",
            content: `حلل مشاعر العميل في هذه المحادثة:\n\n${messages_text.slice(0, 2000)}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_sentiment",
              description: "Report the sentiment analysis result",
              parameters: {
                type: "object",
                properties: {
                  sentiment: {
                    type: "string",
                    enum: ["positive", "neutral", "negative"],
                    description: "Overall sentiment of the customer"
                  },
                  score: {
                    type: "number",
                    description: "Negativity score from 0 (very positive) to 1 (very negative)"
                  },
                  reason: {
                    type: "string",
                    description: "Brief reason in Arabic for the sentiment classification"
                  },
                  is_angry: {
                    type: "boolean",
                    description: "Whether the customer is angry or very frustrated"
                  }
                },
                required: ["sentiment", "score", "reason", "is_angry"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "report_sentiment" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "فشل تحليل المشاعر" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    
    // Extract tool call result
    let sentiment = "neutral";
    let score = 0.5;
    let reason = "";
    let isAngry = false;

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        sentiment = args.sentiment || "neutral";
        score = typeof args.score === "number" ? args.score : 0.5;
        reason = args.reason || "";
        isAngry = args.is_angry || false;
      } catch (e) {
        console.error("Failed to parse tool call:", e);
      }
    }

    // Update conversation sentiment in DB
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await serviceClient
      .from("conversations")
      .update({
        sentiment,
        sentiment_score: score,
        sentiment_updated_at: new Date().toISOString(),
      })
      .eq("id", conversation_id);

    // If angry, create a notification for the assigned agent/admin
    if (isAngry) {
      // Get conversation details
      const { data: conv } = await serviceClient
        .from("conversations")
        .select("assigned_to_id, customer_name, customer_phone")
        .eq("id", conversation_id)
        .single();

      if (conv) {
        // Notify assigned agent or all admins
        const targetUsers: string[] = [];
        if (conv.assigned_to_id) {
          targetUsers.push(conv.assigned_to_id);
        } else {
          // Notify all admins
          const { data: admins } = await serviceClient
            .from("user_roles")
            .select("user_id")
            .eq("role", "admin");
          if (admins) {
            const orgAdmins = admins.map((a: any) => a.user_id);
            // Filter by org
            const { data: profiles } = await serviceClient
              .from("profiles")
              .select("id")
              .eq("org_id", org_id)
              .in("id", orgAdmins);
            if (profiles) targetUsers.push(...profiles.map((p: any) => p.id));
          }
        }

        const customerName = conv.customer_name || conv.customer_phone || "عميل";
        for (const userId of targetUsers) {
          await serviceClient.from("notifications").insert({
            org_id,
            user_id: userId,
            type: "warning",
            title: `⚠️ عميل غاضب: ${customerName}`,
            body: reason || "تم اكتشاف مشاعر سلبية قوية في المحادثة",
            reference_type: "conversation",
            reference_id: conversation_id,
          });
        }
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
