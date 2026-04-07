import { useState, useEffect } from "react";
import {
  ClipboardCheck, Plus, Filter, Clock, CheckCircle2, AlertCircle,
  User, MessageSquare, ArrowUpDown, MoreHorizontal, Send, Loader2,
  Bot, UserCircle, Truck, Phone, Mail, RefreshCw, ChevronsUpDown, Check,
  MapPin, Calendar, Monitor, Building2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
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

interface ForwardConfig {
  id: string;
  name: string;
  forward_type: string;
  target_phone: string | null;
  target_email: string | null;
  target_group_jid: string | null;
  channel_id: string | null;
  message_template: string;
  is_active: boolean;
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
  const [configs, setConfigs] = useState<ForwardConfig[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("tasks");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showNewTask, setShowNewTask] = useState(false);
  const [showNewConfig, setShowNewConfig] = useState(false);

  // New task form
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState("general");
  const [newPriority, setNewPriority] = useState("medium");
  const [newAssignee, setNewAssignee] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customers, setCustomers] = useState<{ id: string; name: string | null; phone: string }[]>([]);
  const [newAttendanceType, setNewAttendanceType] = useState("remote");
  const [newTaskDate, setNewTaskDate] = useState("");
  const [newStartTime, setNewStartTime] = useState("");
  const [newEndTime, setNewEndTime] = useState("");
  const [newLocation, setNewLocation] = useState("");

  // New config form
  const [cfgName, setCfgName] = useState("");
  const [cfgType, setCfgType] = useState("whatsapp_group");
  const [cfgPhone, setCfgPhone] = useState("");
  const [cfgEmail, setCfgEmail] = useState("");
  const [cfgTemplate, setCfgTemplate] = useState("📦 طلب رقم: {{order_number}}\n👤 العميل: {{customer_name}}\n📝 الملاحظة: {{note}}");

  useEffect(() => {
    if (profile?.org_id) {
    fetchTasks();
    fetchConfigs();
    fetchAgents();
    fetchCustomers();
    }
  }, [profile?.org_id]);

  const fetchTasks = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .eq("org_id", profile!.org_id!)
      .order("created_at", { ascending: false })
      .limit(200);
    setTasks((data as unknown as Task[]) || []);
    setLoading(false);
  };

  const fetchConfigs = async () => {
    const { data } = await supabase
      .from("forward_configs")
      .select("*")
      .eq("org_id", profile!.org_id!)
      .order("created_at", { ascending: false });
    setConfigs((data as unknown as ForwardConfig[]) || []);
  };

  const fetchCustomers = async () => {
    if (!profile?.org_id) return;
    const { data } = await supabase
      .from("customers")
      .select("id, name, phone")
      .eq("org_id", profile.org_id)
      .order("name");
    setCustomers(data || []);
  };

  const fetchAgents = async () => {
    let query = supabase
      .from("profiles")
      .select("id, full_name, team_id")
      .eq("org_id", profile!.org_id!)
      .eq("is_active", true);
    
    // Supervisors only see their team members
    if (effectiveRole === "supervisor" && profile?.team_id) {
      query = query.eq("team_id", profile.team_id);
    }
    
    const { data } = await query;
    setAgents(data || []);
  };

  const createTask = async () => {
    if (!newTitle.trim()) return toast.error("أدخل عنوان المهمة");
    if (!newTaskDate) return toast.error("اختر تاريخ المهمة");
    if (!newStartTime || !newEndTime) return toast.error("حدد وقت البداية والنهاية");
    if (newStartTime >= newEndTime) return toast.error("وقت النهاية يجب أن يكون بعد وقت البداية");
    if (newAttendanceType === "in_person" && !newLocation.trim()) return toast.error("أدخل الموقع للمهمة الحضورية");
    
    const assignee = effectiveRole === "member" ? profile!.id : (newAssignee || null);
    const selectedCust = customers.find(c => c.id === selectedCustomerId);
    const { error } = await supabase.from("tasks").insert({
      org_id: profile!.org_id!,
      title: newTitle.trim(),
      description: newDesc.trim() || null,
      task_type: newType,
      priority: newPriority,
      assigned_to: assignee,
      customer_phone: selectedCust?.phone || null,
      customer_name: selectedCust?.name || null,
      created_by_type: "agent",
      created_by: profile!.id,
      attendance_type: newAttendanceType,
      task_date: newTaskDate,
      start_time: newStartTime,
      end_time: newEndTime,
      location: newAttendanceType === "in_person" ? newLocation.trim() : null,
    } as any);
    if (error) {
      console.error("Task creation error:", error);
      if (error.message?.includes("TASK_OVERLAP")) {
        return toast.error("هذا الموظف لديه مهمة متداخلة في نفس الوقت، غيّر الوقت أو الموظف");
      }
      return toast.error("فشل إنشاء المهمة");
    }
    toast.success("تم إنشاء المهمة");
    setShowNewTask(false);
    setNewTitle(""); setNewDesc(""); setNewType("general"); setNewPriority("medium"); 
    setNewAssignee(""); setSelectedCustomerId("");
    setNewAttendanceType("remote"); setNewTaskDate(""); setNewStartTime(""); setNewEndTime(""); setNewLocation("");
    fetchTasks();
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    const updates: any = { status };
    if (status === "completed") updates.completed_at = new Date().toISOString();
    const { error } = await supabase.from("tasks").update(updates).eq("id", taskId);
    if (error) return toast.error("فشل التحديث");
    toast.success("تم تحديث الحالة");
    fetchTasks();
  };

  const createConfig = async () => {
    if (!cfgName.trim()) return toast.error("أدخل اسم الوجهة");
    if (cfgType === "whatsapp_group" && !cfgPhone.trim()) return toast.error("أدخل رقم القروب");
    if (cfgType === "email" && !cfgEmail.trim()) return toast.error("أدخل البريد الإلكتروني");
    const { error } = await supabase.from("forward_configs").insert({
      org_id: profile!.org_id!,
      name: cfgName.trim(),
      forward_type: cfgType,
      target_phone: cfgPhone || null,
      target_email: cfgEmail || null,
      message_template: cfgTemplate,
    } as any);
    if (error) return toast.error("فشل الحفظ");
    toast.success("تم إضافة وجهة التوجيه");
    setShowNewConfig(false);
    setCfgName(""); setCfgPhone(""); setCfgEmail("");
    fetchConfigs();
  };

  const toggleConfig = async (id: string, active: boolean) => {
    await supabase.from("forward_configs").update({ is_active: !active } as any).eq("id", id);
    fetchConfigs();
  };

  const deleteConfig = async (id: string) => {
    await supabase.from("forward_configs").delete().eq("id", id);
    toast.success("تم الحذف");
    fetchConfigs();
  };

  const filteredTasks = tasks.filter(t => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (typeFilter !== "all" && t.task_type !== typeFilter) return false;
    return true;
  });

  // Group tasks by date, sorted by date desc, then by start_time asc within each day
  const groupedByDate = filteredTasks.reduce<Record<string, Task[]>>((acc, task) => {
    const dateKey = task.task_date || "بدون تاريخ";
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(task);
    return acc;
  }, {});

  // Sort each group by start_time
  Object.values(groupedByDate).forEach(group => {
    group.sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
  });

  // Sort date keys: actual dates desc, "بدون تاريخ" last
  const sortedDateKeys = Object.keys(groupedByDate).sort((a, b) => {
    if (a === "بدون تاريخ") return 1;
    if (b === "بدون تاريخ") return -1;
    return b.localeCompare(a);
  });

  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === "pending").length,
    in_progress: tasks.filter(t => t.status === "in_progress").length,
    completed: tasks.filter(t => t.status === "completed").length,
  };

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">المهام</h1>
          <p className="text-sm text-muted-foreground">إدارة المهام والتوجيه لشركات الشحن</p>
        </div>
        <Button onClick={() => setShowNewTask(true)}>
          <Plus className="w-4 h-4 ml-2" /> مهمة جديدة
        </Button>
      </div>

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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="tasks">المهام</TabsTrigger>
          <TabsTrigger value="forwarding">وجهات التوجيه</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="space-y-4">
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
                                {/* Completion checkbox */}
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
        </TabsContent>

        <TabsContent value="forwarding" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">إعداد وجهات توجيه الملاحظات لشركات الشحن</p>
            <Button onClick={() => setShowNewConfig(true)} size="sm">
              <Plus className="w-4 h-4 ml-2" /> وجهة جديدة
            </Button>
          </div>

          {configs.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد وجهات توجيه</p>
              <p className="text-xs mt-1">أضف رقم قروب واتساب أو إيميل شركة الشحن</p>
            </CardContent></Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {configs.map(cfg => (
                <Card key={cfg.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {cfg.forward_type === "email" ? <Mail className="w-4 h-4 text-primary" /> : <MessageSquare className="w-4 h-4 text-green-600" />}
                          <h3 className="font-semibold text-foreground">{cfg.name}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {cfg.forward_type === "email" ? cfg.target_email : cfg.target_phone}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={cfg.is_active ? "default" : "secondary"}>
                          {cfg.is_active ? "مفعّل" : "معطّل"}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => toggleConfig(cfg.id, cfg.is_active)}>
                              {cfg.is_active ? "تعطيل" : "تفعيل"}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => deleteConfig(cfg.id)}>
                              حذف
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <div className="mt-2 p-2 bg-muted/50 rounded text-xs font-mono whitespace-pre-wrap">
                      {cfg.message_template}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* New Task Dialog */}
      <Dialog open={showNewTask} onOpenChange={setShowNewTask}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>مهمة جديدة</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>العنوان *</Label>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="مثال: تغيير عنوان الشحن" />
            </div>
            <div>
              <Label>الوصف</Label>
              <Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="تفاصيل المهمة..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>النوع</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>الأولوية</Label>
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Attendance Type */}
            <div>
              <Label>نوع الحضور *</Label>
              <Select value={newAttendanceType} onValueChange={setNewAttendanceType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_person"><Building2 className="w-3 h-3 inline ml-1" /> حضوري</SelectItem>
                  <SelectItem value="remote"><Monitor className="w-3 h-3 inline ml-1" /> عن بعد</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Date */}
            <div>
              <Label>التاريخ *</Label>
              <Input type="date" value={newTaskDate} onChange={e => setNewTaskDate(e.target.value)} />
            </div>
            {/* Time Range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>من الساعة *</Label>
                <Input type="time" value={newStartTime} onChange={e => setNewStartTime(e.target.value)} />
              </div>
              <div>
                <Label>إلى الساعة *</Label>
                <Input type="time" value={newEndTime} onChange={e => setNewEndTime(e.target.value)} />
              </div>
            </div>
            {/* Location - only for in-person */}
            {newAttendanceType === "in_person" && (
              <div>
                <Label>الموقع *</Label>
                <Input value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="مثال: مكتب الرياض - حي العليا" />
              </div>
            )}
            {effectiveRole !== "member" && (
              <div>
                <Label>إسناد إلى</Label>
                <Select value={newAssignee || "none"} onValueChange={(v) => setNewAssignee(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="اختر موظف" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون إسناد</SelectItem>
                    {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>العميل</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {selectedCustomerId
                      ? (() => { const c = customers.find(c => c.id === selectedCustomerId); return c ? `${c.name || "بدون اسم"} — ${c.phone}` : "اختر عميل"; })()
                      : "اختر عميل"}
                    <ChevronsUpDown className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="بحث بالاسم أو الرقم..." />
                    <CommandList>
                      <CommandEmpty>لا يوجد عملاء</CommandEmpty>
                      <CommandGroup>
                        <CommandItem value="none" onSelect={() => setSelectedCustomerId("")}>
                          بدون عميل
                        </CommandItem>
                        {customers.map(c => (
                          <CommandItem
                            key={c.id}
                            value={`${c.name || ""} ${c.phone}`}
                            onSelect={() => setSelectedCustomerId(c.id)}
                          >
                            <Check className={cn("ml-2 h-4 w-4", selectedCustomerId === c.id ? "opacity-100" : "opacity-0")} />
                            {c.name || "بدون اسم"} — {c.phone}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <Button onClick={createTask} className="w-full">إنشاء المهمة</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Config Dialog */}
      <Dialog open={showNewConfig} onOpenChange={setShowNewConfig}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>وجهة توجيه جديدة</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>اسم الوجهة *</Label>
              <Input value={cfgName} onChange={e => setCfgName(e.target.value)} placeholder="مثال: قروب أرامكس" />
            </div>
            <div>
              <Label>نوع التوجيه</Label>
              <Select value={cfgType} onValueChange={setCfgType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp_group">قروب واتساب</SelectItem>
                  <SelectItem value="whatsapp_direct">رسالة واتساب مباشرة</SelectItem>
                  <SelectItem value="email">بريد إلكتروني</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {cfgType !== "email" ? (
              <div>
                <Label>رقم الهاتف / JID القروب</Label>
                <Input value={cfgPhone} onChange={e => setCfgPhone(e.target.value)} dir="ltr" placeholder="966500000000 أو group-jid" />
              </div>
            ) : (
              <div>
                <Label>البريد الإلكتروني</Label>
                <Input value={cfgEmail} onChange={e => setCfgEmail(e.target.value)} dir="ltr" placeholder="shipping@company.com" type="email" />
              </div>
            )}
            <div>
              <Label>قالب الرسالة</Label>
              <Textarea value={cfgTemplate} onChange={e => setCfgTemplate(e.target.value)} rows={4} className="font-mono text-xs" />
              <p className="text-xs text-muted-foreground mt-1">
                متغيرات متاحة: {"{{order_number}}"} {"{{customer_name}}"} {"{{customer_phone}}"} {"{{note}}"}
              </p>
            </div>
            <Button onClick={createConfig} className="w-full">حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TasksPage;
