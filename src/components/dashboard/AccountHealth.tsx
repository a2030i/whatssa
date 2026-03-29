import { Shield, Signal, FileCheck, AlertTriangle, CheckCircle2, XCircle, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardData } from "@/hooks/useDashboardData";
import { Progress } from "@/components/ui/progress";

type HealthLevel = "excellent" | "stable" | "at_risk" | "critical";

const healthConfig: Record<HealthLevel, { label: string; color: string; bgColor: string; icon: any }> = {
  excellent: { label: "ممتازة", color: "text-success", bgColor: "bg-success/10 border-success/20", icon: CheckCircle2 },
  stable: { label: "مستقرة", color: "text-info", bgColor: "bg-info/10 border-info/20", icon: Activity },
  at_risk: { label: "معرضة للمشاكل", color: "text-warning", bgColor: "bg-warning/10 border-warning/20", icon: AlertTriangle },
  critical: { label: "تحتاج تدخل عاجل", color: "text-destructive", bgColor: "bg-destructive/10 border-destructive/20", icon: XCircle },
};

const calculateHealth = (data: DashboardData): { level: HealthLevel; score: number; factors: string[] } => {
  let score = 100;
  const factors: string[] = [];

  // Connection
  if (!data.waStatus.phoneNumberId) { score -= 40; factors.push("لم يتم ربط الرقم"); }
  else if (!data.waStatus.isConnected) { score -= 20; factors.push("الرقم غير مفعل"); }

  // Business verification
  if (data.metaBusinessVerification !== "verified") { score -= 15; factors.push("النشاط التجاري غير موثق"); }

  // Quality
  if (data.metaQualityRating === "RED") { score -= 25; factors.push("جودة الرقم منخفضة"); }
  else if (data.metaQualityRating === "YELLOW") { score -= 10; factors.push("جودة الرقم متوسطة"); }

  // Failure rate
  if (data.messageStats.sent7Days > 10) {
    const failRate = data.messageStats.failed7Days / data.messageStats.sent7Days;
    if (failRate > 0.2) { score -= 15; factors.push("نسبة فشل الرسائل مرتفعة"); }
    else if (failRate > 0.1) { score -= 5; factors.push("نسبة فشل الرسائل ملحوظة"); }
  }

  // Wallet
  if (data.walletBalance <= 0) { score -= 10; factors.push("رصيد المحفظة صفر"); }

  score = Math.max(0, score);

  let level: HealthLevel = "excellent";
  if (score < 40) level = "critical";
  else if (score < 60) level = "at_risk";
  else if (score < 85) level = "stable";

  return { level, score, factors };
};

const HealthCard = ({ label, value, status }: { label: string; value: string; status: "good" | "warning" | "bad" | "neutral" }) => {
  const colors = {
    good: "text-success",
    warning: "text-warning",
    bad: "text-destructive",
    neutral: "text-muted-foreground",
  };
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-xs font-semibold", colors[status])}>{value}</span>
    </div>
  );
};

const AccountHealth = ({ data }: { data: DashboardData }) => {
  const health = calculateHealth(data);
  const config = healthConfig[health.level];
  const Icon = config.icon;

  const qualityMap: Record<string, { v: string; s: "good" | "warning" | "bad" }> = {
    GREEN: { v: "عالية", s: "good" },
    YELLOW: { v: "متوسطة", s: "warning" },
    RED: { v: "منخفضة", s: "bad" },
  };
  const q = qualityMap[data.metaQualityRating || ""] || { v: "غير محدد", s: "neutral" as const };

  const failRate7 = data.messageStats.sent7Days > 0
    ? Math.round((data.messageStats.failed7Days / data.messageStats.sent7Days) * 100)
    : 0;

  return (
    <div className="space-y-3 animate-fade-in">
      <h2 className="text-sm font-bold text-foreground">الصحة العامة للحساب</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Health Score */}
        <div className={cn("rounded-xl border p-5 flex flex-col items-center gap-3", config.bgColor)}>
          <Icon className={cn("w-10 h-10", config.color)} />
          <div className="text-center">
            <p className={cn("text-lg font-bold", config.color)}>{config.label}</p>
            <p className="text-xs text-muted-foreground mt-1">تقييم صحة الحساب</p>
          </div>
          <div className="w-full max-w-[200px]">
            <Progress value={health.score} className="h-2" />
            <p className="text-center text-xs text-muted-foreground mt-1">{health.score}%</p>
          </div>
          {health.factors.length > 0 && (
            <div className="w-full mt-2 space-y-1">
              {health.factors.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-1 h-1 rounded-full bg-muted-foreground" />
                  {f}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="bg-card rounded-xl border border-border p-4">
          <HealthCard label="جودة الرقم" value={q.v} status={q.s} />
          <HealthCard
            label="التوثيق"
            value={data.metaBusinessVerification === "verified" ? "موثق" : "غير موثق"}
            status={data.metaBusinessVerification === "verified" ? "good" : "warning"}
          />
          <HealthCard
            label="حالة الربط"
            value={data.waStatus.isConnected ? "مفعّل" : data.waStatus.phoneNumberId ? "معلق" : "غير مربوط"}
            status={data.waStatus.isConnected ? "good" : "bad"}
          />
          <HealthCard
            label="نسبة الفشل (7 أيام)"
            value={`${failRate7}%`}
            status={failRate7 > 15 ? "bad" : failRate7 > 5 ? "warning" : "good"}
          />
          <HealthCard
            label="رصيد المحفظة"
            value={`${data.walletBalance} ر.س`}
            status={data.walletBalance > 20 ? "good" : data.walletBalance > 0 ? "warning" : "bad"}
          />
          <HealthCard
            label="الاشتراك"
            value={data.planName}
            status="neutral"
          />
        </div>
      </div>
    </div>
  );
};

export default AccountHealth;
