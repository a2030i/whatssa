import { useState, useEffect } from "react";
import { ShoppingCart, Package, Truck, CheckCircle2, XCircle, Clock, Search, Filter, Eye, Download, TrendingUp, DollarSign, BarChart3, ArrowUpCircle, ArrowDownCircle, Loader2, Store, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";


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

  useEffect(() => { if (orgId) loadOrders(); }, [orgId]);

  const loadOrders = async () => {
    const { data } = await supabase.from("orders").select("*").eq("org_id", orgId!).order("created_at", { ascending: false });
    const list = data || [];
    setOrders(list);
    
    const today = new Date().toISOString().slice(0, 10);
    const todayOrders = list.filter(o => o.created_at?.slice(0, 10) === today);
    const revenue = list.filter(o => o.status !== "cancelled" && o.status !== "refunded").reduce((s, o) => s + Number(o.total || 0), 0);
    const todayRevenue = todayOrders.filter(o => o.status !== "cancelled").reduce((s, o) => s + Number(o.total || 0), 0);
    
    setStats({
      total: list.length,
      revenue,
      avgOrder: list.length > 0 ? revenue / list.filter(o => o.status !== "cancelled").length : 0,
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
    return true;
  });

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
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="بحث بالاسم أو الرقم..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pr-9 bg-card border-0 shadow-card text-sm" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40 bg-card border-0 shadow-card text-xs"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {Object.entries(statusConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
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
                const pc = paymentConfig[order.payment_status] || paymentConfig.unpaid;
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
        <DialogContent className="max-w-lg" dir="rtl">
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
                  {selectedOrder.payment_status && (
                    <Badge className={cn("text-[10px] border-0", (paymentConfig[selectedOrder.payment_status] || paymentConfig.unpaid).color)}>
                      {(paymentConfig[selectedOrder.payment_status] || paymentConfig.unpaid).label}
                    </Badge>
                  )}
                </div>
                {selectedOrder.source && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-secondary/50 rounded-lg px-2 py-1">
                    <Store className="w-3 h-3" />
                    {selectedOrder.source === "salla" ? "سلة" : selectedOrder.source === "zid" ? "زد" : selectedOrder.source === "shopify" ? "Shopify" : selectedOrder.source === "woocommerce" ? "WooCommerce" : selectedOrder.source === "lamha" ? "لمحة" : selectedOrder.source}
                  </div>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">الحالات تتحدث تلقائياً من المنصة</p>

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
