import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BarChart3 } from "lucide-react";

const AdminUsage = () => {
  const [usage, setUsage] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [u, o, p] = await Promise.all([
      supabase.from("usage_tracking").select("*").order("period", { ascending: false }),
      supabase.from("organizations").select("id, name, plan_id"),
      supabase.from("plans").select("*"),
    ]);
    setUsage(u.data || []);
    setOrgs(o.data || []);
    setPlans(p.data || []);
  };

  const getOrgName = (orgId: string) => orgs.find((o) => o.id === orgId)?.name || orgId.slice(0, 8);
  const getOrgPlan = (orgId: string) => {
    const org = orgs.find((o) => o.id === orgId);
    return plans.find((p) => p.id === org?.plan_id);
  };

  const getUsagePercent = (used: number, limit: number) => {
    if (limit >= 999999) return 0;
    return Math.min((used / limit) * 100, 100);
  };

  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" /> استخدام المنظمات</h2>

      <div className="space-y-3">
        {usage.map((u) => {
          const plan = getOrgPlan(u.org_id);
          const msgPercent = getUsagePercent(u.messages_sent + u.messages_received, plan?.max_messages_per_month || 1000);
          const convPercent = getUsagePercent(u.conversations_count, plan?.max_conversations || 100);

          return (
            <div key={u.id} className="bg-card rounded-xl shadow-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-sm">{getOrgName(u.org_id)}</p>
                  <p className="text-[10px] text-muted-foreground">الفترة: {u.period} · باقة: {plan?.name_ar || "—"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground">الرسائل المرسلة</p>
                  <p className="text-lg font-bold">{u.messages_sent}</p>
                  <div className="w-full bg-secondary rounded-full h-1.5 mt-1">
                    <div className={`h-1.5 rounded-full ${msgPercent > 90 ? "bg-destructive" : msgPercent > 70 ? "bg-yellow-500" : "bg-primary"}`} style={{ width: `${msgPercent}%` }} />
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-0.5">من {plan?.max_messages_per_month || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">الرسائل المستلمة</p>
                  <p className="text-lg font-bold">{u.messages_received}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">المحادثات</p>
                  <p className="text-lg font-bold">{u.conversations_count}</p>
                  <div className="w-full bg-secondary rounded-full h-1.5 mt-1">
                    <div className={`h-1.5 rounded-full ${convPercent > 90 ? "bg-destructive" : convPercent > 70 ? "bg-yellow-500" : "bg-primary"}`} style={{ width: `${convPercent}%` }} />
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-0.5">من {plan?.max_conversations || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">طلبات API</p>
                  <p className="text-lg font-bold">{u.api_calls}</p>
                </div>
              </div>
            </div>
          );
        })}
        {usage.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">لا توجد بيانات استخدام</p>}
      </div>
    </div>
  );
};

export default AdminUsage;