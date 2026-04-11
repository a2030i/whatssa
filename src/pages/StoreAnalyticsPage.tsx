import { useState, useEffect, useMemo } from "react";
import { BarChart3, ShoppingCart, DollarSign, TrendingUp, TrendingDown, MapPin, CreditCard, Package, Calendar, Clock, Users, Loader2, Download, Star, Layers, Percent, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, Legend } from "recharts";

const COLORS = [
  "hsl(var(--primary))", "hsl(var(--warning))", "hsl(var(--info))", "#8b5cf6",
  "#ec4899", "#f97316", "#06b6d4", "#84cc16", "#ef4444", "#14b8a6"
];

const statusLabels: Record<string, string> = {
  pending: "قيد الانتظار", confirmed: "مؤكد", processing: "قيد التجهيز",
  shipped: "تم الشحن", delivered: "تم التوصيل", cancelled: "ملغي", refunded: "مسترجع",
};

const paymentLabels: Record<string, string> = {
  paid: "مدفوع", unpaid: "غير مدفوع", refunded: "مسترجع", partially_refunded: "مسترجع جزئياً",
  cod: "عند الاستلام", credit_card: "بطاقة ائتمان", bank_transfer: "تحويل بنكي",
  apple_pay: "Apple Pay", stc_pay: "STC Pay", mada: "مدى", tabby: "تابي", tamara: "تمارا",
};

const sourceLabels: Record<string, string> = {
  salla: "سلة", zid: "زد", shopify: "Shopify", woocommerce: "WooCommerce", manual: "يدوي",
};

