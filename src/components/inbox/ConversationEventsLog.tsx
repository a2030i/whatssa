import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { UserPlus, CheckCircle2, XCircle, BellOff, Bell, Tag, Bot, ArrowLeftRight, StickyNote } from "lucide-react";

interface ConvEvent {
  id: string;
  event_type: string;
  payload: Record<string, any>;
  created_at: string;
  actor_id: string | null;
}

const EVENT_CONFIG: Record<string, { icon: React.ElementType; color: string; label: (p: any) => string }> = {
  assigned:      { icon: UserPlus,        color: "text-primary",     label: (p) => `تم تعيين المحادثة${p.to_name ? ` إلى ${p.to_name}` : ""}` },
  unassigned:    { icon: UserPlus,        color: "text-muted-foreground", label: () => "تم إلغاء التعيين" },
  transferred:   { icon: ArrowLeftRight,  color: "text-primary",     label: (p) => `تم التحويل${p.to_agent ? ` إلى ${p.to_agent}` : ""}${p.reason ? ` · ${p.reason}` : ""}` },
  status_changed:{ icon: CheckCircle2,    color: "text-success",     label: (p) => `تغيّرت الحالة إلى: ${translateStatus(p.to || "")}` },
  snoozed:       { icon: BellOff,         color: "text-warning",     label: (p) => `تم التأجيل${p.until ? " حتى " + new Date(p.until).toLocaleString("ar-SA-u-ca-gregory", { dateStyle: "short", timeStyle: "short" }) : ""}` },
  unsnoozed:     { icon: Bell,            color: "text-success",     label: () => "عادت المحادثة من التأجيل" },
  tagged:        { icon: Tag,             color: "text-primary",     label: (p) => `تمّ إضافة وسم: ${p.tag || ""}` },
  note_added:    { icon: StickyNote,      color: "text-warning",     label: () => "تمّ إضافة ملاحظة داخلية" },
  bot_on:        { icon: Bot,             color: "text-primary",     label: () => "تمّ تفعيل الردّ التلقائي" },
  bot_off:       { icon: Bot,             color: "text-muted-foreground", label: () => "تمّ إيقاف الردّ التلقائي" },
  closed:        { icon: XCircle,         color: "text-destructive", label: (p) => `تمّ الإغلاق${p.reason ? ` · ${p.reason}` : ""}` },
  reopened:      { icon: CheckCircle2,    color: "text-success",     label: () => "تمّ إعادة فتح المحادثة" },
};

function translateStatus(s: string) {
  return ({ active: "نشط", waiting: "بانتظار", closed: "مغلقة", open: "مفتوح" } as Record<string, string>)[s] || s;
}

const ConversationEventsLog = ({ conversationId }: { conversationId: string }) => {
  const [events, setEvents] = useState<ConvEvent[]>([]);

  useEffect(() => {
    if (!conversationId) return;
    supabase
      .from("conversation_events")
      .select("id, event_type, payload, created_at, actor_id")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .then(({ data }) => setEvents((data as ConvEvent[]) || []));

    const channel = supabase
      .channel(`conv-events-${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "conversation_events",
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        setEvents((prev) => [...prev, payload.new as ConvEvent]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  if (events.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 px-4 py-2">
      {events.map((ev) => {
        const cfg = EVENT_CONFIG[ev.event_type];
        if (!cfg) return null;
        const Icon = cfg.icon;
        return (
          <div key={ev.id} className="flex items-center justify-center gap-1.5 py-1">
            <div className="h-px flex-1 bg-border/50" />
            <div className={`flex items-center gap-1 text-[10px] ${cfg.color} px-2`}>
              <Icon className="w-3 h-3 shrink-0" />
              <span>{cfg.label(ev.payload || {})}</span>
              <span className="text-muted-foreground/60 mr-1">
                {new Date(ev.created_at).toLocaleTimeString("ar-SA-u-ca-gregory", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <div className="h-px flex-1 bg-border/50" />
          </div>
        );
      })}
    </div>
  );
};

export default ConversationEventsLog;
