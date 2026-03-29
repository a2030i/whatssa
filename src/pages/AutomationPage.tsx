import { useEffect, useState } from "react";
import { Bot, Plus, Trash2, Edit, Save, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface AutomationRule {
  id: string;
  name: string;
  keywords: string[];
  reply_text: string;
  enabled: boolean;
}

const AutomationPage = () => {
  const { toast } = useToast();
  const { orgId, user } = useAuth();
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [formName, setFormName] = useState("");
  const [formKeywords, setFormKeywords] = useState("");
  const [formReply, setFormReply] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const table = supabase.from("automation_rules" as any);

  const loadRules = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("automation_rules" as any)
      .select("id, name, keywords, reply_text, enabled")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "خطأ", description: "تعذر جلب قواعد الأتمتة الحقيقية", variant: "destructive" });
      setRules([]);
    } else {
      setRules((data || []) as unknown as AutomationRule[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadRules();
  }, []);

  const openNewDialog = () => {
    setEditingRule(null);
    setFormName("");
    setFormKeywords("");
    setFormReply("");
    setFormEnabled(true);
    setDialogOpen(true);
  };

  const openEditDialog = (rule: AutomationRule) => {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormKeywords(rule.keywords.join(", "));
    setFormReply(rule.reply_text);
    setFormEnabled(rule.enabled);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const keywords = formKeywords
      .split(/[,\n]/)
      .map((keyword) => keyword.trim())
      .filter(Boolean);

    if (!formName.trim() || !formReply.trim() || keywords.length === 0) {
      toast({ title: "خطأ", description: "أدخل الاسم والكلمات المفتاحية والرد", variant: "destructive" });
      return;
    }

    if (!orgId || !user) {
      toast({ title: "خطأ", description: "تعذر تحديد المؤسسة الحالية", variant: "destructive" });
      return;
    }

    setSubmitting(true);

    const payload = {
      name: formName.trim(),
      keywords,
      reply_text: formReply.trim(),
      enabled: formEnabled,
      org_id: orgId,
      created_by: user.id,
    };

    const response = editingRule
      ? await table.update(payload).eq("id", editingRule.id)
      : await table.insert(payload);

    if (response.error) {
      toast({ title: "خطأ", description: "تعذر حفظ القاعدة", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    toast({ title: "تم الحفظ", description: "هذه القاعدة أصبحت حقيقية وتعمل من خلال الويب هوك" });
    setDialogOpen(false);
    setSubmitting(false);
    loadRules();
  };

  const handleDelete = async (id: string) => {
    const { error } = await table.delete().eq("id", id);
    if (error) {
      toast({ title: "خطأ", description: "تعذر حذف القاعدة", variant: "destructive" });
      return;
    }
    toast({ title: "تم الحذف", description: "تم حذف القاعدة الحقيقية" });
    loadRules();
  };

  const handleToggle = async (rule: AutomationRule) => {
    const { error } = await table.update({ enabled: !rule.enabled }).eq("id", rule.id);
    if (error) {
      toast({ title: "خطأ", description: "تعذر تحديث حالة القاعدة", variant: "destructive" });
      return;
    }
    setRules((prev) => prev.map((item) => (item.id === rule.id ? { ...item, enabled: !item.enabled } : item)));
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[900px]" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">الأتمتة</h1>
          <p className="text-sm text-muted-foreground mt-1">الأتمتة الحقيقية الحالية: رد تلقائي بالكلمات المفتاحية من خلال الويب هوك</p>
        </div>
        <Button className="gap-2" onClick={openNewDialog}>
          <Plus className="w-4 h-4" />
          قاعدة حقيقية جديدة
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-lg p-3 shadow-card text-center">
          <p className="text-xl font-bold">{rules.length}</p>
          <p className="text-[10px] text-muted-foreground">إجمالي القواعد</p>
        </div>
        <div className="bg-card rounded-lg p-3 shadow-card text-center">
          <p className="text-xl font-bold text-success">{rules.filter((rule) => rule.enabled).length}</p>
          <p className="text-[10px] text-muted-foreground">مفعّلة</p>
        </div>
        <div className="bg-card rounded-lg p-3 shadow-card text-center">
          <p className="text-xl font-bold text-muted-foreground">{rules.filter((rule) => !rule.enabled).length}</p>
          <p className="text-[10px] text-muted-foreground">معطّلة</p>
        </div>
        <div className="bg-card rounded-lg p-3 shadow-card text-center">
          <p className="text-xl font-bold text-info">1</p>
          <p className="text-[10px] text-muted-foreground">نوع مدعوم الآن</p>
        </div>
      </div>

      {loading ? (
        <div className="bg-card rounded-lg p-8 text-center text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />
          <p className="text-sm">جاري تحميل القواعد الحقيقية...</p>
        </div>
      ) : rules.length === 0 ? (
        <div className="bg-card rounded-lg p-8 text-center text-muted-foreground border border-border">
          <Bot className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">لا توجد قواعد أتمتة حقيقية بعد</p>
          <p className="text-xs mt-1">أنشئ قاعدة كلمات مفتاحية وسيتم الرد تلقائياً من خلال رقم واتساب الحقيقي</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className={cn("bg-card rounded-lg p-4 md:p-5 shadow-card hover:shadow-card-hover transition-shadow", !rule.enabled && "opacity-60")}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-primary/10 text-primary">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-sm">{rule.name}</h3>
                      <Badge variant="secondary" className="text-[10px] border-0 bg-primary/10 text-primary">كلمات مفتاحية</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2"><span className="font-medium">المحفّز:</span> {rule.keywords.join("، ")}</p>
                    <p className="text-xs text-muted-foreground"><span className="font-medium">الرد:</span> {rule.reply_text}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={rule.enabled} onCheckedChange={() => handleToggle(rule)} />
                  <button onClick={() => openEditDialog(rule)} className="p-1.5 rounded hover:bg-secondary transition-colors">
                    <Edit className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => handleDelete(rule.id)} className="p-1.5 rounded hover:bg-destructive/10 transition-colors">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingRule ? "تعديل القاعدة" : "إضافة قاعدة حقيقية"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">اسم القاعدة</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="مثال: رد ترحيبي" className="bg-secondary border-0" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">الكلمات المفتاحية</Label>
              <Textarea value={formKeywords} onChange={(e) => setFormKeywords(e.target.value)} placeholder="مرحبا، أهلاً، السلام" className="bg-secondary border-0 min-h-[70px]" />
              <p className="text-[10px] text-muted-foreground">افصل الكلمات بفاصلة أو سطر جديد</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">نص الرد التلقائي</Label>
              <Textarea value={formReply} onChange={(e) => setFormReply(e.target.value)} placeholder="أهلاً بك، كيف نقدر نخدمك؟" className="bg-secondary border-0 min-h-[90px]" />
            </div>
            <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
              <Label className="text-xs">تفعيل القاعدة مباشرة</Label>
              <Switch checked={formEnabled} onCheckedChange={setFormEnabled} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={submitting} className="gap-1.5">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingRule ? "حفظ التعديلات" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AutomationPage;