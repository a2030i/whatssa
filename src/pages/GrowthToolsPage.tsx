import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  MessageSquare, Link2, Zap, Copy, Plus, Trash2, ExternalLink,
  Eye, BarChart3, MousePointer, Globe, Smartphone, Monitor,
  RefreshCw, Check, Code2, Palette, ArrowRight, Settings, TrendingUp
} from "lucide-react";
import ConfirmDialog from "@/components/ui/confirm-dialog";

/* ═══════════════════════════════════════════════
   WhatsApp Widget Generator Tab
   ═══════════════════════════════════════════════ */
const WidgetTab = ({ orgId }: { orgId: string }) => {
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showCode, setShowCode] = useState<string | null>(null);
  const [deleteWidgetId, setDeleteWidgetId] = useState<string | null>(null);
  const [form, setForm] = useState({
    phone_number: "",
    welcome_message: "مرحباً! كيف يمكننا مساعدتك؟",
    button_color: "#25D366",
    button_position: "bottom-right",
    button_size: "medium",
    show_on_mobile: true,
    delay_seconds: 3,
  });

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("widget_configs").select("*").eq("org_id", orgId).order("created_at");
    setConfigs(data || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const save = async () => {
    if (!form.phone_number.trim()) { toast.error("أدخل رقم الهاتف"); return; }
    const { error } = await supabase.from("widget_configs").insert({ ...form, org_id: orgId });
    if (error) { toast.error("حدث خطأ"); return; }
    toast.success("تم إنشاء الويدجت");
    setShowCreate(false);
    setForm({ phone_number: "", welcome_message: "مرحباً! كيف يمكننا مساعدتك؟", button_color: "#25D366", button_position: "bottom-right", button_size: "medium", show_on_mobile: true, delay_seconds: 3 });
    fetch_();
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from("widget_configs").update({ is_active: active }).eq("id", id);
    fetch_();
  };

  const deleteWidget = async (id: string) => {
    setDeleteWidgetId(id);
  };

  const confirmDeleteWidget = async () => {
    if (!deleteWidgetId) return;
    setDeleteWidgetId(null);
    await supabase.from("widget_configs").delete().eq("id", deleteWidgetId);
    toast.success("تم الحذف");
    fetch_();
  };

  const generateCode = (cfg: any) => {
    const pos = cfg.button_position === "bottom-left" ? "left: 20px" : "right: 20px";
    const size = cfg.button_size === "large" ? "64px" : cfg.button_size === "small" ? "48px" : "56px";
    const msg = encodeURIComponent(cfg.welcome_message || "");
    const phone = cfg.phone_number.replace(/[^0-9]/g, "");
    return `<!-- Respondly WhatsApp Widget -->
<style>
  #respondly-wa-widget {
    position: fixed;
    bottom: 20px;
    ${pos};
    z-index: 9999;
    cursor: pointer;
    width: ${size};
    height: ${size};
    border-radius: 50%;
    background: ${cfg.button_color};
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    transition: transform 0.3s;
    ${!cfg.show_on_mobile ? "@media(max-width:768px){display:none!important}" : ""}
  }
  #respondly-wa-widget:hover { transform: scale(1.1); }
  #respondly-wa-widget svg { width: 60%; height: 60%; fill: white; }
</style>
<div id="respondly-wa-widget" onclick="window.open('https://wa.me/${phone}?text=${msg}','_blank')">
  <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
</div>
<script>
  setTimeout(function(){ document.getElementById('respondly-wa-widget').style.display='flex'; }, ${(cfg.delay_seconds || 0) * 1000});
</script>`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">ويدجت واتساب للمواقع</h3>
          <p className="text-sm text-muted-foreground">أنشئ زر واتساب عائم لموقعك الإلكتروني</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm"><Plus className="w-4 h-4 ml-1" />إنشاء ويدجت</Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
      ) : configs.length === 0 ? (
        <div className="text-center py-12 bg-muted/30 rounded-lg border border-dashed">
          <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">لا يوجد ويدجت حتى الآن</p>
          <Button variant="outline" className="mt-3" onClick={() => setShowCreate(true)}>أنشئ أول ويدجت</Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {configs.map((c) => (
            <div key={c.id} className="border rounded-lg p-4 bg-card space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: c.button_color }}>
                    <MessageSquare className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-medium text-sm">{c.phone_number}</span>
                </div>
                <Switch checked={c.is_active} onCheckedChange={(v) => toggleActive(c.id, v)} />
              </div>
              <p className="text-xs text-muted-foreground truncate">{c.welcome_message}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-xs">{c.button_position === "bottom-left" ? "يسار" : "يمين"}</Badge>
                <Badge variant="outline" className="text-xs">{c.button_size === "large" ? "كبير" : c.button_size === "small" ? "صغير" : "متوسط"}</Badge>
                <span className="flex items-center gap-1"><MousePointer className="w-3 h-3" />{c.click_count || 0} نقرة</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => setShowCode(c.id)}>
                  <Code2 className="w-3 h-3 ml-1" />كود التضمين
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteWidget(c.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              {showCode === c.id && (
                <div className="mt-2 space-y-2">
                  <div className="bg-muted p-3 rounded text-xs font-mono overflow-auto max-h-40 whitespace-pre" dir="ltr">
                    {generateCode(c)}
                  </div>
                  <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => { navigator.clipboard.writeText(generateCode(c)); toast.success("تم النسخ!"); }}>
                    <Copy className="w-3 h-3 ml-1" />نسخ الكود
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>إنشاء ويدجت واتساب</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>رقم الهاتف (مع رمز الدولة)</Label><Input placeholder="966512345678" value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} /></div>
            <div><Label>رسالة الترحيب</Label><Textarea value={form.welcome_message} onChange={(e) => setForm({ ...form, welcome_message: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>لون الزر</Label><div className="flex items-center gap-2"><Input type="color" value={form.button_color} onChange={(e) => setForm({ ...form, button_color: e.target.value })} className="w-10 h-10 p-1" /><Input value={form.button_color} onChange={(e) => setForm({ ...form, button_color: e.target.value })} className="flex-1 text-xs" dir="ltr" /></div></div>
              <div><Label>الموضع</Label><Select value={form.button_position} onValueChange={(v) => setForm({ ...form, button_position: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bottom-right">أسفل يمين</SelectItem><SelectItem value="bottom-left">أسفل يسار</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>الحجم</Label><Select value={form.button_size} onValueChange={(v) => setForm({ ...form, button_size: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="small">صغير</SelectItem><SelectItem value="medium">متوسط</SelectItem><SelectItem value="large">كبير</SelectItem></SelectContent></Select></div>
              <div><Label>تأخير الظهور (ثواني)</Label><Input type="number" min={0} value={form.delay_seconds} onChange={(e) => setForm({ ...form, delay_seconds: +e.target.value })} /></div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.show_on_mobile} onCheckedChange={(v) => setForm({ ...form, show_on_mobile: v })} /><Label>إظهار على الجوال</Label></div>
            <Button className="w-full" onClick={save}>إنشاء الويدجت</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteWidgetId}
        title="حذف الويدجت؟"
        confirmLabel="حذف"
        destructive
        onConfirm={confirmDeleteWidget}
        onCancel={() => setDeleteWidgetId(null)}
      />
    </div>
  );
};

/* ═══════════════════════════════════════════════
   Short Links Tab
   ═══════════════════════════════════════════════ */
const ShortLinksTab = ({ orgId }: { orgId: string }) => {
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showClicks, setShowClicks] = useState<string | null>(null);
  const [clicks, setClicks] = useState<any[]>([]);
  const [deleteLinkId, setDeleteLinkId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", target_phone: "", prefilled_message: "", utm_source: "", utm_medium: "", utm_campaign: "" });

  const baseUrl = window.location.origin;

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("short_links").select("*").eq("org_id", orgId).order("created_at", { ascending: false });
    setLinks(data || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const generateCode = () => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  };

  const save = async () => {
    if (!form.target_phone.trim()) { toast.error("أدخل رقم الهاتف"); return; }
    const short_code = generateCode();
    const { error } = await supabase.from("short_links").insert({ ...form, short_code, org_id: orgId });
    if (error) { toast.error("حدث خطأ"); return; }
    toast.success("تم إنشاء الرابط");
    setShowCreate(false);
    setForm({ title: "", target_phone: "", prefilled_message: "", utm_source: "", utm_medium: "", utm_campaign: "" });
    fetch_();
  };

  const deleteLink = (id: string) => { setDeleteLinkId(id); };

  const confirmDeleteLink = async () => {
    if (!deleteLinkId) return;
    setDeleteLinkId(null);
    await supabase.from("short_links").delete().eq("id", deleteLinkId);
    toast.success("تم الحذف");
    fetch_();
  };

  const viewClicks = async (linkId: string) => {
    setShowClicks(linkId);
    const { data } = await supabase.from("short_link_clicks").select("*").eq("link_id", linkId).order("clicked_at", { ascending: false }).limit(50);
    setClicks(data || []);
  };

  const getWaLink = (link: any) => {
    const phone = link.target_phone.replace(/[^0-9]/g, "");
    const msg = link.prefilled_message ? `?text=${encodeURIComponent(link.prefilled_message)}` : "";
    return `https://wa.me/${phone}${msg}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">الروابط القصيرة</h3>
          <p className="text-sm text-muted-foreground">أنشئ روابط واتساب مخصصة مع تتبع النقرات</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm"><Plus className="w-4 h-4 ml-1" />رابط جديد</Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
      ) : links.length === 0 ? (
        <div className="text-center py-12 bg-muted/30 rounded-lg border border-dashed">
          <Link2 className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">لا توجد روابط قصيرة</p>
          <Button variant="outline" className="mt-3" onClick={() => setShowCreate(true)}>أنشئ أول رابط</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {links.map((l) => (
            <div key={l.id} className="border rounded-lg p-4 bg-card">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-medium text-sm">{l.title || l.short_code}</p>
                  <p className="text-xs text-muted-foreground">{l.target_phone}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold flex items-center gap-1"><MousePointer className="w-3.5 h-3.5" />{l.click_count || 0}</span>
                  <Badge variant={l.is_active ? "default" : "secondary"} className="text-xs">{l.is_active ? "نشط" : "متوقف"}</Badge>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-muted/50 rounded px-3 py-2 mb-2" dir="ltr">
                <code className="text-xs flex-1 truncate">{getWaLink(l)}</code>
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => { navigator.clipboard.writeText(getWaLink(l)); toast.success("تم النسخ"); }}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              {(l.utm_source || l.utm_medium || l.utm_campaign) && (
                <div className="flex gap-1 flex-wrap mb-2">
                  {l.utm_source && <Badge variant="outline" className="text-xs">source: {l.utm_source}</Badge>}
                  {l.utm_medium && <Badge variant="outline" className="text-xs">medium: {l.utm_medium}</Badge>}
                  {l.utm_campaign && <Badge variant="outline" className="text-xs">campaign: {l.utm_campaign}</Badge>}
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-xs" onClick={() => viewClicks(l.id)}>
                  <BarChart3 className="w-3 h-3 ml-1" />تفاصيل النقرات
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteLink(l.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>إنشاء رابط قصير</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>العنوان (اختياري)</Label><Input placeholder="رابط الدعم الفني" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>رقم الهاتف (مع رمز الدولة)</Label><Input placeholder="966512345678" value={form.target_phone} onChange={(e) => setForm({ ...form, target_phone: e.target.value })} /></div>
            <div><Label>رسالة مسبقة (اختياري)</Label><Textarea placeholder="مرحباً، أحتاج مساعدة في..." value={form.prefilled_message} onChange={(e) => setForm({ ...form, prefilled_message: e.target.value })} /></div>
            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2">معلومات التتبع (UTM)</p>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs">Source</Label><Input placeholder="website" value={form.utm_source} onChange={(e) => setForm({ ...form, utm_source: e.target.value })} className="text-xs" dir="ltr" /></div>
                <div><Label className="text-xs">Medium</Label><Input placeholder="widget" value={form.utm_medium} onChange={(e) => setForm({ ...form, utm_medium: e.target.value })} className="text-xs" dir="ltr" /></div>
                <div><Label className="text-xs">Campaign</Label><Input placeholder="summer" value={form.utm_campaign} onChange={(e) => setForm({ ...form, utm_campaign: e.target.value })} className="text-xs" dir="ltr" /></div>
              </div>
            </div>
            <Button className="w-full" onClick={save}>إنشاء الرابط</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clicks Dialog */}
      <Dialog open={!!showClicks} onOpenChange={() => setShowClicks(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>تفاصيل النقرات</DialogTitle></DialogHeader>
          {clicks.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground">لا توجد نقرات بعد</p>
          ) : (
            <div className="max-h-80 overflow-auto space-y-2">
              {clicks.map((c) => (
                <div key={c.id} className="flex items-center justify-between border rounded p-2 text-xs">
                  <div className="space-y-0.5">
                    <p>{c.country || "غير معروف"} {c.city ? `- ${c.city}` : ""}</p>
                    <p className="text-muted-foreground">{c.device_type || "غير معروف"}</p>
                  </div>
                  <span className="text-muted-foreground">{new Date(c.clicked_at).toLocaleString("ar-SA")}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteLinkId}
        title="حذف هذا الرابط؟"
        confirmLabel="حذف"
        destructive
        onConfirm={confirmDeleteLink}
        onCancel={() => setDeleteLinkId(null)}
      />
    </div>
  );
};

/* ═══════════════════════════════════════════════
   Zapier / Integrations Tab
   ═══════════════════════════════════════════════ */
const ZapierTab = ({ orgId }: { orgId: string }) => {
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [outWebhooks, setOutWebhooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("Zapier Webhook");
  const [deleteWebhookId, setDeleteWebhookId] = useState<string | null>(null);
  const cloudUrl = import.meta.env.VITE_SUPABASE_URL;

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const [inRes, outRes] = await Promise.all([
      supabase.from("zapier_webhooks").select("*").eq("org_id", orgId).order("created_at"),
      supabase.from("org_webhooks").select("*").eq("org_id", orgId).order("created_at"),
    ]);
    setWebhooks(inRes.data || []);
    setOutWebhooks(outRes.data || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const createIncoming = async () => {
    const { error } = await supabase.from("zapier_webhooks").insert({ org_id: orgId, name: newName.trim() || "Zapier Webhook" });
    if (error) { toast.error("حدث خطأ"); return; }
    toast.success("تم إنشاء الويب هوك");
    setShowCreate(false);
    setNewName("Zapier Webhook");
    fetch_();
  };

  const toggleIncoming = async (id: string, active: boolean) => {
    await supabase.from("zapier_webhooks").update({ is_active: active }).eq("id", id);
    fetch_();
  };

  const deleteIncoming = (id: string) => { setDeleteWebhookId(id); };

  const confirmDeleteWebhook = async () => {
    if (!deleteWebhookId) return;
    setDeleteWebhookId(null);
    await supabase.from("zapier_webhooks").delete().eq("id", deleteWebhookId);
    toast.success("تم الحذف");
    fetch_();
  };

  const getIncomingUrl = (token: string) => `${cloudUrl}/functions/v1/zapier-incoming?token=${token}`;

  return (
    <div className="space-y-6">
      {/* Incoming Webhooks */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2"><ArrowRight className="w-4 h-4 text-primary" />Webhooks واردة (من Zapier)</h3>
            <p className="text-sm text-muted-foreground">استقبل بيانات من Zapier/Make لإنشاء عملاء أو إرسال رسائل</p>
          </div>
          <Button onClick={() => setShowCreate(true)} size="sm"><Plus className="w-4 h-4 ml-1" />جديد</Button>
        </div>

        {loading ? (
          <div className="text-center py-4 text-muted-foreground">جاري التحميل...</div>
        ) : webhooks.length === 0 ? (
          <div className="text-center py-8 bg-muted/30 rounded-lg border border-dashed">
            <Zap className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">لا توجد webhooks واردة</p>
          </div>
        ) : (
          <div className="space-y-2">
            {webhooks.map((w) => (
              <div key={w.id} className="border rounded-lg p-3 bg-card space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-warning" />
                    <span className="font-medium text-sm">{w.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={w.is_active} onCheckedChange={(v) => toggleIncoming(w.id, v)} />
                    <Button variant="ghost" size="sm" className="text-destructive h-7 w-7 p-0" onClick={() => deleteIncoming(w.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-muted/50 rounded px-2 py-1.5" dir="ltr">
                  <code className="text-xs flex-1 truncate">{getIncomingUrl(w.webhook_token)}</code>
                  <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => { navigator.clipboard.writeText(getIncomingUrl(w.webhook_token)); toast.success("تم النسخ"); }}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>الإجراءات: {(w.allowed_actions || []).join(", ")}</span>
                  <span>•</span>
                  <span>استُخدم {w.trigger_count || 0} مرة</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Outgoing Webhooks Info */}
      <div className="border-t pt-4 space-y-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2"><ArrowRight className="w-4 h-4 rotate-180 text-primary" />Webhooks صادرة (إلى Zapier)</h3>
          <p className="text-sm text-muted-foreground">أرسل أحداث المنصة (رسالة جديدة، عميل جديد) إلى Zapier/Make</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-4 text-sm space-y-2">
          <p>لإعداد Webhooks صادرة، انتقل إلى <strong>الإعدادات → الأمان</strong> (قسم Webhooks الصادرة).</p>
          <p className="text-muted-foreground">الأحداث المدعومة: رسالة جديدة، محادثة جديدة، تحديث حالة، عميل جديد، طلب جديد.</p>
          {outWebhooks.length > 0 && (
            <Badge variant="outline">{outWebhooks.filter((w) => w.is_active).length} webhook صادر نشط</Badge>
          )}
        </div>
      </div>

      {/* How to use guide */}
      <div className="border-t pt-4">
        <h4 className="font-semibold text-sm mb-2">كيفية الربط مع Zapier</h4>
        <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
          <li>أنشئ Zap جديد في Zapier واختر <strong>Webhooks by Zapier</strong> كمصدر (Trigger)</li>
          <li>اختر <strong>Catch Hook</strong> والصق رابط الويب هوك الصادر من المنصة</li>
          <li>لإرسال بيانات إلى المنصة، اختر <strong>Custom Request</strong> والصق رابط الويب هوك الوارد</li>
          <li>أرسل البيانات بصيغة JSON مع الحقول المطلوبة (phone, name, message)</li>
        </ol>
      </div>

      {/* Create Incoming Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>إنشاء Webhook وارد</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>الاسم</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Zapier - إنشاء عميل" /></div>
            <Button className="w-full" onClick={createIncoming}>إنشاء</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteWebhookId}
        title="حذف هذا الويب هوك؟"
        confirmLabel="حذف"
        destructive
        onConfirm={confirmDeleteWebhook}
        onCancel={() => setDeleteWebhookId(null)}
      />
    </div>
  );
};

/* ═══════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════ */
const GrowthToolsPage = () => {
  const { orgId } = useAuth();

  if (!orgId) return null;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold">أدوات النمو والتكاملات</h1>
        <p className="text-sm text-muted-foreground">ويدجت واتساب، روابط قصيرة، وتكاملات خارجية</p>
      </div>

      <Tabs defaultValue="zapier" dir="rtl">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="zapier" className="text-xs sm:text-sm"><Zap className="w-4 h-4 ml-1" />التكاملات</TabsTrigger>
          <TabsTrigger value="widget" className="text-xs sm:text-sm"><MessageSquare className="w-4 h-4 ml-1" />الويدجت</TabsTrigger>
          <TabsTrigger value="links" className="text-xs sm:text-sm"><Link2 className="w-4 h-4 ml-1" />الروابط</TabsTrigger>
        </TabsList>
        <TabsContent value="zapier"><ZapierTab orgId={orgId} /></TabsContent>
        <TabsContent value="widget"><WidgetTab orgId={orgId} /></TabsContent>
        <TabsContent value="links"><ShortLinksTab orgId={orgId} /></TabsContent>
      </Tabs>
    </div>
  );
};

export default GrowthToolsPage;

