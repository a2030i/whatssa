import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, FileText, Check, Clock, XCircle, Eye, Globe, RefreshCw, Loader2, Pencil, Trash2, AlertTriangle, Image, Video, Type, Link, Phone, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mapMetaTemplate, type WhatsAppTemplate } from "@/types/whatsapp";

const categoryLabels: Record<string, string> = { marketing: "تسويقي", utility: "خدمي", authentication: "مصادقة" };
const categoryColors: Record<string, string> = { marketing: "bg-primary/10 text-primary", utility: "bg-info/10 text-info", authentication: "bg-warning/10 text-warning" };
const statusLabels: Record<string, string> = { approved: "معتمد", pending: "قيد المراجعة", rejected: "مرفوض", paused: "موقوف" };
const statusIcons: Record<string, typeof Check> = { approved: Check, pending: Clock, rejected: XCircle, paused: Clock };
const statusColors: Record<string, string> = { approved: "text-success", pending: "text-warning", rejected: "text-destructive", paused: "text-muted-foreground" };

interface CtaButton {
  type: "url" | "phone";
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

const emptyForm: TemplateFormData = { name: "", category: "utility", headerType: "NONE", header: "", headerUrl: "", body: "", footer: "", buttons: [] };

const TemplatesPage = () => {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [previewTemplate, setPreviewTemplate] = useState<WhatsAppTemplate | null>(null);

  // Create / Edit dialog
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<TemplateFormData>(emptyForm);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<WhatsAppTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [noWhatsApp, setNoWhatsApp] = useState(false);

  const loadTemplates = useCallback(async (showRefreshState = false) => {
    if (showRefreshState) setIsRefreshing(true);
    else setIsLoading(true);

    const { data, error } = await supabase.functions.invoke("whatsapp-templates", {
      body: { action: "list" },
    });

    if (error || data?.error) {
      toast.error(data?.error || "تعذر جلب القوالب من Meta");
      setTemplates([]);
    } else {
      setTemplates((data?.templates || []).map(mapMetaTemplate));
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const filtered = useMemo(
    () =>
      templates.filter((template) => {
        if (searchQuery && !template.name.includes(searchQuery) && !template.body.includes(searchQuery)) return false;
        if (categoryFilter !== "all" && template.category !== categoryFilter) return false;
        if (statusFilter !== "all" && template.status !== statusFilter) return false;
        return true;
      }),
    [templates, searchQuery, categoryFilter, statusFilter],
  );

  // ── Open create dialog ──
  const openCreateDialog = () => {
    setEditingTemplate(null);
    setFormData(emptyForm);
    setShowFormDialog(true);
  };

  // ── Open edit dialog ──
  const openEditDialog = (template: WhatsAppTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      category: template.category,
      headerType: (template.headerFormat === "DOCUMENT" ? "NONE" : template.headerFormat) || (template.header ? "TEXT" : "NONE"),
      header: template.header || "",
      headerUrl: template.headerUrl || "",
      body: template.body,
      footer: template.footer || "",
      buttons: (template.buttons || []).map((b) => ({
        type: b.type === "phone_number" ? "phone" : "url",
        text: b.text,
        value: b.value || "",
      })),
    });
    setShowFormDialog(true);
  };

  // ── Submit create or edit ──
  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.body.trim()) {
      toast.error("يرجى تعبئة الاسم والمحتوى");
      return;
    }

    setIsSubmitting(true);
    const action = editingTemplate ? "edit" : "create";

    const { data, error } = await supabase.functions.invoke("whatsapp-templates", {
      body: {
        action,
        name: formData.name.trim(),
        category: formData.category,
        header_type: formData.headerType,
        header: formData.headerType === "TEXT" ? formData.header.trim() : "",
        header_url: formData.headerType !== "TEXT" && formData.headerType !== "NONE" ? formData.headerUrl.trim() : "",
        body: formData.body.trim(),
        footer: formData.footer.trim(),
        buttons: formData.buttons.filter((b) => b.text.trim() && b.value.trim()),
        language: editingTemplate?.language || "ar",
      },
    });

    if (error || data?.error) {
      toast.error(data?.error || `تعذر ${editingTemplate ? "تعديل" : "إنشاء"} القالب`);
      setIsSubmitting(false);
      return;
    }

    toast.success(editingTemplate ? "تم تعديل القالب وإعادة إرساله لـ Meta" : "تم إرسال القالب إلى Meta");
    setShowFormDialog(false);
    setEditingTemplate(null);
    setFormData(emptyForm);
    setIsSubmitting(false);
    loadTemplates(true);
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);

    const { data, error } = await supabase.functions.invoke("whatsapp-templates", {
      body: { action: "delete", name: deleteTarget.name },
    });

    if (error || data?.error) {
      toast.error(data?.error || "تعذر حذف القالب");
      setIsDeleting(false);
      return;
    }

