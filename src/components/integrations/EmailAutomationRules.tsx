import { useState, useEffect } from "react";
import { Zap, Plus, Trash2, Edit, Loader2, Mail, Ticket, UserCheck, Globe, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface EmailAutomationRule {
  id: string;
  rule_type: string;
  pattern: string;
  keywords: string[];
  action_type: string;
  assigned_agent_id: string | null;
  assigned_team_id: string | null;
  ticket_category: string;
  ticket_priority: string;
  ticket_title_template: string | null;
  include_attachments: boolean;
  is_active: boolean;
  priority: number;
  email_config_id: string | null;
}

interface Agent { id: string; full_name: string; }
interface Team { id: string; name: string; }

interface EmailAutomationRulesProps {
  orgId: string;
  agents: Agent[];
  teams: Team[];
}

const TICKET_CATEGORIES = [
  { value: "general", label: "عام" },
  { value: "complaint", label: "شكوى" },
  { value: "inquiry", label: "استفسار" },
  { value: "technical", label: "مشكلة تقنية" },
  { value: "billing", label: "فوترة" },
  { value: "shipping", label: "شحن" },
  { value: "return", label: "استرجاع" },
];

const TICKET_PRIORITIES = [
  { value: "low", label: "منخفضة" },
  { value: "medium", label: "متوسطة" },
  { value: "high", label: "عالية" },
  { value: "urgent", label: "عاجلة" },
];

const ACTION_LABELS: Record<string, { label: string; icon: typeof UserCheck; color: string }> = {
  assign: { label: "إسناد للموظف/فريق", icon: UserCheck, color: "bg-primary/10 text-primary" },
  ticket: { label: "إنشاء تذكرة", icon: Ticket, color: "bg-success/10 text-success" },
  assign_and_ticket: { label: "إسناد + تذكرة", icon: Zap, color: "bg-warning/10 text-warning" },
};

const EmailAutomationRules = ({ orgId, agents, teams }: EmailAutomationRulesProps) => {
  const [rules, setRules] = useState<EmailAutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<EmailAutomationRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");

  const defaultForm = {
    rule_type: "domain",
    pattern: "",
    keywords: [] as string[],
    action_type: "assign",
    assigned_agent_id: "",
    assigned_team_id: "",
    ticket_category: "general",
    ticket_priority: "medium",
    ticket_title_template: "",
    include_attachments: true,
  };
  const [form, setForm] = useState(defaultForm);

  useEffect(() => { loadRules(); }, [orgId]);

  const loadRules = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("email_routing_rules")
      .select("*")
      .eq("org_id", orgId)
      .order("priority", { ascending: false });
    setRules((data as any[]) || []);
    setLoading(false);
  };

  const openNewDialog = () => {
    setEditingRule(null);
    setForm(defaultForm);
    setKeywordInput("");
    setDialogOpen(true);
  };

  const openEditDialog = (rule: EmailAutomationRule) => {
    setEditingRule(rule);
    setForm({
      rule_type: rule.rule_type,
      pattern: rule.pattern,
      keywords: rule.keywords || [],
      action_type: rule.action_type,
      assigned_agent_id: rule.assigned_agent_id || "",
      assigned_team_id: rule.assigned_team_id || "",
      ticket_category: rule.ticket_category || "general",
      ticket_priority: rule.ticket_priority || "medium",
      ticket_title_template: rule.ticket_title_template || "",
      include_attachments: rule.include_attachments ?? true,
    });
    setKeywordInput("");
    setDialogOpen(true);
  };

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (!kw || form.keywords.includes(kw)) return;
    setForm(prev => ({ ...prev, keywords: [...prev.keywords, kw] }));
    setKeywordInput("");
  };

  const removeKeyword = (kw: string) => {
    setForm(prev => ({ ...prev, keywords: prev.keywords.filter(k => k !== kw) }));
  };

  const handleSave = async () => {
    if (!form.pattern.trim()) { toast.error("أدخل الدومين أو الإيميل"); return; }
    const showAssign = form.action_type === "assign" || form.action_type === "assign_and_ticket";
    if (showAssign && !form.assigned_agent_id && !form.assigned_team_id) {
      toast.error("اختر موظف أو فريق للإسناد"); return;
    }

    setSaving(true);
    const payload = {
      org_id: orgId,
      rule_type: form.rule_type,
      pattern: form.pattern.trim().toLowerCase(),
      keywords: form.keywords,
      action_type: form.action_type,
      assigned_agent_id: form.assigned_agent_id || null,
      assigned_team_id: form.assigned_team_id || null,
      ticket_category: form.ticket_category,
      ticket_priority: form.ticket_priority,
      ticket_title_template: form.ticket_title_template || null,
      include_attachments: form.include_attachments,
    };

    const response = editingRule
      ? await supabase.from("email_routing_rules").update(payload).eq("id", editingRule.id)
      : await supabase.from("email_routing_rules").insert(payload);

    if (response.error) {
      toast.error("فشل الحفظ");
    } else {
      toast.success(editingRule ? "تم تحديث القاعدة ✅" : "تم إضافة القاعدة ✅");
      setDialogOpen(false);
      setForm(defaultForm);
      setKeywordInput("");
      loadRules();
    }
    setSaving(false);
  };

  const deleteRule = async (id: string) => {
    await supabase.from("email_routing_rules").delete().eq("id", id);
    toast.success("تم حذف القاعدة");
    loadRules();
  };

  const toggleRule = async (rule: EmailAutomationRule) => {
    const { error } = await supabase.from("email_routing_rules").update({ is_active: !rule.is_active }).eq("id", rule.id);
    if (error) { toast.error("تعذر تحديث حالة القاعدة"); return; }
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
  };

  const getAgentName = (id: string | null) => agents.find(a => a.id === id)?.full_name || null;
  const getTeamName = (id: string | null) => teams.find(t => t.id === id)?.name || null;
  const getActionInfo = (rule: EmailAutomationRule) => ACTION_LABELS[rule.action_type] || ACTION_LABELS.assign;
  const getCategoryLabel = (cat: string) => TICKET_CATEGORIES.find(c => c.value === cat)?.label || cat;

  const showTicketFields = form.action_type === "ticket" || form.action_type === "assign_and_ticket";
  const showAssignFields = form.action_type === "assign" || form.action_type === "assign_and_ticket";

  const actionTypeCounts = rules.reduce((acc, r) => {
    acc[r.action_type] = (acc[r.action_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">قواعد توجيه الإيميلات وإنشاء التذاكر بناءً على الدومين والكلمات المفتاحية</p>
        <Button size="sm" className="gap-1.5 text-xs" onClick={openNewDialog}>
          <Plus className="w-3.5 h-3.5" />
          قاعدة جديدة
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-lg p-3 shadow-card text-center">
          <p className="text-xl font-bold">{rules.length}</p>
          <p className="text-[10px] text-muted-foreground">إجمالي القواعد</p>
        </div>
        <div className="bg-card rounded-lg p-3 shadow-card text-center">
          <p className="text-xl font-bold text-success">{rules.filter(r => r.is_active).length}</p>
          <p className="text-[10px] text-muted-foreground">مفعّلة</p>
        </div>
        <div className="bg-card rounded-lg p-3 shadow-card text-center">
          <p className="text-xl font-bold text-primary">{actionTypeCounts.assign || 0}</p>
          <p className="text-[10px] text-muted-foreground">إسناد تلقائي</p>
        </div>
        <div className="bg-card rounded-lg p-3 shadow-card text-center">
          <p className="text-xl font-bold text-info">{(actionTypeCounts.ticket || 0) + (actionTypeCounts.assign_and_ticket || 0)}</p>
          <p className="text-[10px] text-muted-foreground">تذاكر تلقائية</p>
        </div>
      </div>

      {/* Rules List */}
      {loading ? (
        <div className="bg-card rounded-lg p-8 text-center text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />
          <p className="text-sm">جاري التحميل...</p>
        </div>
      ) : rules.length === 0 ? (
        <div className="bg-card rounded-lg p-8 text-center text-muted-foreground border border-border">
          <Mail className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">لا توجد قواعد أتمتة بعد</p>
          <p className="text-xs mt-1">أنشئ قاعدة لتوجيه الإيميلات تلقائياً أو تحويلها لتذاكر</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => {
            const actionInfo = getActionInfo(rule);
            const ActionIcon = actionInfo.icon;
            const keywords: string[] = rule.keywords || [];
            return (
              <div key={rule.id} className={cn("bg-card rounded-lg p-4 md:p-5 shadow-card hover:shadow-card-hover transition-shadow", !rule.is_active && "opacity-60")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", actionInfo.color)}>
                      <ActionIcon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-sm" dir="ltr">{rule.pattern}</h3>
                        <Badge variant="secondary" className={cn("text-[10px] border-0", actionInfo.color)}>{actionInfo.label}</Badge>
                        {rule.rule_type === "domain" && (
                          <Badge variant="outline" className="text-[10px]">دومين</Badge>
                        )}
                      </div>
                      {keywords.length > 0 && (
                        <p className="text-xs text-muted-foreground mb-1">
                          <span className="font-medium">الكلمات المفتاحية:</span>{" "}
                          {keywords.join("، ")}
                        </p>
                      )}
                      {(rule.action_type === "assign" || rule.action_type === "assign_and_ticket") && (
                        <>
                          {getAgentName(rule.assigned_agent_id) && (
                            <p className="text-xs text-muted-foreground mb-1">
                              <span className="font-medium">الموظف:</span> {getAgentName(rule.assigned_agent_id)}
                            </p>
                          )}
                          {getTeamName(rule.assigned_team_id) && (
                            <p className="text-xs text-muted-foreground mb-1">
                              <span className="font-medium">الفريق:</span> {getTeamName(rule.assigned_team_id)}
                            </p>
                          )}
                        </>
                      )}
                      {(rule.action_type === "ticket" || rule.action_type === "assign_and_ticket") && (
                        <p className="text-xs text-muted-foreground mb-1">
                          <span className="font-medium">التذكرة:</span>{" "}
                          {getCategoryLabel(rule.ticket_category)}
                          {rule.ticket_title_template && ` — ${rule.ticket_title_template}`}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch checked={rule.is_active} onCheckedChange={() => toggleRule(rule)} />
                    <button onClick={() => openEditDialog(rule)} className="p-1.5 rounded hover:bg-secondary transition-colors">
                      <Edit className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => deleteRule(rule.id)} className="p-1.5 rounded hover:bg-destructive/10 transition-colors">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rule Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingRule ? "تعديل القاعدة" : "إضافة قاعدة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Condition */}
            <div className="space-y-2">
              <Label className="text-xs">نوع الشرط</Label>
              <Select value={form.rule_type} onValueChange={v => setForm(prev => ({ ...prev, rule_type: v }))}>
                <SelectTrigger className="bg-secondary border-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="domain">دومين (مثلاً company.com)</SelectItem>
                  <SelectItem value="email">إيميل محدد</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">{form.rule_type === "domain" ? "الدومين" : "الإيميل"}</Label>
              <Input
                placeholder={form.rule_type === "domain" ? "example.com" : "user@example.com"}
                value={form.pattern}
                onChange={e => setForm(prev => ({ ...prev, pattern: e.target.value }))}
                className="bg-secondary border-0"
                dir="ltr"
              />
            </div>

            {/* Keywords */}
            <div className="space-y-2">
              <Label className="text-xs">كلمات مفتاحية (اختياري)</Label>
              <p className="text-[10px] text-muted-foreground">يجب أن تتواجد في العنوان أو محتوى الإيميل</p>
              <div className="flex gap-1.5">
                <Input
                  placeholder="أدخل كلمة واضغط إضافة"
                  value={keywordInput}
                  onChange={e => setKeywordInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
                  className="bg-secondary border-0 flex-1"
                />
                <Button size="sm" variant="outline" onClick={addKeyword}>إضافة</Button>
              </div>
              {form.keywords.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {form.keywords.map(kw => (
                    <Badge key={kw} variant="secondary" className="text-[10px] gap-1 cursor-pointer" onClick={() => removeKeyword(kw)}>
                      {kw} ✕
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Action Type */}
            <div className="space-y-2">
              <Label className="text-xs">نوع الإجراء</Label>
              <Select value={form.action_type} onValueChange={v => setForm(prev => ({ ...prev, action_type: v }))}>
                <SelectTrigger className="bg-secondary border-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="assign">
                    <span className="flex items-center gap-2"><UserCheck className="w-3.5 h-3.5" /> إسناد للموظف/فريق</span>
                  </SelectItem>
                  <SelectItem value="ticket">
                    <span className="flex items-center gap-2"><Ticket className="w-3.5 h-3.5" /> إنشاء تذكرة</span>
                  </SelectItem>
                  <SelectItem value="assign_and_ticket">
                    <span className="flex items-center gap-2"><Zap className="w-3.5 h-3.5" /> إسناد + تذكرة</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Assign fields */}
            {showAssignFields && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs">الموظف</Label>
                  <Select value={form.assigned_agent_id} onValueChange={v => setForm(prev => ({ ...prev, assigned_agent_id: v === "_none" ? "" : v }))}>
                    <SelectTrigger className="bg-secondary border-0"><SelectValue placeholder="اختياري" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">بدون</SelectItem>
                      {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">الفريق</Label>
                  <Select value={form.assigned_team_id} onValueChange={v => setForm(prev => ({ ...prev, assigned_team_id: v === "_none" ? "" : v }))}>
                    <SelectTrigger className="bg-secondary border-0"><SelectValue placeholder="اختياري" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">بدون</SelectItem>
                      {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Ticket fields */}
            {showTicketFields && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs">تصنيف التذكرة</Label>
                  <Select value={form.ticket_category} onValueChange={v => setForm(prev => ({ ...prev, ticket_category: v }))}>
                    <SelectTrigger className="bg-secondary border-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TICKET_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">الأولوية</Label>
                  <Select value={form.ticket_priority} onValueChange={v => setForm(prev => ({ ...prev, ticket_priority: v }))}>
                    <SelectTrigger className="bg-secondary border-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TICKET_PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">عنوان التذكرة (اختياري)</Label>
                  <Input
                    placeholder="مثال: {{subject}} — دعم فني"
                    value={form.ticket_title_template}
                    onChange={e => setForm(prev => ({ ...prev, ticket_title_template: e.target.value }))}
                    className="bg-secondary border-0"
                  />
                  <p className="text-[10px] text-muted-foreground">استخدم {"{{subject}}"} أو {"{{sender}}"} كمتغيرات</p>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">إضافة المرفقات للتذكرة</Label>
                  <Switch checked={form.include_attachments} onCheckedChange={v => setForm(prev => ({ ...prev, include_attachments: v }))} />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editingRule ? "تحديث" : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmailAutomationRules;
