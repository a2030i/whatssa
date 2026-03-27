import { useState } from "react";
import { Bot, Plus, Zap, Clock, MessageCircle, ArrowLeftRight, Trash2, Edit, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type RuleType = "keyword" | "schedule" | "api" | "transfer";

interface AutomationRule {
  id: string;
  name: string;
  trigger: string;
  action: string;
  enabled: boolean;
  type: RuleType;
}

const typeConfig = {
  keyword: { label: "كلمة مفتاحية", icon: MessageCircle, color: "bg-primary/10 text-primary" },
  schedule: { label: "جدول زمني", icon: Clock, color: "bg-info/10 text-info" },
  api: { label: "استدعاء API", icon: Zap, color: "bg-warning/10 text-warning" },
  transfer: { label: "تحويل", icon: ArrowLeftRight, color: "bg-kpi-3/10 text-kpi-3" },
};

const initialRules: AutomationRule[] = [
  { id: "1", name: "رد تلقائي - ترحيب", trigger: "كلمة مفتاحية: مرحبا، السلام", action: "إرسال رسالة ترحيب + قائمة الخدمات", enabled: true, type: "keyword" },
  { id: "2", name: "خارج أوقات الدوام", trigger: "بعد 5:00 مساءً - قبل 9:00 صباحاً", action: "إرسال رسالة: نحن خارج أوقات الدوام، سنرد عليك أول شيء غداً", enabled: true, type: "schedule" },
  { id: "3", name: "استفسار الشحن", trigger: "كلمة مفتاحية: شحن، توصيل، طلب", action: "استدعاء API الشحن → إرسال حالة الطلب تلقائياً", enabled: false, type: "api" },
  { id: "4", name: "تحويل للدعم الفني", trigger: "كلمة مفتاحية: مشكلة، عطل، خطأ", action: "تحويل المحادثة تلقائياً لفريق الدعم الفني", enabled: true, type: "transfer" },
];

interface FlowStep {
  id: string;
  message: string;
  options: string[];
}

const sampleFlows = [
  { id: "f1", name: "قائمة الخدمات", steps: 4, active: true },
  { id: "f2", name: "حجز موعد", steps: 6, active: false },
];

const AutomationPage = () => {
  const [rules, setRules] = useState<AutomationRule[]>(initialRules);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<RuleType>("keyword");
  const [formTrigger, setFormTrigger] = useState("");
  const [formAction, setFormAction] = useState("");
  const { toast } = useToast();

  const openNewDialog = () => {
    setEditingRule(null);
    setFormName("");
    setFormType("keyword");
    setFormTrigger("");
    setFormAction("");
    setDialogOpen(true);
  };

  const openEditDialog = (rule: AutomationRule) => {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormType(rule.type);
    setFormTrigger(rule.trigger);
    setFormAction(rule.action);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!formName.trim() || !formTrigger.trim() || !formAction.trim()) {
      toast({ title: "خطأ", description: "يرجى ملء جميع الحقول", variant: "destructive" });
      return;
    }

    if (editingRule) {
      setRules((prev) => prev.map((r) => r.id === editingRule.id ? { ...r, name: formName, type: formType, trigger: formTrigger, action: formAction } : r));
      toast({ title: "تم التحديث", description: `تم تحديث القاعدة "${formName}"` });
    } else {
      const newRule: AutomationRule = {
        id: Date.now().toString(),
        name: formName,
        type: formType,
        trigger: formTrigger,
        action: formAction,
        enabled: true,
      };
      setRules((prev) => [...prev, newRule]);
      toast({ title: "تمت الإضافة", description: `تمت إضافة القاعدة "${formName}"` });
    }
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    toast({ title: "تم الحذف", description: "تم حذف القاعدة بنجاح" });
  };

  const handleToggle = (id: string) => {
    setRules((prev) => prev.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[900px]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">الأتمتة</h1>
          <p className="text-sm text-muted-foreground mt-1">إعداد قواعد الرد التلقائي وسير العمل</p>
        </div>
        <Button className="gap-2" onClick={openNewDialog}>
          <Plus className="w-4 h-4" />
          قاعدة جديدة
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-lg p-3 shadow-card text-center">
          <p className="text-xl font-bold">{rules.length}</p>
          <p className="text-[10px] text-muted-foreground">إجمالي القواعد</p>
        </div>
        <div className="bg-card rounded-lg p-3 shadow-card text-center">
          <p className="text-xl font-bold text-success">{rules.filter((r) => r.enabled).length}</p>
          <p className="text-[10px] text-muted-foreground">مفعّلة</p>
        </div>
        <div className="bg-card rounded-lg p-3 shadow-card text-center">
          <p className="text-xl font-bold text-muted-foreground">{rules.filter((r) => !r.enabled).length}</p>
          <p className="text-[10px] text-muted-foreground">معطّلة</p>
        </div>
        <div className="bg-card rounded-lg p-3 shadow-card text-center">
          <p className="text-xl font-bold text-info">{sampleFlows.length}</p>
          <p className="text-[10px] text-muted-foreground">سير عمل</p>
        </div>
      </div>

      {/* Rules */}
      <div>
        <h2 className="font-semibold text-sm mb-3">القواعد التلقائية</h2>
        <div className="space-y-3">
          {rules.map((rule) => {
            const config = typeConfig[rule.type];
            return (
              <div key={rule.id} className={cn("bg-card rounded-lg p-4 md:p-5 shadow-card hover:shadow-card-hover transition-shadow animate-fade-in", !rule.enabled && "opacity-60")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", config.color)}>
                      <config.icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-sm">{rule.name}</h3>
                        <Badge variant="secondary" className={cn("text-[10px] border-0", config.color)}>{config.label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1"><span className="font-medium">المُحفّز:</span> {rule.trigger}</p>
                      <p className="text-xs text-muted-foreground"><span className="font-medium">الإجراء:</span> {rule.action}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch checked={rule.enabled} onCheckedChange={() => handleToggle(rule.id)} />
                    <button onClick={() => openEditDialog(rule)} className="p-1.5 rounded hover:bg-secondary transition-colors">
                      <Edit className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => handleDelete(rule.id)} className="p-1.5 rounded hover:bg-destructive/10 transition-colors">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Flows */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">سير العمل (Flows)</h2>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Plus className="w-3.5 h-3.5" />
            Flow جديد
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sampleFlows.map((flow) => (
            <div key={flow.id} className="bg-card rounded-lg p-4 shadow-card hover:shadow-card-hover transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-info/10 text-info flex items-center justify-center">
                    <Bot className="w-4 h-4" />
                  </div>
                  <h3 className="font-semibold text-sm">{flow.name}</h3>
                </div>
                <Badge variant="secondary" className={cn("text-[10px] border-0", flow.active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
                  {flow.active ? "مفعّل" : "معطّل"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{flow.steps} خطوات</p>
            </div>
          ))}

          {/* Add flow placeholder */}
          <button className="bg-card rounded-lg p-4 shadow-card border-2 border-dashed border-border hover:border-primary/30 transition-colors flex flex-col items-center justify-center gap-2 min-h-[100px]">
            <Plus className="w-5 h-5 text-muted-foreground/50" />
            <span className="text-xs text-muted-foreground">إضافة Flow</span>
          </button>
        </div>
      </div>

      {/* Add/Edit Rule Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingRule ? "تعديل القاعدة" : "إضافة قاعدة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">اسم القاعدة</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="مثال: رد ترحيبي" className="bg-secondary border-0" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">نوع القاعدة</Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as RuleType)}>
                <SelectTrigger className="bg-secondary border-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword">كلمة مفتاحية</SelectItem>
                  <SelectItem value="schedule">جدول زمني (خارج الدوام)</SelectItem>
                  <SelectItem value="api">استدعاء API</SelectItem>
                  <SelectItem value="transfer">تحويل تلقائي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">المُحفّز (Trigger)</Label>
              <Textarea value={formTrigger} onChange={(e) => setFormTrigger(e.target.value)} placeholder={formType === "keyword" ? "مثال: مرحبا، أهلاً، السلام" : formType === "schedule" ? "مثال: بعد 5:00 مساءً" : "المُحفّز..."} className="bg-secondary border-0 min-h-[60px]" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">الإجراء (Action)</Label>
              <Textarea value={formAction} onChange={(e) => setFormAction(e.target.value)} placeholder="مثال: إرسال رسالة ترحيب" className="bg-secondary border-0 min-h-[60px]" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} className="gap-1.5">
              <Save className="w-4 h-4" />
              {editingRule ? "حفظ التعديلات" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AutomationPage;