    toast.success("تم حذف القالب بنجاح");
    setDeleteTarget(null);
    setIsDeleting(false);
    loadTemplates(true);
  };

  const renderTemplatePreview = (template: WhatsAppTemplate) => (
    <div className="bg-secondary rounded-xl p-4 max-w-[300px] mx-auto space-y-2">
      {template.headerFormat === "IMAGE" && (
        <div className="bg-muted rounded-lg h-32 flex items-center justify-center">
          {template.headerUrl ? (
            <img src={template.headerUrl} alt="Header" className="w-full h-32 object-cover rounded-lg" />
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
    { label: "معتمد", count: templates.filter((t) => t.status === "approved").length, color: "text-success" },
    { label: "قيد المراجعة", count: templates.filter((t) => t.status === "pending").length, color: "text-warning" },
    { label: "مرفوض", count: templates.filter((t) => t.status === "rejected").length, color: "text-destructive" },
  ];

  const isEditing = !!editingTemplate;

  return (
    <div className="p-3 md:p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">قوالب الرسائل</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة وإنشاء وتعديل القوالب المرتبطة مع Meta</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => loadTemplates(true)} disabled={isRefreshing}>
            {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            تحديث
          </Button>
          <Button className="gradient-whatsapp text-whatsapp-foreground gap-2" onClick={openCreateDialog}>
            <Plus className="w-4 h-4" /> إنشاء قالب
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="بحث في القوالب..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pr-9 bg-secondary border-0 text-sm" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[140px] text-xs bg-secondary border-0"><SelectValue placeholder="التصنيف" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل التصنيفات</SelectItem>
            <SelectItem value="marketing">تسويقي</SelectItem>
            <SelectItem value="utility">خدمي</SelectItem>
            <SelectItem value="authentication">مصادقة</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] text-xs bg-secondary border-0"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="approved">معتمد</SelectItem>
            <SelectItem value="pending">قيد المراجعة</SelectItem>
            <SelectItem value="rejected">مرفوض</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-card rounded-xl p-3 text-center border border-border">
            <p className={cn("text-2xl font-bold", stat.color)}>{stat.count}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Templates Grid */}
      {isLoading ? (
        <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />
          <p className="text-sm">جاري جلب القوالب...</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((template) => {
            const StatusIcon = statusIcons[template.status] || Clock;
            return (
              <div key={template.id} className="bg-card rounded-xl border border-border p-4 space-y-3 hover:shadow-card transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <h3 className="font-semibold text-sm truncate" dir="ltr">{template.name}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border-0", categoryColors[template.category] || "bg-secondary text-secondary-foreground")}>
                        {categoryLabels[template.category] || template.category}
                      </Badge>
                      <span className={cn("flex items-center gap-0.5 text-[10px]", statusColors[template.status] || "text-muted-foreground")}>
                        <StatusIcon className="w-3 h-3" /> {statusLabels[template.status] || template.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewTemplate(template)} title="معاينة">
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(template)} title="تعديل">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(template)} title="حذف">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="bg-secondary/50 rounded-lg p-3">
                  {(template.headerFormat === "IMAGE" || template.headerFormat === "VIDEO") && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {template.headerFormat === "IMAGE" ? <Image className="w-3.5 h-3.5 text-primary" /> : <Video className="w-3.5 h-3.5 text-primary" />}
                      <span className="text-[10px] font-medium text-primary">{template.headerFormat === "IMAGE" ? "صورة" : "فيديو"}</span>
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
                    <Globe className="w-3 h-3" /> {template.language === "ar" ? "عربي" : template.language}
                  </span>
                  <span className="text-[10px] text-muted-foreground">Meta</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">لا توجد قوالب مطابقة</p>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showFormDialog} onOpenChange={(open) => { if (!open) { setShowFormDialog(false); setEditingTemplate(null); setFormData(emptyForm); } }}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{isEditing ? "تعديل القالب" : "إنشاء قالب جديد"}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? "سيتم حذف القالب الحالي وإعادة إنشائه بالمحتوى الجديد في Meta (يتطلب مراجعة جديدة)"
                : "أنشئ قالب رسالة جديد يُرسل مباشرة إلى Meta للمراجعة"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">اسم القالب</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="example_order_update"
                  className="text-sm"
                  dir="ltr"
                  disabled={isEditing}
                />
                {!isEditing && <p className="text-[10px] text-muted-foreground">حروف إنجليزية صغيرة وأرقام وشرطة سفلية فقط</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">التصنيف</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="marketing">تسويقي</SelectItem>
                    <SelectItem value="utility">خدمي</SelectItem>
                    <SelectItem value="authentication">مصادقة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">نوع العنوان</Label>
              <div className="flex gap-1.5">
                {([
                  { value: "NONE", label: "بدون", icon: null },
                  { value: "TEXT", label: "نص", icon: Type },
                  { value: "IMAGE", label: "صورة", icon: Image },
                  { value: "VIDEO", label: "فيديو", icon: Video },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, headerType: opt.value, header: opt.value === "TEXT" ? formData.header : "", headerUrl: opt.value !== "TEXT" && opt.value !== "NONE" ? formData.headerUrl : "" })}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium border transition-all",
                      formData.headerType === opt.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-secondary text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    {opt.icon && <opt.icon className="w-3.5 h-3.5" />}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {formData.headerType === "TEXT" && (
              <div className="space-y-1.5">
                <Label className="text-xs">نص العنوان</Label>
                <Input value={formData.header} onChange={(e) => setFormData({ ...formData, header: e.target.value })} placeholder="عنوان القالب" className="text-sm" />
              </div>
            )}
            {(formData.headerType === "IMAGE" || formData.headerType === "VIDEO") && (
              <div className="space-y-1.5">
                <Label className="text-xs">رابط {formData.headerType === "IMAGE" ? "الصورة" : "الفيديو"} (مثال)</Label>
                <Input
                  value={formData.headerUrl}
                  onChange={(e) => setFormData({ ...formData, headerUrl: e.target.value })}
                  placeholder={formData.headerType === "IMAGE" ? "https://example.com/image.jpg" : "https://example.com/video.mp4"}
                  className="text-sm"
                  dir="ltr"
                />
                <p className="text-[10px] text-muted-foreground">
                  {formData.headerType === "IMAGE"
                    ? "رابط صورة عامة (JPEG/PNG) — تُستخدم كمثال عند مراجعة Meta"
                    : "رابط فيديو عام (MP4) — يُستخدم كمثال عند مراجعة Meta"}
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">محتوى الرسالة *</Label>
              <Textarea value={formData.body} onChange={(e) => setFormData({ ...formData, body: e.target.value })} placeholder="مرحباً {{1}}، تم تحديث طلبك..." className="text-sm min-h-[100px]" />
              <p className="text-[10px] text-muted-foreground">استخدم {"{{1}}"} {"{{2}}"} للمتغيرات</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">التذييل (اختياري)</Label>
              <Input value={formData.footer} onChange={(e) => setFormData({ ...formData, footer: e.target.value })} placeholder="مثال: شكراً لتواصلك معنا" className="text-sm" />
            </div>

            {/* CTA Buttons */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">أزرار CTA (اختياري)</Label>
                {formData.buttons.length < 3 && (
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px] gap-1"
                      onClick={() => setFormData({ ...formData, buttons: [...formData.buttons, { type: "url", text: "", value: "" }] })}
                    >
                      <Link className="w-3 h-3" /> رابط URL
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px] gap-1"
                      onClick={() => setFormData({ ...formData, buttons: [...formData.buttons, { type: "phone", text: "", value: "" }] })}
                    >
                      <Phone className="w-3 h-3" /> رقم هاتف
                    </Button>
                  </div>
                )}
              </div>
              {formData.buttons.map((btn, idx) => (
                <div key={idx} className="flex items-start gap-2 bg-secondary/50 rounded-lg p-2.5">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      {btn.type === "url" ? <Link className="w-3 h-3 text-primary shrink-0" /> : <Phone className="w-3 h-3 text-primary shrink-0" />}
                      <span className="text-[10px] font-medium text-primary">{btn.type === "url" ? "رابط URL" : "رقم هاتف"}</span>
                    </div>
                    <Input
                      value={btn.text}
                      onChange={(e) => {
                        const updated = [...formData.buttons];
                        updated[idx] = { ...updated[idx], text: e.target.value };
                        setFormData({ ...formData, buttons: updated });
                      }}
                      placeholder="نص الزر"
                      className="text-xs h-8"
                    />
                    <Input
                      value={btn.value}
                      onChange={(e) => {
                        const updated = [...formData.buttons];
                        updated[idx] = { ...updated[idx], value: e.target.value };
                        setFormData({ ...formData, buttons: updated });
                      }}
                      placeholder={btn.type === "url" ? "https://example.com/page" : "+966500000000"}
                      className="text-xs h-8"
                      dir="ltr"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => setFormData({ ...formData, buttons: formData.buttons.filter((_, i) => i !== idx) })}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
              {formData.buttons.length > 0 && (
                <p className="text-[10px] text-muted-foreground">يمكنك إضافة حتى 3 أزرار. Meta تدعم زر واحد من نوع رقم هاتف وزر واحد من نوع رابط.</p>
              )}
            </div>

            {isEditing && (
              <div className="bg-warning/10 text-warning rounded-lg p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-xs">تعديل القالب يعني حذفه وإعادة إنشائه — سيحتاج مراجعة جديدة من Meta</p>
              </div>
            )}

            <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full gradient-whatsapp text-whatsapp-foreground gap-2">
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEditing ? "حفظ التعديلات" : "إرسال إلى Meta"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" /> حذف القالب
            </DialogTitle>
            <DialogDescription>
              هل تريد حذف القالب <strong dir="ltr" className="text-foreground">{deleteTarget?.name}</strong> نهائياً من Meta؟ لا يمكن التراجع عن هذا الإجراء.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting} className="gap-2">
              {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
              حذف نهائياً
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>معاينة القالب</DialogTitle></DialogHeader>
          {previewTemplate && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-3">معاينة القالب كما سيظهر للعميل:</p>
              {renderTemplatePreview(previewTemplate)}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TemplatesPage;
