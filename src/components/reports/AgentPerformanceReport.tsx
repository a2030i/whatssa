import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  CartesianGrid, Legend, LineChart, Line, Cell
} from "recharts";
import {
  Clock, CheckCircle2, MessageSquare, Users, TrendingUp,
  Trophy, ArrowUpRight, ArrowDownRight, Download, Timer, Target, Zap, Loader2
} from "lucide-react";

interface AgentPerf {
  id: string;
  name: string;
  avatar: string;
  isOnline: boolean;
  totalConversations: number;
  closedConversations: number;
  activeConversations: number;
  totalMessages: number;
  avgFRT: number; // minutes
  medianFRT: number;
  maxFRT: number;
  resolutionRate: number; // percentage
  avgResolutionTime: number; // minutes
  avgRating: number | null;
  ratingsCount: number;
}

const CHART_COLORS = [
  "hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(142 64% 42%)"
];

const formatMinutes = (mins: number) => {
  if (mins === 0) return "—";
  if (mins < 1) return `${Math.round(mins * 60)} ث`;
  if (mins < 60) return `${Math.round(mins)} د`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h} س ${m} د` : `${h} س`;
};

const AgentPerformanceReport = ({ period }: { period: string }) => {
  const { orgId } = useAuth();
  const [agents, setAgents] = useState<AgentPerf[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"frt" | "resolution" | "conversations" | "rating">("frt");
  const [selectedAgent, setSelectedAgent] = useState<string>("all");

  const getDateFilter = () => {
    const now = new Date();
    if (period === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    if (period === "week") { const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString(); }
    if (period === "month") { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d.toISOString(); }
    return new Date(2020, 0, 1).toISOString();
  };

  useEffect(() => {
    if (!orgId) return;
    loadData();
  }, [orgId, period]);

  const loadData = async () => {
    if (!orgId) return;
    setLoading(true);
    const since = getDateFilter();

    const [profilesRes, convsRes, msgsRes, ratingsRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, is_online").eq("org_id", orgId),
      supabase.from("conversations").select("id, status, assigned_to, assigned_to_id, created_at, closed_at, first_response_at")
        .eq("org_id", orgId).gte("created_at", since),
      supabase.from("messages").select("id, conversation_id, sender, created_at")
        .gte("created_at", since).order("created_at", { ascending: true }).limit(5000),
      supabase.from("satisfaction_ratings" as any).select("id, agent_name, rating")
        .eq("org_id", orgId).gte("created_at", since),
    ]);

    const profiles = profilesRes.data || [];
    const convs = convsRes.data || [];
    const msgs = msgsRes.data || [];
    const ratings = ratingsRes.data || [];

    // Group messages by conversation
    const msgsByConv = new Map<string, { sender: string; created_at: string }[]>();
    msgs.forEach((m) => {
      if (!msgsByConv.has(m.conversation_id)) msgsByConv.set(m.conversation_id, []);
      msgsByConv.get(m.conversation_id)!.push(m);
    });

    // Calculate per-agent stats
    const agentMap = new Map<string, AgentPerf>();

    profiles.forEach((p) => {
      agentMap.set(p.id, {
        id: p.id,
        name: p.full_name || "بدون اسم",
        avatar: (p.full_name || "?").charAt(0),
        isOnline: p.is_online || false,
        totalConversations: 0,
        closedConversations: 0,
        activeConversations: 0,
        totalMessages: 0,
        avgFRT: 0,
        medianFRT: 0,
        maxFRT: 0,
        resolutionRate: 0,
        avgResolutionTime: 0,
        avgRating: null,
        ratingsCount: 0,
      });
    });

    // FRT per agent (from first_response_at)
    const agentFRTs = new Map<string, number[]>();
    const agentResolutionTimes = new Map<string, number[]>();

    convs.forEach((c) => {
      const agentId = c.assigned_to_id;
      if (!agentId || !agentMap.has(agentId)) return;

      const agent = agentMap.get(agentId)!;
      agent.totalConversations++;
      if (c.status === "closed") {
        agent.closedConversations++;
        // Resolution time
        if (c.created_at && c.closed_at) {
          const resTime = (new Date(c.closed_at).getTime() - new Date(c.created_at).getTime()) / 60000;
          if (resTime > 0 && resTime < 43200) {
            if (!agentResolutionTimes.has(agentId)) agentResolutionTimes.set(agentId, []);
            agentResolutionTimes.get(agentId)!.push(resTime);
          }
        }
      }
      if (c.status === "active") agent.activeConversations++;

      // FRT from first_response_at
      if (c.first_response_at && c.created_at) {
        const frt = (new Date(c.first_response_at).getTime() - new Date(c.created_at).getTime()) / 60000;
        if (frt > 0 && frt < 1440) {
          if (!agentFRTs.has(agentId)) agentFRTs.set(agentId, []);
          agentFRTs.get(agentId)!.push(frt);
        }
      }
    });

    // Fallback: calculate FRT from messages if first_response_at not available
    msgsByConv.forEach((convMsgs, convId) => {
      const conv = convs.find((c) => c.id === convId);
      if (!conv || conv.first_response_at) return; // skip if already calculated
      const agentId = conv.assigned_to_id;
      if (!agentId || !agentMap.has(agentId)) return;

      for (let i = 0; i < convMsgs.length - 1; i++) {
        if (convMsgs[i].sender === "customer" && convMsgs[i + 1].sender === "agent") {
          const diff = (new Date(convMsgs[i + 1].created_at).getTime() - new Date(convMsgs[i].created_at).getTime()) / 60000;
          if (diff > 0 && diff < 1440) {
            if (!agentFRTs.has(agentId)) agentFRTs.set(agentId, []);
            agentFRTs.get(agentId)!.push(diff);
            break; // only first response
          }
        }
      }
    });

    // Count agent messages
    msgs.forEach((m) => {
      if (m.sender === "agent") {
        const conv = convs.find(c => c.id === m.conversation_id);
        if (conv?.assigned_to_id && agentMap.has(conv.assigned_to_id)) {
          agentMap.get(conv.assigned_to_id)!.totalMessages++;
        }
      }
    });

    // Ratings per agent (by name match)
    const ratingsByName = new Map<string, number[]>();
    ratings.forEach((r: any) => {
      if (r.agent_name) {
        if (!ratingsByName.has(r.agent_name)) ratingsByName.set(r.agent_name, []);
        ratingsByName.get(r.agent_name)!.push(r.rating);
      }
    });

    // Finalize stats
    agentMap.forEach((agent, agentId) => {
      const frts = agentFRTs.get(agentId) || [];
      if (frts.length > 0) {
        frts.sort((a, b) => a - b);
        agent.avgFRT = Math.round((frts.reduce((a, b) => a + b, 0) / frts.length) * 10) / 10;
        agent.medianFRT = Math.round(frts[Math.floor(frts.length / 2)] * 10) / 10;
        agent.maxFRT = Math.round(Math.max(...frts) * 10) / 10;
      }

      const resTimes = agentResolutionTimes.get(agentId) || [];
      if (resTimes.length > 0) {
        agent.avgResolutionTime = Math.round((resTimes.reduce((a, b) => a + b, 0) / resTimes.length) * 10) / 10;
      }

      agent.resolutionRate = agent.totalConversations > 0
        ? Math.round((agent.closedConversations / agent.totalConversations) * 100)
        : 0;

      const agentRatings = ratingsByName.get(agent.name) || [];
      if (agentRatings.length > 0) {
        agent.avgRating = Math.round((agentRatings.reduce((a, b) => a + b, 0) / agentRatings.length) * 10) / 10;
        agent.ratingsCount = agentRatings.length;
      }
    });

    setAgents(Array.from(agentMap.values()).filter(a => a.totalConversations > 0));
    setLoading(false);
  };

  const sortedAgents = useMemo(() => {
    const arr = [...agents];
    switch (sortBy) {
      case "frt": return arr.sort((a, b) => (a.avgFRT || 999) - (b.avgFRT || 999));
      case "resolution": return arr.sort((a, b) => b.resolutionRate - a.resolutionRate);
      case "conversations": return arr.sort((a, b) => b.totalConversations - a.totalConversations);
      case "rating": return arr.sort((a, b) => (a.avgRating || 99) - (b.avgRating || 99));
      default: return arr;
    }
  }, [agents, sortBy]);

  const topAgent = useMemo(() => {
    if (agents.length === 0) return null;
    return agents.reduce((best, a) => {
      const score = (a.resolutionRate * 0.4) + ((100 - Math.min(a.avgFRT, 100)) * 0.3) + ((a.avgRating ? (6 - a.avgRating) * 20 : 50) * 0.3);
      const bestScore = (best.resolutionRate * 0.4) + ((100 - Math.min(best.avgFRT, 100)) * 0.3) + ((best.avgRating ? (6 - best.avgRating) * 20 : 50) * 0.3);
      return score > bestScore ? a : best;
    });
  }, [agents]);

  // Chart data
  const frtComparisonData = sortedAgents.map(a => ({
    name: a.name.length > 10 ? a.name.slice(0, 10) + "…" : a.name,
    "متوسط FRT": Math.round(a.avgFRT),
    "وسيط FRT": Math.round(a.medianFRT),
  }));

  const resolutionComparisonData = sortedAgents.map(a => ({
    name: a.name.length > 10 ? a.name.slice(0, 10) + "…" : a.name,
    "معدل الحل %": a.resolutionRate,
    "محادثات مغلقة": a.closedConversations,
  }));

  const radarData = useMemo(() => {
    if (agents.length === 0) return [];
    const maxConvs = Math.max(...agents.map(a => a.totalConversations), 1);
    const maxMsgs = Math.max(...agents.map(a => a.totalMessages), 1);

    const selected = selectedAgent === "all"
      ? agents.slice(0, 5)
      : agents.filter(a => a.id === selectedAgent);

    const metrics = ["سرعة الاستجابة", "معدل الحل", "حجم العمل", "الإنتاجية", "التقييم"];
    return metrics.map(metric => {
      const entry: Record<string, any> = { metric };
      selected.forEach(a => {
        let val = 0;
        switch (metric) {
          case "سرعة الاستجابة": val = a.avgFRT > 0 ? Math.max(0, 100 - a.avgFRT) : 50; break;
          case "معدل الحل": val = a.resolutionRate; break;
          case "حجم العمل": val = (a.totalConversations / maxConvs) * 100; break;
          case "الإنتاجية": val = (a.totalMessages / maxMsgs) * 100; break;
          case "التقييم": val = a.avgRating ? ((6 - a.avgRating) / 5) * 100 : 50; break;
        }
        entry[a.name] = Math.round(val);
      });
      return entry;
    });
  }, [agents, selectedAgent]);

  const overallAvgFRT = agents.length > 0
    ? Math.round((agents.reduce((s, a) => s + a.avgFRT, 0) / agents.length) * 10) / 10
    : 0;
  const overallResolution = agents.length > 0
    ? Math.round(agents.reduce((s, a) => s + a.resolutionRate, 0) / agents.length)
    : 0;

  const exportCSV = () => {
    const bom = "\uFEFF";
    const header = "الموظف,الحالة,المحادثات,مغلقة,نشطة,الرسائل,متوسط FRT (د),وسيط FRT (د),أقصى FRT (د),معدل الحل %,متوسط وقت الحل (د),التقييم,عدد التقييمات\n";
    const rows = sortedAgents.map(a =>
      `${a.name},${a.isOnline ? "متصل" : "غير متصل"},${a.totalConversations},${a.closedConversations},${a.activeConversations},${a.totalMessages},${a.avgFRT},${a.medianFRT},${a.maxFRT},${a.resolutionRate},${a.avgResolutionTime},${a.avgRating || "-"},${a.ratingsCount}`
    ).join("\n");
    const blob = new Blob([bom + header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `تقرير_أداء_الموظفين_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground/20" />
          <p className="text-muted-foreground text-sm">لا توجد بيانات أداء للموظفين في هذه الفترة</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
          <SelectTrigger className="w-44 text-xs">
            <SelectValue placeholder="ترتيب حسب" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="frt">الأسرع استجابة</SelectItem>
            <SelectItem value="resolution">الأعلى حلاً</SelectItem>
            <SelectItem value="conversations">الأكثر محادثات</SelectItem>
            <SelectItem value="rating">الأفضل تقييماً</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5 text-xs">
          <Download className="w-3.5 h-3.5" /> تصدير
        </Button>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Timer className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xl font-bold">{formatMinutes(overallAvgFRT)}</p>
              <p className="text-[11px] text-muted-foreground">متوسط وقت الاستجابة الأولى</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Target className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xl font-bold">{overallResolution}%</p>
              <p className="text-[11px] text-muted-foreground">معدل الحل الإجمالي</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xl font-bold">{agents.length}</p>
              <p className="text-[11px] text-muted-foreground">موظفون نشطون</p>
            </div>
          </CardContent>
        </Card>
        {topAgent && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{topAgent.name}</p>
                <p className="text-[11px] text-muted-foreground">أفضل أداء</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* FRT Comparison */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              مقارنة وقت الاستجابة الأولى (دقيقة)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={frtComparisonData} layout="vertical" margin={{ right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip contentStyle={{ fontSize: 12, direction: "rtl" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="متوسط FRT" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="وسيط FRT" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Resolution Rate Comparison */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              مقارنة معدل الحل
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={resolutionComparisonData} layout="vertical" margin={{ right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip contentStyle={{ fontSize: 12, direction: "rtl" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="معدل الحل %" fill="hsl(142 64% 42%)" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="محادثات مغلقة" fill="hsl(var(--chart-3))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Radar Chart */}
      {radarData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                مقارنة شاملة للأداء
              </CardTitle>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger className="w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">أفضل 5 موظفين</SelectItem>
                  {agents.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid className="opacity-30" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis tick={{ fontSize: 9 }} domain={[0, 100]} />
                  {(selectedAgent === "all" ? agents.slice(0, 5) : agents.filter(a => a.id === selectedAgent))
                    .map((a, i) => (
                      <Radar
                        key={a.id}
                        name={a.name}
                        dataKey={a.name}
                        stroke={CHART_COLORS[i % CHART_COLORS.length]}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                    ))}
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12, direction: "rtl" }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">تفاصيل أداء كل موظف</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-right py-3 px-2 font-medium">الموظف</th>
                  <th className="text-center py-3 px-2 font-medium">الحالة</th>
                  <th className="text-center py-3 px-2 font-medium">المحادثات</th>
                  <th className="text-center py-3 px-2 font-medium">مغلقة</th>
                  <th className="text-center py-3 px-2 font-medium">متوسط FRT</th>
                  <th className="text-center py-3 px-2 font-medium">وسيط FRT</th>
                  <th className="text-center py-3 px-2 font-medium">معدل الحل</th>
                  <th className="text-center py-3 px-2 font-medium">وقت الحل</th>
                  <th className="text-center py-3 px-2 font-medium">التقييم</th>
                </tr>
              </thead>
              <tbody>
                {sortedAgents.map((agent) => (
                  <tr key={agent.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {agent.avatar}
                        </div>
                        <div>
                          <span className="font-medium block">{agent.name}</span>
                          <span className="text-[10px] text-muted-foreground">{agent.totalMessages} رسالة</span>
                        </div>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2">
                      <Badge variant={agent.isOnline ? "default" : "secondary"} className="text-[10px]">
                        {agent.isOnline ? "متصل" : "غير متصل"}
                      </Badge>
                    </td>
                    <td className="text-center py-3 px-2 font-semibold">{agent.totalConversations}</td>
                    <td className="text-center py-3 px-2">{agent.closedConversations}</td>
                    <td className="text-center py-3 px-2">
                      <Badge variant="outline" className={`text-[10px] ${agent.avgFRT > 0 && agent.avgFRT <= 5 ? "border-emerald-500/30 text-emerald-600" : agent.avgFRT > 30 ? "border-destructive/30 text-destructive" : ""}`}>
                        {formatMinutes(agent.avgFRT)}
                      </Badge>
                    </td>
                    <td className="text-center py-3 px-2 text-xs text-muted-foreground">
                      {formatMinutes(agent.medianFRT)}
                    </td>
                    <td className="text-center py-3 px-2">
                      <div className="flex items-center gap-2 justify-center">
                        <Progress value={agent.resolutionRate} className="w-16 h-1.5" />
                        <span className={`text-xs font-bold ${agent.resolutionRate >= 80 ? "text-emerald-500" : agent.resolutionRate >= 50 ? "text-amber-500" : "text-destructive"}`}>
                          {agent.resolutionRate}%
                        </span>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2 text-xs">
                      {formatMinutes(agent.avgResolutionTime)}
                    </td>
                    <td className="text-center py-3 px-2">
                      {agent.avgRating !== null ? (
                        <div className="text-center">
                          <span className="font-bold text-sm">{agent.avgRating}</span>
                          <span className="text-[10px] text-muted-foreground">/5</span>
                          <p className="text-[9px] text-muted-foreground">{agent.ratingsCount} تقييم</p>
                        </div>
                      ) : <span className="text-muted-foreground text-[10px]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentPerformanceReport;
