import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isSameDay, isPast, isToday, isTomorrow, addDays, startOfDay } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Calendar, Clock, Plus, Settings, Link2, Copy, Check, X, CheckCircle2,
  UserX, Pencil, Users, ChevronLeft, ChevronRight, Trash2, ExternalLink,
  Bell, MessageSquare, Globe, ToggleLeft, ToggleRight, Save, Loader2
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Meeting {
  id: string; org_id: string; profile_id: string; meeting_type_id: string | null;
  customer_name: string; customer_phone: string | null; customer_email: string | null;
  title: string; notes: string | null; agent_notes: string | null;
  start_time: string; end_time: string; status: "confirmed"|"cancelled"|"completed"|"no_show";
  conversation_id: string | null; meeting_url: string | null; meeting_link?: string | null; booking_source: string;
  created_at: string;
}
interface MeetingType {
  id: string; name: string; description: string | null; duration_minutes: number;
  buffer_minutes: number; color: string; location: string | null; is_active: boolean; sort_order: number;
}
interface Availability {
  id: string; day_of_week: number; start_time: string; end_time: string; is_active: boolean;
}
interface BookingPage {
  id: string; slug: string; title: string; bio: string | null;
  advance_booking_days: number; min_notice_hours: number; is_active: boolean;
}

const DAY_NAMES = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
const STATUS_CONFIG = {
  confirmed:  { label: "مؤكد",   color: "bg-green-100 text-green-700",  icon: CheckCircle2 },
  cancelled:  { label: "ملغى",   color: "bg-red-100 text-red-600",      icon: X },
  completed:  { label: "مكتمل",  color: "bg-blue-100 text-blue-700",    icon: Check },
  no_show:    { label: "لم يحضر",color: "bg-gray-100 text-gray-600",    icon: UserX },
};

