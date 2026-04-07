import { useState, useEffect } from "react";
import { MessageSquare, Clock, CheckCircle2, AlertTriangle, Users, Download, Calendar, BarChart3, PieChart as PieChartIcon, Loader2, TrendingUp, Send, Megaphone, Phone, ArrowUpRight, ArrowDownRight, Flame, GitCompareArrows, DollarSign, Tag } from "lucide-react";
import KpiCard from "@/components/KpiCard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import ActivityHeatmap from "@/components/analytics/ActivityHeatmap";
import PeriodComparison from "@/components/analytics/PeriodComparison";
import CampaignROIReport from "@/components/analytics/CampaignROIReport";
import TagsReport from "@/components/analytics/TagsReport";

const COLORS = [
  "hsl(142 64% 42%)", "hsl(217 91% 60%)", "hsl(280 67% 55%)",
  "hsl(38 92% 50%)", "hsl(0 84% 60%)", "hsl(190 80% 42%)",
];

const AnalyticsPage = () => {
  const { orgId } = useAuth();
  const [period, setPeriod] = useState("week");
  const [loading, setLoading] = useState(true);

  // Data
  const [totalConversations, setTotalConversations] = useState(0);
  const [closedConversations, setClosedConversations] = useState(0);
  const [escalatedConversations, setEscalatedConversations] = useState(0);
  const [avgFirstResponse, setAvgFirstResponse] = useState(0);
  const [dailyData, setDailyData] = useState<{ day: string; count: number; closed: number }[]>([]);
  const [hourlyData, setHourlyData] = useState<{ hour: string; count: number }[]>([]);
  const [teamData, setTeamData] = useState<{ name: string; activeChats: number; resolved: number }[]>([]);
  const [satisfactionData, setSatisfactionData] = useState<{ rating: string; count: number; color: string }[]>([]);
  const [channelData, setChannelData] = useState<{ name: string; count: number }[]>([]);
  const [tagData, setTagData] = useState<{ tag: string; count: number }[]>([]);
  const [campaignStats, setCampaignStats] = useState({ total: 0, sent: 0, delivered: 0, read: 0, failed: 0 });
  const [messageStats, setMessageStats] = useState({ inbound: 0, outbound: 0 });
  const [prevPeriodConversations, setPrevPeriodConversations] = useState(0);

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
    return { start: start.toISOString(), end: now.toISOString(), startDate: start };
  };

  const fetchAnalytics = async () => {
    setLoading(true);
    const { start, end, startDate } = getDateRange();

    // Previous period for comparison
    const periodMs = new Date(end).getTime() - new Date(start).getTime();
    const prevStart = new Date(new Date(start).getTime() - periodMs).toISOString();

    const [convRes, closedRes, escalatedRes, frtRes, dailyRes, teamRes, satRes, prevConvRes, msgsRes, campaignsRes] = await Promise.all([
      supabase.from("conversations").select("id", { count: "exact", head: true })
        .eq("org_id", orgId).gte("created_at", start).lte("created_at", end),
      supabase.from("conversations").select("id", { count: "exact", head: true })
        .eq("org_id", orgId).eq("status", "closed").gte("closed_at", start).lte("closed_at", end),
      supabase.from("conversations").select("id", { count: "exact", head: true })
        .eq("org_id", orgId).eq("escalated", true).gte("created_at", start),
      supabase.from("conversations").select("created_at, first_response_at")
        .eq("org_id", orgId).not("first_response_at", "is", null).gte("created_at", start).lte("created_at", end).limit(500),
      supabase.from("conversations").select("created_at, status, tags, conversation_type")
        .eq("org_id", orgId).gte("created_at", start).lte("created_at", end).limit(1000),
      supabase.from("conversations").select("assigned_to, status, profiles!conversations_assigned_to_fkey(full_name)")
        .eq("org_id", orgId).not("assigned_to", "is", null).gte("created_at", start).limit(1000),
      supabase.from("satisfaction_ratings").select("rating")
        .eq("org_id", orgId).gte("created_at", start).lte("created_at", end),
      supabase.from("conversations").select("id", { count: "exact", head: true })
        .eq("org_id", orgId).gte("created_at", prevStart).lt("created_at", start),
      supabase.from("messages").select("sender", { count: "exact" })
        .gte("created_at", start).lte("created_at", end).limit(1000),
      supabase.from("campaigns").select("id, sent_count, delivered_count, read_count, failed_count")
        .eq("org_id", orgId).gte("created_at", start).lte("created_at", end),
    ]);

    setTotalConversations(convRes.count ?? 0);
    setClosedConversations(closedRes.count ?? 0);
    setEscalatedConversations(escalatedRes.count ?? 0);
    setPrevPeriodConversations(prevConvRes.count ?? 0);

    // Avg FRT
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

    // Daily data with closed count
    if (dailyRes.data) {
      if (period === "today") {
        // Hourly breakdown
        const hourMap: Record<string, number> = {};
        dailyRes.data.forEach(c => {
          const h = new Date(c.created_at!).getHours();
          const key = `${h}:00`;
          hourMap[key] = (hourMap[key] || 0) + 1;
        });
        setHourlyData(Array.from({ length: 24 }, (_, i) => ({ hour: `${i}:00`, count: hourMap[`${i}:00`] || 0 })));
        setDailyData([]);
      } else {
        const dayMap: Record<string, { count: number; closed: number }> = {};
        const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
        dailyRes.data.forEach(c => {
          const d = new Date(c.created_at!);
          const key = period === "month" || period === "quarter"
            ? `${d.getMonth() + 1}/${d.getDate()}`
            : dayNames[d.getDay()];
          if (!dayMap[key]) dayMap[key] = { count: 0, closed: 0 };
          dayMap[key].count++;
          if (c.status === "closed") dayMap[key].closed++;
        });
        if (period === "week") {
          setDailyData(dayNames.map(day => ({ day, count: dayMap[day]?.count || 0, closed: dayMap[day]?.closed || 0 })));
        } else {
          setDailyData(Object.entries(dayMap).map(([day, v]) => ({ day, ...v })));
        }
        setHourlyData([]);
      }

      // Channel breakdown
      const channelMap: Record<string, number> = {};
      dailyRes.data.forEach(c => {
        const type = c.conversation_type === "meta" ? "واتساب رسمي" : c.conversation_type === "evolution" ? "واتساب ويب" : "أخرى";
        channelMap[type] = (channelMap[type] || 0) + 1;
      });
      setChannelData(Object.entries(channelMap).map(([name, count]) => ({ name, count })));

      // Tag breakdown
      const tagMap: Record<string, number> = {};
      dailyRes.data.forEach(c => {
        const tags = c.tags as string[] | null;
        if (tags) tags.forEach(t => { tagMap[t] = (tagMap[t] || 0) + 1; });
      });
      setTagData(Object.entries(tagMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag, count]) => ({ tag, count })));
    }

    // Team
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
        name: a.name, activeChats: a.active, resolved: a.closed,
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
        { rating: "راضي", count: counts.good, color: COLORS[0] },
        { rating: "محايد", count: counts.neutral, color: COLORS[3] },
        { rating: "غير راضي", count: counts.bad, color: COLORS[4] },
      ]);
    } else {
      setSatisfactionData([]);
    }

    // Messages stats
    if (msgsRes.data) {
      const inbound = msgsRes.data.filter((m: any) => m.sender === "customer").length;
      const outbound = msgsRes.data.filter((m: any) => m.sender === "agent").length;
      setMessageStats({ inbound, outbound });
    }

    // Campaign stats
    if (campaignsRes.data) {
      const totals = campaignsRes.data.reduce((acc, c) => ({
        total: acc.total + 1,
        sent: acc.sent + (c.sent_count || 0),
        delivered: acc.delivered + (c.delivered_count || 0),
        read: acc.read + (c.read_count || 0),
        failed: acc.failed + (c.failed_count || 0),
      }), { total: 0, sent: 0, delivered: 0, read: 0, failed: 0 });
      setCampaignStats(totals);
    }

    setLoading(false);
  };

  const getChangePercent = () => {
    if (prevPeriodConversations === 0) return null;
    const change = ((totalConversations - prevPeriodConversations) / prevPeriodConversations) * 100;
    return Math.round(change);
  };

  const changePercent = getChangePercent();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-5 max-w-[1200px] mx-auto" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-kpi-3/10 flex items-center justify-center ring-1 ring-kpi-3/15">
            <BarChart3 className="w-5 h-5 text-kpi-3" />
          </div>
          <div>
            <h1 className="text-xl font-black text-foreground tracking-tight">التحليلات والأداء</h1>
            <p className="text-sm text-muted-foreground">نظرة شاملة على المحادثات والحملات وأداء الفريق</p>
          </div>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[130px] text-xs bg-card/70 border-border/40 rounded-xl backdrop-blur-sm">
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
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-in">
        <Card className="relative overflow-hidden bg-card/70 backdrop-blur-sm border-border/40 rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/15">
                <MessageSquare className="w-5 h-5 text-primary" />
              </div>
              {changePercent !== null && (
                <Badge variant="outline" className={cn("text-[10px] gap-0.5 rounded-lg", changePercent >= 0 ? "text-primary border-primary/20" : "text-destructive border-destructive/20")}>
                  {changePercent >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(changePercent)}%
                </Badge>
              )}
            </div>
            <p className="text-2xl font-black">{totalConversations}</p>
            <p className="text-xs text-muted-foreground mt-1 font-medium">إجمالي المحادثات</p>
          </CardContent>
        </Card>
        <KpiCard icon={Clock} title="متوسط أول رد" value={avgFirstResponse > 0 ? `${avgFirstResponse} د` : "—"} subtitle="الهدف: أقل من 2 دقيقة" colorIndex={2} />
        <KpiCard icon={CheckCircle2} title="مغلقة" value={closedConversations} colorIndex={3} />
        <KpiCard icon={AlertTriangle} title="متأخرة / مصعّدة" value={escalatedConversations} colorIndex={4} />
      </div>

      {/* Messages & Campaign summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fade-in">
        {[
          { value: messageStats.inbound, label: "رسائل واردة", color: "text-primary" },
          { value: messageStats.outbound, label: "رسائل صادرة", color: "text-info" },
          { value: campaignStats.total, label: "حملات", color: "text-warning" },
          { value: campaignStats.delivered, label: "تم توصيلها", color: "text-foreground" },
        ].map((s) => (
          <Card key={s.label} className="bg-card/70 backdrop-blur-sm border-border/40 rounded-2xl">
            <CardContent className="p-3.5 text-center">
              <p className={cn("text-lg font-black", s.color)}>{s.value}</p>
              <p className="text-[11px] text-muted-foreground font-medium">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-card/70 backdrop-blur-sm border border-border/40 rounded-xl w-full sm:w-auto overflow-x-auto flex-wrap">
          <TabsTrigger value="overview" className="text-xs gap-1 rounded-lg"><BarChart3 className="w-3 h-3" /> نظرة عامة</TabsTrigger>
          <TabsTrigger value="team" className="text-xs gap-1 rounded-lg"><Users className="w-3 h-3" /> الفريق</TabsTrigger>
          <TabsTrigger value="campaigns" className="text-xs gap-1 rounded-lg"><Megaphone className="w-3 h-3" /> الحملات</TabsTrigger>
          <TabsTrigger value="channels" className="text-xs gap-1 rounded-lg"><Phone className="w-3 h-3" /> القنوات</TabsTrigger>
          <TabsTrigger value="heatmap" className="text-xs gap-1 rounded-lg"><Flame className="w-3 h-3" /> خريطة النشاط</TabsTrigger>
          <TabsTrigger value="comparison" className="text-xs gap-1 rounded-lg"><GitCompareArrows className="w-3 h-3" /> مقارنة الفترات</TabsTrigger>
          <TabsTrigger value="roi" className="text-xs gap-1 rounded-lg"><DollarSign className="w-3 h-3" /> ROI</TabsTrigger>
          <TabsTrigger value="tags" className="text-xs gap-1 rounded-lg"><Tag className="w-3 h-3" /> الوسوم</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {period === "today" ? "المحادثات حسب الساعة" : "المحادثات اليومية"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(period === "today" ? hourlyData : dailyData).length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={period === "today" ? hourlyData : dailyData}>
                      <defs>
                        <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(142 64% 42%)" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="hsl(142 64% 42%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
                      <XAxis dataKey={period === "today" ? "hour" : "day"} fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(220 13% 91%)", fontSize: 12 }} />
                      <Area type="monotone" dataKey="count" stroke="hsl(142 64% 42%)" fill="url(#greenGrad)" strokeWidth={2} name="محادثات" />
                      {period !== "today" && (
                        <Area type="monotone" dataKey="closed" stroke="hsl(217 91% 60%)" fill="transparent" strokeWidth={1.5} strokeDasharray="4 4" name="مغلقة" />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-10">لا توجد بيانات</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">رضا العملاء</CardTitle>
              </CardHeader>
              <CardContent>
                {satisfactionData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={satisfactionData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={4} dataKey="count" nameKey="rating">
                          {satisfactionData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex justify-center gap-4 mt-1">
                      {satisfactionData.map((c) => (
                        <div key={c.rating} className="flex items-center gap-1.5 text-xs">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                          <span className="text-muted-foreground">{c.rating} ({c.count})</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-10">لا توجد تقييمات</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tags breakdown */}
          {tagData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">أكثر الوسوم استخداماً</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={tagData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
                    <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis dataKey="tag" type="category" fontSize={10} tickLine={false} axisLine={false} width={80} />
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" fill="hsl(142 64% 42%)" radius={[0, 4, 4, 0]} name="عدد" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Team Tab */}
        <TabsContent value="team" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                أداء الفريق
              </CardTitle>
            </CardHeader>
            <CardContent>
              {teamData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-right p-3 text-xs font-semibold text-muted-foreground">الموظف</th>
                        <th className="text-right p-3 text-xs font-semibold text-muted-foreground">نشطة</th>
                        <th className="text-right p-3 text-xs font-semibold text-muted-foreground">تم حلها</th>
                        <th className="text-right p-3 text-xs font-semibold text-muted-foreground">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamData.map((agent, i) => (
                        <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                                {agent.name.charAt(0)}
                              </div>
                              <span className="font-medium text-sm">{agent.name}</span>
                            </div>
                          </td>
                          <td className="p-3 font-semibold text-primary">{agent.activeChats}</td>
                          <td className="p-3 font-semibold">{agent.resolved}</td>
                          <td className="p-3 text-muted-foreground">{agent.activeChats + agent.resolved}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-10">لا توجد بيانات</p>
              )}
            </CardContent>
          </Card>

          {teamData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">مقارنة أداء الموظفين</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={teamData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
                    <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis dataKey="name" type="category" fontSize={10} tickLine={false} axisLine={false} width={60} />
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="activeChats" fill="hsl(142 64% 42%)" radius={[0, 4, 4, 0]} name="نشطة" />
                    <Bar dataKey="resolved" fill="hsl(217 91% 60%)" radius={[0, 4, 4, 0]} name="تم حلها" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "حملات", value: campaignStats.total, color: "text-foreground" },
              { label: "أُرسلت", value: campaignStats.sent, color: "text-info" },
              { label: "وصلت", value: campaignStats.delivered, color: "text-primary" },
              { label: "قُرئت", value: campaignStats.read, color: "text-success" },
              { label: "فشلت", value: campaignStats.failed, color: "text-destructive" },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="p-3 text-center">
                  <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
                  <p className="text-[11px] text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          {campaignStats.sent > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">نسب التوصيل والقراءة</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { label: "نسبة التوصيل", value: Math.round((campaignStats.delivered / campaignStats.sent) * 100), color: "bg-primary" },
                    { label: "نسبة القراءة", value: Math.round((campaignStats.read / Math.max(campaignStats.delivered, 1)) * 100), color: "bg-info" },
                    { label: "نسبة الفشل", value: Math.round((campaignStats.failed / campaignStats.sent) * 100), color: "bg-destructive" },
                  ].map(bar => (
                    <div key={bar.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{bar.label}</span>
                        <span className="font-semibold">{bar.value}%</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all", bar.color)} style={{ width: `${bar.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Channels Tab */}
        <TabsContent value="channels" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">توزيع القنوات</CardTitle>
              </CardHeader>
              <CardContent>
                {channelData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={channelData} cx="50%" cy="50%" outerRadius={70} paddingAngle={3} dataKey="count" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                        {channelData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-10">لا توجد بيانات</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">الرسائل الواردة vs الصادرة</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={[{ name: "الرسائل", inbound: messageStats.inbound, outbound: messageStats.outbound }]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
                    <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="inbound" fill="hsl(142 64% 42%)" radius={[4, 4, 0, 0]} name="واردة" />
                    <Bar dataKey="outbound" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} name="صادرة" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        {/* Heatmap Tab */}
        <TabsContent value="heatmap">
          <ActivityHeatmap />
        </TabsContent>

        {/* Period Comparison Tab */}
        <TabsContent value="comparison">
          <PeriodComparison />
        </TabsContent>

        {/* ROI Tab */}
        <TabsContent value="roi">
          <CampaignROIReport />
        </TabsContent>

        {/* Tags Report Tab */}
        <TabsContent value="tags">
          <TagsReport />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AnalyticsPage;
