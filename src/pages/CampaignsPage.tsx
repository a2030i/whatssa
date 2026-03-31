import { useState, useEffect, useRef, useMemo } from "react";
import { Plus, Megaphone, Send, Clock, FileText, AlertCircle, Search, Target, CalendarDays, Upload, X, Eye, Users, Check, Ban, MessageSquare, BarChart3, ArrowRight, Download, ShoppingCart, TrendingUp, Mail, MailOpen, Reply, XCircle, GitCompareArrows, ChevronDown, ChevronUp, AlertTriangle, Shield, Repeat, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

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
  const { orgId, isEcommerce, hasMetaApi } = useAuth();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [tagDefs, setTagDefs] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [whatsappChannels, setWhatsappChannels] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [detailCampaign, setDetailCampaign] = useState<any>(null);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Create form
  const [form, setForm] = useState({
    name: "", templateName: "", templateLang: "ar", scheduledAt: "", notes: "",
    audienceType: "all" as string,
    audienceTags: [] as string[],
    excludeTags: [] as string[],
    excludeCampaignIds: [] as string[],
    variableColumns: [] as string[],
    channelId: "" as string,
    messageText: "" as string,
    delaySeconds: 10 as number,
    recurringType: "" as string,
    recurringEndAt: "" as string,
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
    const [c, cust, tags, channels] = await Promise.all([
      supabase.from("campaigns").select("*").eq("org_id", orgId!).order("created_at", { ascending: false }),
      supabase.from("customers").select("*").eq("org_id", orgId!),
      supabase.from("customer_tag_definitions").select("*").eq("org_id", orgId!),
      supabase.from("whatsapp_config_safe").select("*").eq("org_id", orgId!).eq("is_connected", true),
    ]);
    setCampaigns(c.data || []);
    setCustomers(cust.data || []);
    setTagDefs(tags.data || []);
    setWhatsappChannels(channels.data || []);
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

  const selectedChannel = whatsappChannels.find((c) => c.id === form.channelId);
  const isEvolutionChannel = selectedChannel?.channel_type === "evolution";

  const getChannelLabel = (ch: any) => {
    if (ch.channel_type === "evolution") {
      return ch.evolution_instance_name ? `واتساب ويب — ${ch.evolution_instance_name}` : `واتساب ويب — ${ch.display_phone || "غير مسمى"}`;
    }
    return ch.display_phone ? `واتساب رسمي — ${ch.display_phone}` : `واتساب رسمي — ${ch.business_name || ch.phone_number_id}`;
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error("يرجى كتابة اسم الحملة"); return; }
    if (!form.channelId) { toast.error("يرجى اختيار قناة الإرسال"); return; }
    if (isEvolutionChannel && !form.messageText.trim()) { toast.error("يرجى كتابة نص الرسالة"); return; }
    if (!isEvolutionChannel && !form.templateName.trim()) { toast.error("يرجى تحديد اسم القالب"); return; }
    const recipientList = buildRecipientList();
    if (recipientList.length === 0) { toast.error("لا يوجد مستلمين — اختر جمهوراً"); return; }

    const { data: campaign, error } = await supabase.from("campaigns").insert({
      org_id: orgId,
      name: form.name,
      template_name: isEvolutionChannel ? null : (form.templateName || null),
      template_language: form.templateLang,
      template_variables: isEvolutionChannel ? [{ message_text: form.messageText, delay_seconds: form.delaySeconds, channel_type: "evolution", channel_id: form.channelId }] : templateVars,
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
    setForm({ name: "", templateName: "", templateLang: "ar", scheduledAt: "", notes: "", audienceType: "all", audienceTags: [], excludeTags: [], excludeCampaignIds: [], variableColumns: [], channelId: "", messageText: "", delaySeconds: 10, filterProduct: "", filterCity: "", filterDateFrom: "", filterDateTo: "", filterMinAmount: "", filterMaxAmount: "" });
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
    <div className="p-3 md:p-6 space-y-6 max-w-[1000px]" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">الحملات</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة حملات WhatsApp وتتبع نتائجها</p>
        </div>
        <div className="flex items-center gap-2">
          {compareMode ? (
            <>
              <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => { setCompareMode(false); setCompareIds([]); }}>
                <X className="w-3 h-3" /> إلغاء
              </Button>
              <Button size="sm" className="gap-2 text-xs" disabled={compareIds.length !== 2} onClick={() => setShowCompare(true)}>
                <GitCompareArrows className="w-3 h-3" /> مقارنة ({compareIds.length}/2)
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="gap-2 text-xs" onClick={() => setCompareMode(true)}>
                <GitCompareArrows className="w-4 h-4" /> مقارنة
              </Button>
              <Button className="gap-2 gradient-whatsapp text-whatsapp-foreground" onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4" /> حملة جديدة
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Analytics Dashboard */}
      {(() => {
        const totalRead = campaigns.reduce((s, c) => s + (c.read_count || 0), 0);
        const totalFailed = campaigns.reduce((s, c) => s + (c.failed_count || 0), 0);
        const totalRecipients = campaigns.reduce((s, c) => s + (c.total_recipients || 0), 0);
        const deliveryRate = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0;
        const readRate = totalDelivered > 0 ? Math.round((totalRead / totalDelivered) * 100) : 0;
        const failRate = totalRecipients > 0 ? Math.round((totalFailed / totalRecipients) * 100) : 0;

        // Build monthly time series from campaigns
        const monthlyMap: Record<string, { month: string; sent: number; delivered: number; read: number; failed: number; campaigns: number }> = {};
        campaigns.forEach((c) => {
          const d = c.sent_at || c.created_at;
          if (!d) return;
          const key = d.slice(0, 7); // YYYY-MM
          if (!monthlyMap[key]) monthlyMap[key] = { month: key, sent: 0, delivered: 0, read: 0, failed: 0, campaigns: 0 };
          monthlyMap[key].sent += c.sent_count || 0;
          monthlyMap[key].delivered += c.delivered_count || 0;
          monthlyMap[key].read += c.read_count || 0;
          monthlyMap[key].failed += c.failed_count || 0;
          monthlyMap[key].campaigns += 1;
        });
        const timeData = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({
          ...m,
          label: new Date(m.month + "-01").toLocaleDateString("ar-SA", { month: "short", year: "2-digit" }),
        }));

        // Pie data for status distribution
        const statusDist = [
          { name: "مسودة", value: campaigns.filter((c) => c.status === "draft").length, color: "hsl(var(--muted-foreground))" },
          { name: "مجدولة", value: campaigns.filter((c) => c.status === "scheduled").length, color: "hsl(var(--info))" },
          { name: "تم الإرسال", value: campaigns.filter((c) => c.status === "sent").length, color: "hsl(var(--success))" },
          { name: "جاري الإرسال", value: campaigns.filter((c) => c.status === "sending").length, color: "hsl(var(--warning))" },
          { name: "فشل", value: campaigns.filter((c) => c.status === "failed").length, color: "hsl(var(--destructive))" },
        ].filter((d) => d.value > 0);

        return (
          <div className="space-y-4">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              {[
                { label: "إجمالي الحملات", value: campaigns.length, color: "" },
                { label: "تم إرسالها", value: campaigns.filter((c) => c.status === "sent").length, color: "text-success" },
                { label: "رسائل مرسلة", value: totalSent.toLocaleString(), color: "text-info" },
                { label: "معدل التوصيل", value: `${deliveryRate}%`, color: "text-primary" },
                { label: "معدل القراءة", value: `${readRate}%`, color: "text-primary" },
                { label: "معدل الفشل", value: `${failRate}%`, color: "text-destructive" },
              ].map((kpi) => (
                <div key={kpi.label} className="bg-card rounded-lg p-3 shadow-card text-center">
                  <p className={cn("text-xl font-bold", kpi.color)}>{kpi.value}</p>
                  <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                </div>
              ))}
            </div>

            {/* Charts Row */}
            {timeData.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Line Chart - Performance Over Time */}
                <div className="lg:col-span-2 bg-card rounded-xl shadow-card p-4">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" /> أداء الحملات عبر الزمن
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={timeData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ fontWeight: 600 }}
                      />
                      <Line type="monotone" dataKey="sent" stroke="hsl(var(--info))" strokeWidth={2} name="مُرسلة" dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="delivered" stroke="hsl(var(--success))" strokeWidth={2} name="تم التوصيل" dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="read" stroke="hsl(var(--primary))" strokeWidth={2} name="تمت القراءة" dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="failed" stroke="hsl(var(--destructive))" strokeWidth={2} name="فشل" dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Pie Chart - Status Distribution */}
                <div className="bg-card rounded-xl shadow-card p-4">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" /> توزيع الحالات
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={statusDist} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3}>
                        {statusDist.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Bar Chart - Campaigns per Month */}
            {timeData.length > 1 && (
              <div className="bg-card rounded-xl shadow-card p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-primary" /> عدد الحملات والرسائل شهرياً
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={timeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="sent" fill="hsl(var(--info))" name="مُرسلة" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="delivered" fill="hsl(var(--success))" name="تم التوصيل" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="read" fill="hsl(var(--primary))" name="تمت القراءة" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        );
      })()}

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
            <div
              key={campaign.id}
              className={cn(
                "bg-card rounded-lg p-5 shadow-card hover:shadow-card-hover transition-shadow cursor-pointer",
                compareMode && compareIds.includes(campaign.id) && "ring-2 ring-primary"
              )}
              onClick={() => {
                if (compareMode) {
                  setCompareIds((prev) =>
                    prev.includes(campaign.id) ? prev.filter((x) => x !== campaign.id) : prev.length < 2 ? [...prev, campaign.id] : prev
                  );
                } else {
                  openDetail(campaign);
                }
              }}
            >
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

            {/* Channel Selection */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">قناة الإرسال *</Label>
              {whatsappChannels.length === 0 ? (
                <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  لا توجد قنوات واتساب مربوطة — اذهب لصفحة الربط والتكامل أولاً
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {whatsappChannels.map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => setForm({ ...form, channelId: ch.id })}
                      className={cn(
                        "p-3 rounded-lg border text-xs text-right transition-all",
                        form.channelId === ch.id ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {ch.channel_type === "evolution" ? (
                          <MessageSquare className="w-4 h-4 shrink-0" />
                        ) : (
                          <Shield className="w-4 h-4 shrink-0" />
                        )}
                        <span className="font-medium">{getChannelLabel(ch)}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {ch.channel_type === "evolution" ? "رسائل نصية مباشرة" : "قوالب Meta معتمدة"}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Evolution Warning */}
            {isEvolutionChannel && (
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 space-y-2">
                <div className="flex items-start gap-2 text-warning">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-semibold">تحذير — قناة غير رسمية</p>
                    <p className="text-muted-foreground">إرسال عدد كبير من الرسائل بسرعة قد يؤدي لحظر الرقم. استخدم تأخيراً مناسباً بين الرسائل ولا ترسل لأرقام لم تتواصل معك سابقاً.</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">التأخير بين كل رسالة (ثانية) *</Label>
                    <Input
                      type="number"
                      min={5}
                      max={3600}
                      value={form.delaySeconds}
                      onChange={(e) => setForm({ ...form, delaySeconds: Math.max(5, parseInt(e.target.value) || 10) })}
                      className="text-xs bg-background border-0 h-8"
                      dir="ltr"
                    />
                  </div>
                  <div className="flex flex-col justify-end">
                    <p className="text-[10px] text-muted-foreground">
                      الوقت المتوقع: <strong className="text-foreground">{Math.ceil((getAudienceCount() * form.delaySeconds) / 60)} دقيقة</strong>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Message Text (Evolution only) */}
            {isEvolutionChannel && (
              <div className="space-y-1.5">
                <Label className="text-xs">نص الرسالة *</Label>
                <Textarea
                  value={form.messageText}
                  onChange={(e) => setForm({ ...form, messageText: e.target.value })}
                  placeholder="اكتب نص الرسالة هنا... يمكنك استخدام {name} لاسم العميل"
                  className="text-sm bg-secondary border-0 min-h-[80px]"
                />
              </div>
            )}

            {/* Template (Meta API only) */}
            {!isEvolutionChannel && form.channelId && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">اسم القالب (من Meta) *</Label>
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
              </>
            )}

            {/* Template Variables (Meta only) */}
            {!isEvolutionChannel && form.channelId && (
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
            )}

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

              {/* E-commerce Orders Filter */}
              {form.audienceType === "orders" && isEcommerce && (
                <div className="space-y-3 bg-secondary/30 rounded-xl p-4">
                  <p className="text-xs font-semibold flex items-center gap-1.5"><ShoppingCart className="w-3.5 h-3.5 text-primary" /> فلاتر الطلبات المتقدمة</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">المنتج</Label>
                      <Select value={form.filterProduct} onValueChange={(v) => setForm({ ...form, filterProduct: v === "_all" ? "" : v })}>
                        <SelectTrigger className="text-xs bg-background border-0 h-8"><SelectValue placeholder="كل المنتجات" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_all">كل المنتجات</SelectItem>
                          {products.map(p => <SelectItem key={p.id} value={p.name}>{p.name_ar || p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">المدينة</Label>
                      <Select value={form.filterCity} onValueChange={(v) => setForm({ ...form, filterCity: v === "_all" ? "" : v })}>
                        <SelectTrigger className="text-xs bg-background border-0 h-8"><SelectValue placeholder="كل المدن" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_all">كل المدن</SelectItem>
                          {[...new Set(orders.map(o => o.customer_city).filter(Boolean))].map(city => (
                            <SelectItem key={city} value={city}>{city}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">من تاريخ</Label>
                      <Input type="date" value={form.filterDateFrom} onChange={(e) => setForm({ ...form, filterDateFrom: e.target.value })} className="text-xs bg-background border-0 h-8" dir="ltr" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">إلى تاريخ</Label>
                      <Input type="date" value={form.filterDateTo} onChange={(e) => setForm({ ...form, filterDateTo: e.target.value })} className="text-xs bg-background border-0 h-8" dir="ltr" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">الحد الأدنى للمبلغ</Label>
                      <Input type="number" value={form.filterMinAmount} onChange={(e) => setForm({ ...form, filterMinAmount: e.target.value })} placeholder="0" className="text-xs bg-background border-0 h-8" dir="ltr" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">الحد الأقصى للمبلغ</Label>
                      <Input type="number" value={form.filterMaxAmount} onChange={(e) => setForm({ ...form, filterMaxAmount: e.target.value })} placeholder="∞" className="text-xs bg-background border-0 h-8" dir="ltr" />
                    </div>
                  </div>
                  <div className="bg-primary/5 rounded-lg p-2.5 text-xs text-primary font-medium">
                    عملاء مطابقون: {getEcommerceFilteredCustomers().length}
                  </div>
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
            <CampaignDetailContent
              campaign={detailCampaign}
              recipients={recipients}
              recipientStatusBadge={recipientStatusBadge}
              exportReport={exportReport}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Campaign Comparison Dialog */}
      <Dialog open={showCompare} onOpenChange={(v) => { if (!v) { setShowCompare(false); } }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><GitCompareArrows className="w-5 h-5 text-primary" /> مقارنة الحملات</DialogTitle></DialogHeader>
          {(() => {
            const c1 = campaigns.find((c) => c.id === compareIds[0]);
            const c2 = campaigns.find((c) => c.id === compareIds[1]);
            if (!c1 || !c2) return <p className="text-sm text-muted-foreground text-center py-8">اختر حملتين للمقارنة</p>;

            const rate = (num: number, den: number) => den > 0 ? Math.round((num / den) * 100) : 0;
            const c1DeliveryRate = rate(c1.delivered_count || 0, c1.sent_count || 0);
            const c2DeliveryRate = rate(c2.delivered_count || 0, c2.sent_count || 0);
            const c1ReadRate = rate(c1.read_count || 0, c1.delivered_count || 0);
            const c2ReadRate = rate(c2.read_count || 0, c2.delivered_count || 0);
            const c1FailRate = rate(c1.failed_count || 0, c1.total_recipients || 0);
            const c2FailRate = rate(c2.failed_count || 0, c2.total_recipients || 0);

            const rows: { label: string; v1: string | number; v2: string | number; better?: "high" | "low" }[] = [
              { label: "الحالة", v1: statusConfig[c1.status]?.label || c1.status, v2: statusConfig[c2.status]?.label || c2.status },
              { label: "القالب", v1: c1.template_name || "—", v2: c2.template_name || "—" },
              { label: "إجمالي الجمهور", v1: c1.total_recipients || 0, v2: c2.total_recipients || 0, better: "high" },
              { label: "رسائل مُرسلة", v1: c1.sent_count || 0, v2: c2.sent_count || 0, better: "high" },
              { label: "تم التوصيل", v1: c1.delivered_count || 0, v2: c2.delivered_count || 0, better: "high" },
              { label: "تمت القراءة", v1: c1.read_count || 0, v2: c2.read_count || 0, better: "high" },
              { label: "فشل", v1: c1.failed_count || 0, v2: c2.failed_count || 0, better: "low" },
              { label: "معدل التوصيل", v1: `${c1DeliveryRate}%`, v2: `${c2DeliveryRate}%`, better: "high" },
              { label: "معدل القراءة", v1: `${c1ReadRate}%`, v2: `${c2ReadRate}%`, better: "high" },
              { label: "معدل الفشل", v1: `${c1FailRate}%`, v2: `${c2FailRate}%`, better: "low" },
              { label: "تاريخ الإرسال", v1: c1.sent_at ? new Date(c1.sent_at).toLocaleDateString("ar-SA") : "—", v2: c2.sent_at ? new Date(c2.sent_at).toLocaleDateString("ar-SA") : "—" },
            ];

            const getHighlight = (row: typeof rows[0], side: 1 | 2) => {
              if (!row.better) return "";
              const n1 = typeof row.v1 === "string" ? parseFloat(row.v1) : row.v1;
              const n2 = typeof row.v2 === "string" ? parseFloat(row.v2) : row.v2;
              if (isNaN(n1) || isNaN(n2) || n1 === n2) return "";
              const isBetter = row.better === "high" ? (side === 1 ? n1 > n2 : n2 > n1) : (side === 1 ? n1 < n2 : n2 < n1);
              return isBetter ? "text-success font-bold" : "text-muted-foreground";
            };

            return (
              <div className="mt-4 space-y-4">
                {/* Header */}
                <div className="grid grid-cols-3 gap-3">
                  <div />
                  <div className="bg-primary/5 rounded-lg p-3 text-center">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
                      <Megaphone className="w-5 h-5 text-primary" />
                    </div>
                    <p className="font-bold text-sm truncate">{c1.name}</p>
                  </div>
                  <div className="bg-secondary rounded-lg p-3 text-center">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mx-auto mb-2">
                      <Megaphone className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <p className="font-bold text-sm truncate">{c2.name}</p>
                  </div>
                </div>

                {/* Comparison table */}
                <div className="border border-border rounded-xl overflow-hidden">
                  {rows.map((row, i) => (
                    <div key={row.label} className={cn("grid grid-cols-3 gap-3 px-4 py-2.5 text-sm", i % 2 === 0 ? "bg-secondary/30" : "bg-card")}>
                      <p className="text-muted-foreground text-xs font-medium">{row.label}</p>
                      <p className={cn("text-center font-semibold", getHighlight(row, 1))}>{typeof row.v1 === "number" ? row.v1.toLocaleString() : row.v1}</p>
                      <p className={cn("text-center font-semibold", getHighlight(row, 2))}>{typeof row.v2 === "number" ? row.v2.toLocaleString() : row.v2}</p>
                    </div>
                  ))}
                </div>

                {/* Visual bars */}
                <div className="space-y-4">
                  <h3 className="text-xs font-semibold text-muted-foreground">مقارنة بصرية</h3>
                  {[
                    { label: "معدل التوصيل", v1: c1DeliveryRate, v2: c2DeliveryRate },
                    { label: "معدل القراءة", v1: c1ReadRate, v2: c2ReadRate },
                    { label: "معدل الفشل", v1: c1FailRate, v2: c2FailRate },
                  ].map((bar) => (
                    <div key={bar.label} className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">{bar.label}</p>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] w-20 text-left truncate">{c1.name}</span>
                        <div className="flex-1 bg-secondary rounded-full h-3 overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${bar.v1}%` }} />
                        </div>
                        <span className="text-xs font-bold w-10">{bar.v1}%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] w-20 text-left truncate">{c2.name}</span>
                        <div className="flex-1 bg-secondary rounded-full h-3 overflow-hidden">
                          <div className="h-full bg-muted-foreground rounded-full transition-all" style={{ width: `${bar.v2}%` }} />
                        </div>
                        <span className="text-xs font-bold w-10">{bar.v2}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ═══════════════════════════════════════════════
// Campaign Detail with Advanced Analytics
// ═══════════════════════════════════════════════

function CampaignDetailContent({
  campaign,
  recipients,
  recipientStatusBadge,
  exportReport,
}: {
  campaign: any;
  recipients: any[];
  recipientStatusBadge: (status: string) => JSX.Element;
  exportReport: () => void;
}) {
  const total = campaign.total_recipients || 0;
  const sent = campaign.sent_count || 0;
  const delivered = campaign.delivered_count || 0;
  const read = campaign.read_count || 0;
  const failed = campaign.failed_count || 0;

  const deliveryRate = sent > 0 ? ((delivered / sent) * 100) : 0;
  const openRate = delivered > 0 ? ((read / delivered) * 100) : 0;
  const failRate = sent > 0 ? ((failed / sent) * 100) : 0;

  // Count replied recipients (those with status containing 'replied' or messages back)
  const replied = recipients.filter((r) => r.status === "replied").length;
  const replyRate = delivered > 0 ? ((replied / delivered) * 100) : 0;

  // Failure breakdown
  const failureBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    recipients.filter((r) => r.status === "failed").forEach((r) => {
      const reason = r.error_code || r.error_message || "خطأ غير محدد";
      map[reason] = (map[reason] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [recipients]);

  // Funnel data
  const funnelSteps = [
    { label: "الجمهور", value: total, color: "bg-muted-foreground" },
    { label: "مُرسلة", value: sent, color: "bg-info" },
    { label: "تم التوصيل", value: delivered, color: "bg-success" },
    { label: "تمت القراءة", value: read, color: "bg-primary" },
  ];
  const maxFunnel = Math.max(total, 1);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center justify-between">
          <span>تفاصيل: {campaign.name}</span>
          <Button size="sm" variant="outline" className="text-xs gap-1" onClick={exportReport}>
            <Download className="w-3 h-3" /> تصدير التقرير
          </Button>
        </DialogTitle>
      </DialogHeader>

      <Tabs defaultValue="analytics" className="mt-2">
        <TabsList className="w-full grid grid-cols-3 h-9">
          <TabsTrigger value="analytics" className="text-xs gap-1"><BarChart3 className="w-3 h-3" /> التحليلات</TabsTrigger>
          <TabsTrigger value="recipients" className="text-xs gap-1"><Users className="w-3 h-3" /> المستلمون</TabsTrigger>
          <TabsTrigger value="info" className="text-xs gap-1"><FileText className="w-3 h-3" /> معلومات</TabsTrigger>
        </TabsList>

        {/* ── Analytics Tab ── */}
        <TabsContent value="analytics" className="space-y-4 mt-3">

          {/* Rate Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-card border border-border rounded-xl p-3 text-center">
              <div className="w-8 h-8 rounded-lg bg-info/10 flex items-center justify-center mx-auto mb-2">
                <Send className="w-4 h-4 text-info" />
              </div>
              <p className="text-xl font-bold text-info">{deliveryRate.toFixed(1)}%</p>
              <p className="text-[10px] text-muted-foreground">معدل التوصيل</p>
              <p className="text-[9px] text-muted-foreground mt-0.5">{delivered.toLocaleString()} / {sent.toLocaleString()}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-3 text-center">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <MailOpen className="w-4 h-4 text-primary" />
              </div>
              <p className="text-xl font-bold text-primary">{openRate.toFixed(1)}%</p>
              <p className="text-[10px] text-muted-foreground">معدل الفتح</p>
              <p className="text-[9px] text-muted-foreground mt-0.5">{read.toLocaleString()} / {delivered.toLocaleString()}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-3 text-center">
              <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center mx-auto mb-2">
                <Reply className="w-4 h-4 text-success" />
              </div>
              <p className="text-xl font-bold text-success">{replyRate.toFixed(1)}%</p>
              <p className="text-[10px] text-muted-foreground">معدل الرد</p>
              <p className="text-[9px] text-muted-foreground mt-0.5">{replied.toLocaleString()} / {delivered.toLocaleString()}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-3 text-center">
              <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center mx-auto mb-2">
                <XCircle className="w-4 h-4 text-destructive" />
              </div>
              <p className="text-xl font-bold text-destructive">{failRate.toFixed(1)}%</p>
              <p className="text-[10px] text-muted-foreground">معدل الفشل</p>
              <p className="text-[9px] text-muted-foreground mt-0.5">{failed.toLocaleString()} / {sent.toLocaleString()}</p>
            </div>
          </div>

          {/* Visual Funnel */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> قمع التحويل
            </h3>
            <div className="space-y-3">
              {funnelSteps.map((step, i) => {
                const pct = (step.value / maxFunnel) * 100;
                const dropoff = i > 0 ? funnelSteps[i - 1].value - step.value : 0;
                const dropoffPct = i > 0 && funnelSteps[i - 1].value > 0 ? ((dropoff / funnelSteps[i - 1].value) * 100) : 0;
                return (
                  <div key={step.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium">{step.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{step.value.toLocaleString()}</span>
                        {i > 0 && dropoff > 0 && (
                          <span className="text-[10px] text-destructive/70">-{dropoff.toLocaleString()} ({dropoffPct.toFixed(0)}%)</span>
                        )}
                      </div>
                    </div>
                    <div className="h-6 bg-secondary rounded-lg overflow-hidden">
                      <div
                        className={cn("h-full rounded-lg transition-all duration-700", step.color)}
                        style={{ width: `${Math.max(pct, 2)}%`, opacity: 0.8 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Failure Breakdown */}
          {failureBreakdown.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-destructive" /> تفصيل أسباب الفشل
              </h3>
              <div className="space-y-2">
                {failureBreakdown.map(([reason, count]) => {
                  const pct = failed > 0 ? ((count / failed) * 100) : 0;
                  return (
                    <div key={reason} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="text-muted-foreground truncate font-mono text-[10px]" dir="ltr">{reason}</span>
                          <span className="text-destructive font-bold shrink-0 mr-2">{count}</span>
                        </div>
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-destructive/60 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0 w-10 text-left">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Summary Numbers */}
          <div className="grid grid-cols-5 gap-2">
            <div className="bg-secondary rounded-lg p-2.5 text-center">
              <p className="text-base font-bold">{total.toLocaleString()}</p>
              <p className="text-[9px] text-muted-foreground">الإجمالي</p>
            </div>
            <div className="bg-info/5 rounded-lg p-2.5 text-center">
              <p className="text-base font-bold text-info">{sent.toLocaleString()}</p>
              <p className="text-[9px] text-muted-foreground">مُرسلة</p>
            </div>
            <div className="bg-success/5 rounded-lg p-2.5 text-center">
              <p className="text-base font-bold text-success">{delivered.toLocaleString()}</p>
              <p className="text-[9px] text-muted-foreground">وصلت</p>
            </div>
            <div className="bg-primary/5 rounded-lg p-2.5 text-center">
              <p className="text-base font-bold text-primary">{read.toLocaleString()}</p>
              <p className="text-[9px] text-muted-foreground">مقروءة</p>
            </div>
            <div className="bg-destructive/5 rounded-lg p-2.5 text-center">
              <p className="text-base font-bold text-destructive">{failed.toLocaleString()}</p>
              <p className="text-[9px] text-muted-foreground">فشل</p>
            </div>
          </div>
        </TabsContent>

        {/* ── Recipients Tab ── */}
        <TabsContent value="recipients" className="mt-3">
          <div className="border border-border rounded-lg overflow-hidden">
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
            <p className="text-[10px] text-muted-foreground text-center mt-2">يتم عرض أول 500 مستلم — صدّر التقرير للقائمة الكاملة</p>
          )}
        </TabsContent>

        {/* ── Info Tab ── */}
        <TabsContent value="info" className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-secondary rounded-lg p-3">
              <p className="text-muted-foreground text-[10px]">القالب</p>
              <p className="font-semibold mt-0.5">{campaign.template_name || "-"}</p>
            </div>
            <div className="bg-secondary rounded-lg p-3">
              <p className="text-muted-foreground text-[10px]">نوع الجمهور</p>
              <p className="font-semibold mt-0.5">
                {campaign.audience_type === "all" ? "الكل" : campaign.audience_type === "tags" ? "تصنيفات" : campaign.audience_type === "upload" ? "إكسل" : campaign.audience_type === "select" ? "يدوي" : campaign.audience_type === "orders" ? "طلبات" : campaign.audience_type}
              </p>
            </div>
            <div className="bg-secondary rounded-lg p-3">
              <p className="text-muted-foreground text-[10px]">تاريخ الإنشاء</p>
              <p className="font-semibold mt-0.5">{new Date(campaign.created_at).toLocaleString("ar-SA")}</p>
            </div>
            <div className="bg-secondary rounded-lg p-3">
              <p className="text-muted-foreground text-[10px]">تاريخ الإرسال</p>
              <p className="font-semibold mt-0.5">{campaign.sent_at ? new Date(campaign.sent_at).toLocaleString("ar-SA") : "-"}</p>
            </div>
          </div>
          {campaign.audience_tags?.length > 0 && (
            <div className="bg-secondary rounded-lg p-3">
              <p className="text-muted-foreground text-[10px] mb-1">التصنيفات المستهدفة</p>
              <div className="flex flex-wrap gap-1">
                {campaign.audience_tags.map((t: string) => (
                  <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                ))}
              </div>
            </div>
          )}
          {campaign.exclude_tags?.length > 0 && (
            <div className="bg-destructive/5 rounded-lg p-3">
              <p className="text-destructive text-[10px] mb-1">التصنيفات المستثناة</p>
              <div className="flex flex-wrap gap-1">
                {campaign.exclude_tags.map((t: string) => (
                  <Badge key={t} variant="outline" className="text-[10px] border-destructive/30 text-destructive">{t}</Badge>
                ))}
              </div>
            </div>
          )}
          {campaign.notes && (
            <div className="bg-secondary rounded-lg p-3">
              <p className="text-muted-foreground text-[10px]">ملاحظات</p>
              <p className="text-xs mt-0.5">{campaign.notes}</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

export default CampaignsPage;
