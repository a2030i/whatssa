import { useEffect, useState } from "react";
import { Bot, Plus, Trash2, Edit, Save, Loader2, MessageCircle, Tag, Users } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import ChannelSelector from "@/components/ChannelSelector";

interface AutomationRule {
  id: string;
  name: string;
  keywords: string[];
  reply_text: string;
  enabled: boolean;
  action_type: string;
  action_tag: string | null;
  action_team_id: string | null;
}

interface Team {
  id: string;
  name: string;
}

const ACTION_LABELS: Record<string, { label: string; icon: typeof MessageCircle; color: string }> = {
  reply: { label: "رد تلقائي", icon: MessageCircle, color: "bg-primary/10 text-primary" },
  add_tag: { label: "تطبيق وسم", icon: Tag, color: "bg-success/10 text-success" },
  assign_team: { label: "إسناد لفريق", icon: Users, color: "bg-info/10 text-info" },
  reply_and_tag: { label: "رد + وسم", icon: MessageCircle, color: "bg-warning/10 text-warning" },
};

const AutomationPage = () => {
  const { toast } = useToast();
  const { orgId, user } = useAuth();
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [formName, setFormName] = useState("");
  const [formKeywords, setFormKeywords] = useState("");
  const [formReply, setFormReply] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);
  const [formActionType, setFormActionType] = useState("reply");
  const [formActionTag, setFormActionTag] = useState("");
  const [formActionTeamId, setFormActionTeamId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const table = supabase.from("automation_rules" as any);

  const loadRules = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("automation_rules" as any)
      .select("id, name, keywords, reply_text, enabled, action_type, action_tag, action_team_id")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "خطأ", description: "تعذر جلب قواعد الأتمتة", variant: "destructive" });
      setRules([]);
    } else {
      setRules((data || []) as unknown as AutomationRule[]);
    }
    setLoading(false);
  };

  const loadTeams = async () => {
    const { data } = await supabase.from("teams").select("id, name").order("name");
    setTeams((data || []) as Team[]);
  };

  const loadTags = async () => {
    const { data } = await supabase
      .from("conversations")
      .select("tags")
      .not("tags", "eq", "{}");
    if (data) {
      const tagSet = new Set<string>();
      data.forEach((c: any) => (c.tags || []).forEach((t: string) => tagSet.add(t)));
      setAllTags(Array.from(tagSet).sort());
    }
  };

  useEffect(() => {
    loadRules();
    loadTeams();
    loadTags();
  }, []);

  const openNewDialog = () => {
    setEditingRule(null);
    setFormName("");
    setFormKeywords("");
    setFormReply("");
    setFormEnabled(true);
    setFormActionType("reply");
    setFormActionTag("");
    setFormActionTeamId("");
    setDialogOpen(true);
  };

  const openEditDialog = (rule: AutomationRule) => {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormKeywords(rule.keywords.join(", "));
    setFormReply(rule.reply_text);
    setFormEnabled(rule.enabled);
    setFormActionType(rule.action_type || "reply");
    setFormActionTag(rule.action_tag || "");
    setFormActionTeamId(rule.action_team_id || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const keywords = formKeywords
      .split(/[,\n]/)
      .map((keyword) => keyword.trim())
      .filter(Boolean);

    if (!formName.trim() || keywords.length === 0) {
      toast({ title: "خطأ", description: "أدخل الاسم والكلمات المفتاحية", variant: "destructive" });
      return;
    }

    const needsReply = formActionType === "reply" || formActionType === "reply_and_tag";
    const needsTag = formActionType === "add_tag" || formActionType === "reply_and_tag";
    const needsTeam = formActionType === "assign_team";

    if (needsReply && !formReply.trim()) {
      toast({ title: "خطأ", description: "أدخل نص الرد التلقائي", variant: "destructive" });
      return;
    }
    if (needsTag && !formActionTag.trim()) {
      toast({ title: "خطأ", description: "أدخل الوسم المراد تطبيقه", variant: "destructive" });
      return;
    }
    if (needsTeam && !formActionTeamId) {
      toast({ title: "خطأ", description: "اختر الفريق المراد الإسناد إليه", variant: "destructive" });
      return;
    }

    if (!orgId || !user) {
      toast({ title: "خطأ", description: "تعذر تحديد المؤسسة الحالية", variant: "destructive" });
      return;
    }

    setSubmitting(true);

    const payload: any = {
      name: formName.trim(),
      keywords,
      reply_text: needsReply ? formReply.trim() : "",
      enabled: formEnabled,
      org_id: orgId,
      created_by: user.id,
      action_type: formActionType,
      action_tag: needsTag ? formActionTag.trim() : null,
      action_team_id: needsTeam ? formActionTeamId : null,
    };

    const response = editingRule
      ? await table.update(payload).eq("id", editingRule.id)
      : await table.insert(payload);

    if (response.error) {
      toast({ title: "خطأ", description: "تعذر حفظ القاعدة", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    toast({ title: "تم الحفظ", description: "القاعدة تعمل تلقائياً عند استقبال رسائل مطابقة" });
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
    toast({ title: "تم الحذف" });
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

  const getActionInfo = (rule: AutomationRule) => ACTION_LABELS[rule.action_type] || ACTION_LABELS.reply;
  const getTeamName = (teamId: string | null) => teams.find((t) => t.id === teamId)?.name || "—";

  const needsReply = formActionType === "reply" || formActionType === "reply_and_tag";
  const needsTag = formActionType === "add_tag" || formActionType === "reply_and_tag";
  const needsTeam = formActionType === "assign_team";

  const actionTypeCounts = rules.reduce((acc, r) => {
    acc[r.action_type] = (acc[r.action_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-3 md:p-6 space-y-6 max-w-[900px]" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">الأتمتة</h1>
          <p className="text-sm text-muted-foreground mt-1">قواعد تلقائية للرد والوسوم والإسناد بناءً على الكلمات المفتاحية</p>
        </div>
        <Button className="gap-2" onClick={openNewDialog}>
          <Plus className="w-4 h-4" />
          قاعدة جديدة
        </Button>
      </div>

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
          <p className="text-xl font-bold text-primary">{actionTypeCounts.reply || 0}</p>
          <p className="text-[10px] text-muted-foreground">رد تلقائي</p>
        </div>
        <div className="bg-card rounded-lg p-3 shadow-card text-center">
          <p className="text-xl font-bold text-info">{(actionTypeCounts.add_tag || 0) + (actionTypeCounts.assign_team || 0) + (actionTypeCounts.reply_and_tag || 0)}</p>
          <p className="text-[10px] text-muted-foreground">وسوم وإسناد</p>
        </div>
      </div>

      {loading ? (
        <div className="bg-card rounded-lg p-8 text-center text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />
          <p className="text-sm">جاري التحميل...</p>
        </div>
      ) : rules.length === 0 ? (
        <div className="bg-card rounded-lg p-8 text-center text-muted-foreground border border-border">
          <Bot className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">لا توجد قواعد أتمتة بعد</p>
          <p className="text-xs mt-1">أنشئ قاعدة للرد تلقائياً أو تطبيق وسوم أو إسناد لفريق</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => {
            const actionInfo = getActionInfo(rule);
            const ActionIcon = actionInfo.icon;
            return (
              <div key={rule.id} className={cn("bg-card rounded-lg p-4 md:p-5 shadow-card hover:shadow-card-hover transition-shadow", !rule.enabled && "opacity-60")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", actionInfo.color)}>
                      <ActionIcon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-sm">{rule.name}</h3>
                        <Badge variant="secondary" className={cn("text-[10px] border-0", actionInfo.color)}>{actionInfo.label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1"><span className="font-medium">المحفّز:</span> {rule.keywords.join("، ")}</p>
                      {(rule.action_type === "reply" || rule.action_type === "reply_and_tag") && rule.reply_text && (
                        <p className="text-xs text-muted-foreground mb-1"><span className="font-medium">الرد:</span> {rule.reply_text}</p>
                      )}
                      {(rule.action_type === "add_tag" || rule.action_type === "reply_and_tag") && rule.action_tag && (
                        <p className="text-xs text-muted-foreground mb-1">
                          <span className="font-medium">الوسم:</span>{" "}
                          <Badge variant="outline" className="text-[10px] px-1.5">{rule.action_tag}</Badge>
                        </p>
                      )}
                      {rule.action_type === "assign_team" && rule.action_team_id && (
                        <p className="text-xs text-muted-foreground mb-1">
                          <span className="font-medium">الفريق:</span> {getTeamName(rule.action_team_id)}
                        </p>
                      )}
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
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingRule ? "تعديل القاعدة" : "إضافة قاعدة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">اسم القاعدة</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="مثال: وسم عملاء VIP" className="bg-secondary border-0" />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">نوع الإجراء</Label>
              <Select value={formActionType} onValueChange={setFormActionType}>
                <SelectTrigger className="bg-secondary border-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reply">
                    <span className="flex items-center gap-2"><MessageCircle className="w-3.5 h-3.5" /> رد تلقائي</span>
                  </SelectItem>
                  <SelectItem value="add_tag">
                    <span className="flex items-center gap-2"><Tag className="w-3.5 h-3.5" /> تطبيق وسم</span>
                  </SelectItem>
                  <SelectItem value="assign_team">
                    <span className="flex items-center gap-2"><Users className="w-3.5 h-3.5" /> إسناد لفريق</span>
                  </SelectItem>
                  <SelectItem value="reply_and_tag">
                    <span className="flex items-center gap-2"><MessageCircle className="w-3.5 h-3.5" /> رد + تطبيق وسم</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">الكلمات المفتاحية</Label>
              <Textarea value={formKeywords} onChange={(e) => setFormKeywords(e.target.value)} placeholder="مرحبا، أهلاً، السلام" className="bg-secondary border-0 min-h-[70px]" />
              <p className="text-[10px] text-muted-foreground">افصل الكلمات بفاصلة أو سطر جديد</p>
            </div>

            {needsReply && (
              <div className="space-y-2">
                <Label className="text-xs">نص الرد التلقائي</Label>
                <Textarea value={formReply} onChange={(e) => setFormReply(e.target.value)} placeholder="أهلاً بك، كيف نقدر نخدمك؟" className="bg-secondary border-0 min-h-[90px]" />
              </div>
            )}

            {needsTag && (
              <div className="space-y-2">
                <Label className="text-xs">الوسم المراد تطبيقه</Label>
                <Input value={formActionTag} onChange={(e) => setFormActionTag(e.target.value)} placeholder="مثال: VIP" className="bg-secondary border-0" />
                {allTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <p className="text-[10px] text-muted-foreground w-full">اختر من الموجود:</p>
                    {allTags.slice(0, 10).map((tag) => (
                      <button
                        key={tag}
                        onClick={() => setFormActionTag(tag)}
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full transition-colors",
                          formActionTag === tag
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary hover:bg-accent text-muted-foreground"
                        )}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {needsTeam && (
              <div className="space-y-2">
                <Label className="text-xs">الفريق</Label>
                <Select value={formActionTeamId} onValueChange={setFormActionTeamId}>
                  <SelectTrigger className="bg-secondary border-0">
                    <SelectValue placeholder="اختر الفريق" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {teams.length === 0 && (
                  <p className="text-[10px] text-warning">لا توجد فرق — أنشئ فريقاً من صفحة إدارة الفريق أولاً</p>
                )}
              </div>
            )}

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
