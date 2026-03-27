import { useState } from "react";
import { Plus, Search, FileText, Check, Clock, XCircle, Eye, Pencil, Trash2, Copy, Globe, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { messageTemplates as initialTemplates, MessageTemplate } from "@/data/mockData";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const categoryLabels: Record<string, string> = { marketing: "تسويقي", utility: "خدمي", authentication: "مصادقة" };
const categoryColors: Record<string, string> = { marketing: "bg-primary/10 text-primary", utility: "bg-info/10 text-info", authentication: "bg-warning/10 text-warning" };
const statusLabels: Record<string, string> = { approved: "معتمد", pending: "قيد المراجعة", rejected: "مرفوض" };
const statusIcons: Record<string, typeof Check> = { approved: Check, pending: Clock, rejected: XCircle };
const statusColors: Record<string, string> = { approved: "text-success", pending: "text-warning", rejected: "text-destructive" };

const TemplatesPage = () => {
  const [templates, setTemplates] = useState(initialTemplates);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [previewTemplate, setPreviewTemplate] = useState<MessageTemplate | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: "", category: "utility" as MessageTemplate["category"], header: "", body: "", footer: "", variables: "" });

  const filtered = templates.filter((t) => {
    if (searchQuery && !t.name.includes(searchQuery) && !t.body.includes(searchQuery)) return false;
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    return true;
  });

  const handleCreate = () => {
    if (!newTemplate.name || !newTemplate.body) { toast.error("يرجى تعبئة الاسم والمحتوى"); return; }
    const t: MessageTemplate = {
      id: `t${Date.now()}`, name: newTemplate.name, category: newTemplate.category, language: "ar", status: "pending",
      header: newTemplate.header || undefined, body: newTemplate.body, footer: newTemplate.footer || undefined,
      variables: newTemplate.variables ? newTemplate.variables.split(",").map((v) => v.trim()) : undefined,
      createdAt: new Date().toISOString().split("T")[0],
    };
    setTemplates((prev) => [t, ...prev]);
    setShowCreateDialog(false);
    setNewTemplate({ name: "", category: "utility", header: "", body: "", footer: "", variables: "" });
    toast.success("تم إنشاء القالب بنجاح - بانتظار مراجعة Meta");
  };

  const handleDuplicate = (t: MessageTemplate) => {
    const dup: MessageTemplate = { ...t, id: `t${Date.now()}`, name: `${t.name}_نسخة`, status: "pending", createdAt: new Date().toISOString().split("T")[0] };
    setTemplates((prev) => [dup, ...prev]);
    toast.success("تم نسخ القالب");
  };

  const handleDelete = (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    toast.success("تم حذف القالب");
  };

  const renderTemplatePreview = (t: MessageTemplate) => (
    <div className="bg-secondary rounded-xl p-4 max-w-[300px] mx-auto space-y-2">
      {t.header && <p className="font-bold text-sm">{t.header}</p>}
      <p className="text-sm whitespace-pre-wrap">{t.body}</p>
      {t.footer && <p className="text-[11px] text-muted-foreground">{t.footer}</p>}
      {t.buttons && t.buttons.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-border">
          {t.buttons.map((btn, i) => (
            <div key={i} className="text-center text-xs text-primary font-medium py-1.5 bg-card rounded-lg">{btn.text}</div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">قوالب الرسائل</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة قوالب WhatsApp المعتمدة من Meta</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="gradient-whatsapp text-whatsapp-foreground gap-2">
              <Plus className="w-4 h-4" /> إنشاء قالب
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg" dir="rtl">
            <DialogHeader><DialogTitle>إنشاء قالب جديد</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">اسم القالب</Label>
                  <Input value={newTemplate.name} onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })} placeholder="مثال: ترحيب_عميل" className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">التصنيف</Label>
                  <Select value={newTemplate.category} onValueChange={(v: any) => setNewTemplate({ ...newTemplate, category: v })}>
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
                <Input value={newTemplate.header} onChange={(e) => setNewTemplate({ ...newTemplate, header: e.target.value })} placeholder="عنوان الرسالة" className="text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">محتوى الرسالة *</Label>
                <Textarea value={newTemplate.body} onChange={(e) => setNewTemplate({ ...newTemplate, body: e.target.value })} placeholder="مرحباً {{1}}، ..." className="text-sm min-h-[100px]" />
                <p className="text-[10px] text-muted-foreground">استخدم {"{{1}}"} {"{{2}}"} للمتغيرات</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">التذييل (اختياري)</Label>
                <Input value={newTemplate.footer} onChange={(e) => setNewTemplate({ ...newTemplate, footer: e.target.value })} placeholder="مثال: للإلغاء أرسل STOP" className="text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">المتغيرات (مفصولة بفاصلة)</Label>
                <Input value={newTemplate.variables} onChange={(e) => setNewTemplate({ ...newTemplate, variables: e.target.value })} placeholder="اسم العميل, رقم الطلب" className="text-sm" />
              </div>
              <Button onClick={handleCreate} className="w-full gradient-whatsapp text-whatsapp-foreground">إرسال للمراجعة</Button>
            </div>
          </DialogContent>
        </Dialog>
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
        {[
          { label: "معتمد", count: templates.filter((t) => t.status === "approved").length, color: "text-success" },
          { label: "قيد المراجعة", count: templates.filter((t) => t.status === "pending").length, color: "text-warning" },
          { label: "مرفوض", count: templates.filter((t) => t.status === "rejected").length, color: "text-destructive" },
        ].map((s) => (
          <div key={s.label} className="bg-card rounded-xl p-3 text-center border border-border">
            <p className={cn("text-2xl font-bold", s.color)}>{s.count}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Templates Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((t) => {
          const StatusIcon = statusIcons[t.status];
          return (
            <div key={t.id} className="bg-card rounded-xl border border-border p-4 space-y-3 hover:shadow-card transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <h3 className="font-semibold text-sm truncate">{t.name}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border-0", categoryColors[t.category])}>
                      {categoryLabels[t.category]}
                    </Badge>
                    <span className={cn("flex items-center gap-0.5 text-[10px]", statusColors[t.status])}>
                      <StatusIcon className="w-3 h-3" /> {statusLabels[t.status]}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-secondary/50 rounded-lg p-3">
                {t.header && <p className="font-semibold text-xs mb-1">{t.header}</p>}
                <p className="text-xs text-muted-foreground line-clamp-3">{t.body}</p>
                {t.footer && <p className="text-[10px] text-muted-foreground/60 mt-1">{t.footer}</p>}
              </div>

              {t.variables && t.variables.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {t.variables.map((v, i) => (
                    <span key={i} className="text-[10px] bg-accent px-1.5 py-0.5 rounded text-accent-foreground">{`{{${i + 1}}} ${v}`}</span>
                  ))}
                </div>
              )}

              {t.buttons && t.buttons.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {t.buttons.map((btn, i) => (
                    <span key={i} className="text-[10px] bg-primary/5 text-primary px-2 py-0.5 rounded-full">{btn.text}</span>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Globe className="w-3 h-3" /> {t.language === "ar" ? "عربي" : t.language}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPreviewTemplate(t)} className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDuplicate(t)} className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">لا توجد قوالب مطابقة</p>
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>معاينة القالب</DialogTitle></DialogHeader>
          {previewTemplate && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-3">هكذا سيظهر القالب للعميل:</p>
              {renderTemplatePreview(previewTemplate)}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TemplatesPage;
