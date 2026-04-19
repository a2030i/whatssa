import { useState, useEffect } from "react";
import { Webhook, Plus, Trash2, Copy, CheckCircle2, XCircle, ExternalLink, RefreshCw, ScrollText, AlertTriangle, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase";
import { invokeCloud } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ui/confirm-dialog";

interface OrgWebhook {
  id: string;
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
  failure_count: number;
  last_triggered_at: string | null;
  created_at: string;
}

interface WebhookLog {
  id: string;
  event: string;
  url: string;
  status_code: number | null;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

const AVAILABLE_EVENTS = [
  { key: "message.received", label: "رسالة واردة" },
  { key: "message.sent", label: "رسالة صادرة" },
  { key: "conversation.created", label: "محادثة جديدة" },
  { key: "conversation.closed", label: "إغلاق محادثة" },
  { key: "conversation.assigned", label: "إسناد محادثة" },
  { key: "customer.created", label: "عميل جديد" },
  { key: "order.created", label: "طلب جديد" },
  { key: "order.updated", label: "تحديث طلب" },
  { key: "campaign.completed", label: "اكتمال حملة" },
  { key: "shipment.updated", label: "تحديث شحنة" },
];

const OutgoingWebhooksSection = () => {
  const { orgId } = useAuth();
  const [webhooks, setWebhooks] = useState<OrgWebhook[]>([]);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("webhooks");

  useEffect(() => {
    if (orgId) fetchWebhooks();
  }, [orgId]);

  const fetchWebhooks = async () => {
    setLoading(true);
    const [whRes, logRes] = await Promise.all([
      supabase.from("org_webhooks").select("*").eq("org_id", orgId!).order("created_at"),
      supabase.from("webhook_logs").select("*").eq("org_id", orgId!).order("created_at", { ascending: false }).limit(50),
    ]);
    setWebhooks((whRes.data as any[]) || []);
    setLogs((logRes.data as any[]) || []);
    setLoading(false);
  };

  const addWebhook = async () => {
    if (!newUrl.trim()) { toast.error("أدخل رابط الويب هوك"); return; }
    setSaving(true);
    const { error } = await supabase.from("org_webhooks").insert({
      org_id: orgId!,
      url: newUrl.trim(),
      events: newEvents.length > 0 ? newEvents : ["*"],
    });
    if (error) {
      toast.error("فشل الإضافة");
    } else {
      toast.success("تم إضافة الويب هوك");
      setShowAdd(false);
      setNewUrl("");
      setNewEvents([]);
      fetchWebhooks();
    }
    setSaving(false);
  };

  const toggleWebhook = async (id: string, active: boolean) => {
    await supabase.from("org_webhooks").update({ is_active: active }).eq("id", id);
    fetchWebhooks();
  };

  const deleteWebhook = (id: string) => { setDeleteConfirmId(id); };

  const confirmDelete = async () => {
    if (!deleteConfirmId) return;
    setDeleteConfirmId(null);
    await supabase.from("org_webhooks").delete().eq("id", deleteConfirmId);
    toast.success("تم الحذف");
    fetchWebhooks();
  };

  const [testingId, setTestingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const copySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
    toast.success("تم نسخ الـ Secret");
  };

  const testWebhook = async (wh: OrgWebhook) => {
    setTestingId(wh.id);
    try {
      const testPayload = {
        event: "test",
        timestamp: new Date().toISOString(),
        org_id: orgId,
        data: {
          message: "هذا اختبار من منصة whatssa",
          webhook_id: wh.id,
        },
      };
      const response = await fetch(wh.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Whatssa-Event": "test", "X-Whatssa-Signature": "test" },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) {
        toast.success(`✅ استجاب الـ Webhook بنجاح (${response.status})`);
      } else {
        toast.error(`⚠️ الـ Webhook أعاد كود ${response.status}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "خطأ في الاتصال";
      toast.error(`فشل الاتصال: ${msg}`);
    } finally {
      setTestingId(null);
      fetchWebhooks();
    }
  };

  const toggleEvent = (event: string) => {
    setNewEvents(prev =>
      prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event]
    );
  };

  const getTimeAgo = (date: string | null) => {
    if (!date) return "لم يُستخدم";
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "الآن";
    if (mins < 60) return `منذ ${mins} د`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `منذ ${hours} س`;
    return `منذ ${Math.floor(hours / 24)} يوم`;
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Webhook className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">الويب هوك الصادر</h3>
          </div>
          <div className="flex items-center gap-2">
            <TabsList className="h-8">
              <TabsTrigger value="webhooks" className="text-xs h-7 px-3">الويب هوك</TabsTrigger>
              <TabsTrigger value="logs" className="text-xs h-7 px-3">السجل</TabsTrigger>
            </TabsList>
            <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1 text-xs">
              <Plus className="w-3.5 h-3.5" /> إضافة
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          أرسل أحداث المنصة (رسائل، طلبات، محادثات) لأنظمتك الخارجية تلقائياً
        </p>

        <TabsContent value="webhooks" className="mt-3 space-y-3">
          {loading ? (
            <div className="text-sm text-muted-foreground text-center py-6">جاري التحميل...</div>
          ) : webhooks.length === 0 ? (
            <div className="bg-secondary/50 rounded-lg p-6 text-center">
              <Webhook className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">لم تضف أي ويب هوك صادر بعد</p>
            </div>
          ) : (
            webhooks.map(wh => (
              <div key={wh.id} className="bg-card border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <Webhook className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-mono truncate" dir="ltr">{wh.url}</p>
                      <span className="text-[10px] text-muted-foreground">{getTimeAgo(wh.last_triggered_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {wh.failure_count > 0 && (
                      <Badge variant="destructive" className="text-[9px] gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" /> {wh.failure_count} فشل
                      </Badge>
                    )}
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-primary"
                      title="إرسال طلب اختبار"
                      disabled={testingId === wh.id}
                      onClick={() => testWebhook(wh)}
                    >
                      {testingId === wh.id
                        ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        : <PlayCircle className="w-3.5 h-3.5" />}
                    </Button>
                    <Switch checked={wh.is_active} onCheckedChange={(v) => toggleWebhook(wh.id, v)} />
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteWebhook(wh.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="bg-secondary/50 rounded-md p-2.5">
                  <Label className="text-[10px] text-muted-foreground">Secret</Label>
                  <div className="flex gap-2 mt-1">
                    <Input readOnly value={wh.secret} className="text-[10px] font-mono h-7 bg-card" dir="ltr" />
                    <Button size="sm" variant="outline" className="h-7 shrink-0" onClick={() => copySecret(wh.secret)}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {(wh.events.includes("*") ? [{ key: "*", label: "جميع الأحداث" }] : 
                    wh.events.map(e => ({ key: e, label: AVAILABLE_EVENTS.find(ae => ae.key === e)?.label || e }))
                  ).map(evt => (
                    <span key={evt.key} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {evt.label}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="logs" className="mt-3 space-y-2">
          {logs.length === 0 ? (
            <div className="bg-secondary/50 rounded-lg p-6 text-center">
              <ScrollText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">لا توجد سجلات بعد</p>
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto space-y-1.5">
              {logs.map(log => (
                <div key={log.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-secondary/30 border-b border-border/30">
                  <div className="flex items-center gap-2 min-w-0">
                    {log.status_code && log.status_code < 300 ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium">{AVAILABLE_EVENTS.find(e => e.key === log.event)?.label || log.event}</p>
                      <p className="text-[10px] text-muted-foreground font-mono truncate" dir="ltr">{log.url}</p>
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <p className="text-[10px] text-muted-foreground">
                      {log.status_code || "—"} • {log.duration_ms || 0}ms
                    </p>
                    <p className="text-[9px] text-muted-foreground">{getTimeAgo(log.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={!!deleteConfirmId}
        title="حذف الويب هوك؟"
        description="لن تصل الأحداث لهذا العنوان بعد الحذف."
        confirmLabel="حذف"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirmId(null)}
      />

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base">إضافة ويب هوك صادر</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">رابط الويب هوك (URL)</Label>
              <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://your-server.com/webhook" className="mt-1 text-sm font-mono" dir="ltr" />
            </div>
            <div>
              <Label className="text-xs mb-2 block">الأحداث المشترك فيها</Label>
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_EVENTS.map(evt => (
                  <label key={evt.key} className="flex items-center gap-2 text-xs cursor-pointer p-1.5 rounded hover:bg-secondary/50">
                    <Checkbox
                      checked={newEvents.includes(evt.key)}
                      onCheckedChange={() => toggleEvent(evt.key)}
                    />
                    {evt.label}
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">اتركها فارغة لاستقبال جميع الأحداث</p>
            </div>
            <Button onClick={addWebhook} disabled={saving} className="w-full">
              {saving ? "جاري الإضافة..." : "إضافة الويب هوك"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OutgoingWebhooksSection;

