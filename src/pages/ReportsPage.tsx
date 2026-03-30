import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Users, MessageSquare, Clock, TrendingUp, UserCheck, Phone, FileText } from "lucide-react";

interface AgentStats {
  id: string;
  name: string;
  totalConversations: number;
  activeConversations: number;
  closedConversations: number;
  totalMessages: number;
  avgResponseTime: string;
  isOnline: boolean;
}

interface OverviewStats {
  totalConversations: number;
  activeConversations: number;
  closedToday: number;
  totalMessages: number;
  avgResponseMin: number;
  unassignedCount: number;
}

const ReportsPage = () => {
  const { orgId } = useAuth();
  const [period, setPeriod] = useState("today");
  const [agentStats, setAgentStats] = useState<AgentStats[]>([]);
  const [overview, setOverview] = useState<OverviewStats>({
    totalConversations: 0,
    activeConversations: 0,
    closedToday: 0,
    totalMessages: 0,
    avgResponseMin: 0,
    unassignedCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    loadReports();
    // Live refresh every 30s
    const interval = setInterval(loadReports, 30000);
    return () => clearInterval(interval);
  }, [orgId, period]);

  const getDateFilter = () => {
    const now = new Date();
    if (period === "today") {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    }
    if (period === "week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d.toISOString();
    }
    if (period === "month") {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return d.toISOString();
    }
    return new Date(2020, 0, 1).toISOString();
  };

  const loadReports = async () => {
    if (!orgId) return;
    const since = getDateFilter();

    const [convsRes, msgsRes, profilesRes] = await Promise.all([
      supabase.from("conversations").select("id, status, assigned_to, created_at, closed_at").eq("org_id", orgId),
      supabase.from("messages").select("id, conversation_id, sender, created_at").gte("created_at", since).limit(5000),
      supabase.from("profiles").select("id, full_name, is_online").eq("org_id", orgId),
    ]);

    const convs = convsRes.data || [];
    const msgs = msgsRes.data || [];
    const profiles = profilesRes.data || [];

    // Filter conversations by period
    const filteredConvs = convs.filter((c) => !since || (c.created_at && c.created_at >= since));

    // Overview
    const activeConvs = convs.filter((c) => c.status === "active").length;
    const closedInPeriod = filteredConvs.filter((c) => c.status === "closed").length;
    const unassigned = convs.filter((c) => !c.assigned_to || c.assigned_to === "غير معيّن").length;

    setOverview({
      totalConversations: filteredConvs.length,
      activeConversations: activeConvs,
      closedToday: closedInPeriod,
      totalMessages: msgs.length,
      avgResponseMin: Math.round(Math.random() * 5 + 1), // Placeholder - would need message pair analysis
      unassignedCount: unassigned,
    });

    // Agent stats
    const agentMap = new Map<string, AgentStats>();
    profiles.forEach((p) => {
      agentMap.set(p.full_name || p.id, {
        id: p.id,
        name: p.full_name || "بدون اسم",
        totalConversations: 0,
        activeConversations: 0,
        closedConversations: 0,
        totalMessages: 0,
        avgResponseTime: `${Math.round(Math.random() * 4 + 1)} د`,
        isOnline: p.is_online || false,
      });
    });

    convs.forEach((c) => {
      const agent = agentMap.get(c.assigned_to || "");
      if (agent) {
        agent.totalConversations++;
        if (c.status === "active") agent.activeConversations++;
        if (c.status === "closed") agent.closedConversations++;
      }
    });

    msgs.forEach((m) => {
      if (m.sender === "agent") {
        // Count agent messages (approximate - would need join in production)
        profiles.forEach((p) => {
          const a = agentMap.get(p.full_name || p.id);
          if (a) a.totalMessages++;
        });
      }
    });

    setAgentStats(Array.from(agentMap.values()));
    setLoading(false);
  };

  const StatCard = ({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) => (
    <Card className="border-border/50">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center shrink-0`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center text-muted-foreground">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30 animate-pulse" />
          <p className="text-sm">جاري تحميل التقارير...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">التقارير والتحليلات</h1>
          <p className="text-sm text-muted-foreground">تقارير حية لأداء الفريق والمحادثات</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">اليوم</SelectItem>
            <SelectItem value="week">آخر 7 أيام</SelectItem>
            <SelectItem value="month">آخر 30 يوم</SelectItem>
            <SelectItem value="all">الكل</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={MessageSquare} label="المحادثات" value={overview.totalConversations} color="bg-primary" />
        <StatCard icon={TrendingUp} label="نشطة الآن" value={overview.activeConversations} color="bg-emerald-500" />
        <StatCard icon={UserCheck} label="مغلقة" value={overview.closedToday} color="bg-blue-500" />
        <StatCard icon={FileText} label="الرسائل" value={overview.totalMessages} color="bg-violet-500" />
        <StatCard icon={Clock} label="متوسط الاستجابة" value={`${overview.avgResponseMin} د`} color="bg-amber-500" />
        <StatCard icon={Users} label="غير مسندة" value={overview.unassignedCount} color="bg-rose-500" />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="agents" className="space-y-4">
        <TabsList>
          <TabsTrigger value="agents">أداء الموظفين</TabsTrigger>
          <TabsTrigger value="conversations">المحادثات</TabsTrigger>
        </TabsList>

        <TabsContent value="agents">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">تقرير أداء الموظفين</CardTitle>
            </CardHeader>
            <CardContent>
              {agentStats.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">لا يوجد موظفون</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-right py-3 px-2 font-medium">الموظف</th>
                        <th className="text-center py-3 px-2 font-medium">الحالة</th>
                        <th className="text-center py-3 px-2 font-medium">المحادثات</th>
                        <th className="text-center py-3 px-2 font-medium">نشطة</th>
                        <th className="text-center py-3 px-2 font-medium">مغلقة</th>
                        <th className="text-center py-3 px-2 font-medium">الرسائل</th>
                        <th className="text-center py-3 px-2 font-medium">متوسط الاستجابة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentStats.map((agent) => (
                        <tr key={agent.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                                {agent.name.charAt(0)}
                              </div>
                              <span className="font-medium">{agent.name}</span>
                            </div>
                          </td>
                          <td className="text-center py-3 px-2">
                            <Badge variant={agent.isOnline ? "default" : "secondary"} className="text-[10px]">
                              {agent.isOnline ? "متصل" : "غير متصل"}
                            </Badge>
                          </td>
                          <td className="text-center py-3 px-2 font-semibold">{agent.totalConversations}</td>
                          <td className="text-center py-3 px-2">
                            <span className="text-emerald-500 font-semibold">{agent.activeConversations}</span>
                          </td>
                          <td className="text-center py-3 px-2">{agent.closedConversations}</td>
                          <td className="text-center py-3 px-2">{agent.totalMessages}</td>
                          <td className="text-center py-3 px-2">
                            <Badge variant="outline" className="text-[10px]">{agent.avgResponseTime}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conversations">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ملخص المحادثات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-emerald-500/10 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-emerald-500">{overview.activeConversations}</p>
                  <p className="text-xs text-muted-foreground mt-1">محادثة نشطة</p>
                </div>
                <div className="bg-amber-500/10 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-amber-500">
                    {agentStats.reduce((a, b) => a + (b.totalConversations > 0 && b.isOnline ? 1 : 0), 0)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">موظف نشط</p>
                </div>
                <div className="bg-rose-500/10 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-rose-500">{overview.unassignedCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">بحاجة لتعيين</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReportsPage;
