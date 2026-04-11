import { Lightbulb } from "lucide-react";
import { DashboardData } from "@/hooks/useDashboardData";
import { cn } from "@/lib/utils";

const SmartInsight = ({ data }: { data: DashboardData }) => {
  const insights: string[] = [];

  // Scenario 1: Growing but limited
  if (data.metaBusinessVerification !== "verified" && data.messageStats.sent7Days > 20 &&
    (data.metaMessagingLimit === "TIER_250" || data.metaMessagingLimit === "TIER_1K")) {
    insights.push("نشاطك في نمو، لكن حد الإرسال الحالي قد يقيّدك. فعّل التوثيق الآن لتفادي تعطّل الحملات.");
  }

  // Scenario 2: Quality dropping with failures
  if (data.metaQualityRating === "RED" || (data.metaQualityRating === "YELLOW" && data.messageStats.failed7Days > 5)) {
    insights.push("هناك تراجع في جودة الرقم خلال آخر الأيام. راجع القوالب الأخيرة وقلل الإرسال المتكرر لنفس الشريحة.");
  }

  // Scenario 3: Connected but idle
  if (data.waStatus.isConnected && data.messageStats.sent30Days === 0) {
    insights.push("تم الربط بنجاح، لكن لم يتم تنفيذ أول إرسال بعد. أرسل رسالة اختبار للتأكد من الجاهزية.");
  }

  // Scenario 4: Good performance
  if (data.waStatus.isConnected && data.metaQualityRating === "GREEN" && data.messageStats.sent7Days > 50 && data.messageStats.failed7Days < 3) {
    insights.push("أداؤك ممتاز! جودة الرقم عالية ونسبة التسليم مرتفعة. استمر بهذا المعدل.");
  }

  // Scenario 5: No automation
  if (data.waStatus.isConnected && data.automationCount === 0 && data.messageStats.totalReceived > 10) {
    insights.push("لديك رسائل واردة لكن بدون ردود آلية. أضف قواعد أتمتة لتسريع الردود على الأسئلة الشائعة.");
  }

  if (insights.length === 0) return null;

  return (
    <div className="bg-card rounded-xl border border-border p-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
          <Lightbulb className="w-4 h-4 text-warning" />
        </div>
        <h2 className="text-sm font-bold text-foreground">توصيات ذكية</h2>
      </div>
      <div className="space-y-2">
        {insights.map((insight, i) => (
          <div key={i} className="flex items-start gap-2 py-2 border-b border-border last:border-0">
            <div className="w-5 h-5 rounded-full bg-warning/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-[10px] font-bold text-warning">{i + 1}</span>
            </div>
            <p className="text-sm text-foreground leading-relaxed">{insight}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SmartInsight;

