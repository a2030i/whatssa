import { useState, useEffect, useRef } from "react";
import { Plus, Megaphone, Send, Clock, FileText, AlertCircle, Search, Target, CalendarDays, Upload, X, Eye, Users, Check, Ban, MessageSquare, BarChart3, ArrowRight, Download, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const statusConfig: Record<string, { label: string; icon: any; className: string }> = {
  draft: { label: "مسودة", icon: FileText, className: "bg-muted text-muted-foreground" },
  scheduled: { label: "مجدولة", icon: Clock, className: "bg-info/10 text-info" },
  sending: { label: "جاري الإرسال", icon: Send, className: "bg-warning/10 text-warning" },
  sent: { label: "تم الإرسال", icon: Check, className: "bg-success/10 text-success" },
  failed: { label: "فشل", icon: AlertCircle, className: "bg-destructive/10 text-destructive" },
};

interface Recipient {
  phone: string;
  name?: string;
  variables?: Record<string, string>;
}

const CampaignsPage = () => {
  const { orgId, isEcommerce } = useAuth();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [tagDefs, setTagDefs] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [detailCampaign, setDetailCampaign] = useState<any>(null);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const fileRef = useRef<HTMLInputElement>(null);

  // Create form
  const [form, setForm] = useState({
    name: "", templateName: "", templateLang: "ar", scheduledAt: "", notes: "",
    audienceType: "all" as string,
    audienceTags: [] as string[],
    excludeTags: [] as string[],
    excludeCampaignIds: [] as string[],
    variableColumns: [] as string[],
    // E-commerce filters
    filterProduct: "",
    filterCity: "",
    filterDateFrom: "",
    filterDateTo: "",
    filterMinAmount: "",
    filterMaxAmount: "",
  });
  const [uploadedRecipients, setUploadedRecipients] = useState<Recipient[]>([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [templateVars, setTemplateVars] = useState<string[]>([]);

  useEffect(() => {
    if (orgId) load();
  }, [orgId]);

  const load = async () => {
    const [c, cust, tags] = await Promise.all([
      supabase.from("campaigns").select("*").eq("org_id", orgId!).order("created_at", { ascending: false }),
      supabase.from("customers").select("*").eq("org_id", orgId!),
      supabase.from("customer_tag_definitions").select("*").eq("org_id", orgId!),
    ]);
    setCampaigns(c.data || []);
    setCustomers(cust.data || []);
    setTagDefs(tags.data || []);
    if (isEcommerce && orgId) {
      const [o, p] = await Promise.all([
        supabase.from("orders").select("*").eq("org_id", orgId),
        supabase.from("products").select("id, name, name_ar").eq("org_id", orgId),
      ]);
      setOrders(o.data || []);
      setProducts(p.data || []);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split("\n").filter(Boolean);
    const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim().toLowerCase());
    const phoneIdx = headers.findIndex((h) => h.includes("phone") || h.includes("رقم") || h.includes("جوال"));
    const nameIdx = headers.findIndex((h) => h.includes("name") || h.includes("اسم"));

    if (phoneIdx === -1) { toast.error("لم يتم العثور على عمود الأرقام — تأكد من وجود عمود phone أو رقم"); return; }

    // Detect variable columns (any column that's not phone/name)
    const varCols = headers.filter((_, i) => i !== phoneIdx && i !== nameIdx);
    setForm((f) => ({ ...f, variableColumns: varCols }));

    const recs: Recipient[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",").map((s) => s.replace(/"/g, "").trim());
      const phone = parts[phoneIdx];
      if (!phone) continue;
      const vars: Record<string, string> = {};
      varCols.forEach((col) => {
        const idx = headers.indexOf(col);
        if (idx >= 0) vars[col] = parts[idx] || "";
      });
      recs.push({ phone, name: nameIdx >= 0 ? parts[nameIdx] : undefined, variables: vars });
    }
    setUploadedRecipients(recs);
    toast.success(`تم تحميل ${recs.length} رقم من الملف`);
    if (fileRef.current) fileRef.current.value = "";
  };

  const getEcommerceFilteredCustomers = () => {
    // Get customer phones from orders matching e-commerce filters
    let filteredOrders = [...orders];
    if (form.filterProduct) {
      // We need order_items but we don't have them loaded — filter by customer or skip
      // For now filter orders that have the product name in notes/tags (simplified)
      filteredOrders = filteredOrders.filter(o => o.customer_name?.includes(form.filterProduct) || o.notes?.includes(form.filterProduct));
    }
    if (form.filterCity) {
      filteredOrders = filteredOrders.filter(o => o.customer_city === form.filterCity);
    }
    if (form.filterDateFrom) {
      filteredOrders = filteredOrders.filter(o => o.created_at >= form.filterDateFrom);
    }
    if (form.filterDateTo) {
      filteredOrders = filteredOrders.filter(o => o.created_at <= form.filterDateTo + "T23:59:59");
    }
    if (form.filterMinAmount) {
      filteredOrders = filteredOrders.filter(o => (o.total || 0) >= parseFloat(form.filterMinAmount));
    }
    if (form.filterMaxAmount) {
      filteredOrders = filteredOrders.filter(o => (o.total || 0) <= parseFloat(form.filterMaxAmount));
    }
    // Unique customer phones
    const phones = [...new Set(filteredOrders.map(o => o.customer_phone).filter(Boolean))];
    return customers.filter(c => phones.includes(c.phone));
  };

  const getAudienceCount = () => {
    if (form.audienceType === "upload") return uploadedRecipients.length;
    if (form.audienceType === "select") return selectedCustomerIds.length;
    if (form.audienceType === "orders") return getEcommerceFilteredCustomers().length;
    let filtered = customers;
    if (form.audienceType === "tags" && form.audienceTags.length > 0) {
      filtered = customers.filter((c) => (c.tags || []).some((t: string) => form.audienceTags.includes(t)));
    }
    if (form.excludeTags.length > 0) {
      filtered = filtered.filter((c) => !(c.tags || []).some((t: string) => form.excludeTags.includes(t)));
    }
    return filtered.length;
  };

  const buildRecipientList = (): Recipient[] => {
    if (form.audienceType === "upload") return uploadedRecipients;
    if (form.audienceType === "select") {
      return customers.filter((c) => selectedCustomerIds.includes(c.id)).map((c) => ({ phone: c.phone, name: c.name }));
    }
    if (form.audienceType === "orders") {
      return getEcommerceFilteredCustomers().map((c) => ({ phone: c.phone, name: c.name }));
    }
    let filtered = customers;
    if (form.audienceType === "tags" && form.audienceTags.length > 0) {
      filtered = customers.filter((c) => (c.tags || []).some((t: string) => form.audienceTags.includes(t)));
    }
    if (form.excludeTags.length > 0) {
      filtered = filtered.filter((c) => !(c.tags || []).some((t: string) => form.excludeTags.includes(t)));
    }
    return filtered.map((c) => ({ phone: c.phone, name: c.name }));
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error("يرجى كتابة اسم الحملة"); return; }
    const recipientList = buildRecipientList();
    if (recipientList.length === 0) { toast.error("لا يوجد مستلمين — اختر جمهوراً"); return; }

    const { data: campaign, error } = await supabase.from("campaigns").insert({
      org_id: orgId,
      name: form.name,
      template_name: form.templateName || null,
      template_language: form.templateLang,
      template_variables: templateVars,
      audience_type: form.audienceType,
      audience_tags: form.audienceTags,
      exclude_tags: form.excludeTags,
      exclude_campaign_ids: form.excludeCampaignIds,
      status: form.scheduledAt ? "scheduled" : "draft",
      scheduled_at: form.scheduledAt || null,
      notes: form.notes || null,
      total_recipients: recipientList.length,
    } as any).select().single();

    if (error) { toast.error("حدث خطأ في إنشاء الحملة"); return; }

    // Insert recipients in batches
    const batchSize = 500;
    for (let i = 0; i < recipientList.length; i += batchSize) {
      const batch = recipientList.slice(i, i + batchSize).map((r) => ({
        campaign_id: campaign.id,
        phone: r.phone,
        customer_name: r.name || null,
        variables: r.variables || {},
      }));
      await supabase.from("campaign_recipients").insert(batch as any);
    }

    toast.success(form.scheduledAt ? "تم جدولة الحملة بنجاح" : "تم حفظ الحملة كمسودة");
    resetForm();
    load();
  };

  const resetForm = () => {
    setShowCreate(false);
    setForm({ name: "", templateName: "", templateLang: "ar", scheduledAt: "", notes: "", audienceType: "all", audienceTags: [], excludeTags: [], excludeCampaignIds: [], variableColumns: [], filterProduct: "", filterCity: "", filterDateFrom: "", filterDateTo: "", filterMinAmount: "", filterMaxAmount: "" });
    setUploadedRecipients([]);
    setSelectedCustomerIds([]);
    setTemplateVars([]);
  };

  const openDetail = async (campaign: any) => {
    setDetailCampaign(campaign);
    const { data } = await supabase.from("campaign_recipients").select("*").eq("campaign_id", campaign.id).order("created_at", { ascending: false }).limit(500);
    setRecipients(data || []);
  };

  const exportReport = () => {
    if (!detailCampaign || recipients.length === 0) return;
    const csv = [
      "الرقم,الاسم,الحالة,وقت الإرسال,وقت التوصيل,وقت القراءة,كود الخطأ,سبب الخطأ",
      ...recipients.map((r) => `"${r.phone}","${r.customer_name || ""}","${r.status}","${r.sent_at || ""}","${r.delivered_at || ""}","${r.read_at || ""}","${r.error_code || ""}","${r.error_message || ""}"`),
    ].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign_${detailCampaign.name}_report.csv`;
    a.click();
    toast.success("تم تصدير التقرير");
  };

  const toggleTag = (tag: string, field: "audienceTags" | "excludeTags") => {
    setForm((f) => ({
      ...f,
      [field]: f[field].includes(tag) ? f[field].filter((t) => t !== tag) : [...f[field], tag],
    }));
  };

  const toggleCustomer = (id: string) => {
    setSelectedCustomerIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const filtered = campaigns.filter((c) => {
    if (searchQuery && !c.name?.includes(searchQuery)) return false;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    return true;
  });

  const totalSent = campaigns.reduce((s, c) => s + (c.sent_count || 0), 0);
  const totalDelivered = campaigns.reduce((s, c) => s + (c.delivered_count || 0), 0);

  const recipientStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: "bg-muted text-muted-foreground",
      sent: "bg-info/10 text-info",
      delivered: "bg-success/10 text-success",
      read: "bg-primary/10 text-primary",
      failed: "bg-destructive/10 text-destructive",
    };
    const labels: Record<string, string> = { pending: "قيد الانتظار", sent: "أُرسلت", delivered: "تم التوصيل", read: "تمت القراءة", failed: "فشل" };
    return <Badge className={cn("text-[9px] border-0", map[status] || map.pending)}>{labels[status] || status}</Badge>;
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1000px]" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">الحملات</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة حملات WhatsApp وتتبع نتائجها</p>
        </div>
        <Button className="gap-2 gradient-whatsapp text-whatsapp-foreground" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" /> حملة جديدة
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-lg p-4 shadow-card text-center">
          <p className="text-2xl font-bold">{campaigns.length}</p>
          <p className="text-xs text-muted-foreground">إجمالي الحملات</p>
        </div>
        <div className="bg-card rounded-lg p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-success">{campaigns.filter((c) => c.status === "sent").length}</p>
          <p className="text-xs text-muted-foreground">تم إرسالها</p>
        </div>
        <div className="bg-card rounded-lg p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-info">{totalSent.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">رسائل مرسلة</p>
        </div>
        <div className="bg-card rounded-lg p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-primary">{totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0}%</p>
          <p className="text-xs text-muted-foreground">معدل التوصيل</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="بحث في الحملات..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pr-9 bg-secondary border-0 text-sm" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] text-xs bg-secondary border-0"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="draft">مسودة</SelectItem>
            <SelectItem value="scheduled">مجدولة</SelectItem>
            <SelectItem value="sending">جاري الإرسال</SelectItem>
            <SelectItem value="sent">تم الإرسال</SelectItem>
            <SelectItem value="failed">فشل</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Campaigns List */}
      <div className="space-y-3">
        {filtered.map((campaign) => {
          const status = statusConfig[campaign.status] || statusConfig.draft;
          const deliveryRate = campaign.sent_count > 0 ? Math.round((campaign.delivered_count / campaign.sent_count) * 100) : 0;
          return (
            <div key={campaign.id} className="bg-card rounded-lg p-5 shadow-card hover:shadow-card-hover transition-shadow cursor-pointer" onClick={() => openDetail(campaign)}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <Megaphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{campaign.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {campaign.sent_at ? `أُرسلت: ${new Date(campaign.sent_at).toLocaleDateString("ar-SA")}` : campaign.scheduled_at ? `مجدولة: ${new Date(campaign.scheduled_at).toLocaleDateString("ar-SA")}` : `أُنشئت: ${new Date(campaign.created_at).toLocaleDateString("ar-SA")}`}
                      {campaign.template_name && <span className="mr-2">• قالب: {campaign.template_name}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={cn("border-0 text-xs", status.className)}>
                    <status.icon className="w-3 h-3 ml-1" />
                    {status.label}
                  </Badge>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <div className="grid grid-cols-5 gap-3 text-center">
                <div><p className="text-lg font-bold">{(campaign.total_recipients || 0).toLocaleString()}</p><p className="text-[10px] text-muted-foreground">الجمهور</p></div>
                <div><p className="text-lg font-bold">{(campaign.sent_count || 0).toLocaleString()}</p><p className="text-[10px] text-muted-foreground">مُرسلة</p></div>
                <div><p className="text-lg font-bold">{(campaign.delivered_count || 0).toLocaleString()}</p><p className="text-[10px] text-muted-foreground">تم التوصيل</p></div>
                <div><p className="text-lg font-bold text-primary">{(campaign.read_count || 0).toLocaleString()}</p><p className="text-[10px] text-muted-foreground">تمت القراءة</p></div>
                <div><p className="text-lg font-bold text-destructive">{(campaign.failed_count || 0).toLocaleString()}</p><p className="text-[10px] text-muted-foreground">فشل</p></div>
              </div>
              {campaign.sent_count > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                    <span>معدل التوصيل</span><span>{deliveryRate}%</span>
                  </div>
                  <Progress value={deliveryRate} className="h-1.5" />
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">لا توجد حملات — أنشئ حملتك الأولى</p>
          </div>
        )}
      </div>

      {/* Create Campaign Dialog */}
      <Dialog open={showCreate} onOpenChange={(v) => { if (!v) resetForm(); else setShowCreate(true); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>إنشاء حملة جديدة</DialogTitle></DialogHeader>
          <div className="space-y-5 mt-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-xs">اسم الحملة *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: عروض الصيف" className="text-sm bg-secondary border-0" />
            </div>

            {/* Template */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">اسم القالب (من Meta)</Label>
                <Input value={form.templateName} onChange={(e) => setForm({ ...form, templateName: e.target.value })} placeholder="مثال: summer_offer" className="text-sm bg-secondary border-0" dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">لغة القالب</Label>
                <Select value={form.templateLang} onValueChange={(v) => setForm({ ...form, templateLang: v })}>
                  <SelectTrigger className="text-sm bg-secondary border-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">العربية</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="en_US">English (US)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Template Variables */}
            <div className="space-y-1.5">
              <Label className="text-xs">متغيرات القالب (اختياري)</Label>
              <p className="text-[10px] text-muted-foreground">أضف أسماء المتغيرات بالترتيب مثل: الاسم، رقم_الطلب — يمكنك تعبئتها من الإكسل</p>
              <div className="flex flex-wrap gap-2">
                {templateVars.map((v, i) => (
                  <div key={i} className="flex items-center gap-1 bg-secondary rounded-full px-2.5 py-1 text-xs">
                    <span className="text-muted-foreground">{`{{${i + 1}}}`}</span>
                    <span>{v}</span>
                    <button onClick={() => setTemplateVars((prev) => prev.filter((_, j) => j !== i))}>
                      <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
                <Input
                  placeholder="أضف متغير + Enter"
                  className="w-36 h-7 text-xs bg-secondary border-0"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                      setTemplateVars((prev) => [...prev, (e.target as HTMLInputElement).value.trim()]);
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                />
              </div>
            </div>

            {/* Audience */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold">الجمهور المستهدف</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { value: "all", label: "كل العملاء", icon: Users },
                  { value: "tags", label: "حسب التصنيف", icon: Target },
                  { value: "select", label: "اختيار يدوي", icon: Check },
                  { value: "upload", label: "رفع إكسل", icon: Upload },
                  ...(isEcommerce ? [{ value: "orders", label: "حسب الطلبات", icon: ShoppingCart }] : []),
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setForm({ ...form, audienceType: opt.value })}
                    className={cn(
                      "p-3 rounded-lg border text-xs flex flex-col items-center gap-1.5 transition-all",
                      form.audienceType === opt.value ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/50"
                    )}
                  >
                    <opt.icon className="w-4 h-4" />
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Tags Selection */}
              {form.audienceType === "tags" && (
                <div className="space-y-2">
                  <Label className="text-[10px] text-muted-foreground">اختر التصنيفات المستهدفة:</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {tagDefs.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => toggleTag(t.name, "audienceTags")}
                        className={cn("text-[10px] px-2.5 py-1 rounded-full border transition-colors", form.audienceTags.includes(t.name) ? "bg-primary text-primary-foreground border-primary" : "bg-secondary border-border")}
                      >
                        {t.name}
                      </button>
                    ))}
                    {tagDefs.length === 0 && <span className="text-[10px] text-muted-foreground">لا توجد تصنيفات — أضفها من إعدادات العملاء</span>}
                  </div>
                </div>
              )}

              {/* Manual Selection */}
              {form.audienceType === "select" && (
                <div className="space-y-2 max-h-48 overflow-y-auto border border-border rounded-lg p-2">
                  {customers.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 p-1.5 hover:bg-secondary/50 rounded cursor-pointer">
                      <Checkbox checked={selectedCustomerIds.includes(c.id)} onCheckedChange={() => toggleCustomer(c.id)} />
                      <span className="text-xs">{c.name || c.phone}</span>
                      <span className="text-[10px] text-muted-foreground mr-auto" dir="ltr">{c.phone}</span>
                    </label>
                  ))}
                  {customers.length === 0 && <p className="text-[10px] text-muted-foreground text-center py-3">لا يوجد عملاء</p>}
                </div>
              )}

              {/* Upload */}
              {form.audienceType === "upload" && (
                <div className="space-y-2">
                  <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                    <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground mb-2">ارفع ملف CSV/Excel يحتوي على الأرقام</p>
                    <p className="text-[10px] text-muted-foreground mb-3">يجب أن يحتوي عمود "phone" أو "رقم" — أعمدة إضافية تُستخدم كمتغيرات للقالب</p>
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => fileRef.current?.click()}>
                      <Upload className="w-3 h-3 ml-1" /> اختر ملف
                    </Button>
                    <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={handleFileUpload} />
                  </div>
                  {uploadedRecipients.length > 0 && (
                    <div className="bg-success/5 rounded-lg p-3 flex items-center justify-between">
                      <span className="text-xs text-success font-medium">✅ تم تحميل {uploadedRecipients.length} رقم</span>
                      {form.variableColumns.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">متغيرات: {form.variableColumns.join("، ")}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Exclusions */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold flex items-center gap-1"><Ban className="w-3 h-3" /> استثناءات (اختياري)</Label>
              <div className="space-y-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">استثناء حسب التصنيف:</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {tagDefs.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => toggleTag(t.name, "excludeTags")}
                        className={cn("text-[10px] px-2.5 py-1 rounded-full border transition-colors", form.excludeTags.includes(t.name) ? "bg-destructive/10 text-destructive border-destructive" : "bg-secondary border-border")}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">استثناء من أُرسل لهم في حملة سابقة:</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {campaigns.filter((c) => c.status === "sent").map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setForm((f) => ({ ...f, excludeCampaignIds: f.excludeCampaignIds.includes(c.id) ? f.excludeCampaignIds.filter((x) => x !== c.id) : [...f.excludeCampaignIds, c.id] }))}
                        className={cn("text-[10px] px-2.5 py-1 rounded-full border transition-colors", form.excludeCampaignIds.includes(c.id) ? "bg-destructive/10 text-destructive border-destructive" : "bg-secondary border-border")}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Schedule */}
            <div className="space-y-1.5">
              <Label className="text-xs">جدولة الإرسال (اختياري)</Label>
              <Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} className="text-sm bg-secondary border-0" dir="ltr" />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">ملاحظات</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="ملاحظات داخلية..." className="text-sm bg-secondary border-0 min-h-[50px]" />
            </div>

            {/* Summary & Submit */}
            <div className="bg-secondary/50 rounded-lg p-3 flex items-center justify-between">
              <span className="text-xs font-medium">عدد المستلمين: <strong className="text-primary">{getAudienceCount().toLocaleString()}</strong></span>
              {form.excludeTags.length > 0 && <span className="text-[10px] text-muted-foreground">بعد الاستثناءات</span>}
            </div>

            <Button onClick={handleCreate} className="w-full gradient-whatsapp text-whatsapp-foreground gap-1">
              {form.scheduledAt ? <><CalendarDays className="w-4 h-4" /> جدولة الحملة</> : <><FileText className="w-4 h-4" /> حفظ كمسودة</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Campaign Detail Dialog */}
      <Dialog open={!!detailCampaign} onOpenChange={() => setDetailCampaign(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" dir="rtl">
          {detailCampaign && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span>تفاصيل: {detailCampaign.name}</span>
                  <Button size="sm" variant="outline" className="text-xs gap-1" onClick={exportReport}>
                    <Download className="w-3 h-3" /> تصدير التقرير
                  </Button>
                </DialogTitle>
              </DialogHeader>

              {/* Summary Stats */}
              <div className="grid grid-cols-5 gap-3 mt-3">
                <div className="bg-secondary rounded-lg p-3 text-center">
                  <p className="text-lg font-bold">{detailCampaign.total_recipients || 0}</p>
                  <p className="text-[10px] text-muted-foreground">الإجمالي</p>
                </div>
                <div className="bg-info/5 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-info">{detailCampaign.sent_count || 0}</p>
                  <p className="text-[10px] text-muted-foreground">مُرسلة</p>
                </div>
                <div className="bg-success/5 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-success">{detailCampaign.delivered_count || 0}</p>
                  <p className="text-[10px] text-muted-foreground">تم التوصيل</p>
                </div>
                <div className="bg-primary/5 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-primary">{detailCampaign.read_count || 0}</p>
                  <p className="text-[10px] text-muted-foreground">تمت القراءة</p>
                </div>
                <div className="bg-destructive/5 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-destructive">{detailCampaign.failed_count || 0}</p>
                  <p className="text-[10px] text-muted-foreground">فشل</p>
                </div>
              </div>

              {/* Campaign Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mt-3">
                <div><span className="text-muted-foreground">القالب:</span> <span className="font-medium mr-1">{detailCampaign.template_name || "-"}</span></div>
                <div><span className="text-muted-foreground">نوع الجمهور:</span> <span className="font-medium mr-1">
                  {detailCampaign.audience_type === "all" ? "الكل" : detailCampaign.audience_type === "tags" ? "تصنيفات" : detailCampaign.audience_type === "upload" ? "إكسل" : "يدوي"}
                </span></div>
                {detailCampaign.audience_tags?.length > 0 && (
                  <div><span className="text-muted-foreground">التصنيفات:</span> <span className="font-medium mr-1">{detailCampaign.audience_tags.join("، ")}</span></div>
                )}
                {detailCampaign.exclude_tags?.length > 0 && (
                  <div><span className="text-muted-foreground">الاستثناءات:</span> <span className="font-medium mr-1 text-destructive">{detailCampaign.exclude_tags.join("، ")}</span></div>
                )}
              </div>

              {/* Recipients Table */}
              <div className="mt-4 border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50 text-muted-foreground text-[11px]">
                      <th className="text-right p-2.5">الرقم</th>
                      <th className="text-right p-2.5">الاسم</th>
                      <th className="text-right p-2.5">الحالة</th>
                      <th className="text-right p-2.5 hidden md:table-cell">وقت الإرسال</th>
                      <th className="text-right p-2.5 hidden md:table-cell">وقت التوصيل</th>
                      <th className="text-right p-2.5 hidden lg:table-cell">الخطأ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipients.map((r) => (
                      <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/20">
                        <td className="p-2.5 font-mono text-xs" dir="ltr">{r.phone}</td>
                        <td className="p-2.5 text-xs">{r.customer_name || "-"}</td>
                        <td className="p-2.5">{recipientStatusBadge(r.status)}</td>
                        <td className="p-2.5 text-[10px] text-muted-foreground hidden md:table-cell">{r.sent_at ? new Date(r.sent_at).toLocaleString("ar-SA") : "-"}</td>
                        <td className="p-2.5 text-[10px] text-muted-foreground hidden md:table-cell">{r.delivered_at ? new Date(r.delivered_at).toLocaleString("ar-SA") : "-"}</td>
                        <td className="p-2.5 text-[10px] text-destructive hidden lg:table-cell">
                          {r.error_code && <span className="font-mono">{r.error_code}: </span>}
                          {r.error_message || "-"}
                        </td>
                      </tr>
                    ))}
                    {recipients.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-6 text-muted-foreground text-xs">لا يوجد مستلمين</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {recipients.length >= 500 && (
                <p className="text-[10px] text-muted-foreground text-center">يتم عرض أول 500 مستلم — صدّر التقرير للقائمة الكاملة</p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CampaignsPage;