// ─── Hero KPI Card ───
const HeroKpiCard = ({ label, value, subtitle, change, icon: Icon, variant = "default" }: {
  label: string; value: string; subtitle?: string; change?: number; icon: React.ElementType; variant?: "default" | "primary" | "dark";
}) => {
  const bgClass = variant === "dark"
    ? "bg-gradient-to-br from-[hsl(220,25%,12%)] to-[hsl(220,20%,18%)] text-white border-[hsl(220,20%,22%)]"
    : variant === "primary"
      ? "bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(160,60%,30%)] text-white border-transparent"
      : "bg-card border-border/40";

  return (
    <div className={cn("relative rounded-2xl border p-5 overflow-hidden transition-all hover:shadow-lg group", bgClass)}>
      <div className="flex items-center justify-between mb-3">
        <span className={cn("text-xs font-semibold uppercase tracking-wide", variant !== "default" ? "text-white/70" : "text-muted-foreground")}>{label}</span>
        {change !== undefined && change !== 0 && (
          <span className={cn(
            "text-[11px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-0.5",
            change > 0
              ? variant !== "default" ? "bg-white/15 text-emerald-300" : "bg-success/10 text-success"
              : variant !== "default" ? "bg-white/15 text-red-300" : "bg-destructive/10 text-destructive"
          )}>
            {change > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {change > 0 ? "+" : ""}{change.toFixed(1)}%
          </span>
        )}
      </div>
      <p className={cn("text-2xl md:text-3xl font-black tracking-tight", variant !== "default" ? "text-white" : "text-foreground")}>{value}</p>
      {subtitle && (
        <p className={cn("text-xs mt-1.5", variant !== "default" ? "text-white/50" : "text-muted-foreground")}>{subtitle}</p>
      )}
      <Icon className={cn("absolute -left-2 -bottom-2 w-16 h-16 opacity-[0.06] group-hover:opacity-[0.1] transition-opacity", variant !== "default" ? "text-white" : "text-foreground")} />
    </div>
  );
};

// ─── Section Header ───
const SectionHeader = ({ icon: Icon, title, extra }: { icon: React.ElementType; title: string; extra?: React.ReactNode }) => (
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-sm font-bold flex items-center gap-2">
      <Icon className="w-4 h-4 text-primary" />
      {title}
    </h3>
    {extra}
  </div>
);

const StoreAnalyticsPage = () => {
  const { orgId } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [prevOrders, setPrevOrders] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30");

  useEffect(() => {
    if (orgId) loadData();
  }, [orgId, period]);

  const loadData = async () => {
    setLoading(true);
    const periodDays = parseInt(period);
    const since = new Date();
    since.setDate(since.getDate() - periodDays);
    const prevStart = new Date();
    prevStart.setDate(prevStart.getDate() - periodDays * 2);

    const [ordersRes, prevOrdersRes, itemsRes] = await Promise.all([
      supabase.from("orders").select("*").eq("org_id", orgId!).gte("created_at", since.toISOString()).order("created_at", { ascending: false }),
      supabase.from("orders").select("*").eq("org_id", orgId!).gte("created_at", prevStart.toISOString()).lt("created_at", since.toISOString()),
      supabase.from("order_items").select("*, orders!inner(org_id, created_at, status, payment_status)").eq("orders.org_id", orgId!).gte("orders.created_at", since.toISOString()),
    ]);

    setOrders(ordersRes.data || []);
    setPrevOrders(prevOrdersRes.data || []);
    setOrderItems(itemsRes.data || []);
    setLoading(false);
  };

  const analytics = useMemo(() => {
    const validOrders = orders.filter(o => o.status !== "cancelled" && o.status !== "refunded");
    const paidOrders = validOrders.filter(o => o.payment_status === "paid" || o.payment_method === "cod" || o.payment_method === "الدفع عند الاستلام");
    const totalRevenue = paidOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const totalCost = paidOrders.reduce((s, o) => s + Number(o.discount_amount || 0) + Number(o.shipping_amount || 0) + Number(o.tax_amount || 0), 0);
    const netProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const avgOrderValue = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;

    // Previous period
    const prevValid = prevOrders.filter(o => o.status !== "cancelled" && o.status !== "refunded");
    const prevPaid = prevValid.filter(o => o.payment_status === "paid" || o.payment_method === "cod" || o.payment_method === "الدفع عند الاستلام");
    const prevRevenue = prevPaid.reduce((s, o) => s + Number(o.total || 0), 0);
    const prevCost = prevPaid.reduce((s, o) => s + Number(o.discount_amount || 0) + Number(o.shipping_amount || 0) + Number(o.tax_amount || 0), 0);
    const prevNet = prevRevenue - prevCost;
    const prevAov = prevPaid.length > 0 ? prevRevenue / prevPaid.length : 0;

    const pctChange = (curr: number, prev: number) => prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100;

    // ─── Top Products ───
    const productMap = new Map<string, { name: string; qty: number; revenue: number }>();
    orderItems.forEach(item => {
      const key = item.product_name || "غير محدد";
      const existing = productMap.get(key) || { name: key, qty: 0, revenue: 0 };
      existing.qty += item.quantity || 1;
      existing.revenue += Number(item.total_price || 0);
      productMap.set(key, existing);
    });
    const topProducts = [...productMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 8);

    // ─── Daily Trend (current + previous) ───
    const periodDays = parseInt(period);
    const dayMap = new Map<string, { date: string; label: string; revenue: number; profit: number }>();
    orders.forEach(o => {
      const day = o.created_at?.slice(0, 10) || "";
      const existing = dayMap.get(day) || { date: day, label: day.slice(5), revenue: 0, profit: 0 };
      if (o.status !== "cancelled" && o.status !== "refunded") {
        const rev = Number(o.total || 0);
        const cost = Number(o.discount_amount || 0) + Number(o.shipping_amount || 0) + Number(o.tax_amount || 0);
        existing.revenue += rev;
        existing.profit += rev - cost;
      }
      dayMap.set(day, existing);
    });
    const dailyTrend = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    // ─── Hourly ───
    const hourMap = new Map<number, number>();
    for (let i = 0; i < 24; i++) hourMap.set(i, 0);
    orders.forEach(o => { const h = new Date(o.created_at).getHours(); hourMap.set(h, (hourMap.get(h) || 0) + 1); });
    const hourlyData = [...hourMap.entries()].map(([hour, count]) => ({ hour: `${hour}:00`, count }));

    // ─── Day of Week ───
    const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    const weekdayMap = new Map<number, number>();
    for (let i = 0; i < 7; i++) weekdayMap.set(i, 0);
    orders.forEach(o => { const d = new Date(o.created_at).getDay(); weekdayMap.set(d, (weekdayMap.get(d) || 0) + 1); });
    const weekdayData = [...weekdayMap.entries()].map(([day, count]) => ({ day: dayNames[day], count }));

    // ─── Payment Methods ───
    const payMethodMap = new Map<string, number>();
    validOrders.forEach(o => { const m = o.payment_method || "غير محدد"; payMethodMap.set(m, (payMethodMap.get(m) || 0) + 1); });
    const paymentMethods = [...payMethodMap.entries()].map(([name, value]) => ({ name: paymentLabels[name] || name, value })).sort((a, b) => b.value - a.value);

    // ─── Order Statuses ───
    const statusMap = new Map<string, number>();
    orders.forEach(o => statusMap.set(o.status, (statusMap.get(o.status) || 0) + 1));
    const orderStatuses = [...statusMap.entries()].map(([name, value]) => ({ name: statusLabels[name] || name, value })).sort((a, b) => b.value - a.value);

    // ─── Sources (Platforms) ───
    const sourceMap = new Map<string, { count: number; revenue: number }>();
    orders.forEach(o => {
      const src = o.source || "manual";
      const existing = sourceMap.get(src) || { count: 0, revenue: 0 };
      existing.count++;
      if (o.status !== "cancelled" && o.status !== "refunded") existing.revenue += Number(o.total || 0);
      sourceMap.set(src, existing);
    });
    const sources = [...sourceMap.entries()].map(([name, data]) => ({
      name: sourceLabels[name] || name, value: data.count, revenue: data.revenue,
    })).sort((a, b) => b.value - a.value);

    // ─── Top Cities ───
    const cityMap = new Map<string, { count: number; revenue: number }>();
    validOrders.forEach(o => {
      const city = o.customer_city || "غير محددة";
      const existing = cityMap.get(city) || { count: 0, revenue: 0 };
      existing.count++;
      existing.revenue += Number(o.total || 0);
      cityMap.set(city, existing);
    });
    const topCities = [...cityMap.entries()].map(([name, data]) => ({ name, ...data })).sort((a, b) => b.count - a.count).slice(0, 10);

    // ─── Customers ───
    const customerMap = new Map<string, number>();
    orders.forEach(o => { if (o.customer_phone) customerMap.set(o.customer_phone, (customerMap.get(o.customer_phone) || 0) + 1); });
    const repeatCustomers = [...customerMap.values()].filter(v => v > 1).length;
    const uniqueCustomers = customerMap.size;

    // ─── Peak ───
    const peakHour = hourlyData.reduce((max, h) => h.count > max.count ? h : max, { hour: "0:00", count: 0 });
    const peakDay = weekdayData.reduce((max, d) => d.count > max.count ? d : max, { day: "-", count: 0 });

    return {
      totalOrders: orders.length, validOrders: validOrders.length,
      totalRevenue, netProfit, profitMargin, avgOrderValue,
      paidCount: paidOrders.length,
      unpaidCount: orders.filter(o => o.payment_status === "unpaid" || (!o.payment_status && o.status !== "cancelled")).length,
      cancelledCount: orders.filter(o => o.status === "cancelled").length,
      deliveredCount: orders.filter(o => o.status === "delivered").length,
      revenueChange: pctChange(totalRevenue, prevRevenue),
      profitChange: pctChange(netProfit, prevNet),
      ordersChange: pctChange(orders.length, prevOrders.length),
      aovChange: pctChange(avgOrderValue, prevAov),
      topProducts, dailyTrend, hourlyData, weekdayData,
      paymentMethods, orderStatuses, sources, topCities,
      repeatCustomers, uniqueCustomers, peakHour, peakDay,
    };
  }, [orders, prevOrders, orderItems, period]);

  const exportReport = () => {
    const lines = [
      `تقرير تحليلات المتجر - آخر ${period} يوم`,
      `إجمالي المبيعات: ${analytics.totalRevenue.toFixed(2)} ر.س`,
      `صافي الربح: ${analytics.netProfit.toFixed(2)} ر.س (هامش: ${analytics.profitMargin.toFixed(1)}%)`,
      `إجمالي الطلبات: ${analytics.totalOrders}`,
      `متوسط قيمة الطلب: ${analytics.avgOrderValue.toFixed(2)} ر.س`,
      ``, `أعلى المنتجات طلباً:`,
      ...analytics.topProducts.map((p, i) => `${i + 1}. ${p.name} - ${p.qty} طلب - ${p.revenue.toFixed(2)} ر.س`),
      ``, `أعلى المدن:`,
      ...analytics.topCities.map((c, i) => `${i + 1}. ${c.name} - ${c.count} طلب - ${c.revenue.toFixed(2)} ر.س`),
      ``, `المنصات:`,
      ...analytics.sources.map(s => `${s.name}: ${s.value} طلب - ${s.revenue.toFixed(2)} ر.س`),
    ];
    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `store-analytics-${new Date().toISOString().slice(0, 10)}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const formatSAR = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
    return n.toFixed(0);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">جاري تحميل التقارير...</span>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-[1280px] mx-auto" dir="rtl">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center shadow-glow shrink-0">
            <BarChart3 className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-black text-foreground tracking-tight">نظرة عامة على الأداء</h1>
            <p className="text-sm text-muted-foreground">بيانات حية • آخر {period} يوم</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-36 bg-card border-border/40 shadow-sm text-xs font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">آخر 7 أيام</SelectItem>
              <SelectItem value="30">آخر 30 يوم</SelectItem>
              <SelectItem value="90">آخر 3 أشهر</SelectItem>
              <SelectItem value="365">آخر سنة</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={exportReport}>
            <Download className="w-3.5 h-3.5" /> تصدير
          </Button>
        </div>
      </div>

      {/* ─── Hero KPI Cards ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <HeroKpiCard
          label="إجمالي المبيعات"
          value={`SAR ${formatSAR(analytics.totalRevenue)}`}
          subtitle={`مقابل SAR ${formatSAR(analytics.totalRevenue - (analytics.totalRevenue * analytics.revenueChange / (100 + analytics.revenueChange)))} سابقاً`}
          change={analytics.revenueChange}
          icon={DollarSign}
          variant="dark"
        />
        <HeroKpiCard
          label="صافي الربح"
          value={`SAR ${formatSAR(analytics.netProfit)}`}
          subtitle={`هامش الربح: ${analytics.profitMargin.toFixed(1)}%`}
          change={analytics.profitChange}
          icon={TrendingUp}
          variant="primary"
        />
        <HeroKpiCard
          label="إجمالي الطلبات"
          value={analytics.totalOrders.toLocaleString()}
          subtitle={`مقابل ${(analytics.totalOrders - Math.round(analytics.totalOrders * analytics.ordersChange / (100 + analytics.ordersChange))).toLocaleString()} سابقاً`}
          change={analytics.ordersChange}
          icon={ShoppingCart}
        />
        <HeroKpiCard
          label="متوسط قيمة الطلب"
          value={`SAR ${analytics.avgOrderValue.toFixed(0)}`}
          change={analytics.aovChange}
          icon={Percent}
        />
      </div>

      {/* ─── Sales & Profit Over Time + Sources ─── */}
      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        {/* Main Chart */}
        <div className="bg-card rounded-2xl border border-border/40 p-5">
          <SectionHeader icon={TrendingUp} title={`المبيعات والأرباح خلال ${period} يوم`} />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.dailyTrend}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--info))" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(var(--info))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatSAR(v)} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: "12px", direction: "rtl" }}
                  formatter={(v: number, name: string) => [`SAR ${v.toFixed(0)}`, name === "revenue" ? "المبيعات" : "الأرباح"]}
                  labelFormatter={(v) => `التاريخ: ${v}`}
                />
                <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="url(#revGrad)" strokeWidth={2.5} name="revenue" />
                <Area type="monotone" dataKey="profit" stroke="hsl(var(--info))" fill="url(#profitGrad)" strokeWidth={2} strokeDasharray="5 3" name="profit" />
                <Legend
                  verticalAlign="top"
                  align="left"
                  iconType="line"
                  formatter={(value) => <span className="text-xs text-muted-foreground">{value === "revenue" ? "المبيعات" : "صافي الربح"}</span>}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sales by Platform (Donut) */}
        <div className="bg-card rounded-2xl border border-border/40 p-5 flex flex-col">
          <SectionHeader icon={Package} title="المبيعات حسب المنصة" />
          {analytics.sources.length === 0 ? (
            <p className="text-center text-muted-foreground text-xs py-8 flex-1 flex items-center justify-center">لا توجد بيانات</p>
          ) : (
            <>
              <div className="h-48 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={analytics.sources} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="revenue" paddingAngle={3} strokeWidth={0}>
                      {analytics.sources.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, name: string) => [`SAR ${Number(v).toFixed(0)}`, name]} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center label */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">الإجمالي</p>
                    <p className="text-sm font-black text-foreground">SAR {formatSAR(analytics.totalRevenue)}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2 mt-3">
                {analytics.sources.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="font-medium">{s.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{s.value} طلب</span>
                      <span className="font-bold">SAR {formatSAR(s.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Secondary KPIs ─── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: "مدفوع", value: analytics.paidCount, color: "text-success", bg: "bg-success/10" },
          { label: "غير مدفوع", value: analytics.unpaidCount, color: "text-warning", bg: "bg-warning/10" },
          { label: "تم التوصيل", value: analytics.deliveredCount, color: "text-info", bg: "bg-info/10" },
          { label: "ملغي", value: analytics.cancelledCount, color: "text-destructive", bg: "bg-destructive/10" },
          { label: "عملاء فريدون", value: analytics.uniqueCustomers, color: "text-primary", bg: "bg-primary/10" },
          { label: "عملاء متكررون", value: analytics.repeatCustomers, color: "text-[hsl(280,67%,55%)]", bg: "bg-[hsl(280,67%,55%)]/10" },
        ].map(kpi => (
          <div key={kpi.label} className={cn("rounded-xl border border-border/30 p-3 text-center", kpi.bg)}>
            <p className={cn("text-xl font-black", kpi.color)}>{kpi.value}</p>
            <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* ─── Charts Grid ─── */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Hourly */}
        <div className="bg-card rounded-2xl border border-border/40 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Clock className="w-4 h-4 text-info" />
              توزيع الطلبات بالساعة
            </h3>
            <span className="text-[10px] text-muted-foreground bg-info/10 px-2 py-0.5 rounded-md font-semibold">
              الذروة: {analytics.peakHour.hour}
            </span>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: "12px", direction: "rtl" }} formatter={(v: number) => [v, "الطلبات"]} />
                <Bar dataKey="count" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Day of Week */}
        <div className="bg-card rounded-2xl border border-border/40 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-success" />
              توزيع الطلبات بالأيام
            </h3>
            <span className="text-[10px] text-muted-foreground bg-success/10 px-2 py-0.5 rounded-md font-semibold">
              الذروة: {analytics.peakDay.day}
            </span>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.weekdayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: "12px", direction: "rtl" }} formatter={(v: number) => [v, "الطلبات"]} />
                <Bar dataKey="count" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ─── Payment & Status Charts ─── */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Payment Methods */}
        <div className="bg-card rounded-2xl border border-border/40 p-5">
          <SectionHeader icon={CreditCard} title="طرق الدفع" />
          {analytics.paymentMethods.length === 0 ? (
            <p className="text-center text-muted-foreground text-xs py-8">لا توجد بيانات</p>
          ) : (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={analytics.paymentMethods} cx="50%" cy="50%" innerRadius={35} outerRadius={65} dataKey="value" paddingAngle={3} strokeWidth={0}>
                      {analytics.paymentMethods.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, name: string) => [v, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 mt-2">
                {analytics.paymentMethods.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-muted-foreground">{p.name}</span>
                    </div>
                    <span className="font-medium">{p.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Order Status */}
        <div className="bg-card rounded-2xl border border-border/40 p-5">
          <SectionHeader icon={Layers} title="حالات الطلبات" />
          {analytics.orderStatuses.length === 0 ? (
            <p className="text-center text-muted-foreground text-xs py-8">لا توجد بيانات</p>
          ) : (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={analytics.orderStatuses} cx="50%" cy="50%" innerRadius={35} outerRadius={65} dataKey="value" paddingAngle={3} strokeWidth={0}>
                      {analytics.orderStatuses.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, name: string) => [v, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 mt-2">
                {analytics.orderStatuses.map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-muted-foreground">{p.name}</span>
                    </div>
                    <span className="font-medium">{p.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Top Products */}
        <div className="bg-card rounded-2xl border border-border/40 p-5">
          <SectionHeader icon={Star} title="أعلى المنتجات" />
          {analytics.topProducts.length === 0 ? (
            <p className="text-center text-muted-foreground text-xs py-8">لا توجد بيانات منتجات</p>
          ) : (
            <div className="space-y-2.5">
              {analytics.topProducts.slice(0, 6).map((p, i) => {
                const maxQty = analytics.topProducts[0]?.qty || 1;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium truncate max-w-[60%]">{p.name}</span>
                      <span className="text-[10px] text-muted-foreground">{p.qty} • SAR {formatSAR(p.revenue)}</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${(p.qty / maxQty) * 100}%`, background: COLORS[i % COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── Top Cities ─── */}
      <div className="bg-card rounded-2xl border border-border/40 p-5">
        <SectionHeader icon={MapPin} title="أعلى المدن طلباً" />
        {analytics.topCities.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-6">لا توجد بيانات مدن</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-x-6 gap-y-2.5">
            {analytics.topCities.map((c, i) => {
              const maxCount = analytics.topCities[0]?.count || 1;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">{c.name}</span>
                      <div className="flex items-center gap-3 text-xs shrink-0">
                        <span className="text-muted-foreground">{c.count} طلب</span>
                        <span className="font-bold">SAR {formatSAR(c.revenue)}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-destructive/50 rounded-full transition-all" style={{ width: `${(c.count / maxCount) * 100}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default StoreAnalyticsPage;

