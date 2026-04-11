import { Wifi, WifiOff, Phone, ShieldCheck, ShieldX, Signal, Gauge, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardData, ChannelStatus } from "@/hooks/useDashboardData";
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
  success: "bg-success/8 text-success border-success/15 shadow-[0_0_15px_-3px_hsl(var(--success)/0.15)]",
  warning: "bg-warning/8 text-warning border-warning/15 shadow-[0_0_15px_-3px_hsl(var(--warning)/0.15)]",
  danger: "bg-destructive/8 text-destructive border-destructive/15 shadow-[0_0_15px_-3px_hsl(var(--destructive)/0.15)]",
  neutral: "bg-muted/50 text-muted-foreground border-border/50",
};

const dotColors = {
  success: "bg-success shadow-[0_0_6px_hsl(var(--success)/0.6)]",
  warning: "bg-warning shadow-[0_0_6px_hsl(var(--warning)/0.6)]",
  danger: "bg-destructive shadow-[0_0_6px_hsl(var(--destructive)/0.6)]",
  neutral: "bg-muted-foreground",
};

const getConnectionStatus = (ch: ChannelStatus): StatusItem => {
  if (!ch.waStatus.phoneNumberId && ch.channelType === "official") return { label: "حالة الربط", value: "غير متصل", status: "danger", icon: WifiOff };
  if (!ch.waStatus.isConnected) return { label: "حالة الربط", value: "يحتاج إجراء", status: "warning", icon: AlertTriangle };
  return { label: "حالة الربط", value: "متصل", status: "success", icon: Wifi };
};

const getPhoneStatus = (ch: ChannelStatus): StatusItem => {
  if (!ch.metaPhoneStatus) return { label: "حالة الرقم", value: "غير محدد", status: "neutral", icon: Phone };
  const map: Record<string, { value: string; status: "success" | "warning" | "danger" }> = {
    VERIFIED: { value: "نشط", status: "success" },
    NOT_VERIFIED: { value: "قيد الإعداد", status: "warning" },
    PENDING: { value: "معلق", status: "warning" },
    FLAGGED: { value: "محظور", status: "danger" },
    RESTRICTED: { value: "مقيد", status: "danger" },
  };
  const s = map[ch.metaPhoneStatus] || { value: ch.metaPhoneStatus, status: "neutral" as const };
  return { label: "حالة الرقم", value: s.value, status: s.status, icon: Phone };
};

const getBusinessStatus = (ch: ChannelStatus): StatusItem => {
  if (!ch.metaBusinessVerification) return { label: "النشاط التجاري", value: "غير موثق", status: "warning", icon: ShieldX };
  const map: Record<string, { value: string; status: "success" | "warning" | "danger" }> = {
    verified: { value: "موثق", status: "success" },
    not_verified: { value: "غير موثق", status: "warning" },
    pending: { value: "قيد المراجعة", status: "warning" },
    rejected: { value: "مرفوض", status: "danger" },
  };
  const s = map[ch.metaBusinessVerification] || { value: ch.metaBusinessVerification, status: "neutral" as const };
  return { label: "النشاط التجاري", value: s.value, status: s.status, icon: s.status === "success" ? ShieldCheck : ShieldX };
};

const getQualityStatus = (ch: ChannelStatus): StatusItem => {
  if (!ch.metaQualityRating) return { label: "جودة الرقم", value: "غير محدد", status: "neutral", icon: Signal };
  const map: Record<string, { value: string; status: "success" | "warning" | "danger" }> = {
    GREEN: { value: "عالية", status: "success" },
    YELLOW: { value: "متوسطة", status: "warning" },
    RED: { value: "منخفضة", status: "danger" },
  };
  const s = map[ch.metaQualityRating] || { value: ch.metaQualityRating, status: "neutral" as const };
  return { label: "جودة الرقم", value: s.value, status: s.status, icon: Signal };
};

const getMessagingLimit = (ch: ChannelStatus): StatusItem => {
  if (!ch.metaMessagingLimit) return { label: "حد الإرسال", value: "غير محدد", status: "neutral", icon: Gauge };
  const tierMap: Record<string, string> = {
    TIER_1K: "1,000 / يوم",
    TIER_10K: "10,000 / يوم",
    TIER_100K: "100,000 / يوم",
    TIER_250: "250 / يوم",
    UNLIMITED: "غير محدود",
  };
  return { label: "حد الإرسال", value: tierMap[ch.metaMessagingLimit] || ch.metaMessagingLimit, status: "neutral", icon: Gauge };
};

const ChannelStatusCard = ({ channel }: { channel: ChannelStatus }) => {
  const isOfficial = channel.channelType === "official";

  const items: StatusItem[] = [
    getConnectionStatus(channel),
    ...(isOfficial ? [
      getPhoneStatus(channel),
      getBusinessStatus(channel),
      getQualityStatus(channel),
      getMessagingLimit(channel),
    ] : []),
  ];

  const lastSync = channel.waStatus.lastSync
    ? format(new Date(channel.waStatus.lastSync), "d MMM yyyy HH:mm", { locale: ar })
    : "لم تتم المزامنة";

  const channelName = channel.channelLabel || channel.waStatus.displayPhone || channel.waStatus.businessName || "قناة";
  const typeBadge = isOfficial ? "رسمي" : "QR";

  return (
    <div className="bg-card/60 backdrop-blur-sm rounded-2xl border border-border/40 shadow-card p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <div className={cn("w-1.5 h-5 rounded-full", isOfficial ? "bg-primary" : "bg-warning")} />
          <span className="truncate max-w-[200px]">{channelName}</span>
          <span className={cn(
            "text-[10px] font-medium px-2 py-0.5 rounded-full border",
            isOfficial
              ? "bg-primary/10 text-primary border-primary/20"
              : "bg-warning/10 text-warning border-warning/20"
          )}>
            {typeBadge}
          </span>
        </h2>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-secondary/50 rounded-lg px-2.5 py-1">
          <Clock className="w-3 h-3" />
          <span>{lastSync}</span>
        </div>
      </div>
      <div className={cn(
        "grid gap-3",
        isOfficial ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-1 max-w-[200px]"
      )}>
        {items.map((item) => (
          <div
            key={item.label}
            className={cn(
              "rounded-xl border px-3.5 py-3 flex flex-col gap-2 transition-all hover:scale-[1.02] duration-200",
              statusColors[item.status]
            )}
          >
            <div className="flex items-center gap-2">
              <item.icon className="w-4 h-4 opacity-70" />
              <span className="text-[11px] font-medium opacity-70">{item.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full", dotColors[item.status])} />
              <span className="text-sm font-bold">{item.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const StatusBar = ({ data }: StatusBarProps) => {
  // If no channels at all, show a single "not connected" card using legacy data
  if (data.channels.length === 0) {
    const legacyChannel: ChannelStatus = {
      id: "legacy",
      channelType: data.channelType,
      channelLabel: null,
      waStatus: data.waStatus,
      metaPhoneStatus: data.metaPhoneStatus,
      metaBusinessVerification: data.metaBusinessVerification,
      metaQualityRating: data.metaQualityRating,
      metaMessagingLimit: data.metaMessagingLimit,
      tokenExpiresAt: data.tokenExpiresAt,
      tokenRefreshError: data.tokenRefreshError,
    };
    return <ChannelStatusCard channel={legacyChannel} />;
  }

  return (
    <div className="space-y-4">
      {data.channels.map((ch) => (
        <ChannelStatusCard key={ch.id} channel={ch} />
      ))}
    </div>
  );
};

export default StatusBar;
