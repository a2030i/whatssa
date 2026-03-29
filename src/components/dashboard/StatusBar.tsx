import { Wifi, WifiOff, Phone, ShieldCheck, ShieldX, Signal, Gauge, RefreshCw, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardData } from "@/hooks/useDashboardData";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface StatusBarProps {
  data: DashboardData;
}

interface StatusItem {
  label: string;
  value: string;
  status: "success" | "warning" | "danger" | "neutral";
  icon: any;
}

const statusColors = {
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  danger: "bg-destructive/10 text-destructive border-destructive/20",
  neutral: "bg-muted text-muted-foreground border-border",
};

const dotColors = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  neutral: "bg-muted-foreground",
};

const getConnectionStatus = (data: DashboardData): StatusItem => {
  if (!data.waStatus.phoneNumberId) return { label: "حالة الربط", value: "غير متصل", status: "danger", icon: WifiOff };
  if (!data.waStatus.isConnected) return { label: "حالة الربط", value: "يحتاج إجراء", status: "warning", icon: AlertTriangle };
  return { label: "حالة الربط", value: "متصل", status: "success", icon: Wifi };
};

const getPhoneStatus = (data: DashboardData): StatusItem => {
  if (!data.metaPhoneStatus) return { label: "حالة الرقم", value: "غير محدد", status: "neutral", icon: Phone };
  const map: Record<string, { value: string; status: "success" | "warning" | "danger" }> = {
    VERIFIED: { value: "نشط", status: "success" },
    NOT_VERIFIED: { value: "قيد الإعداد", status: "warning" },
    PENDING: { value: "معلق", status: "warning" },
    FLAGGED: { value: "محظور", status: "danger" },
    RESTRICTED: { value: "مقيد", status: "danger" },
  };
  const s = map[data.metaPhoneStatus] || { value: data.metaPhoneStatus, status: "neutral" as const };
  return { label: "حالة الرقم", value: s.value, status: s.status, icon: Phone };
};

const getBusinessStatus = (data: DashboardData): StatusItem => {
  if (!data.metaBusinessVerification) return { label: "النشاط التجاري", value: "غير موثق", status: "warning", icon: ShieldX };
  const map: Record<string, { value: string; status: "success" | "warning" | "danger" }> = {
    verified: { value: "موثق", status: "success" },
    not_verified: { value: "غير موثق", status: "warning" },
    pending: { value: "قيد المراجعة", status: "warning" },
    rejected: { value: "مرفوض", status: "danger" },
  };
  const s = map[data.metaBusinessVerification] || { value: data.metaBusinessVerification, status: "neutral" as const };
  return { label: "النشاط التجاري", value: s.value, status: s.status, icon: s.status === "success" ? ShieldCheck : ShieldX };
};

const getQualityStatus = (data: DashboardData): StatusItem => {
  if (!data.metaQualityRating) return { label: "جودة الرقم", value: "غير محدد", status: "neutral", icon: Signal };
  const map: Record<string, { value: string; status: "success" | "warning" | "danger" }> = {
    GREEN: { value: "عالية", status: "success" },
    YELLOW: { value: "متوسطة", status: "warning" },
    RED: { value: "منخفضة", status: "danger" },
  };
  const s = map[data.metaQualityRating] || { value: data.metaQualityRating, status: "neutral" as const };
  return { label: "جودة الرقم", value: s.value, status: s.status, icon: Signal };
};

const getMessagingLimit = (data: DashboardData): StatusItem => {
  if (!data.metaMessagingLimit) return { label: "حد الإرسال", value: "غير محدد", status: "neutral", icon: Gauge };
  const tierMap: Record<string, string> = {
    TIER_1K: "1,000 / يوم",
    TIER_10K: "10,000 / يوم",
    TIER_100K: "100,000 / يوم",
    TIER_250: "250 / يوم",
    UNLIMITED: "غير محدود",
  };
  return { label: "حد الإرسال", value: tierMap[data.metaMessagingLimit] || data.metaMessagingLimit, status: "neutral", icon: Gauge };
};

const StatusBar = ({ data }: StatusBarProps) => {
  const items: StatusItem[] = [
    getConnectionStatus(data),
    getPhoneStatus(data),
    getBusinessStatus(data),
    getQualityStatus(data),
    getMessagingLimit(data),
  ];

  const lastSync = data.waStatus.lastSync
    ? format(new Date(data.waStatus.lastSync), "d MMM yyyy HH:mm", { locale: ar })
    : "لم تتم المزامنة";

  return (
    <div className="bg-card rounded-xl border border-border shadow-card p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-foreground">حالة الحساب</h2>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>آخر تحديث: {lastSync}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {items.map((item) => (
          <div
            key={item.label}
            className={cn(
              "rounded-lg border px-3 py-2.5 flex flex-col gap-1.5 transition-all",
              statusColors[item.status]
            )}
          >
            <div className="flex items-center gap-2">
              <item.icon className="w-4 h-4" />
              <span className="text-[11px] font-medium opacity-80">{item.label}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={cn("w-2 h-2 rounded-full animate-pulse", dotColors[item.status])} />
              <span className="text-sm font-bold">{item.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StatusBar;
