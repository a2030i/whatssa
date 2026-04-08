import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, Edit2, BookOpen, Search, Save, X, FolderOpen, HelpCircle, CheckCircle, MessageCircle, Lightbulb, ArrowRight, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  channel_ids: string[] | null;
}

interface ChannelOption {
  id: string;
  label: string;
  channel_type: string;
}

interface PendingQuestion {
  id: string;
  customer_question: string;
  customer_phone: string | null;
  suggested_questions: string[];
  admin_answer: string | null;
  status: string;
  created_at: string;
  conversation_id: string | null;
}

const KnowledgeBaseManager = () => {
  const { orgId, user } = useAuth();
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [pendingQuestions, setPendingQuestions] = useState<PendingQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<KBEntry | null>(null);
  const [form, setForm] = useState({ title: "", content: "", category: "general" });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("knowledge");
  const [answerDialog, setAnswerDialog] = useState<PendingQuestion | null>(null);
  const [answerForm, setAnswerForm] = useState({ answers: {} as Record<string, string>, category: "faq" });

  useEffect(() => {
    if (orgId) {
      loadEntries();
      loadPendingQuestions();
    }
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

  const loadPendingQuestions = async () => {
    const { data } = await supabase
      .from("ai_pending_questions" as any)
      .select("*")
      .eq("org_id", orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setPendingQuestions((data as any) || []);
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

  // Handle answering pending questions
  const openAnswer = (q: PendingQuestion) => {
    setAnswerDialog(q);
    const initial: Record<string, string> = {};
    (q.suggested_questions || []).forEach((sq: string, i: number) => {
      initial[`q${i}`] = "";
    });
    setAnswerForm({ answers: initial, category: "faq" });
  };

  const handleAnswerSubmit = async () => {
    if (!answerDialog) return;
    setSaving(true);

    // Build knowledge content from answers
    const qa = (answerDialog.suggested_questions || []).map((sq: string, i: number) => {
      const answer = answerForm.answers[`q${i}`]?.trim();
      if (!answer) return null;
      return `س: ${sq}\nج: ${answer}`;
    }).filter(Boolean);

    if (qa.length === 0) {
      toast.error("يجب الإجابة على سؤال واحد على الأقل");
      setSaving(false);
      return;
    }

    const content = qa.join("\n\n");
    const title = `إجابة: ${answerDialog.customer_question.substring(0, 60)}`;

    // Insert into knowledge base
    const { data: newEntry, error: kbError } = await supabase
      .from("ai_knowledge_base" as any)
      .insert({
        org_id: orgId,
        title,
        content,
        category: answerForm.category,
      } as any)
      .select("id")
      .single();

    if (kbError) {
      toast.error("فشل حفظ المعرفة");
      setSaving(false);
      return;
    }

    // Update pending question status
    await supabase
      .from("ai_pending_questions" as any)
      .update({
        status: "answered",
        admin_answer: content,
        answered_by: user?.id || null,
        answered_at: new Date().toISOString(),
        knowledge_entry_id: (newEntry as any)?.id || null,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", answerDialog.id);

    toast.success("تم حفظ الإجابة وتحديث قاعدة المعرفة ✅");
    setSaving(false);
    setAnswerDialog(null);
    loadPendingQuestions();
    loadEntries();
  };

  const dismissQuestion = async (id: string) => {
    await supabase
      .from("ai_pending_questions" as any)
      .update({ status: "dismissed", updated_at: new Date().toISOString() } as any)
      .eq("id", id);
    setPendingQuestions(prev => prev.filter(q => q.id !== id));
    toast.success("تم تجاهل السؤال");
  };

  const filtered = entries.filter(e => {
    const matchSearch = !search || e.title.includes(search) || e.content.includes(search);
    const matchCat = filterCat === "all" || e.category === filterCat;
    return matchSearch && matchCat;
  });

  const catLabel = (cat: string) => CATEGORIES.find(c => c.value === cat)?.label || cat;

  const pendingCount = pendingQuestions.length;

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

      {/* Tabs: Knowledge Base + Pending Questions */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="knowledge" className="flex-1 gap-1 text-xs">
            <BookOpen className="w-3.5 h-3.5" />
            المحتوى ({entries.length})
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex-1 gap-1 text-xs relative">
            <HelpCircle className="w-3.5 h-3.5" />
            أسئلة معلقة
            {pendingCount > 0 && (
              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 mr-1">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Knowledge Base Tab */}
        <TabsContent value="knowledge" className="space-y-3 mt-3">
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
        </TabsContent>

        {/* Pending Questions Tab */}
        <TabsContent value="pending" className="space-y-3 mt-3">
          {pendingCount === 0 ? (
            <div className="text-center py-12 bg-card rounded-xl border border-border">
              <CheckCircle className="w-12 h-12 text-success mx-auto mb-3" />
              <p className="text-sm font-medium">لا توجد أسئلة معلقة 🎉</p>
              <p className="text-xs text-muted-foreground mt-1">
                عندما يسأل عميل سؤالاً غير موجود في قاعدة المعرفة، سيظهر هنا مع أسئلة مقترحة لإثراء القاعدة
              </p>
            </div>
          ) : (
            <>
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium">أسئلة لم يجد لها AI إجابة</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      أجب على الأسئلة المقترحة وسيتم تحديث قاعدة المعرفة تلقائياً — AI سيستخدم إجاباتك للرد مستقبلاً
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {pendingQuestions.map(q => (
                  <div key={q.id} className="bg-card rounded-xl border border-warning/30 p-3 space-y-2">
                    {/* Customer question */}
                    <div className="flex items-start gap-2">
                      <MessageCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">سؤال العميل:</p>
                        <p className="text-sm bg-muted/50 rounded-lg p-2 mt-1">{q.customer_question}</p>
                        {q.customer_phone && (
                          <p className="text-[10px] text-muted-foreground mt-1" dir="ltr">{q.customer_phone}</p>
                        )}
                      </div>
                    </div>

                    {/* Suggested questions preview */}
                    <div className="flex items-start gap-2">
                      <Lightbulb className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-[10px] text-muted-foreground">أسئلة مقترحة من AI للإجابة عليها:</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(q.suggested_questions || []).slice(0, 3).map((sq: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px]">{sq.substring(0, 40)}{sq.length > 40 ? "..." : ""}</Badge>
                          ))}
                          {(q.suggested_questions || []).length > 3 && (
                            <Badge variant="secondary" className="text-[10px]">+{(q.suggested_questions || []).length - 3}</Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" className="flex-1 gap-1 text-xs" onClick={() => openAnswer(q)}>
                        <ArrowRight className="w-3 h-3" /> أجب وأثرِ القاعدة
                      </Button>
                      <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={() => dismissQuestion(q.id)}>
                        <XCircle className="w-3 h-3" />
                      </Button>
                    </div>

                    <p className="text-[9px] text-muted-foreground">
                      {new Date(q.created_at).toLocaleDateString("ar-SA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Add/Edit Knowledge Dialog */}
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

      {/* Answer Pending Question Dialog */}
      <Dialog open={!!answerDialog} onOpenChange={(open) => !open && setAnswerDialog(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-warning" />
              إثراء قاعدة المعرفة
            </DialogTitle>
          </DialogHeader>

          {answerDialog && (
            <div className="space-y-4">
              {/* Original question */}
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground mb-1">سؤال العميل الأصلي:</p>
                <p className="text-sm font-medium">{answerDialog.customer_question}</p>
              </div>

              {/* Category */}
              <div>
                <label className="text-xs font-medium mb-1 block">تصنيف المعرفة الجديدة</label>
                <Select value={answerForm.category} onValueChange={v => setAnswerForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Suggested questions with answer fields */}
              <div className="space-y-3">
                <p className="text-xs font-medium">أجب على الأسئلة التالية (سؤال واحد على الأقل):</p>
                {(answerDialog.suggested_questions || []).map((sq: string, i: number) => (
                  <div key={i} className="bg-card rounded-lg border border-border p-3 space-y-2">
                    <p className="text-xs font-medium text-primary flex items-start gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      {sq}
                    </p>
                    <Textarea
                      value={answerForm.answers[`q${i}`] || ""}
                      onChange={e => setAnswerForm(p => ({
                        ...p,
                        answers: { ...p.answers, [`q${i}`]: e.target.value }
                      }))}
                      placeholder="اكتب الإجابة هنا..."
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleAnswerSubmit} disabled={saving} className="flex-1 gap-1">
                  <Save className="w-4 h-4" />
                  {saving ? "جاري الحفظ..." : "حفظ وتحديث القاعدة"}
                </Button>
                <Button variant="outline" onClick={() => setAnswerDialog(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <p className="text-[10px] text-muted-foreground text-center">
                ✨ إجاباتك ستُضاف تلقائياً لقاعدة المعرفة وسيستخدمها AI للرد على أسئلة مشابهة مستقبلاً
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KnowledgeBaseManager;
