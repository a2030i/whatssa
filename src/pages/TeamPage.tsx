import { useState, useEffect, useMemo } from "react";
import { Plus, Shield, MoreVertical, Trash2, Edit, Save, UserPlus, Users, Layers, Clock, Eye, CalendarDays, AlertTriangle, CheckCircle, Settings2, Zap, Hand, RotateCcw, Scale, Target } from "lucide-react";
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
    <div className="p-3 md:p-6 space-y-6 max-w-[1000px]" dir="rtl">
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
    </div>
  );
};

export default TeamPage;
