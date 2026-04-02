import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Building2, Users, MessageSquare, TrendingUp, Wallet, Tag, BarChart3, Activity, Circle, DollarSign, ShoppingCart, ArrowUpRight, ArrowDownRight, AlertTriangle, Database, Zap, Server, Clock, Shield, Cpu, HardDrive, RefreshCw, ArrowUp, Layers, Globe, Lock, FileArchive, Table2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, AreaChart, Area } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

interface SystemStats {
  messages_today: number;
  messages_this_hour: number;
  messages_yesterday: number;
  messages_total: number;
  conversations_today: number;
  conversations_total: number;
  conversations_active: number;
  campaigns_today: number;
  campaigns_running: number;
  orgs_total: number;
  orgs_active: number;
  orgs_trial: number;
  users_total: number;
  users_online: number;
  db_size_mb: number;
  messages_table_rows: number;
  avg_messages_per_hour_today: number;
}

interface HourlyData {
  hour: number;
  count: number;
}

interface OrgUsage {
  org_name: string;
  subscription_status: string;
  plan_name: string;
  total_messages: number;
  conversations: number;
  max_messages_per_month: number;
  max_conversations: number;
  usage_pct: number;
}

interface CapacityAlert {
  level: "info" | "warning" | "critical";
  title: string;
  description: string;
  icon: any;
}

interface InfraStatus {
  db_size_mb: number;
  db_max_mb: number;
  storage_size_mb: number;
  storage_max_mb: number;
  auth_users: number;
  auth_max_users: number;
  active_connections: number;
  max_connections: number;
  table_sizes: { table_name: string; row_count: number; size_mb: number }[];
  total_tables: number;
  total_indexes: number;
  uptime_hours: number;
}

