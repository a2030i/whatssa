import { useState, useEffect } from "react";
import { Ticket, Clock, User, CheckCircle2, AlertCircle, Loader2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import CreateTicketDialog from "@/components/tickets/CreateTicketDialog";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  open: { label: "مفتوحة", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  in_progress: { label: "قيد المعالجة", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  waiting_customer: { label: "بانتظار العميل", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  resolved: { label: "تم الحل", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  closed: { label: "مغلقة", color: "bg-muted text-muted-foreground" },
};

const TicketsTab = ({
  conversationId,
  customerPhone,
  customerName,
  orgId,
}: {
  conversationId: string;
  customerPhone: string;
  customerName?: string;
  orgId: string | null;
}) => {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const fetchTickets = async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await supabase
      .from("tickets")
      .select("id, title, status, priority, category, created_by, assigned_to, created_at")
      .eq("org_id", orgId)
      .or(`conversation_id.eq.${conversationId},customer_phone.eq.${customerPhone}`)
      .order("created_at", { ascending: false })
      .limit(20);

    if (data && data.length > 0) {
      const userIds = [...new Set([...data.map(t => t.created_by), ...data.map(t => t.assigned_to)].filter(Boolean))];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
      const nameMap = new Map((profiles || []).map(p => [p.id, p.full_name]));
      setTickets(data.map(t => ({ ...t, creator_name: nameMap.get(t.created_by) || null, assignee_name: nameMap.get(t.assigned_to) || null })));
    } else {
      setTickets([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTickets();
  }, [orgId, conversationId, customerPhone]);

  useEffect(() => {
    if (!orgId) return;
    supabase.from("profiles").select("id, full_name").eq("org_id", orgId).eq("is_active", true)
      .then(({ data }) => setAgents(data || []));
  }, [orgId]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold text-muted-foreground">
          تذاكر العميل {tickets.length > 0 ? `(${tickets.length})` : ""}
        </p>
        <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 px-2" onClick={() => setShowCreate(true)}>
          <Plus className="w-3 h-3" /> تذكرة جديدة
        </Button>
      </div>

      {tickets.length === 0 ? (
        <div className="py-6 text-center text-muted-foreground">
          <Ticket className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">لا توجد تذاكر لهذا العميل</p>
          <Button size="sm" variant="outline" className="mt-3 h-7 text-xs gap-1" onClick={() => setShowCreate(true)}>
            <Plus className="w-3 h-3" /> أنشئ أول تذكرة
          </Button>
        </div>
      ) : (
        tickets.map(t => {
          const st = STATUS_MAP[t.status] || STATUS_MAP.open;
          return (
            <div key={t.id} className="p-2.5 rounded-lg border border-border/50 bg-muted/20 space-y-1.5">
              <div className="flex items-start justify-between gap-1">
                <p className="text-xs font-medium text-foreground truncate flex-1">{t.title}</p>
                <Badge className={`text-[9px] px-1.5 py-0 h-4 shrink-0 ${st.color}`}>{st.label}</Badge>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                {t.creator_name && <span>📝 {t.creator_name}</span>}
                {t.assignee_name && <span>👷 {t.assignee_name}</span>}
                <span>{format(new Date(t.created_at), "d MMM HH:mm", { locale: ar })}</span>
              </div>
            </div>
          );
        })
      )}

      <CreateTicketDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={fetchTickets}
        agents={agents}
        conversationId={conversationId}
        customerPhone={customerPhone}
        customerName={customerName}
      />
    </div>
  );
};

export default TicketsTab;

