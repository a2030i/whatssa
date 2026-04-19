import { Send, CheckCheck, XCircle, MessageSquare, Users, Bot, TrendingUp, TrendingDown } from "lucide-react";
import { DashboardData } from "@/hooks/useDashboardData";

const OperationalMetricsNew = ({ data }: { data: DashboardData }) => {
  const deliveryRate7 = data.messageStats.sent7Days > 0
    ? Math.round((data.messageStats.delivered7Days / data.messageStats.sent7Days) * 100) : 0;
  const deliveryRate30 = data.messageStats.sent30Days > 0
    ? Math.round((data.messageStats.delivered30Days / data.messageStats.sent30Days) * 100) : 0;
  const failRate7 = data.messageStats.sent7Days > 0
    ? Math.round((data.messageStats.failed7Days / data.messageStats.sent7Days) * 100) : 0;

  const metrics = [
    {
      icon: "📤",
      val: data.messageStats.sentToday,
      label: "أُرسل اليوم",
      sub: `${data.messageStats.delivered7Days >= data.messageStats.sent7Days * 0.9 ? "✅" : "⚠️"} ${deliveryRate7}% توصيل`,
      trend: deliveryRate7 >= 90 ? "up" : "down",
      color: "#25D366",
      bg: "#dcfce7",
    },
    {
      icon: "📅",
      val: data.messageStats.sent7Days,
      label: "آخر 7 أيام",
      sub: `${deliveryRate7}% معدل التوصيل`,
      trend: deliveryRate7 >= 80 ? "up" : "down",
      color: "#6366f1",
      bg: "#ede9fe",
    },
    {
      icon: "📆",
      val: data.messageStats.sent30Days,
      label: "آخر 30 يوم",
      sub: `${deliveryRate30}% معدل التوصيل`,
      trend: deliveryRate30 >= 80 ? "up" : "down",
      color: "#0ea5e9",
      bg: "#dbeafe",
    },
    {
      icon: "✅",
      val: data.messageStats.delivered7Days,
      label: "وصلت (7 أيام)",
      sub: "رسائل موصّلة",
      trend: "up",
      color: "#16a34a",
      bg: "#dcfce7",
    },
    {
      icon: "❌",
      val: data.messageStats.failed7Days,
      label: "فشلت (7 أيام)",
      sub: `${failRate7}% من المرسلة`,
      trend: failRate7 > 10 ? "down" : "up",
      color: failRate7 > 10 ? "#dc2626" : "#16a34a",
      bg: failRate7 > 10 ? "#fee2e2" : "#dcfce7",
    },
    {
      icon: "💬",
      val: data.openConversations,
      label: "محادثات مفتوحة",
      sub: `من ${data.totalConversations} إجمالي`,
      trend: "neutral",
      color: "#f59e0b",
      bg: "#fef3c7",
    },
    {
      icon: "📥",
      val: data.messageStats.totalReceived,
      label: "رسائل واردة",
      sub: "آخر 30 يوم",
      trend: "up",
      color: "#8b5cf6",
      bg: "#ede9fe",
    },
    {
      icon: "🤖",
      val: data.automationCount,
      label: "قواعد الأتمتة",
      sub: "نشطة",
      trend: "neutral",
      color: "#0ea5e9",
      bg: "#dbeafe",
    },
  ];

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Section Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{ width: 4, height: 20, borderRadius: 99, background: "#25D366" }} />
        <p style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: 0 }}>الأداء التشغيلي</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        {metrics.map((m, i) => (
          <div key={i} style={{
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #e8ecf0",
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            transition: "all .2s",
          }}>
            {/* Icon */}
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: m.bg,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, flexShrink: 0,
            }}>
              {m.icon}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>{m.val}</span>
                {m.trend === "up" && <TrendingUp style={{ width: 12, height: 12, color: "#16a34a", flexShrink: 0 }} />}
                {m.trend === "down" && <TrendingDown style={{ width: 12, height: 12, color: "#dc2626", flexShrink: 0 }} />}
              </div>
              <p style={{ fontSize: 11, color: "#64748b", margin: "2px 0 0", fontWeight: 500 }}>{m.label}</p>
              <p style={{ fontSize: 10, color: m.color, margin: "3px 0 0", fontWeight: 600 }}>{m.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OperationalMetricsNew;