const AdminOverview = () => {
  const [sysStats, setSysStats] = useState<SystemStats | null>(null);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [topOrgs, setTopOrgs] = useState<OrgUsage[]>([]);
  const [onlineProfiles, setOnlineProfiles] = useState<any[]>([]);
  const [planDistribution, setPlanDistribution] = useState<any[]>([]);
  const [recentOrgs, setRecentOrgs] = useState<any[]>([]);
  const [monthlyMessages, setMonthlyMessages] = useState<any[]>([]);
  const [walletStats, setWalletStats] = useState({ balance: 0, revenue: 0 });
  const [infraStatus, setInfraStatus] = useState<InfraStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const load = async () => {
    try {
      const [statsRes, hourlyRes, topOrgsRes, profiles, orgs, plans, wallets, transactions, usage, infraRes] = await Promise.all([
        supabase.rpc("admin_get_system_stats"),
        supabase.rpc("admin_get_hourly_messages", { _date: new Date().toISOString().slice(0, 10) }),
        supabase.rpc("admin_get_top_orgs_usage", { _limit: 10 }),
        supabase.from("profiles").select("id, full_name, is_online, last_seen_at, org_id"),
        supabase.from("organizations").select("id, is_active, subscription_status, plan_id, name, created_at"),
        supabase.from("plans").select("id, name_ar"),
        supabase.from("wallets").select("balance"),
        supabase.from("wallet_transactions").select("amount, type").eq("type", "credit"),
        supabase.from("usage_tracking").select("*").order("period", { ascending: false }).limit(12),
        supabase.rpc("admin_get_infra_status"),
      ]);

      if (statsRes.data) setSysStats(statsRes.data as unknown as SystemStats);
      if (hourlyRes.data) setHourlyData(hourlyRes.data as unknown as HourlyData[]);
      if (topOrgsRes.data) setTopOrgs(topOrgsRes.data as unknown as OrgUsage[]);

      const profilesData = profiles.data || [];
      const orgsData = orgs.data || [];
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      setOnlineProfiles(profilesData.filter(p => p.is_online || (p.last_seen_at && p.last_seen_at > fiveMinAgo)));

      // Plan distribution
      const planMap: Record<string, number> = {};
      orgsData.forEach(o => {
        const plan = (plans.data || []).find(p => p.id === o.plan_id);
        planMap[plan?.name_ar || "بدون باقة"] = (planMap[plan?.name_ar || "بدون باقة"] || 0) + 1;
      });
      setPlanDistribution(Object.entries(planMap).map(([name, value]) => ({ name, value })));

      setRecentOrgs(orgsData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5));

      setMonthlyMessages(
        (usage.data || []).reverse().map((u: any) => ({
          period: u.period,
          sent: u.messages_sent,
          received: u.messages_received,
        }))
      );

      setWalletStats({
        balance: (wallets.data || []).reduce((s, w) => s + Number(w.balance), 0),
        revenue: (transactions.data || []).reduce((s, t) => s + Number(t.amount), 0),
      });
      if (infraRes.data) setInfraStatus(infraRes.data as unknown as InfraStatus);
    } catch (err) {
      console.error("AdminOverview load error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Capacity alerts
  const getAlerts = (): CapacityAlert[] => {
    if (!sysStats) return [];
    const alerts: CapacityAlert[] = [];

    // Infrastructure alerts from infra status
    if (infraStatus) {
      const dbPct = (infraStatus.db_size_mb / infraStatus.db_max_mb) * 100;
      const storagePct = (infraStatus.storage_size_mb / infraStatus.storage_max_mb) * 100;
      const connPct = (infraStatus.active_connections / infraStatus.max_connections) * 100;

      if (dbPct > 80) {
        alerts.push({ level: "critical", title: "⚠️ قاعدة البيانات قاربت على الامتلاء", description: `${infraStatus.db_size_mb} MB من ${infraStatus.db_max_mb} MB (${Math.round(dbPct)}%) — يجب ترقية الباقة أو حذف البيانات القديمة فوراً`, icon: Database });
      } else if (dbPct > 60) {
        alerts.push({ level: "warning", title: "قاعدة البيانات تنمو بسرعة", description: `${infraStatus.db_size_mb} MB من ${infraStatus.db_max_mb} MB (${Math.round(dbPct)}%) — خطط للترقية قريباً`, icon: Database });
      }

      if (storagePct > 80) {
        alerts.push({ level: "critical", title: "⚠️ التخزين قارب على الامتلاء", description: `${infraStatus.storage_size_mb} MB من ${infraStatus.storage_max_mb} MB — يجب ترقية التخزين`, icon: FileArchive });
      } else if (storagePct > 50) {
        alerts.push({ level: "warning", title: "استهلاك التخزين مرتفع", description: `${infraStatus.storage_size_mb} MB من ${infraStatus.storage_max_mb} MB (${Math.round(storagePct)}%)`, icon: FileArchive });
      }

      if (connPct > 80) {
        alerts.push({ level: "critical", title: "⚠️ الاتصالات النشطة مرتفعة", description: `${infraStatus.active_connections} من ${infraStatus.max_connections} — قد يحدث بطء أو رفض اتصالات`, icon: Globe });
      }
    }

    // DB size alerts (fallback from sysStats)
    if (!infraStatus && sysStats.db_size_mb > 400) {
      alerts.push({ level: "critical", title: "حجم قاعدة البيانات مرتفع", description: `${sysStats.db_size_mb} MB — يُنصح بتفعيل أرشفة الرسائل القديمة`, icon: Database });
    } else if (!infraStatus && sysStats.db_size_mb > 200) {
      alerts.push({ level: "warning", title: "قاعدة البيانات تنمو", description: `${sysStats.db_size_mb} MB — راقب النمو الشهري`, icon: Database });
    }

    // Message volume alerts
    if (sysStats.messages_today > 50000) {
      alerts.push({ level: "critical", title: "حجم رسائل مرتفع جداً", description: `${sysStats.messages_today.toLocaleString()} رسالة اليوم — يُنصح بالترقية لنظام طوابير`, icon: Zap });
    } else if (sysStats.messages_today > 10000) {
      alerts.push({ level: "warning", title: "حجم رسائل كبير", description: `${sysStats.messages_today.toLocaleString()} رسالة اليوم — فكّر في التوسع`, icon: Zap });
    }

    // Growth alert
    if (sysStats.messages_yesterday > 0 && sysStats.messages_today > sysStats.messages_yesterday * 2) {
      alerts.push({ level: "warning", title: "نمو مفاجئ", description: `الرسائل اليوم ضعف الأمس (${sysStats.messages_today} vs ${sysStats.messages_yesterday})`, icon: TrendingUp });
    }

    // Hourly rate
    if (sysStats.avg_messages_per_hour_today > 5000) {
      alerts.push({ level: "critical", title: "معدل الساعة مرتفع", description: `${sysStats.avg_messages_per_hour_today.toLocaleString()} رسالة/ساعة — قد تحتاج Worker مخصص`, icon: Cpu });
    }

    // Orgs without limits check
    const overUsageOrgs = topOrgs.filter(o => o.usage_pct > 90);
    if (overUsageOrgs.length > 0) {
      alerts.push({ level: "warning", title: `${overUsageOrgs.length} منظمة قرب الحد الأقصى`, description: `حسابات تجاوزت 90% من حد الرسائل الشهري`, icon: AlertTriangle });
    }

    if (alerts.length === 0) {
      alerts.push({ level: "info", title: "النظام يعمل بشكل طبيعي", description: "لا توجد تنبيهات — جميع المؤشرات ضمن الحدود الآمنة", icon: Shield });
    }

    return alerts;
  };

  const alerts = getAlerts();
  const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

  // Estimated daily capacity
  const estimatedDailyCapacity = sysStats ? Math.round(sysStats.avg_messages_per_hour_today * 24) : 0;
  const dbUsagePct = sysStats ? Math.min((sysStats.db_size_mb / 500) * 100, 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center text-muted-foreground">
          <Activity className="w-8 h-8 mx-auto mb-2 animate-pulse" />
          <p className="text-sm">جاري تحميل البيانات...</p>
        </div>
      </div>
    );
  }

  if (!sysStats) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center text-muted-foreground">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
          <p className="text-sm">تعذّر تحميل إحصائيات النظام</p>
          <p className="text-xs mt-1">تأكد من وجود دوال RPC في القاعدة الخارجية</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => { setLoading(true); load(); }}>
            <RefreshCw className="w-3 h-3 ml-1" /> إعادة المحاولة
          </Button>
        </div>
      </div>
    );
  }

  const growthPct = sysStats.messages_yesterday > 0
    ? Math.round(((sysStats.messages_today - sysStats.messages_yesterday) / sysStats.messages_yesterday) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Capacity Alerts */}
      {alerts.some(a => a.level !== "info") && (
        <div className="space-y-2">
          {alerts.filter(a => a.level !== "info").map((alert, i) => (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${
              alert.level === "critical" 
                ? "bg-destructive/5 border-destructive/30 text-destructive" 
                : "bg-amber-500/5 border-amber-500/30 text-amber-700"
            }`}>
              <alert.icon className="w-5 h-5 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold">{alert.title}</p>
                <p className="text-xs opacity-80">{alert.description}</p>
              </div>
              <Badge variant="outline" className={`mr-auto shrink-0 text-[9px] ${
                alert.level === "critical" ? "border-destructive/50 text-destructive" : "border-amber-500/50 text-amber-600"
              }`}>
                {alert.level === "critical" ? "حرج" : "تحذير"}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* Hero Stats - Today's Performance */}
      <div className="bg-gradient-to-br from-primary/10 via-card to-card rounded-2xl border border-primary/20 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="font-bold text-sm">أداء اليوم — لحظي</h2>
          <Badge variant="outline" className="text-[9px] border-primary/30 text-primary mr-auto animate-pulse">
            <Circle className="w-2 h-2 fill-primary text-primary ml-1" /> مباشر
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <p className="text-3xl font-black text-primary">{sysStats.messages_today.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground">رسالة اليوم</p>
            <div className="flex items-center gap-1 mt-1">
              {growthPct >= 0 ? (
                <ArrowUpRight className="w-3 h-3 text-emerald-500" />
              ) : (
                <ArrowDownRight className="w-3 h-3 text-destructive" />
              )}
              <span className={`text-[10px] font-bold ${growthPct >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                {growthPct >= 0 ? "+" : ""}{growthPct}% عن أمس
              </span>
            </div>
          </div>

          <div>
            <p className="text-3xl font-black">{sysStats.messages_this_hour.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground">هذه الساعة</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">
              ~{sysStats.avg_messages_per_hour_today.toLocaleString()} متوسط/ساعة
            </p>
          </div>

          <div>
            <p className="text-3xl font-black">{sysStats.conversations_today.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground">محادثة جديدة اليوم</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">
              {sysStats.conversations_active.toLocaleString()} نشطة
            </p>
          </div>

          <div>
            <p className="text-3xl font-black">{sysStats.users_online}</p>
            <p className="text-[11px] text-muted-foreground">مستخدم متصل الآن</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">
              من {sysStats.users_total} إجمالي
            </p>
          </div>

          <div>
            <p className="text-3xl font-black">{sysStats.campaigns_running}</p>
            <p className="text-[11px] text-muted-foreground">حملة تعمل الآن</p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">
              {sysStats.campaigns_today} أُنشئت اليوم
            </p>
          </div>
        </div>
      </div>

      {/* Hourly Distribution Chart */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-card rounded-xl shadow-card border border-border/50 p-4">
          <h3 className="font-semibold text-sm mb-1">توزيع الرسائل بالساعة (اليوم)</h3>
          <p className="text-[10px] text-muted-foreground mb-3">يُحدّث كل 30 ثانية</p>
          {hourlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={hourlyData}>
                <defs>
                  <linearGradient id="msgGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hour" tick={{ fontSize: 9 }} tickFormatter={(h) => `${h}:00`} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip formatter={(v: number) => [v.toLocaleString(), "رسالة"]} labelFormatter={(h) => `الساعة ${h}:00`} />
                <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" fill="url(#msgGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-10">لا توجد رسائل اليوم بعد</p>
          )}
        </div>

        {/* Infrastructure Health - Enhanced */}
        <div className="bg-card rounded-xl shadow-card border border-border/50 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">صحة البنية التحتية</h3>
            <Badge variant="outline" className="text-[9px] mr-auto">
              {infraStatus ? `تشغيل ${infraStatus.uptime_hours} ساعة` : "..."}
            </Badge>
          </div>

          {infraStatus ? (
            <div className="space-y-3">
              {/* Database */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Database className="w-3 h-3" /> قاعدة البيانات</span>
                  <span className="text-[11px] font-bold">{infraStatus.db_size_mb} / {infraStatus.db_max_mb} MB</span>
                </div>
                <Progress value={(infraStatus.db_size_mb / infraStatus.db_max_mb) * 100} className="h-2" />
              </div>

              {/* Storage */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1"><FileArchive className="w-3 h-3" /> التخزين</span>
                  <span className="text-[11px] font-bold">{infraStatus.storage_size_mb} / {infraStatus.storage_max_mb} MB</span>
                </div>
                <Progress value={(infraStatus.storage_size_mb / infraStatus.storage_max_mb) * 100} className="h-2" />
              </div>

              {/* Connections */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Globe className="w-3 h-3" /> الاتصالات النشطة</span>
                  <span className="text-[11px] font-bold">{infraStatus.active_connections} / {infraStatus.max_connections}</span>
                </div>
                <Progress value={(infraStatus.active_connections / infraStatus.max_connections) * 100} className="h-2" />
              </div>

              {/* Auth Users */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Lock className="w-3 h-3" /> مستخدمي المصادقة</span>
                  <span className="text-[11px] font-bold">{infraStatus.auth_users}</span>
                </div>
              </div>

              {/* Tables & Indexes */}
              <div className="flex items-center gap-4">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Table2 className="w-3 h-3" /> {infraStatus.total_tables} جدول
                </span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Layers className="w-3 h-3" /> {infraStatus.total_indexes} فهرس
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1"><HardDrive className="w-3 h-3" /> قاعدة البيانات</span>
                  <span className="text-[11px] font-bold">{sysStats.db_size_mb} MB</span>
                </div>
                <Progress value={dbUsagePct} className="h-2" />
                <p className="text-[9px] text-muted-foreground mt-0.5">من 500 MB المتاح</p>
              </div>
            </div>
          )}

          {/* Upgrade recommendation */}
          <div className={`rounded-lg p-2.5 ${
            infraStatus && (infraStatus.db_size_mb / infraStatus.db_max_mb) > 0.6
              ? "bg-amber-500/10 border border-amber-500/20"
              : "bg-muted/50"
          }`}>
            <p className="text-[10px] font-bold mb-1">
              {infraStatus && (infraStatus.db_size_mb / infraStatus.db_max_mb) > 0.8
                ? "🔴 يجب الترقية فوراً"
                : infraStatus && (infraStatus.db_size_mb / infraStatus.db_max_mb) > 0.6
                  ? "🟡 خطط للترقية"
                  : "💡 توصية التوسع"
              }
            </p>
            <p className="text-[9px] text-muted-foreground leading-relaxed">
              {infraStatus && (infraStatus.db_size_mb / infraStatus.db_max_mb) > 0.8
                ? `قاعدة البيانات بلغت ${Math.round((infraStatus.db_size_mb / infraStatus.db_max_mb) * 100)}% — قم بترقية الباقة لتجنب توقف الخدمة`
                : infraStatus && (infraStatus.db_size_mb / infraStatus.db_max_mb) > 0.6
                  ? `استهلاك ${Math.round((infraStatus.db_size_mb / infraStatus.db_max_mb) * 100)}% — يُنصح بالتخطيط للترقية خلال الشهر القادم`
                  : sysStats.messages_today > 50000
                    ? "⚠️ تحتاج Queue System + Workers مخصصة فوراً"
                    : sysStats.messages_today > 10000
                      ? "📈 فكّر في إضافة Batch Processing للحملات"
                      : "✅ النظام يعمل بأريحية تامة"
              }
            </p>
          </div>
        </div>
      </div>

      {/* Table Sizes Breakdown */}
      {infraStatus && infraStatus.table_sizes?.length > 0 && (
        <div className="bg-card rounded-xl shadow-card border border-border/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Table2 className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">حجم الجداول الأكبر</h3>
            <span className="text-[10px] text-muted-foreground mr-auto">أكبر 15 جدول</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {infraStatus.table_sizes.filter(t => t.size_mb > 0).slice(0, 9).map((t) => (
              <div key={t.table_name} className="flex items-center justify-between bg-secondary/30 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium truncate">{t.table_name}</p>
                  <p className="text-[9px] text-muted-foreground">{t.row_count.toLocaleString()} صف</p>
                </div>
                <Badge variant="outline" className={`text-[9px] shrink-0 ${
                  t.size_mb > 50 ? "border-destructive/50 text-destructive" :
                  t.size_mb > 20 ? "border-amber-500/50 text-amber-600" :
                  "border-border"
                }`}>
                  {t.size_mb} MB
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "إجمالي الرسائل", value: sysStats.messages_total.toLocaleString(), sub: `${sysStats.messages_yesterday.toLocaleString()} أمس`, icon: BarChart3, color: "text-violet-600", bg: "bg-violet-500/10" },
          { label: "إجمالي المنظمات", value: sysStats.orgs_total, sub: `${sysStats.orgs_active} فعّال · ${sysStats.orgs_trial} تجريبي`, icon: Building2, color: "text-primary", bg: "bg-primary/10" },
          { label: "الإيرادات", value: `${walletStats.revenue.toLocaleString()} ر.س`, sub: "إجمالي شحنات المحافظ", icon: DollarSign, color: "text-amber-600", bg: "bg-amber-500/10" },
          { label: "رصيد المحافظ", value: `${walletStats.balance.toLocaleString()} ر.س`, sub: "الرصيد الحالي الكلي", icon: Wallet, color: "text-primary", bg: "bg-primary/10" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-card rounded-xl p-4 shadow-card border border-border/50">
            <div className={`w-9 h-9 rounded-lg ${kpi.bg} flex items-center justify-center mb-3`}>
              <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
            </div>
            <p className="text-xl font-bold">{kpi.value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{kpi.label}</p>
            {kpi.sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{kpi.sub}</p>}
          </div>
        ))}
      </div>

      {/* Top Orgs Usage + Online Users */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Organizations by Usage */}
        <div className="bg-card rounded-xl shadow-card border border-border/50 p-4">
          <h3 className="font-semibold text-sm mb-3">أكثر المنظمات استخداماً (هذا الشهر)</h3>
          <div className="space-y-2 max-h-[280px] overflow-y-auto">
            {topOrgs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">لا توجد بيانات استخدام</p>
            ) : (
              topOrgs.map((org, i) => (
                <div key={i} className="flex items-center gap-3 bg-secondary/30 rounded-lg px-3 py-2">
                  <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{org.org_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        {org.total_messages.toLocaleString()} رسالة
                      </span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className="text-[10px] text-muted-foreground">
                        {org.conversations} محادثة
                      </span>
                    </div>
                  </div>
                  {org.usage_pct > 0 && (
                    <Badge variant="outline" className={`text-[9px] shrink-0 ${
                      org.usage_pct > 90 ? "border-destructive/50 text-destructive" :
                      org.usage_pct > 70 ? "border-amber-500/50 text-amber-600" :
                      "border-border"
                    }`}>
                      {org.usage_pct}%
                    </Badge>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        <div className="bg-card rounded-xl shadow-card border border-border/50 p-4">
          <h3 className="font-semibold text-sm mb-4">حركة الرسائل الشهرية</h3>
          {monthlyMessages.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={monthlyMessages}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="period" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip />
                <Bar dataKey="sent" name="مرسلة" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="received" name="مستلمة" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-10">لا توجد بيانات</p>
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
                  <p className="text-[10px] text-muted-foreground">{new Date(org.created_at).toLocaleDateString("ar-SA")}</p>
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
