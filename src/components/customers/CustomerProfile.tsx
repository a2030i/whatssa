import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import CustomerTimeline from "./CustomerTimeline";
import {
  ArrowRight, Package, CreditCard, MapPin, Calendar, TrendingUp,
  ShoppingCart, Clock, Phone, Mail, Building, Tag,
} from "lucide-react";

interface CustomerProfileProps {
  customerId: string;
  onBack: () => void;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "قيد الانتظار", color: "bg-amber-100 text-amber-700" },
  processing: { label: "قيد التجهيز", color: "bg-blue-100 text-blue-700" },
  shipped: { label: "تم الشحن", color: "bg-purple-100 text-purple-700" },
  delivered: { label: "تم التوصيل", color: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "ملغي", color: "bg-red-100 text-red-700" },
  refunded: { label: "مسترجع", color: "bg-gray-100 text-gray-700" },
};

const CustomerProfile = ({ customerId, onBack }: CustomerProfileProps) => {
  const [customer, setCustomer] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<Record<string, any[]>>({});
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [customerId]);

  const loadData = async () => {
    setLoading(true);
    const [custRes, ordersRes] = await Promise.all([
      supabase.from("customers").select("*").eq("id", customerId).single(),
      supabase.from("orders").select("*").eq("customer_id", customerId).order("created_at", { ascending: false }),
    ]);
    setCustomer(custRes.data);
    setOrders(ordersRes.data || []);

    // Load items for all orders
    if (ordersRes.data && ordersRes.data.length > 0) {
      const orderIds = ordersRes.data.map((o: any) => o.id);
      const { data: items } = await supabase
        .from("order_items")
        .select("*")
        .in("order_id", orderIds);
      
      const grouped: Record<string, any[]> = {};
      (items || []).forEach((item: any) => {
        if (!grouped[item.order_id]) grouped[item.order_id] = [];
        grouped[item.order_id].push(item);
      });
      setOrderItems(grouped);
    }
    setLoading(false);
  };

  const analytics = useMemo(() => {
    if (!orders.length) return null;

    const completedOrders = orders.filter((o) => !["cancelled", "refunded"].includes(o.status));
    const totalSpent = completedOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const avgOrderValue = completedOrders.length > 0 ? totalSpent / completedOrders.length : 0;

    // Payment methods breakdown
    const paymentMethods: Record<string, number> = {};
    orders.forEach((o) => {
      const method = o.payment_method || "غير محدد";
      paymentMethods[method] = (paymentMethods[method] || 0) + 1;
    });

    // Order frequency (average days between orders)
    let avgDaysBetween = 0;
    if (completedOrders.length > 1) {
      const sorted = [...completedOrders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      let totalDays = 0;
      for (let i = 1; i < sorted.length; i++) {
        totalDays += (new Date(sorted[i].created_at).getTime() - new Date(sorted[i - 1].created_at).getTime()) / (1000 * 60 * 60 * 24);
      }
      avgDaysBetween = Math.round(totalDays / (sorted.length - 1));
    }

    // Cities
    const cities: Record<string, number> = {};
    orders.forEach((o) => {
      if (o.customer_city) cities[o.customer_city] = (cities[o.customer_city] || 0) + 1;
    });

    // Status breakdown
    const statusBreakdown: Record<string, number> = {};
    orders.forEach((o) => {
      statusBreakdown[o.status] = (statusBreakdown[o.status] || 0) + 1;
    });

    // Most purchased products
    const productCounts: Record<string, { name: string; qty: number; total: number }> = {};
    Object.values(orderItems).flat().forEach((item: any) => {
      const key = item.product_name;
      if (!productCounts[key]) productCounts[key] = { name: key, qty: 0, total: 0 };
      productCounts[key].qty += item.quantity;
      productCounts[key].total += Number(item.total_price) || 0;
    });
    const topProducts = Object.values(productCounts).sort((a, b) => b.qty - a.qty).slice(0, 5);

    // First & last order
    const firstOrder = orders[orders.length - 1];
    const lastOrder = orders[0];

    return {
      totalOrders: orders.length,
      completedOrders: completedOrders.length,
      totalSpent,
      avgOrderValue,
      paymentMethods,
      avgDaysBetween,
      cities,
      statusBreakdown,
      topProducts,
      firstOrderDate: firstOrder?.created_at,
      lastOrderDate: lastOrder?.created_at,
      currency: orders[0]?.currency || "SAR",
    };
  }, [orders, orderItems]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!customer) return null;

  const formatDate = (d: string) => new Date(d).toLocaleDateString("ar-SA-u-ca-gregory", { year: "numeric", month: "short", day: "numeric" });
  const formatCurrency = (v: number, cur: string = "SAR") => `${v.toLocaleString("ar-SA-u-ca-gregory", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={onBack} className="gap-1">
          <ArrowRight className="w-4 h-4" /> رجوع
        </Button>
        <h1 className="text-lg font-bold">{customer.name || "بدون اسم"}</h1>
      </div>

      {/* Customer Info Card */}
      <div className="bg-card rounded-xl p-4 shadow-card border border-border">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-muted-foreground" />
            <span dir="ltr" className="font-mono text-xs">{customer.phone}</span>
          </div>
          {customer.email && (
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs">{customer.email}</span>
            </div>
          )}
          {customer.company && (
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs">{customer.company}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs">{customer.source || "غير محدد"}</span>
          </div>
        </div>
        {(customer.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {customer.tags.map((t: string) => (
              <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
            ))}
          </div>
        )}
      </div>

      {/* Analytics KPIs */}
      {analytics && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiBox icon={ShoppingCart} label="إجمالي الطلبات" value={String(analytics.totalOrders)} />
            <KpiBox icon={CreditCard} label="إجمالي المصروف" value={formatCurrency(analytics.totalSpent, analytics.currency)} />
            <KpiBox icon={TrendingUp} label="متوسط قيمة الطلب" value={formatCurrency(analytics.avgOrderValue, analytics.currency)} />
            <KpiBox icon={Clock} label="معدل الطلب" value={analytics.avgDaysBetween > 0 ? `كل ${analytics.avgDaysBetween} يوم` : "طلب واحد"} />
          </div>

          {/* Payment Methods & Cities & Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <InfoCard title="طرق الدفع المستخدمة">
              {Object.entries(analytics.paymentMethods).map(([method, count]) => (
                <div key={method} className="flex justify-between text-xs py-1">
                  <span>{method}</span>
                  <span className="text-muted-foreground">{count} مرة</span>
                </div>
              ))}
            </InfoCard>
            <InfoCard title="حالات الطلبات">
              {Object.entries(analytics.statusBreakdown).map(([status, count]) => {
                const s = STATUS_MAP[status] || { label: status, color: "bg-gray-100 text-gray-700" };
                return (
                  <div key={status} className="flex justify-between text-xs py-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] ${s.color}`}>{s.label}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </div>
                );
              })}
            </InfoCard>
            <InfoCard title="المدن">
              {Object.keys(analytics.cities).length > 0 ? (
                Object.entries(analytics.cities).map(([city, count]) => (
                  <div key={city} className="flex justify-between text-xs py-1">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{city}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">لا توجد بيانات</p>
              )}
            </InfoCard>
          </div>

          {/* Top Products */}
          {analytics.topProducts.length > 0 && (
            <InfoCard title="أكثر المنتجات طلباً">
              {analytics.topProducts.map((p, i) => (
                <div key={i} className="flex justify-between text-xs py-1.5 border-b border-border/30 last:border-0">
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                    {p.name}
                  </span>
                  <div className="text-left">
                    <span className="text-muted-foreground">{p.qty} قطعة</span>
                    <span className="mr-2 font-medium">{formatCurrency(p.total, analytics.currency)}</span>
                  </div>
                </div>
              ))}
            </InfoCard>
          )}

          {/* Timeline info */}
          <div className="flex gap-4 text-xs text-muted-foreground bg-card rounded-lg p-3 border border-border">
            {analytics.firstOrderDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" /> أول طلب: {formatDate(analytics.firstOrderDate)}
              </span>
            )}
            {analytics.lastOrderDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" /> آخر طلب: {formatDate(analytics.lastOrderDate)}
              </span>
            )}
          </div>
        </>
      )}

      {/* Customer Timeline */}
      <div className="bg-card rounded-xl shadow-card border border-border p-4">
        <CustomerTimeline customerId={customerId} customerPhone={customer.phone} />
      </div>

      {/* Orders List */}
      <div className="bg-card rounded-xl shadow-card border border-border overflow-hidden">
        <div className="p-3 border-b border-border">
          <h2 className="text-sm font-bold flex items-center gap-2"><Package className="w-4 h-4" /> الطلبات ({orders.length})</h2>
        </div>
        {orders.length === 0 ? (
          <p className="text-center py-8 text-xs text-muted-foreground">لا توجد طلبات</p>
        ) : (
          <div className="divide-y divide-border/50">
            {orders.map((order) => {
              const status = STATUS_MAP[order.status] || { label: order.status, color: "bg-gray-100 text-gray-700" };
              const items = orderItems[order.id] || [];
              const isExpanded = expandedOrder === order.id;

              return (
                <div key={order.id}>
                  <button
                    onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                    className="w-full text-right p-3 hover:bg-secondary/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-muted-foreground">#{order.order_number || order.external_id}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] ${status.color}`}>{status.label}</span>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold">{formatCurrency(Number(order.total) || 0, order.currency)}</p>
                        <p className="text-[10px] text-muted-foreground">{formatDate(order.created_at)}</p>
                      </div>
                    </div>
                    {/* Quick info row */}
                    <div className="flex gap-3 mt-1.5 text-[10px] text-muted-foreground">
                      {order.payment_method && <span>💳 {order.payment_method}</span>}
                      {order.customer_city && <span>📍 {order.customer_city}</span>}
                      {items.length > 0 && <span>📦 {items.length} منتج</span>}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-4 pb-3 space-y-2 bg-secondary/10">
                      {/* Financial breakdown */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                        <div><span className="text-muted-foreground">المبلغ الفرعي:</span> <span className="font-medium">{formatCurrency(Number(order.subtotal) || 0)}</span></div>
                        <div><span className="text-muted-foreground">الخصم:</span> <span className="font-medium text-emerald-600">-{formatCurrency(Number(order.discount_amount) || 0)}</span></div>
                        <div><span className="text-muted-foreground">الشحن:</span> <span className="font-medium">{formatCurrency(Number(order.shipping_amount) || 0)}</span></div>
                        <div><span className="text-muted-foreground">الضريبة:</span> <span className="font-medium">{formatCurrency(Number(order.tax_amount) || 0)}</span></div>
                        <div><span className="text-muted-foreground">الإجمالي:</span> <span className="font-bold">{formatCurrency(Number(order.total) || 0)}</span></div>
                      </div>
                      {/* Address */}
                      {(order.customer_address || order.customer_region) && (
                        <div className="text-xs flex items-center gap-1 text-muted-foreground">
                          <MapPin className="w-3 h-3" />
                          {[order.customer_city, order.customer_region, order.customer_address].filter(Boolean).join(" - ")}
                        </div>
                      )}
                      {/* Items */}
                      {items.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[11px] font-medium">المنتجات:</p>
                          {items.map((item: any) => (
                            <div key={item.id} className="flex justify-between text-xs bg-card rounded p-2 border border-border/30">
                              <div className="flex items-center gap-2">
                                {item.metadata?.thumbnail && (
                                  <img src={item.metadata.thumbnail} alt="" className="w-8 h-8 rounded object-cover" />
                                )}
                                <div>
                                  <p className="font-medium">{item.product_name}</p>
                                  {item.product_sku && <p className="text-[10px] text-muted-foreground">SKU: {item.product_sku}</p>}
                                </div>
                              </div>
                              <div className="text-left">
                                <p>{item.quantity} × {formatCurrency(Number(item.unit_price))}</p>
                                <p className="font-medium">{formatCurrency(Number(item.total_price))}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const KpiBox = ({ icon: Icon, label, value }: { icon: any; label: string; value: string }) => (
  <div className="bg-card rounded-xl p-3 border border-border shadow-card">
    <div className="flex items-center gap-2 mb-1">
      <Icon className="w-4 h-4 text-primary" />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
    <p className="text-sm font-bold">{value}</p>
  </div>
);

const InfoCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-card rounded-xl p-3 border border-border shadow-card">
    <h3 className="text-xs font-bold mb-2">{title}</h3>
    {children}
  </div>
);

export default CustomerProfile;
