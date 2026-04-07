import { useState, useEffect } from "react";
import {
  ClipboardCheck, Plus, Clock, CheckCircle2, AlertCircle,
  User, MoreHorizontal, Send, Loader2,
  Bot, UserCircle, RefreshCw, Check,
  MapPin, Calendar, Monitor, Building2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface Task {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  created_by: string | null;
  created_by_type: string;
  source_data: any;
  customer_phone: string | null;
  customer_name: string | null;
  conversation_id: string | null;
  forward_target: string | null;
  forward_status: string | null;
  completed_at: string | null;
  created_at: string;
  attendance_type: string;
  task_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
}

const TASK_TYPES = [
  { value: "contact_customer", label: "تواصل مع عميل", icon: "📞" },
  { value: "meeting", label: "اجتماع", icon: "🤝" },
  { value: "follow_up", label: "متابعة", icon: "🔄" },
  { value: "callback", label: "معاودة اتصال", icon: "📲" },
  { value: "review", label: "مراجعة", icon: "📋" },
  { value: "modification", label: "تعديل بيانات", icon: "✏️" },
  { value: "complaint", label: "شكوى / ملاحظة", icon: "⚠️" },
  { value: "inquiry", label: "استفسار", icon: "❓" },
  { value: "forward_shipping", label: "توجيه لشركة شحن", icon: "🚚" },
  { value: "general", label: "عام", icon: "📋" },
];

const PRIORITIES = [
  { value: "low", label: "منخفضة", color: "bg-muted text-muted-foreground" },
  { value: "medium", label: "متوسطة", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  { value: "high", label: "عالية", color: "bg-destructive/10 text-destructive" },
  { value: "urgent", label: "عاجلة", color: "bg-destructive text-destructive-foreground" },
];

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  pending: { label: "قيد الانتظار", icon: Clock, color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  in_progress: { label: "قيد التنفيذ", icon: RefreshCw, color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  forwarded: { label: "تم التوجيه", icon: Send, color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  completed: { label: "مكتملة", icon: CheckCircle2, color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  cancelled: { label: "ملغية", icon: AlertCircle, color: "bg-muted text-muted-foreground" },
};

const TasksPage = () => {
  const { profile, userRole, isSuperAdmin } = useAuth();
  const effectiveRole = isSuperAdmin ? "admin" : userRole === "admin" ? "admin" : profile?.is_supervisor ? "supervisor" : "member";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskScope, setTaskScope] = useState<"mine" | "team">("mine");
  const canSeeTeam = effectiveRole === "admin" || effectiveRole === "supervisor";
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showNewTask, setShowNewTask] = useState(false);

  // New task form
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState("general");
  const [newPriority, setNewPriority] = useState("medium");
  const [newAssignee, setNewAssignee] = useState(profile?.id || "");
  const [newAttendanceType, setNewAttendanceType] = useState("remote");
  const [newTaskDate, setNewTaskDate] = useState("");
  const [newStartTime, setNewStartTime] = useState("");
  const [newDuration, setNewDuration] = useState("30");
  const [newCustomDuration, setNewCustomDuration] = useState("");
  const [newLocation, setNewLocation] = useState("");

  useEffect(() => {
    if (profile?.org_id) {
      fetchTasks();
      fetchAgents();
    }
  }, [profile?.org_id]);

  const callTasksApi = async (payload: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("انتهت الجلسة، أعد تسجيل الدخول");
    }

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tasks-manage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.success === false) {
      throw new Error(result?.error || "تعذر تنفيذ العملية");
    }

    return result;
  };

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const result = await callTasksApi({ action: "list" });
      setTasks((result.tasks as Task[]) || []);
    } catch (error) {
      console.error("Fetch tasks error:", error);
      setTasks([]);
      toast.error(error instanceof Error ? error.message : "تعذر تحميل المهام");
    } finally {
      setLoading(false);
    }
  };

  const fetchAgents = async () => {
    let query = supabase
      .from("profiles")
      .select("id, full_name, team_id")
      .eq("org_id", profile!.org_id!)
      .eq("is_active", true);
    if (effectiveRole === "supervisor" && profile?.team_id) {
      query = query.eq("team_id", profile.team_id);
    }
    const { data } = await query;
    setAgents(data || []);
  };

  const calcEndTime = (start: string, durationMin: number): string => {
    const [h, m] = start.split(":").map(Number);
    const totalMin = h * 60 + m + durationMin;
    const eh = Math.floor(totalMin / 60) % 24;
    const em = totalMin % 60;
    return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
  };

  const getEffectiveDuration = (): number => {
    if (newDuration === "custom") return parseInt(newCustomDuration) || 0;
    return parseInt(newDuration) || 0;
  };

  const createTask = async () => {
    if (!newTitle.trim()) return toast.error("أدخل عنوان المهمة");
    if (!newTaskDate) return toast.error("اختر تاريخ المهمة");
    if (!newStartTime) return toast.error("حدد وقت البداية");
    const dur = getEffectiveDuration();
    if (dur <= 0) return toast.error("حدد مدة صحيحة");
    if (newAttendanceType === "in_person" && !newLocation.trim()) return toast.error("أدخل الموقع للمهمة الحضورية");

    const endTime = calcEndTime(newStartTime, dur);
    const assignee = newAssignee || profile!.id;

    try {
      await callTasksApi({
        action: "create",
        title: newTitle.trim(),
        description: newDesc.trim() || null,
        task_type: newType,
        priority: newPriority,
        assigned_to: assignee,
        attendance_type: newAttendanceType,
        task_date: newTaskDate,
        start_time: newStartTime,
        end_time: endTime,
        location: newAttendanceType === "in_person" ? newLocation.trim() : null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر إنشاء المهمة";
      console.error("Task creation error:", message);
      if (message.includes("TASK_OVERLAP")) {
        return toast.error("هذا الموظف لديه مهمة متداخلة في نفس الوقت، غيّر الوقت أو الموظف");
      }
      return toast.error(`فشل إنشاء المهمة: ${message}`);
    }

    toast.success("تم إنشاء المهمة");
    setShowNewTask(false);
    setNewTitle(""); setNewDesc(""); setNewType("general"); setNewPriority("medium");
    setNewAssignee(profile?.id || "");
    setNewAttendanceType("remote"); setNewTaskDate(""); setNewStartTime(""); setNewDuration("30"); setNewCustomDuration(""); setNewLocation("");
    fetchTasks();
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    try {
      await callTasksApi({ action: "update_status", task_id: taskId, status });
    } catch (error) {
      return toast.error(error instanceof Error ? error.message : "فشل التحديث");
    }
    toast.success("تم تحديث الحالة");
    fetchTasks();
  };

  const scopedTasks = tasks.filter(t => {
    if (taskScope === "mine") return t.assigned_to === profile?.id || t.created_by === profile?.id;
    return true;
  });

  const filteredTasks = scopedTasks.filter(t => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (typeFilter !== "all" && t.task_type !== typeFilter) return false;
    return true;
  });

  const groupedByDate = filteredTasks.reduce<Record<string, Task[]>>((acc, task) => {
    const dateKey = task.task_date || "بدون تاريخ";
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(task);
    return acc;
  }, {});

  Object.values(groupedByDate).forEach(group => {
    group.sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
  });

  const sortedDateKeys = Object.keys(groupedByDate).sort((a, b) => {
    if (a === "بدون تاريخ") return 1;
    if (b === "بدون تاريخ") return -1;
    return b.localeCompare(a);
  });

  const stats = {
    total: scopedTasks.length,
    pending: scopedTasks.filter(t => t.status === "pending").length,
    in_progress: scopedTasks.filter(t => t.status === "in_progress").length,
    completed: scopedTasks.filter(t => t.status === "completed").length,
  };

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">المهام</h1>
          <p className="text-sm text-muted-foreground">إدارة المهام وتتبع الإنجاز</p>
        </div>
        <Button onClick={() => setShowNewTask(true)}>
          <Plus className="w-4 h-4 ml-2" /> مهمة جديدة
        </Button>
      </div>

      {/* Scope tabs */}
      {canSeeTeam && (
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          <button
            onClick={() => setTaskScope("mine")}
            className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              taskScope === "mine" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            مهامي
          </button>
          <button
            onClick={() => setTaskScope("team")}
            className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              taskScope === "team" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {effectiveRole === "admin" ? "مهام الموظفين" : "مهام الفريق"}
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-foreground">{stats.total}</div>
          <div className="text-xs text-muted-foreground">إجمالي المهام</div>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          <div className="text-xs text-muted-foreground">قيد الانتظار</div>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.in_progress}</div>
          <div className="text-xs text-muted-foreground">قيد التنفيذ</div>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
          <div className="text-xs text-muted-foreground">مكتملة</div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="النوع" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            {TASK_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Task List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : filteredTasks.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>لا توجد مهام</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-6">
          {sortedDateKeys.map(dateKey => {
            const dayTasks = groupedByDate[dateKey];
            const isToday = dateKey === format(new Date(), "yyyy-MM-dd");
            const dateLabel = dateKey === "بدون تاريخ" 
              ? "بدون تاريخ" 
              : isToday 
                ? `اليوم — ${format(new Date(dateKey), "EEEE d MMMM yyyy", { locale: ar })}`
                : format(new Date(dateKey), "EEEE d MMMM yyyy", { locale: ar });

            return (
              <div key={dateKey}>
                <div className={`flex items-center gap-2 mb-3 px-1 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                  <Calendar className="w-4 h-4" />
                  <h2 className="font-semibold text-sm">{dateLabel}</h2>
                  <Badge variant="secondary" className="text-xs">{dayTasks.length}</Badge>
                </div>
                <div className="space-y-2">
                  {dayTasks.map(task => {
                    const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
                    const StatusIcon = statusCfg.icon;
                    const typeInfo = TASK_TYPES.find(t => t.value === task.task_type);
                    const priorityInfo = PRIORITIES.find(p => p.value === task.priority);
                    const agent = agents.find(a => a.id === task.assigned_to);
                    const isCompleted = task.status === "completed";

                    return (
                      <Card key={task.id} className={`hover:shadow-md transition-shadow ${isCompleted ? "opacity-60" : ""}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <button
                              onClick={() => !isCompleted && updateTaskStatus(task.id, "completed")}
                              className={`mt-1 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                isCompleted 
                                  ? "bg-primary border-primary text-primary-foreground" 
                                  : "border-muted-foreground/40 hover:border-primary"
                              }`}
                            >
                              {isCompleted && <Check className="w-3 h-3" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="text-base">{typeInfo?.icon}</span>
                                <h3 className={`font-semibold text-foreground truncate ${isCompleted ? "line-through" : ""}`}>{task.title}</h3>
                                {task.created_by_type === "bot" && (
                                  <Badge variant="outline" className="text-xs gap-1">
                                    <Bot className="w-3 h-3" /> شات بوت
                                  </Badge>
                                )}
                              </div>
                              {task.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{task.description}</p>
                              )}
                              <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                                {task.attendance_type === "in_person" ? (
                                  <span className="flex items-center gap-1 text-primary">
                                    <Building2 className="w-3 h-3" /> حضوري
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <Monitor className="w-3 h-3" /> عن بعد
                                  </span>
                                )}
                                {task.start_time && task.end_time && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> {task.start_time.slice(0,5)} - {task.end_time.slice(0,5)}
                                  </span>
                                )}
                                {task.location && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" /> {task.location}
                                  </span>
                                )}
                                {task.customer_name && (
                                  <span className="flex items-center gap-1">
                                    <UserCircle className="w-3 h-3" /> {task.customer_name}
                                  </span>
                                )}
                                {agent && (
                                  <span className="flex items-center gap-1">
                                    <User className="w-3 h-3" /> {agent.full_name}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge className={priorityInfo?.color || ""}>{priorityInfo?.label}</Badge>
                              <Badge className={statusCfg.color}>
                                <StatusIcon className="w-3 h-3 ml-1" /> {statusCfg.label}
                              </Badge>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {task.status !== "in_progress" && (
                                    <DropdownMenuItem onClick={() => updateTaskStatus(task.id, "in_progress")}>
                                      <RefreshCw className="w-4 h-4 ml-2" /> بدء التنفيذ
                                    </DropdownMenuItem>
                                  )}
                                  {task.status !== "completed" && (
                                    <DropdownMenuItem onClick={() => updateTaskStatus(task.id, "completed")}>
                                      <CheckCircle2 className="w-4 h-4 ml-2" /> إكمال
                                    </DropdownMenuItem>
                                  )}
                                  {task.status !== "forwarded" && (
                                    <DropdownMenuItem onClick={() => updateTaskStatus(task.id, "forwarded")}>
                                      <Send className="w-4 h-4 ml-2" /> تم التوجيه
                                    </DropdownMenuItem>
                                  )}
                                  {task.status !== "cancelled" && (
                                    <DropdownMenuItem onClick={() => updateTaskStatus(task.id, "cancelled")}>
                                      <AlertCircle className="w-4 h-4 ml-2" /> إلغاء
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                          {task.source_data && Object.keys(task.source_data).length > 0 && (
                            <div className="mt-3 mr-8 p-2 bg-muted/50 rounded text-xs space-y-1">
                              {task.source_data.order_number && <div>📦 رقم الطلب: <strong>{task.source_data.order_number}</strong></div>}
                              {task.source_data.modification_type && <div>✏️ نوع التعديل: {task.source_data.modification_type}</div>}
                              {task.source_data.new_value && <div>📝 القيمة الجديدة: {task.source_data.new_value}</div>}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Task Dialog - Mobile optimized */}
      <Dialog open={showNewTask} onOpenChange={setShowNewTask}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md p-0 gap-0 max-h-[calc(100dvh-2rem)] flex flex-col" dir="rtl">
          <DialogHeader className="px-4 pt-4 pb-2 border-b border-border shrink-0">
            <DialogTitle className="text-base">مهمة جديدة</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            <div>
              <Label className="text-xs">العنوان *</Label>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="مثال: تغيير عنوان الشحن" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">الوصف</Label>
              <Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="تفاصيل المهمة..." rows={2} className="text-sm min-h-[60px]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">النوع</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">الأولوية</Label>
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">نوع الحضور *</Label>
              <Select value={newAttendanceType} onValueChange={setNewAttendanceType}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_person"><Building2 className="w-3 h-3 inline ml-1" /> حضوري</SelectItem>
                  <SelectItem value="remote"><Monitor className="w-3 h-3 inline ml-1" /> عن بعد</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">التاريخ *</Label>
                <Input type="date" value={newTaskDate} onChange={e => setNewTaskDate(e.target.value)} className="h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs">وقت البداية *</Label>
                <Input type="time" value={newStartTime} onChange={e => setNewStartTime(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs">لمدة *</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {[
                  { value: "5", label: "٥ د" },
                  { value: "10", label: "١٠ د" },
                  { value: "15", label: "١٥ د" },
                  { value: "30", label: "٣٠ د" },
                  { value: "60", label: "ساعة" },
                  { value: "custom", label: "مخصص" },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setNewDuration(opt.value)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                      newDuration === opt.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-input hover:bg-accent"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {newDuration === "custom" && (
                <div className="mt-1.5 flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={newCustomDuration}
                    onChange={e => setNewCustomDuration(e.target.value)}
                    placeholder="عدد الدقائق"
                    className="w-28 h-9 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">دقيقة</span>
                </div>
              )}
              {newStartTime && getEffectiveDuration() > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  ⏰ من {newStartTime} إلى {calcEndTime(newStartTime, getEffectiveDuration())}
                </p>
              )}
            </div>
            {newAttendanceType === "in_person" && (
              <div>
                <Label className="text-xs">الموقع *</Label>
                <Input value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="مثال: مكتب الرياض - حي العليا" className="h-9 text-sm" />
              </div>
            )}
            <div>
              <Label className="text-xs">إسناد إلى</Label>
              <Select value={newAssignee || profile?.id || ""} onValueChange={setNewAssignee}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر موظف" /></SelectTrigger>
                <SelectContent>
                  {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.full_name}{a.id === profile?.id ? " (أنا)" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="px-4 pb-4 pt-2 border-t border-border shrink-0">
            <Button onClick={createTask} className="w-full h-10">إنشاء المهمة</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TasksPage;
