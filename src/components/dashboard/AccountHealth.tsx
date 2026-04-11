import { Shield, CheckCircle2, XCircle, Activity, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardData } from "@/hooks/useDashboardData";
import { Progress } from "@/components/ui/progress";

type HealthLevel = "excellent" | "stable" | "at_risk" | "critical";

const healthConfig: Record<HealthLevel, { label: string; color: string; bgColor: string; icon: any }> = {
  excellent: { label: "ممتازة", color: "text-success", bgColor: "bg-success/5 border-success/15", icon: CheckCircle2 },
  stable: { label: "مستقرة", color: "text-info", bgColor: "bg-info/5 border-info/15", icon: Activity },
  at_risk: { label: "معرضة للمشاكل", color: "text-warning", bgColor: "bg-warning/5 border-warning/15", icon: AlertTriangle },
  critical: { label: "تحتاج تدخل عاجل", color: "text-destructive", bgColor: "bg-destructive/5 border-destructive/15", icon: XCircle },
};

const calculateHealth = (data: DashboardData): { level: HealthLevel; score: number; factors: string[] } => {
  let score = 100;
  const factors: string[] = [];
  if (!data.waStatus.phoneNumberId) { score -= 40; factors.push("لم يتم ربط الرقم"); }
  else if (!data.waStatus.isConnected) { score -= 20; factors.push("الرقم غير مفعل"); }
  if (data.metaBusinessVerification !== "verified") { score -= 15; factors.push("النشاط التجاري غير موثق"); }
  if (data.metaQualityRating === "RED") { score -= 25; factors.push("جودة الرقم منخفضة"); }
  else if (data.metaQualityRating === "YELLOW") { score -= 10; factors.push("جودة الرقم متوسطة"); }
  if (data.messageStats.sent7Days > 10) {
    const failRate = data.messageStats.failed7Days / data.messageStats.sent7Days;
    if (failRate > 0.2) { score -= 15; factors.push("نسبة فشل الرسائل مرتفعة"); }
    else if (failRate > 0.1) { score -= 5; factors.push("نسبة فشل الرسائل ملحوظة"); }
  }
  if (data.walletBalance <= 0) { score -= 10; factors.push("رصيد المحفظة صفر"); }
  score = Math.max(0, score);
  let level: HealthLevel = "excellent";
  if (score < 40) level = "critical";
  else if (score < 60) level = "at_risk";
  else if (score < 85) level = "stable";
  return { level, score, factors };
};

const HealthCard = ({ label, value, status }: { label: string; value: string; status: "good" | "warning" | "bad" | "neutral" }) => {
  const colors = { good: "text-success", warning: "text-warning", bad: "text-destructive", neutral: "text-muted-foreground" };
  const dots = { good: "bg-success", warning: "bg-warning", bad: "bg-destructive", neutral: "bg-muted-foreground/30" };
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <div className={cn("w-1.5 h-1.5 rounded-full", dots[status])} />
        <span className={cn("text-xs font-semibold", colors[status])}>{value}</span>
      </div>
    </div>
  );
};

const AccountHealth = ({ data }: { data: DashboardData }) => {
  const health = calculateHealth(data);
  const config = healthConfig[health.level];
  const Icon = config.icon;

  const qualityMap: Record<string, { v: string; s: "good" | "warning" | "bad" }> = {
    GREEN: { v: "عالية", s: "good" }, YELLOW: { v: "متوسطة", s: "warning" }, RED: { v: "منخفضة", s: "bad" },
  };
  const q = qualityMap[data.metaQualityRating || ""] || { v: "غير محدد", s: "neutral" as const };
  const failRate7 = data.messageStats.sent7Days > 0 ? Math.round((data.messageStats.failed7Days / data.messageStats.sent7Days) * 100) : 0;

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
        <div className="w-1.5 h-5 rounded-full bg-primary" />
        الصحة العامة للحساب
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={cn("rounded-2xl border p-6 flex flex-col items-center gap-4 backdrop-blur-sm", config.bgColor)}>
          <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center", config.color, "bg-current/10")}>
            <Icon className={cn("w-7 h-7", config.color)} />
          </div>
          <div className="text-center">
            <p className={cn("text-xl font-black", config.color)}>{config.label}</p>
            <p className="text-xs text-muted-foreground mt-1">تقييم صحة الحساب</p>
          </div>
          <div className="w-full max-w-[200px]">
            <Progress value={health.score} className="h-2.5 rounded-full" />
            <p className="text-center text-xs text-muted-foreground mt-1.5 font-bold">{health.score}%</p>
          </div>
          {health.factors.length > 0 && (
            <div className="w-full mt-1 space-y-1.5">
              {health.factors.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                  {f}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card/70 backdrop-blur-sm rounded-2xl border border-border/40 p-5">
          <HealthCard label="جودة الرقم" value={q.v} status={q.s} />
          <HealthCard label="التوثيق" value={data.metaBusinessVerification === "verified" ? "موثق" : "غير موثق"} status={data.metaBusinessVerification === "verified" ? "good" : "warning"} />
          <HealthCard label="حالة الربط" value={data.waStatus.isConnected ? "مفعّل" : data.waStatus.phoneNumberId ? "معلق" : "غير مربوط"} status={data.waStatus.isConnected ? "good" : "bad"} />
          <HealthCard label="نسبة الفشل (7 أيام)" value={`${failRate7}%`} status={failRate7 > 15 ? "bad" : failRate7 > 5 ? "warning" : "good"} />
          <HealthCard label="رصيد المحفظة" value={`${data.walletBalance} ر.س`} status={data.walletBalance > 20 ? "good" : data.walletBalance > 0 ? "warning" : "bad"} />
          <HealthCard label="الاشتراك" value={data.planName} status="neutral" />
        </div>
      </div>
    </div>
  );
};

export default AccountHealth;

