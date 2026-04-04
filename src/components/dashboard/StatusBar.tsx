import { Wifi, WifiOff, Phone, ShieldCheck, ShieldX, Signal, Gauge, Clock, AlertTriangle } from "lucide-react";
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
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  neutral: "text-muted-foreground",
};

const dotColors = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  neutral: "bg-muted-foreground/40",
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
  const isOfficial = data.channelType === "official";
  
  const items: StatusItem[] = [
    getConnectionStatus(data),
    ...(isOfficial ? [
      getPhoneStatus(data),
      getBusinessStatus(data),
      getQualityStatus(data),
      getMessagingLimit(data),
    ] : []),
  ];

  const lastSync = data.waStatus.lastSync
    ? format(new Date(data.waStatus.lastSync), "d MMM yyyy HH:mm", { locale: ar })
    : "لم تتم المزامنة";

  return (
    <div className="bg-card rounded-lg border border-border p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-foreground">حالة الحساب</h2>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{lastSync}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-md border border-border bg-secondary/30 px-3 py-3 flex flex-col gap-1.5"
          >
            <div className="flex items-center gap-1.5">
              <item.icon className={cn("w-3.5 h-3.5", statusColors[item.status])} />
              <span className="text-[11px] text-muted-foreground">{item.label}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={cn("w-1.5 h-1.5 rounded-full", dotColors[item.status])} />
              <span className={cn("text-sm font-semibold", statusColors[item.status])}>{item.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StatusBar;
