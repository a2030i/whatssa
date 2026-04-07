import { useState, useEffect } from "react";
import { Star, BarChart3, Loader2, ThumbsUp, ThumbsDown, Minus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CsatStats {
  total: number;
  avg: number;
  distribution: Record<number, number>;
  topAgents: { name: string; avg: number; count: number }[];
}

const CsatDashboard = () => {
  const { orgId } = useAuth();
  const [stats, setStats] = useState<CsatStats>({ total: 0, avg: 0, distribution: {}, topAgents: [] });
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const { data: ratings } = await supabase
      .from("satisfaction_ratings")
      .select("rating, agent_name")
      .eq("org_id", orgId)
      .gte("created_at", since);

    if (!ratings || ratings.length === 0) {
      setStats({ total: 0, avg: 0, distribution: {}, topAgents: [] });
      setLoading(false);
      return;
    }

    const dist: Record<number, number> = {};
    const agentMap: Record<string, { sum: number; count: number }> = {};

    for (const r of ratings) {
      dist[r.rating] = (dist[r.rating] || 0) + 1;
      if (r.agent_name) {
        if (!agentMap[r.agent_name]) agentMap[r.agent_name] = { sum: 0, count: 0 };
        agentMap[r.agent_name].sum += r.rating;
        agentMap[r.agent_name].count += 1;
      }
    }

    const avg = ratings.reduce((s, r) => s + r.rating, 0) / ratings.length;
    const topAgents = Object.entries(agentMap)
      .map(([name, v]) => ({ name, avg: v.sum / v.count, count: v.count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);

    setStats({ total: ratings.length, avg: Math.round(avg * 10) / 10, distribution: dist, topAgents });
    setLoading(false);
  };

  useEffect(() => { load(); }, [orgId, period]);

  const getSatisfactionLabel = (avg: number) => {
    if (avg >= 4) return { label: "ممتاز", icon: ThumbsUp, color: "text-success" };
    if (avg >= 3) return { label: "جيد", icon: Minus, color: "text-warning" };
    return { label: "يحتاج تحسين", icon: ThumbsDown, color: "text-destructive" };
  };

  const satisfaction = getSatisfactionLabel(stats.avg);
  const SatIcon = satisfaction.icon;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-warning" />
          <h3 className="font-semibold text-sm">رضا العملاء (CSAT)</h3>
          <Badge variant="secondary" className="text-[10px]">{stats.total} تقييم</Badge>
        </div>
        <div className="flex gap-1">
          {(["7d", "30d", "90d"] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={cn(
              "text-[10px] px-2 py-1 rounded-full transition-colors",
              period === p ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            )}>
              {p === "7d" ? "أسبوع" : p === "30d" ? "شهر" : "3 أشهر"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : stats.total === 0 ? (
        <div className="text-center py-8">
          <Star className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">لا توجد تقييمات في هذه الفترة</p>
          <p className="text-[10px] text-muted-foreground mt-1">فعّل استبيان الرضا من إعدادات المحادثات</p>
        </div>
      ) : (
        <>
          {/* Average score */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-secondary/50">
            <div className="text-center">
              <p className={cn("text-3xl font-black", satisfaction.color)}>{stats.avg}</p>
              <p className="text-[10px] text-muted-foreground">من 5</p>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5 mb-1">
                <SatIcon className={cn("w-4 h-4", satisfaction.color)} />
                <span className={cn("text-sm font-semibold", satisfaction.color)}>{satisfaction.label}</span>
              </div>
              {/* Distribution bars */}
              <div className="space-y-1">
                {[5, 4, 3, 2, 1].map(r => {
                  const count = stats.distribution[r] || 0;
                  const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                  return (
                    <div key={r} className="flex items-center gap-1.5">
                      <span className="text-[9px] w-3 text-center text-muted-foreground">{r}</span>
                      <Star className="w-2.5 h-2.5 text-warning fill-warning" />
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-warning transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[9px] text-muted-foreground w-6 text-left">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Top agents */}
          {stats.topAgents.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">أفضل الموظفين</p>
              <div className="space-y-1">
                {stats.topAgents.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                      {a.name.slice(0, 2)}
                    </div>
                    <span className="text-xs font-medium flex-1 truncate">{a.name}</span>
                    <Badge variant="outline" className="text-[9px]">{a.count} تقييم</Badge>
                    <span className="text-xs font-bold text-warning">{Math.round(a.avg * 10) / 10} ⭐</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CsatDashboard;
