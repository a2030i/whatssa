import { Plus, Shield, UserCheck, UserX, MoreVertical } from "lucide-react";
import { agents } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const teamMembers = [
  { id: "1", name: "أحمد محمد", email: "ahmed@example.com", role: "admin" as const, status: "online" as const, initials: "أم" },
  { id: "2", name: "فاطمة علي", email: "fatima@example.com", role: "agent" as const, status: "online" as const, initials: "فع" },
  { id: "3", name: "خالد سعد", email: "khaled@example.com", role: "agent" as const, status: "offline" as const, initials: "خس" },
  { id: "4", name: "ريم ناصر", email: "reem@example.com", role: "agent" as const, status: "online" as const, initials: "رن" },
  { id: "5", name: "عمر يوسف", email: "omar@example.com", role: "agent" as const, status: "offline" as const, initials: "عي" },
];

const roleConfig = {
  admin: { label: "مدير", className: "bg-kpi-3/10 text-kpi-3" },
  agent: { label: "موظف", className: "bg-info/10 text-info" },
};

const statusConfig = {
  online: { label: "متصل", className: "bg-success" },
  offline: { label: "غير متصل", className: "bg-muted-foreground/40" },
};

const TeamPage = () => {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[900px]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">الفريق</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة أعضاء الفريق والصلاحيات</p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          إضافة عضو
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-card rounded-lg p-4 shadow-card text-center">
          <p className="text-2xl font-bold">{teamMembers.length}</p>
          <p className="text-xs text-muted-foreground">إجمالي الفريق</p>
        </div>
        <div className="bg-card rounded-lg p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-success">{teamMembers.filter(m => m.status === "online").length}</p>
          <p className="text-xs text-muted-foreground">متصلون الآن</p>
        </div>
        <div className="bg-card rounded-lg p-4 shadow-card text-center col-span-2 md:col-span-1">
          <p className="text-2xl font-bold text-kpi-3">{teamMembers.filter(m => m.role === "admin").length}</p>
          <p className="text-xs text-muted-foreground">مدراء</p>
        </div>
      </div>

      {/* Members List */}
      <div className="bg-card rounded-lg shadow-card">
        <div className="p-4 md:p-5 border-b border-border">
          <h3 className="font-semibold text-sm">أعضاء الفريق</h3>
        </div>
        <div className="divide-y divide-border">
          {teamMembers.map((member) => (
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
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className={cn("text-[10px] border-0 hidden sm:inline-flex", roleConfig[member.role].className)}>
                  {member.role === "admin" && <Shield className="w-3 h-3 ml-1" />}
                  {roleConfig[member.role].label}
                </Badge>
                <button className="p-1.5 rounded hover:bg-secondary transition-colors">
                  <MoreVertical className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TeamPage;
