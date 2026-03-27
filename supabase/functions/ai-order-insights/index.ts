import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { orders, stats } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const prompt = `أنت محلل بيانات متجر إلكتروني محترف. حلل بيانات الطلبات التالية وقدم رؤى ذكية باللغة العربية.

إحصائيات عامة:
- إجمالي الطلبات: ${stats.total}
- الإيرادات: ${stats.revenue} ر.س
- متوسط الطلب: ${stats.avgOrder?.toFixed(2)} ر.س
- طلبات اليوم: ${stats.todayOrders}
- إيرادات اليوم: ${stats.todayRevenue} ر.س

عينة من الطلبات:
${JSON.stringify(orders?.slice(0, 30))}

قدم تحليلاً مختصراً يشمل:
1. 📊 ملخص الأداء (سطرين)
2. 📍 أكثر المدن طلباً
3. 💡 توصيات لزيادة المبيعات (3 نقاط)
4. ⚠️ تنبيهات مهمة إن وجدت

اجعل الرد مختصراً ومفيداً بدون مقدمات.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "أنت محلل بيانات تجارة إلكترونية. أجب بالعربية فقط. كن مختصراً ودقيقاً." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "تم تجاوز الحد المسموح، حاول لاحقاً" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "رصيد غير كافٍ" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const insight = data.choices?.[0]?.message?.content || "لم يتم الحصول على تحليل";

    return new Response(JSON.stringify({ insight }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("AI insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
