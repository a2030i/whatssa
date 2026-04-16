import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  MessageSquare,
  Search,
  FileText,
  Check,
  Clock,
  XCircle,
  Eye,
  Globe,
  RefreshCw,
  Loader2,
  Pencil,
  Trash2,
  AlertTriangle,
  Image,
  Video,
  Type,
  Link,
  Phone,
  X,
  BarChart3,
  TrendingUp,
  Send as SendIcon,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invokeCloud } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { buildTemplateComponents, mapMetaTemplate, type WhatsAppTemplate } from "@/types/whatsapp";
import { useNavigate } from "react-router-dom";
import { Copy } from "lucide-react";

const categoryLabels: Record<string, string> = {
  marketing: "تسويقي",
  utility: "خدمي",
  authentication: "مصادقة",
};

const categoryLabelsEn: Record<string, string> = {
  marketing: "Marketing",
  utility: "Utility",
  authentication: "Authentication",
};

const categoryColors: Record<string, string> = {
  marketing: "bg-primary/10 text-primary",
  utility: "bg-info/10 text-info",
  authentication: "bg-warning/10 text-warning",
};

const statusLabels: Record<string, string> = {
  approved: "معتمد",
  pending: "قيد المراجعة",
  rejected: "مرفوض",
  paused: "موقوف",
};

const statusLabelsEn: Record<string, string> = {
  approved: "Approved",
  pending: "Pending review",
  rejected: "Rejected",
  paused: "Paused",
};

const statusIcons: Record<string, typeof Check> = {
  approved: Check,
  pending: Clock,
  rejected: XCircle,
  paused: Clock,
};

const statusColors: Record<string, string> = {
  approved: "text-success",
  pending: "text-warning",
  rejected: "text-destructive",
  paused: "text-muted-foreground",
};

interface CtaButton {
  type: "url" | "phone" | "quick_reply";
  text: string;
  value: string;
}

interface TemplateFormData {
  name: string;
  category: string;
  headerType: "NONE" | "TEXT" | "IMAGE" | "VIDEO";
  header: string;
  headerUrl: string;
  body: string;
  footer: string;
  buttons: CtaButton[];
}

interface TemplateSuggestion {
  label: string;
  description: string;
  form: TemplateFormData;
}

const emptyForm: TemplateFormData = {
  name: "",
  category: "utility",
  headerType: "NONE",
  header: "",
  headerUrl: "",
  body: "",
  footer: "",
  buttons: [],
};

const ecommerceTemplateSuggestions: TemplateSuggestion[] = [
  {
    label: "طلب جديد",
    description: "إشعار العميل بتأكيد الطلب",
    form: {
      name: "order_confirmation",
      category: "utility",
      headerType: "TEXT",
      header: "تأكيد الطلب ✅",
      headerUrl: "",
      body: "مرحباً {{1}}،\n\nتم استلام طلبك رقم #{{2}} بنجاح!\n\nالمبلغ الإجمالي: {{3}} ريال\n\nسنقوم بتحديثك فور شحن الطلب. شكراً لتسوقك معنا! 🛍️",
      footer: "للاستفسار، تواصل معنا هنا",
      buttons: [],
    },
  },
  {
    label: "تم الشحن",
    description: "إبلاغ العميل بشحن الطلب",
    form: {
      name: "order_shipped",
      category: "utility",
      headerType: "TEXT",
      header: "طلبك في الطريق 🚚",
      headerUrl: "",
      body: "مرحباً {{1}}،\n\nتم شحن طلبك رقم #{{2}}!\n\nيمكنك تتبع شحنتك عبر الرابط أدناه.\n\nنتمنى لك تجربة رائعة! ✨",
      footer: "",
      buttons: [{ type: "url", text: "تتبع الشحنة", value: "https://example.com/track/{{1}}" }],
    },
  },
  {
    label: "تم التوصيل",
    description: "تأكيد وصول الطلب وطلب التقييم",
    form: {
      name: "order_delivered",
      category: "utility",
      headerType: "TEXT",
      header: "وصل طلبك! 🎉",
      headerUrl: "",
      body: "مرحباً {{1}}،\n\nتم توصيل طلبك رقم #{{2}} بنجاح!\n\nنتمنى أن تكون راضياً عن المنتجات. رأيك يهمنا!\n\nشكراً لثقتك بنا 💚",
      footer: "",
      buttons: [],
    },
  },
  {
    label: "سلة متروكة",
    description: "تذكير العميل بإتمام الشراء",
    form: {
      name: "abandoned_cart_reminder",
      category: "marketing",
      headerType: "TEXT",
      header: "ما تنسى سلتك! 🛒",
      headerUrl: "",
      body: "مرحباً {{1}}،\n\nلاحظنا إنك ما أكملت طلبك بعد!\n\nعندك منتجات بقيمة {{2}} ريال في سلتك.\n\nأكمل طلبك الحين قبل نفاد الكمية ⏰",
      footer: "",
      buttons: [{ type: "url", text: "أكمل الطلب", value: "{{1}}" }],
    },
  },
  {
    label: "رسالة ترحيب",
    description: "ترحيب بالعميل الجديد",
    form: {
      name: "welcome_customer",
      category: "marketing",
      headerType: "TEXT",
      header: "أهلاً وسهلاً! 👋",
      headerUrl: "",
      body: "مرحباً {{1}}،\n\nحياك الله في متجرنا! 🎉\n\nنحن سعداء بانضمامك. تصفّح أحدث المنتجات واستمتع بتجربة تسوق مميزة.\n\nلأي استفسار، نحن هنا لخدمتك!",
      footer: "",
      buttons: [],
    },
  },
  {
    label: "تحديث حالة الطلب",
    description: "إشعار عام بتغيّر حالة الطلب",
    form: {
      name: "order_status_update",
      category: "utility",
      headerType: "NONE",
      header: "",
      headerUrl: "",
      body: "مرحباً {{1}}،\n\nتم تحديث حالة طلبك رقم #{{2}} إلى: {{3}}\n\nللمزيد من التفاصيل، لا تتردد بالتواصل معنا.",
      footer: "متجرك الإلكتروني",
      buttons: [],
    },
  },
];

