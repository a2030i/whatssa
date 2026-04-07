import { useState, useEffect } from "react";
import { Zap, Plus, Trash2, Loader2, ChevronDown, ChevronUp, Ticket, UserCheck, Globe, Tag, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

const ACTION_TYPES = [
  { value: "assign", label: "إسناد للموظف/فريق", icon: UserCheck },
  { value: "ticket", label: "إنشاء تذكرة", icon: Ticket },
  { value: "assign_and_ticket", label: "إسناد + تذكرة", icon: Zap },
];

const EmailAutomationRules = ({ orgId, agents, teams }: EmailAutomationRulesProps) => {
  const [rules, setRules] = useState<EmailAutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
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
      .eq("is_active", true)
      .order("priority", { ascending: false });
    setRules((data as any[]) || []);
    setLoading(false);
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
    if ((form.action_type === "assign" || form.action_type === "assign_and_ticket") && !form.assigned_agent_id && !form.assigned_team_id) {
      toast.error("اختر موظف أو فريق للإسناد");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("email_routing_rules").insert({
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
    });

    if (error) {
      toast.error("فشل الحفظ");
    } else {
      toast.success("تم إضافة قاعدة الأتمتة ✅");
      setShowForm(false);
      setForm(defaultForm);
      setKeywordInput("");
      loadRules();
    }
    setSaving(false);
  };

  const deleteRule = async (id: string) => {
    if (!confirm("حذف هذه القاعدة؟")) return;
    await supabase.from("email_routing_rules").delete().eq("id", id);
    toast.success("تم حذف القاعدة");
    loadRules();
  };

  const toggleRule = async (id: string, active: boolean) => {
    await supabase.from("email_routing_rules").update({ is_active: active }).eq("id", id);
    loadRules();
  };

  const getAgentName = (id: string | null) => agents.find(a => a.id === id)?.full_name || null;
  const getTeamName = (id: string | null) => teams.find(t => t.id === id)?.name || null;
  const getActionLabel = (type: string) => ACTION_TYPES.find(a => a.value === type)?.label || type;
  const getCategoryLabel = (cat: string) => TICKET_CATEGORIES.find(c => c.value === cat)?.label || cat;
  const getPriorityLabel = (p: string) => TICKET_PRIORITIES.find(pr => pr.value === p)?.label || p;

  const showTicketFields = form.action_type === "ticket" || form.action_type === "assign_and_ticket";
  const showAssignFields = form.action_type === "assign" || form.action_type === "assign_and_ticket";

  return (
    <div className="space-y-3 mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-primary" />
          أتمتة الإيميلات
        </h3>
        <Button size="sm" variant="outline" className="text-[10px] h-7 gap-1" onClick={() => setShowForm(true)}>
          <Plus className="w-3 h-3" /> قاعدة جديدة
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground">
        أنشئ قواعد لتوجيه الإيميلات تلقائياً أو تحويلها لتذاكر بناءً على الدومين والكلمات المفتاحية
      </p>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : rules.length === 0 ? (
        <div className="bg-muted/50 rounded-lg p-4 text-center">
          <Zap className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
          <p className="text-[11px] text-muted-foreground">لا توجد قواعد أتمتة — أضف قاعدة لتبدأ</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => {
            const isExpanded = expandedRule === rule.id;
            const keywords: string[] = rule.keywords || [];
            return (
              <div key={rule.id} className="bg-card border border-border rounded-lg p-2.5">
                <button
                  onClick={() => setExpandedRule(isExpanded ? null : rule.id)}
                  className="w-full flex items-center justify-between text-right"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Globe className="w-3.5 h-3.5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium" dir="ltr">{rule.pattern}</span>
                        <Badge variant="secondary" className="text-[8px] h-4 px-1.5">{getActionLabel(rule.action_type)}</Badge>
                        {keywords.length > 0 && (
                          <Badge variant="outline" className="text-[8px] h-4 px-1.5 gap-0.5">
                            <Tag className="w-2 h-2" /> {keywords.length} كلمة
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                </button>

                {isExpanded && (
                  <div className="mt-2 pt-2 border-t border-border space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">النوع:</span>
                      <span>{rule.rule_type === "domain" ? "دومين" : "إيميل محدد"}</span>
                    </div>

                    {keywords.length > 0 && (
                      <div className="flex justify-between items-start">
                        <span className="text-muted-foreground">الكلمات:</span>
                        <div className="flex gap-1 flex-wrap justify-end max-w-[70%]">
                          {keywords.map(kw => (
                            <Badge key={kw} variant="secondary" className="text-[9px] h-4">{kw}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {(rule.action_type === "assign" || rule.action_type === "assign_and_ticket") && (
                      <>
                        {getAgentName(rule.assigned_agent_id) && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">الموظف:</span>
                            <span>{getAgentName(rule.assigned_agent_id)}</span>
                          </div>
                        )}
                        {getTeamName(rule.assigned_team_id) && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">الفريق:</span>
                            <span>{getTeamName(rule.assigned_team_id)}</span>
                          </div>
                        )}
                      </>
                    )}

                    {(rule.action_type === "ticket" || rule.action_type === "assign_and_ticket") && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">تصنيف التذكرة:</span>
                          <span>{getCategoryLabel(rule.ticket_category)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">الأولوية:</span>
                          <span>{getPriorityLabel(rule.ticket_priority)}</span>
                        </div>
                        {rule.ticket_title_template && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">عنوان التذكرة:</span>
                            <span className="text-[10px] max-w-[60%] truncate">{rule.ticket_title_template}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">المرفقات:</span>
                          <span>{rule.include_attachments ? "✅ تُضاف" : "❌ لا"}</span>
                        </div>
                      </>
                    )}

                    <div className="flex gap-2 justify-end pt-1">
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={(v) => toggleRule(rule.id, v)}
                      />
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-destructive text-[10px]" onClick={() => deleteRule(rule.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Rule Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              قاعدة أتمتة جديدة
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Condition: Domain/Email */}
            <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-xs font-semibold text-foreground">الشرط</p>

              <div className="space-y-1.5">
                <Label className="text-[11px]">النوع</Label>
                <Select value={form.rule_type} onValueChange={v => setForm(prev => ({ ...prev, rule_type: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="domain">دومين (مثلاً company.com)</SelectItem>
                    <SelectItem value="email">إيميل محدد</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px]">{form.rule_type === "domain" ? "الدومين" : "الإيميل"}</Label>
                <Input
                  placeholder={form.rule_type === "domain" ? "example.com" : "user@example.com"}
                  value={form.pattern}
                  onChange={e => setForm(prev => ({ ...prev, pattern: e.target.value }))}
                  className="h-8 text-xs"
                  dir="ltr"
                />
              </div>

              {/* Keywords */}
              <div className="space-y-1.5">
                <Label className="text-[11px] flex items-center gap-1">
                  <Tag className="w-3 h-3" /> كلمات مفتاحية (اختياري)
                </Label>
                <p className="text-[9px] text-muted-foreground">إذا أضفت كلمات، يجب أن تتواجد في العنوان أو محتوى الإيميل</p>
                <div className="flex gap-1.5">
                  <Input
                    placeholder="أدخل كلمة واضغط إضافة"
                    value={keywordInput}
                    onChange={e => setKeywordInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
                    className="h-8 text-xs flex-1"
                  />
                  <Button size="sm" variant="outline" className="h-8 text-[10px]" onClick={addKeyword}>إضافة</Button>
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
            </div>

            {/* Action */}
            <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-xs font-semibold text-foreground">الإجراء</p>

              <div className="grid grid-cols-3 gap-1.5">
                {ACTION_TYPES.map(at => {
                  const Icon = at.icon;
                  return (
                    <button
                      key={at.value}
                      onClick={() => setForm(prev => ({ ...prev, action_type: at.value }))}
                      className={`rounded-lg border-2 p-2 text-center transition-all text-[10px] font-medium ${
                        form.action_type === at.value
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border hover:border-primary/40 text-foreground"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 mx-auto mb-0.5" />
                      {at.label}
                    </button>
                  );
                })}
              </div>

              {/* Assign fields */}
              {showAssignFields && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">الموظف</Label>
                    <Select value={form.assigned_agent_id} onValueChange={v => setForm(prev => ({ ...prev, assigned_agent_id: v === "_none" ? "" : v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اختياري" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">بدون</SelectItem>
                        {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">الفريق</Label>
                    <Select value={form.assigned_team_id} onValueChange={v => setForm(prev => ({ ...prev, assigned_team_id: v === "_none" ? "" : v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اختياري" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">بدون</SelectItem>
                        {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Ticket fields */}
              {showTicketFields && (
                <div className="space-y-2 pt-1 border-t border-border">
                  <p className="text-[11px] font-semibold flex items-center gap-1 pt-1">
                    <Ticket className="w-3 h-3 text-primary" /> إعدادات التذكرة
                  </p>

                  <div className="space-y-1">
                    <Label className="text-[11px]">عنوان التذكرة (اختياري)</Label>
                    <Input
                      placeholder="استخدم {{subject}} لعنوان الإيميل — أو اتركه فارغ"
                      value={form.ticket_title_template}
                      onChange={e => setForm(prev => ({ ...prev, ticket_title_template: e.target.value }))}
                      className="h-8 text-xs"
                    />
                    <p className="text-[9px] text-muted-foreground">متغيرات متاحة: {"{{subject}}"} عنوان الإيميل، {"{{sender}}"} اسم المرسل</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">التصنيف</Label>
                      <Select value={form.ticket_category} onValueChange={v => setForm(prev => ({ ...prev, ticket_category: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TICKET_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">الأولوية</Label>
                      <Select value={form.ticket_priority} onValueChange={v => setForm(prev => ({ ...prev, ticket_priority: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TICKET_PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.include_attachments}
                      onCheckedChange={v => setForm(prev => ({ ...prev, include_attachments: v }))}
                    />
                    <Label className="text-[11px]">إرفاق مرفقات الإيميل بالتذكرة</Label>
                  </div>
                </div>
              )}
            </div>

            {/* Save */}
            <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              حفظ القاعدة
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmailAutomationRules;
