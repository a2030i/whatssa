import { useState, useEffect } from "react";
import { ShoppingCart, Package, Truck, CheckCircle2, XCircle, Clock, Search, Filter, Eye, Download, TrendingUp, DollarSign, BarChart3, ArrowUpCircle, ArrowDownCircle, Loader2, Store, ArrowLeft, Send, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";


const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  pending: { label: "قيد الانتظار", icon: Clock, color: "bg-warning/10 text-warning" },
  confirmed: { label: "مؤكد", icon: CheckCircle2, color: "bg-info/10 text-info" },
  processing: { label: "قيد التجهيز", icon: Package, color: "bg-primary/10 text-primary" },
  shipped: { label: "تم الشحن", icon: Truck, color: "bg-info/10 text-info" },
  delivered: { label: "تم التوصيل", icon: CheckCircle2, color: "bg-success/10 text-success" },
  cancelled: { label: "ملغي", icon: XCircle, color: "bg-destructive/10 text-destructive" },
  refunded: { label: "مسترجع", icon: ArrowDownCircle, color: "bg-muted text-muted-foreground" },
};

const paymentConfig: Record<string, { label: string; color: string }> = {
  paid: { label: "مدفوع", color: "bg-success/10 text-success" },
  unpaid: { label: "غير مدفوع", color: "bg-warning/10 text-warning" },
  refunded: { label: "مسترجع", color: "bg-muted text-muted-foreground" },
  partially_refunded: { label: "مسترجع جزئياً", color: "bg-warning/10 text-warning" },
};

// Detect actual payment status based on payment_method and payment_status
const PAID_METHODS = ["apple pay", "applepay", "mada", "visa", "mastercard", "credit card", "credit_card", "card", "stc pay", "stcpay", "tamara", "tabby", "bank transfer", "bank_transfer", "تحويل بنكي", "بطاقة ائتمان", "مدى", "آبل باي"];

function resolvePaymentStatus(order: any): string {
  if (order.payment_status === "paid" || order.payment_status === "refunded" || order.payment_status === "partially_refunded") {
    return order.payment_status;
  }
  // If payment_method is a known online/card method, it's paid
  if (order.payment_method) {
    const method = order.payment_method.toLowerCase().trim();
    if (PAID_METHODS.some(m => method.includes(m))) return "paid";
  }
  return order.payment_status || "unpaid";
}