const reviewChecklist = {
  ar: [
    "① ابدأ من صفحة التكاملات: اربط رقم واتساب عبر Meta Embedded Signup (يظهر تسجيل دخول Meta ومنح الصلاحيات).",
    "② ارجع لصفحة القوالب: أنشئ قالباً جديداً أو افتح قالباً موجوداً.",
    "③ حدّث الصفحة لإظهار حالة القالب وإدارته بعد المزامنة من Meta.",
    "④ افتح نافذة الإرسال وأرسل قالباً معتمداً إلى رقم الاختبار.",
  ],
  en: [
    "① Start from the Integrations page: Connect a WhatsApp number via Meta Embedded Signup (shows the full Meta login flow and permission grant).",
    "② Navigate to the Templates page: Create a new template or open an existing one.",
    "③ Refresh to show the template status synced from Meta (Approved / Pending / Rejected).",
    "④ Open the send dialog and send an approved template to a test phone number.",
  ],
};

const replaceTemplateVariables = (template: WhatsAppTemplate, variables: string[]) => {
  return variables.reduce(
    (message, value, index) => message.replace(new RegExp(`\\{\\{${index + 1}\\}\\}`, 'g'), value || `{{${index + 1}}}`),
    template.body,
  );
};

const TemplateAnalytics = ({ isReviewMode }: { isReviewMode: boolean }) => {
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const { data, error } = await invokeCloud("whatsapp-catalog", {
        body: { action: "template_analytics" },
      });
      if (!error && data?.analytics) setAnalytics(data.analytics);
      setIsLoading(false);
    })();
  }, []);

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {isReviewMode ? "Loading template analytics from Meta..." : "جاري جلب تحليلات القوالب من Meta..."}
        </p>
      </div>
    );
  }

  if (analytics.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center">
        <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-semibold text-sm">{isReviewMode ? "No analytics available yet" : "لا توجد بيانات تحليلية"}</h3>
        <p className="text-xs text-muted-foreground mt-1">
          {isReviewMode ? "Start sending template messages to see analytics here." : "ابدأ بإرسال رسائل عبر القوالب لتظهر الإحصائيات هنا"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {analytics.map((templateData: any, idx: number) => {
        const points = templateData.data_points || [];
        const totals = points.reduce(
          (acc: any, dp: any) => {
            acc.sent += dp.sent || 0;
            acc.delivered += dp.delivered || 0;
            acc.read += dp.read || 0;
            acc.clicked += dp.clicked || 0;
            return acc;
          },
          { sent: 0, delivered: 0, read: 0, clicked: 0 },
        );

        const deliveryRate = totals.sent > 0 ? Math.round((totals.delivered / totals.sent) * 100) : 0;
        const readRate = totals.delivered > 0 ? Math.round((totals.read / totals.delivered) * 100) : 0;
        const clickRate = totals.read > 0 ? Math.round((totals.clicked / totals.read) * 100) : 0;

        return (
          <div key={idx} className="bg-card rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm" dir="ltr">
                {templateData.template_id || (isReviewMode ? `Template ${idx + 1}` : `قالب ${idx + 1}`)}
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-foreground">{totals.sent.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                  <SendIcon className="w-3 h-3" /> {isReviewMode ? "Sent" : "مرسل"}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-success">{deliveryRate}%</p>
                <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                  <Check className="w-3 h-3" /> {isReviewMode ? "Delivered" : "تسليم"}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-primary">{readRate}%</p>
                <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                  <BookOpen className="w-3 h-3" /> {isReviewMode ? "Read" : "قراءة"}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-warning">{clickRate > 0 ? `${clickRate}%` : "-"}</p>
                <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                  <TrendingUp className="w-3 h-3" /> {isReviewMode ? "Clicks" : "نقرات"}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

interface MetaChannel {
  id: string;
  display_phone: string;
  business_name: string | null;
  channel_label: string | null;
  business_account_id?: string;
}
const TemplatesPage = () => {
  const { isSuperAdmin, impersonatedOrgId } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [previewTemplate, setPreviewTemplate] = useState<WhatsAppTemplate | null>(null);
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<TemplateFormData>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<WhatsAppTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [noWhatsApp, setNoWhatsApp] = useState(false);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [sendTarget, setSendTarget] = useState<WhatsAppTemplate | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testVariables, setTestVariables] = useState<string[]>([]);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [metaChannels, setMetaChannels] = useState<MetaChannel[]>([]);
  const [selectedFormChannel, setSelectedFormChannel] = useState<string>("");
  const groupedWabas = useMemo(() => {
    const map = new Map<string, { id: string; name: string; phones: string[] }>();
    metaChannels.forEach((ch) => {
      const wabaId = ch.business_account_id || ch.id;
      if (map.has(wabaId)) {
        map.get(wabaId)!.phones.push(ch.channel_label || ch.display_phone);
      } else {
        map.set(wabaId, { id: ch.id, name: ch.business_name || ch.channel_label || ch.display_phone, phones: [ch.channel_label || ch.display_phone] });
      }
    });
    return Array.from(map.values());
  }, [metaChannels]);
  useEffect(() => {
    setIsReviewMode(window.localStorage.getItem("meta-review-mode") === "1");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("meta-review-mode", isReviewMode ? "1" : "0");
  }, [isReviewMode]);

  const loadTemplates = useCallback(async (showRefreshState = false) => {
    if (showRefreshState) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      // Load channels and templates in parallel
      const extraBody = impersonatedOrgId ? { org_id: impersonatedOrgId } : {};
      const [channelsRes, templatesRes] = await Promise.all([
        invokeCloud("whatsapp-templates", { body: { action: "channels", ...extraBody } }),
        invokeCloud("whatsapp-templates", { body: { action: "list_all", ...extraBody } }),
      ]);

      // Process channels
      if (!channelsRes.error && channelsRes.data?.channels) {
        setMetaChannels(channelsRes.data.channels);
      }

      // Process templates
      if (templatesRes.error || templatesRes.data?.error) {
        const errMsg = templatesRes.data?.error || templatesRes.error?.message || "";
        if (errMsg.toLowerCase().includes("whatsapp") || errMsg.includes("واتساب")) {
          setNoWhatsApp(true);
        } else {
          toast.error(errMsg || (isReviewMode ? "Failed to load templates from Meta" : "تعذر جلب القوالب من Meta"));
        }
        setTemplates([]);
      } else {
        setNoWhatsApp(false);
        const raw = (templatesRes.data?.templates || []).map(mapMetaTemplate);
        const grouped = new Map<string, WhatsAppTemplate>();
        raw.forEach((t: any) => {
          const key = `${t.name}__${t.language}`;
          if (grouped.has(key)) {
            const existing = grouped.get(key)!;
            if (!existing.channels) existing.channels = [{ id: existing.channelId, name: existing.channelName, phone: existing.channelPhone }];
            existing.channels.push({ id: t.channelId, name: t.channelName, phone: t.channelPhone });
          } else {
            grouped.set(key, { ...t, channels: [{ id: t.channelId, name: t.channelName, phone: t.channelPhone }] });
          }
        });
        setTemplates(Array.from(grouped.values()));
      }
    } catch (e: any) {
      console.error("loadTemplates error:", e);
      toast.error(isReviewMode ? "Failed to load templates" : "تعذر جلب القوالب");
      setTemplates([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isReviewMode, impersonatedOrgId]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return templates.filter((template) => {
      if (query && !template.name.toLowerCase().includes(query) && !template.body.toLowerCase().includes(query)) return false;
      if (categoryFilter !== "all" && template.category !== categoryFilter) return false;
      if (statusFilter !== "all" && template.status !== statusFilter) return false;
      if (channelFilter !== "all" && template.channelId !== channelFilter) return false;
      return true;
    });
  }, [templates, searchQuery, categoryFilter, statusFilter, channelFilter]);

  const openCreateDialog = () => {
    setEditingTemplate(null);
    setFormData(emptyForm);
    setShowSuggestions(false);
    setSelectedFormChannel(metaChannels.length === 1 ? metaChannels[0].id : "");
    setShowFormDialog(true);
  };

  const openEditDialog = (template: WhatsAppTemplate) => {
    setEditingTemplate(template);
    setSelectedFormChannel(template.channelId || metaChannels[0]?.id || "");
    setFormData({
      name: template.name,
      category: template.category,
      headerType: (template.headerFormat === "DOCUMENT" ? "NONE" : template.headerFormat) || (template.header ? "TEXT" : "NONE"),
      header: template.header || "",
      headerUrl: template.headerUrl || "",
      body: template.body,
      footer: template.footer || "",
      buttons: (template.buttons || []).map((button) => ({
        type: button.type === "phone_number" ? "phone" : button.type === "quick_reply" ? "quick_reply" : "url",
        text: button.text,
        value: button.value || "",
      })),
    });
    setShowFormDialog(true);
  };

  const openDuplicateDialog = (template: WhatsAppTemplate) => {
    setEditingTemplate(null);
    const baseName = template.name || "template";
    const lang = template.language || "ar";

    // Generate a unique "copy" name to reduce clashes in Meta.
    let dupName = `${baseName}_copy`;
    if (templates.some((t) => t.name === dupName && t.language === lang)) {
      let i = 2;
      while (i < 50 && templates.some((t) => t.name === `${dupName}_${i}` && t.language === lang)) i++;
      dupName = `${dupName}_${i}`;
    }

    setSelectedFormChannel(template.channelId || (metaChannels.length === 1 ? metaChannels[0]?.id || "" : metaChannels[0]?.id || ""));
    setFormData({
      name: dupName,
      category: template.category,
      headerType: (template.headerFormat === "DOCUMENT" ? "NONE" : template.headerFormat) || (template.header ? "TEXT" : "NONE"),
      header: template.header || "",
      headerUrl: template.headerUrl || "",
      body: template.body,
      footer: template.footer || "",
      buttons: (template.buttons || []).map((button) => ({
        type: button.type === "phone_number" ? "phone" : button.type === "quick_reply" ? "quick_reply" : "url",
        text: button.text,
        value: button.value || "",
      })),
    });
    setShowSuggestions(false);
    setShowFormDialog(true);
  };

  const openSendDialog = (template: WhatsAppTemplate) => {
    setSendTarget(template);
    setTestVariables(Array.from({ length: template.variableCount }, () => ""));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.body.trim()) {
      toast.error(isReviewMode ? "Please fill in the template name and body" : "يرجى تعبئة الاسم والمحتوى");
      return;
    }

    if (metaChannels.length > 1 && !selectedFormChannel) {
      toast.error(isReviewMode ? "Please select a WhatsApp number" : "يرجى اختيار الرقم الرسمي");
      return;
    }

    setIsSubmitting(true);
    const action = editingTemplate ? "edit" : "create";

    const outgoingButtons = formData.buttons
      .filter((button) => button.text.trim() && (button.type === "quick_reply" || button.value.trim()))
      .map((button) => {
        return {
          type: button.type,
          text: button.text.trim(),
          ...(button.type === "quick_reply" ? {} : { value: button.value.trim() }),
        };
      });

    // Meta template review expects "example" values for BODY/HEADER variables.
    // We auto-generate safe example strings to avoid missing-required-field rejections.
    const extractExampleValues = (text: string) => {
      const re = /\{\{(\d+)\}\}/g;
      const indices = new Set<number>();
      let match: RegExpExecArray | null;
      while ((match = re.exec(text)) !== null) {
        const idx = Number(match[1]);
        if (!Number.isNaN(idx) && idx > 0) indices.add(idx);
      }
      const max = indices.size ? Math.max(...Array.from(indices)) : 0;
      return Array.from({ length: max }, (_, i) => `example_${i + 1}`);
    };

    const bodyExampleValues = extractExampleValues(formData.body);
    const headerExampleValues = formData.headerType === "TEXT" ? extractExampleValues(formData.header) : [];

    const { data, error } = await invokeCloud("whatsapp-templates", {
      body: {
        action,
          channel_id: selectedFormChannel || undefined,
          template_id: editingTemplate?.id || undefined,
        ...(impersonatedOrgId ? { org_id: impersonatedOrgId } : {}),
        name: formData.name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""),
        category: formData.category,
        header_type: formData.headerType,
        header: formData.headerType === "TEXT" ? formData.header.trim() : "",
        header_url: formData.headerType !== "TEXT" && formData.headerType !== "NONE" ? formData.headerUrl.trim() : "",
        body: formData.body.trim(),
        footer: formData.footer.trim(),
          buttons: outgoingButtons,
        body_example_values: bodyExampleValues,
        header_example_values: headerExampleValues,
        language: editingTemplate?.language || "ar",
      },
    });

    if (error || data?.error) {
      const errMsg =
        data?.error ||
        (typeof error === "string" ? error : (error as any)?.message) ||
        (error ? JSON.stringify(error) : "");

      console.error("whatsapp-templates submit failed", {
        action,
        template_id: editingTemplate?.id,
        template_name: formData.name,
        err: errMsg,
      });

      toast.error(
        errMsg ||
          (isReviewMode ? `Failed to ${editingTemplate ? "update" : "create"} template` : `تعذر ${editingTemplate ? "تعديل" : "إنشاء"} القالب`),
      );
      setIsSubmitting(false);
      return;
    }

    toast.success(
      editingTemplate
        ? isReviewMode
          ? "Template updated and resubmitted to Meta"
          : "تم تعديل القالب وإعادة إرساله لـ Meta"
        : isReviewMode
          ? "Template submitted to Meta"
          : "تم إرسال القالب إلى Meta",
    );

    setShowFormDialog(false);
    setEditingTemplate(null);
    setFormData(emptyForm);
    setIsSubmitting(false);
    loadTemplates(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);

    const { data, error } = await invokeCloud("whatsapp-templates", {
      body: { action: "delete", name: deleteTarget.name, channel_id: deleteTarget.channelId || undefined, ...(impersonatedOrgId ? { org_id: impersonatedOrgId } : {}) },
    });

    if (error || data?.error) {
      toast.error(data?.error || (isReviewMode ? "Failed to delete template" : "تعذر حذف القالب"));
      setIsDeleting(false);
      return;
    }

    toast.success(isReviewMode ? "Template deleted successfully" : "تم حذف القالب بنجاح");
    setDeleteTarget(null);
    setIsDeleting(false);
    loadTemplates(true);
  };

  const handleSendTest = async () => {
    if (!sendTarget) return;

    if (!testPhone.trim()) {
      toast.error(isReviewMode ? "Enter a test phone number" : "أدخل رقم اختبار");
      return;
    }

    setIsSendingTest(true);

    const { data, error } = await invokeCloud("whatsapp-send", {
      body: {
        to: testPhone.trim(),
        type: "template",
        template_name: sendTarget.name,
        template_language: sendTarget.language,
        template_components: buildTemplateComponents(sendTarget, testVariables),
        channel_id: sendTarget.channelId || undefined,
      },
    });

    if (error || data?.error) {
      toast.error(data?.error || (isReviewMode ? "Failed to send test template" : "فشل إرسال القالب التجريبي"));
      setIsSendingTest(false);
      return;
    }

    toast.success(isReviewMode ? "Test template sent successfully" : "تم إرسال القالب التجريبي بنجاح");
    setIsSendingTest(false);
    setSendTarget(null);
  };

  const activeCategoryLabels = isReviewMode ? categoryLabelsEn : categoryLabels;
  const activeStatusLabels = isReviewMode ? statusLabelsEn : statusLabels;

  const renderTemplatePreview = (template: WhatsAppTemplate) => (
    <div className="bg-secondary rounded-xl p-4 max-w-[320px] mx-auto space-y-2">
      {template.headerFormat === "IMAGE" && (
        <div className="bg-muted rounded-lg h-32 flex items-center justify-center overflow-hidden">
          {template.headerUrl ? (
            <img src={template.headerUrl} alt="Template header" className="w-full h-32 object-cover rounded-lg" loading="lazy" />
          ) : (
            <Image className="w-8 h-8 text-muted-foreground" />
          )}
        </div>
      )}
      {template.headerFormat === "VIDEO" && (
        <div className="bg-muted rounded-lg h-32 flex items-center justify-center">
          <Video className="w-8 h-8 text-muted-foreground" />
        </div>
      )}
      {template.header && template.headerFormat !== "IMAGE" && template.headerFormat !== "VIDEO" && (
        <p className="font-bold text-sm">{template.header}</p>
      )}
      <p className="text-sm whitespace-pre-wrap">{template.body}</p>
      {template.footer && <p className="text-[11px] text-muted-foreground">{template.footer}</p>}
      {template.buttons && template.buttons.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-border">
          {template.buttons.map((button, index) => (
            <div key={`${button.text}-${index}`} className="text-center text-xs text-primary font-medium py-1.5 bg-card rounded-lg">
              {button.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const stats = [
    { label: isReviewMode ? "Approved" : "معتمد", count: templates.filter((template) => template.status === "approved").length, color: "text-success" },
    { label: isReviewMode ? "Pending" : "قيد المراجعة", count: templates.filter((template) => template.status === "pending").length, color: "text-warning" },
    { label: isReviewMode ? "Rejected" : "مرفوض", count: templates.filter((template) => template.status === "rejected").length, color: "text-destructive" },
  ];

  const isEditing = !!editingTemplate;
  const guideItems = isReviewMode ? reviewChecklist.en : reviewChecklist.ar;

  return (
    <div className="p-3 md:p-6 space-y-6" dir={isReviewMode ? "ltr" : "rtl"}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">{isReviewMode ? "Message Templates" : "قوالب الرسائل"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isReviewMode ? "Create, manage, review, and test WhatsApp templates connected to Meta." : "إدارة وإنشاء وتعديل القوالب المرتبطة مع Meta"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setIsReviewMode((prev) => !prev)}>
              <Globe className="w-4 h-4" />
              {isReviewMode ? "Arabic mode" : "Meta Review Mode"}
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-2" onClick={() => loadTemplates(true)} disabled={isRefreshing}>
            {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isReviewMode ? "Sync from Meta" : "مزامنة من Meta"}
          </Button>
          <Button className="gradient-whatsapp text-whatsapp-foreground gap-2" onClick={openCreateDialog}>
            <Plus className="w-4 h-4" /> {isReviewMode ? "Create Template" : "إنشاء قالب"}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 md:p-5 space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2 max-w-2xl">
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              {isReviewMode ? "Meta App Review" : "مراجعة Meta"}
            </Badge>
            <h2 className="text-base font-semibold">
              {isReviewMode ? "This page now covers the template creation, management, and sending flow required for review." : "هذه الصفحة أصبحت تغطي إنشاء القالب وإدارته وإرساله كما تطلب Meta في المراجعة."}
            </h2>
            <ol className="space-y-1 text-sm text-muted-foreground">
              {guideItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
          <Button
            variant="secondary"
            className="gap-2"
            onClick={() => {
              const approvedTemplate = templates.find((template) => template.status === "approved");
              if (!approvedTemplate) {
                toast.error(isReviewMode ? "Approve or refresh a template first" : "اعتمد قالباً أو حدّث القائمة أولاً");
                return;
              }
              openSendDialog(approvedTemplate);
            }}
          >
            <SendIcon className="w-4 h-4" />
            {isReviewMode ? "Send Approved Template" : "إرسال قالب معتمد"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="templates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="templates" className="gap-1.5">
            <FileText className="w-3.5 h-3.5" /> {isReviewMode ? "Templates" : "القوالب"}
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" /> {isReviewMode ? "Analytics" : "التحليلات"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analytics">
          <TemplateAnalytics isReviewMode={isReviewMode} />
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={isReviewMode ? "Search templates..." : "بحث في القوالب..."}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pr-9 bg-secondary border-0 text-sm"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[170px] text-xs bg-secondary border-0">
                <SelectValue placeholder={isReviewMode ? "Category" : "التصنيف"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isReviewMode ? "All categories" : "كل التصنيفات"}</SelectItem>
                <SelectItem value="marketing">{activeCategoryLabels.marketing}</SelectItem>
                <SelectItem value="utility">{activeCategoryLabels.utility}</SelectItem>
                <SelectItem value="authentication">{activeCategoryLabels.authentication}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[170px] text-xs bg-secondary border-0">
                <SelectValue placeholder={isReviewMode ? "Status" : "الحالة"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isReviewMode ? "All statuses" : "كل الحالات"}</SelectItem>
                <SelectItem value="approved">{activeStatusLabels.approved}</SelectItem>
                <SelectItem value="pending">{activeStatusLabels.pending}</SelectItem>
                <SelectItem value="rejected">{activeStatusLabels.rejected}</SelectItem>
              </SelectContent>
            </Select>
            {metaChannels.length > 1 && (
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="w-[200px] text-xs bg-secondary border-0">
                  <SelectValue placeholder={isReviewMode ? "Channel" : "الرقم"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isReviewMode ? "All numbers" : "كل الأرقام"}</SelectItem>
                  {metaChannels.map((ch) => (
                    <SelectItem key={ch.id} value={ch.id}>
                      {ch.channel_label || ch.business_name || ch.display_phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-card rounded-xl p-3 text-center border border-border">
                <p className={cn("text-2xl font-bold", stat.color)}>{stat.count}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>

          {noWhatsApp ? (
            <div className="bg-card rounded-xl border border-border p-8 text-center space-y-3">
              <AlertTriangle className="w-10 h-10 mx-auto text-warning" />
              <h3 className="font-semibold">
                {isReviewMode ? "Templates require an official WhatsApp Cloud API connection" : "القوالب تتطلب ربط رقم عبر WhatsApp Cloud API"}
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {isReviewMode
                  ? "Template management is available only through the official Meta Cloud API connection. Connect an official number from the integrations page first."
                  : "ميزة القوالب متاحة فقط عبر Meta Cloud API الرسمي. إذا كنت تستخدم واتساب ويب فلن تتمكن من إدارة القوالب. اربط رقماً رسمياً من صفحة التكاملات."}
              </p>
              <Button variant="outline" className="mt-2" onClick={() => navigate("/integrations")}>
                {isReviewMode ? "Go to integrations" : "الذهاب للتكاملات"}
              </Button>
            </div>
          ) : isLoading ? (
            <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />
              <p className="text-sm">{isReviewMode ? "Loading templates..." : "جاري جلب القوالب..."}</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((template) => {
                const StatusIcon = statusIcons[template.status] || Clock;
                return (
                  <div key={template.id} className="bg-card rounded-xl border border-border p-4 space-y-3 hover:shadow-card transition-shadow">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                          <h3 className="font-semibold text-sm truncate" dir="ltr">{template.name}</h3>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border-0", categoryColors[template.category] || "bg-secondary text-secondary-foreground")}>
                            {activeCategoryLabels[template.category] || template.category}
                          </Badge>
                          <span className={cn("flex items-center gap-0.5 text-[10px]", statusColors[template.status] || "text-muted-foreground")}>
                            <StatusIcon className="w-3 h-3" /> {activeStatusLabels[template.status] || template.status}
                          </span>
                        </div>
                        {template.status === "rejected" && template.statusReason && (
                          <p className="text-[10px] text-destructive mt-1 line-clamp-2">
                            {isReviewMode ? `Reason: ${template.statusReason}` : `سبب الرفض: ${template.statusReason}`}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5">
                        {template.status === "approved" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openSendDialog(template)} title={isReviewMode ? "Send test" : "إرسال تجريبي"}>
                            <SendIcon className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewTemplate(template)} title={isReviewMode ? "Preview" : "معاينة"}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(template)} title={isReviewMode ? "Edit" : "تعديل"}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openDuplicateDialog(template)}
                          title={isReviewMode ? "Duplicate" : "تكرار"}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(template)} title={isReviewMode ? "Delete" : "حذف"}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="bg-secondary/50 rounded-lg p-3">
                      {(template.headerFormat === "IMAGE" || template.headerFormat === "VIDEO") && (
                        <div className="flex items-center gap-1.5 mb-1.5">
                          {template.headerFormat === "IMAGE" ? <Image className="w-3.5 h-3.5 text-primary" /> : <Video className="w-3.5 h-3.5 text-primary" />}
                          <span className="text-[10px] font-medium text-primary">
                            {template.headerFormat === "IMAGE" ? (isReviewMode ? "Image" : "صورة") : isReviewMode ? "Video" : "فيديو"}
                          </span>
                        </div>
                      )}
                      {template.header && template.headerFormat !== "IMAGE" && template.headerFormat !== "VIDEO" && (
                        <p className="font-semibold text-xs mb-1">{template.header}</p>
                      )}
                      <p className="text-xs text-muted-foreground line-clamp-3">{template.body}</p>
                      {template.footer && <p className="text-[10px] text-muted-foreground/60 mt-1">{template.footer}</p>}
                    </div>

                    {template.variableCount > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {Array.from({ length: template.variableCount }, (_, index) => (
                          <span key={index} className="text-[10px] bg-accent px-1.5 py-0.5 rounded text-accent-foreground">{`{{${index + 1}}}`}</span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Globe className="w-3 h-3" /> {template.language === "ar" ? (isReviewMode ? "Arabic" : "عربي") : template.language}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate max-w-[50%]" dir="ltr">
                        {template.channels && template.channels.length > 1 ? template.channels.map((c: any) => c.name || c.phone || "Meta").join(" ، ") : template.channelName || template.channelPhone || "Meta"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!isLoading && filtered.length === 0 && !noWhatsApp && (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{isReviewMode ? "No matching templates" : "لا توجد قوالب مطابقة"}</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={showFormDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowFormDialog(false);
            setEditingTemplate(null);
            setFormData(emptyForm);
            setShowSuggestions(false);
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir={isReviewMode ? "ltr" : "rtl"}>
          <DialogHeader>
            <DialogTitle>{isEditing ? (isReviewMode ? "Edit template" : "تعديل القالب") : isReviewMode ? "Create new template" : "إنشاء قالب جديد"}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? isReviewMode
                  ? "The current template will be deleted and recreated in Meta with the updated content. This requires a new review."
                  : "سيتم حذف القالب الحالي وإعادة إنشائه بالمحتوى الجديد في Meta (يتطلب مراجعة جديدة)"
                : isReviewMode
                  ? "Create a message template and submit it directly to Meta for review."
                  : "أنشئ قالب رسالة جديد يُرسل مباشرة إلى Meta للمراجعة"}
            </DialogDescription>
          </DialogHeader>

          {!isEditing && !isReviewMode && (
            <div className="mt-2">
              <Button variant="outline" size="sm" className="w-full text-xs gap-2 border-dashed" onClick={() => setShowSuggestions((prev) => !prev)}>
                <FileText className="w-3.5 h-3.5" />
                {showSuggestions ? "إخفاء النماذج الجاهزة" : "📋 نماذج جاهزة للمتاجر — اضغط للاختيار"}
              </Button>
              {showSuggestions && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {ecommerceTemplateSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.form.name}
                      className="bg-secondary hover:bg-accent rounded-lg p-2.5 text-right transition-colors border border-transparent hover:border-primary/30"
                      onClick={() => {
                        setFormData(suggestion.form);
                        setShowSuggestions(false);
                      }}
                    >
                      <p className="text-xs font-medium">{suggestion.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{suggestion.description}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-4 mt-2">
            {metaChannels.length >= 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs">{isReviewMode ? "Business Account" : "حافظة الأعمال"}</Label>
                <Select value={selectedFormChannel} onValueChange={setSelectedFormChannel}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder={isReviewMode ? "Select account..." : "اختر الحافظة..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {groupedWabas.map((waba) => (
                      <SelectItem key={waba.id} value={waba.id}>
                        {waba.name} ({waba.phones.join(" ، ")})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  {isReviewMode ? "Select which WhatsApp Business Account to create the template in." : "اختر أي حساب واتساب رسمي ستُنشئ فيه القالب"}
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{isReviewMode ? "Template name" : "اسم القالب"}</Label>
                <Input
                  value={formData.name}
                  onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                  placeholder="order_update_notice"
                  className="text-sm"
                  dir="ltr"
                  disabled={isEditing}
                />
                {!isEditing && (
                  <p className="text-[10px] text-muted-foreground">
                    {isReviewMode ? "Use lowercase English letters, numbers, and underscores only." : "حروف إنجليزية صغيرة وأرقام وشرطة سفلية فقط"}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{isReviewMode ? "Category" : "التصنيف"}</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="marketing">{activeCategoryLabels.marketing}</SelectItem>
                    <SelectItem value="utility">{activeCategoryLabels.utility}</SelectItem>
                    <SelectItem value="authentication">{activeCategoryLabels.authentication}</SelectItem>
                  </SelectContent>
                </Select>
                {formData.category === "utility" && (
                  <div className="mt-2 p-3 rounded-xl bg-info/5 border border-info/20 space-y-2">
                    <p className="text-[11px] font-bold text-info flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {isReviewMode ? "Tips to keep it as Utility (not Marketing)" : "نصائح لضمان قبوله كخدمي وليس تسويقي"}
                    </p>
                    <ul className="text-[10px] text-muted-foreground space-y-1 list-none">
                      {(isReviewMode ? [
                        "✅ Must be a response to a customer action (order, booking, payment)",
                        "🚫 No discounts, offers, or promo codes",
                        "🚫 No promotional CTAs like \"Shop now\" or \"Order now\"",
                        "🚫 No product recommendations or upselling",
                        "🚫 No urgency language like \"Limited time\" or \"Don't miss\"",
                        "💡 Use neutral, direct language without excessive emojis",
                        "💡 Good buttons: \"Track shipment\", \"View details\"",
                      ] : [
                        "✅ يجب أن يكون رداً على إجراء من العميل (طلب، حجز، دفع)",
                        "🚫 لا تضع خصومات أو عروض أو كوبونات",
                        "🚫 لا تستخدم أزرار ترويجية مثل \"تسوق الآن\" أو \"اطلب الآن\"",
                        "🚫 لا توصيات منتجات أو \"قد يعجبك أيضاً\"",
                        "🚫 لا لغة إلحاحية مثل \"لفترة محدودة\" أو \"لا تفوّت\"",
                        "💡 استخدم لغة محايدة ومباشرة بدون إيموجي مبالغ فيه",
                        "💡 أزرار مسموحة: \"تتبع الشحنة\"، \"عرض التفاصيل\"",
                      ]).map((tip, i) => (
                        <li key={i}>{tip}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{isReviewMode ? "Header type" : "نوع العنوان"}</Label>
              <div className="flex gap-1.5">
                {([
                  { value: "NONE", label: isReviewMode ? "None" : "بدون", icon: null },
                  { value: "TEXT", label: isReviewMode ? "Text" : "نص", icon: Type },
                  { value: "IMAGE", label: isReviewMode ? "Image" : "صورة", icon: Image },
                  { value: "VIDEO", label: isReviewMode ? "Video" : "فيديو", icon: Video },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormData({
                      ...formData,
                      headerType: option.value,
                      header: option.value === "TEXT" ? formData.header : "",
                      headerUrl: option.value !== "TEXT" && option.value !== "NONE" ? formData.headerUrl : "",
                    })}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium border transition-all",
                      formData.headerType === option.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-secondary text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {option.icon && <option.icon className="w-3.5 h-3.5" />}
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {formData.headerType === "TEXT" && (
              <div className="space-y-1.5">
                <Label className="text-xs">{isReviewMode ? "Header text" : "نص العنوان"}</Label>
                <Input
                  value={formData.header}
                  onChange={(event) => setFormData({ ...formData, header: event.target.value })}
                  placeholder={isReviewMode ? "Template header" : "عنوان القالب"}
                  className="text-sm"
                />
              </div>
            )}

            {(formData.headerType === "IMAGE" || formData.headerType === "VIDEO") && (
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {isReviewMode
                    ? `${formData.headerType === "IMAGE" ? "Image" : "Video"} URL example`
                    : `رابط ${formData.headerType === "IMAGE" ? "الصورة" : "الفيديو"} (مثال)`}
                </Label>
                <Input
                  value={formData.headerUrl}
                  onChange={(event) => setFormData({ ...formData, headerUrl: event.target.value })}
                  placeholder={formData.headerType === "IMAGE" ? "https://example.com/image.jpg" : "https://example.com/video.mp4"}
                  className="text-sm"
                  dir="ltr"
                />
                <p className="text-[10px] text-muted-foreground">
                  {formData.headerType === "IMAGE"
                    ? isReviewMode
                      ? "Use a public JPEG/PNG image URL. Meta uses it as the review sample."
                      : "رابط صورة عامة (JPEG/PNG) — تُستخدم كمثال عند مراجعة Meta"
                    : isReviewMode
                      ? "Use a public MP4 video URL. Meta uses it as the review sample."
                      : "رابط فيديو عام (MP4) — يُستخدم كمثال عند مراجعة Meta"}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">{isReviewMode ? "Message body *" : "محتوى الرسالة *"}</Label>
              <Textarea
                value={formData.body}
                onChange={(event) => setFormData({ ...formData, body: event.target.value })}
                placeholder={isReviewMode ? "Hello {{1}}, your order {{2}} has been updated..." : "مرحباً {{1}}، تم تحديث طلبك..."}
                className="text-sm min-h-[100px]"
              />
              <p className="text-[10px] text-muted-foreground">
                {isReviewMode ? "Use {{1}}, {{2}}, etc. for variables." : "استخدم {{1}} {{2}} للمتغيرات"}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{isReviewMode ? "Footer (optional)" : "التذييل (اختياري)"}</Label>
              <Input
                value={formData.footer}
                onChange={(event) => setFormData({ ...formData, footer: event.target.value })}
                placeholder={isReviewMode ? "Example: Thanks for contacting us" : "مثال: شكراً لتواصلك معنا"}
                className="text-sm"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">{isReviewMode ? "CTA buttons (optional)" : "أزرار CTA (اختياري)"}</Label>
                {formData.buttons.length < 3 && (
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px] gap-1"
                      onClick={() => setFormData({ ...formData, buttons: [...formData.buttons, { type: "url", text: "", value: "" }] })}
                    >
                      <Link className="w-3 h-3" /> {isReviewMode ? "URL button" : "رابط URL"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px] gap-1"
                      onClick={() => setFormData({ ...formData, buttons: [...formData.buttons, { type: "phone", text: "", value: "" }] })}
                    >
                      <Phone className="w-3 h-3" /> {isReviewMode ? "Phone button" : "رقم هاتف"}
                      <Phone className="w-3 h-3" /> {isReviewMode ? "Phone button" : "رقم هاتف"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px] gap-1"
                      onClick={() => setFormData({ ...formData, buttons: [...formData.buttons, { type: "quick_reply", text: "", value: "" }] })}
                    >
                      <MessageSquare className="w-3 h-3" /> {isReviewMode ? "Quick Reply" : "رد سريع"}
                    </Button>
                  </div>
                )}
              </div>

              {formData.buttons.map((button, index) => (
                <div key={index} className="flex items-start gap-2 bg-secondary/50 rounded-lg p-2.5">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      {button.type === "url" ? <Link className="w-3 h-3 text-primary shrink-0" /> : button.type === "phone" ? <Phone className="w-3 h-3 text-primary shrink-0" /> : <MessageSquare className="w-3 h-3 text-primary shrink-0" />}
                      <span className="text-[10px] font-medium text-primary">
                        {button.type === "url" ? (isReviewMode ? "URL button" : "رابط URL") : button.type === "phone" ? (isReviewMode ? "Phone button" : "رقم هاتف") : (isReviewMode ? "Quick Reply" : "رد سريع")}
                      </span>
                    </div>
                    <Input
                      value={button.text}
                      onChange={(event) => {
                        const updated = [...formData.buttons];
                        updated[index] = { ...updated[index], text: event.target.value };
                        setFormData({ ...formData, buttons: updated });
                      }}
                      placeholder={isReviewMode ? "Button text" : "نص الزر"}
                      className="text-xs h-8"
                    />
                    {button.type !== "quick_reply" && <Input
                      value={button.value}
                      onChange={(event) => {
                        const updated = [...formData.buttons];
                        updated[index] = { ...updated[index], value: event.target.value };
                        setFormData({ ...formData, buttons: updated });
                      }}
                      placeholder={button.type === "url" ? "https://example.com/page" : "+966500000000"}
                      className="text-xs h-8"
                    />}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => setFormData({ ...formData, buttons: formData.buttons.filter((_, buttonIndex) => buttonIndex !== index) })}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}

              {formData.buttons.length > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {isReviewMode ? "You can add up to 3 buttons. Meta supports one phone button and one URL button." : "يمكنك إضافة حتى 3 أزرار. Meta تدعم زر واحد من نوع رقم هاتف وزر واحد من نوع رابط."}
                </p>
              )}
            </div>

            {isEditing && (
              <div className="bg-warning/10 text-warning rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-xs">
                  {isReviewMode ? "Editing deletes and recreates the template in Meta, so it will go through review again." : "تعديل القالب يعني حذفه وإعادة إنشائه — سيحتاج مراجعة جديدة من Meta"}
                </p>
              </div>
            )}

            <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full gradient-whatsapp text-whatsapp-foreground gap-2">
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEditing ? (isReviewMode ? "Save changes" : "حفظ التعديلات") : isReviewMode ? "Submit to Meta" : "إرسال إلى Meta"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm" dir={isReviewMode ? "ltr" : "rtl"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" /> {isReviewMode ? "Delete template" : "حذف القالب"}
            </DialogTitle>
            <DialogDescription>
              {isReviewMode ? (
                <>
                  Do you want to permanently delete <strong dir="ltr" className="text-foreground">{deleteTarget?.name}</strong> from Meta? This action cannot be undone.
                </>
              ) : (
                <>
                  هل تريد حذف القالب <strong dir="ltr" className="text-foreground">{deleteTarget?.name}</strong> نهائياً من Meta؟ لا يمكن التراجع عن هذا الإجراء.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              {isReviewMode ? "Cancel" : "إلغاء"}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting} className="gap-2">
              {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isReviewMode ? "Delete permanently" : "حذف نهائياً"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-sm" dir={isReviewMode ? "ltr" : "rtl"}>
          <DialogHeader>
            <DialogTitle>{isReviewMode ? "Template preview" : "معاينة القالب"}</DialogTitle>
          </DialogHeader>
          {previewTemplate && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-3">
                {isReviewMode ? "Preview as shown to the customer:" : "معاينة القالب كما سيظهر للعميل:"}
              </p>
              {renderTemplatePreview(previewTemplate)}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!sendTarget} onOpenChange={(open) => { if (!open) setSendTarget(null); }}>
        <DialogContent className="max-w-lg" dir={isReviewMode ? "ltr" : "rtl"}>
          <DialogHeader>
            <DialogTitle>{isReviewMode ? "Send test template" : "إرسال قالب تجريبي"}</DialogTitle>
            <DialogDescription>
              {isReviewMode ? "Send an approved template to a test number to demonstrate the full use case." : "أرسل قالباً معتمداً إلى رقم اختبار لإظهار حالة الاستخدام كاملة."}
            </DialogDescription>
          </DialogHeader>

          {sendTarget && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-secondary/50 p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold" dir="ltr">{sendTarget.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {activeStatusLabels[sendTarget.status] || sendTarget.status} • {activeCategoryLabels[sendTarget.category] || sendTarget.category}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn("border-0", categoryColors[sendTarget.category] || "bg-secondary text-secondary-foreground")}>
                    {sendTarget.language === "ar" ? (isReviewMode ? "Arabic" : "عربي") : sendTarget.language}
                  </Badge>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{isReviewMode ? "Test phone number" : "رقم الاختبار"}</Label>
                <Input value={testPhone} onChange={(event) => setTestPhone(event.target.value)} placeholder="+9665XXXXXXXX" dir="ltr" />
              </div>

              {sendTarget.variableCount > 0 && (
                <div className="space-y-3">
                  <Label className="text-xs">{isReviewMode ? "Template variables" : "متغيرات القالب"}</Label>
                  {Array.from({ length: sendTarget.variableCount }, (_, index) => (
                    <div key={index} className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">
                        {isReviewMode ? `Variable {{${index + 1}}}` : `المتغير {{${index + 1}}}`}
                      </Label>
                      <Input
                        value={testVariables[index] || ""}
                        onChange={(event) => {
                          const next = [...testVariables];
                          next[index] = event.target.value;
                          setTestVariables(next);
                        }}
                        placeholder={isReviewMode ? `Value for {{${index + 1}}}` : `قيمة {{${index + 1}}}`}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground mb-2">{isReviewMode ? "Message preview" : "معاينة الرسالة"}</p>
                <p className="text-sm whitespace-pre-wrap text-foreground">
                  {replaceTemplateVariables(sendTarget, testVariables)}
                </p>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setSendTarget(null)} disabled={isSendingTest}>
                  {isReviewMode ? "Cancel" : "إلغاء"}
                </Button>
                <Button onClick={handleSendTest} disabled={isSendingTest} className="gap-2">
                  {isSendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendIcon className="w-4 h-4" />}
                  {isReviewMode ? "Send test template" : "إرسال القالب التجريبي"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TemplatesPage;

