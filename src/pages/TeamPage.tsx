import { useState } from "react";
import { Plus, Shield, MoreVertical, Trash2, Edit, Save, UserPlus, Mail, User, Users, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Role = "admin" | "agent";
type Status = "online" | "offline";

interface Team {
  id: string;
  name: string;
  color: string;
  description: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: Status;
  initials: string;
  teamId: string;
}

const roleConfig = {
  admin: { label: "مدير", className: "bg-kpi-3/10 text-kpi-3" },
  agent: { label: "موظف", className: "bg-info/10 text-info" },
};

const statusConfig = {
  online: { label: "متصل", className: "bg-success" },
  offline: { label: "غير متصل", className: "bg-muted-foreground/40" },
};

const initialTeams: Team[] = [
  { id: "cs", name: "خدمة العملاء", color: "hsl(142 64% 42%)", description: "فريق دعم العملاء والاستفسارات" },
  { id: "sales", name: "المبيعات", color: "hsl(217 91% 60%)", description: "فريق المبيعات والعروض" },
  { id: "tech", name: "الدعم التقني", color: "hsl(38 92% 50%)", description: "فريق حل المشاكل التقنية" },
];

const initialMembers: TeamMember[] = [
  { id: "1", name: "أحمد محمد", email: "ahmed@example.com", role: "admin", status: "online", initials: "أم", teamId: "cs" },
  { id: "2", name: "فاطمة علي", email: "fatima@example.com", role: "agent", status: "online", initials: "فع", teamId: "cs" },
  { id: "3", name: "خالد سعد", email: "khaled@example.com", role: "agent", status: "offline", initials: "خس", teamId: "sales" },
  { id: "4", name: "ريم ناصر", email: "reem@example.com", role: "agent", status: "online", initials: "رن", teamId: "sales" },
  { id: "5", name: "عمر يوسف", email: "omar@example.com", role: "agent", status: "offline", initials: "عي", teamId: "tech" },
];

const TeamPage = () => {
  const [teams, setTeams] = useState<Team[]>(initialTeams);
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState<Role>("agent");
  const [formTeam, setFormTeam] = useState("cs");
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const { toast } = useToast();

  const openNewDialog = () => {
    setEditingMember(null);
    setFormName(""); setFormEmail(""); setFormRole("agent"); setFormTeam("cs");
    setDialogOpen(true);
  };

  const openEditDialog = (member: TeamMember) => {
    setEditingMember(member);
    setFormName(member.name); setFormEmail(member.email); setFormRole(member.role); setFormTeam(member.teamId);
    setDialogOpen(true);
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    return parts.length >= 2 ? parts[0].charAt(0) + parts[1].charAt(0) : name.substring(0, 2);
  };

  const handleSave = () => {
    if (!formName.trim() || !formEmail.trim()) {
      toast({ title: "خطأ", description: "يرجى ملء جميع الحقول", variant: "destructive" });
      return;
    }
    if (editingMember) {
      setMembers((prev) => prev.map((m) => m.id === editingMember.id ? { ...m, name: formName, email: formEmail, role: formRole, teamId: formTeam, initials: getInitials(formName) } : m));
      toast({ title: "تم التحديث", description: `تم تحديث بيانات "${formName}"` });
    } else {
      const newMember: TeamMember = { id: Date.now().toString(), name: formName, email: formEmail, role: formRole, status: "offline", initials: getInitials(formName), teamId: formTeam };
      setMembers((prev) => [...prev, newMember]);
      toast({ title: "تمت الإضافة", description: `تم إضافة "${formName}" للفريق` });
    }
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    const member = members.find((m) => m.id === id);
    setMembers((prev) => prev.filter((m) => m.id !== id));
    toast({ title: "تم الحذف", description: `تم إزالة "${member?.name}" من الفريق` });
  };

  const handleCreateTeam = () => {
    if (!newTeamName.trim()) { toast({ title: "خطأ", description: "يرجى كتابة اسم الفريق", variant: "destructive" }); return; }
    const colors = ["hsl(280 67% 55%)", "hsl(340 75% 55%)", "hsl(170 70% 40%)"];
    setTeams((prev) => [...prev, { id: `t${Date.now()}`, name: newTeamName, color: colors[prev.length % colors.length], description: newTeamDesc }]);
    setTeamDialogOpen(false);
    setNewTeamName(""); setNewTeamDesc("");
    toast({ title: "تم الإنشاء", description: `تم إنشاء فريق "${newTeamName}"` });
  };

  const handleDeleteTeam = (teamId: string) => {
    setTeams((prev) => prev.filter((t) => t.id !== teamId));
    setMembers((prev) => prev.map((m) => m.teamId === teamId ? { ...m, teamId: "cs" } : m));
    toast({ title: "تم الحذف", description: "تم حذف الفريق ونقل أعضائه" });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1000px]" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">الفريق</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة الفرق والأعضاء والصلاحيات</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 text-xs" onClick={() => setTeamDialogOpen(true)}>
            <Layers className="w-4 h-4" /> فريق جديد
          </Button>
          <Button className="gap-2" onClick={openNewDialog}>
            <UserPlus className="w-4 h-4" /> إضافة عضو
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-lg p-4 shadow-card text-center">
          <p className="text-2xl font-bold">{members.length}</p>
          <p className="text-xs text-muted-foreground">إجمالي الأعضاء</p>
        </div>
        <div className="bg-card rounded-lg p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-success">{members.filter((m) => m.status === "online").length}</p>
          <p className="text-xs text-muted-foreground">متصلون الآن</p>
        </div>
        <div className="bg-card rounded-lg p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-primary">{teams.length}</p>
          <p className="text-xs text-muted-foreground">عدد الفرق</p>
        </div>
        <div className="bg-card rounded-lg p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-kpi-3">{members.filter((m) => m.role === "admin").length}</p>
          <p className="text-xs text-muted-foreground">مدراء</p>
        </div>
      </div>

      {/* Teams */}
      <div>
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> الفرق</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {teams.map((team) => {
            const teamMembers = members.filter((m) => m.teamId === team.id);
            const onlineCount = teamMembers.filter((m) => m.status === "online").length;
            return (
              <div key={team.id} className="bg-card rounded-lg p-4 shadow-card border border-border hover:shadow-card-hover transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                    <h4 className="font-semibold text-sm">{team.name}</h4>
                  </div>
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
                </div>
                <p className="text-xs text-muted-foreground mb-3">{team.description}</p>
                <div className="flex items-center justify-between">
                  <div className="flex -space-x-2 space-x-reverse">
                    {teamMembers.slice(0, 4).map((m) => (
                      <div key={m.id} className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold border-2 border-card">
                        {m.initials}
                      </div>
                    ))}
                    {teamMembers.length > 4 && <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold border-2 border-card">+{teamMembers.length - 4}</div>}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{teamMembers.length} أعضاء • {onlineCount} متصل</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Members List */}
      <div className="bg-card rounded-lg shadow-card">
        <div className="p-4 md:p-5 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">جميع الأعضاء</h3>
          <span className="text-xs text-muted-foreground">{members.length} عضو</span>
        </div>
        <div className="divide-y divide-border">
          {members.map((member) => {
            const team = teams.find((t) => t.id === member.teamId);
            return (
              <div key={member.id} className="p-4 md:p-5 flex items-center justify-between hover:bg-secondary/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                      {member.initials}
                    </div>
                    <div className={cn("absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded-full border-2 border-card", statusConfig[member.status].className)} />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{member.name}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground" dir="ltr">{member.email}</p>
                      {team && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${team.color}15`, color: team.color }}>
                          {team.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={cn("text-[10px] border-0", roleConfig[member.role].className)}>
                    {member.role === "admin" && <Shield className="w-3 h-3 ml-0.5" />}
                    {roleConfig[member.role].label}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1.5 rounded hover:bg-secondary transition-colors">
                        <MoreVertical className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => openEditDialog(member)} className="gap-2 text-xs">
                        <Edit className="w-3.5 h-3.5" /> تعديل البيانات
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete(member.id)} className="gap-2 text-xs text-destructive focus:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" /> إزالة من الفريق
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Info */}
      <div className="bg-card rounded-lg p-5 shadow-card">
        <h3 className="font-semibold text-sm mb-3">كيف تعمل الفرق؟</h3>
        <ul className="text-xs text-muted-foreground space-y-2 pr-4">
          <li>• كل فريق يرى فقط المحادثات المسندة له - لا يوجد تداخل</li>
          <li>• المدير يرى جميع المحادثات لكل الفرق</li>
          <li>• يمكن نقل محادثة من فريق لآخر عبر التحويل</li>
          <li>• كل فريق له إحصائياته الخاصة في التقارير</li>
        </ul>
      </div>

      {/* Add/Edit Member Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingMember ? "تعديل بيانات العضو" : "إضافة عضو جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">الاسم الكامل</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="مثال: سارة أحمد" className="bg-secondary border-0" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">البريد الإلكتروني</Label>
              <Input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="example@company.com" className="bg-secondary border-0" dir="ltr" type="email" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">الدور</Label>
                <Select value={formRole} onValueChange={(v) => setFormRole(v as Role)}>
                  <SelectTrigger className="bg-secondary border-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">مدير</SelectItem>
                    <SelectItem value="agent">موظف</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">الفريق</Label>
                <Select value={formTeam} onValueChange={setFormTeam}>
                  <SelectTrigger className="bg-secondary border-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} className="gap-1.5">
              <Save className="w-4 h-4" />
              {editingMember ? "حفظ" : "إضافة"}
            </Button>
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
            <div className="space-y-2">
              <Label className="text-xs">الوصف</Label>
              <Input value={newTeamDesc} onChange={(e) => setNewTeamDesc(e.target.value)} placeholder="وصف مختصر للفريق" className="bg-secondary border-0" />
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