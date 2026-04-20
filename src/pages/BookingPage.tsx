import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { CheckCircle2, ChevronRight, ChevronLeft, Clock, Calendar, User, Phone, Mail, MessageSquare, Loader2, AlertCircle, X } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://ovbrrumnqfvtgmqsscat.supabase.co";
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92YnJydW1ucWZ2dGdtcXNzY2F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzc4ODQsImV4cCI6MjA5MDY1Mzg4NH0.-ed8-nrAbfO1lMm9Rc5bjwsIzmonunVKkcwRY586SrQ";

async function callBookingFn(body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/meeting-book`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": ANON_KEY, "Authorization": `Bearer ${ANON_KEY}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

type MeetingType = { id: string; name: string; duration_minutes: number; description: string | null; color: string; price: number | null; is_active: boolean };
type BookingPageData = { id: string; slug: string; title: string; bio: string | null; advance_booking_days: number; min_notice_hours: number; profile_id: string; profiles: { full_name: string; avatar_url: string | null } };

const TZ = "Asia/Riyadh";
const MONTH_NAMES_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const DAY_NAMES_AR = ["أحد","اثنين","ثلاثاء","أربعاء","خميس","جمعة","سبت"];

// Returns today's date string (YYYY-MM-DD) in Riyadh timezone
function getTodayRiyadh(): Date {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  const d = parts.find(p => p.type === "day")!.value;
  return new Date(`${y}-${m}-${d}`);
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

function formatDateAr(iso: string): string {
  return new Date(iso).toLocaleDateString("ar-SA-u-ca-gregory", {
    timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// ── Mini Calendar ─────────────────────────────────────────────────────────────
function MiniCalendar({ value, onChange, minDate, maxDate }: { value: string | null; onChange: (d: string) => void; minDate: Date; maxDate: Date }) {
  const today = getTodayRiyadh();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

  const canPrev = new Date(viewYear, viewMonth - 1, 1) >= new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const canNext = new Date(viewYear, viewMonth + 1, 1) <= new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 1);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} disabled={!canPrev} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-gray-800">{MONTH_NAMES_AR[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} disabled={!canNext} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-gray-400 mb-2">
        {DAY_NAMES_AR.map(d => <span key={d}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const date = new Date(viewYear, viewMonth, day);
          const dateStr = formatDate(date);
          const isSelected = dateStr === value;
          const isToday = formatDate(date) === formatDate(today);
          const disabled = date < minDate || date > maxDate;
          return (
            <button
              key={i}
              disabled={disabled}
              onClick={() => onChange(dateStr)}
              className={cn(
                "h-9 w-full rounded-xl text-sm font-medium transition-all",
                disabled && "text-gray-200 cursor-not-allowed",
                !disabled && !isSelected && "text-gray-700 hover:bg-emerald-50 hover:text-emerald-700",
                isToday && !isSelected && "ring-1 ring-emerald-300 text-emerald-600",
                isSelected && "bg-emerald-500 text-white shadow-md"
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1 justify-center mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            i < step ? "bg-emerald-500 w-8" : i === step ? "bg-emerald-400 w-5" : "bg-gray-200 w-5"
          )}
        />
      ))}
    </div>
  );
}

export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState<BookingPageData | null>(null);
  const [types, setTypes] = useState<MeetingType[]>([]);

  const [step, setStep] = useState(0); // 0: type, 1: date, 2: time, 3: info, 4: confirm
  const [selectedType, setSelectedType] = useState<MeetingType | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState<{ meeting: { start_time: string; end_time: string; title: string; meeting_url?: string | null } } | null>(null);

  // Load page data
  useEffect(() => {
    if (!slug) return;
    callBookingFn({ action: "get_page", slug }).then(data => {
      if (data.error) { setError(data.error); setLoading(false); return; }
      setPage(data.page);
      setTypes((data.types || []).filter((t: MeetingType) => t.is_active));
      setLoading(false);
    }).catch(() => { setError("حدث خطأ أثناء تحميل الصفحة"); setLoading(false); });
  }, [slug]);

  // Load slots when date or type changes
  useEffect(() => {
    if (!selectedDate || !selectedType || !page) return;
    setSlotsLoading(true);
    setSlots([]);
    setSelectedSlot(null);
    callBookingFn({ action: "get_page", slug, date: selectedDate, duration_minutes: selectedType.duration_minutes }).then(data => {
      setSlots(data.slots || []);
      setSlotsLoading(false);
    });
  }, [selectedDate, selectedType]);

  const handleBook = async () => {
    if (!page || !selectedType || !selectedSlot || !form.name) return;
    setSubmitting(true);
    const data = await callBookingFn({
      action: "book",
      profile_id: page.profile_id,
      meeting_type_id: selectedType.id,
      start_time: selectedSlot,
      customer_name: form.name,
      customer_phone: form.phone || null,
      customer_email: form.email || null,
      notes: form.notes || null,
    });
    setSubmitting(false);
    if (data.error) { setError(data.error); return; }
    setBooked(data);
  };

  const today = getTodayRiyadh();
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + (page?.advance_booking_days || 30));

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50">
      <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
    </div>
  );

  if (error && !booked) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-gray-600">{error}</p>
      </div>
    </div>
  );

  // ── Booking success ───────────────────────────────────────────────────────
  if (booked) return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-9 h-9 text-emerald-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">تم حجز موعدك!</h2>
        <p className="text-gray-500 text-sm mb-6">سيتواصل معك {page?.profiles.full_name} قريباً للتأكيد</p>
        <div className="bg-emerald-50 rounded-xl p-4 text-right space-y-2 mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Calendar className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{formatDateAr(booked.meeting.start_time)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Clock className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{formatTime(booked.meeting.start_time)} — {formatTime(booked.meeting.end_time)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <User className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{selectedType?.name} مع {page?.profiles.full_name}</span>
          </div>
        </div>
        {booked.meeting.meeting_url && (
          <a href={booked.meeting.meeting_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm transition-all mb-4 shadow-md shadow-blue-100">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M15 8v8H5V8h10m1-2H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4V7a1 1 0 00-1-1z"/></svg>
            انضم للاجتماع الآن
          </a>
        )}
        <p className="text-[11px] text-gray-400">ستصلك رسالة تأكيد على واتساب إن أمكن</p>
      </div>
    </div>
  );

  // ── Main booking flow ─────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      {/* Header */}
      <div className="max-w-lg mx-auto px-4 pt-10 pb-6 text-center">
        {page?.profiles.avatar_url ? (
          <img src={page.profiles.avatar_url} alt="" className="w-16 h-16 rounded-full mx-auto mb-3 object-cover ring-2 ring-emerald-200" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3 text-2xl font-bold text-emerald-600">
            {page?.profiles.full_name?.slice(0, 1) || "؟"}
          </div>
        )}
        <h1 className="text-xl font-bold text-gray-800">{page?.title || page?.profiles.full_name}</h1>
        {page?.bio && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{page.bio}</p>}
      </div>

      <div className="max-w-lg mx-auto px-4 pb-16">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <StepBar step={step} total={4} />

          {/* ── Step 0: Select meeting type ─────────────── */}
          {step === 0 && (
            <div>
              <h3 className="text-base font-semibold text-gray-800 mb-4">اختر نوع الاجتماع</h3>
              <div className="space-y-3">
                {types.length === 0 && (
                  <p className="text-center text-gray-400 py-8 text-sm">لا توجد أنواع اجتماعات متاحة</p>
                )}
                {types.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedType(t); setStep(1); }}
                    className={cn(
                      "w-full text-right p-4 rounded-xl border-2 transition-all hover:shadow-md",
                      selectedType?.id === t.id ? "border-emerald-400 bg-emerald-50" : "border-gray-100 hover:border-emerald-200"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg shrink-0 mt-0.5" style={{ backgroundColor: t.color + "20" }}>
                        <div className="w-full h-full rounded-lg flex items-center justify-center text-lg">📅</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-gray-800 text-sm">{t.name}</span>
                          <span className="text-xs text-gray-400 shrink-0 flex items-center gap-1">
                            <Clock className="w-3 h-3" />{t.duration_minutes} دقيقة
                          </span>
                        </div>
                        {t.description && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{t.description}</p>}
                        {t.price != null && t.price > 0 && (
                          <span className="mt-1.5 inline-block text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{t.price} ر.س</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 1: Select date ─────────────────────── */}
          {step === 1 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setStep(0)} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                </button>
                <h3 className="text-base font-semibold text-gray-800">اختر التاريخ</h3>
              </div>
              <div className="mb-1">
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-xl mb-4">
                  <span className="text-lg">📅</span>
                  <span className="text-sm font-medium text-emerald-700">{selectedType?.name}</span>
                  <span className="text-xs text-emerald-500 mr-auto flex items-center gap-1"><Clock className="w-3 h-3" />{selectedType?.duration_minutes} دقيقة</span>
                </div>
                <MiniCalendar value={selectedDate} onChange={(d) => { setSelectedDate(d); setStep(2); }} minDate={today} maxDate={maxDate} />
              </div>
            </div>
          )}

          {/* ── Step 2: Select time slot ────────────────── */}
          {step === 2 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setStep(1)} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                </button>
                <h3 className="text-base font-semibold text-gray-800">اختر الوقت</h3>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-xl mb-4">
                <span className="text-lg">📅</span>
                <span className="text-sm font-medium text-emerald-700">{selectedDate && formatDateAr(selectedDate + "T12:00:00")}</span>
              </div>
              {slotsLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                </div>
              )}
              {!slotsLoading && slots.length === 0 && (
                <div className="text-center py-10">
                  <p className="text-gray-400 text-sm">لا توجد أوقات متاحة في هذا اليوم</p>
                  <button onClick={() => setStep(1)} className="mt-3 text-emerald-600 text-sm font-medium hover:underline">اختر تاريخاً آخر</button>
                </div>
              )}
              {!slotsLoading && slots.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {slots.map(slot => (
                    <button
                      key={slot}
                      onClick={() => { setSelectedSlot(slot); setStep(3); }}
                      className={cn(
                        "py-2.5 rounded-xl text-sm font-medium border-2 transition-all hover:shadow-sm",
                        selectedSlot === slot ? "border-emerald-400 bg-emerald-500 text-white" : "border-gray-100 text-gray-700 hover:border-emerald-300 hover:bg-emerald-50"
                      )}
                    >
                      {formatTime(slot)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Customer info ───────────────────── */}
          {step === 3 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setStep(2)} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                </button>
                <h3 className="text-base font-semibold text-gray-800">معلوماتك</h3>
              </div>
              {/* Summary */}
              <div className="bg-emerald-50 rounded-xl p-3 mb-5 space-y-1.5 text-sm text-emerald-800">
                <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /><span>{selectedDate && formatDateAr(selectedDate + "T12:00:00")}</span></div>
                <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" /><span>{selectedSlot && formatTime(selectedSlot)} — {selectedType?.duration_minutes} دقيقة</span></div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">الاسم <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                    <input
                      value={form.name}
                      onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="أدخل اسمك الكامل"
                      className="w-full pr-9 pl-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">رقم الواتساب</label>
                  <div className="relative">
                    <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                    <input
                      value={form.phone}
                      onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                      placeholder="966XXXXXXXXX+"
                      dir="ltr"
                      className="w-full pr-9 pl-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 transition-all text-right"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">البريد الإلكتروني</label>
                  <div className="relative">
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                    <input
                      value={form.email}
                      onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                      placeholder="example@mail.com"
                      dir="ltr"
                      className="w-full pr-9 pl-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">ملاحظات (اختياري)</label>
                  <div className="relative">
                    <MessageSquare className="absolute right-3 top-3 w-4 h-4 text-gray-300" />
                    <textarea
                      value={form.notes}
                      onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                      placeholder="أي تفاصيل إضافية..."
                      rows={3}
                      className="w-full pr-9 pl-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 transition-all resize-none"
                    />
                  </div>
                </div>
              </div>
              {error && (
                <div className="mt-3 flex items-center gap-2 text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                  <button className="mr-auto" onClick={() => setError(null)}><X className="w-3.5 h-3.5" /></button>
                </div>
              )}
              <button
                onClick={handleBook}
                disabled={!form.name || submitting}
                className="mt-5 w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-200"
              >
                {submitting ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> جاري الحجز...</span> : "تأكيد الحجز"}
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-6">مدعوم بـ Respondly</p>
      </div>
    </div>
  );
}
