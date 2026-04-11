import { useState, useEffect } from "react";
import { Users, User, Loader2, Bot, MessageSquare } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface Props {
  configId: string;
  orgId: string;
  defaultTeamId?: string | null;
  defaultAgentId?: string | null;
  excludeSupervisors?: boolean;
  aiAutoReplyEnabled?: boolean;
  aiMaxAttempts?: number;
  aiTransferKeywords?: string[];
}

const ChannelRoutingConfig = ({
  configId, orgId, defaultTeamId, defaultAgentId,
  excludeSupervisors: defaultExclude,
  aiAutoReplyEnabled: defaultAiEnabled,
  aiMaxAttempts: defaultMaxAttempts,
  aiTransferKeywords: defaultKeywords,
}: Props) => {
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState(defaultTeamId || "");
  const [selectedAgentId, setSelectedAgentId] = useState(defaultAgentId || "");
  const [excludeSupervisors, setExcludeSupervisors] = useState(defaultExclude ?? false);
  const [supportsExcludeSupervisors, setSupportsExcludeSupervisors] = useState(true);
  const [saving, setSaving] = useState(false);

  // AI settings
  const [aiEnabled, setAiEnabled] = useState(defaultAiEnabled ?? false);
  const [aiMaxAttempts, setAiMaxAttempts] = useState(defaultMaxAttempts ?? 3);
  const [aiKeywords, setAiKeywords] = useState((defaultKeywords || ["موظف", "بشري", "agent", "human"]).join(", "));

  useEffect(() => {
    const load = async () => {
      const [teamsRes, agentsRes] = await Promise.all([
        supabase.from("teams").select("id, name").eq("org_id", orgId),
        supabase.from("profiles").select("id, full_name").eq("org_id", orgId).eq("is_active", true),
      ]);
      setTeams(teamsRes.data || []);
      setAgents(agentsRes.data || []);
    };
    load();
  }, [orgId]);

  const save = async (
    teamId: string | null,
    agentId: string | null,
    exclSup: boolean,
    source: "routing" | "exclude" = "routing"
  ) => {
    setSaving(true);

    const basePayload = {
      default_team_id: teamId || null,
      default_agent_id: agentId || null,
    } as any;

    let usedFallback = false;

    let { error } = await supabase
      .from("whatsapp_config")
      .update({
        ...basePayload,
        exclude_supervisors: exclSup,
      } as any)
      .eq("id", configId);

    if (error?.message?.includes("exclude_supervisors")) {
      usedFallback = true;
      setSupportsExcludeSupervisors(false);
      setExcludeSupervisors(false);

      const retry = await supabase
        .from("whatsapp_config")
        .update(basePayload)
        .eq("id", configId);

      error = retry.error;
    }

    setSaving(false);

    if (error) {
      toast.error("فشل حفظ التوجيه");
    } else {
      toast.success(
        usedFallback && source === "exclude"
          ? "تم الحفظ بدون استثناء المشرفين"
          : "تم حفظ إعدادات التوجيه"
      );
    }
  };

  const saveAiSettings = async (enabled: boolean, maxAttempts: number, keywords: string) => {
    setSaving(true);
    const keywordsArr = keywords.split(",").map(k => k.trim()).filter(Boolean);

    const { error } = await supabase
      .from("whatsapp_config")
      .update({
        ai_auto_reply_enabled: enabled,
        ai_max_attempts: maxAttempts,
        ai_transfer_keywords: keywordsArr,
      } as any)
      .eq("id", configId);

    setSaving(false);
    if (error) toast.error("فشل حفظ إعدادات AI");
    else toast.success("تم حفظ إعدادات AI");
  };

  const handleTeamChange = (val: string) => {
    const v = val === "none" ? "" : val;
    setSelectedTeamId(v);
    if (v) setSelectedAgentId("");
    save(v || null, v ? null : selectedAgentId || null, excludeSupervisors, "routing");
  };

  const handleAgentChange = (val: string) => {
    const v = val === "none" ? "" : val;
    setSelectedAgentId(v);
    if (v) { setSelectedTeamId(""); setExcludeSupervisors(false); }
    save(v ? null : selectedTeamId || null, v || null, v ? false : excludeSupervisors, "routing");
  };

  const handleExcludeToggle = (checked: boolean) => {
    setExcludeSupervisors(checked);
    save(selectedTeamId || null, selectedAgentId || null, checked, "exclude");
  };

  const handleAiToggle = (checked: boolean) => {
    setAiEnabled(checked);
    saveAiSettings(checked, aiMaxAttempts, aiKeywords);
  };

  const handleAiMaxAttemptsChange = (val: string) => {
    const num = Math.max(1, Math.min(20, parseInt(val) || 3));
    setAiMaxAttempts(num);
    saveAiSettings(aiEnabled, num, aiKeywords);
  };

  const handleAiKeywordsBlur = () => {
    saveAiSettings(aiEnabled, aiMaxAttempts, aiKeywords);
  };

  return (
    <div className="space-y-3">
      {/* Routing Section */}
      <div className="bg-muted/50 rounded-xl p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <Label className="text-xs font-bold">توجيه المحادثات الجديدة</Label>
          {saving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          {(selectedTeamId || selectedAgentId) && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-primary/30 text-primary bg-primary/5 mr-auto">
              مُفعّل
            </Badge>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          حدد فريق أو موظف لاستقبال المحادثات القادمة من هذه القناة تلقائياً
        </p>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Users className="w-3 h-3" /> فريق
            </Label>
            <Select value={selectedTeamId || "none"} onValueChange={handleTeamChange}>
              <SelectTrigger className="h-8 text-xs bg-card">
                <SelectValue placeholder="بدون تحديد" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">بدون تحديد</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
              <User className="w-3 h-3" /> موظف
            </Label>
            <Select value={selectedAgentId || "none"} onValueChange={handleAgentChange}>
              <SelectTrigger className="h-8 text-xs bg-card">
                <SelectValue placeholder="بدون تحديد" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">بدون تحديد</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">{a.full_name || "بدون اسم"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedTeamId && supportsExcludeSupervisors && (
          <div className="flex items-center justify-between pt-1">
            <Label className="text-[10px] text-muted-foreground">استثناء المشرفين من التوزيع التلقائي</Label>
            <Switch
              checked={excludeSupervisors}
              onCheckedChange={handleExcludeToggle}
              className="scale-75"
            />
          </div>
        )}
      </div>

      {/* AI Auto-Reply Section */}
      <div className="bg-muted/50 rounded-xl p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            <Label className="text-xs font-bold">الرد التلقائي بالذكاء الاصطناعي</Label>
          </div>
          <Switch
            checked={aiEnabled}
            onCheckedChange={handleAiToggle}
            className="scale-75"
          />
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          AI يرد على العملاء من قاعدة المعرفة المرتبطة بهذه القناة، ويحوّل للموظف عند الحاجة
        </p>

        {aiEnabled && (
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" /> حد المحاولات
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={aiMaxAttempts}
                  onChange={e => setAiMaxAttempts(parseInt(e.target.value) || 3)}
                  onBlur={e => handleAiMaxAttemptsChange(e.target.value)}
                  className="h-8 text-xs bg-card"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">بعد الحد</Label>
                <p className="text-[10px] bg-card rounded-lg border border-border px-2 py-1.5 text-muted-foreground">
                  تحويل تلقائي لموظف
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">كلمات التحويل الفوري (مفصولة بفاصلة)</Label>
              <Input
                value={aiKeywords}
                onChange={e => setAiKeywords(e.target.value)}
                onBlur={handleAiKeywordsBlur}
                placeholder="موظف, بشري, agent"
                className="h-8 text-xs bg-card"
                dir="auto"
              />
              <p className="text-[9px] text-muted-foreground">عند كتابة العميل أي من هذه الكلمات → تحويل فوري بدون AI</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChannelRoutingConfig;

