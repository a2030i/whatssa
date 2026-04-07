import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MessageSquare, ShoppingCart, Megaphone, Bot, Clock, Tag, UserCheck, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TimelineEvent {
  id: string;
  type: "conversation" | "order" | "campaign" | "chatbot";
  title: string;
  description: string;
  date: string;
  status?: string;
  metadata?: Record<string, any>;
}

interface CustomerTimelineProps {
  customerId: string;
  customerPhone: string;
}

const EVENT_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  conversation: { icon: MessageSquare, color: "bg-blue-100 text-blue-600", label: "محادثة" },
  order: { icon: ShoppingCart, color: "bg-emerald-100 text-emerald-600", label: "طلب" },
  campaign: { icon: Megaphone, color: "bg-purple-100 text-purple-600", label: "حملة" },
  chatbot: { icon: Bot, color: "bg-amber-100 text-amber-600", label: "شات بوت" },
};

const CustomerTimeline = ({ customerId, customerPhone }: CustomerTimelineProps) => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTimeline();
  }, [customerId, customerPhone]);

  const loadTimeline = async () => {
    setLoading(true);
    const allEvents: TimelineEvent[] = [];

    // Fetch conversations
    const { data: convs } = await supabase
      .from("conversations")
      .select("id, status, created_at, last_message, assigned_to, tags, channel_id")
      .eq("customer_phone", customerPhone)
      .order("created_at", { ascending: false })
      .limit(50);

    (convs || []).forEach((c: any) => {
      allEvents.push({
        id: `conv-${c.id}`,
        type: "conversation",
        title: c.status === "closed" ? "محادثة مغلقة" : c.status === "waiting" ? "محادثة قيد الانتظار" : "محادثة نشطة",
        description: c.last_message || "بدون رسائل",
        date: c.created_at,
        status: c.status,
        metadata: { assigned_to: c.assigned_to, tags: c.tags },
      });
    });

    // Fetch orders
    const { data: orders } = await supabase
      .from("orders")
      .select("id, order_number, status, total, currency, created_at, payment_status")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(50);

    (orders || []).forEach((o: any) => {
      const statusMap: Record<string, string> = {
        pending: "قيد الانتظار", processing: "قيد التجهيز", shipped: "تم الشحن",
        delivered: "تم التوصيل", cancelled: "ملغي", refunded: "مسترجع",
      };
      allEvents.push({
        id: `order-${o.id}`,
        type: "order",
        title: `طلب #${o.order_number || o.id.slice(0, 8)}`,
        description: `${Number(o.total || 0).toLocaleString("ar-SA-u-ca-gregory")} ${o.currency || "SAR"} — ${statusMap[o.status] || o.status}`,
        date: o.created_at,
        status: o.status,
        metadata: { payment_status: o.payment_status },
      });
    });

    // Fetch campaign sends
    const { data: campaignRecips } = await supabase
      .from("campaign_recipients")
      .select("id, status, sent_at, created_at, campaign_id, campaigns:campaign_id(name)")
      .eq("phone", customerPhone)
      .order("created_at", { ascending: false })
      .limit(20);

    (campaignRecips || []).forEach((cr: any) => {
      const campName = cr.campaigns?.name || "حملة";
      allEvents.push({
        id: `camp-${cr.id}`,
        type: "campaign",
        title: campName,
        description: cr.status === "delivered" ? "تم التوصيل" : cr.status === "read" ? "تمت القراءة" : cr.status === "failed" ? "فشل الإرسال" : "تم الإرسال",
        date: cr.sent_at || cr.created_at,
        status: cr.status,
      });
    });

    // Sort all by date descending
    allEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setEvents(allEvents);
    setLoading(false);
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return `اليوم ${date.toLocaleTimeString("ar-SA-u-ca-gregory", { hour: "2-digit", minute: "2-digit" })}`;
    if (diffDays === 1) return "أمس";
    if (diffDays < 7) return `قبل ${diffDays} أيام`;
    return date.toLocaleDateString("ar-SA-u-ca-gregory", { year: "numeric", month: "short", day: "numeric" });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">لا توجد تفاعلات مسجلة بعد</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-bold flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-primary" />
        الجدول الزمني ({events.length})
      </h3>
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute right-[15px] top-0 bottom-0 w-px bg-border" />

        {events.map((event, i) => {
          const config = EVENT_CONFIG[event.type];
          const Icon = config.icon;
          return (
            <div key={event.id} className="relative flex gap-3 pb-4">
              {/* Dot */}
              <div className={`w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 z-10 ${config.color}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0 bg-card rounded-lg border border-border p-2.5 hover:border-primary/20 transition-colors">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold">{event.title}</span>
                    <Badge variant="secondary" className="text-[9px] h-4">{config.label}</Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{formatDate(event.date)}</span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{event.description}</p>
                {event.metadata?.tags && event.metadata.tags.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {event.metadata.tags.map((t: string) => (
                      <span key={t} className="text-[9px] bg-muted px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <Tag className="w-2.5 h-2.5" />{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CustomerTimeline;
