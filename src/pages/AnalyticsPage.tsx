import { useState, useEffect } from "react";
import { MessageSquare, Clock, CheckCircle2, AlertTriangle, Users, Download, Calendar, BarChart3, PieChart as PieChartIcon, Loader2 } from "lucide-react";
import KpiCard from "@/components/KpiCard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const AnalyticsPage = () => {
  const { orgId } = useAuth();
  const [period, setPeriod] = useState("week");
  const [loading, setLoading] = useState(true);

  // Real data state
  const [totalConversations, setTotalConversations] = useState(0);
  const [closedConversations, setClosedConversations] = useState(0);
  const [escalatedConversations, setEscalatedConversations] = useState(0);
  const [avgFirstResponse, setAvgFirstResponse] = useState(0);
  const [dailyData, setDailyData] = useState<{ day: string; count: number }[]>([]);
  const [teamData, setTeamData] = useState<{ name: string; activeChats: number; resolved: number; avgResponse: string }[]>([]);
  const [satisfactionData, setSatisfactionData] = useState<{ rating: string; count: number; color: string }[]>([]);

  useEffect(() => {
    if (!orgId) return;
    fetchAnalytics();
  }, [orgId, period]);

  const getDateRange = () => {
    const now = new Date();
    let start: Date;
    switch (period) {
      case "today": start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
      case "month": start = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case "quarter": start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()); break;
      default: start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
    }
    return { start: start.toISOString(), end: now.toISOString() };
  };

  const fetchAnalytics = async () => {
    setLoading(true);
    const { start, end } = getDateRange();

    const [convRes, closedRes, escalatedRes, frtRes, dailyRes, teamRes, satRes] = await Promise.all([
      // Total conversations in period
      supabase.from("conversations").select("id", { count: "exact", head: true })
        .eq("org_id", orgId).gte("created_at", start).lte("created_at", end),
      // Closed conversations
      supabase.from("conversations").select("id", { count: "exact", head: true })
        .eq("org_id", orgId).eq("status", "closed").gte("closed_at", start).lte("closed_at", end),
      // Escalated / late conversations
      supabase.from("conversations").select("id", { count: "exact", head: true })
        .eq("org_id", orgId).eq("escalated", true).gte("created_at", start),
      // Average first response time
      supabase.from("conversations").select("created_at, first_response_at")
        .eq("org_id", orgId).not("first_response_at", "is", null).gte("created_at", start).lte("created_at", end).limit(500),
      // Daily conversations
      supabase.from("conversations").select("created_at")
        .eq("org_id", orgId).gte("created_at", start).lte("created_at", end).limit(1000),
      // Team: active chats per agent
      supabase.from("conversations").select("assigned_to, status, profiles!conversations_assigned_to_fkey(full_name)")
        .eq("org_id", orgId).not("assigned_to", "is", null).gte("created_at", start).limit(1000),
      // Satisfaction ratings
      supabase.from("satisfaction_ratings").select("rating")
        .eq("org_id", orgId).gte("created_at", start).lte("created_at", end),
    ]);

    setTotalConversations(convRes.count ?? 0);
    setClosedConversations(closedRes.count ?? 0);
    setEscalatedConversations(escalatedRes.count ?? 0);

    // Calc avg FRT in minutes
    if (frtRes.data && frtRes.data.length > 0) {
      const diffs = frtRes.data.map(c => {
        const created = new Date(c.created_at!).getTime();
        const responded = new Date(c.first_response_at!).getTime();
        return (responded - created) / 60000;
      }).filter(d => d > 0 && d < 1440);
      const avg = diffs.length > 0 ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
      setAvgFirstResponse(Math.round(avg * 10) / 10);
    } else {
      setAvgFirstResponse(0);
    }

    // Group daily
    if (dailyRes.data) {
      const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
      const grouped: Record<string, number> = {};
      dailyRes.data.forEach(c => {
        const d = new Date(c.created_at!);
        const key = dayNames[d.getDay()];
        grouped[key] = (grouped[key] || 0) + 1;
      });
      setDailyData(dayNames.map(day => ({ day, count: grouped[day] || 0 })));
    }

    // Team performance
    if (teamRes.data) {
      const agentMap: Record<string, { name: string; active: number; closed: number }> = {};
      teamRes.data.forEach((c: any) => {
        const id = c.assigned_to;
        const name = c.profiles?.full_name || "غير معروف";
        if (!agentMap[id]) agentMap[id] = { name, active: 0, closed: 0 };
        if (c.status === "closed") agentMap[id].closed++;
        else agentMap[id].active++;
      });
      setTeamData(Object.values(agentMap).map(a => ({
        name: a.name,
        activeChats: a.active,
        resolved: a.closed,
        avgResponse: "-",
      })));
    }

    // Satisfaction
    if (satRes.data && satRes.data.length > 0) {
      const counts = { good: 0, neutral: 0, bad: 0 };
      satRes.data.forEach(r => {
        if (r.rating >= 4) counts.good++;
        else if (r.rating >= 3) counts.neutral++;
        else counts.bad++;
      });
      setSatisfactionData([
        { rating: "راضي", count: counts.good, color: "hsl(142 64% 42%)" },
        { rating: "محايد", count: counts.neutral, color: "hsl(38 92% 50%)" },
        { rating: "غير راضي", count: counts.bad, color: "hsl(0 84% 60%)" },
      ]);
    } else {
      setSatisfactionData([]);
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-6 max-w-[1200px]" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">التحليلات والأداء</h1>
          <p className="text-sm text-muted-foreground mt-1">نظرة شاملة على أداء الفريق وحجم العمل</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[130px] text-xs bg-secondary border-0">
              <Calendar className="w-3 h-3 ml-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">اليوم</SelectItem>
              <SelectItem value="week">هذا الأسبوع</SelectItem>
              <SelectItem value="month">هذا الشهر</SelectItem>
              <SelectItem value="quarter">هذا الربع</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1 text-xs">
            <Download className="w-3.5 h-3.5" /> تصدير
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={MessageSquare} title="إجمالي المحادثات" value={totalConversations} colorIndex={1} />
        <KpiCard icon={Clock} title="متوسط وقت أول رد" value={avgFirstResponse > 0 ? `${avgFirstResponse} د` : "—"} subtitle="الهدف: أقل من 2 دقيقة" colorIndex={2} />
        <KpiCard icon={CheckCircle2} title="المحادثات المغلقة" value={closedConversations} colorIndex={3} />
        <KpiCard icon={AlertTriangle} title="محادثات متأخرة" value={escalatedConversations} colorIndex={4} />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-secondary w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="overview" className="text-xs gap-1"><BarChart3 className="w-3 h-3" /> نظرة عامة</TabsTrigger>
          <TabsTrigger value="team" className="text-xs gap-1"><Users className="w-3 h-3" /> أداء الفريق</TabsTrigger>
          <TabsTrigger value="reports" className="text-xs gap-1"><PieChartIcon className="w-3 h-3" /> تقارير</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card rounded-lg p-5 shadow-card">
              <h3 className="font-semibold text-sm mb-4">المحادثات اليومية</h3>
              {dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={dailyData}>
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
              ) : (
                <p className="text-sm text-muted-foreground text-center py-10">لا توجد بيانات</p>
              )}
            </div>

            <div className="bg-card rounded-lg p-5 shadow-card">
              <h3 className="font-semibold text-sm mb-4">رضا العملاء</h3>
              {satisfactionData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={satisfactionData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={4} dataKey="count" nameKey="rating">
                      {satisfactionData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-10">لا توجد تقييمات</p>
              )}
              {satisfactionData.length > 0 && (
                <div className="flex justify-center gap-4 mt-2">
                  {satisfactionData.map((c) => (
                    <div key={c.rating} className="flex items-center gap-1.5 text-xs">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                      <span className="text-muted-foreground">{c.rating} ({c.count})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="team" className="space-y-4">
          <div className="bg-card rounded-lg shadow-card">
            <div className="p-5 border-b border-border flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">أداء الفريق</h3>
            </div>
            {teamData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-right p-4 text-xs font-semibold text-muted-foreground">الموظف</th>
                      <th className="text-right p-4 text-xs font-semibold text-muted-foreground">محادثات نشطة</th>
                      <th className="text-right p-4 text-xs font-semibold text-muted-foreground">تم حلها</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamData.map((agent, i) => (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                              {agent.name.charAt(0)}
                            </div>
                            <span className="font-medium">{agent.name}</span>
                          </div>
                        </td>
                        <td className="p-4 font-semibold">{agent.activeChats}</td>
                        <td className="p-4 font-semibold">{agent.resolved}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">لا توجد بيانات</p>
            )}
          </div>

          {teamData.length > 0 && (
            <div className="bg-card rounded-lg p-5 shadow-card">
              <h3 className="font-semibold text-sm mb-4">مقارنة أداء الموظفين</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={teamData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
                  <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" fontSize={11} tickLine={false} axisLine={false} width={60} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="activeChats" fill="hsl(142 64% 42%)" radius={[0, 4, 4, 0]} name="نشطة" />
                  <Bar dataKey="resolved" fill="hsl(217 91% 60%)" radius={[0, 4, 4, 0]} name="تم حلها" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <div className="text-sm text-muted-foreground text-center py-10">
            التقارير التفصيلية قيد التطوير — سيتم إضافة تصدير PDF و CSV قريباً
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AnalyticsPage;
