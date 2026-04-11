import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BarChart3, RefreshCw, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AdminUsage = () => {
  const [usage, setUsage] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [u, o, p] = await Promise.all([
      supabase.from("usage_tracking").select("*").order("period", { ascending: false }),
      supabase.from("organizations").select("id, name, plan_id"),
      supabase.from("plans").select("*"),
    ]);
    setUsage(u.data || []);
    setOrgs(o.data || []);
    setPlans(p.data || []);
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

  const exportCSV = () => {
    const rows = [
      ["المنظمة", "الفترة", "الباقة", "رسائل مرسلة", "رسائل مستلمة", "محادثات", "استدعاءات API", "% الرسائل", "% المحادثات"],
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
        {usage.map((u) => {
          const plan = getOrgPlan(u.org_id);
          const msgTotal = u.messages_sent + u.messages_received;
          const msgLimit = plan?.max_messages_per_month || 0;
          const convLimit = plan?.max_conversations || 0;
          const msgPercent = getUsagePercent(msgTotal, msgLimit);
          const convPercent = getUsagePercent(u.conversations_count, convLimit);
          const msgCritical = msgPercent > 90;
          const msgWarning = msgPercent > 70;
          const convCritical = convPercent > 90;
          const convWarning = convPercent > 70;

          return (
            <div key={u.id} className={cn(
              "bg-card rounded-xl shadow-card p-4",
              (msgCritical || convCritical) && "border border-destructive/40"
            )}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-sm">{getOrgName(u.org_id)}</p>
                  <p className="text-[10px] text-muted-foreground">الفترة: {u.period} · باقة: {plan?.name_ar || "—"}</p>
                </div>
                {(msgCritical || convCritical) && (
                  <span className="text-[10px] bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium">
                    ⚠️ قريب من الحد
                  </span>
                )}
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
                        <div className={`h-1.5 rounded-full transition-all ${convCritical ? "bg-destructive" : convWarning ? "bg-yellow-500" : "bg-primary"}`} style={{ width: `${convPercent}%` }} />
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

