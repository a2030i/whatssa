import { useState } from "react";
import { Package, Truck, CheckCircle2, XCircle, Clock, Search, MapPin, Phone, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const STATUS_ICONS: Record<string, any> = {
  created: Package,
  new: Package,
  pending: Clock,
  fulfilled: CheckCircle2,
  ready_for_pickup: Package,
  picked_up: Truck,
  shipping: Truck,
  delivered: CheckCircle2,
  delivery_failed: XCircle,
  returned: ArrowLeft,
  cancelled: XCircle,
  reverse_shipment: ArrowLeft,
  creation_failed: XCircle,
};

const STATUS_COLORS: Record<string, string> = {
  created: "text-primary",
  new: "text-primary",
  pending: "text-warning",
  fulfilled: "text-success",
  ready_for_pickup: "text-info",
  picked_up: "text-info",
  shipping: "text-info",
  delivered: "text-success",
  delivery_failed: "text-destructive",
  returned: "text-warning",
  cancelled: "text-destructive",
  reverse_shipment: "text-warning",
  creation_failed: "text-destructive",
};

const TrackingPage = () => {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [order, setOrder] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);

  const search = async () => {
    if (!trackingNumber.trim()) return;
    setLoading(true);
    setNotFound(false);
    setEvents([]);
    setOrder(null);

    // Find order by tracking number or order number
    const { data: orderData } = await supabase
      .from("orders")
      .select("id, order_number, customer_name, customer_city, shipment_status, shipment_carrier, shipment_tracking_number, status, created_at")
      .or(`shipment_tracking_number.eq.${trackingNumber.trim()},order_number.eq.${trackingNumber.trim()}`)
      .maybeSingle();

    if (!orderData) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setOrder(orderData);

    // Get shipment events
    const { data: eventsData } = await supabase
      .from("shipment_events")
      .select("*")
      .eq("order_id", orderData.id)
      .order("created_at", { ascending: false });

    setEvents(eventsData || []);
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") search();
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <div className="bg-card border-b border-border">
        <div className="max-w-xl mx-auto px-4 py-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Truck className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-black text-foreground mb-2">تتبع شحنتك</h1>
          <p className="text-sm text-muted-foreground mb-6">أدخل رقم التتبع أو رقم الطلب لمعرفة حالة شحنتك</p>

          <div className="flex gap-2 max-w-sm mx-auto">
            <Input
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="رقم التتبع أو رقم الطلب"
              className="text-center font-mono"
              dir="ltr"
            />
            <Button onClick={search} disabled={loading} className="shrink-0 gap-1.5">
              <Search className="w-4 h-4" />
              بحث
            </Button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-xl mx-auto px-4 py-6">
        {loading && (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">جاري البحث...</p>
          </div>
        )}

        {notFound && (
          <div className="text-center py-12 bg-card rounded-2xl border border-border">
            <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">لم يتم العثور على الشحنة</p>
            <p className="text-xs text-muted-foreground">تأكد من رقم التتبع أو رقم الطلب وحاول مرة أخرى</p>
          </div>
        )}

        {order && (
          <div className="space-y-4 animate-fade-in">
            {/* Order Summary Card */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">رقم الطلب</p>
                  <p className="font-mono font-bold text-lg">{order.order_number || order.id.slice(0, 8)}</p>
                </div>
                <Badge className={cn(
                  "text-xs border-0 gap-1",
                  order.shipment_status === "delivered" ? "bg-success/10 text-success" :
                  order.shipment_status === "shipping" || order.shipment_status === "picked_up" ? "bg-info/10 text-info" :
                  order.shipment_status === "delivery_failed" || order.shipment_status === "cancelled" ? "bg-destructive/10 text-destructive" :
                  "bg-warning/10 text-warning"
                )}>
                  {(() => {
                    const Icon = STATUS_ICONS[order.shipment_status] || Package;
                    return <Icon className="w-3.5 h-3.5" />;
                  })()}
                  {events[0]?.status_label || order.shipment_status || "غير محدد"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                {order.customer_name && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Phone className="w-3.5 h-3.5" />
                    {order.customer_name}
                  </div>
                )}
                {order.customer_city && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5" />
                    {order.customer_city}
                  </div>
                )}
                {order.shipment_tracking_number && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">رقم التتبع: </span>
                    <span className="font-mono font-medium" dir="ltr">{order.shipment_tracking_number}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-card rounded-2xl border border-border p-5">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                مراحل الشحنة
              </h3>

              {events.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">لا توجد تحديثات بعد</p>
              ) : (
                <div className="space-y-0">
                  {events.map((event, idx) => {
                    const Icon = STATUS_ICONS[event.status_key] || Package;
                    const color = STATUS_COLORS[event.status_key] || "text-muted-foreground";
                    const isFirst = idx === 0;

                    return (
                      <div key={event.id} className="flex gap-3 relative">
                        {/* Timeline line */}
                        {idx < events.length - 1 && (
                          <div className="absolute right-[15px] top-8 bottom-0 w-px bg-border" />
                        )}

                        {/* Icon */}
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10",
                          isFirst ? "bg-primary/10" : "bg-secondary"
                        )}>
                          <Icon className={cn("w-4 h-4", isFirst ? color : "text-muted-foreground")} />
                        </div>

                        {/* Content */}
                        <div className="pb-6 flex-1 min-w-0">
                          <p className={cn("text-sm font-medium", isFirst ? "text-foreground" : "text-muted-foreground")}>
                            {event.status_label}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {new Date(event.created_at).toLocaleDateString("ar-SA", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center py-6 text-xs text-muted-foreground">
        <p>مدعوم من نظام إدارة الشحنات</p>
      </div>
    </div>
  );
};

export default TrackingPage;
