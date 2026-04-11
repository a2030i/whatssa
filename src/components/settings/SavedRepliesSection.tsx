import { useState, useEffect } from "react";
import { Zap, Plus, Pencil, Trash2, Search, Loader2, MessageSquare } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface SavedReply {
  id: string;
  shortcut: string;
  title: string;
  content: string;
  category: string;
}

const CATEGORIES = ["عام", "ترحيب", "متابعة", "شحن", "دفع", "شكاوى", "إغلاق"];

const SavedRepliesSection = () => {
  const { orgId } = useAuth();
  const [replies, setReplies] = useState<SavedReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SavedReply | null>(null);
  const [form, setForm] = useState({ shortcut: "", title: "", content: "", category: "عام" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await supabase
      .from("saved_replies")
      .select("id, shortcut, title, content, category")
      .eq("org_id", orgId)
      .order("category")
      .order("shortcut");
    setReplies((data as SavedReply[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [orgId]);

  const openNew = () => {
    setEditing(null);
    setForm({ shortcut: "", title: "", content: "", category: "عام" });
    setDialogOpen(true);
  };

  const openEdit = (r: SavedReply) => {
    setEditing(r);
    setForm({ shortcut: r.shortcut, title: r.title, content: r.content, category: r.category });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!orgId || !form.shortcut.trim() || !form.title.trim() || !form.content.trim()) {
      toast.error("جميع الحقول مطلوبة");
      return;
    }
    setSaving(true);
    if (editing) {
      const { error } = await supabase
        .from("saved_replies")
        .update({ shortcut: form.shortcut.trim(), title: form.title.trim(), content: form.content.trim(), category: form.category, updated_at: new Date().toISOString() })
        .eq("id", editing.id);
      if (error) toast.error("فشل التحديث");
      else toast.success("تم التحديث");
    } else {
      const { error } = await supabase
        .from("saved_replies")
        .insert({ org_id: orgId, shortcut: form.shortcut.trim(), title: form.title.trim(), content: form.content.trim(), category: form.category });
      if (error) toast.error("فشل الإضافة");
      else toast.success("تمت الإضافة");
    }
    setSaving(false);
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("saved_replies").delete().eq("id", id);
    if (error) toast.error("فشل الحذف");
    else { toast.success("تم الحذف"); load(); }
  };

  const filtered = replies.filter(r =>
    !search || r.shortcut.includes(search) || r.title.includes(search) || r.content.includes(search)
  );

  const grouped = filtered.reduce<Record<string, SavedReply[]>>((acc, r) => {
    const cat = r.category || "عام";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(r);
    return acc;
  }, {});

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">الردود السريعة</h3>
          <Badge variant="secondary" className="text-[10px]">{replies.length}</Badge>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1" onClick={openNew}>
          <Plus className="w-3 h-3" /> إضافة
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        ردود جاهزة يمكن استخدامها بسرعة أثناء المحادثة بكتابة <code className="bg-secondary px-1 rounded text-primary font-mono">/اختصار</code> في حقل الرسالة
      </p>

      {replies.length > 5 && (
        <div className="relative mb-3">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="بحث في الردود..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pr-9 h-8 text-xs bg-secondary border-0"
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : replies.length === 0 ? (
        <div className="text-center py-8">
          <MessageSquare className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">لا توجد ردود سريعة بعد</p>
          <Button size="sm" variant="outline" className="mt-3 h-7 text-xs" onClick={openNew}>
            <Plus className="w-3 h-3 ml-1" /> أضف أول رد
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5">{cat}</p>
              <div className="space-y-1.5">
                {items.map(r => (
                  <div key={r.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors group">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Zap className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">/{r.shortcut}</code>
                        <span className="text-xs font-medium">{r.title}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{r.content}</p>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button size="icon" variant="ghost" className="w-6 h-6" onClick={() => openEdit(r)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="w-6 h-6 text-destructive hover:text-destructive" onClick={() => handleDelete(r.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm">{editing ? "تعديل رد سريع" : "إضافة رد سريع"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">الاختصار</Label>
                <Input
                  value={form.shortcut}
                  onChange={e => setForm(f => ({ ...f, shortcut: e.target.value.replace(/\s/g, "") }))}
                  placeholder="مثال: مرحبا"
                  className="h-8 text-xs bg-secondary border-0 font-mono"
                  dir="rtl"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">التصنيف</Label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full h-8 text-xs bg-secondary border-0 rounded-md px-2"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">العنوان</Label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="مثال: رسالة ترحيبية"
                className="h-8 text-xs bg-secondary border-0"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">محتوى الرد</Label>
              <Textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="أهلاً بك {name}! كيف يمكنني مساعدتك؟"
                className="text-xs bg-secondary border-0 min-h-[80px]"
              />
              <div className="flex flex-wrap gap-1.5 mt-1">
                {["{name}", "{phone}", "{agent}", "{date}", "{time}"].map(v => (
                  <button key={v} type="button" onClick={() => setForm(f => ({ ...f, content: f.content + v }))}
                    className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono hover:bg-primary/20 transition-colors">
                    {v}
                  </button>
                ))}
                <span className="text-[10px] text-muted-foreground self-center">— انقر للإدراج</span>
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full h-8 text-xs">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : editing ? "حفظ التعديلات" : "إضافة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SavedRepliesSection;

