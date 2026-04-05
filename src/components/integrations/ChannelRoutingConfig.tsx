import { useState, useEffect } from "react";
import { Users, User, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface Props {
  configId: string;
  orgId: string;
  defaultTeamId?: string | null;
  defaultAgentId?: string | null;
  excludeSupervisors?: boolean;
}

const ChannelRoutingConfig = ({ configId, orgId, defaultTeamId, defaultAgentId, excludeSupervisors: defaultExclude }: Props) => {
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState(defaultTeamId || "");
  const [selectedAgentId, setSelectedAgentId] = useState(defaultAgentId || "");
  const [excludeSupervisors, setExcludeSupervisors] = useState(defaultExclude || false);
  const [saving, setSaving] = useState(false);

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

  const save = async (teamId: string | null, agentId: string | null, exclSup: boolean) => {
    setSaving(true);
    const { error } = await supabase
      .from("whatsapp_config")
      .update({
        default_team_id: teamId || null,
        default_agent_id: agentId || null,
        exclude_supervisors: exclSup,
      } as any)
      .eq("id", configId);
    setSaving(false);
    if (error) {
      toast.error("فشل حفظ التوجيه");
    } else {
      toast.success("تم حفظ إعدادات التوجيه");
    }
  };

  const handleTeamChange = (val: string) => {
    const v = val === "none" ? "" : val;
    setSelectedTeamId(v);
    if (v) setSelectedAgentId("");
    save(v || null, v ? null : selectedAgentId || null, excludeSupervisors);
  };

  const handleAgentChange = (val: string) => {
    const v = val === "none" ? "" : val;
    setSelectedAgentId(v);
    if (v) { setSelectedTeamId(""); setExcludeSupervisors(false); }
    save(v ? null : selectedTeamId || null, v || null, v ? false : excludeSupervisors);
  };

  const handleExcludeToggle = (checked: boolean) => {
    setExcludeSupervisors(checked);
    save(selectedTeamId || null, selectedAgentId || null, checked);
  };

  return (
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

      {selectedTeamId && (
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
  );
};

export default ChannelRoutingConfig;
