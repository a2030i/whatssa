import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, FileText, Send, Eye, Trash2, GripVertical, ArrowUp, ArrowDown,
  ClipboardList, ShoppingCart, Star, Calendar, X, Copy, Loader2,
  MessageSquare, CheckCircle2, Clock, BarChart3, Download, ChevronDown, ChevronUp,
  Type, Hash, Phone, Mail, ListChecks, CircleDot, AlignLeft, ToggleLeft
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

interface FlowField {
  id: string;
  type: "text" | "number" | "phone" | "email" | "textarea" | "radio" | "checkbox" | "select";
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
}

interface FlowScreen {
  id: string;
  title: string;
  description?: string;
  fields: FlowField[];
}

interface WaFlow {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  flow_type: string;
  status: string;
  screens: FlowScreen[];
  success_message: string;
  meta_flow_id: string | null;
  webhook_url: string | null;
  forward_to_phone: string | null;
  forward_to_group_jid: string | null;
  forward_channel_id: string | null;
  created_at: string;
  updated_at: string;
}

interface FlowSubmission {
  id: string;
  flow_id: string;
  customer_phone: string;
  customer_name: string | null;
  responses: Record<string, any>;
  status: string;
  created_at: string;
}

const FIELD_TYPES = [
  { value: "text", label: "نص", icon: Type },
  { value: "number", label: "رقم", icon: Hash },
  { value: "phone", label: "هاتف", icon: Phone },
  { value: "email", label: "بريد", icon: Mail },
  { value: "textarea", label: "نص طويل", icon: AlignLeft },
  { value: "radio", label: "اختيار واحد", icon: CircleDot },
  { value: "checkbox", label: "اختيار متعدد", icon: ListChecks },
  { value: "select", label: "قائمة منسدلة", icon: ListChecks },
];

const FLOW_TEMPLATES = [
  {
    type: "form",
    name: "نموذج تواصل",
    icon: ClipboardList,
    description: "نموذج بسيط لجمع بيانات العميل",
    screens: [{
      id: "s1",
      title: "بيانات التواصل",
      fields: [
        { id: "f1", type: "text" as const, label: "الاسم", required: true, placeholder: "أدخل اسمك" },
        { id: "f2", type: "phone" as const, label: "رقم الجوال", required: true, placeholder: "05xxxxxxxx" },
        { id: "f3", type: "email" as const, label: "البريد الإلكتروني", required: false, placeholder: "example@email.com" },
        { id: "f4", type: "textarea" as const, label: "الملاحظات", required: false, placeholder: "اكتب ملاحظاتك هنا" },
      ],
    }],
  },
  {
    type: "order",
    name: "طلب منتج",
    icon: ShoppingCart,
    description: "نموذج طلب مع تفاصيل التوصيل",
    screens: [{
      id: "s1",
      title: "تفاصيل الطلب",
      fields: [
        { id: "f1", type: "text" as const, label: "الاسم الكامل", required: true },
        { id: "f2", type: "phone" as const, label: "رقم الجوال", required: true },
        { id: "f3", type: "text" as const, label: "المدينة", required: true },
        { id: "f4", type: "textarea" as const, label: "العنوان بالتفصيل", required: true },
        { id: "f5", type: "select" as const, label: "طريقة الدفع", required: true, options: ["تحويل بنكي", "دفع عند الاستلام", "بطاقة ائتمان"] },
        { id: "f6", type: "textarea" as const, label: "ملاحظات إضافية", required: false },
      ],
    }],
  },
  {
    type: "survey",
    name: "استبيان رضا",
    icon: Star,
    description: "استبيان لقياس رضا العملاء",
    screens: [{
      id: "s1",
      title: "استبيان رضا العملاء",
      fields: [
        { id: "f1", type: "radio" as const, label: "كيف تقيّم تجربتك معنا؟", required: true, options: ["ممتاز ⭐⭐⭐⭐⭐", "جيد جداً ⭐⭐⭐⭐", "جيد ⭐⭐⭐", "مقبول ⭐⭐", "ضعيف ⭐"] },
        { id: "f2", type: "radio" as const, label: "هل تنصح بخدماتنا؟", required: true, options: ["نعم بالتأكيد", "ربما", "لا"] },
        { id: "f3", type: "textarea" as const, label: "ملاحظات أو اقتراحات", required: false },
      ],
    }],
  },
  {
    type: "appointment",
    name: "حجز موعد",
    icon: Calendar,
    description: "نموذج حجز موعد أو خدمة",
    screens: [{
      id: "s1",
      title: "حجز موعد",
      fields: [
        { id: "f1", type: "text" as const, label: "الاسم", required: true },
        { id: "f2", type: "phone" as const, label: "رقم الجوال", required: true },
        { id: "f3", type: "select" as const, label: "الفرع", required: true, options: ["الفرع الرئيسي", "فرع 2", "فرع 3"] },
        { id: "f4", type: "select" as const, label: "الخدمة المطلوبة", required: true, options: ["خدمة 1", "خدمة 2", "خدمة 3"] },
        { id: "f5", type: "text" as const, label: "التاريخ المفضل", required: true, placeholder: "مثال: السبت 15 مارس" },
        { id: "f6", type: "select" as const, label: "الوقت المفضل", required: true, options: ["صباحاً (9-12)", "ظهراً (12-3)", "مساءً (3-6)", "ليلاً (6-9)"] },
      ],
    }],
  },
];