// ─── MeetingCard ──────────────────────────────────────────────────────────────
const MeetingCard = ({ meeting, onAction }: { meeting: Meeting; onAction: (id: string, action: string) => void }) => {
  const s = STATUS_CONFIG[meeting.status];
  const Icon = s.icon;
  const start = new Date(meeting.start_time);
  const end   = new Date(meeting.end_time);
  const past  = isPast(end);

  const dayLabel = isToday(start) ? "اليوم" : isTomorrow(start) ? "غداً" : format(start, "EEEE d MMMM", { locale: ar });

  return (
    <div className={cn(
      "bg-white border rounded-2xl p-4 hover:shadow-sm transition-all",
      meeting.status === "confirmed" && !past ? "border-green-200" :
      meeting.status === "cancelled" ? "border-gray-100 opacity-60" : "border-gray-100"
    )}>
      <div className="flex items-start gap-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg font-bold text-white")}
          style={{ backgroundColor: "#6366f1" }}>
          {meeting.customer_name.slice(0, 1)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div>
              <p className="text-[14px] font-bold text-gray-900 truncate">{meeting.customer_name}</p>
              {meeting.customer_phone && <p className="text-[11px] text-gray-400">{meeting.customer_phone}</p>}
            </div>
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0", s.color)}>
              <Icon className="w-3 h-3" />{s.label}
            </span>
          </div>
          <p className="text-[12px] text-gray-600 font-medium mb-1">{meeting.title}</p>
          <div className="flex items-center gap-3 text-[11px] text-gray-400">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{dayLabel}</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(start, "HH:mm")} – {format(end, "HH:mm")}
            </span>
          </div>
          {meeting.notes && <p className="text-[11px] text-gray-500 mt-1 truncate">📝 {meeting.notes}</p>}
          {meeting.meeting_url && !past && (
            <a href={meeting.meeting_url} target="_blank" rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M15 8v8H5V8h10m1-2H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4V7a1 1 0 00-1-1z"/></svg>
              انضم للاجتماع
            </a>
          )}
        </div>
      </div>

      {meeting.status === "confirmed" && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50">
          {!past && <button onClick={() => onAction(meeting.id, "completed")}
            className="flex-1 text-[11px] bg-green-50 text-green-700 hover:bg-green-100 rounded-xl py-1.5 font-medium transition-colors">
            ✅ مكتمل
          </button>}
          {!past && <button onClick={() => onAction(meeting.id, "no_show")}
            className="flex-1 text-[11px] bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-xl py-1.5 font-medium transition-colors">
            🚫 لم يحضر
          </button>}
          <button onClick={() => onAction(meeting.id, "cancelled")}
            className="flex-1 text-[11px] bg-red-50 text-red-600 hover:bg-red-100 rounded-xl py-1.5 font-medium transition-colors">
            ❌ إلغاء
          </button>
          {meeting.conversation_id && (
            <button onClick={() => {
              window.dispatchEvent(new CustomEvent("navigate-conversation", { detail: { conversationId: meeting.conversation_id } }));
            }} className="w-8 h-7 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl flex items-center justify-center transition-colors">
              <MessageSquare className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── MeetingsPage ─────────────────────────────────────────────────────────────
const MeetingsPage = () => {
  const { orgId, profile, userRole, isSupervisor, isSuperAdmin } = useAuth();
  const qc = useQueryClient();
  const isAdmin = userRole === "admin" || isSuperAdmin;
  const isSupervisorOrAdmin = isAdmin || isSupervisor;
  const [tab, setTab] = useState<"meetings"|"availability"|"types"|"link">("meetings");
  const [viewMode, setViewMode] = useState<"upcoming"|"all"|"team">("upcoming");
  const [calDate, setCalDate] = useState(new Date());
  const [copied, setCopied] = useState(false);

  // ── Meetings ──────────────────────────────────────────────────────
  const { data: meetings = [], isLoading: loadingMeetings } = useQuery({
    queryKey: ["meetings", orgId, viewMode, profile?.id],
    queryFn: async () => {
      if (!orgId) return [];
      let q = supabase.from("meetings").select("*").eq("org_id", orgId).order("start_time", { ascending: true });
      if (viewMode === "upcoming") q = q.gte("start_time", new Date().toISOString()).eq("status", "confirmed");
      else if (viewMode !== "team") q = q.eq("profile_id", profile?.id || "");
      return (await q).data || [];
    },
    staleTime: 30_000,
  });

  // ── Meeting types ──────────────────────────────────────────────────
  const { data: meetingTypes = [], refetch: refetchTypes } = useQuery({
    queryKey: ["meeting-types", profile?.id],
    queryFn: async () => {
      const { data } = await supabase.from("meeting_types").select("*")
        .eq("profile_id", profile?.id || "").order("sort_order");
      return data || [];
    },
    enabled: !!profile?.id,
  });

  // ── Availability ───────────────────────────────────────────────────
  const { data: availability = [], refetch: refetchAvail } = useQuery({
    queryKey: ["availability", profile?.id],
    queryFn: async () => {
      const { data } = await supabase.from("employee_availability").select("*")
        .eq("profile_id", profile?.id || "").order("day_of_week");
      return data || [];
    },
    enabled: !!profile?.id,
  });

  // ── Booking page ───────────────────────────────────────────────────
  const { data: bookingPage, refetch: refetchBP } = useQuery({
    queryKey: ["booking-page", profile?.id],
    queryFn: async () => {
      const { data } = await supabase.from("booking_pages").select("*")
        .eq("profile_id", profile?.id || "").maybeSingle();
      return data as BookingPage | null;
    },
    enabled: !!profile?.id,
  });

  // ── Status mutation ────────────────────────────────────────────────
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await supabase.from("meetings").update({ status, ...(status === "cancelled" ? { cancelled_at: new Date().toISOString() } : {}) }).eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meetings"] }); toast.success("تم تحديث الموعد"); },
  });

  // ── Init availability if empty ─────────────────────────────────────
  useEffect(() => {
    if (profile?.id && orgId && availability.length === 0) {
      supabase.rpc("create_default_availability", { p_profile_id: profile.id, p_org_id: orgId }).then(() => refetchAvail());
    }
  }, [profile?.id, orgId, availability.length]);

  // ── Group meetings by date ─────────────────────────────────────────
  const grouped = meetings.reduce<Record<string, Meeting[]>>((acc, m) => {
    const key = format(new Date(m.start_time), "yyyy-MM-dd");
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  const bookingUrl = bookingPage ? `${window.location.origin}/book/${bookingPage.slug}` : null;

  const copyLink = () => {
    if (!bookingUrl) return;
    navigator.clipboard.writeText(bookingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("تم نسخ الرابط");
  };

  const todayMeetings = meetings.filter(m => isToday(new Date(m.start_time)));
  const upcomingCount = meetings.filter(m => m.status === "confirmed" && !isPast(new Date(m.start_time))).length;

  return (
    <div className="flex flex-col h-full bg-gray-50/50" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" /> المواعيد
          </h1>
          <p className="text-[12px] text-gray-400 mt-0.5">
            {upcomingCount > 0 ? `${upcomingCount} موعد قادم` : "لا توجد مواعيد قادمة"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {bookingUrl && (
            <button onClick={copyLink}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-primary/20 rounded-xl text-primary hover:bg-primary/5 transition-colors">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
              {copied ? "تم النسخ" : "رابط الحجز"}
            </button>
          )}
          <NewMeetingButton profileId={profile?.id} orgId={orgId} onCreated={() => qc.invalidateQueries({ queryKey: ["meetings"] })} />
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b px-6 flex gap-0">
        {[
          { id: "meetings", label: "📅 المواعيد" },
          { id: "availability", label: "⏰ التوفر" },
          { id: "types", label: "🏷️ أنواع الاجتماعات" },
          { id: "link", label: "🔗 رابط الحجز" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={cn("px-4 py-3 text-[12px] font-medium border-b-2 transition-colors whitespace-nowrap",
              tab === t.id ? "border-primary text-primary" : "border-transparent text-gray-400 hover:text-gray-700")}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* ── MEETINGS TAB ── */}
        {tab === "meetings" && (
          <div className="max-w-3xl mx-auto space-y-4">
            {/* View filters */}
            <div className="flex gap-2 flex-wrap">
              {[
                { id: "upcoming", label: "القادمة" },
                { id: "all", label: "جميع مواعيدي" },
                ...(isSupervisorOrAdmin ? [{ id: "team", label: "مواعيد الفريق" }] : []),
              ].map(v => (
                <button key={v.id} onClick={() => setViewMode(v.id as any)}
                  className={cn("text-[12px] px-4 py-1.5 rounded-xl border font-medium transition-colors",
                    viewMode === v.id ? "bg-primary text-white border-primary" : "bg-white border-gray-200 text-gray-600 hover:border-primary/30")}>
                  {v.label}
                </button>
              ))}
              {/* Today summary */}
              {todayMeetings.length > 0 && (
                <div className="mr-auto flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-xl px-3 py-1.5 text-[11px] text-blue-700 font-medium">
                  <Clock className="w-3 h-3" /> اليوم: {todayMeetings.length} موعد
                </div>
              )}
            </div>

            {loadingMeetings ? (
              <div className="flex items-center justify-center h-40 text-gray-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> جاري التحميل...
              </div>
            ) : Object.keys(grouped).length === 0 ? (
              <div className="bg-white border border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center h-48 text-center">
                <Calendar className="w-10 h-10 text-gray-200 mb-3" />
                <p className="text-gray-500 font-medium">لا توجد مواعيد</p>
                <p className="text-gray-400 text-[12px] mt-1">أضف موعداً جديداً أو شارك رابط الحجز مع عملائك</p>
              </div>
            ) : (
              Object.entries(grouped).map(([dateKey, dayMeetings]) => {
                const d = new Date(dateKey + "T12:00:00");
                const label = isToday(d) ? "اليوم" : isTomorrow(d) ? "غداً" : format(d, "EEEE d MMMM yyyy", { locale: ar });
                return (
                  <div key={dateKey}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn("text-[11px] font-bold px-2.5 py-1 rounded-full",
                        isToday(d) ? "bg-primary text-white" : "bg-gray-100 text-gray-600")}>
                        {label}
                      </span>
                      <div className="flex-1 h-px bg-gray-100" />
                      <span className="text-[10px] text-gray-400">{dayMeetings.length} موعد</span>
                    </div>
                    <div className="space-y-2">
                      {dayMeetings.map(m => (
                        <MeetingCard key={m.id} meeting={m}
                          onAction={(id, action) => updateStatus.mutate({ id, status: action })} />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── AVAILABILITY TAB ── */}
        {tab === "availability" && (
          <AvailabilityEditor
            availability={availability}
            profileId={profile?.id || ""}
            orgId={orgId || ""}
            onSaved={refetchAvail}
          />
        )}

        {/* ── MEETING TYPES TAB ── */}
        {tab === "types" && (
          <MeetingTypesEditor
            types={meetingTypes}
            profileId={profile?.id || ""}
            orgId={orgId || ""}
            onSaved={refetchTypes}
          />
        )}

        {/* ── BOOKING LINK TAB ── */}
        {tab === "link" && (
          <BookingLinkEditor
            bookingPage={bookingPage || null}
            profileId={profile?.id || ""}
            orgId={orgId || ""}
            onSaved={refetchBP}
          />
        )}
      </div>
    </div>
  );
};

// ─── New Meeting Button ────────────────────────────────────────────────────────
const NewMeetingButton = ({ profileId, orgId, onCreated }: { profileId?: string; orgId?: string | null; onCreated: () => void }) => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ customer_name: "", customer_phone: "", title: "", start_time: "", duration: "30", notes: "" });
  const [saving, setSaving] = useState(false);
  const { data: types = [] } = useQuery({
    queryKey: ["meeting-types", profileId],
    queryFn: async () => (await supabase.from("meeting_types").select("*").eq("profile_id", profileId || "").eq("is_active", true)).data || [],
    enabled: !!profileId,
  });

  const save = async () => {
    if (!form.customer_name || !form.start_time) return toast.error("الاسم والوقت مطلوبان");
    setSaving(true);
    const start = new Date(form.start_time);
    const end = new Date(start.getTime() + Number(form.duration) * 60_000);
    await supabase.from("meetings").insert({
      org_id: orgId, profile_id: profileId,
      customer_name: form.customer_name, customer_phone: form.customer_phone || null,
      title: form.title || `اجتماع — ${form.customer_name}`,
      notes: form.notes || null,
      start_time: start.toISOString(), end_time: end.toISOString(),
      booking_source: "manual",
    });
    setSaving(false);
    setOpen(false);
    setForm({ customer_name: "", customer_phone: "", title: "", start_time: "", duration: "30", notes: "" });
    onCreated();
    toast.success("✅ تم إضافة الموعد");
  };

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="flex items-center gap-1.5 bg-primary text-white text-xs px-3 py-1.5 rounded-xl hover:bg-primary/90 transition-colors font-medium shadow-sm">
      <Plus className="w-3.5 h-3.5" /> موعد جديد
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" dir="rtl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">إضافة موعد جديد</h2>
          <button onClick={() => setOpen(false)}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 mb-1 block">اسم العميل *</label>
              <input value={form.customer_name} onChange={e => setForm(p => ({ ...p, customer_name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50" placeholder="أحمد محمد" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 mb-1 block">رقم الهاتف</label>
              <input value={form.customer_phone} onChange={e => setForm(p => ({ ...p, customer_phone: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50" placeholder="+966..." dir="ltr" />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-1 block">عنوان الاجتماع</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50" placeholder="مناقشة العرض التقديمي..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 mb-1 block">التاريخ والوقت *</label>
              <input type="datetime-local" value={form.start_time} onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50" dir="ltr" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 mb-1 block">المدة</label>
              <select value={form.duration} onChange={e => setForm(p => ({ ...p, duration: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white">
                {[15,30,45,60,90,120].map(d => <option key={d} value={d}>{d} دقيقة</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-1 block">ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50 resize-none" />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={saving}
            className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} إضافة الموعد
          </button>
          <button onClick={() => setOpen(false)} className="px-4 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">إلغاء</button>
        </div>
      </div>
    </div>
  );
};

// ─── Availability Editor ──────────────────────────────────────────────────────
const AvailabilityEditor = ({ availability, profileId, orgId, onSaved }: { availability: Availability[]; profileId: string; orgId: string; onSaved: () => void }) => {
  const [local, setLocal] = useState<Availability[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (availability.length > 0) setLocal([...availability]);
  }, [availability]);

  const update = (idx: number, field: keyof Availability, val: any) => {
    setLocal(prev => prev.map((a, i) => i === idx ? { ...a, [field]: val } : a));
  };

  const save = async () => {
    setSaving(true);
    for (const a of local) {
      await supabase.from("employee_availability").upsert({
        id: a.id, profile_id: profileId, org_id: orgId,
        day_of_week: a.day_of_week, start_time: a.start_time, end_time: a.end_time, is_active: a.is_active,
      }, { onConflict: "profile_id,day_of_week" });
    }
    setSaving(false);
    onSaved();
    toast.success("✅ تم حفظ أوقات التوفر");
  };

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="bg-white border border-border rounded-2xl p-5">
        <h2 className="text-sm font-bold mb-4 flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> أوقات التوفر الأسبوعية</h2>
        <div className="space-y-3">
          {local.map((a, i) => (
            <div key={a.day_of_week} className={cn("flex items-center gap-3 p-3 rounded-xl border transition-all",
              a.is_active ? "border-primary/20 bg-primary/3" : "border-gray-100 bg-gray-50/50 opacity-60")}>
              <button onClick={() => update(i, "is_active", !a.is_active)} className="shrink-0">
                {a.is_active
                  ? <ToggleRight className="w-8 h-8 text-primary" />
                  : <ToggleLeft className="w-8 h-8 text-gray-300" />}
              </button>
              <span className="w-16 text-[13px] font-bold text-gray-700 shrink-0">{DAY_NAMES[a.day_of_week]}</span>
              <div className="flex items-center gap-2 flex-1">
                <input type="time" value={a.start_time} onChange={e => update(i, "start_time", e.target.value)}
                  disabled={!a.is_active}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-[12px] focus:outline-none focus:border-primary/40 bg-white disabled:opacity-40" dir="ltr" />
                <span className="text-gray-400 text-[11px]">—</span>
                <input type="time" value={a.end_time} onChange={e => update(i, "end_time", e.target.value)}
                  disabled={!a.is_active}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-[12px] focus:outline-none focus:border-primary/40 bg-white disabled:opacity-40" dir="ltr" />
              </div>
            </div>
          ))}
        </div>
        <button onClick={save} disabled={saving}
          className="mt-4 w-full bg-primary text-white rounded-xl py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} حفظ التوفر
        </button>
      </div>
    </div>
  );
};

// ─── Meeting Types Editor ─────────────────────────────────────────────────────
const COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#8b5cf6","#f97316","#14b8a6"];

const MeetingTypesEditor = ({ types, profileId, orgId, onSaved }: { types: MeetingType[]; profileId: string; orgId: string; onSaved: () => void }) => {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", duration_minutes: 30, color: COLORS[0], location: "" });
  const [saving, setSaving] = useState(false);

  const saveNew = async () => {
    if (!form.name) return toast.error("الاسم مطلوب");
    setSaving(true);
    await supabase.from("meeting_types").insert({ ...form, profile_id: profileId, org_id: orgId, sort_order: types.length });
    setSaving(false);
    setAdding(false);
    setForm({ name: "", description: "", duration_minutes: 30, color: COLORS[0], location: "" });
    onSaved();
    toast.success("✅ تم إضافة نوع الاجتماع");
  };

  const toggle = async (id: string, val: boolean) => {
    await supabase.from("meeting_types").update({ is_active: val }).eq("id", id);
    onSaved();
  };

  const del = async (id: string) => {
    await supabase.from("meeting_types").delete().eq("id", id);
    onSaved();
    toast.success("تم الحذف");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      {types.map(t => (
        <div key={t.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: t.color + "22" }}>
            <span className="text-lg">📋</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-gray-900">{t.name}</p>
            <p className="text-[11px] text-gray-400">{t.duration_minutes} دقيقة{t.location ? ` • ${t.location}` : ""}</p>
            {t.description && <p className="text-[11px] text-gray-500 mt-0.5">{t.description}</p>}
          </div>
          <button onClick={() => toggle(t.id, !t.is_active)}>
            {t.is_active ? <ToggleRight className="w-7 h-7 text-primary" /> : <ToggleLeft className="w-7 h-7 text-gray-300" />}
          </button>
          <button onClick={() => del(t.id)} className="w-7 h-7 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 flex items-center justify-center transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      {adding ? (
        <div className="bg-white border border-primary/20 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold">نوع اجتماع جديد</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 mb-1 block">الاسم *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50" placeholder="استشارة 30 دقيقة" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 mb-1 block">المدة (دقائق)</label>
              <select value={form.duration_minutes} onChange={e => setForm(p => ({ ...p, duration_minutes: Number(e.target.value) }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white">
                {[15,30,45,60,90,120].map(d => <option key={d} value={d}>{d} دقيقة</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-1 block">الوصف</label>
            <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50" placeholder="وصف مختصر للاجتماع..." />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-1 block">الرابط / المكان (اختياري)</label>
            <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50" placeholder="Zoom / Google Meet / عنوان..." dir="ltr" />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-2 block">اللون</label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                  className={cn("w-7 h-7 rounded-full border-2 transition-transform", form.color === c ? "border-gray-900 scale-110" : "border-transparent")}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveNew} disabled={saving}
              className="flex-1 bg-primary text-white rounded-xl py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-1">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} حفظ
            </button>
            <button onClick={() => setAdding(false)} className="px-4 border border-gray-200 rounded-xl text-sm text-gray-600">إلغاء</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="w-full border-2 border-dashed border-gray-200 rounded-2xl py-4 text-[13px] text-gray-400 hover:border-primary/30 hover:text-primary transition-colors flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> إضافة نوع اجتماع
        </button>
      )}
    </div>
  );
};

// ─── Booking Link Editor ──────────────────────────────────────────────────────
const BookingLinkEditor = ({ bookingPage, profileId, orgId, onSaved }: { bookingPage: BookingPage | null; profileId: string; orgId: string; onSaved: () => void }) => {
  const [form, setForm] = useState({
    slug: "", title: "حجز موعد", bio: "",
    advance_booking_days: 30, min_notice_hours: 1, is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (bookingPage) setForm({ slug: bookingPage.slug, title: bookingPage.title, bio: bookingPage.bio || "", advance_booking_days: bookingPage.advance_booking_days, min_notice_hours: bookingPage.min_notice_hours, is_active: bookingPage.is_active });
    else if (profileId) {
      supabase.from("profiles").select("full_name").eq("id", profileId).maybeSingle().then(({ data }) => {
        if (data?.full_name) setForm(p => ({ ...p, slug: data.full_name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + "-" + profileId.slice(0, 6) }));
      });
    }
  }, [bookingPage, profileId]);

  const save = async () => {
    if (!form.slug) return toast.error("الرابط مطلوب");
    setSaving(true);
    if (bookingPage) {
      await supabase.from("booking_pages").update({ ...form, updated_at: new Date().toISOString() }).eq("id", bookingPage.id);
    } else {
      await supabase.from("booking_pages").insert({ ...form, profile_id: profileId, org_id: orgId });
    }
    setSaving(false);
    onSaved();
    toast.success("✅ تم حفظ صفحة الحجز");
  };

  const url = form.slug ? `${window.location.origin}/book/${form.slug}` : null;

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="bg-white border border-border rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-bold flex items-center gap-2"><Globe className="w-4 h-4 text-primary" /> صفحة الحجز الخاصة بك</h2>

        {url && (
          <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2.5">
            <span className="text-[12px] text-primary font-mono flex-1 truncate" dir="ltr">{url}</span>
            <button onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); toast.success("تم النسخ"); }}
              className="shrink-0 text-primary hover:text-primary/70">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
            <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-primary hover:text-primary/70">
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-gray-500 mb-1 block">رابط الحجز (slug) *</label>
            <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-primary/40">
              <span className="px-3 py-2 text-[11px] text-gray-400 bg-gray-50 border-l border-gray-200 whitespace-nowrap">/book/</span>
              <input value={form.slug} onChange={e => setForm(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                className="flex-1 px-3 py-2 text-sm focus:outline-none bg-white" dir="ltr" placeholder="ahmed-sales" />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-1 block">عنوان الصفحة</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50" />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 mb-1 block">نبذة عنك (اختياري)</label>
            <textarea value={form.bio} onChange={e => setForm(p => ({ ...p, bio: e.target.value }))}
              rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50 resize-none" placeholder="مستشار مبيعات متخصص في..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 mb-1 block">أيام الحجز المسبق</label>
              <select value={form.advance_booking_days} onChange={e => setForm(p => ({ ...p, advance_booking_days: Number(e.target.value) }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white">
                {[7,14,30,60,90].map(d => <option key={d} value={d}>{d} يوم</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500 mb-1 block">إشعار مسبق</label>
              <select value={form.min_notice_hours} onChange={e => setForm(p => ({ ...p, min_notice_hours: Number(e.target.value) }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white">
                {[0,1,2,4,8,24].map(h => <option key={h} value={h}>{h === 0 ? "بدون" : `${h} ساعة`}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <span className="text-[12px] font-medium text-gray-700">تفعيل صفحة الحجز</span>
            <button onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}>
              {form.is_active ? <ToggleRight className="w-8 h-8 text-primary" /> : <ToggleLeft className="w-8 h-8 text-gray-300" />}
            </button>
          </div>
        </div>

        <button onClick={save} disabled={saving}
          className="w-full bg-primary text-white rounded-xl py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {bookingPage ? "حفظ التغييرات" : "إنشاء صفحة الحجز"}
        </button>
      </div>
    </div>
  );
};

export default MeetingsPage;
