import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Server, Wifi, WifiOff, QrCode, RefreshCw, Save, Trash2, Plus, Eye, EyeOff,
  CheckCircle, XCircle, Loader2, Phone, AlertTriangle, Copy, ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BaileysInstance {
  id: string;
  org_id: string;
  org_name?: string;
  server_url: string;
  api_key: string;
  instance_name: string;
  is_active: boolean;
  status: "disconnected" | "connecting" | "connected" | "qr_ready";
  phone_number?: string;
  last_checked_at?: string;
}

const statusMap = {
  disconnected: { label: "غير متصل", color: "text-destructive", icon: WifiOff, dot: "bg-destructive" },
  connecting: { label: "جاري الاتصال", color: "text-warning", icon: Loader2, dot: "bg-warning" },
  connected: { label: "متصل", color: "text-success", icon: Wifi, dot: "bg-success" },
  qr_ready: { label: "بانتظار المسح", color: "text-primary", icon: QrCode, dot: "bg-primary" },
};

const AdminBaileys = () => {
  const [instances, setInstances] = useState<BaileysInstance[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState<Record<string, boolean>>({});
  const [qrData, setQrData] = useState<Record<string, string>>({});
  const [checkingStatus, setCheckingStatus] = useState<Record<string, boolean>>({});
  const [globalSettings, setGlobalSettings] = useState({
    default_server_url: "",
    default_api_key: "",
    webhook_url: "",
    baileys_enabled: true,
  });

  // New instance form
  const [newInstance, setNewInstance] = useState({
    org_id: "",
    server_url: "",
    api_key: "",
    instance_name: "",
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setIsLoading(true);
    const [settingsRes, orgsRes] = await Promise.all([
      supabase.from("system_settings").select("*").in("key", [
        "baileys_default_server_url", "baileys_default_api_key",
        "baileys_webhook_url", "baileys_enabled"
      ]),
      supabase.from("organizations").select("id, name, slug"),
    ]);

    const sMap: Record<string, any> = {};
    (settingsRes.data || []).forEach(s => { sMap[s.key] = s.value; });

    setGlobalSettings({
      default_server_url: (sMap.baileys_default_server_url as string) || "",
      default_api_key: (sMap.baileys_default_api_key as string) || "",
      webhook_url: (sMap.baileys_webhook_url as string) || "",
      baileys_enabled: sMap.baileys_enabled !== false,
    });

    setOrgs(orgsRes.data || []);
    // For now, instances are stored in system_settings as JSON
    const instancesRes = await supabase.from("system_settings").select("*").eq("key", "baileys_instances").maybeSingle();
    setInstances((instancesRes.data?.value as unknown as BaileysInstance[]) || []);
    setIsLoading(false);
  };

  const saveGlobalSetting = async (key: string, value: any) => {
    const fullKey = `baileys_${key}`;
    const { error } = await supabase.from("system_settings").upsert({
      key: fullKey, value: JSON.parse(JSON.stringify(value)),
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });
    if (error) toast.error("فشل الحفظ");
    else toast.success("تم الحفظ");
  };

  const saveInstances = async (updated: BaileysInstance[]) => {
    await supabase.from("system_settings").upsert({
      key: "baileys_instances",
      value: JSON.parse(JSON.stringify(updated)) as any,
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });
    setInstances(updated);
  };

  const addInstance = async () => {
    if (!newInstance.org_id || !newInstance.instance_name) {
      toast.error("اختر المنظمة واسم الجلسة"); return;
    }
    const serverUrl = newInstance.server_url || globalSettings.default_server_url;
    const apiKey = newInstance.api_key || globalSettings.default_api_key;
    if (!serverUrl) { toast.error("أدخل رابط السيرفر"); return; }

    const org = orgs.find(o => o.id === newInstance.org_id);
    const instance: BaileysInstance = {
      id: crypto.randomUUID(),
      org_id: newInstance.org_id,
      org_name: org?.name,
      server_url: serverUrl.replace(/\/$/, ""),
      api_key: apiKey,
      instance_name: newInstance.instance_name,
      is_active: true,
      status: "disconnected",
    };

    const updated = [...instances, instance];
    await saveInstances(updated);
    toast.success("تمت إضافة الجلسة");
    setNewInstance({ org_id: "", server_url: "", api_key: "", instance_name: "" });
    setShowForm(false);
  };

  const removeInstance = async (id: string) => {
    const updated = instances.filter(i => i.id !== id);
    await saveInstances(updated);
    toast.success("تم الحذف");
  };

  const checkStatus = async (instance: BaileysInstance) => {
    setCheckingStatus(p => ({ ...p, [instance.id]: true }));
    try {
      const res = await fetch(`${instance.server_url}/instance/connectionState/${instance.instance_name}`, {
        headers: instance.api_key ? { apikey: instance.api_key } : {},
      });
      if (!res.ok) throw new Error("فشل الاتصال");
      const data = await res.json();
      const state = data?.instance?.state || data?.state || "unknown";
      const statusMap: Record<string, BaileysInstance["status"]> = {
        open: "connected", close: "disconnected", connecting: "connecting",
      };
      const updated = instances.map(i =>
        i.id === instance.id ? { ...i, status: statusMap[state] || "disconnected", last_checked_at: new Date().toISOString() } : i
      );
      await saveInstances(updated);
      toast.success(`الحالة: ${state}`);
    } catch (e: any) {
      toast.error(e.message || "فشل الاتصال بالسيرفر");
      const updated = instances.map(i =>
        i.id === instance.id ? { ...i, status: "disconnected" as const } : i
      );
      await saveInstances(updated);
    }
    setCheckingStatus(p => ({ ...p, [instance.id]: false }));
  };

  const fetchQr = async (instance: BaileysInstance) => {
    try {
      const res = await fetch(`${instance.server_url}/instance/connect/${instance.instance_name}`, {
        headers: instance.api_key ? { apikey: instance.api_key } : {},
      });
      if (!res.ok) throw new Error("فشل جلب QR");
      const data = await res.json();
      const qr = data?.qrcode?.base64 || data?.base64 || data?.qr || "";
      if (qr) {
        setQrData(p => ({ ...p, [instance.id]: qr }));
        const updated = instances.map(i =>
          i.id === instance.id ? { ...i, status: "qr_ready" as const } : i
        );
        await saveInstances(updated);
      } else {
        toast.info("الجلسة متصلة بالفعل أو لا يوجد QR");
      }
    } catch (e: any) {
      toast.error(e.message || "فشل جلب QR Code");
    }
  };

  const toggleInstance = async (id: string, active: boolean) => {
    const updated = instances.map(i => i.id === id ? { ...i, is_active: active } : i);
    await saveInstances(updated);
  };

  const copyWebhookUrl = () => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;
    navigator.clipboard.writeText(url);
    toast.success("تم نسخ رابط Webhook");
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Server className="w-4 h-4 text-primary" /> سيرفر Baileys (QR)
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{globalSettings.baileys_enabled ? "مفعّل" : "معطّل"}</span>
          <Switch
            checked={globalSettings.baileys_enabled}
            onCheckedChange={(v) => {
              setGlobalSettings(p => ({ ...p, baileys_enabled: v }));
              saveGlobalSetting("enabled", v);
            }}
          />
        </div>
      </div>

      {/* Global Server Settings */}
      <div className="bg-card rounded-xl shadow-card p-4 space-y-4">
        <p className="text-xs font-semibold text-muted-foreground">إعدادات السيرفر الافتراضية</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">رابط السيرفر الافتراضي</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={globalSettings.default_server_url}
                onChange={(e) => setGlobalSettings(p => ({ ...p, default_server_url: e.target.value }))}
                placeholder="https://baileys.example.com"
                className="h-9 text-sm font-mono" dir="ltr"
              />
              <Button size="sm" variant="outline" className="h-9" onClick={() => saveGlobalSetting("default_server_url", globalSettings.default_server_url)}>
                <Save className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">API Key الافتراضي</Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="password"
                value={globalSettings.default_api_key}
                onChange={(e) => setGlobalSettings(p => ({ ...p, default_api_key: e.target.value }))}
                placeholder="••••••••"
                className="h-9 text-sm font-mono" dir="ltr"
              />
              <Button size="sm" variant="outline" className="h-9" onClick={() => saveGlobalSetting("default_api_key", globalSettings.default_api_key)}>
                <Save className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* Webhook URL */}
        <div>
          <Label className="text-xs">رابط Webhook (للرسائل الواردة)</Label>
          <div className="flex gap-2 mt-1">
            <Input
              readOnly
              value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`}
              className="h-9 text-[11px] font-mono bg-muted" dir="ltr"
            />
            <Button size="sm" variant="outline" className="h-9" onClick={copyWebhookUrl}>
              <Copy className="w-3 h-3" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">ضع هذا الرابط في إعدادات Webhook في سيرفر Baileys</p>
        </div>
      </div>

      {/* Instances List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground">الجلسات ({instances.length})</p>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setShowForm(!showForm)}>
            <Plus className="w-3 h-3" /> إضافة جلسة
          </Button>
        </div>

        {/* Add Form */}
        {showForm && (
          <div className="bg-card rounded-xl shadow-card p-4 border-2 border-dashed border-primary/30 space-y-3">
            <p className="text-xs font-semibold">جلسة جديدة</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">المنظمة</Label>
                <select
                  value={newInstance.org_id}
                  onChange={(e) => setNewInstance(p => ({ ...p, org_id: e.target.value }))}
                  className="w-full h-9 text-sm border border-border rounded-md bg-background px-2 mt-1"
                >
                  <option value="">اختر منظمة...</option>
                  {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">اسم الجلسة</Label>
                <Input
                  value={newInstance.instance_name}
                  onChange={(e) => setNewInstance(p => ({ ...p, instance_name: e.target.value.replace(/[^a-zA-Z0-9_-]/g, "") }))}
                  placeholder="org-session-1"
                  className="h-9 text-sm font-mono mt-1" dir="ltr"
                />
              </div>
              <div>
                <Label className="text-xs">رابط سيرفر مخصص (اختياري)</Label>
                <Input
                  value={newInstance.server_url}
                  onChange={(e) => setNewInstance(p => ({ ...p, server_url: e.target.value }))}
                  placeholder={globalSettings.default_server_url || "يستخدم الافتراضي"}
                  className="h-9 text-sm font-mono mt-1" dir="ltr"
                />
              </div>
              <div>
                <Label className="text-xs">API Key مخصص (اختياري)</Label>
                <Input
                  type="password"
                  value={newInstance.api_key}
                  onChange={(e) => setNewInstance(p => ({ ...p, api_key: e.target.value }))}
                  placeholder="يستخدم الافتراضي"
                  className="h-9 text-sm font-mono mt-1" dir="ltr"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowForm(false)}>إلغاء</Button>
              <Button size="sm" className="text-xs gap-1" onClick={addInstance}>
                <Plus className="w-3 h-3" /> إضافة
              </Button>
            </div>
          </div>
        )}

        {/* Instance Cards */}
        {instances.map((inst) => {
          const st = statusMap[inst.status] || statusMap.disconnected;
          return (
            <div key={inst.id} className="bg-card rounded-xl shadow-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center",
                    inst.status === "connected" ? "bg-success/10" : inst.status === "qr_ready" ? "bg-primary/10" : "bg-muted"
                  )}>
                    <st.icon className={cn("w-4 h-4", st.color, inst.status === "connecting" && "animate-spin")} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{inst.instance_name}</p>
                      <div className={cn("w-2 h-2 rounded-full", st.dot)} />
                      <span className={cn("text-[10px]", st.color)}>{st.label}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {inst.org_name || inst.org_id.slice(0, 8)} · {inst.server_url.replace(/https?:\/\//, "").slice(0, 30)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={inst.is_active}
                    onCheckedChange={(v) => toggleInstance(inst.id, v)}
                  />
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => removeInstance(inst.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm" variant="outline" className="h-8 text-xs gap-1"
                  disabled={checkingStatus[inst.id]}
                  onClick={() => checkStatus(inst)}
                >
                  {checkingStatus[inst.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  فحص الحالة
                </Button>
                <Button
                  size="sm" variant="outline" className="h-8 text-xs gap-1"
                  onClick={() => fetchQr(inst)}
                >
                  <QrCode className="w-3 h-3" /> جلب QR
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-8 text-xs gap-1"
                  onClick={() => setShowApiKeys(p => ({ ...p, [inst.id]: !p[inst.id] }))}
                >
                  {showApiKeys[inst.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  API Key
                </Button>
              </div>

              {/* API Key reveal */}
              {showApiKeys[inst.id] && (
                <div className="bg-muted rounded-lg p-2">
                  <code className="text-[11px] font-mono break-all" dir="ltr">{inst.api_key || "لا يوجد"}</code>
                </div>
              )}

              {/* QR Code Display */}
              {qrData[inst.id] && (
                <div className="flex flex-col items-center gap-3 py-4 bg-white rounded-xl border border-border">
                  <p className="text-xs font-semibold text-foreground">امسح الكود من واتساب</p>
                  <img
                    src={qrData[inst.id].startsWith("data:") ? qrData[inst.id] : `data:image/png;base64,${qrData[inst.id]}`}
                    alt="QR Code"
                    className="w-56 h-56 rounded-lg"
                  />
                  <p className="text-[10px] text-muted-foreground">افتح واتساب → الأجهزة المرتبطة → ربط جهاز</p>
                  <Button size="sm" variant="ghost" className="text-xs" onClick={() => setQrData(p => { const n = { ...p }; delete n[inst.id]; return n; })}>
                    إخفاء
                  </Button>
                </div>
              )}

              {/* Last checked */}
              {inst.last_checked_at && (
                <p className="text-[9px] text-muted-foreground">
                  آخر فحص: {new Date(inst.last_checked_at).toLocaleString("ar-SA")}
                </p>
              )}
            </div>
          );
        })}

        {instances.length === 0 && !showForm && (
          <div className="text-center py-12 text-muted-foreground">
            <Server className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">لا توجد جلسات Baileys بعد</p>
            <p className="text-xs mt-1">أضف جلسة لربط رقم واتساب عبر QR Code</p>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-muted/50 rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-warning" /> ملاحظات مهمة</p>
        <ul className="text-[11px] text-muted-foreground space-y-1 list-disc pr-4">
          <li>Baileys يعتمد على بروتوكول واتساب غير الرسمي — قد يتوقف في أي وقت</li>
          <li>يحتاج سيرفر Node.js يعمل 24/7 (VPS أو Railway أو DigitalOcean)</li>
          <li>يُنصح باستخدام Evolution API كواجهة جاهزة لـ Baileys</li>
          <li>لا تستخدمه للأرقام التجارية المهمة — استخدم Meta Cloud API بدلاً منه</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminBaileys;
