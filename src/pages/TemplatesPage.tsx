import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, FileText, Check, Clock, XCircle, Eye, Globe, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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

const TemplatesPage = () => {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [previewTemplate, setPreviewTemplate] = useState<WhatsAppTemplate | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: "", category: "utility", header: "", body: "", footer: "" });

  const loadTemplates = useCallback(async (showRefreshState = false) => {
    if (showRefreshState) setIsRefreshing(true);
    else setIsLoading(true);

    const { data, error } = await supabase.functions.invoke("whatsapp-templates", {
      body: { action: "list" },
    });

    if (error || data?.error) {
      toast.error(data?.error || "تعذر جلب القوالب الحقيقية من Meta");
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

  const handleCreate = async () => {
    if (!newTemplate.name.trim() || !newTemplate.body.trim()) {
      toast.error("يرجى تعبئة الاسم والمحتوى");
      return;
    }

    setIsSubmitting(true);
    const { data, error } = await supabase.functions.invoke("whatsapp-templates", {
      body: {
        action: "create",
        name: newTemplate.name.trim(),
        category: newTemplate.category,
        header: newTemplate.header.trim(),
        body: newTemplate.body.trim(),
        footer: newTemplate.footer.trim(),
        language: "ar",
      },
    });

    if (error || data?.error) {
      toast.error(data?.error || "تعذر إنشاء القالب في Meta");
      setIsSubmitting(false);
      return;
    }

    toast.success("تم إرسال القالب الحقيقي إلى Meta");
    setShowCreateDialog(false);
    setNewTemplate({ name: "", category: "utility", header: "", body: "", footer: "" });
    setIsSubmitting(false);
    loadTemplates(true);
  };

  const renderTemplatePreview = (template: WhatsAppTemplate) => (
    <div className="bg-secondary rounded-xl p-4 max-w-[300px] mx-auto space-y-2">
      {template.header && <p className="font-bold text-sm">{template.header}</p>}
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
    { label: "معتمد", count: templates.filter((template) => template.status === "approved").length, color: "text-success" },
    { label: "قيد المراجعة", count: templates.filter((template) => template.status === "pending").length, color: "text-warning" },
    { label: "مرفوض", count: templates.filter((template) => template.status === "rejected").length, color: "text-destructive" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">قوالب الرسائل</h1>
          <p className="text-sm text-muted-foreground mt-1">عرض وإنشاء القوالب الحقيقية المرتبطة مباشرة مع Meta</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => loadTemplates(true)} disabled={isRefreshing}>
            {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            تحديث
          </Button>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="gradient-whatsapp text-whatsapp-foreground gap-2">
                <Plus className="w-4 h-4" /> إنشاء قالب حقيقي
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg" dir="rtl">
              <DialogHeader><DialogTitle>إنشاء قالب جديد في Meta</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">اسم القالب</Label>
                    <Input value={newTemplate.name} onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })} placeholder="example_order_update" className="text-sm" dir="ltr" />
                    <p className="text-[10px] text-muted-foreground">Meta تقبل الإنجليزية الصغيرة والأرقام وشرطة سفلية فقط</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">التصنيف</Label>
                    <Select value={newTemplate.category} onValueChange={(value) => setNewTemplate({ ...newTemplate, category: value })}>
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
                  <Label className="text-xs">العنوان (اختياري)</Label>
                  <Input value={newTemplate.header} onChange={(e) => setNewTemplate({ ...newTemplate, header: e.target.value })} placeholder="عنوان القالب" className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">محتوى الرسالة *</Label>
                  <Textarea value={newTemplate.body} onChange={(e) => setNewTemplate({ ...newTemplate, body: e.target.value })} placeholder="مرحباً {{1}}، تم تحديث طلبك..." className="text-sm min-h-[100px]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">التذييل (اختياري)</Label>
                  <Input value={newTemplate.footer} onChange={(e) => setNewTemplate({ ...newTemplate, footer: e.target.value })} placeholder="مثال: شكراً لتواصلك معنا" className="text-sm" />
                </div>
                <Button onClick={handleCreate} disabled={isSubmitting} className="w-full gradient-whatsapp text-whatsapp-foreground gap-2">
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  إرسال إلى Meta
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

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

      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-card rounded-xl p-3 text-center border border-border">
            <p className={cn("text-2xl font-bold", stat.color)}>{stat.count}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />
          <p className="text-sm">جاري جلب القوالب الحقيقية...</p>
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
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewTemplate(template)}>
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <div className="bg-secondary/50 rounded-lg p-3">
                  {template.header && <p className="font-semibold text-xs mb-1">{template.header}</p>}
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
          <p className="text-sm">لا توجد قوالب حقيقية مطابقة</p>
        </div>
      )}

      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>معاينة القالب</DialogTitle></DialogHeader>
          {previewTemplate && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-3">المعاينة مبنية من القالب الحقيقي في Meta:</p>
              {renderTemplatePreview(previewTemplate)}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TemplatesPage;