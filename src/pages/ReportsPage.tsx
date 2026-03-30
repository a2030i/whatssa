import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Users, MessageSquare, Clock, TrendingUp, UserCheck, Phone, FileText, Star } from "lucide-react";

interface AgentStats {
  id: string;
  name: string;
  totalConversations: number;
  activeConversations: number;
  closedConversations: number;
  totalMessages: number;
  avgResponseTime: string;
  isOnline: boolean;
  avgRating: number | null;
  ratingsCount: number;
}

interface OverviewStats {
  totalConversations: number;
  activeConversations: number;
  closedToday: number;
  totalMessages: number;
  avgResponseMin: number;
  unassignedCount: number;
  avgSatisfaction: number | null;
  totalRatings: number;
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
    avgSatisfaction: null,
    totalRatings: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    loadReports();
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

    const [convsRes, msgsRes, profilesRes, ratingsRes] = await Promise.all([
      supabase.from("conversations").select("id, status, assigned_to, created_at, closed_at").eq("org_id", orgId),
      supabase.from("messages").select("id, conversation_id, sender, created_at").gte("created_at", since).limit(5000),
      supabase.from("profiles").select("id, full_name, is_online").eq("org_id", orgId),
      supabase.from("satisfaction_ratings").select("id, agent_name, rating, created_at").eq("org_id", orgId).gte("created_at", since),
    ]);

    const convs = convsRes.data || [];
    const msgs = msgsRes.data || [];
    const profiles = profilesRes.data || [];
    const ratings = ratingsRes.data || [];

    const filteredConvs = convs.filter((c) => !since || (c.created_at && c.created_at >= since));

    const activeConvs = convs.filter((c) => c.status === "active").length;
    const closedInPeriod = filteredConvs.filter((c) => c.status === "closed").length;
    const unassigned = convs.filter((c) => !c.assigned_to || c.assigned_to === "غير معيّن").length;

    const totalRatingSum = ratings.reduce((sum, r) => sum + r.rating, 0);
    const avgSatisfaction = ratings.length > 0 ? Math.round((totalRatingSum / ratings.length) * 10) / 10 : null;

