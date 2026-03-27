import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Search, Building2, UserCheck, UserX } from "lucide-react";

const AdminAccounts = () => {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [wallets, setWallets] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [o, p, pl, w] = await Promise.all([
      supabase.from("organizations").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*"),
      supabase.from("plans").select("*").order("sort_order"),
      supabase.from("wallets").select("*"),
    ]);
    setOrgs(o.data || []);
    setProfiles(p.data || []);
    setPlans(pl.data || []);
    setWallets(w.data || []);
  };

  const toggleActive = async (orgId: string, active: boolean) => {
    await supabase.from("organizations").update({ is_active: !active }).eq("id", orgId);
    toast.success(!active ? "تم التفعيل" : "تم التعطيل");
    load();
  };

  const updatePlan = async (orgId: string, planId: string) => {
    await supabase.from("organizations").update({ plan_id: planId }).eq("id", orgId);
    toast.success("تم تحديث الباقة");
    load();
  };

  const updateStatus = async (orgId: string, status: string) => {
    await supabase.from("organizations").update({ subscription_status: status }).eq("id", orgId);
    toast.success("تم تحديث الحالة");
    load();
  };

  const statusColor = (s: string) => {
    const m: Record<string, string> = { trial: "bg-blue-100 text-blue-700", active: "bg-green-100 text-green-700", expired: "bg-destructive/10 text-destructive", cancelled: "bg-muted text-muted-foreground" };
    return m[s] || m.trial;
  };

  const filtered = orgs.filter((o) => o.name?.toLowerCase().includes(search.toLowerCase()) || o.id.includes(search));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="بحث بالاسم أو ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 text-sm" />
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} منظمة</span>
      </div>

      <div className="space-y-3">
        {filtered.map((org) => {
          const plan = plans.find((p) => p.id === org.plan_id);
          const members = profiles.filter((p) => p.org_id === org.id);
          const wallet = wallets.find((w) => w.org_id === org.id);
          const isExpanded = expandedOrg === org.id;

          return (
            <div key={org.id} className="bg-card rounded-xl shadow-card overflow-hidden">
              <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-secondary/30 transition-colors" onClick={() => setExpandedOrg(isExpanded ? null : org.id)}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{org.name}</p>
                    <p className="text-[10px] text-muted-foreground">{org.id.slice(0, 12)}... · {members.length} عضو · رصيد: {wallet?.balance || 0} ر.س</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor(org.subscription_status)}`}>
                    {org.subscription_status === "trial" ? "تجريبي" : org.subscription_status === "active" ? "فعال" : org.subscription_status === "expired" ? "منتهي" : "ملغي"}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{plan?.name_ar || "بدون"}</span>
                  {org.is_active ? <UserCheck className="w-4 h-4 text-primary" /> : <UserX className="w-4 h-4 text-destructive" />}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-border p-4 space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] text-muted-foreground">الباقة</label>
                      <select value={org.plan_id || ""} onChange={(e) => updatePlan(org.id, e.target.value)} className="w-full text-xs bg-secondary rounded-lg px-3 py-2 mt-1">
                        {plans.map((p) => <option key={p.id} value={p.id}>{p.name_ar} - {p.price} ر.س</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">حالة الاشتراك</label>
                      <select value={org.subscription_status} onChange={(e) => updateStatus(org.id, e.target.value)} className="w-full text-xs bg-secondary rounded-lg px-3 py-2 mt-1">
                        <option value="trial">تجريبي</option>
                        <option value="active">فعال</option>
                        <option value="expired">منتهي</option>
                        <option value="cancelled">ملغي</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">تاريخ الإنشاء</label>
                      <p className="text-xs mt-1 bg-secondary rounded-lg px-3 py-2">{org.created_at ? new Date(org.created_at).toLocaleDateString("ar-SA") : "-"}</p>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">نهاية التجربة</label>
                      <p className="text-xs mt-1 bg-secondary rounded-lg px-3 py-2">{org.trial_ends_at ? new Date(org.trial_ends_at).toLocaleDateString("ar-SA") : "-"}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold mb-2">الأعضاء ({members.length})</p>
                    <div className="space-y-1">
                      {members.map((m) => (
                        <div key={m.id} className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">{m.full_name?.slice(0, 2) || "؟"}</div>
                          <span className="text-xs">{m.full_name || "بدون اسم"}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" variant={org.is_active ? "destructive" : "default"} className="text-xs" onClick={() => toggleActive(org.id, org.is_active)}>
                      {org.is_active ? "تعطيل المنظمة" : "تفعيل المنظمة"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminAccounts;