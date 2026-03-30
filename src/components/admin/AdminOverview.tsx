import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Users, MessageSquare, TrendingUp, Wallet, Tag, BarChart3, Activity, Circle, DollarSign, ShoppingCart, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from "recharts";

const AdminOverview = () => {
  const [stats, setStats] = useState({
    totalOrgs: 0, activeOrgs: 0, trialOrgs: 0, expiredOrgs: 0,
    totalUsers: 0, onlineUsers: 0,
    totalConversations: 0, activeConversations: 0,
    totalMessages: 0, messagesToday: 0,
    totalWalletBalance: 0, totalRevenue: 0,
    activeCoupons: 0, totalOrders: 0, totalOrdersRevenue: 0,
  });
  const [onlineProfiles, setOnlineProfiles] = useState<any[]>([]);
  const [planDistribution, setPlanDistribution] = useState<any[]>([]);
  const [recentOrgs, setRecentOrgs] = useState<any[]>([]);
  const [monthlyMessages, setMonthlyMessages] = useState<any[]>([]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const load = async () => {
    const [orgs, profiles, convs, wallets, coupons, msgs, plans, orders, transactions, usage] = await Promise.all([
      supabase.from("organizations").select("id, is_active, subscription_status, plan_id, name, created_at"),
      supabase.from("profiles").select("id, full_name, is_online, last_seen_at, org_id"),
      supabase.from("conversations").select("id, status"),
      supabase.from("wallets").select("balance"),
      supabase.from("coupons").select("id, is_active"),
      supabase.from("messages").select("id, created_at").order("created_at", { ascending: false }).limit(1000),
      supabase.from("plans").select("id, name_ar"),
      supabase.from("orders").select("id, total, created_at"),
      supabase.from("wallet_transactions").select("amount, type, created_at").eq("type", "credit"),
      supabase.from("usage_tracking").select("*").order("period", { ascending: false }).limit(12),
    ]);

    const orgsData = orgs.data || [];
    const profilesData = profiles.data || [];
    const msgsData = msgs.data || [];
    const ordersData = orders.data || [];
    const transData = transactions.data || [];

    const today = new Date().toISOString().slice(0, 10);
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const online = profilesData.filter(p => p.is_online || (p.last_seen_at && p.last_seen_at > fiveMinAgo));
    setOnlineProfiles(online);

    // Plan distribution
    const planMap: Record<string, number> = {};
    orgsData.forEach(o => {
      const plan = (plans.data || []).find(p => p.id === o.plan_id);
      const name = plan?.name_ar || "بدون باقة";
      planMap[name] = (planMap[name] || 0) + 1;
    });
    setPlanDistribution(Object.entries(planMap).map(([name, value]) => ({ name, value })));

    // Recent orgs
    setRecentOrgs(orgsData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5));

    // Monthly messages from usage
    setMonthlyMessages(
      (usage.data || []).reverse().map(u => ({
        period: u.period,
        sent: u.messages_sent,
        received: u.messages_received,
      }))
    );

    setStats({
      totalOrgs: orgsData.length,
      activeOrgs: orgsData.filter(o => o.is_active && o.subscription_status === "active").length,
      trialOrgs: orgsData.filter(o => o.subscription_status === "trial").length,
      expiredOrgs: orgsData.filter(o => o.subscription_status === "expired" || o.subscription_status === "cancelled").length,
      totalUsers: profilesData.length,
      onlineUsers: online.length,
      totalConversations: (convs.data || []).length,
      activeConversations: (convs.data || []).filter(c => c.status === "active").length,
      totalMessages: msgsData.length,
      messagesToday: msgsData.filter(m => m.created_at?.startsWith(today)).length,
      totalWalletBalance: (wallets.data || []).reduce((s, w) => s + Number(w.balance), 0),
      totalRevenue: transData.reduce((s, t) => s + Number(t.amount), 0),
      activeCoupons: (coupons.data || []).filter(c => c.is_active).length,
      totalOrders: ordersData.length,
      totalOrdersRevenue: ordersData.reduce((s, o) => s + Number(o.total || 0), 0),
    });
  };

  const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

  const kpis = [
    { label: "إجمالي المنظمات", value: stats.totalOrgs, sub: `${stats.activeOrgs} فعّال · ${stats.trialOrgs} تجريبي`, icon: Building2, color: "text-primary", bg: "bg-primary/10" },
    { label: "المستخدمين", value: stats.totalUsers, sub: `${stats.onlineUsers} متصل الآن`, icon: Users, color: "text-emerald-600", bg: "bg-emerald-500/10" },
    { label: "المحادثات", value: stats.totalConversations, sub: `${stats.activeConversations} نشطة`, icon: MessageSquare, color: "text-blue-600", bg: "bg-blue-500/10" },
    { label: "الرسائل", value: stats.totalMessages.toLocaleString(), sub: `${stats.messagesToday} اليوم`, icon: BarChart3, color: "text-violet-600", bg: "bg-violet-500/10" },
    { label: "الإيرادات (شحن رصيد)", value: `${stats.totalRevenue.toLocaleString()} ر.س`, sub: "إجمالي شحنات المحافظ", icon: DollarSign, color: "text-amber-600", bg: "bg-amber-500/10" },
    { label: "رصيد المحافظ", value: `${stats.totalWalletBalance.toLocaleString()} ر.س`, sub: "الرصيد الحالي الكلي", icon: Wallet, color: "text-primary", bg: "bg-primary/10" },
    { label: "الطلبات", value: stats.totalOrders, sub: `${stats.totalOrdersRevenue.toLocaleString()} ر.س إيرادات`, icon: ShoppingCart, color: "text-pink-600", bg: "bg-pink-500/10" },
    { label: "كوبونات فعالة", value: stats.activeCoupons, sub: "", icon: Tag, color: "text-cyan-600", bg: "bg-cyan-500/10" },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-card rounded-xl p-4 shadow-card border border-border/50">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-9 h-9 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              </div>
            </div>
            <p className="text-xl font-bold">{kpi.value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{kpi.label}</p>
            {kpi.sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{kpi.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Live Online Users */}
        <div className="bg-card rounded-xl shadow-card border border-border/50 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Circle className="w-3 h-3 fill-emerald-500 text-emerald-500 animate-pulse" />
            <h3 className="font-semibold text-sm">المتواجدون الآن ({onlineProfiles.length})</h3>
          </div>
          <div className="space-y-2 max-h-[240px] overflow-y-auto">
            {onlineProfiles.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">لا يوجد متصلين حالياً</p>
            ) : (
              onlineProfiles.map((p) => (
                <div key={p.id} className="flex items-center gap-3 bg-secondary/50 rounded-lg px-3 py-2">
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {p.full_name?.slice(0, 2) || "؟"}
                    </div>
                    <div className="absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-card" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{p.full_name || "بدون اسم"}</p>
                    <p className="text-[10px] text-muted-foreground">
                      آخر نشاط: {p.last_seen_at ? new Date(p.last_seen_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }) : "غير محدد"}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Plan Distribution */}
        <div className="bg-card rounded-xl shadow-card border border-border/50 p-4">
          <h3 className="font-semibold text-sm mb-4">توزيع الباقات</h3>
          {planDistribution.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={160}>
                <PieChart>
                  <Pie data={planDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={30}>
                    {planDistribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {planDistribution.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-[11px] flex-1">{p.name}</span>
                    <span className="text-[11px] font-bold">{p.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-10">لا توجد بيانات</p>
          )}
        </div>

        {/* Messages Chart */}
        <div className="bg-card rounded-xl shadow-card border border-border/50 p-4 md:col-span-2">
          <h3 className="font-semibold text-sm mb-4">حركة الرسائل الشهرية</h3>
          {monthlyMessages.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyMessages}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="sent" name="مرسلة" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="received" name="مستلمة" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-10">لا توجد بيانات استخدام حتى الآن</p>
          )}
        </div>
      </div>

      {/* Recent Organizations */}
      <div className="bg-card rounded-xl shadow-card border border-border/50 p-4">
        <h3 className="font-semibold text-sm mb-3">آخر المنظمات المسجلة</h3>
        <div className="divide-y divide-border">
          {recentOrgs.map((org) => (
            <div key={org.id} className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-medium">{org.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(org.created_at).toLocaleDateString("ar-SA")}
                  </p>
                </div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                org.subscription_status === "active" ? "bg-emerald-100 text-emerald-700" :
                org.subscription_status === "trial" ? "bg-blue-100 text-blue-700" :
                "bg-destructive/10 text-destructive"
              }`}>
                {org.subscription_status === "trial" ? "تجريبي" : org.subscription_status === "active" ? "فعّال" : "منتهي"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminOverview;
