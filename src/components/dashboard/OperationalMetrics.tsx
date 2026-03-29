import { MessageSquare, Send, CheckCheck, XCircle, BarChart3, Users, Bot, FileText } from "lucide-react";
import { DashboardData } from "@/hooks/useDashboardData";
import { cn } from "@/lib/utils";

const MetricCard = ({ icon: Icon, label, value, subtitle, color }: {
  icon: any; label: string; value: string | number; subtitle?: string; color: string;
}) => (
  <div className="bg-card rounded-lg border border-border p-4 hover:shadow-card transition-shadow animate-fade-in">
    <div className="flex items-center gap-2 mb-2">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", color)}>
        <Icon className="w-4 h-4" />
      </div>
    </div>
    <p className="text-2xl font-bold text-foreground">{value}</p>
    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
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
    <div className="space-y-3 animate-fade-in">
      <h2 className="text-sm font-bold text-foreground">الأداء التشغيلي</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          icon={Send}
          label="الرسائل المرسلة اليوم"
          value={data.messageStats.sentToday}
          color="bg-primary/10 text-primary"
        />
        <MetricCard
          icon={Send}
          label="آخر 7 أيام"
          value={data.messageStats.sent7Days}
          subtitle={`${deliveryRate7}% معدل التسليم`}
          color="bg-info/10 text-info"
        />
        <MetricCard
          icon={Send}
          label="آخر 30 يوم"
          value={data.messageStats.sent30Days}
          subtitle={`${deliveryRate30}% معدل التسليم`}
          color="bg-info/10 text-info"
        />
        <MetricCard
          icon={CheckCheck}
          label="الرسائل الناجحة (7 أيام)"
          value={data.messageStats.delivered7Days}
          color="bg-success/10 text-success"
        />
        <MetricCard
          icon={XCircle}
          label="الرسائل الفاشلة (7 أيام)"
          value={data.messageStats.failed7Days}
          color="bg-destructive/10 text-destructive"
        />
        <MetricCard
          icon={MessageSquare}
          label="المحادثات المفتوحة"
          value={data.openConversations}
          subtitle={`من ${data.totalConversations} إجمالي`}
          color="bg-primary/10 text-primary"
        />
        <MetricCard
          icon={Users}
          label="الرسائل الواردة"
          value={data.messageStats.totalReceived}
          color="bg-warning/10 text-warning"
        />
        <MetricCard
          icon={Bot}
          label="قواعد الأتمتة"
          value={data.automationCount}
          color="bg-accent text-accent-foreground"
        />
      </div>
    </div>
  );
};

export default OperationalMetrics;
