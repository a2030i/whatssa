import { useState, useEffect, useMemo } from "react";
import { BarChart3, ShoppingCart, DollarSign, TrendingUp, MapPin, CreditCard, Package, Calendar, Clock, Users, ArrowUp, ArrowDown, Loader2, Download, Star, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area } from "recharts";

const COLORS = [
  "hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--info))",
  "#8b5cf6", "#ec4899", "#f97316", "#06b6d4", "#84cc16", "#ef4444"
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

const StoreAnalyticsPage = () => {
  const { orgId } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30");

  useEffect(() => {
    if (orgId) loadData();
  }, [orgId, period]);

  const loadData = async () => {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - parseInt(period));

    const [ordersRes, itemsRes] = await Promise.all([
      supabase.from("orders").select("*").eq("org_id", orgId!).gte("created_at", since.toISOString()).order("created_at", { ascending: false }),
      supabase.from("order_items").select("*, orders!inner(org_id, created_at, status, payment_status)").eq("orders.org_id", orgId!).gte("orders.created_at", since.toISOString()),
    ]);

    setOrders(ordersRes.data || []);
    setOrderItems(itemsRes.data || []);
    setLoading(false);
  };

  // ─── Computed Analytics ───
  const analytics = useMemo(() => {
    const validOrders = orders.filter(o => o.status !== "cancelled" && o.status !== "refunded");
    const paidOrders = validOrders.filter(o => o.payment_status === "paid" || o.payment_method === "cod" || o.payment_method === "الدفع عند الاستلام");
    const totalRevenue = paidOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const avgOrderValue = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;

    // Previous period comparison
    const periodDays = parseInt(period);
    const prevStart = new Date();
    prevStart.setDate(prevStart.getDate() - periodDays * 2);
    const prevEnd = new Date();
    prevEnd.setDate(prevEnd.getDate() - periodDays);

    // ─── Top Products ───
    const productMap = new Map<string, { name: string; qty: number; revenue: number }>();
    orderItems.forEach(item => {
      const key = item.product_name || "غير محدد";
      const existing = productMap.get(key) || { name: key, qty: 0, revenue: 0 };
      existing.qty += item.quantity || 1;
      existing.revenue += Number(item.total_price || 0);
      productMap.set(key, existing);
    });
    const topProducts = [...productMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);

    // ─── Orders by Day ───
    const dayMap = new Map<string, { date: string; orders: number; revenue: number }>();
    orders.forEach(o => {
      const day = o.created_at?.slice(0, 10) || "";
      const existing = dayMap.get(day) || { date: day, orders: 0, revenue: 0 };
      existing.orders++;
      if (o.status !== "cancelled" && o.status !== "refunded") {
        existing.revenue += Number(o.total || 0);
      }
      dayMap.set(day, existing);
    });
    const dailyTrend = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    // ─── Orders by Hour ───
    const hourMap = new Map<number, number>();
    for (let i = 0; i < 24; i++) hourMap.set(i, 0);
    orders.forEach(o => {
      const h = new Date(o.created_at).getHours();
      hourMap.set(h, (hourMap.get(h) || 0) + 1);
    });
    const hourlyData = [...hourMap.entries()].map(([hour, count]) => ({
      hour: `${hour}:00`,
      count,
    }));

    // ─── Orders by Day of Week ───
    const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    const weekdayMap = new Map<number, number>();
    for (let i = 0; i < 7; i++) weekdayMap.set(i, 0);
    orders.forEach(o => {
      const d = new Date(o.created_at).getDay();
      weekdayMap.set(d, (weekdayMap.get(d) || 0) + 1);
    });
    const weekdayData = [...weekdayMap.entries()].map(([day, count]) => ({
      day: dayNames[day], count,
    }));

    // ─── Payment Methods ───
    const payMethodMap = new Map<string, number>();
    validOrders.forEach(o => {
      const method = o.payment_method || "غير محدد";
      payMethodMap.set(method, (payMethodMap.get(method) || 0) + 1);
    });
    const paymentMethods = [...payMethodMap.entries()]
      .map(([name, value]) => ({ name: paymentLabels[name] || name, value }))
      .sort((a, b) => b.value - a.value);

    // ─── Payment Status Distribution ───
    const payStatusMap = new Map<string, number>();
    orders.forEach(o => {
      const status = o.payment_status || "unpaid";
      payStatusMap.set(status, (payStatusMap.get(status) || 0) + 1);
    });
    const paymentStatuses = [...payStatusMap.entries()]
      .map(([name, value]) => ({ name: paymentLabels[name] || name, value }))
      .sort((a, b) => b.value - a.value);

    // ─── Order Status Distribution ───
    const statusMap = new Map<string, number>();
    orders.forEach(o => {
      statusMap.set(o.status, (statusMap.get(o.status) || 0) + 1);
    });
    const orderStatuses = [...statusMap.entries()]
      .map(([name, value]) => ({ name: statusLabels[name] || name, value }))
      .sort((a, b) => b.value - a.value);

    // ─── Top Cities ───
    const cityMap = new Map<string, { count: number; revenue: number }>();
    validOrders.forEach(o => {
      const city = o.customer_city || "غير محددة";
      const existing = cityMap.get(city) || { count: 0, revenue: 0 };
      existing.count++;
      existing.revenue += Number(o.total || 0);
      cityMap.set(city, existing);
    });
    const topCities = [...cityMap.entries()]
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ─── Top Sources ───
    const sourceMap = new Map<string, number>();
    orders.forEach(o => {
      const src = o.source || "غير محدد";
      sourceMap.set(src, (sourceMap.get(src) || 0) + 1);
    });
    const sources = [...sourceMap.entries()]
      .map(([name, value]) => ({
        name: name === "salla" ? "سلة" : name === "zid" ? "زد" : name === "shopify" ? "Shopify" : name === "woocommerce" ? "WooCommerce" : name,
        value,
      }))
      .sort((a, b) => b.value - a.value);

    // ─── Repeat Customers ───
    const customerMap = new Map<string, number>();
    orders.forEach(o => {
      const phone = o.customer_phone;
      if (phone) customerMap.set(phone, (customerMap.get(phone) || 0) + 1);
    });
    const repeatCustomers = [...customerMap.values()].filter(v => v > 1).length;
    const uniqueCustomers = customerMap.size;

    // ─── Peak hour & day ───
    const peakHour = hourlyData.reduce((max, h) => h.count > max.count ? h : max, { hour: "0:00", count: 0 });
    const peakDay = weekdayData.reduce((max, d) => d.count > max.count ? d : max, { day: "-", count: 0 });

    return {
      totalOrders: orders.length,
      validOrders: validOrders.length,
      totalRevenue,
      avgOrderValue,
      paidCount: paidOrders.length,
      unpaidCount: orders.filter(o => o.payment_status === "unpaid" || (!o.payment_status && o.status !== "cancelled")).length,
      cancelledCount: orders.filter(o => o.status === "cancelled").length,
      deliveredCount: orders.filter(o => o.status === "delivered").length,
      topProducts,
      dailyTrend,
      hourlyData,
      weekdayData,
      paymentMethods,
      paymentStatuses,
      orderStatuses,
      topCities,
      sources,
      repeatCustomers,
      uniqueCustomers,
      peakHour,
      peakDay,
    };
  }, [orders, orderItems]);

  const exportReport = () => {
    const lines = [
      `تقرير تحليلات المتجر - آخر ${period} يوم`,
      `إجمالي الطلبات: ${analytics.totalOrders}`,
      `الإيرادات (مدفوعة فقط): ${analytics.totalRevenue.toFixed(2)} ر.س`,
      `متوسط قيمة الطلب: ${analytics.avgOrderValue.toFixed(2)} ر.س`,
      ``,
      `أعلى المنتجات طلباً:`,
      ...analytics.topProducts.map((p, i) => `${i + 1}. ${p.name} - ${p.qty} طلب - ${p.revenue.toFixed(2)} ر.س`),
      ``,
      `أعلى المدن:`,
      ...analytics.topCities.map((c, i) => `${i + 1}. ${c.name} - ${c.count} طلب - ${c.revenue.toFixed(2)} ر.س`),
      ``,
      `طرق الدفع:`,
      ...analytics.paymentMethods.map(p => `${p.name}: ${p.value} طلب`),
      ``,
      `أوقات الذروة: الساعة ${analytics.peakHour.hour} | اليوم ${analytics.peakDay.day}`,
    ];
    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `store-analytics-${new Date().toISOString().slice(0, 10)}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-[1200px] mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/15">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-black text-foreground tracking-tight">تقارير المتجر</h1>
            <p className="text-sm text-muted-foreground">تحليلات شاملة ودقيقة لأداء المتجر</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-36 bg-card border-0 shadow-card text-xs"><SelectValue /></SelectTrigger>
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

      {/* KPI Cards Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "إجمالي الطلبات", value: analytics.totalOrders, icon: ShoppingCart, color: "text-primary" },
          { label: "الإيرادات (مدفوعة)", value: `${analytics.totalRevenue.toFixed(0)} ر.س`, icon: DollarSign, color: "text-success" },
          { label: "متوسط قيمة الطلب", value: `${analytics.avgOrderValue.toFixed(0)} ر.س`, icon: TrendingUp, color: "text-info" },
          { label: "عملاء فريدون", value: analytics.uniqueCustomers, icon: Users, color: "text-warning" },
        ].map(kpi => (
          <div key={kpi.label} className="bg-card/70 backdrop-blur-sm rounded-2xl border border-border/40 p-4 hover:border-border/80 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">{kpi.label}</span>
              <kpi.icon className={cn("w-4 h-4", kpi.color)} />
            </div>
            <p className="text-xl font-black">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* KPI Cards Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "مدفوع", value: analytics.paidCount, color: "text-success" },
          { label: "غير مدفوع", value: analytics.unpaidCount, color: "text-warning" },
          { label: "تم التوصيل", value: analytics.deliveredCount, color: "text-info" },
          { label: "ملغي", value: analytics.cancelledCount, color: "text-destructive" },
          { label: "عملاء متكررون", value: analytics.repeatCustomers, color: "text-primary" },
        ].map(kpi => (
          <div key={kpi.label} className="bg-card/50 rounded-xl border border-border/30 p-3 text-center">
            <p className={cn("text-lg font-bold", kpi.color)}>{kpi.value}</p>
            <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Peak Info */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card/70 rounded-xl border border-border/40 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
            <Clock className="w-5 h-5 text-warning" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">ساعة الذروة</p>
            <p className="text-lg font-bold">{analytics.peakHour.hour}</p>
            <p className="text-[10px] text-muted-foreground">{analytics.peakHour.count} طلب</p>
          </div>
        </div>
        <div className="bg-card/70 rounded-xl border border-border/40 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-info" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">يوم الذروة</p>
            <p className="text-lg font-bold">{analytics.peakDay.day}</p>
            <p className="text-[10px] text-muted-foreground">{analytics.peakDay.count} طلب</p>
          </div>
        </div>
      </div>

      {/* Daily Trend Chart */}
      <div className="bg-card rounded-2xl border border-border/40 p-5">
        <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          حركة الطلبات اليومية
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={analytics.dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: "12px", direction: "rtl" }}
                formatter={(v: number, name: string) => [v, name === "orders" ? "الطلبات" : "الإيرادات"]}
                labelFormatter={(v) => `التاريخ: ${v}`}
              />
              <Area type="monotone" dataKey="orders" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} name="الطلبات" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Products */}
      <div className="bg-card rounded-2xl border border-border/40 p-5">
        <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
          <Star className="w-4 h-4 text-warning" />
          أعلى المنتجات طلباً
        </h3>
        {analytics.topProducts.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-6">لا توجد بيانات منتجات</p>
        ) : (
          <div className="space-y-2">
            {analytics.topProducts.map((p, i) => {
              const maxQty = analytics.topProducts[0]?.qty || 1;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium truncate">{p.name}</span>
                      <div className="flex items-center gap-3 text-xs shrink-0">
                        <span className="text-muted-foreground">{p.qty} طلب</span>
                        <span className="font-bold">{p.revenue.toFixed(0)} ر.س</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-primary/60 rounded-full transition-all" style={{ width: `${(p.qty / maxQty) * 100}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Two Column Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Hourly Distribution */}
        <div className="bg-card rounded-2xl border border-border/40 p-5">
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-info" />
            توزيع الطلبات بالساعة
          </h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: "12px", direction: "rtl" }}
                  formatter={(v: number) => [v, "الطلبات"]}
                />
                <Bar dataKey="count" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Day of Week */}
        <div className="bg-card rounded-2xl border border-border/40 p-5">
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-success" />
            توزيع الطلبات بالأيام
          </h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.weekdayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: "12px", direction: "rtl" }}
                  formatter={(v: number) => [v, "الطلبات"]}
                />
                <Bar dataKey="count" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Payment & Status Charts */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Payment Methods Pie */}
        <div className="bg-card rounded-2xl border border-border/40 p-5">
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" />
            طرق الدفع
          </h3>
          {analytics.paymentMethods.length === 0 ? (
            <p className="text-center text-muted-foreground text-xs py-8">لا توجد بيانات</p>
          ) : (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={analytics.paymentMethods} cx="50%" cy="50%" innerRadius={35} outerRadius={65} dataKey="value" paddingAngle={3}>
                      {analytics.paymentMethods.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, name: string) => [v, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1 mt-2">
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

        {/* Payment Status Pie */}
        <div className="bg-card rounded-2xl border border-border/40 p-5">
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-success" />
            حالات الدفع
          </h3>
          {analytics.paymentStatuses.length === 0 ? (
            <p className="text-center text-muted-foreground text-xs py-8">لا توجد بيانات</p>
          ) : (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={analytics.paymentStatuses} cx="50%" cy="50%" innerRadius={35} outerRadius={65} dataKey="value" paddingAngle={3}>
                      {analytics.paymentStatuses.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, name: string) => [v, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1 mt-2">
                {analytics.paymentStatuses.map((p, i) => (
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

        {/* Order Status Pie */}
        <div className="bg-card rounded-2xl border border-border/40 p-5">
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
            <Layers className="w-4 h-4 text-warning" />
            حالات الطلبات
          </h3>
          {analytics.orderStatuses.length === 0 ? (
            <p className="text-center text-muted-foreground text-xs py-8">لا توجد بيانات</p>
          ) : (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={analytics.orderStatuses} cx="50%" cy="50%" innerRadius={35} outerRadius={65} dataKey="value" paddingAngle={3}>
                      {analytics.orderStatuses.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, name: string) => [v, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1 mt-2">
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
      </div>

      {/* Top Cities */}
      <div className="bg-card rounded-2xl border border-border/40 p-5">
        <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-destructive" />
          أعلى المدن طلباً
        </h3>
        {analytics.topCities.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-6">لا توجد بيانات مدن</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-x-6 gap-y-2">
            {analytics.topCities.map((c, i) => {
              const maxCount = analytics.topCities[0]?.count || 1;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">{c.name}</span>
                      <div className="flex items-center gap-3 text-xs shrink-0">
                        <span className="text-muted-foreground">{c.count} طلب</span>
                        <span className="font-bold">{c.revenue.toFixed(0)} ر.س</span>
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

      {/* Sources */}
      {analytics.sources.length > 1 && (
        <div className="bg-card rounded-2xl border border-border/40 p-5">
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
            <Package className="w-4 h-4 text-info" />
            مصادر الطلبات (المنصات)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {analytics.sources.map((s, i) => (
              <div key={i} className="bg-secondary/30 rounded-xl p-3 text-center">
                <p className="text-lg font-bold">{s.value}</p>
                <p className="text-[10px] text-muted-foreground">{s.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StoreAnalyticsPage;
