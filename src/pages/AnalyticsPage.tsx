import { MessageSquare, Clock, CheckCircle2, TrendingUp, AlertTriangle, Users } from "lucide-react";
import KpiCard from "@/components/KpiCard";
import { analyticsData, agents } from "@/data/mockData";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

const AnalyticsPage = () => {
  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-xl font-bold">التحليلات والأداء</h1>
        <p className="text-sm text-muted-foreground mt-1">نظرة شاملة على أداء الفريق وحجم العمل</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={MessageSquare} title="إجمالي المحادثات" value="401" trend={{ value: "+12%", positive: true }} colorIndex={1} />
        <KpiCard icon={Clock} title="متوسط وقت أول رد" value="1.4 د" subtitle="الهدف: أقل من 2 دقيقة" trend={{ value: "-8%", positive: true }} colorIndex={2} />
        <KpiCard icon={CheckCircle2} title="المحادثات المغلقة" value="154" trend={{ value: "+5%", positive: true }} colorIndex={3} />
        <KpiCard icon={AlertTriangle} title="محادثات متأخرة" value="7" trend={{ value: "+2", positive: false }} colorIndex={4} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-lg p-5 shadow-card animate-fade-in">
          <h3 className="font-semibold text-sm mb-4">المحادثات اليومية</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={analyticsData.dailyConversations}>
              <defs>
                <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142 64% 42%)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(142 64% 42%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
              <XAxis dataKey="day" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(220 13% 91%)", fontSize: 12 }} />
              <Area type="monotone" dataKey="count" stroke="hsl(142 64% 42%)" fill="url(#greenGrad)" strokeWidth={2} name="محادثات" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-lg p-5 shadow-card animate-fade-in">
          <h3 className="font-semibold text-sm mb-4">أوقات الذروة</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={analyticsData.hourlyDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
              <XAxis dataKey="hour" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(220 13% 91%)", fontSize: 12 }} />
              <Bar dataKey="count" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} name="محادثات" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Team Performance Table */}
      <div className="bg-card rounded-lg shadow-card animate-fade-in">
        <div className="p-5 border-b border-border flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">أداء الفريق</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-right p-4 text-xs font-semibold text-muted-foreground">الموظف</th>
                <th className="text-right p-4 text-xs font-semibold text-muted-foreground">محادثات نشطة</th>
                <th className="text-right p-4 text-xs font-semibold text-muted-foreground">متوسط الرد</th>
                <th className="text-right p-4 text-xs font-semibold text-muted-foreground">تم حلها</th>
                <th className="text-right p-4 text-xs font-semibold text-muted-foreground">الرضا</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                        {agent.initials}
                      </div>
                      <span className="font-medium">{agent.name}</span>
                    </div>
                  </td>
                  <td className="p-4 font-semibold">{agent.activeChats}</td>
                  <td className="p-4">{agent.avgResponseTime}</td>
                  <td className="p-4 font-semibold">{agent.resolved}</td>
                  <td className="p-4">
                    <span className="text-xs font-bold px-2 py-1 rounded-full bg-success/10 text-success">
                      {agent.satisfaction}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;
