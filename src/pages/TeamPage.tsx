import { useState, useEffect, useMemo } from "react";
import { Plus, Shield, MoreVertical, Trash2, Edit, Save, UserPlus, Users, Layers, Clock, Eye, CalendarDays, AlertTriangle, CheckCircle, Settings2, Zap, Hand, RotateCcw, Scale, Target, MessageSquare, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { supabase, invokeCloud } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

const roleConfig: Record<string, { label: string; className: string }> = {
  admin: { label: "مدير", className: "bg-kpi-3/10 text-kpi-3" },
  supervisor: { label: "مشرف", className: "bg-warning/10 text-warning" },
  member: { label: "موظف", className: "bg-info/10 text-info" },
};

const strategyConfig: Record<string, { label: string; icon: typeof Zap; description: string; color: string }> = {
  manual: { label: "يدوي", icon: Hand, description: "المدير يسند يدوياً", color: "text-muted-foreground" },
  round_robin: { label: "بالدور", icon: RotateCcw, description: "توزيع بالتناوب", color: "text-primary" },
  least_busy: { label: "الأقل ضغطاً", icon: Scale, description: "الأقل محادثات مفتوحة", color: "text-success" },
  skill_based: { label: "حسب المهارة", icon: Target, description: "بناءً على كلمات مفتاحية", color: "text-warning" },
};

const TeamPage = () => {
  const { orgId, userRole } = useAuth();
  const [teams, setTeams] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [convCounts, setConvCounts] = useState<Record<string, number>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [scheduleDialog, setScheduleDialog] = useState<any>(null);
  const [editingProfile, setEditingProfile] = useState<any>(null);
  const [formTeam, setFormTeam] = useState("");
  const [formRole, setFormRole] = useState("member");
  const [newTeamName, setNewTeamName] = useState("");
  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("17:00");
  const [workDays, setWorkDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [hasShift2, setHasShift2] = useState(false);
  const [workStart2, setWorkStart2] = useState("18:00");
  const [workEnd2, setWorkEnd2] = useState("02:00");
  const [workDays2, setWorkDays2] = useState<number[]>([]);

  // Assignment config dialog
  const [assignDialog, setAssignDialog] = useState<any>(null);
  const [assignStrategy, setAssignStrategy] = useState("round_robin");
  const [assignMaxConv, setAssignMaxConv] = useState<string>("");
  const [assignKeywords, setAssignKeywords] = useState("");
  const [slaEnabled, setSlaEnabled] = useState(false);
  const [slaTimeout, setSlaTimeout] = useState("30");
  const [slaAction, setSlaAction] = useState("reassign");

  const dayLabels = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

  useEffect(() => {
    if (orgId) load();
    // Refresh every 30s to update online status
    const interval = setInterval(() => { if (orgId) load(); }, 30000);
    return () => clearInterval(interval);
  }, [orgId]);

  const load = async () => {
    const [t, p, r, conv] = await Promise.all([
      supabase.from("teams").select("*").eq("org_id", orgId),
      supabase.from("profiles").select("*").eq("org_id", orgId),
      supabase.from("user_roles").select("*"),
      supabase.from("conversations").select("assigned_to, status").eq("org_id", orgId).eq("status", "active"),
    ]);
    setTeams(t.data || []);
    setProfiles(p.data || []);
    setRoles(r.data || []);

    // Build conversation count map by assigned_to (full_name)
    const counts: Record<string, number> = {};
    (conv.data || []).forEach((c: any) => {
      if (c.assigned_to) {
        counts[c.assigned_to] = (counts[c.assigned_to] || 0) + 1;
      }
    });
    setConvCounts(counts);
  };

  const getStoredRole = (userId: string) => {
    const r = roles.find((x) => x.user_id === userId);
    return r?.role || null;
  };

  const getDisplayRole = (profile: any) => {
    const storedRole = getStoredRole(profile.id);
    if (storedRole === "admin" || storedRole === "super_admin") return "admin";
    if (profile.is_supervisor) return "supervisor";
    return "member";
  };

  const [formSupervisor, setFormSupervisor] = useState(false);

  const openEditDialog = (profile: any) => {
    setEditingProfile(profile);
    setFormTeam(profile.team_id || "");
    setFormRole(getStoredRole(profile.id) === "admin" ? "admin" : "member");
    setFormSupervisor(profile.is_supervisor || false);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingProfile) return;
    await supabase.from("profiles").update({ team_id: formTeam || null, is_supervisor: formSupervisor }).eq("id", editingProfile.id);

    const currentRole = getStoredRole(editingProfile.id);
    if (currentRole !== formRole) {
      if (formRole === "admin") {
        if (currentRole) {
          await supabase.from("user_roles").update({ role: "admin" as any }).eq("user_id", editingProfile.id);
        } else {
          await supabase.from("user_roles").insert({ user_id: editingProfile.id, role: "admin" as any });
        }
      } else if (currentRole === "admin") {
        await supabase.from("user_roles").delete().eq("user_id", editingProfile.id).eq("role", "admin");
      }
    }
    toast.success("تم تحديث بيانات العضو");
    setDialogOpen(false);
    load();
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) { toast.error("يرجى كتابة اسم الفريق"); return; }
    await supabase.from("teams").insert({ org_id: orgId, name: newTeamName });
    toast.success(`تم إنشاء فريق "${newTeamName}"`);
    setTeamDialogOpen(false);
    setNewTeamName("");
    load();
  };

  const handleDeleteTeam = async (teamId: string) => {
    await supabase.from("profiles").update({ team_id: null }).eq("team_id", teamId);
    await supabase.from("teams").delete().eq("id", teamId);
    toast.success("تم حذف الفريق");
    load();
  };

  const handleDeleteMember = async (profile: any) => {
    if (!confirm(`هل أنت متأكد من حذف "${profile.full_name}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    try {
      // Delete role, profile data via edge function
      const { data, error } = await invokeCloud("admin-delete-member", {
        body: { user_id: profile.id },
      });
      if (error || data?.error) {
        toast.error(data?.error || "فشل حذف الموظف");
        return;
      }
      toast.success(`تم حذف ${profile.full_name}`);
      load();
    } catch (e: any) {
      toast.error(e.message || "خطأ غير متوقع");
    }
  };

  const openSchedule = (profile: any) => {
    setScheduleDialog(profile);
    setWorkStart(profile.work_start || "09:00");
    setWorkEnd(profile.work_end || "17:00");
    setWorkDays(profile.work_days || [0, 1, 2, 3, 4]);
    const has2 = !!(profile.work_start_2 || profile.work_end_2);
    setHasShift2(has2);
    setWorkStart2(profile.work_start_2 || "18:00");
    setWorkEnd2(profile.work_end_2 || "02:00");
    setWorkDays2(profile.work_days_2 || []);
  };

  const saveSchedule = async () => {
    if (!scheduleDialog) return;
    const update: any = {
      work_start: workStart,
      work_end: workEnd,
      work_days: workDays,
      work_start_2: hasShift2 ? workStart2 : null,
      work_end_2: hasShift2 ? workEnd2 : null,
      work_days_2: hasShift2 ? workDays2 : null,
    };
    await supabase.from("profiles").update(update).eq("id", scheduleDialog.id);
    toast.success("تم حفظ أوقات العمل");
    setScheduleDialog(null);
    load();
  };

  const toggleDay = (day: number) => {
    setWorkDays((d) => d.includes(day) ? d.filter((x) => x !== day) : [...d, day].sort());
  };

  const toggleDay2 = (day: number) => {
    setWorkDays2((d) => d.includes(day) ? d.filter((x) => x !== day) : [...d, day].sort());
  };

  const openAssignDialog = (team: any) => {
    setAssignDialog(team);
    setAssignStrategy(team.assignment_strategy || "round_robin");
    setAssignMaxConv(team.max_conversations_per_agent ? String(team.max_conversations_per_agent) : "");
    const kw: string[] = Array.isArray(team.skill_keywords) ? team.skill_keywords : [];
    setAssignKeywords(kw.join("، "));
    setSlaEnabled(team.sla_enabled || false);
    setSlaTimeout(team.response_timeout_minutes ? String(team.response_timeout_minutes) : "30");
    setSlaAction(team.escalation_action || "reassign");
  };

  const saveAssignConfig = async () => {
    if (!assignDialog) return;
    const keywords = assignKeywords
      .split(/[,،\n]/)
      .map((k: string) => k.trim())
      .filter(Boolean);
    await supabase.from("teams").update({
      assignment_strategy: assignStrategy,
      max_conversations_per_agent: assignMaxConv ? parseInt(assignMaxConv) : null,
      skill_keywords: keywords,
      sla_enabled: slaEnabled,
      response_timeout_minutes: slaTimeout ? parseInt(slaTimeout) : 30,
      escalation_action: slaAction,
    } as any).eq("id", assignDialog.id);
    toast.success("تم حفظ إعدادات الإسناد");
    setAssignDialog(null);
    load();
  };

  const isAdmin = userRole === "admin" || userRole === "super_admin";

  // Invite member state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteTeams, setInviteTeams] = useState<string[]>([]);
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ temp_password?: string; email?: string } | null>(null);

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteName.trim()) { toast.error("يرجى تعبئة الاسم والبريد"); return; }
    setInviting(true);
    try {
      const { data, error } = await invokeCloud("invite-member", {
        body: { email: inviteEmail.trim(), full_name: inviteName.trim(), team_ids: inviteTeams.length ? inviteTeams : null, role: inviteRole },
      });
      const res = { data, error };
      if (res.error || res.data?.error) {
        toast.error(res.data?.error || "فشل إضافة الموظف");
      } else {
        toast.success(`تمت إضافة ${inviteName} بنجاح`);
        setInviteResult({ temp_password: res.data.temp_password, email: inviteEmail.trim() });
        load();
      }
    } catch (e: any) {
      toast.error(e.message || "خطأ غير متوقع");
    }
    setInviting(false);
  };

  const resetInviteForm = () => {
    setInviteEmail("");
    setInviteName("");
    setInviteTeams([]);
    setInviteRole("member");
    setInviteResult(null);
    setInviteOpen(false);
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-[1100px] mx-auto" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-info/10 flex items-center justify-center ring-1 ring-info/15">
            <Users className="w-5 h-5 text-info" />
          </div>
          <div>
            <h1 className="text-xl font-black text-foreground tracking-tight">الفريق</h1>
            <p className="text-sm text-muted-foreground">إدارة الفرق والأعضاء والصلاحيات</p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button className="gap-2 text-xs rounded-xl" onClick={() => setInviteOpen(true)}>
              <UserPlus className="w-4 h-4" /> أضف موظف
            </Button>
            <Button variant="outline" className="gap-2 text-xs rounded-xl border-border/50" onClick={() => setTeamDialogOpen(true)}>
              <Layers className="w-4 h-4" /> فريق جديد
            </Button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in">
        {[
          { value: profiles.length, label: "إجمالي الأعضاء", color: "text-foreground", iconBg: "bg-secondary/60" },
          { value: profiles.filter((m) => m.is_online || (m.last_seen_at && Date.now() - new Date(m.last_seen_at).getTime() < 2.5 * 60 * 1000)).length, label: "متصلون الآن", color: "text-success", iconBg: "bg-success/10" },
          { value: teams.length, label: "عدد الفرق", color: "text-primary", iconBg: "bg-primary/10" },
          { value: roles.filter((r) => r.role === "admin").length, label: "مدراء", color: "text-kpi-3", iconBg: "bg-kpi-3/10" },
        ].map((stat, i) => (
          <div key={i} className="bg-card/70 backdrop-blur-sm rounded-2xl p-4 border border-border/40 hover:border-border/80 transition-all">
            <p className={cn("text-2xl font-black", stat.color)}>{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
          <div className="w-1.5 h-5 rounded-full bg-primary" />
          الفرق
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {teams.map((team) => {
            const teamMembers = profiles.filter((m) => m.team_id === team.id);
            const onlineCount = teamMembers.filter((m) => m.is_online || (m.last_seen_at && Date.now() - new Date(m.last_seen_at).getTime() < 2.5 * 60 * 1000)).length;
            const sc = strategyConfig[team.assignment_strategy] || strategyConfig.round_robin;
            const StrategyIcon = sc.icon;
            return (
              <div key={team.id} className="bg-card/70 backdrop-blur-sm rounded-2xl p-4 border border-border/40 hover:border-border/80 hover:shadow-card-hover transition-all duration-200">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-primary" />
                    <h4 className="font-semibold text-sm">{team.name}</h4>
                  </div>
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 rounded hover:bg-secondary"><MoreVertical className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => openAssignDialog(team)} className="text-xs gap-2">
                          <Settings2 className="w-3.5 h-3.5" /> إعدادات الإسناد
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDeleteTeam(team.id)} className="text-xs text-destructive gap-2">
                          <Trash2 className="w-3.5 h-3.5" /> حذف الفريق
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                {/* Strategy badge */}
                <div className="flex items-center gap-1.5 mb-2">
                  <StrategyIcon className={cn("w-3 h-3", sc.color)} />
                  <span className={cn("text-[10px] font-medium", sc.color)}>{sc.label}</span>
                  {team.max_conversations_per_agent && (
                    <span className="text-[9px] bg-secondary px-1.5 py-0.5 rounded-full text-muted-foreground">
                      حد: {team.max_conversations_per_agent} محادثة
                    </span>
                  )}
                  {team.sla_enabled && (
                    <span className="text-[9px] bg-warning/10 text-warning px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                      <Timer className="w-2.5 h-2.5" /> {team.response_timeout_minutes || 30}د
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex -space-x-2 space-x-reverse">
                    {teamMembers.slice(0, 4).map((m) => (
                      <div key={m.id} className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold border-2 border-card">
                        {m.full_name?.slice(0, 2) || "؟"}
                      </div>
                    ))}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{teamMembers.length} أعضاء • {onlineCount} متصل</span>
                </div>
              </div>
            );
          })}
          {teams.length === 0 && (
            <p className="text-xs text-muted-foreground col-span-3 text-center py-4">لا توجد فرق بعد</p>
          )}
        </div>
      </div>

      {/* Members List */}
      <div className="bg-card rounded-lg shadow-card">
        <div className="p-4 md:p-5 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">جميع الأعضاء</h3>
          <span className="text-xs text-muted-foreground">{profiles.length} عضو</span>
        </div>
        <div className="divide-y divide-border">
          {profiles.map((profile) => {
            const role = getDisplayRole(profile);
            const team = teams.find((t) => t.id === profile.team_id);
            const rc = roleConfig[role] || roleConfig.member;
            const activeConvs = convCounts[profile.full_name] || 0;
            return (
              <div key={profile.id} className="p-4 md:p-5 flex items-center justify-between hover:bg-secondary/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                      {profile.full_name?.slice(0, 2) || "؟"}
                    </div>
                    <div className={cn("absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded-full border-2 border-card", (profile.is_online || (profile.last_seen_at && Date.now() - new Date(profile.last_seen_at).getTime() < 2.5 * 60 * 1000)) ? "bg-success" : "bg-muted-foreground/40")} />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{profile.full_name || "بدون اسم"}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {team && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{team.name}</span>}
                      {profile.is_supervisor && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/10 text-warning">مشرف</span>}
                      {profile.work_start && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {profile.work_start?.slice(0, 5)} - {profile.work_end?.slice(0, 5)}
                        </span>
                      )}
                      {profile.work_start_2 && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 bg-secondary px-1.5 py-0.5 rounded-full">
                          شفت 2: {profile.work_start_2?.slice(0, 5)} - {profile.work_end_2?.slice(0, 5)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1",
                    activeConvs > 0 ? "bg-warning/10 text-warning" : "bg-secondary text-muted-foreground"
                  )}>
                    <MessageSquare className="w-3 h-3" />
                    {activeConvs}
                  </span>
                  <Badge className={cn("text-[10px] border-0", rc.className)}>
                    {role === "admin" && <Shield className="w-3 h-3 ml-0.5" />}
                    {role === "supervisor" && <Eye className="w-3 h-3 ml-0.5" />}
                    {rc.label}
                  </Badge>
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1.5 rounded hover:bg-secondary transition-colors">
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => openEditDialog(profile)} className="gap-2 text-xs">
                          <Edit className="w-3.5 h-3.5" /> تعديل الدور/الفريق
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openSchedule(profile)} className="gap-2 text-xs">
                          <Clock className="w-3.5 h-3.5" /> أوقات العمل
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDeleteMember(profile)} className="gap-2 text-xs text-destructive">
                          <Trash2 className="w-3.5 h-3.5" /> حذف الموظف
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Weekly Schedule View */}
      {profiles.length > 0 && (
        <div className="bg-card rounded-lg shadow-card overflow-hidden">
          <div className="p-4 md:p-5 border-b border-border flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">الجدول الأسبوعي</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-right text-[11px] font-semibold text-muted-foreground p-3 w-[120px] sticky right-0 bg-card z-10">الموظف</th>
                  {dayLabels.map((d, i) => (
                    <th key={i} className="text-center text-[11px] font-semibold text-muted-foreground p-2">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {profiles.map((p) => {
                  const days1 = p.work_days || [];
                  const days2 = p.work_days_2 || [];
                  const s1 = p.work_start?.slice(0, 5) || "";
                  const e1 = p.work_end?.slice(0, 5) || "";
                  const s2 = p.work_start_2?.slice(0, 5) || "";
                  const e2 = p.work_end_2?.slice(0, 5) || "";
                  const isOvernight1 = e1 && s1 && e1 < s1;
                  const isOvernight2 = e2 && s2 && e2 < s2;

                  return (
                    <tr key={p.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="p-3 sticky right-0 bg-card z-10">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                            {p.full_name?.slice(0, 2) || "؟"}
                          </div>
                          <span className="text-xs font-medium truncate max-w-[80px]">{p.full_name || "بدون اسم"}</span>
                        </div>
                      </td>
                      {dayLabels.map((_, dayIdx) => {
                        const hasShift1 = days1.includes(dayIdx) && s1;
                        const hasShift2Day = days2.includes(dayIdx) && s2;
                        return (
                          <td key={dayIdx} className="p-1.5 text-center align-top">
                            <div className="space-y-1">
                              {hasShift1 && (
                                <div className="bg-primary/10 text-primary rounded-md px-1 py-1.5 text-[9px] leading-tight font-medium">
                                  {s1}-{e1}
                                  {isOvernight1 && <span className="block text-[8px] opacity-70">🌙</span>}
                                </div>
                              )}
                              {hasShift2Day && (
                                <div className="bg-info/10 text-info rounded-md px-1 py-1.5 text-[9px] leading-tight font-medium">
                                  {s2}-{e2}
                                  {isOvernight2 && <span className="block text-[8px] opacity-70">🌙</span>}
                                </div>
                              )}
                              {!hasShift1 && !hasShift2Day && (
                                <div className="text-[9px] text-muted-foreground/40 py-1.5">—</div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-border flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-primary/20" /> شفت 1</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded bg-info/20" /> شفت 2</span>
            <span>🌙 دوام ليلي (ينتهي اليوم التالي)</span>
          </div>
        </div>
      )}

      {/* Coverage Gap Analysis */}
      {profiles.length > 0 && (() => {
        // Build hourly coverage per day (0-23 hours x 7 days)
        const HOURS = Array.from({ length: 24 }, (_, i) => i);
        const coverageMap: Record<number, Record<number, string[]>> = {};
        for (let d = 0; d < 7; d++) {
          coverageMap[d] = {};
          for (const h of HOURS) coverageMap[d][h] = [];
        }

        const timeToHour = (t: string) => {
          const [hh] = (t || "").split(":");
          return parseInt(hh, 10);
        };

        const addShiftCoverage = (name: string, start: string, end: string, days: number[]) => {
          if (!start || !end || !days?.length) return;
          const sh = timeToHour(start);
          const eh = timeToHour(end);
          for (const d of days) {
            if (sh <= eh) {
              // Normal shift
              for (let h = sh; h < eh; h++) coverageMap[d]?.[h]?.push(name);
            } else {
              // Overnight: start->midnight on day d, midnight->end on day (d+1)%7
              for (let h = sh; h < 24; h++) coverageMap[d]?.[h]?.push(name);
              const nextDay = (d + 1) % 7;
              for (let h = 0; h < eh; h++) coverageMap[nextDay]?.[h]?.push(name);
            }
          }
        };

        for (const p of profiles) {
          const name = p.full_name || "بدون اسم";
          addShiftCoverage(name, p.work_start, p.work_end, p.work_days || []);
          addShiftCoverage(name, p.work_start_2, p.work_end_2, p.work_days_2 || []);
        }

        // Find gaps (hours with 0 coverage on working days)
        const gaps: { day: number; hours: number[] }[] = [];
        for (let d = 0; d < 7; d++) {
          const emptyHours = HOURS.filter(h => coverageMap[d][h].length === 0);
          if (emptyHours.length > 0 && emptyHours.length < 24) {
            // Only flag days that have SOME coverage (partial gaps)
            gaps.push({ day: d, hours: emptyHours });
          }
        }

        // Group consecutive hours for display
        const groupConsecutive = (hours: number[]): string[] => {
          if (!hours.length) return [];
          const sorted = [...hours].sort((a, b) => a - b);
          const ranges: string[] = [];
          let start = sorted[0], prev = sorted[0];
          for (let i = 1; i <= sorted.length; i++) {
            if (i < sorted.length && sorted[i] === prev + 1) {
              prev = sorted[i];
            } else {
              ranges.push(start === prev 
                ? `${String(start).padStart(2, '0')}:00` 
                : `${String(start).padStart(2, '0')}:00-${String(prev + 1).padStart(2, '0')}:00`
              );
              if (i < sorted.length) { start = sorted[i]; prev = sorted[i]; }
            }
          }
          return ranges;
        };

        const hasGaps = gaps.length > 0;
        const noCoverageDays = Array.from({ length: 7 }, (_, d) => d).filter(d => 
          HOURS.every(h => coverageMap[d][h].length === 0)
        );

        return (
          <div className={cn(
            "rounded-lg shadow-card overflow-hidden border",
            hasGaps ? "bg-destructive/5 border-destructive/20" : "bg-success/5 border-success/20"
          )}>
            <div className="p-4 md:p-5 flex items-center gap-2">
              {hasGaps ? (
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              ) : (
                <CheckCircle className="w-4 h-4 text-success shrink-0" />
              )}
              <h3 className="font-semibold text-sm">
                {hasGaps ? "توجد فجوات في التغطية" : "التغطية مكتملة ✓"}
              </h3>
            </div>
            {hasGaps && (
              <div className="px-4 md:px-5 pb-4 space-y-2">
                {gaps.map(({ day, hours }) => (
                  <div key={day} className="bg-card rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="text-xs font-semibold min-w-[60px]">{dayLabels[day]}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {groupConsecutive(hours).map((range, i) => (
                        <span key={i} className="text-[10px] bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium">
                          {range}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {noCoverageDays.length > 0 && (
                  <div className="bg-card rounded-lg p-3 flex items-center gap-2">
                    <span className="text-xs font-semibold text-warning">أيام بدون تغطية:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {noCoverageDays.map(d => (
                        <span key={d} className="text-[10px] bg-warning/10 text-warning px-2 py-0.5 rounded-full font-medium">
                          {dayLabels[d]}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground pt-1">
                  💡 الفترات أعلاه ليس فيها أي موظف متاح — قد لا يتم الرد على العملاء خلالها
                </p>
              </div>
            )}
            {!hasGaps && (
              <p className="px-4 md:px-5 pb-4 text-xs text-muted-foreground">
                جميع ساعات العمل مغطاة بموظف واحد على الأقل
              </p>
            )}
          </div>
        );
      })()}

      {/* Info */}
      <div className="bg-card rounded-lg p-5 shadow-card">
        <h3 className="font-semibold text-sm mb-3">كيف تعمل الصلاحيات؟</h3>
        <ul className="text-xs text-muted-foreground space-y-2 pr-4">
          <li>• <strong className="text-foreground">المدير:</strong> يرى جميع المحادثات ويدير الفريق والإعدادات</li>
          <li>• <strong className="text-foreground">المشرف:</strong> يرى محادثات فريقه كاملة بما فيها المسندة لأعضاء آخرين</li>
          <li>• <strong className="text-foreground">الموظف:</strong> يرى المحادثات المسندة له فقط + الغير مسندة لأحد في فريقه</li>
          <li>• الإسناد الآلي يوزع على الموظفين المتاحين حسب أوقات عملهم</li>
        </ul>
      </div>

      {/* Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل {editingProfile?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">الدور</Label>
              <Select value={formRole} onValueChange={setFormRole}>
                <SelectTrigger className="bg-secondary border-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">مدير</SelectItem>
                  <SelectItem value="member">موظف</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">الفريق</Label>
              <Select value={formTeam} onValueChange={setFormTeam}>
                <SelectTrigger className="bg-secondary border-0"><SelectValue placeholder="بدون فريق" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">بدون فريق</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Supervisor Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs">مشرف فريق</Label>
                <p className="text-[10px] text-muted-foreground">يرى جميع محادثات فريقه</p>
              </div>
              <Switch checked={formSupervisor} onCheckedChange={setFormSupervisor} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} className="gap-1.5"><Save className="w-4 h-4" /> حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={!!scheduleDialog} onOpenChange={() => setScheduleDialog(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>أوقات عمل {scheduleDialog?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Shift 1 */}
            <div className="space-y-3">
              <p className="text-xs font-semibold flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-primary" /> الشفت الأول
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px]">بداية العمل</Label>
                  <Input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} className="bg-secondary border-0 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px]">نهاية العمل</Label>
                  <Input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} className="bg-secondary border-0 text-sm" />
                  {workEnd < workStart && (
                    <p className="text-[9px] text-info">⏳ ينتهي صباح اليوم التالي</p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px]">أيام العمل</Label>
                <div className="flex flex-wrap gap-1.5">
                  {dayLabels.map((label, i) => (
                    <button
                      key={i}
                      onClick={() => toggleDay(i)}
                      className={cn(
                        "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                        workDays.includes(i) ? "bg-primary text-primary-foreground border-primary" : "bg-secondary border-border"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Shift 2 Toggle */}
            <div className="border-t border-border pt-4">
              <button
                onClick={() => setHasShift2(!hasShift2)}
                className={cn(
                  "w-full text-xs font-semibold py-2 rounded-lg border transition-colors flex items-center justify-center gap-2",
                  hasShift2 ? "bg-primary/10 border-primary text-primary" : "bg-secondary border-border text-muted-foreground hover:border-primary/50"
                )}
              >
                <Plus className="w-3.5 h-3.5" />
                {hasShift2 ? "إزالة الشفت الثاني" : "إضافة شفت ثاني"}
              </button>
            </div>

            {/* Shift 2 */}
            {hasShift2 && (
              <div className="space-y-3 bg-secondary/30 rounded-lg p-3">
                <p className="text-xs font-semibold flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-info" /> الشفت الثاني
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px]">بداية العمل</Label>
                    <Input type="time" value={workStart2} onChange={(e) => setWorkStart2(e.target.value)} className="bg-card border-0 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px]">نهاية العمل</Label>
                    <Input type="time" value={workEnd2} onChange={(e) => setWorkEnd2(e.target.value)} className="bg-card border-0 text-sm" />
                    {workEnd2 < workStart2 && (
                      <p className="text-[9px] text-info">⏳ ينتهي صباح اليوم التالي</p>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px]">أيام العمل</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {dayLabels.map((label, i) => (
                      <button
                        key={i}
                        onClick={() => toggleDay2(i)}
                        className={cn(
                          "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                          workDays2.includes(i) ? "bg-info text-info-foreground border-info" : "bg-card border-border"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setScheduleDialog(null)}>إلغاء</Button>
            <Button onClick={saveSchedule} className="gap-1.5"><Clock className="w-4 h-4" /> حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Team Dialog */}
      <Dialog open={teamDialogOpen} onOpenChange={setTeamDialogOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>إنشاء فريق جديد</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">اسم الفريق</Label>
              <Input value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="مثال: فريق التسويق" className="bg-secondary border-0" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTeamDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleCreateTeam} className="gap-1.5"><Layers className="w-4 h-4" /> إنشاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assignment Config Dialog */}
      <Dialog open={!!assignDialog} onOpenChange={() => setAssignDialog(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              إعدادات الإسناد — {assignDialog?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Strategy Selection */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">طريقة الإسناد</Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(strategyConfig).map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  const isSelected = assignStrategy === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setAssignStrategy(key)}
                      className={cn(
                        "p-3 rounded-lg border text-right transition-all",
                        isSelected
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border bg-secondary/30 hover:border-primary/30"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={cn("w-4 h-4", isSelected ? cfg.color : "text-muted-foreground")} />
                        <span className={cn("text-xs font-semibold", isSelected ? "text-foreground" : "text-muted-foreground")}>
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">{cfg.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Max Conversations */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">الحد الأقصى للمحادثات لكل موظف</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={assignMaxConv}
                  onChange={(e) => setAssignMaxConv(e.target.value)}
                  placeholder="بدون حد"
                  className="bg-secondary border-0 text-sm w-28"
                />
                <span className="text-[10px] text-muted-foreground">
                  {assignMaxConv ? `إذا وصل الموظف لـ ${assignMaxConv} محادثة لن يُسند له جديد` : "بدون حد أقصى"}
                </span>
              </div>
            </div>

            {/* Skill Keywords (only for skill_based) */}
            {assignStrategy === "skill_based" && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold">كلمات مفتاحية للتوجيه</Label>
                <Textarea
                  value={assignKeywords}
                  onChange={(e) => setAssignKeywords(e.target.value)}
                  placeholder="مثال: شكوى، إرجاع، استفسار&#10;افصل بفاصلة أو سطر جديد"
                  className="bg-secondary border-0 text-sm min-h-[80px]"
                />
                <p className="text-[10px] text-muted-foreground">
                  إذا احتوت رسالة العميل على أي من هذه الكلمات سيتم توجيهها لهذا الفريق تلقائياً
                </p>
              </div>
            )}

            {/* SLA Response Timeout */}
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Timer className="w-4 h-4 text-warning" />
                  <Label className="text-xs font-semibold">مهلة وقت الاستجابة (SLA)</Label>
                </div>
                <Switch checked={slaEnabled} onCheckedChange={setSlaEnabled} />
              </div>
              {slaEnabled && (
                <div className="space-y-3 bg-warning/5 rounded-lg p-3">
                  <div className="space-y-2">
                    <Label className="text-[11px]">المهلة بالدقائق</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min="1"
                        max="1440"
                        value={slaTimeout}
                        onChange={(e) => setSlaTimeout(e.target.value)}
                        className="bg-card border-0 text-sm w-28"
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {parseInt(slaTimeout || "30") >= 60
                          ? `${Math.floor(parseInt(slaTimeout || "30") / 60)} ساعة ${parseInt(slaTimeout || "30") % 60 > 0 ? `و ${parseInt(slaTimeout || "30") % 60} دقيقة` : ""}`
                          : `${slaTimeout || 30} دقيقة`}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[11px]">الإجراء عند تجاوز المهلة</Label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {[
                        { value: "reassign", label: "إعادة إسناد لموظف آخر", desc: "يتم نقل المحادثة لأقل موظف ضغطاً في الفريق", icon: RotateCcw, color: "text-primary" },
                        { value: "supervisor", label: "تصعيد للمشرف", desc: "يتم نقل المحادثة للمشرف أو المدير في الفريق", icon: Shield, color: "text-warning" },
                        { value: "unassign", label: "إلغاء الإسناد", desc: "يتم إلغاء إسناد المحادثة وإعادتها للتوزيع التلقائي", icon: AlertTriangle, color: "text-destructive" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setSlaAction(opt.value)}
                          className={cn(
                            "flex items-start gap-2.5 p-2.5 rounded-lg border text-right transition-all",
                            slaAction === opt.value
                              ? "border-primary bg-primary/5"
                              : "border-transparent bg-card hover:border-border"
                          )}
                        >
                          <opt.icon className={cn("w-4 h-4 mt-0.5 shrink-0", slaAction === opt.value ? opt.color : "text-muted-foreground")} />
                          <div>
                            <p className="text-[11px] font-semibold">{opt.label}</p>
                            <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[9px] text-muted-foreground bg-card rounded p-2">
                    💡 يتم فحص المحادثات المتأخرة كل دقيقتين تلقائياً
                  </p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAssignDialog(null)}>إلغاء</Button>
            <Button onClick={saveAssignConfig} className="gap-1.5"><Save className="w-4 h-4" /> حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Member Dialog */}
      <Dialog open={inviteOpen} onOpenChange={(o) => { if (!o) resetInviteForm(); }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-primary" />
              إضافة موظف جديد
            </DialogTitle>
          </DialogHeader>
          {inviteResult ? (
            <div className="space-y-4 py-2">
              <div className="bg-success/10 rounded-xl p-4 text-center space-y-2">
                <CheckCircle className="w-8 h-8 text-success mx-auto" />
                <p className="text-sm font-bold">تمت الإضافة بنجاح!</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-xs">
                <p className="font-semibold">بيانات الدخول المؤقتة:</p>
                <div className="flex items-center justify-between bg-card rounded p-2">
                  <span className="text-muted-foreground">البريد:</span>
                  <span className="font-mono text-[11px] select-all">{inviteResult.email}</span>
                </div>
                <div className="flex items-center justify-between bg-card rounded p-2">
                  <span className="text-muted-foreground">كلمة المرور:</span>
                  <span className="font-mono text-[11px] select-all">{inviteResult.temp_password}</span>
                </div>
                <p className="text-[10px] text-warning mt-2">⚠️ انسخ كلمة المرور الآن وأرسلها للموظف — لن تظهر مجدداً</p>
              </div>
              <Button className="w-full" onClick={resetInviteForm}>تم</Button>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-xs">الاسم الكامل *</Label>
                <Input placeholder="محمد أحمد" value={inviteName} onChange={(e) => setInviteName(e.target.value)} className="text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">البريد الإلكتروني *</Label>
                <Input type="email" placeholder="name@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="text-sm" dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">الفرق</Label>
                <div className="space-y-1.5 max-h-32 overflow-y-auto bg-muted/30 rounded-lg p-2">
                  {teams.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground text-center py-2">لا توجد فرق — أنشئ فريق أولاً</p>
                  ) : teams.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={inviteTeams.includes(t.id)}
                        onChange={(e) => {
                          if (e.target.checked) setInviteTeams([...inviteTeams, t.id]);
                          else setInviteTeams(inviteTeams.filter((id: string) => id !== t.id));
                        }}
                        className="rounded border-border"
                      />
                      <span className="text-xs">{t.name}</span>
                    </label>
                  ))}
                </div>
                {inviteTeams.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">{inviteTeams.length} فريق محدد</p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs">الصلاحية</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member" className="text-xs">موظف</SelectItem>
                    <SelectItem value="supervisor" className="text-xs">مشرف فريق</SelectItem>
                    <SelectItem value="admin" className="text-xs">مدير</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={resetInviteForm}>إلغاء</Button>
                <Button onClick={handleInvite} disabled={inviting} className="gap-1.5">
                  {inviting ? <span className="animate-spin">⏳</span> : <UserPlus className="w-4 h-4" />}
                  إضافة
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamPage;
