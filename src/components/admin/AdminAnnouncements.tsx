import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Megaphone, Plus, Trash2, ToggleLeft, ToggleRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface Announcement {
  id: string;
  title_ar: string | null;
  content_ar: string | null;
  type: string;
  target_type: string;
  is_active: boolean;
  is_dismissible: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string | null;
}

const TYPE_OPTIONS = [
  { value: "info",    label: "معلومة 🔵", color: "bg-blue-100 text-blue-700" },
  { value: "warning", label: "تحذير 🟡",  color: "bg-amber-100 text-amber-700" },
  { value: "success", label: "نجاح 🟢",   color: "bg-green-100 text-green-700" },
  { value: "error",   label: "خطأ 🔴",    color: "bg-red-100 text-red-700" },
];

const TARGET_OPTIONS = [
  { value: "all",           label: "جميع المنظمات" },
  { value: "specific_orgs", label: "منظمات محددة" },
  { value: "plan",          label: "خطة محددة" },
];

const fetchAnnouncements = async (): Promise<Announcement[]> => {
  const { data, error } = await supabase
    .from("platform_announcements")
    .select("id,title_ar,content_ar,type,target_type,is_active,is_dismissible,starts_at,ends_at,created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

const EMPTY_FORM = { title_ar: "", content_ar: "", type: "info", target_type: "all", is_dismissible: true, starts_at: "", ends_at: "" };

const AdminAnnouncements = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ["platform-announcements"],
    queryFn: fetchAnnouncements,
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("platform_announcements").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform-announcements"] }),
    onError: () => toast.error("فشل التحديث"),
  });

  const deleteAnn = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("platform_announcements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["platform-announcements"] }); },
    onError: () => toast.error("فشل الحذف"),
  });

  const handleSave = async () => {
    if (!form.title_ar.trim() || !form.content_ar.trim()) { toast.error("العنوان والمحتوى مطلوبان"); return; }
    setSaving(true);
    const { error } = await supabase.from("platform_announcements").insert({
      title: form.title_ar,
      title_ar: form.title_ar,
      content: form.content_ar,
      content_ar: form.content_ar,
      type: form.type,
      target_type: form.target_type,
      is_active: true,
      is_dismissible: form.is_dismissible,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
      created_by: user?.id,
    });
    setSaving(false);
    if (error) { toast.error("فشل الحفظ"); return; }
    toast.success("تم نشر الإعلان");
    setShowForm(false);
    setForm(EMPTY_FORM);
    qc.invalidateQueries({ queryKey: ["platform-announcements"] });
  };

  const typeConfig = (type: string) => TYPE_OPTIONS.find(t => t.value === type) || TYPE_OPTIONS[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-primary" />
            إعلانات المنصة
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">إرسال إشعارات وتنبيهات لجميع المنظمات أو محددة منها</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-2 rounded-xl hover:bg-primary/90 transition-colors font-medium">
          <Plus className="w-3.5 h-3.5" /> إعلان جديد
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="border border-border rounded-2xl p-4 bg-muted/20 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold">إنشاء إعلان جديد</p>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-muted-foreground hover:text-foreground" /></button>
          </div>

          <input value={form.title_ar} onChange={e => setForm(f => ({ ...f, title_ar: e.target.value }))}
            placeholder="العنوان..." dir="rtl"
            className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20" />

          <textarea value={form.content_ar} onChange={e => setForm(f => ({ ...f, content_ar: e.target.value }))}
            placeholder="المحتوى..." dir="rtl" rows={3}
            className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">النوع</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none">
                {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">المستهدف</label>
              <select value={form.target_type} onChange={e => setForm(f => ({ ...f, target_type: e.target.value }))}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none">
                {TARGET_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">تاريخ البدء (اختياري)</label>
              <input type="datetime-local" value={form.starts_at} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">تاريخ الانتهاء (اختياري)</label>
              <input type="datetime-local" value={form.ends_at} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))}
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none" />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_dismissible} onChange={e => setForm(f => ({ ...f, is_dismissible: e.target.checked }))}
              className="rounded" />
            <span className="text-sm">قابل للإخفاء من قبل المستخدم</span>
          </label>

          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-primary text-primary-foreground py-2 rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {saving ? "جارٍ النشر..." : "نشر الإعلان"}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 border border-border rounded-xl text-sm text-muted-foreground hover:text-foreground">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">جارٍ التحميل...</div>
      ) : announcements.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
          <Megaphone className="w-10 h-10 mb-2 opacity-20" />
          <p className="text-sm">لا توجد إعلانات</p>
        </div>
      ) : (
        <div className="space-y-2">
          {announcements.map(ann => {
            const tc = typeConfig(ann.type);
            return (
              <div key={ann.id} className={cn("border rounded-2xl p-4 flex items-start gap-3 transition-opacity", !ann.is_active && "opacity-60")}>
                <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-lg shrink-0 mt-0.5", tc.color)}>{tc.label}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold">{ann.title_ar}</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-2">{ann.content_ar}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {TARGET_OPTIONS.find(t => t.value === ann.target_type)?.label}
                    </span>
                    {ann.ends_at && (
                      <span className="text-[10px] text-muted-foreground">
                        ينتهي: {format(new Date(ann.ends_at), "dd/MM/yyyy", { locale: ar })}
                      </span>
                    )}
                    {ann.created_at && (
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(ann.created_at), "dd/MM/yyyy", { locale: ar })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggleActive.mutate({ id: ann.id, is_active: !ann.is_active })}
                    title={ann.is_active ? "إيقاف" : "تفعيل"}>
                    {ann.is_active
                      ? <ToggleRight className="w-5 h-5 text-primary" />
                      : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                  </button>
                  <button onClick={() => { if (confirm("حذف الإعلان؟")) deleteAnn.mutate(ann.id); }}
                    className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminAnnouncements;
