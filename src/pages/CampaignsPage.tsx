import { useState } from "react";
import { Plus, Megaphone, Send, Clock, FileText, AlertCircle, Search, Users, Target, CalendarDays } from "lucide-react";
import { campaigns as initialCampaigns, messageTemplates } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const statusConfig: Record<string, { label: string; icon: any; className: string }> = {
  draft: { label: "مسودة", icon: FileText, className: "bg-muted text-muted-foreground" },
  scheduled: { label: "مجدولة", icon: Clock, className: "bg-info/10 text-info" },
  sent: { label: "تم الإرسال", icon: Send, className: "bg-success/10 text-success" },
  failed: { label: "فشل", icon: AlertCircle, className: "bg-destructive/10 text-destructive" },
};

const CampaignsPage = () => {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [showCreate, setShowCreate] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [newCampaign, setNewCampaign] = useState({
    name: "", templateId: "", audience: "all", scheduledAt: "", notes: "",
  });

  const approvedTemplates = messageTemplates.filter((t) => t.status === "approved");

  const filtered = campaigns.filter((c) => {
    if (searchQuery && !c.name.includes(searchQuery)) return false;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    return true;
  });

  const handleCreate = () => {
    if (!newCampaign.name) { toast.error("يرجى كتابة اسم الحملة"); return; }
    const c = {
      id: `c${Date.now()}`,
      name: newCampaign.name,
      status: newCampaign.scheduledAt ? "scheduled" as const : "draft" as const,
      audience: newCampaign.audience === "all" ? 12000 : newCampaign.audience === "new" ? 3200 : 5400,
      sent: 0, delivered: 0, failed: 0,
      scheduledAt: newCampaign.scheduledAt || undefined,
    };
    setCampaigns((prev) => [c, ...prev]);
    setShowCreate(false);
    setNewCampaign({ name: "", templateId: "", audience: "all", scheduledAt: "", notes: "" });
    toast.success(c.status === "scheduled" ? "تم جدولة الحملة بنجاح" : "تم حفظ الحملة كمسودة");
  };

  const totalSent = campaigns.reduce((s, c) => s + c.sent, 0);
  const totalDelivered = campaigns.reduce((s, c) => s + c.delivered, 0);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1000px]" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">الحملات</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة حملات WhatsApp وتتبع نتائجها</p>
        </div>
        <Button className="gap-2 gradient-whatsapp text-whatsapp-foreground" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" />
          حملة جديدة
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-lg p-4 shadow-card text-center">
          <p className="text-2xl font-bold">{campaigns.length}</p>
          <p className="text-xs text-muted-foreground">إجمالي الحملات</p>
        </div>
        <div className="bg-card rounded-lg p-4 shadow-card text-center">
          <p className="text-2xl font-bold text-success">{campaigns.filter(c => c.status === "sent").length}</p>
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
            <SelectItem value="sent">تم الإرسال</SelectItem>
            <SelectItem value="failed">فشل</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Campaigns List */}
      <div className="space-y-3">
        {filtered.map((campaign) => {
          const status = statusConfig[campaign.status];
          const deliveryRate = campaign.sent > 0 ? Math.round((campaign.delivered / campaign.sent) * 100) : 0;

          return (
            <div key={campaign.id} className="bg-card rounded-lg p-5 shadow-card hover:shadow-card-hover transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <Megaphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{campaign.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {campaign.sentAt ? `أُرسلت: ${campaign.sentAt}` : campaign.scheduledAt ? `مجدولة: ${campaign.scheduledAt}` : "لم تُجدول بعد"}
                    </p>
                  </div>
                </div>
                <Badge className={cn("border-0 text-xs", status.className)}>
                  <status.icon className="w-3 h-3 ml-1" />
                  {status.label}
                </Badge>
              </div>

              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-lg font-bold">{campaign.audience.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">الجمهور</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{campaign.sent.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">مُرسلة</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{campaign.delivered.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">تم التوصيل</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-destructive">{campaign.failed.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">فشل</p>
                </div>
              </div>

              {campaign.sent > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                    <span>معدل التوصيل</span>
                    <span>{deliveryRate}%</span>
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
            <p className="text-sm">لا توجد حملات مطابقة</p>
          </div>
        )}
      </div>

      {/* Create Campaign Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>إنشاء حملة جديدة</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">اسم الحملة *</Label>
              <Input value={newCampaign.name} onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })} placeholder="مثال: عروض الصيف" className="text-sm bg-secondary border-0" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">القالب</Label>
              <Select value={newCampaign.templateId} onValueChange={(v) => setNewCampaign({ ...newCampaign, templateId: v })}>
                <SelectTrigger className="text-sm bg-secondary border-0"><SelectValue placeholder="اختر قالباً معتمداً" /></SelectTrigger>
                <SelectContent>
                  {approvedTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">الجمهور المستهدف</Label>
              <Select value={newCampaign.audience} onValueChange={(v) => setNewCampaign({ ...newCampaign, audience: v })}>
                <SelectTrigger className="text-sm bg-secondary border-0">
                  <Target className="w-3 h-3 ml-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع العملاء (12,000)</SelectItem>
                  <SelectItem value="new">عملاء جدد (3,200)</SelectItem>
                  <SelectItem value="active">عملاء نشطون (5,400)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">جدولة الإرسال (اختياري)</Label>
              <Input type="datetime-local" value={newCampaign.scheduledAt} onChange={(e) => setNewCampaign({ ...newCampaign, scheduledAt: e.target.value })} className="text-sm bg-secondary border-0" dir="ltr" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">ملاحظات</Label>
              <Textarea value={newCampaign.notes} onChange={(e) => setNewCampaign({ ...newCampaign, notes: e.target.value })} placeholder="ملاحظات داخلية عن الحملة..." className="text-sm bg-secondary border-0 min-h-[60px]" />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCreate} className="flex-1 gradient-whatsapp text-whatsapp-foreground gap-1">
                {newCampaign.scheduledAt ? <><CalendarDays className="w-4 h-4" /> جدولة الحملة</> : <><FileText className="w-4 h-4" /> حفظ كمسودة</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CampaignsPage;