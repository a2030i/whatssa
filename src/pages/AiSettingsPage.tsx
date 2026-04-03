import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import AiProviderSettings from "@/components/settings/AiProviderSettings";
import { Languages, Sparkles, Brain, BarChart3, CheckCircle2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

const aiFeatures = [
  { icon: Sparkles, title: "اقتراحات الرد الذكي", description: "يقترح AI ردوداً مناسبة بناءً على سياق المحادثة" },
  { icon: Languages, title: "ترجمة الرسائل", description: "ترجمة رسائل العملاء تلقائياً لأي لغة مباشرة من المحادثة" },
  { icon: Brain, title: "تلخيص المحادثات", description: "ملخص آلي لأهم النقاط والطلبات بنقرة واحدة" },
  { icon: BarChart3, title: "تحليل ذكي", description: "تحليل الطلبات والمبيعات والأداء" },
];

const AiSettingsPage = () => {
  const { orgId } = useAuth();
  const [hasActiveAi, setHasActiveAi] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("ai_provider_configs" as any)
      .select("id")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .limit(1)
      .then(({ data }) => setHasActiveAi(!!(data && data.length > 0)));
  }, [orgId]);

  return (
    <div className="p-3 md:p-6 space-y-5 max-w-[800px] mx-auto" dir="rtl">
      <div>
        <h1 className="text-xl font-bold">مزود الذكاء الاصطناعي</h1>
        <p className="text-sm text-muted-foreground mt-1">اربط مفتاح API الخاص بك لتفعيل الرد الذكي، التلخيص والتحليل</p>
      </div>

      {/* Features that unlock */}
      <div className="bg-card border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          {hasActiveAi ? (
            <><CheckCircle2 className="w-4 h-4 text-primary" /> خصائص مفعّلة</>
          ) : (
            <><Lock className="w-4 h-4 text-muted-foreground" /> خصائص ستنفتح عند الربط</>
          )}
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {aiFeatures.map((f, i) => {
            const Icon = f.icon;
            return (
              <div key={i} className={cn(
                "flex items-center gap-3 p-2.5 rounded-lg transition-colors",
                hasActiveAi ? "bg-primary/5" : "bg-muted/50"
              )}>
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  hasActiveAi ? "bg-primary/10" : "bg-muted"
                )}>
                  <Icon className={cn("w-4 h-4", hasActiveAi ? "text-primary" : "text-muted-foreground")} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium">{f.title}</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{f.description}</p>
                </div>
                {hasActiveAi && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mr-auto" />}
              </div>
            );
          })}
        </div>
      </div>

      <AiProviderSettings />
    </div>
  );
};

export default AiSettingsPage;
