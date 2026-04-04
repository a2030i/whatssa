import { MessageSquare, Send, CheckCheck, XCircle, Users, Bot } from "lucide-react";
import { DashboardData } from "@/hooks/useDashboardData";
import { cn } from "@/lib/utils";

const MetricCard = ({ icon: Icon, label, value, subtitle, color, iconBg }: {
  icon: any; label: string; value: string | number; subtitle?: string; color: string; iconBg: string;
}) => (
  <div className="group relative bg-card/70 backdrop-blur-sm rounded-2xl border border-border/40 p-5 hover:border-border/80 hover:shadow-card-hover transition-all duration-300 animate-fade-in overflow-hidden">
    <div className="absolute inset-0 bg-gradient-to-br from-transparent to-secondary/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none" />
    <div className="relative z-10">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110 duration-300", iconBg)}>
        <Icon className={cn("w-5 h-5", color)} />
      </div>
      <p className="text-2xl font-black text-foreground tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground mt-1 font-medium">{label}</p>
      {subtitle && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{subtitle}</p>}
    </div>
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
      <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
        <div className="w-1.5 h-5 rounded-full bg-info" />
        الأداء التشغيلي
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard icon={Send} label="الرسائل المرسلة اليوم" value={data.messageStats.sentToday} color="text-primary" iconBg="bg-primary/10 ring-1 ring-primary/20" />
        <MetricCard icon={Send} label="آخر 7 أيام" value={data.messageStats.sent7Days} subtitle={`${deliveryRate7}% معدل التسليم`} color="text-info" iconBg="bg-info/10 ring-1 ring-info/20" />
        <MetricCard icon={Send} label="آخر 30 يوم" value={data.messageStats.sent30Days} subtitle={`${deliveryRate30}% معدل التسليم`} color="text-info" iconBg="bg-info/10 ring-1 ring-info/20" />
        <MetricCard icon={CheckCheck} label="الرسائل الناجحة (7 أيام)" value={data.messageStats.delivered7Days} color="text-success" iconBg="bg-success/10 ring-1 ring-success/20" />
        <MetricCard icon={XCircle} label="الرسائل الفاشلة (7 أيام)" value={data.messageStats.failed7Days} color="text-destructive" iconBg="bg-destructive/10 ring-1 ring-destructive/20" />
        <MetricCard icon={MessageSquare} label="المحادثات المفتوحة" value={data.openConversations} subtitle={`من ${data.totalConversations} إجمالي`} color="text-primary" iconBg="bg-primary/10 ring-1 ring-primary/20" />
        <MetricCard icon={Users} label="الرسائل الواردة" value={data.messageStats.totalReceived} color="text-warning" iconBg="bg-warning/10 ring-1 ring-warning/20" />
        <MetricCard icon={Bot} label="قواعد الأتمتة" value={data.automationCount} color="text-accent-foreground" iconBg="bg-accent ring-1 ring-accent-foreground/10" />
      </div>
    </div>
  );
};

export default OperationalMetrics;
