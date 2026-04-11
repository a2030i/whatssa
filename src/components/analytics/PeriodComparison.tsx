import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, GitCompareArrows, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PeriodData {
  conversations: number;
  closed: number;
  messages: number;
  avgFrt: number;
}

const PeriodComparison = () => {
  const { orgId } = useAuth();
  const [mode, setMode] = useState<"week" | "month">("month");
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<PeriodData>({ conversations: 0, closed: 0, messages: 0, avgFrt: 0 });
  const [previous, setPrevious] = useState<PeriodData>({ conversations: 0, closed: 0, messages: 0, avgFrt: 0 });

  useEffect(() => {
    if (!orgId) return;
    fetchComparison();
  }, [orgId, mode]);

  const getRange = () => {
    const now = new Date();
    let currentStart: Date, prevStart: Date, prevEnd: Date;

    if (mode === "month") {
      currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
      prevEnd = new Date(currentStart.getTime() - 1);
      prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
    } else {
      const dayOfWeek = now.getDay();
      currentStart = new Date(now);
      currentStart.setDate(now.getDate() - dayOfWeek);
      currentStart.setHours(0, 0, 0, 0);
      prevEnd = new Date(currentStart.getTime() - 1);
      prevStart = new Date(prevEnd);
      prevStart.setDate(prevEnd.getDate() - 6);
      prevStart.setHours(0, 0, 0, 0);
    }

    return {
      currentStart: currentStart.toISOString(),
      currentEnd: now.toISOString(),
      prevStart: prevStart.toISOString(),
      prevEnd: prevEnd.toISOString(),
    };
  };

  const fetchPeriodData = async (start: string, end: string): Promise<PeriodData> => {
    const [convRes, closedRes, frtRes] = await Promise.all([
      supabase.from("conversations").select("id", { count: "exact", head: true })
        .eq("org_id", orgId).gte("created_at", start).lte("created_at", end),
      supabase.from("conversations").select("id", { count: "exact", head: true })
        .eq("org_id", orgId).eq("status", "closed").gte("closed_at", start).lte("closed_at", end),
      supabase.from("conversations").select("created_at, first_response_at")
        .eq("org_id", orgId).not("first_response_at", "is", null)
        .gte("created_at", start).lte("created_at", end).limit(500),
    ]);

    let avgFrt = 0;
    if (frtRes.data && frtRes.data.length > 0) {
      const diffs = frtRes.data.map(c => {
        return (new Date(c.first_response_at!).getTime() - new Date(c.created_at!).getTime()) / 60000;
      }).filter(d => d > 0 && d < 1440);
      avgFrt = diffs.length > 0 ? Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length * 10) / 10 : 0;
    }

    return {
      conversations: convRes.count ?? 0,
      closed: closedRes.count ?? 0,
      messages: 0,
      avgFrt,
    };
  };

  const fetchComparison = async () => {
    setLoading(true);
    const { currentStart, currentEnd, prevStart, prevEnd } = getRange();
    const [cur, prev] = await Promise.all([
      fetchPeriodData(currentStart, currentEnd),
      fetchPeriodData(prevStart, prevEnd),
    ]);
    setCurrent(cur);
    setPrevious(prev);
    setLoading(false);
  };

  const getChange = (cur: number, prev: number) => {
    if (prev === 0) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 100);
  };

  const metrics = [
    { label: "المحادثات", current: current.conversations, previous: previous.conversations, higherBetter: true },
    { label: "مغلقة", current: current.closed, previous: previous.closed, higherBetter: true },
    { label: "متوسط أول رد (د)", current: current.avgFrt, previous: previous.avgFrt, higherBetter: false },
  ];

  const chartData = metrics.map(m => ({
    name: m.label,
    "الفترة الحالية": m.current,
    "الفترة السابقة": m.previous,
  }));

  const currentLabel = mode === "month" ? "هذا الشهر" : "هذا الأسبوع";
  const previousLabel = mode === "month" ? "الشهر السابق" : "الأسبوع السابق";

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <GitCompareArrows className="w-4 h-4 text-primary" />
            مقارنة الفترات
          </CardTitle>
          <Select value={mode} onValueChange={(v) => setMode(v as "week" | "month")}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">أسبوعي</SelectItem>
              <SelectItem value="month">شهري</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Metric cards */}
        <div className="grid grid-cols-3 gap-3">
          {metrics.map((m) => {
            const change = getChange(m.current, m.previous);
            const isPositive = m.higherBetter ? change > 0 : change < 0;
            const isNeutral = change === 0;
            return (
              <div key={m.label} className="bg-secondary/50 rounded-xl p-3 text-center space-y-1">
                <p className="text-[10px] text-muted-foreground">{m.label}</p>
                <p className="text-lg font-black">{m.current}</p>
                <div className="flex items-center justify-center gap-1">
                  {isNeutral ? (
                    <Badge variant="outline" className="text-[9px] gap-0.5 text-muted-foreground">
                      <Minus className="w-2.5 h-2.5" /> 0%
                    </Badge>
                  ) : (
                    <Badge variant="outline" className={cn("text-[9px] gap-0.5", isPositive ? "text-primary border-primary/20" : "text-destructive border-destructive/20")}>
                      {isPositive ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                      {Math.abs(change)}%
                    </Badge>
                  )}
                  <span className="text-[9px] text-muted-foreground">vs {m.previous}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
            <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis fontSize={10} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="الفترة الحالية" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="الفترة السابقة" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} opacity={0.4} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default PeriodComparison;

