import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BarChart3, RefreshCw, Download, TrendingDown, TrendingUp, Minus, Bot, Zap, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UsageRow {
  id: string;
  org_id: string;
  period: string;
  messages_sent: number;
  messages_received: number;
  conversations_count: number;
  api_calls: number;
}

interface FeatureAdoption {
  hasCampaigns: boolean;
  hasChatbot: boolean;
  hasAutomation: boolean;
}

const AdminUsage = () => {
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [adoption, setAdoption] = useState<Record<string, FeatureAdoption>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [u, o, p] = await Promise.all([
      supabase.from("usage_tracking").select("id, org_id, period, messages_sent, messages_received, conversations_count, api_calls").order("period", { ascending: false }),
      supabase.from("organizations").select("id, name, plan_id"),
      supabase.from("plans").select("id, name_ar, max_messages_per_month, max_conversations"),
    ]);
    const usageData: UsageRow[] = (u.data || []) as UsageRow[];
    setUsage(usageData);
    setOrgs(o.data || []);
    setPlans(p.data || []);

    // Load feature adoption for unique orgs
    const uniqueOrgIds = [...new Set(usageData.map(r => r.org_id))];
    if (uniqueOrgIds.length > 0) {
      const [camps, bots, automations] = await Promise.all([
        supabase.from("campaigns").select("org_id").in("org_id", uniqueOrgIds),
        supabase.from("chatbot_flows").select("org_id").eq("is_active", true).in("org_id", uniqueOrgIds),
        supabase.from("automation_rules" as any).select("org_id").in("org_id", uniqueOrgIds),
      ]);
      const adoptionMap: Record<string, FeatureAdoption> = {};
      for (const orgId of uniqueOrgIds) {
        adoptionMap[orgId] = {
          hasCampaigns: !!(camps.data || []).find((r: any) => r.org_id === orgId),
          hasChatbot: !!(bots.data || []).find((r: any) => r.org_id === orgId),
          hasAutomation: !!(automations.data || []).find((r: any) => r.org_id === orgId),
        };
      }
      setAdoption(adoptionMap);
    }
    setLoading(false);
  };

  const getOrgName = (orgId: string) => orgs.find((o) => o.id === orgId)?.name || orgId.slice(0, 8);
  const getOrgPlan = (orgId: string) => {
    const org = orgs.find((o) => o.id === orgId);
    return plans.find((p) => p.id === org?.plan_id);
  };

  const getUsagePercent = (used: number, limit: number) => {
    if (!limit || limit >= 999999) return 0;
    return Math.min((used / limit) * 100, 100);
  };

  // Group usage rows by org, sorted by period desc — pick latest and previous
  const getChurnRisk = (orgId: string): "high" | "medium" | "none" => {
    const rows = usage.filter(u => u.org_id === orgId).sort((a, b) => b.period.localeCompare(a.period));
    if (rows.length < 2) return "none";
    const curr = rows[0].messages_sent + rows[0].messages_received;
    const prev = rows[1].messages_sent + rows[1].messages_received;
    if (prev === 0) return "none";
    const drop = (prev - curr) / prev;
    if (drop >= 0.5) return "high";
    if (drop >= 0.3) return "medium";
    return "none";
  };

  const getMoM = (orgId: string): number | null => {
    const rows = usage.filter(u => u.org_id === orgId).sort((a, b) => b.period.localeCompare(a.period));
    if (rows.length < 2) return null;
    const curr = rows[0].messages_sent + rows[0].messages_received;
    const prev = rows[1].messages_sent + rows[1].messages_received;
    if (prev === 0) return null;
    return Math.round(((curr - prev) / prev) * 100);
  };

  const exportCSV = () => {
    const rows = [
      ["المنظمة", "الفترة", "الباقة", "رسائل مرسلة", "رسائل مستلمة", "محادثات", "استدعاءات API", "% الرسائل", "% المحادثات", "مخاطر التوقف"],
      ...usage.map((u) => {
        const plan = getOrgPlan(u.org_id);
        const msgPct = getUsagePercent(u.messages_sent + u.messages_received, plan?.max_messages_per_month || 0);
        const convPct = getUsagePercent(u.conversations_count, plan?.max_conversations || 0);
        return [
          getOrgName(u.org_id),
          u.period,
          plan?.name_ar || "—",
          u.messages_sent,
          u.messages_received,
          u.conversations_count,
          u.api_calls,
          msgPct.toFixed(1) + "%",
          convPct.toFixed(1) + "%",
          getChurnRisk(u.org_id),
        ];
      }),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usage_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Show only latest period per org to avoid duplicates, but keep all for churn calc
  const latestPerOrg = Object.values(
    usage.reduce<Record<string, UsageRow>>((acc, u) => {
      if (!acc[u.org_id] || u.period > acc[u.org_id].period) acc[u.org_id] = u;
      return acc;
    }, {})
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" /> استخدام المنظمات
        </h2>
        <div className="flex items-center gap-2">
          {usage.length > 0 && (
            <Button size="sm" variant="outline" className="text-xs gap-1" onClick={exportCSV}>
              <Download className="w-3 h-3" /> تصدير CSV
            </Button>
          )}
          <Button size="sm" variant="outline" className="text-xs gap-1" onClick={load} disabled={loading}>
            <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} /> تحديث
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {latestPerOrg.map((u) => {
          const plan = getOrgPlan(u.org_id);
          const msgTotal = u.messages_sent + u.messages_received;
          const msgLimit = plan?.max_messages_per_month || 0;
          const convLimit = plan?.max_conversations || 0;
          const msgPercent = getUsagePercent(msgTotal, msgLimit);
          const convPercent = getUsagePercent(u.conversations_count, convLimit);
          const msgCritical = msgPercent > 90;
          const msgWarning = msgPercent > 70;
          const convCritical = convPercent > 90;
          const churnRisk = getChurnRisk(u.org_id);
          const mom = getMoM(u.org_id);
          const orgAdoption = adoption[u.org_id];

          return (
            <div key={u.id} className={cn(
              "bg-card rounded-xl shadow-card p-4",
              (msgCritical || convCritical) && "border border-destructive/40",
              churnRisk === "high" && "border border-orange-400/50"
            )}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-sm">{getOrgName(u.org_id)}</p>
                  <p className="text-[10px] text-muted-foreground">الفترة: {u.period} · باقة: {plan?.name_ar || "—"}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {/* MoM trend */}
                  {mom !== null && (
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1",
                      mom > 0 ? "bg-success/10 text-success" : mom < 0 ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"
                    )}>
                      {mom > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : mom < 0 ? <TrendingDown className="w-2.5 h-2.5" /> : <Minus className="w-2.5 h-2.5" />}
                      {mom > 0 ? "+" : ""}{mom}%
                    </span>
                  )}
                  {churnRisk === "high" && (
                    <span className="text-[10px] bg-orange-500/10 text-orange-500 px-2 py-0.5 rounded-full font-medium">
                      🔴 خطر توقف
                    </span>
                  )}
                  {churnRisk === "medium" && (
                    <span className="text-[10px] bg-yellow-500/10 text-yellow-600 px-2 py-0.5 rounded-full font-medium">
                      🟡 انخفاض نشاط
                    </span>
                  )}
                  {(msgCritical || convCritical) && (
                    <span className="text-[10px] bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium">
                      ⚠️ قريب من الحد
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground">الرسائل المرسلة</p>
                  <p className="text-lg font-bold">{u.messages_sent.toLocaleString()}</p>
                  {msgLimit > 0 && (
                    <>
                      <div className="w-full bg-secondary rounded-full h-1.5 mt-1">
                        <div className={`h-1.5 rounded-full transition-all ${msgCritical ? "bg-destructive" : msgWarning ? "bg-yellow-500" : "bg-primary"}`} style={{ width: `${msgPercent}%` }} />
                      </div>
                      <p className="text-[9px] text-muted-foreground mt-0.5">{msgPercent.toFixed(0)}% من {msgLimit.toLocaleString()}</p>
                    </>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">الرسائل المستلمة</p>
                  <p className="text-lg font-bold">{u.messages_received.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">المحادثات</p>
                  <p className="text-lg font-bold">{u.conversations_count.toLocaleString()}</p>
                  {convLimit > 0 && (
                    <>
                      <div className="w-full bg-secondary rounded-full h-1.5 mt-1">
                        <div className={`h-1.5 rounded-full transition-all ${convCritical ? "bg-destructive" : convPercent > 70 ? "bg-yellow-500" : "bg-primary"}`} style={{ width: `${convPercent}%` }} />
                      </div>
                      <p className="text-[9px] text-muted-foreground mt-0.5">{convPercent.toFixed(0)}% من {convLimit.toLocaleString()}</p>
                    </>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">طلبات API</p>
                  <p className="text-lg font-bold">{(u.api_calls || 0).toLocaleString()}</p>
                </div>
              </div>

              {/* Feature adoption row */}
              {orgAdoption && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/30">
                  <span className="text-[9px] text-muted-foreground">الميزات:</span>
                  <span className={cn("text-[9px] flex items-center gap-0.5 px-1.5 py-0.5 rounded", orgAdoption.hasChatbot ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground/50 line-through")}>
                    <Bot className="w-2.5 h-2.5" /> شات بوت
                  </span>
                  <span className={cn("text-[9px] flex items-center gap-0.5 px-1.5 py-0.5 rounded", orgAdoption.hasAutomation ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground/50 line-through")}>
                    <Zap className="w-2.5 h-2.5" /> أتمتة
                  </span>
                  <span className={cn("text-[9px] flex items-center gap-0.5 px-1.5 py-0.5 rounded", orgAdoption.hasCampaigns ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground/50 line-through")}>
                    <Megaphone className="w-2.5 h-2.5" /> حملات
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {usage.length === 0 && !loading && (
          <p className="text-center text-muted-foreground text-sm py-8">لا توجد بيانات استخدام</p>
        )}
      </div>
    </div>
  );
};

export default AdminUsage;