const generateId = () => Math.random().toString(36).substr(2, 9);

const WhatsAppFlowsPage = () => {
  const { profile } = useAuth();
  const [flows, setFlows] = useState<WaFlow[]>([]);
  const [submissions, setSubmissions] = useState<FlowSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showSubmissions, setShowSubmissions] = useState(false);
  const [selectedFlow, setSelectedFlow] = useState<WaFlow | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [submissionsExpanded, setSubmissionsExpanded] = useState<Record<string, boolean>>({});

  // Builder state
  const [flowName, setFlowName] = useState("");
  const [flowDescription, setFlowDescription] = useState("");
  const [flowType, setFlowType] = useState("form");
  const [successMessage, setSuccessMessage] = useState("شكراً لك! تم استلام ردك بنجاح ✅");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [forwardToPhone, setForwardToPhone] = useState("");
  const [forwardToGroupJid, setForwardToGroupJid] = useState("");
  const [screens, setScreens] = useState<FlowScreen[]>([{
    id: generateId(),
    title: "الشاشة الأولى",
    fields: [],
  }]);

  const orgId = profile?.org_id;

  const fetchFlows = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);
    const { data } = await supabase
      .from("wa_flows")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    setFlows((data as any[]) || []);
    setIsLoading(false);
  }, [orgId]);

  useEffect(() => { fetchFlows(); }, [fetchFlows]);

  const fetchSubmissions = async (flowId: string) => {
    const { data } = await supabase
      .from("flow_submissions")
      .select("*")
      .eq("flow_id", flowId)
      .order("created_at", { ascending: false })
      .limit(100);
    setSubmissions((data as any[]) || []);
  };

  const handleSaveFlow = async () => {
    if (!flowName.trim()) { toast.error("اسم النموذج مطلوب"); return; }
    if (screens[0]?.fields.length === 0) { toast.error("أضف حقل واحد على الأقل"); return; }
    if (!orgId) return;

    const flowData = {
      org_id: orgId,
      name: flowName,
      description: flowDescription || null,
      flow_type: flowType,
      screens: screens as any,
      success_message: successMessage,
      webhook_url: webhookUrl || null,
      forward_to_phone: forwardToPhone || null,
      forward_to_group_jid: forwardToGroupJid || null,
      status: "published",
      created_by: profile?.id,
    };

    let error;
    if (selectedFlow) {
      ({ error } = await supabase.from("wa_flows").update(flowData).eq("id", selectedFlow.id));
    } else {
      ({ error } = await supabase.from("wa_flows").insert(flowData));
    }

    if (error) {
      toast.error("حدث خطأ في حفظ النموذج");
      console.error(error);
    } else {
      toast.success(selectedFlow ? "تم تحديث النموذج" : "تم إنشاء النموذج بنجاح");
      resetBuilder();
      fetchFlows();
    }
  };

  const handleDeleteFlow = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا النموذج؟")) return;
    const { error } = await supabase.from("wa_flows").delete().eq("id", id);
    if (error) toast.error("حدث خطأ في الحذف");
    else { toast.success("تم حذف النموذج"); fetchFlows(); }
  };

  const handleEditFlow = (flow: WaFlow) => {
    setSelectedFlow(flow);
    setFlowName(flow.name);
    setFlowDescription(flow.description || "");
    setFlowType(flow.flow_type);
    setSuccessMessage(flow.success_message);
    setWebhookUrl(flow.webhook_url || "");
    setForwardToPhone((flow as any).forward_to_phone || "");
    setForwardToGroupJid((flow as any).forward_to_group_jid || "");
    setScreens(flow.screens || []);
    setShowBuilder(true);
  };

  const resetBuilder = () => {
    setShowBuilder(false);
    setSelectedFlow(null);
    setFlowName("");
    setFlowDescription("");
    setFlowType("form");
    setSuccessMessage("شكراً لك! تم استلام ردك بنجاح ✅");
    setWebhookUrl("");
    setForwardToPhone("");
    setForwardToGroupJid("");
    setScreens([{ id: generateId(), title: "الشاشة الأولى", fields: [] }]);
  };

  const addField = (screenIdx: number, type: FlowField["type"]) => {
    const newField: FlowField = {
      id: generateId(),
      type,
      label: "",
      required: true,
      placeholder: "",
      ...(["radio", "checkbox", "select"].includes(type) ? { options: ["خيار 1", "خيار 2"] } : {}),
    };
    setScreens(prev => {
      const updated = [...prev];
      updated[screenIdx] = { ...updated[screenIdx], fields: [...updated[screenIdx].fields, newField] };
      return updated;
    });
  };

  const updateField = (screenIdx: number, fieldIdx: number, updates: Partial<FlowField>) => {
    setScreens(prev => {
      const updated = [...prev];
      const fields = [...updated[screenIdx].fields];
      fields[fieldIdx] = { ...fields[fieldIdx], ...updates };
      updated[screenIdx] = { ...updated[screenIdx], fields };
      return updated;
    });
  };

  const removeField = (screenIdx: number, fieldIdx: number) => {
    setScreens(prev => {
      const updated = [...prev];
      updated[screenIdx] = { ...updated[screenIdx], fields: updated[screenIdx].fields.filter((_, i) => i !== fieldIdx) };
      return updated;
    });
  };

  const moveField = (screenIdx: number, fieldIdx: number, direction: "up" | "down") => {
    setScreens(prev => {
      const updated = [...prev];
      const fields = [...updated[screenIdx].fields];
      const target = direction === "up" ? fieldIdx - 1 : fieldIdx + 1;
      if (target < 0 || target >= fields.length) return prev;
      [fields[fieldIdx], fields[target]] = [fields[target], fields[fieldIdx]];
      updated[screenIdx] = { ...updated[screenIdx], fields };
      return updated;
    });
  };

  const applyTemplate = (template: typeof FLOW_TEMPLATES[0]) => {
    setFlowName(template.name);
    setFlowType(template.type);
    setScreens(template.screens.map(s => ({
      ...s,
      id: generateId(),
      fields: s.fields.map(f => ({ ...f, id: generateId() })),
    })));
    setShowTemplates(false);
    setShowBuilder(true);
  };

  const exportSubmissions = (flow: WaFlow) => {
    if (submissions.length === 0) { toast.error("لا توجد ردود للتصدير"); return; }
    const fields = flow.screens.flatMap(s => s.fields);
    const rows = submissions.map(sub => {
      const row: Record<string, any> = {
        "رقم الجوال": sub.customer_phone,
        "الاسم": sub.customer_name || "",
        "التاريخ": new Date(sub.created_at).toLocaleString("ar-SA-u-ca-gregory"),
        "الحالة": sub.status === "new" ? "جديد" : "تمت المعالجة",
      };
      fields.forEach(f => { row[f.label] = sub.responses[f.id] || sub.responses[f.label] || ""; });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الردود");
    XLSX.writeFile(wb, `${flow.name}_responses.xlsx`);
    toast.success("تم تصدير الردود بنجاح");
  };

  const getFieldIcon = (type: string) => {
    const ft = FIELD_TYPES.find(f => f.value === type);
    return ft ? ft.icon : Type;
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1280px] mx-auto space-y-6 bg-mesh min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center shadow-glow shrink-0">
            <FileText className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-black text-foreground tracking-tight">نماذج واتساب</h1>
            <p className="text-sm text-muted-foreground">إنشاء نماذج تفاعلية يعبئها العميل داخل المحادثة</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowTemplates(true)} className="gap-2 rounded-xl">
            <Copy className="w-4 h-4" />
            قوالب جاهزة
          </Button>
          <Button size="sm" onClick={() => { resetBuilder(); setShowBuilder(true); }} className="gap-2 rounded-xl gradient-primary text-primary-foreground shadow-glow">
            <Plus className="w-4 h-4" />
            نموذج جديد
          </Button>
        </div>
      </div>

      {/* Flows Grid */}
      {flows.length === 0 ? (
        <div className="text-center py-20 animate-fade-in">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-10 h-10 text-primary" />
          </div>
          <h3 className="text-lg font-bold text-foreground mb-2">لا توجد نماذج بعد</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
            أنشئ نماذج تفاعلية يعبئها عملاؤك داخل محادثة الواتساب مباشرة — بدون روابط خارجية
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => setShowTemplates(true)} className="gap-2 rounded-xl">
              <Copy className="w-4 h-4" />
              ابدأ من قالب جاهز
            </Button>
            <Button onClick={() => { resetBuilder(); setShowBuilder(true); }} className="gap-2 rounded-xl gradient-primary text-primary-foreground">
              <Plus className="w-4 h-4" />
              إنشاء من الصفر
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {flows.map(flow => (
            <div key={flow.id} className="bg-card rounded-xl border border-border/50 hover:border-border hover:shadow-card-hover transition-all duration-300 overflow-hidden group">
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={flow.status === "published" ? "default" : "secondary"} className="text-[10px]">
                      {flow.status === "published" ? "منشور" : flow.status === "draft" ? "مسودة" : "مؤرشف"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {flow.flow_type === "form" ? "نموذج" : flow.flow_type === "order" ? "طلب" : flow.flow_type === "survey" ? "استبيان" : "حجز"}
                    </Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{new Date(flow.created_at).toLocaleDateString("ar-SA-u-ca-gregory")}</span>
                </div>
                <h3 className="font-bold text-foreground mb-1">{flow.name}</h3>
                {flow.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{flow.description}</p>}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ListChecks className="w-3.5 h-3.5" />
                    {flow.screens?.reduce((acc, s) => acc + (s.fields?.length || 0), 0) || 0} حقل
                  </span>
                </div>
              </div>
              <div className="border-t border-border/50 px-3 py-2.5 flex items-center gap-1 bg-secondary/30">
                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 flex-1" onClick={() => handleEditFlow(flow)}>
                  <FileText className="w-3.5 h-3.5" />
                  تعديل
                </Button>
                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 flex-1" onClick={() => { setSelectedFlow(flow); setShowPreview(true); }}>
                  <Eye className="w-3.5 h-3.5" />
                  معاينة
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs gap-1 flex-1"
                  onClick={() => {
                    setSelectedFlow(flow);
                    setShowSubmissions(true);
                    fetchSubmissions(flow.id);
                  }}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  الردود
                </Button>
                <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => handleDeleteFlow(flow.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Template Picker Dialog ═══ */}
      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">اختر قالب جاهز</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {FLOW_TEMPLATES.map(tmpl => (
              <button
                key={tmpl.type}
                onClick={() => applyTemplate(tmpl)}
                className="text-right p-4 rounded-xl border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all group"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                  <tmpl.icon className="w-5 h-5 text-primary" />
                </div>
                <h4 className="font-bold text-sm text-foreground">{tmpl.name}</h4>
                <p className="text-xs text-muted-foreground mt-1">{tmpl.description}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Builder Dialog ═══ */}
      <Dialog open={showBuilder} onOpenChange={(open) => { if (!open) resetBuilder(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {selectedFlow ? "تعديل النموذج" : "إنشاء نموذج جديد"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">اسم النموذج *</Label>
                <Input value={flowName} onChange={e => setFlowName(e.target.value)} placeholder="مثال: نموذج حجز موعد" className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold">النوع</Label>
                <Select value={flowType} onValueChange={setFlowType}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="form">نموذج عام</SelectItem>
                    <SelectItem value="order">طلب</SelectItem>
                    <SelectItem value="survey">استبيان</SelectItem>
                    <SelectItem value="appointment">حجز موعد</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">الوصف (اختياري)</Label>
              <Input value={flowDescription} onChange={e => setFlowDescription(e.target.value)} placeholder="وصف مختصر للنموذج" className="rounded-xl" />
            </div>

            {/* Screen Builder */}
            {screens.map((screen, sIdx) => (
              <div key={screen.id} className="border border-border/50 rounded-xl overflow-hidden">
                <div className="bg-secondary/50 px-4 py-3 flex items-center justify-between">
                  <Input
                    value={screen.title}
                    onChange={e => {
                      const updated = [...screens];
                      updated[sIdx] = { ...updated[sIdx], title: e.target.value };
                      setScreens(updated);
                    }}
                    className="bg-transparent border-0 font-bold text-sm p-0 h-auto focus-visible:ring-0"
                    placeholder="عنوان الشاشة"
                  />
                </div>

                <div className="p-4 space-y-3">
                  {screen.fields.map((field, fIdx) => {
                    const FieldIcon = getFieldIcon(field.type);
                    return (
                      <div key={field.id} className="border border-border/30 rounded-xl p-3 bg-card hover:border-border/60 transition-colors group">
                        <div className="flex items-start gap-3">
                          <div className="flex flex-col items-center gap-1 pt-1">
                            <button onClick={() => moveField(sIdx, fIdx, "up")} disabled={fIdx === 0} className="text-muted-foreground/40 hover:text-muted-foreground disabled:opacity-30">
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30" />
                            <button onClick={() => moveField(sIdx, fIdx, "down")} disabled={fIdx === screen.fields.length - 1} className="text-muted-foreground/40 hover:text-muted-foreground disabled:opacity-30">
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-2">
                              <FieldIcon className="w-4 h-4 text-primary shrink-0" />
                              <Input
                                value={field.label}
                                onChange={e => updateField(sIdx, fIdx, { label: e.target.value })}
                                placeholder="عنوان الحقل"
                                className="font-semibold text-sm border-0 bg-transparent p-0 h-auto focus-visible:ring-0"
                              />
                              <Badge variant="outline" className="text-[9px] shrink-0">
                                {FIELD_TYPES.find(ft => ft.value === field.type)?.label}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-3">
                              <Input
                                value={field.placeholder || ""}
                                onChange={e => updateField(sIdx, fIdx, { placeholder: e.target.value })}
                                placeholder="نص توضيحي (اختياري)"
                                className="text-xs h-8 rounded-lg"
                              />
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Switch
                                  checked={field.required}
                                  onCheckedChange={v => updateField(sIdx, fIdx, { required: v })}
                                  className="scale-75"
                                />
                                <span className="text-[10px] text-muted-foreground">مطلوب</span>
                              </div>
                            </div>

                            {/* Options for radio/checkbox/select */}
                            {["radio", "checkbox", "select"].includes(field.type) && (
                              <div className="space-y-2">
                                <Label className="text-[10px] text-muted-foreground">الخيارات:</Label>
                                {(field.options || []).map((opt, optIdx) => (
                                  <div key={optIdx} className="flex items-center gap-2">
                                    <span className="text-[10px] text-muted-foreground w-4">{optIdx + 1}.</span>
                                    <Input
                                      value={opt}
                                      onChange={e => {
                                        const newOptions = [...(field.options || [])];
                                        newOptions[optIdx] = e.target.value;
                                        updateField(sIdx, fIdx, { options: newOptions });
                                      }}
                                      className="text-xs h-7 rounded-lg"
                                    />
                                    <button
                                      onClick={() => {
                                        const newOptions = (field.options || []).filter((_, i) => i !== optIdx);
                                        updateField(sIdx, fIdx, { options: newOptions });
                                      }}
                                      className="text-destructive/50 hover:text-destructive"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-primary"
                                  onClick={() => updateField(sIdx, fIdx, { options: [...(field.options || []), `خيار ${(field.options?.length || 0) + 1}`] })}
                                >
                                  <Plus className="w-3 h-3 ml-1" />
                                  إضافة خيار
                                </Button>
                              </div>
                            )}
                          </div>

                          <button onClick={() => removeField(sIdx, fIdx)} className="text-muted-foreground/40 hover:text-destructive transition-colors p-1">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Add Field Buttons */}
                  <div className="pt-2">
                    <p className="text-[10px] text-muted-foreground mb-2">إضافة حقل:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {FIELD_TYPES.map(ft => (
                        <Button
                          key={ft.value}
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] gap-1 rounded-lg"
                          onClick={() => addField(sIdx, ft.value as FlowField["type"])}
                        >
                          <ft.icon className="w-3 h-3" />
                          {ft.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Success Message */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">رسالة النجاح (بعد التعبئة)</Label>
              <Textarea value={successMessage} onChange={e => setSuccessMessage(e.target.value)} className="rounded-xl text-sm" rows={2} />

            {/* Forward to WhatsApp (Evolution) */}
            <div className="space-y-2 bg-muted/50 rounded-xl p-3">
              <Label className="text-xs font-semibold">📲 إعادة توجيه الردود عبر واتساب غير رسمي (اختياري)</Label>
              <p className="text-[10px] text-muted-foreground">عند استلام رد من العميل، يُرسل تلقائياً لشخص أو قروب عبر الواتساب غير الرسمي</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">رقم شخص</Label>
                  <Input value={forwardToPhone} onChange={e => setForwardToPhone(e.target.value)} placeholder="966501234567" dir="ltr" className="rounded-xl text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">أو JID قروب</Label>
                  <Input value={forwardToGroupJid} onChange={e => setForwardToGroupJid(e.target.value)} placeholder="120363...@g.us" dir="ltr" className="rounded-xl text-xs" />
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground">💡 للحصول على JID القروب: أرسل رسالة في القروب ثم راجع سجل المحادثات</p>
            </div>
          </div>
          </div>

          <DialogFooter className="gap-2 pt-4">
            <Button variant="outline" onClick={resetBuilder} className="rounded-xl">إلغاء</Button>
            <Button onClick={() => setShowPreview(true)} variant="outline" className="gap-2 rounded-xl">
              <Eye className="w-4 h-4" />
              معاينة
            </Button>
            <Button onClick={handleSaveFlow} className="gap-2 rounded-xl gradient-primary text-primary-foreground">
              <CheckCircle2 className="w-4 h-4" />
              {selectedFlow ? "تحديث" : "حفظ ونشر"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Preview Dialog ═══ */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">معاينة — كيف سيظهر في الواتساب</DialogTitle>
          </DialogHeader>
          <div className="bg-[#e5ddd5] rounded-xl p-4 space-y-3 min-h-[300px]">
            {(selectedFlow?.screens || screens).map((screen) => (
              <div key={screen.id}>
                {/* Bot message bubble */}
                <div className="bg-white rounded-xl rounded-tr-sm p-3 max-w-[85%] mr-auto shadow-sm">
                  <p className="text-sm font-bold mb-2">{screen.title}</p>
                  {screen.fields.map((field, fIdx) => (
                    <div key={field.id} className="mb-2">
                      <p className="text-xs text-gray-600">
                        {fIdx + 1}. {field.label} {field.required && <span className="text-red-500">*</span>}
                      </p>
                      {["radio", "select"].includes(field.type) && field.options && (
                        <div className="mr-3 mt-1 space-y-0.5">
                          {field.options.map((opt, i) => (
                            <p key={i} className="text-[11px] text-gray-500">  {i + 1}. {opt}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <p className="text-[10px] text-gray-400 mt-2">12:00 م</p>
                </div>

                {/* Customer reply bubble */}
                <div className="bg-[#dcf8c6] rounded-xl rounded-tl-sm p-3 max-w-[75%] ml-auto mt-2 shadow-sm">
                  <p className="text-xs text-gray-600">✅ تم إرسال الردود</p>
                  <p className="text-[10px] text-gray-400 mt-1">12:01 م</p>
                </div>

                {/* Success message */}
                <div className="bg-white rounded-xl rounded-tr-sm p-3 max-w-[85%] mr-auto mt-2 shadow-sm">
                  <p className="text-xs">{selectedFlow?.success_message || successMessage}</p>
                  <p className="text-[10px] text-gray-400 mt-1">12:01 م</p>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Submissions Dialog ═══ */}
      <Dialog open={showSubmissions} onOpenChange={setShowSubmissions}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center justify-between">
              <span>ردود: {selectedFlow?.name}</span>
              {submissions.length > 0 && selectedFlow && (
                <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => exportSubmissions(selectedFlow)}>
                  <Download className="w-4 h-4" />
                  تصدير Excel
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>

          {submissions.length === 0 ? (
            <div className="text-center py-10">
              <ClipboardList className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">لا توجد ردود بعد</p>
            </div>
          ) : (
            <div className="space-y-3">
              {submissions.map(sub => {
                const fields = selectedFlow?.screens.flatMap(s => s.fields) || [];
                const isExpanded = submissionsExpanded[sub.id];
                return (
                  <div key={sub.id} className="border border-border/50 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setSubmissionsExpanded(prev => ({ ...prev, [sub.id]: !prev[sub.id] }))}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <MessageSquare className="w-4 h-4 text-primary" />
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{sub.customer_name || sub.customer_phone}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(sub.created_at).toLocaleString("ar-SA-u-ca-gregory")}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={sub.status === "new" ? "default" : "secondary"} className="text-[10px]">
                          {sub.status === "new" ? "جديد" : "تمت المعالجة"}
                        </Badge>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-border/30 pt-3 space-y-2">
                        {fields.map(f => (
                          <div key={f.id} className="flex items-start gap-2 text-sm">
                            <span className="text-muted-foreground font-medium min-w-[100px] text-xs">{f.label}:</span>
                            <span className="text-foreground text-xs">{sub.responses[f.id] || sub.responses[f.label] || "—"}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WhatsAppFlowsPage;
