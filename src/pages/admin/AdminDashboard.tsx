import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Users, Building2, CreditCard, MessageSquare, TrendingUp, Phone, ChevronLeft, Shield, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface OrgWithPlan {
  id: string;
  name: string;
  subscription_status: string;
  is_active: boolean;
  trial_ends_at: string | null;
  created_at: string | null;
  plan: { name: string; name_ar: string; price: number } | null;
  member_count: number;
}

const AdminDashboard = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<OrgWithPlan[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalOrgs: 0, activeOrgs: 0, totalUsers: 0, totalConversations: 0 });
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    const [orgsRes, plansRes, profilesRes, convsRes] = await Promise.all([
      supabase.from("organizations").select("*"),
      supabase.from("plans").select("*").order("sort_order"),
      supabase.from("profiles").select("id, org_id"),
      supabase.from("conversations").select("id"),
    ]);

    const orgsList = orgsRes.data || [];
    const profilesList = profilesRes.data || [];
    const plansList = plansRes.data || [];

    const enrichedOrgs: OrgWithPlan[] = orgsList.map((org) => ({
      ...org,
      plan: plansList.find((p) => p.id === org.plan_id) || null,
      member_count: profilesList.filter((p) => p.org_id === org.id).length,
    }));

    setOrgs(enrichedOrgs);
    setPlans(plansList);
    setStats({
      totalOrgs: orgsList.length,
      activeOrgs: orgsList.filter((o) => o.is_active).length,
      totalUsers: profilesList.length,
      totalConversations: (convsRes.data || []).length,
    });
    setIsLoading(false);
  };

  const updateOrgPlan = async (orgId: string, planId: string) => {
    const { error } = await supabase.from("organizations").update({ plan_id: planId }).eq("id", orgId);
    if (error) {
      toast.error("فشل تحديث الباقة");
    } else {
      toast.success("تم تحديث الباقة");
      loadData();
    }
  };

  const toggleOrgActive = async (orgId: string, currentActive: boolean) => {
    const { error } = await supabase.from("organizations").update({ is_active: !currentActive }).eq("id", orgId);
    if (error) {
      toast.error("فشل تحديث الحالة");
    } else {
      toast.success(!currentActive ? "تم تفعيل المنظمة" : "تم تعطيل المنظمة");
      loadData();
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      trial: { label: "تجريبي", className: "bg-blue-100 text-blue-700" },
      active: { label: "فعال", className: "bg-green-100 text-green-700" },
      expired: { label: "منتهي", className: "bg-red-100 text-red-700" },
      cancelled: { label: "ملغي", className: "bg-gray-100 text-gray-600" },
    };
    const s = map[status] || map.trial;
    return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${s.className}`}>{s.label}</span>;
  };

  const kpis = [
    { label: "إجمالي المنظمات", value: stats.totalOrgs, icon: Building2, color: "text-primary" },
    { label: "المنظمات الفعالة", value: stats.activeOrgs, icon: TrendingUp, color: "text-green-600" },
    { label: "إجمالي المستخدمين", value: stats.totalUsers, icon: Users, color: "text-blue-600" },
    { label: "إجمالي المحادثات", value: stats.totalConversations, icon: MessageSquare, color: "text-purple-600" },
  ];

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold">لوحة Super Admin</h1>
            <p className="text-[11px] text-muted-foreground">إدارة كل المشتركين والباقات</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => navigate("/")}>
            <ChevronLeft className="w-3 h-3" /> لوحة العميل
          </Button>
          <Button variant="ghost" size="sm" className="text-xs gap-1 text-destructive" onClick={signOut}>
            <LogOut className="w-3 h-3" /> خروج
          </Button>
        </div>
      </header>

      <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="bg-card rounded-xl p-4 shadow-card">
              <div className="flex items-center gap-2 mb-2">
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
              </div>
              <p className="text-2xl font-bold">{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Plans Overview */}
        <div className="bg-card rounded-xl shadow-card">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">الباقات</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {plans.map((plan) => (
              <div key={plan.id} className="border border-border rounded-lg p-3 text-center">
                <p className="font-bold text-sm">{plan.name_ar}</p>
                <p className="text-xl font-bold text-primary mt-1">
                  {plan.price === 0 ? "مجاني" : `${plan.price} ر.س`}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">{plan.billing_cycle === "monthly" ? "/شهرياً" : ""}</p>
                <div className="mt-2 space-y-1">
                  {(plan.features as string[])?.slice(0, 3).map((f: string, i: number) => (
                    <p key={i} className="text-[10px] text-muted-foreground">{f}</p>
                  ))}
                </div>
                <p className="text-[10px] mt-2 text-muted-foreground">
                  {orgs.filter((o) => o.plan?.name === plan.name).length} مشترك
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Organizations Table */}
        <div className="bg-card rounded-xl shadow-card">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">المنظمات ({orgs.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-[11px]">
                  <th className="text-right p-3">المنظمة</th>
                  <th className="text-right p-3">الباقة</th>
                  <th className="text-right p-3">الحالة</th>
                  <th className="text-right p-3">الأعضاء</th>
                  <th className="text-right p-3">تاريخ الإنشاء</th>
                  <th className="text-right p-3">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((org) => (
                  <tr key={org.id} className="border-b border-border hover:bg-secondary/50 transition-colors">
                    <td className="p-3">
                      <div>
                        <p className="font-medium text-xs">{org.name}</p>
                        <p className="text-[10px] text-muted-foreground">{org.id.slice(0, 8)}...</p>
                      </div>
                    </td>
                    <td className="p-3">
                      <select
                        value={org.plan?.name || ""}
                        onChange={(e) => {
                          const plan = plans.find((p) => p.name === e.target.value);
                          if (plan) updateOrgPlan(org.id, plan.id);
                        }}
                        className="text-[11px] bg-secondary rounded px-2 py-1 border-0"
                      >
                        {plans.map((p) => (
                          <option key={p.id} value={p.name}>{p.name_ar}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3">{statusBadge(org.subscription_status)}</td>
                    <td className="p-3 text-xs">{org.member_count}</td>
                    <td className="p-3 text-[11px] text-muted-foreground">
                      {org.created_at ? new Date(org.created_at).toLocaleDateString("ar-SA") : "-"}
                    </td>
                    <td className="p-3">
                      <Button
                        size="sm"
                        variant={org.is_active ? "destructive" : "default"}
                        className="text-[10px] h-7 px-2"
                        onClick={() => toggleOrgActive(org.id, org.is_active)}
                      >
                        {org.is_active ? "تعطيل" : "تفعيل"}
                      </Button>
                    </td>
                  </tr>
                ))}
                {orgs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground text-sm">
                      {isLoading ? "جاري التحميل..." : "لا توجد منظمات بعد"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;