const OrdersPage = () => {
  const { orgId } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [shipmentEvents, setShipmentEvents] = useState<any[]>([]);
  const [stats, setStats] = useState({ total: 0, revenue: 0, avgOrder: 0, pendingCount: 0, todayOrders: 0, todayRevenue: 0 });
  const [sendingToLamha, setSendingToLamha] = useState<string | null>(null);
  const [lamhaIntegration, setLamhaIntegration] = useState<any>(null);
  const [lamhaCarriers, setLamhaCarriers] = useState<any[]>([]);
  const [selectedCarrierId, setSelectedCarrierId] = useState<string>("");
  const [loadingCarriers, setLoadingCarriers] = useState(false);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");

  useEffect(() => { if (orgId) { loadOrders(); loadLamhaIntegration(); loadWarehouses(); } }, [orgId]);

  const loadWarehouses = async () => {
    const { data } = await supabase
      .from("warehouses")
      .select("*")
      .eq("org_id", orgId!)
      .eq("is_active", true)
      .order("is_default", { ascending: false });
    const list = data || [];
    setWarehouses(list);
    const def = list.find((w: any) => w.is_default);
    if (def) setSelectedWarehouseId(def.id);
    else if (list.length > 0) setSelectedWarehouseId(list[0].id);
  };

  const loadLamhaIntegration = async () => {
    const { data } = await supabase
      .from("store_integrations")
      .select("*")
      .eq("org_id", orgId!)
      .eq("platform", "lamha")
      .eq("is_active", true)
      .maybeSingle();
    setLamhaIntegration(data);
    if (data) loadLamhaCarriers();
  };

  const loadLamhaCarriers = async () => {
    setLoadingCarriers(true);
    try {
      const { data, error } = await supabase.functions.invoke("lamha-carriers", {
        body: { org_id: orgId },
      });
      if (!error && data?.carriers) {
        setLamhaCarriers(data.carriers);
      }
    } catch {
      // silent
    } finally {
      setLoadingCarriers(false);
    }
  };


  const loadOrders = async () => {
    const { data } = await supabase.from("orders").select("*").eq("org_id", orgId!).order("created_at", { ascending: false });
    const list = data || [];
    setOrders(list);
    
    const today = new Date().toISOString().slice(0, 10);
    const todayOrders = list.filter(o => o.created_at?.slice(0, 10) === today);
    const paidOrders = list.filter(o => 
      o.status !== "cancelled" && o.status !== "refunded" && 
      (resolvePaymentStatus(o) === "paid" || o.payment_method === "cod" || o.payment_method === "الدفع عند الاستلام")
    );
    const revenue = paidOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const todayPaid = todayOrders.filter(o => 
      o.status !== "cancelled" && 
      (resolvePaymentStatus(o) === "paid" || o.payment_method === "cod" || o.payment_method === "الدفع عند الاستلام")
    );
    const todayRevenue = todayPaid.reduce((s, o) => s + Number(o.total || 0), 0);
    
    setStats({
      total: list.length,
      revenue,
      avgOrder: paidOrders.length > 0 ? revenue / paidOrders.length : 0,
      pendingCount: list.filter(o => o.status === "pending").length,
      todayOrders: todayOrders.length,
      todayRevenue,
    });
    setLoading(false);
  };

  const loadOrderItems = async (orderId: string) => {
    const { data } = await supabase.from("order_items").select("*").eq("order_id", orderId);
    setOrderItems(data || []);
  };

  const openOrder = (order: any) => {
    setSelectedOrder(order);
    loadOrderItems(order.id);
    loadShipmentEvents(order.id);
  };

  const loadShipmentEvents = async (orderId: string) => {
    const { data } = await supabase
      .from("shipment_events")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });
    setShipmentEvents(data || []);
  };

  const SHIPMENT_ICONS: Record<string, any> = {
    created: Package, new: Package, pending: Clock, fulfilled: CheckCircle2,
    ready_for_pickup: Package, picked_up: Truck, shipping: Truck,
    delivered: CheckCircle2, delivery_failed: XCircle, returned: ArrowLeft,
    cancelled: XCircle, creation_failed: XCircle,
  };

  const SHIPMENT_COLORS: Record<string, string> = {
    created: "text-primary", new: "text-primary", pending: "text-warning",
    picked_up: "text-info", shipping: "text-info", delivered: "text-success",
    delivery_failed: "text-destructive", returned: "text-warning",
    cancelled: "text-destructive", creation_failed: "text-destructive",
  };

  const sendToLamha = async (orderId: string) => {
    if (!orgId || !lamhaIntegration) return;
    if (!selectedCarrierId) {
      toast.error("يرجى اختيار شركة الشحن أولاً");
      return;
    }
    setSendingToLamha(orderId);
    try {
      const { data, error } = await supabase.functions.invoke("lamha-create-shipment", {
        body: {
          order_id: orderId,
          org_id: orgId,
          carrier_id: selectedCarrierId,
          warehouse_id: selectedWarehouseId || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.details?.msg || data.error);
      
      const msg = `تم إرسال الطلب إلى لمحة بنجاح${data.tracking_number ? ` - رقم التتبع: ${data.tracking_number}` : ""}`;
      toast.success(msg);
      // Refresh order list + update selected order immediately so button changes
      const { data: freshOrders } = await supabase.from("orders").select("*").eq("org_id", orgId!).order("created_at", { ascending: false });
      const list = freshOrders || [];
      setOrders(list);
      const updatedOrder = list.find((o: any) => o.id === orderId);
      if (updatedOrder) setSelectedOrder(updatedOrder);
      loadShipmentEvents(orderId);
    } catch (err: any) {
      toast.error("فشل إرسال الطلب إلى لمحة: " + (err.message || "خطأ غير معروف"));
    } finally {
      setSendingToLamha(null);
    }
  };



  const printLamhaLabel = async (orderId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("lamha-label", {
        body: { order_id: orderId, org_id: orgId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const pdfBase64 = data?.label_pdf_base64 || data?.pdf_base64;
      if (pdfBase64) {
        const byteChars = atob(pdfBase64);
        const byteNumbers = new Array(byteChars.length).fill(0).map((_, i) => byteChars.charCodeAt(i));
        const blob = new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
      } else if (data?.label_url) {
        window.open(data.label_url, "_blank");
      } else {
        throw new Error("لم يتم استلام ملف البوليصة من لمحة");
      }
    } catch (err: any) {
      toast.error("فشل تحميل البوليصة: " + (err.message || "خطأ غير معروف"));
    }
  };




  const exportOrders = () => {
    const headers = ["رقم الطلب", "العميل", "الهاتف", "المدينة", "المبلغ", "الحالة", "الدفع", "التاريخ"];
    const rows = filteredOrders.map(o => [
      o.order_number || "-", o.customer_name || "-", o.customer_phone || "-", o.customer_city || "-",
      o.total, statusConfig[o.status]?.label || o.status, paymentConfig[o.payment_status]?.label || o.payment_status,
      new Date(o.created_at).toLocaleDateString("ar-SA")
    ]);
    const csv = "\uFEFF" + [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const filteredOrders = orders.filter(o => {
    if (searchQuery && !o.customer_name?.includes(searchQuery) && !o.customer_phone?.includes(searchQuery) && !o.order_number?.includes(searchQuery)) return false;
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (paymentFilter !== "all" && resolvePaymentStatus(o) !== paymentFilter) return false;
    if (sourceFilter !== "all" && o.source !== sourceFilter) return false;
    if (dateFilter !== "all") {
      const d = new Date(o.created_at);
      const now = new Date();
      if (dateFilter === "today" && d.toDateString() !== now.toDateString()) return false;
      if (dateFilter === "week") { const week = new Date(now.getTime() - 7 * 86400000); if (d < week) return false; }
      if (dateFilter === "month") { const month = new Date(now.getTime() - 30 * 86400000); if (d < month) return false; }
    }
    return true;
  });

  const sources = [...new Set(orders.map(o => o.source).filter(Boolean))];

  const kpiCards = [
    { label: "إجمالي الطلبات", value: stats.total, icon: ShoppingCart, color: "text-primary" },
    { label: "الإيرادات", value: `${stats.revenue.toFixed(0)} ر.س`, icon: DollarSign, color: "text-success" },
    { label: "متوسط الطلب", value: `${stats.avgOrder.toFixed(0)} ر.س`, icon: TrendingUp, color: "text-info" },
    { label: "طلبات اليوم", value: stats.todayOrders, icon: BarChart3, color: "text-warning" },
  ];

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-5 max-w-[1100px] mx-auto" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-warning/10 flex items-center justify-center ring-1 ring-warning/15">
            <ShoppingCart className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h1 className="text-xl font-black text-foreground tracking-tight">الطلبات</h1>
            <p className="text-sm text-muted-foreground">إدارة ومتابعة طلبات المتجر</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs rounded-xl border-border/50" onClick={exportOrders}>
            <Download className="w-3.5 h-3.5" /> تصدير
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in">
        {kpiCards.map((kpi) => (
          <div key={kpi.label} className="group bg-card/70 backdrop-blur-sm rounded-2xl border border-border/40 p-4 hover:border-border/80 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">{kpi.label}</span>
              <kpi.icon className={cn("w-4 h-4 transition-transform group-hover:scale-110", kpi.color)} />
            </div>
            <p className="text-xl font-black">{kpi.value}</p>
          </div>
        ))}
      </div>


      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="بحث بالاسم أو الرقم..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pr-9 bg-card border-0 shadow-card text-sm" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-36 bg-card border-0 shadow-card text-xs"><SelectValue placeholder="الحالة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              {Object.entries(statusConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-full sm:w-36 bg-card border-0 shadow-card text-xs"><SelectValue placeholder="الدفع" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل حالات الدفع</SelectItem>
              {Object.entries(paymentConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {sources.length > 1 && (
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-full sm:w-36 bg-card border-0 shadow-card text-xs"><SelectValue placeholder="المنصة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المنصات</SelectItem>
                {sources.map(s => <SelectItem key={s} value={s}>{s === "salla" ? "سلة" : s === "zid" ? "زد" : s === "shopify" ? "Shopify" : s === "woocommerce" ? "WooCommerce" : s}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-full sm:w-32 bg-card border-0 shadow-card text-xs"><SelectValue placeholder="الفترة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفترات</SelectItem>
              <SelectItem value="today">اليوم</SelectItem>
              <SelectItem value="week">آخر 7 أيام</SelectItem>
              <SelectItem value="month">آخر 30 يوم</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* Active filters count */}
        {(statusFilter !== "all" || paymentFilter !== "all" || sourceFilter !== "all" || dateFilter !== "all") && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">{filteredOrders.length} نتيجة</span>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => { setStatusFilter("all"); setPaymentFilter("all"); setSourceFilter("all"); setDateFilter("all"); }}>
              مسح الفلاتر
            </Button>
          </div>
        )}
      </div>

      {/* Orders Table */}
      <div className="bg-card rounded-xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">رقم الطلب</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">العميل</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground hidden md:table-cell">المنصة</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">المبلغ</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">الحالة</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground hidden md:table-cell">الشحن</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">الدفع</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">التاريخ</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => {
                const sc = statusConfig[order.status] || statusConfig.pending;
                const resolvedPS = resolvePaymentStatus(order);
                const pc = paymentConfig[resolvedPS] || paymentConfig.unpaid;
                return (
                  <tr key={order.id} className="border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => openOrder(order)}>
                    <td className="p-3 font-mono text-xs">{order.order_number || order.id.slice(0, 8)}</td>
                    <td className="p-3">
                      <p className="font-medium text-xs">{order.customer_name || "-"}</p>
                      <p className="text-[10px] text-muted-foreground" dir="ltr">{order.customer_phone}</p>
                    </td>
                    <td className="p-3 text-xs hidden md:table-cell">{order.source === "salla" ? "سلة" : order.source === "zid" ? "زد" : order.source === "shopify" ? "Shopify" : order.source === "woocommerce" ? "WooCommerce" : order.source === "lamha" ? "لمحة" : order.source || "-"}</td>
                    <td className="p-3 font-bold text-xs">{Number(order.total).toFixed(2)} ر.س</td>
                    <td className="p-3"><Badge className={cn("text-[10px] border-0", sc.color)}>{sc.label}</Badge></td>
                    <td className="p-3 hidden md:table-cell">
                      {(order as any).shipment_status ? (
                        <Badge className="text-[10px] border-0 bg-blue-500/10 text-blue-600">
                          {{"new":"جديد","pending":"معلق","fulfilled":"تم التنفيذ","ready_for_pickup":"جاهز للالتقاط","reverse_shipment":"شحنة عكسية","cancelled":"ملغي","picked_up":"تم الالتقاط","shipping":"جاري الشحن","delivered":"تم التوصيل","delivery_failed":"فشل التوصيل","returned":"مرتجع"}[(order as any).shipment_status] || (order as any).shipment_status}
                        </Badge>
                      ) : <span className="text-muted-foreground text-[10px]">-</span>}
                    </td>
                    <td className="p-3 hidden sm:table-cell"><Badge className={cn("text-[10px] border-0", pc.color)}>{pc.label}</Badge></td>
                    <td className="p-3 text-xs text-muted-foreground hidden lg:table-cell">{new Date(order.created_at).toLocaleDateString("ar-SA")}</td>
                    <td className="p-3"><Eye className="w-4 h-4 text-muted-foreground" /></td>
                  </tr>
                );
              })}
              {filteredOrders.length === 0 && (
                <tr><td colSpan={9} className="p-12 text-center text-muted-foreground text-sm">
                  <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  لا توجد طلبات
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              طلب #{selectedOrder?.order_number || selectedOrder?.id.slice(0, 8)}
            </DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              {/* Status (read-only from platform) */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className={cn("text-xs border-0 gap-1", (statusConfig[selectedOrder.status] || statusConfig.pending).color)}>
                    {(() => { const Ic = (statusConfig[selectedOrder.status] || statusConfig.pending).icon; return <Ic className="w-3.5 h-3.5" />; })()}
                    {(statusConfig[selectedOrder.status] || statusConfig.pending).label}
                  </Badge>
                  {(() => {
                    const rps = resolvePaymentStatus(selectedOrder);
                    const pcc = paymentConfig[rps] || paymentConfig.unpaid;
                    return (
                      <Badge className={cn("text-[10px] border-0", pcc.color)}>
                        {pcc.label}
                      </Badge>
                    );
                  })()}
                </div>
                {selectedOrder.source && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-secondary/50 rounded-lg px-2 py-1">
                    <Store className="w-3 h-3" />
                    {selectedOrder.source === "salla" ? "سلة" : selectedOrder.source === "zid" ? "زد" : selectedOrder.source === "shopify" ? "Shopify" : selectedOrder.source === "woocommerce" ? "WooCommerce" : selectedOrder.source === "lamha" ? "لمحة" : selectedOrder.source}
                  </div>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">الحالات تتحدث تلقائياً من المنصة</p>

              {/* Payment Method */}
              {selectedOrder.payment_method && (
                <div className="flex items-center gap-2 text-xs bg-secondary/30 rounded-lg px-3 py-2">
                  <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">طريقة الدفع:</span>
                  <span className="font-medium">{selectedOrder.payment_method}</span>
                </div>
              )}

              {/* Customer Info */}
              <div className="bg-secondary/50 rounded-lg p-3 space-y-1.5">
                <p className="text-xs font-semibold">بيانات العميل</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">الاسم:</span> {selectedOrder.customer_name}</div>
                  <div dir="ltr"><span className="text-muted-foreground">الهاتف:</span> {selectedOrder.customer_phone}</div>
                  <div><span className="text-muted-foreground">المدينة:</span> {selectedOrder.customer_city || "-"}</div>
                  <div><span className="text-muted-foreground">المنطقة:</span> {selectedOrder.customer_region || "-"}</div>
                </div>
                {selectedOrder.customer_address && <p className="text-xs text-muted-foreground">{selectedOrder.customer_address}</p>}
              </div>

              {/* Order Items */}
              <div>
                <p className="text-xs font-semibold mb-2">المنتجات</p>
                <div className="space-y-2">
                  {orderItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between bg-secondary/30 rounded-lg p-2.5">
                      <div>
                        <p className="text-xs font-medium">{item.product_name}</p>
                        {item.product_sku && <p className="text-[10px] text-muted-foreground">SKU: {item.product_sku}</p>}
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold">{Number(item.total_price).toFixed(2)} ر.س</p>
                        <p className="text-[10px] text-muted-foreground">{item.quantity} × {Number(item.unit_price).toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                  {orderItems.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">لا توجد منتجات</p>}
                </div>
              </div>

              {/* Totals */}
              <div className="bg-secondary/50 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between text-xs"><span>المجموع الفرعي</span><span>{Number(selectedOrder.subtotal).toFixed(2)} ر.س</span></div>
                {Number(selectedOrder.discount_amount) > 0 && <div className="flex justify-between text-xs text-success"><span>الخصم</span><span>-{Number(selectedOrder.discount_amount).toFixed(2)} ر.س</span></div>}
                <div className="flex justify-between text-xs"><span>الشحن</span><span>{Number(selectedOrder.shipping_amount).toFixed(2)} ر.س</span></div>
                {Number(selectedOrder.tax_amount) > 0 && <div className="flex justify-between text-xs"><span>الضريبة</span><span>{Number(selectedOrder.tax_amount).toFixed(2)} ر.س</span></div>}
                <div className="flex justify-between text-sm font-bold border-t border-border pt-1.5"><span>الإجمالي</span><span>{Number(selectedOrder.total).toFixed(2)} ر.س</span></div>
              </div>

              {/* Lamha Actions */}
              {lamhaIntegration && (
                <div className="space-y-2 bg-secondary/30 rounded-lg p-3">
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-primary" />
                    شحن عبر لمحة
                  </p>

                  {/* Carrier selector */}
                  {selectedOrder.shipment_carrier !== "lamha" && (
                    <>
                      {/* Warehouse selector */}
                      {warehouses.length > 0 && (
                        <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
                          <SelectTrigger className="text-xs bg-card border-border/50">
                            <SelectValue placeholder="اختر المستودع (المرسل)" />
                          </SelectTrigger>
                          <SelectContent>
                            {warehouses.map((w: any) => (
                              <SelectItem key={w.id} value={w.id}>
                                {w.name} — {w.city} {w.is_default ? "⭐" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {/* Carrier selector */}
                      <Select value={selectedCarrierId} onValueChange={setSelectedCarrierId}>
                        <SelectTrigger className="text-xs bg-card border-border/50">
                          <SelectValue placeholder={loadingCarriers ? "جاري التحميل..." : "اختر شركة الشحن"} />
                        </SelectTrigger>
                        <SelectContent>
                          {lamhaCarriers.map((c) => (
                            <SelectItem key={c.carrier_id} value={String(c.carrier_id)}>
                              {c.name} {c.has_cod ? "• COD" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        className="w-full gap-1.5 text-xs"
                        disabled={sendingToLamha === selectedOrder.id || !selectedCarrierId}
                        onClick={() => sendToLamha(selectedOrder.id)}
                      >
                        {sendingToLamha === selectedOrder.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        إرسال إلى لمحة
                      </Button>
                    </>
                  )}


                  {/* Label button when shipment exists */}
                  {selectedOrder.shipment_carrier === "lamha" && selectedOrder.shipment_status && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5 text-xs"
                      onClick={() => printLamhaLabel(selectedOrder.id)}
                    >
                      <Printer className="w-3.5 h-3.5" />
                      طباعة البوليصة
                    </Button>
                  )}
                </div>
              )}

              {/* Shipment Timeline */}
              {shipmentEvents.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-info" />
                    مراحل الشحن
                    {(selectedOrder as any).shipment_tracking_number && (
                      <span className="text-[10px] font-mono text-muted-foreground mr-auto" dir="ltr">
                        #{(selectedOrder as any).shipment_tracking_number}
                      </span>
                    )}
                  </p>
                  <div className="space-y-0">
                    {shipmentEvents.map((event, idx) => {
                      const Icon = SHIPMENT_ICONS[event.status_key] || Package;
                      const color = SHIPMENT_COLORS[event.status_key] || "text-muted-foreground";
                      const isFirst = idx === 0;
                      return (
                        <div key={event.id} className="flex gap-2.5 relative">
                          {idx < shipmentEvents.length - 1 && (
                            <div className="absolute right-[11px] top-7 bottom-0 w-px bg-border" />
                          )}
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10",
                            isFirst ? "bg-primary/10" : "bg-secondary"
                          )}>
                            <Icon className={cn("w-3 h-3", isFirst ? color : "text-muted-foreground")} />
                          </div>
                          <div className="pb-4 flex-1">
                            <p className={cn("text-xs", isFirst ? "font-medium text-foreground" : "text-muted-foreground")}>
                              {event.status_label}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(event.created_at).toLocaleDateString("ar-SA", {
                                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                              })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrdersPage;
