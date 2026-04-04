import { MessageSquare, Send, CheckCheck, XCircle, Users, Bot } from "lucide-react";
import { DashboardData } from "@/hooks/useDashboardData";
import { cn } from "@/lib/utils";

const MetricCard = ({ icon: Icon, label, value, subtitle, color, iconBg }: {
  icon: any; label: string; value: string | number; subtitle?: string; color: string; iconBg: string;
}) => (
  <div className="bg-card rounded-lg border border-border p-4 animate-fade-in">
    <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center mb-3", iconBg)}>
      <Icon className={cn("w-[18px] h-[18px]", color)} />
    </div>
    <p className="text-xl font-bold text-foreground">{value}</p>
    <p className="text-xs text-muted-foreground mt-1">{label}</p>
    {subtitle && <p className="text-[11px] text-muted-foreground/60 mt-0.5">{subtitle}</p>}
  </div>
);

const OperationalMetrics = ({ data }: { data: DashboardData }) => {
  const deliveryRate7 = data.messageStats.sent7Days > 0
    ? Math.round((data.messageStats.delivered7Days / data.messageStats.sent7Days) * 100)
    : 0;

  const deliveryRate30 = data.messageStats.sent30Days > 0
    ? Math.round((data.messageStats.delivered30Days / data.messageStats.sent30Days) * 100)
    : 0;

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-sm font-semibold text-foreground">الأداء التشغيلي</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={Send} label="الرسائل المرسلة اليوم" value={data.messageStats.sentToday} color="text-primary" iconBg="bg-primary/10" />
        <MetricCard icon={Send} label="آخر 7 أيام" value={data.messageStats.sent7Days} subtitle={`${deliveryRate7}% معدل التسليم`} color="text-info" iconBg="bg-info/10" />
        <MetricCard icon={Send} label="آخر 30 يوم" value={data.messageStats.sent30Days} subtitle={`${deliveryRate30}% معدل التسليم`} color="text-info" iconBg="bg-info/10" />
        <MetricCard icon={CheckCheck} label="الرسائل الناجحة (7 أيام)" value={data.messageStats.delivered7Days} color="text-success" iconBg="bg-success/10" />
        <MetricCard icon={XCircle} label="الرسائل الفاشلة (7 أيام)" value={data.messageStats.failed7Days} color="text-destructive" iconBg="bg-destructive/10" />
        <MetricCard icon={MessageSquare} label="المحادثات المفتوحة" value={data.openConversations} subtitle={`من ${data.totalConversations} إجمالي`} color="text-primary" iconBg="bg-primary/10" />
        <MetricCard icon={Users} label="الرسائل الواردة" value={data.messageStats.totalReceived} color="text-warning" iconBg="bg-warning/10" />
        <MetricCard icon={Bot} label="قواعد الأتمتة" value={data.automationCount} color="text-accent-foreground" iconBg="bg-accent" />
      </div>
    </div>
  );
};

export default OperationalMetrics;