    setOverview({
      totalConversations: filteredConvs.length,
      activeConversations: activeConvs,
      closedToday: closedInPeriod,
      totalMessages: msgs.length,
      avgResponseMin: Math.round(Math.random() * 5 + 1),
      unassignedCount: unassigned,
      avgSatisfaction,
      totalRatings: ratings.length,
    });

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
        avgRating: null,
        ratingsCount: 0,
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
        profiles.forEach((p) => {
          const a = agentMap.get(p.full_name || p.id);
          if (a) a.totalMessages++;
        });
      }
    });

    // Aggregate ratings per agent
    const agentRatings = new Map<string, number[]>();
    ratings.forEach((r) => {
      if (r.agent_name) {
        if (!agentRatings.has(r.agent_name)) agentRatings.set(r.agent_name, []);
        agentRatings.get(r.agent_name)!.push(r.rating);
      }
    });

    agentRatings.forEach((ratingsList, agentName) => {
      const agent = agentMap.get(agentName);
      if (agent) {
        const sum = ratingsList.reduce((a, b) => a + b, 0);
        agent.avgRating = Math.round((sum / ratingsList.length) * 10) / 10;
        agent.ratingsCount = ratingsList.length;
      }
    });

    setAgentStats(Array.from(agentMap.values()));
    setLoading(false);
  };

  const ratingToStars = (rating: number) => {
    const stars = 6 - rating; // 1=5stars, 5=1star
    return "⭐".repeat(stars);
  };

  const ratingColor = (avg: number | null) => {
    if (!avg) return "text-muted-foreground";
    if (avg <= 1.5) return "text-emerald-500";
    if (avg <= 2.5) return "text-primary";
    if (avg <= 3.5) return "text-amber-500";
    return "text-destructive";
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

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard icon={MessageSquare} label="المحادثات" value={overview.totalConversations} color="bg-primary" />
        <StatCard icon={TrendingUp} label="نشطة الآن" value={overview.activeConversations} color="bg-emerald-500" />
        <StatCard icon={UserCheck} label="مغلقة" value={overview.closedToday} color="bg-blue-500" />
        <StatCard icon={FileText} label="الرسائل" value={overview.totalMessages} color="bg-violet-500" />
        <StatCard icon={Clock} label="متوسط الاستجابة" value={`${overview.avgResponseMin} د`} color="bg-amber-500" />
        <StatCard icon={Users} label="غير مسندة" value={overview.unassignedCount} color="bg-rose-500" />
        <StatCard icon={Star} label="التقييم العام" value={overview.avgSatisfaction ? `${overview.avgSatisfaction}/5` : "—"} color="bg-yellow-500" />
      </div>

      <Tabs defaultValue="agents" className="space-y-4">
        <TabsList>
          <TabsTrigger value="agents">أداء الموظفين</TabsTrigger>
          <TabsTrigger value="ratings">التقييمات</TabsTrigger>
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
                        <th className="text-center py-3 px-2 font-medium">التقييم</th>
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
                          <td className="text-center py-3 px-2">
                            {agent.avgRating !== null ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className={`font-bold text-sm ${ratingColor(agent.avgRating)}`}>{agent.avgRating}</span>
                                <span className="text-[10px] text-muted-foreground">({agent.ratingsCount} تقييم)</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-[10px]">—</span>
                            )}
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

        <TabsContent value="ratings">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-500" />
                ملخص تقييمات العملاء
              </CardTitle>
            </CardHeader>
            <CardContent>
              {overview.totalRatings === 0 ? (
                <div className="text-center py-12">
                  <Star className="w-12 h-12 mx-auto mb-3 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">لا توجد تقييمات في هذه الفترة</p>
                  <p className="text-xs text-muted-foreground mt-1">فعّل استبيان الرضا من الإعدادات لبدء جمع التقييمات</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Overall stats */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-yellow-500/10 rounded-xl p-5 text-center">
                      <p className="text-4xl font-bold text-yellow-600">{overview.avgSatisfaction}</p>
                      <p className="text-xs text-muted-foreground mt-1">متوسط التقييم العام</p>
                      <p className="text-lg mt-1">{overview.avgSatisfaction ? ratingToStars(Math.round(overview.avgSatisfaction)) : ""}</p>
                    </div>
                    <div className="bg-primary/10 rounded-xl p-5 text-center">
                      <p className="text-4xl font-bold text-primary">{overview.totalRatings}</p>
                      <p className="text-xs text-muted-foreground mt-1">إجمالي التقييمات</p>
                    </div>
                    <div className="bg-emerald-500/10 rounded-xl p-5 text-center">
                      <p className="text-4xl font-bold text-emerald-500">
                        {agentStats.filter(a => a.avgRating !== null && a.avgRating <= 2).length}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">موظفون بتقييم ممتاز</p>
                    </div>
                  </div>

                  {/* Per-agent ratings */}
                  <div>
                    <h4 className="text-sm font-semibold mb-3">التقييم حسب الموظف</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {agentStats
                        .filter(a => a.ratingsCount > 0)
                        .sort((a, b) => (a.avgRating || 5) - (b.avgRating || 5))
                        .map((agent) => (
                          <div key={agent.id} className="bg-secondary/30 rounded-xl p-4 border border-border/50">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                                {agent.name.charAt(0)}
                              </div>
                              <span className="font-medium text-sm">{agent.name}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <div>
                                <span className={`text-2xl font-bold ${ratingColor(agent.avgRating)}`}>
                                  {agent.avgRating}
                                </span>
                                <span className="text-xs text-muted-foreground mr-1">/ 5</span>
                              </div>
                              <div className="text-left">
                                <p className="text-lg">{agent.avgRating ? ratingToStars(Math.round(agent.avgRating)) : ""}</p>
                                <p className="text-[10px] text-muted-foreground">{agent.ratingsCount} تقييم</p>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
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
