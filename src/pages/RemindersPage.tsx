import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Bell, Check, X, Clock, User, MessageSquare, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { ar } from "date-fns/locale";

interface Reminder {
  id: string;
  conversation_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  scheduled_at: string;
  reminder_note: string | null;
  status: string;
  created_at: string;
  assigned_profile?: { full_name: string | null } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:   { label: "قيد الانتظار", color: "bg-amber-100 text-amber-700" },
  done:      { label: "منجز",         color: "bg-green-100 text-green-700" },
  cancelled: { label: "ملغي",         color: "bg-gray-100 text-gray-500" },
  sent:      { label: "مُرسَل",       color: "bg-blue-100 text-blue-700" },
};

const fetchReminders = async (orgId: string, status: string): Promise<Reminder[]> => {
  let query = supabase
    .from("follow_up_reminders")
    .select("id, conversation_id, customer_name, customer_phone, scheduled_at, reminder_note, status, created_at, profiles!assigned_to(full_name)")
    .eq("org_id", orgId)
    .order("scheduled_at", { ascending: true })
    .limit(200);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((r: any) => ({ ...r, assigned_profile: r.profiles }));
};

const RemindersPage = () => {
  const { orgId } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [search, setSearch] = useState("");

  const { data: reminders = [], isLoading } = useQuery({
    queryKey: ["reminders", orgId, statusFilter],
    queryFn: () => fetchReminders(orgId!, statusFilter),
    enabled: !!orgId,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: any = { status, updated_at: new Date().toISOString() };
      if (status === "done") patch.sent_at = new Date().toISOString();
      if (status === "cancelled") patch.cancelled_at = new Date().toISOString();
      const { error } = await supabase.from("follow_up_reminders").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      toast.success(status === "done" ? "تم وضع التذكير كمنجز" : "تم إلغاء التذكير");
      qc.invalidateQueries({ queryKey: ["reminders", orgId] });
    },
    onError: () => toast.error("فشل التحديث"),
  });

  const filtered = reminders.filter(r =>
    !search ||
    r.customer_name?.includes(search) ||
    r.customer_phone?.includes(search) ||
    r.reminder_note?.includes(search)
  );

  const overdue = filtered.filter(r => r.status === "pending" && isPast(new Date(r.scheduled_at)));

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" /> تذكيرات المتابعة
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">تتبع متابعاتك مع العملاء</p>
        </div>
        {overdue.length > 0 && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5">
            <Bell className="w-3.5 h-3.5" />
            {overdue.length} متأخر
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["all", "pending", "done", "cancelled"] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cn("text-xs px-3 py-1.5 rounded-xl border font-medium transition-colors",
              statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
            {s === "all" ? "الكل" : STATUS_CONFIG[s]?.label}
          </button>
        ))}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث..." dir="rtl"
            className="w-full border border-border rounded-xl py-1.5 pr-8 pl-3 text-xs bg-background focus:outline-none" />
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">جارٍ التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
          <Bell className="w-12 h-12 mb-3 opacity-20" />
          <p className="text-sm font-medium">لا توجد تذكيرات</p>
          <p className="text-xs mt-1 opacity-60">يمكنك إنشاء تذكيرات من داخل أي محادثة</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const isOverdue = r.status === "pending" && isPast(new Date(r.scheduled_at));
            const sc = STATUS_CONFIG[r.status] || STATUS_CONFIG.pending;
            return (
              <div key={r.id} className={cn(
                "border rounded-2xl p-4 flex items-start gap-3 transition-colors",
                isOverdue ? "border-red-200 bg-red-50/50" : "border-border bg-card hover:bg-muted/20"
              )}>
                {/* Time indicator */}
                <div className={cn("shrink-0 w-10 h-10 rounded-xl flex flex-col items-center justify-center text-center",
                  isOverdue ? "bg-red-100" : "bg-primary/10")}>
                  <Clock className={cn("w-4 h-4", isOverdue ? "text-red-500" : "text-primary")} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[13px] font-semibold">
                      {r.customer_name || r.customer_phone || "عميل"}
                    </span>
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-lg", sc.color)}>{sc.label}</span>
                    {isOverdue && <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-lg">متأخر!</span>}
                  </div>

                  {r.reminder_note && (
                    <p className="text-[12px] text-muted-foreground mb-1.5 line-clamp-2">{r.reminder_note}</p>
                  )}

                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(r.scheduled_at), "dd/MM/yyyy HH:mm", { locale: ar })}
                      {r.status === "pending" && (
                        <span className={cn("mr-1", isOverdue ? "text-red-500 font-bold" : "")}>
                          ({isOverdue ? "تأخر " : "بعد "}
                          {formatDistanceToNow(new Date(r.scheduled_at), { locale: ar })})
                        </span>
                      )}
                    </span>
                    {r.assigned_profile?.full_name && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />{r.assigned_profile.full_name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {r.conversation_id && (
                    <button onClick={() => navigate(`/inbox?conv=${r.conversation_id}`)}
                      title="فتح المحادثة"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                      <MessageSquare className="w-4 h-4" />
                    </button>
                  )}
                  {r.status === "pending" && (
                    <>
                      <button onClick={() => updateStatus.mutate({ id: r.id, status: "done" })}
                        title="تم"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-green-600 hover:bg-green-50 transition-colors">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => updateStatus.mutate({ id: r.id, status: "cancelled" })}
                        title="إلغاء"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RemindersPage;
