import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, BookOpen, Search, Save, X, FolderOpen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORIES = [
  { value: "general", label: "عام" },
  { value: "products", label: "المنتجات" },
  { value: "shipping", label: "الشحن والتوصيل" },
  { value: "payment", label: "الدفع" },
  { value: "returns", label: "الإرجاع والاستبدال" },
  { value: "support", label: "الدعم الفني" },
  { value: "faq", label: "أسئلة شائعة" },
  { value: "policy", label: "السياسات" },
];

interface KBEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  is_active: boolean;
  created_at: string;
}

const KnowledgeBaseManager = () => {
  const { orgId } = useAuth();
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<KBEntry | null>(null);
  const [form, setForm] = useState({ title: "", content: "", category: "general" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (orgId) loadEntries();
  }, [orgId]);

  const loadEntries = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ai_knowledge_base" as any)
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    setEntries((data as any) || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("العنوان والمحتوى مطلوبان");
      return;
    }
    setSaving(true);
    if (editing) {
      const { error } = await supabase
        .from("ai_knowledge_base" as any)
        .update({ title: form.title, content: form.content, category: form.category, updated_at: new Date().toISOString() } as any)
        .eq("id", editing.id);
      if (error) toast.error("فشل التحديث");
      else toast.success("تم التحديث");
    } else {
      const { error } = await supabase
        .from("ai_knowledge_base" as any)
        .insert({ org_id: orgId, title: form.title, content: form.content, category: form.category } as any);
      if (error) toast.error("فشل الإضافة");
      else toast.success("تمت الإضافة");
    }
    setSaving(false);
    setShowDialog(false);
    setEditing(null);
    setForm({ title: "", content: "", category: "general" });
    loadEntries();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("ai_knowledge_base" as any).delete().eq("id", id);
    if (error) toast.error("فشل الحذف");
    else { toast.success("تم الحذف"); loadEntries(); }
  };

  const handleToggle = async (id: string, active: boolean) => {
    await supabase.from("ai_knowledge_base" as any).update({ is_active: active } as any).eq("id", id);
    setEntries(prev => prev.map(e => e.id === id ? { ...e, is_active: active } : e));
  };

  const openEdit = (entry: KBEntry) => {
    setEditing(entry);
    setForm({ title: entry.title, content: entry.content, category: entry.category });
    setShowDialog(true);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ title: "", content: "", category: "general" });
    setShowDialog(true);
  };

  const filtered = entries.filter(e => {
    const matchSearch = !search || e.title.includes(search) || e.content.includes(search);
    const matchCat = filterCat === "all" || e.category === filterCat;
    return matchSearch && matchCat;
  });

  const catLabel = (cat: string) => CATEGORIES.find(c => c.value === cat)?.label || cat;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            قاعدة المعرفة
          </h2>
          <p className="text-xs text-muted-foreground">المحتوى الذي يستخدمه AI للرد على العملاء</p>
        </div>
        <Button size="sm" onClick={openNew} className="gap-1">
          <Plus className="w-4 h-4" /> إضافة محتوى
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 h-9 text-sm" />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-[140px] h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            {CATEGORIES.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="flex gap-3">
        <div className="bg-card rounded-lg border border-border px-3 py-2 text-center flex-1">
          <p className="text-lg font-bold text-primary">{entries.length}</p>
          <p className="text-[10px] text-muted-foreground">إجمالي المحتوى</p>
        </div>
        <div className="bg-card rounded-lg border border-border px-3 py-2 text-center flex-1">
          <p className="text-lg font-bold text-primary">{entries.filter(e => e.is_active).length}</p>
          <p className="text-[10px] text-muted-foreground">مفعّل</p>
        </div>
        <div className="bg-card rounded-lg border border-border px-3 py-2 text-center flex-1">
          <p className="text-lg font-bold">{new Set(entries.map(e => e.category)).size}</p>
          <p className="text-[10px] text-muted-foreground">تصنيفات</p>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-border">
          <FolderOpen className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">لا يوجد محتوى بعد</p>
          <p className="text-xs text-muted-foreground mt-1">أضف معلومات مؤسستك ليستخدمها AI في الرد</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={openNew}>
            <Plus className="w-4 h-4 ml-1" /> إضافة أول محتوى
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(entry => (
            <div key={entry.id} className={`bg-card rounded-xl border p-3 transition-all ${entry.is_active ? "border-border" : "border-border/50 opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-bold truncate">{entry.title}</h4>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{catLabel(entry.category)}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{entry.content}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Switch checked={entry.is_active} onCheckedChange={v => handleToggle(entry.id, v)} />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(entry)}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(entry.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل محتوى" : "إضافة محتوى جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block">العنوان</label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="مثال: سياسة الإرجاع" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">التصنيف</label>
              <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">المحتوى</label>
              <Textarea
                value={form.content}
                onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                placeholder="اكتب المعلومات التي تريد أن يعرفها AI ويرد بها على العملاء..."
                rows={8}
              />
              <p className="text-[10px] text-muted-foreground mt-1">اكتب بالتفصيل — كل ما تضيفه هنا سيستخدمه AI للرد بدقة</p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1 gap-1">
                <Save className="w-4 h-4" />
                {saving ? "جاري الحفظ..." : "حفظ"}
              </Button>
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KnowledgeBaseManager;
