import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Users, MessageSquare, TrendingUp, Wallet, Tag, BarChart3, Activity } from "lucide-react";

const AdminOverview = () => {
  const [stats, setStats] = useState({
    totalOrgs: 0, activeOrgs: 0, totalUsers: 0, totalConversations: 0,
    totalRevenue: 0, totalWalletBalance: 0, activeCoupons: 0, totalMessages: 0,
  });

  useEffect(() => {
    const load = async () => {
      const [orgs, profiles, convs, wallets, coupons, msgs] = await Promise.all([
        supabase.from("organizations").select("id, is_active, subscription_status"),
        supabase.from("profiles").select("id"),
        supabase.from("conversations").select("id"),
        supabase.from("wallets").select("balance"),
        supabase.from("coupons").select("id, is_active"),
        supabase.from("messages").select("id"),
      ]);
      setStats({
        totalOrgs: (orgs.data || []).length,
        activeOrgs: (orgs.data || []).filter((o) => o.is_active).length,
        totalUsers: (profiles.data || []).length,
        totalConversations: (convs.data || []).length,
        totalWalletBalance: (wallets.data || []).reduce((s, w) => s + Number(w.balance), 0),
        totalRevenue: 0,
        activeCoupons: (coupons.data || []).filter((c) => c.is_active).length,
        totalMessages: (msgs.data || []).length,
      });
    };
    load();
  }, []);

  const kpis = [
    { label: "إجمالي المنظمات", value: stats.totalOrgs, icon: Building2, color: "text-primary" },
    { label: "المنظمات الفعالة", value: stats.activeOrgs, icon: TrendingUp, color: "text-accent-foreground" },
    { label: "إجمالي المستخدمين", value: stats.totalUsers, icon: Users, color: "text-primary" },
    { label: "إجمالي المحادثات", value: stats.totalConversations, icon: MessageSquare, color: "text-primary" },
    { label: "إجمالي الرسائل", value: stats.totalMessages, icon: BarChart3, color: "text-primary" },
    { label: "رصيد المحافظ", value: `${stats.totalWalletBalance} ر.س`, icon: Wallet, color: "text-primary" },
    { label: "كوبونات فعالة", value: stats.activeCoupons, icon: Tag, color: "text-primary" },
    { label: "الإيرادات", value: `${stats.totalRevenue} ر.س`, icon: Activity, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-card rounded-xl p-4 shadow-card">
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              <span className="text-[11px] text-muted-foreground">{kpi.label}</span>
            </div>
            <p className="text-xl font-bold">{kpi.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminOverview;