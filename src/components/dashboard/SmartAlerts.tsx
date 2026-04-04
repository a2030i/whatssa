import { AlertTriangle, ShieldCheck, Wallet, Send, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardData } from "@/hooks/useDashboardData";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface Alert {
  id: string;
  message: string;
  severity: "critical" | "warning" | "info";
  action?: { label: string; path?: string; onClick?: () => void };
  icon: any;
}

const severityStyles = {
  critical: "border-destructive/20 bg-destructive/5 hover:bg-destructive/8",
  warning: "border-warning/20 bg-warning/5 hover:bg-warning/8",
  info: "border-info/20 bg-info/5 hover:bg-info/8",
};

const severityIconBg = {
  critical: "bg-destructive/15 text-destructive",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/15 text-info",
};

const SmartAlerts = ({ data }: { data: DashboardData }) => {
  const navigate = useNavigate();
  const alerts: Alert[] = [];
  const isOfficial = data.channelType === "official";
  const isConnected = data.waStatus.isConnected || data.channelType !== null;

  if (!isConnected) {
    alerts.push({ id: "no-connection", message: "لم يتم ربط رقم واتساب بعد. اربط رقمك الآن لبدء استقبال وإرسال الرسائل.", severity: "critical", action: { label: "ربط الرقم", path: "/integrations" }, icon: AlertTriangle });
  }
  if (isOfficial && data.waStatus.phoneNumberId && data.metaPhoneStatus && data.metaPhoneStatus !== "VERIFIED") {
    alerts.push({ id: "phone-pending", message: "رقمك ما زال معلقًا ويحتاج مراجعة إعدادات Meta أو تسجيل الرقم.", severity: "critical", action: { label: "مراجعة الإعدادات", path: "/integrations" }, icon: AlertTriangle });
  }
  if (isOfficial && data.metaBusinessVerification && data.metaBusinessVerification !== "verified") {
    const lowTier = data.metaMessagingLimit === "TIER_250" || data.metaMessagingLimit === "TIER_1K";
    alerts.push({ id: "biz-unverified", message: lowTier ? "نشاطك في نمو، لكن حد الإرسال الحالي قد يقيّدك. فعّل التوثيق الآن لتفادي تعطّل الحملات." : "حسابك غير موثق وحد الإرسال الحالي منخفض. وثّق نشاطك التجاري لرفع الحد.", severity: "warning", action: { label: "توثيق الآن", path: "/integrations" }, icon: ShieldCheck });
  }
  if (isOfficial && data.metaQualityRating === "YELLOW") {
    alerts.push({ id: "quality-yellow", message: "جودة الرقم انخفضت إلى متوسطة خلال آخر الأيام. قلل الإرسال المتكرر لنفس الشريحة.", severity: "warning", icon: AlertTriangle });
  }
  if (isOfficial && data.metaQualityRating === "RED") {
    alerts.push({ id: "quality-red", message: "هناك تراجع حاد في جودة الرقم. راجع القوالب الأخيرة وقلل الإرسال المتكرر فورًا.", severity: "critical", action: { label: "مراجعة القوالب", path: "/templates" }, icon: AlertTriangle });
  }
  if (data.waStatus.isConnected && data.messageStats.sent30Days === 0) {
    alerts.push({ id: "no-messages", message: "تم الربط بنجاح، لكن لم يتم تنفيذ أول إرسال بعد. أرسل رسالة اختبار للتأكد من الجاهزية.", severity: "info", action: { label: "إرسال رسالة", path: "/" }, icon: Send });
  }
  if (data.messageStats.sent7Days > 10) {
    const failRate = data.messageStats.failed7Days / data.messageStats.sent7Days;
    if (failRate > 0.15) {
      alerts.push({ id: "high-failure", message: `نسبة فشل الرسائل مرتفعة (${Math.round(failRate * 100)}% خلال 7 أيام). تحقق من أرقام العملاء والقوالب.`, severity: "warning", icon: AlertTriangle });
    }
  }
  if (data.walletBalance <= 5) {
    alerts.push({ id: "low-wallet", message: "رصيد المحفظة منخفض. شحن المحفظة لضمان استمرار الخدمة.", severity: "warning", action: { label: "شحن المحفظة", path: "/wallet" }, icon: Wallet });
  }

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-3 animate-fade-in">
      <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
        <div className="w-1.5 h-5 rounded-full bg-warning" />
        تنبيهات تنفيذية
      </h2>
      <div className="space-y-2">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={cn(
              "rounded-xl border p-4 flex items-start gap-3 transition-all duration-200",
              severityStyles[alert.severity]
            )}
          >
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", severityIconBg[alert.severity])}>
              <alert.icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground leading-relaxed">{alert.message}</p>
            </div>
            {alert.action && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 text-xs h-8 gap-1 rounded-lg border-border/50 hover:bg-card"
                onClick={() => alert.action?.path && navigate(alert.action.path)}
              >
                {alert.action.label}
                <ArrowLeft className="w-3 h-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SmartAlerts;
