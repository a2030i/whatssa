import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, TrendingUp, Star, MessageSquare, ShoppingCart, Clock, Zap, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ScoredCustomer {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  tags: string[];
  score: number;
  grade: "A" | "B" | "C" | "D";
  factors: { label: string; points: number; icon: any }[];
  conversationCount: number;
  lastActivity: string | null;
  hasOrders: boolean;
  lifecycle_stage: string;
}

const GRADE_COLORS: Record<string, string> = {
  A: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  B: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  C: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  D: "bg-red-500/15 text-red-600 border-red-500/30",
};

const LeadScoring = () => {
  const { orgId } = useAuth();
  const [customers, setCustomers] = useState<ScoredCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (orgId) calculate();
  }, [orgId]);

  const calculate = async () => {
    setLoading(true);

    const [custRes, convRes, orderRes] = await Promise.all([
      supabase.from("customers").select("id, name, phone, email, tags, lifecycle_stage, created_at, updated_at").eq("org_id", orgId!).limit(500),
      supabase.from("conversations").select("customer_phone, id, created_at, status, last_message_at").eq("org_id", orgId!).limit(1000),
      supabase.from("orders").select("customer_phone").eq("org_id", orgId!).limit(1000),
    ]);

    const custs = custRes.data || [];
    const convs = convRes.data || [];
    const orders = new Set((orderRes.data || []).map((o: any) => o.customer_phone));

    // Build conversation counts per phone
    const convMap: Record<string, { count: number; lastAt: string | null }> = {};
    convs.forEach((c: any) => {
      if (!convMap[c.customer_phone]) convMap[c.customer_phone] = { count: 0, lastAt: null };
      convMap[c.customer_phone].count++;
      if (!convMap[c.customer_phone].lastAt || c.last_message_at > convMap[c.customer_phone].lastAt) {
        convMap[c.customer_phone].lastAt = c.last_message_at;
      }
    });

    const scored: ScoredCustomer[] = custs.map((c: any) => {
      const factors: { label: string; points: number; icon: any }[] = [];
      let score = 0;

      // Conversations (max 30 pts)
      const convInfo = convMap[c.phone] || { count: 0, lastAt: null };
      const convPts = Math.min(convInfo.count * 5, 30);
      if (convPts > 0) factors.push({ label: `${convInfo.count} محادثة`, points: convPts, icon: MessageSquare });

      // Recency (max 25 pts)
      if (convInfo.lastAt) {
        const daysSince = (Date.now() - new Date(convInfo.lastAt).getTime()) / (1000 * 60 * 60 * 24);
        const recencyPts = daysSince < 1 ? 25 : daysSince < 7 ? 20 : daysSince < 30 ? 10 : 5;
        factors.push({ label: daysSince < 1 ? "نشط اليوم" : `آخر نشاط ${Math.round(daysSince)} يوم`, points: recencyPts, icon: Clock });
        score += recencyPts;
      }

      // Orders (20 pts)
      const hasOrders = orders.has(c.phone);
      if (hasOrders) {
        factors.push({ label: "لديه طلبات", points: 20, icon: ShoppingCart });
        score += 20;
      }

      // Profile completeness (max 15 pts)
      let profilePts = 0;
      if (c.name) profilePts += 5;
      if (c.email) profilePts += 5;
      if ((c.tags || []).length > 0) profilePts += 5;
      if (profilePts > 0) factors.push({ label: "ملف مكتمل", points: profilePts, icon: Star });
      score += profilePts;

      // Lifecycle stage (max 10 pts)
      const stagePts = c.lifecycle_stage === "customer" ? 10 : c.lifecycle_stage === "qualified" ? 7 : c.lifecycle_stage === "lead" ? 3 : 0;
      if (stagePts > 0) factors.push({ label: c.lifecycle_stage, points: stagePts, icon: Zap });
      score += stagePts + convPts;

      const grade = score >= 70 ? "A" : score >= 45 ? "B" : score >= 20 ? "C" : "D";

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        tags: c.tags || [],
        score,
        grade,
        factors,
        conversationCount: convInfo.count,
        lastActivity: convInfo.lastAt,
        hasOrders,
        lifecycle_stage: c.lifecycle_stage,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    setCustomers(scored);
    setLoading(false);
  };

  const gradeDistribution = {
    A: customers.filter(c => c.grade === "A").length,
    B: customers.filter(c => c.grade === "B").length,
    C: customers.filter(c => c.grade === "C").length,
    D: customers.filter(c => c.grade === "D").length,
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-5" dir="rtl">
      {/* Grade distribution */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["A", "B", "C", "D"] as const).map(g => (
          <Card key={g} className="bg-card/70 backdrop-blur-sm border-border/40 rounded-2xl">
            <CardContent className="p-4 text-center">
              <div className={`w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center text-lg font-black border ${GRADE_COLORS[g]}`}>
                {g}
              </div>
              <p className="text-2xl font-black">{gradeDistribution[g]}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {g === "A" ? "عملاء VIP" : g === "B" ? "عملاء نشطون" : g === "C" ? "بحاجة متابعة" : "غير نشطين"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Refresh */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="text-xs gap-1.5 rounded-xl" onClick={calculate}>
          <RefreshCw className="w-3.5 h-3.5" /> تحديث النقاط
        </Button>
      </div>

      {/* Customer list */}
      <Card className="bg-card/70 backdrop-blur-sm border-border/40 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[650px]">
            <thead>
              <tr className="border-b border-border/30 text-muted-foreground text-[11px] bg-secondary/20">
                <th className="text-right p-3.5 font-semibold">العميل</th>
                <th className="text-right p-3.5 font-semibold">النقاط</th>
                <th className="text-right p-3.5 font-semibold">الدرجة</th>
                <th className="text-right p-3.5 font-semibold hidden md:table-cell">العوامل</th>
                <th className="text-right p-3.5 font-semibold hidden lg:table-cell">المحادثات</th>
              </tr>
            </thead>
            <tbody>
              {customers.slice(0, 50).map(c => (
                <tr key={c.id} className="border-b border-border/20 hover:bg-secondary/30 transition-colors">
                  <td className="p-3">
                    <p className="font-medium text-sm">{c.name || "بدون اسم"}</p>
                    <p className="text-[10px] text-muted-foreground font-mono" dir="ltr">{c.phone}</p>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Progress value={c.score} className="h-2 w-16" />
                      <span className="text-xs font-bold">{c.score}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={`text-xs font-black ${GRADE_COLORS[c.grade]}`}>
                      {c.grade}
                    </Badge>
                  </td>
                  <td className="p-3 hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {c.factors.slice(0, 3).map((f, i) => (
                        <Tooltip key={i}>
                          <TooltipTrigger>
                            <Badge variant="secondary" className="text-[9px] gap-0.5 px-1.5">
                              <f.icon className="w-2.5 h-2.5" />
                              +{f.points}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-[11px]">{f.label}</TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 hidden lg:table-cell text-xs text-muted-foreground">{c.conversationCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default LeadScoring;

