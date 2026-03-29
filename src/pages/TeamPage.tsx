import { useState, useEffect } from "react";
import { Plus, Shield, MoreVertical, Trash2, Edit, Save, UserPlus, Users, Layers, Clock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const roleConfig: Record<string, { label: string; className: string }> = {
  admin: { label: "مدير", className: "bg-kpi-3/10 text-kpi-3" },
  supervisor: { label: "مشرف", className: "bg-warning/10 text-warning" },
  member: { label: "موظف", className: "bg-info/10 text-info" },
};

const TeamPage = () => {
  const { orgId, userRole } = useAuth();
  const [teams, setTeams] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
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

  const dayLabels = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

  useEffect(() => {
    if (orgId) load();
  }, [orgId]);

  const load = async () => {
    const [t, p, r] = await Promise.all([
      supabase.from("teams").select("*").eq("org_id", orgId),
      supabase.from("profiles").select("*").eq("org_id", orgId),
      supabase.from("user_roles").select("*"),
    ]);
    setTeams(t.data || []);
    setProfiles(p.data || []);
    setRoles(r.data || []);
  };

  const getRole = (userId: string) => {
    const r = roles.find((x) => x.user_id === userId);
    return r?.role || "member";
  };

  const openEditDialog = (profile: any) => {
    setEditingProfile(profile);
    setFormTeam(profile.team_id || "");
    setFormRole(getRole(profile.id));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingProfile) return;
    await supabase.from("profiles").update({ team_id: formTeam || null }).eq("id", editingProfile.id);

    const currentRole = getRole(editingProfile.id);
    if (currentRole !== formRole && (formRole === "member" || formRole === "supervisor" || formRole === "admin")) {
      await supabase.from("user_roles").update({ role: formRole as any }).eq("user_id", editingProfile.id);
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

  const isAdmin = userRole === "admin" || userRole === "super_admin";

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1000px]" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">الفريق</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة الفرق والأعضاء والصلاحيات</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2 text-xs" onClick={() => setTeamDialogOpen(true)}>
              <Layers className="w-4 h-4" /> فريق جديد
            </Button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-lg p-4 shadow-card text-center">
          <p className="text-2xl font-bold">{profiles.length}</p>
          <p className="text-xs text-muted-foreground">إجمالي الأعضاء</p>
        </div>
        <div className="bg-card rounded-lg p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-success">{profiles.filter((m) => m.is_online).length}</p>
          <p className="text-xs text-muted-foreground">متصلون الآن</p>
        </div>
        <div className="bg-card rounded-lg p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-primary">{teams.length}</p>
          <p className="text-xs text-muted-foreground">عدد الفرق</p>
        </div>
        <div className="bg-card rounded-lg p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-kpi-3">{roles.filter((r) => r.role === "admin").length}</p>
          <p className="text-xs text-muted-foreground">مدراء</p>
        </div>
      </div>

      {/* Teams */}
      <div>
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> الفرق</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {teams.map((team) => {
            const teamMembers = profiles.filter((m) => m.team_id === team.id);
            const onlineCount = teamMembers.filter((m) => m.is_online).length;
            return (
              <div key={team.id} className="bg-card rounded-lg p-4 shadow-card border border-border hover:shadow-card-hover transition-shadow">
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
                        <DropdownMenuItem onClick={() => handleDeleteTeam(team.id)} className="text-xs text-destructive gap-2">
                          <Trash2 className="w-3.5 h-3.5" /> حذف الفريق
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
            const role = getRole(profile.id);
            const team = teams.find((t) => t.id === profile.team_id);
            const rc = roleConfig[role] || roleConfig.member;
            return (
              <div key={profile.id} className="p-4 md:p-5 flex items-center justify-between hover:bg-secondary/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                      {profile.full_name?.slice(0, 2) || "؟"}
                    </div>
                    <div className={cn("absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded-full border-2 border-card", profile.is_online ? "bg-success" : "bg-muted-foreground/40")} />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{profile.full_name || "بدون اسم"}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {team && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{team.name}</span>}
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
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
                  <SelectItem value="supervisor">مشرف</SelectItem>
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
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} className="gap-1.5"><Save className="w-4 h-4" /> حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={!!scheduleDialog} onOpenChange={() => setScheduleDialog(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>أوقات عمل {scheduleDialog?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">بداية العمل</Label>
                <Input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} className="bg-secondary border-0" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">نهاية العمل</Label>
                <Input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} className="bg-secondary border-0" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">أيام العمل</Label>
              <div className="flex flex-wrap gap-2">
                {dayLabels.map((label, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    className={cn(
                      "text-[11px] px-3 py-1.5 rounded-full border transition-colors",
                      workDays.includes(i) ? "bg-primary text-primary-foreground border-primary" : "bg-secondary border-border"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
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
    </div>
  );
};

export default TeamPage;
