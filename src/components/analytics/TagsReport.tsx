import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Tag, TrendingUp, Users, MessageSquare } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = [
  "hsl(142 64% 42%)", "hsl(217 91% 60%)", "hsl(280 67% 55%)",
  "hsl(38 92% 50%)", "hsl(0 84% 60%)", "hsl(190 80% 42%)",
  "hsl(340 75% 55%)", "hsl(160 60% 45%)",
];

interface TagStat {
  name: string;
  color: string;
  conversationCount: number;
  customerCount: number;
  percentage: number;
}

const TagsReport = () => {
  const { orgId } = useAuth();
  const [stats, setStats] = useState<TagStat[]>([]);
  const [totalConversations, setTotalConversations] = useState(0);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [untaggedConvs, setUntaggedConvs] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (orgId) fetch_();
  }, [orgId]);

  const fetch_ = async () => {
    setLoading(true);

    const [tagDefs, convRes, custRes] = await Promise.all([
      supabase.from("customer_tag_definitions").select("*").eq("org_id", orgId!),
      supabase.from("conversations").select("tags").eq("org_id", orgId!).limit(1000),
      supabase.from("customers").select("tags").eq("org_id", orgId!).limit(1000),
    ]);

    const defs = tagDefs.data || [];
    const convs = convRes.data || [];
    const custs = custRes.data || [];

    setTotalConversations(convs.length);
    setTotalCustomers(custs.length);

    // Count tags in conversations
    const convTagMap: Record<string, number> = {};
    let noTag = 0;
    convs.forEach((c: any) => {
      const tags = c.tags as string[] | null;
      if (!tags || tags.length === 0) { noTag++; return; }
      tags.forEach(t => { convTagMap[t] = (convTagMap[t] || 0) + 1; });
    });
    setUntaggedConvs(noTag);

    // Count tags in customers
    const custTagMap: Record<string, number> = {};
    custs.forEach((c: any) => {
      const tags = c.tags as string[] | null;
      if (tags) tags.forEach(t => { custTagMap[t] = (custTagMap[t] || 0) + 1; });
    });

    // Merge
    const allTagNames = new Set([...Object.keys(convTagMap), ...Object.keys(custTagMap), ...defs.map(d => d.name)]);
    const tagStats: TagStat[] = Array.from(allTagNames).map(name => {
      const def = defs.find(d => d.name === name);
      const cc = convTagMap[name] || 0;
      return {
        name,
        color: def?.color || "#25D366",
        conversationCount: cc,
        customerCount: custTagMap[name] || 0,
        percentage: convs.length > 0 ? Math.round((cc / convs.length) * 100) : 0,
      };
    });

    tagStats.sort((a, b) => b.conversationCount - a.conversationCount);
    setStats(tagStats);
    setLoading(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  const chartData = stats.slice(0, 10).map(s => ({ name: s.name, محادثات: s.conversationCount, عملاء: s.customerCount }));
  const pieData = stats.slice(0, 6).map((s, i) => ({ name: s.name, value: s.conversationCount, color: COLORS[i % COLORS.length] }));
  if (untaggedConvs > 0) pieData.push({ name: "بدون وسم", value: untaggedConvs, color: "hsl(220 13% 80%)" });

  return (
    <div className="space-y-5" dir="rtl">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-card/70 backdrop-blur-sm border-border/40 rounded-2xl">
          <CardContent className="p-4 text-center">
            <Tag className="w-5 h-5 mx-auto mb-1.5 text-primary" />
            <p className="text-2xl font-black">{stats.length}</p>
            <p className="text-[10px] text-muted-foreground">إجمالي الوسوم</p>
          </CardContent>
        </Card>
        <Card className="bg-card/70 backdrop-blur-sm border-border/40 rounded-2xl">
          <CardContent className="p-4 text-center">
            <MessageSquare className="w-5 h-5 mx-auto mb-1.5 text-info" />
            <p className="text-2xl font-black">{totalConversations - untaggedConvs}</p>
            <p className="text-[10px] text-muted-foreground">محادثات موسومة</p>
          </CardContent>
        </Card>
        <Card className="bg-card/70 backdrop-blur-sm border-border/40 rounded-2xl">
          <CardContent className="p-4 text-center">
            <Users className="w-5 h-5 mx-auto mb-1.5 text-success" />
            <p className="text-2xl font-black">{totalCustomers}</p>
            <p className="text-[10px] text-muted-foreground">إجمالي العملاء</p>
          </CardContent>
        </Card>
        <Card className="bg-card/70 backdrop-blur-sm border-border/40 rounded-2xl">
          <CardContent className="p-4 text-center">
            <TrendingUp className="w-5 h-5 mx-auto mb-1.5 text-warning" />
            <p className="text-2xl font-black">{totalConversations > 0 ? Math.round(((totalConversations - untaggedConvs) / totalConversations) * 100) : 0}%</p>
            <p className="text-[10px] text-muted-foreground">نسبة التوسيم</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card/70 backdrop-blur-sm border-border/40 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">أكثر الوسوم استخداماً</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
                  <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" fontSize={10} tickLine={false} axisLine={false} width={80} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="محادثات" fill="hsl(142 64% 42%)" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="عملاء" fill="hsl(217 91% 60%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">لا توجد وسوم</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/70 backdrop-blur-sm border-border/40 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">توزيع الوسوم</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value" nameKey="name">
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-3 mt-2">
                  {pieData.map(p => (
                    <div key={p.name} className="flex items-center gap-1.5 text-[10px]">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="text-muted-foreground">{p.name} ({p.value})</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">لا توجد بيانات</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card className="bg-card/70 backdrop-blur-sm border-border/40 rounded-2xl overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">تفاصيل الوسوم</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30 text-muted-foreground text-[11px] bg-secondary/20">
                  <th className="text-right p-3 font-semibold">الوسم</th>
                  <th className="text-right p-3 font-semibold">المحادثات</th>
                  <th className="text-right p-3 font-semibold">العملاء</th>
                  <th className="text-right p-3 font-semibold">النسبة</th>
                </tr>
              </thead>
              <tbody>
                {stats.map(s => (
                  <tr key={s.name} className="border-b border-border/20 hover:bg-secondary/30">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="font-medium">{s.name}</span>
                      </div>
                    </td>
                    <td className="p-3 font-semibold">{s.conversationCount}</td>
                    <td className="p-3">{s.customerCount}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-[10px]">{s.percentage}%</Badge>
                    </td>
                  </tr>
                ))}
                {stats.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-8 text-xs text-muted-foreground">لا توجد وسوم</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TagsReport;
