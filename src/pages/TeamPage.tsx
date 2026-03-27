import { useState } from "react";
import { Plus, Shield, MoreVertical, Trash2, Edit, Save, UserPlus, Mail, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type Role = "admin" | "agent";
type Status = "online" | "offline";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: Status;
  initials: string;
}

const roleConfig = {
  admin: { label: "مدير", className: "bg-kpi-3/10 text-kpi-3" },
  agent: { label: "موظف", className: "bg-info/10 text-info" },
};

const statusConfig = {
  online: { label: "متصل", className: "bg-success" },
  offline: { label: "غير متصل", className: "bg-muted-foreground/40" },
};

const initialMembers: TeamMember[] = [
  { id: "1", name: "أحمد محمد", email: "ahmed@example.com", role: "admin", status: "online", initials: "أم" },
  { id: "2", name: "فاطمة علي", email: "fatima@example.com", role: "agent", status: "online", initials: "فع" },
  { id: "3", name: "خالد سعد", email: "khaled@example.com", role: "agent", status: "offline", initials: "خس" },
  { id: "4", name: "ريم ناصر", email: "reem@example.com", role: "agent", status: "online", initials: "رن" },
  { id: "5", name: "عمر يوسف", email: "omar@example.com", role: "agent", status: "offline", initials: "عي" },
];

const TeamPage = () => {
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState<Role>("agent");
  const { toast } = useToast();

  const openNewDialog = () => {
    setEditingMember(null);
    setFormName("");
    setFormEmail("");
    setFormRole("agent");
    setDialogOpen(true);
  };

  const openEditDialog = (member: TeamMember) => {
    setEditingMember(member);
    setFormName(member.name);
    setFormEmail(member.email);
    setFormRole(member.role);
    setDialogOpen(true);
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return parts[0].charAt(0) + parts[1].charAt(0);
    return name.substring(0, 2);
  };

  const handleSave = () => {
    if (!formName.trim() || !formEmail.trim()) {
      toast({ title: "خطأ", description: "يرجى ملء جميع الحقول", variant: "destructive" });
      return;
    }

    if (editingMember) {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === editingMember.id
            ? { ...m, name: formName, email: formEmail, role: formRole, initials: getInitials(formName) }
            : m
        )
      );
      toast({ title: "تم التحديث", description: `تم تحديث بيانات "${formName}"` });
    } else {
      const newMember: TeamMember = {
        id: Date.now().toString(),
        name: formName,
        email: formEmail,
        role: formRole,
        status: "offline",
        initials: getInitials(formName),
      };
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

  const handleRoleChange = (id: string, newRole: Role) => {
    setMembers((prev) => prev.map((m) => m.id === id ? { ...m, role: newRole } : m));
    toast({ title: "تم التحديث", description: `تم تغيير الدور بنجاح` });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[900px]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">الفريق</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة أعضاء الفريق والصلاحيات</p>
        </div>
        <Button className="gap-2" onClick={openNewDialog}>
          <UserPlus className="w-4 h-4" />
          إضافة عضو
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-lg p-4 shadow-card text-center">
          <p className="text-2xl font-bold">{members.length}</p>
          <p className="text-xs text-muted-foreground">إجمالي الفريق</p>
        </div>
        <div className="bg-card rounded-lg p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-success">{members.filter((m) => m.status === "online").length}</p>
          <p className="text-xs text-muted-foreground">متصلون الآن</p>
        </div>
        <div className="bg-card rounded-lg p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-kpi-3">{members.filter((m) => m.role === "admin").length}</p>
          <p className="text-xs text-muted-foreground">مدراء</p>
        </div>
        <div className="bg-card rounded-lg p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-info">{members.filter((m) => m.role === "agent").length}</p>
          <p className="text-xs text-muted-foreground">موظفون</p>
        </div>
      </div>

      {/* Members List */}
      <div className="bg-card rounded-lg shadow-card">
        <div className="p-4 md:p-5 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">أعضاء الفريق</h3>
          <span className="text-xs text-muted-foreground">{members.length} عضو</span>
        </div>
        <div className="divide-y divide-border">
          {members.map((member) => (
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
                  <p className="text-xs text-muted-foreground" dir="ltr">{member.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Role selector */}
                <Select value={member.role} onValueChange={(v) => handleRoleChange(member.id, v as Role)}>
                  <SelectTrigger className={cn("h-7 text-[10px] border-0 w-auto gap-1 px-2", roleConfig[member.role].className)}>
                    {member.role === "admin" && <Shield className="w-3 h-3" />}
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">مدير (Admin)</SelectItem>
                    <SelectItem value="agent">موظف (Agent)</SelectItem>
                  </SelectContent>
                </Select>

                {/* Actions */}
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
          ))}
        </div>
      </div>

      {/* Permissions info */}
      <div className="bg-card rounded-lg p-5 shadow-card">
        <h3 className="font-semibold text-sm mb-3">صلاحيات الأدوار</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-kpi-3/10 text-kpi-3 border-0 text-xs"><Shield className="w-3 h-3 ml-1" /> مدير (Admin)</Badge>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 pr-4">
              <li>• إدارة الفريق وإضافة/حذف أعضاء</li>
              <li>• الوصول لجميع المحادثات والتقارير</li>
              <li>• إعداد الأتمتة والحملات</li>
              <li>• إعدادات النظام والفواتير</li>
            </ul>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-info/10 text-info border-0 text-xs"><User className="w-3 h-3 ml-1" /> موظف (Agent)</Badge>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 pr-4">
              <li>• الرد على المحادثات المُسندة</li>
              <li>• عرض تقارير الأداء الشخصية</li>
              <li>• إضافة ملاحظات وتصنيفات</li>
              <li>• نقل المحادثات لموظف آخر</li>
            </ul>
          </div>
        </div>
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
            <div className="space-y-2">
              <Label className="text-xs">الدور</Label>
              <Select value={formRole} onValueChange={(v) => setFormRole(v as Role)}>
                <SelectTrigger className="bg-secondary border-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">مدير (Admin) - صلاحيات كاملة</SelectItem>
                  <SelectItem value="agent">موظف (Agent) - صلاحيات محدودة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} className="gap-1.5">
              <Save className="w-4 h-4" />
              {editingMember ? "حفظ التعديلات" : "إضافة العضو"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamPage;
