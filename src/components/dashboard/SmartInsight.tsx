import { Lightbulb } from "lucide-react";
import { DashboardData } from "@/hooks/useDashboardData";

const SmartInsight = ({ data }: { data: DashboardData }) => {
  const insights: string[] = [];

  if (data.metaBusinessVerification !== "verified" && data.messageStats.sent7Days > 20 &&
    (data.metaMessagingLimit === "TIER_250" || data.metaMessagingLimit === "TIER_1K")) {
    insights.push("نشاطك في نمو، لكن حد الإرسال الحالي قد يقيّدك. فعّل التوثيق الآن لتفادي تعطّل الحملات.");
  }

  if (data.metaQualityRating === "RED" || (data.metaQualityRating === "YELLOW" && data.messageStats.failed7Days > 5)) {
    insights.push("هناك تراجع في جودة الرقم خلال آخر الأيام. راجع القوالب الأخيرة وقلل الإرسال المتكرر لنفس الشريحة.");
  }

  if (data.waStatus.isConnected && data.messageStats.sent30Days === 0) {
    insights.push("تم الربط بنجاح، لكن لم يتم تنفيذ أول إرسال بعد. أرسل رسالة اختبار للتأكد من الجاهزية.");
  }

  if (data.waStatus.isConnected && data.metaQualityRating === "GREEN" && data.messageStats.sent7Days > 50 && data.messageStats.failed7Days < 3) {
    insights.push("أداؤك ممتاز! جودة الرقم عالية ونسبة التسليم مرتفعة. استمر بهذا المعدل.");
  }

  if (data.waStatus.isConnected && data.automationCount === 0 && data.messageStats.totalReceived > 10) {
    insights.push("لديك رسائل واردة لكن بدون ردود آلية. أضف قواعد أتمتة لتسريع الردود على الأسئلة الشائعة.");
  }

  if (insights.length === 0) return null;

  return (
    <div className="bg-card rounded-lg border border-border p-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="w-4 h-4 text-warning" />
        <h2 className="text-sm font-semibold text-foreground">توصيات ذكية</h2>
      </div>
      <div className="space-y-1">
        {insights.map((insight, i) => (
          <div key={i} className="flex items-start gap-2.5 py-2 border-b border-border last:border-0">
            <span className="text-[11px] font-semibold text-warning bg-warning/10 w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
            <p className="text-sm text-foreground leading-relaxed">{insight}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SmartInsight;
