import { useState, useEffect, useRef } from "react";
import {
  AlertTriangle, CheckCircle2, Loader2, QrCode,
  Server, Trash2, Wifi, Settings, Smartphone, RefreshCw,
  LogOut, Send, Pencil, Check, X, Shield, Clock, Gauge
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import ChannelRoutingConfig from "./ChannelRoutingConfig";
import WhatsAppProfileEditor from "./WhatsAppProfileEditor";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase, invokeCloud } from "@/lib/supabase";
import { toast } from "sonner";

interface Props {
  orgId: string | null;
  isSuperAdmin: boolean;
  autoOpen?: boolean;
  onConfigChange?: () => void;
}

type InstanceStatus = "idle" | "connecting" | "qr_pending" | "connected" | "disconnected";

// ── Rate Limit Panel ──
interface RateLimitPanelProps {
  configId: string;
  initialSettings: any;
}

const RateLimitPanel = ({ configId, initialSettings }: RateLimitPanelProps) => {
  const defaults = {
    enabled: true, min_delay_seconds: 8, max_delay_seconds: 15,
    batch_size: 10, batch_pause_seconds: 30, daily_limit: 200, hourly_limit: 50,
  };
  const [settings, setSettings] = useState({ ...defaults, ...(initialSettings || {}) });
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const cleaned = {
      ...settings,
      min_delay_seconds: Math.max(1, Math.min(settings.min_delay_seconds, settings.max_delay_seconds)),
      max_delay_seconds: Math.max(settings.min_delay_seconds, settings.max_delay_seconds),
    };
    await supabase.from("whatsapp_config").update({ rate_limit_settings: cleaned }).eq("id", configId);
    setSettings(cleaned);
    setSaving(false);
    toast.success("تم حفظ إعدادات الحماية");
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full flex items-center justify-between bg-warning/5 border border-warning/20 rounded-lg px-3 py-2.5 hover:bg-warning/10 transition-colors group">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-warning" />
          <div className="text-right">
            <p className="text-xs font-semibold text-foreground">حماية من الحظر</p>
            <p className="text-[10px] text-muted-foreground">
              {settings.enabled ? `فاصل ${settings.min_delay_seconds}-${settings.max_delay_seconds}ث · ${settings.hourly_limit}/ساعة · ${settings.daily_limit}/يوم` : "معطّلة"}
            </p>
          </div>
        </div>
        <Settings className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
      </button>
    );
  }

  return (
    <div className="bg-card border border-warning/20 rounded-xl p-4 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-warning" />
          <h4 className="text-xs font-bold">حماية من الحظر (Rate Limiting)</h4>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{settings.enabled ? "مفعّل" : "معطّل"}</span>
          <Switch checked={settings.enabled} onCheckedChange={(v: boolean) => setSettings({ ...settings, enabled: v })} />
        </div>
      </div>

      {settings.enabled && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <Label className="text-[11px]">فاصل بين الرسائل (ثانية)</Label>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>أقل: {settings.min_delay_seconds}ث</span>
                  <span>أكثر: {settings.max_delay_seconds}ث</span>
                </div>
                <div className="flex gap-2">
                  <Input type="number" min={1} max={60} value={settings.min_delay_seconds}
                    onChange={(e) => setSettings({ ...settings, min_delay_seconds: Number(e.target.value) || 1 })}
                    className="h-7 text-xs w-16 text-center" />
                  <span className="text-muted-foreground self-center text-xs">—</span>
                  <Input type="number" min={1} max={120} value={settings.max_delay_seconds}
                    onChange={(e) => setSettings({ ...settings, max_delay_seconds: Number(e.target.value) || 1 })}
                    className="h-7 text-xs w-16 text-center" />
                </div>
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground">فاصل عشوائي بين الحد الأدنى والأقصى لتقليد السلوك البشري</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">حجم الدُفعة</Label>
              <Input type="number" min={1} max={50} value={settings.batch_size}
                onChange={(e) => setSettings({ ...settings, batch_size: Number(e.target.value) || 5 })}
                className="h-7 text-xs" />
              <p className="text-[9px] text-muted-foreground">رسائل قبل الاستراحة</p>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">استراحة الدُفعة (ث)</Label>
              <Input type="number" min={5} max={300} value={settings.batch_pause_seconds}
                onChange={(e) => setSettings({ ...settings, batch_pause_seconds: Number(e.target.value) || 30 })}
                className="h-7 text-xs" />
              <p className="text-[9px] text-muted-foreground">توقف بعد كل دفعة</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Gauge className="w-3 h-3 text-muted-foreground" />
                <Label className="text-[11px]">حد بالساعة</Label>
              </div>
              <Input type="number" min={1} max={500} value={settings.hourly_limit}
                onChange={(e) => setSettings({ ...settings, hourly_limit: Number(e.target.value) || 50 })}
                className="h-7 text-xs" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Gauge className="w-3 h-3 text-muted-foreground" />
                <Label className="text-[11px]">حد يومي</Label>
              </div>
              <Input type="number" min={1} max={5000} value={settings.daily_limit}
                onChange={(e) => setSettings({ ...settings, daily_limit: Number(e.target.value) || 200 })}
                className="h-7 text-xs" />
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-2.5 text-[10px] text-muted-foreground space-y-1">
            <p>🛡️ النظام يُوقف الحملة مؤقتاً عند الوصول للحد ويستأنفها تلقائياً</p>
            <p>🎲 الفاصل العشوائي يحاكي الإرسال البشري ويقلل احتمالية الحظر</p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" className="flex-1 text-xs gap-1" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          حفظ
        </Button>
        <Button size="sm" variant="ghost" className="text-xs" onClick={() => setOpen(false)}>
          إغلاق
        </Button>
      </div>
    </div>
  );
};

const WhatsAppWebSection = ({ orgId, isSuperAdmin, autoOpen = false, onConfigChange }: Props) => {
  const [showSetup, setShowSetup] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [instanceStatus, setInstanceStatus] = useState<InstanceStatus>("idle");
  const [instanceName, setInstanceName] = useState("");
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [existingConfig, setExistingConfig] = useState<any>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [maxUnofficialPhones, setMaxUnofficialPhones] = useState<number>(1);
  const [unofficialCount, setUnofficialCount] = useState<number>(0);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelText, setLabelText] = useState("");
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  // Pairing code state
  const [linkMethod, setLinkMethod] = useState<"qr" | "code">("qr");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingPhone, setPairingPhone] = useState("");
  const [isRequestingCode, setIsRequestingCode] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    loadExistingConfig();
    loadUnofficialLimits();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [orgId]);

  useEffect(() => {
    if (autoOpen) setShowSetup(true);
  }, [autoOpen]);

  useEffect(() => {
    if (!autoOpen) return;
    if (existingConfig?.is_connected && (existingConfig?.evolution_instance_status === "connected" || existingConfig?.evolution_instance_status === "connecting")) {
      setInstanceStatus("connected");
      setQrCode(null);
      setPairingCode(null);
      return;
    }

    if (existingConfig?.evolution_instance_name) {
      setInstanceName(existingConfig.evolution_instance_name);
      setInstanceStatus("disconnected");
      setQrCode(null);
      setPairingCode(null);
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    setInstanceStatus("idle");
    setQrCode(null);
    setPairingCode(null);
  }, [autoOpen, existingConfig?.evolution_instance_name, existingConfig?.evolution_instance_status, existingConfig?.is_connected]);

  const loadExistingConfig = async () => {
    setIsLoadingConfig(true);
    if (!orgId) { setIsLoadingConfig(false); return; }
    const fetchConfig = async () => {
      const { data } = await supabase.rpc("get_org_whatsapp_channels");
      return {
        data: ((data || []) as any[])
          .filter((config) => config.org_id === orgId && config.channel_type === "evolution")
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null,
      };
    };

    let { data } = await fetchConfig();

    if (data?.is_connected && data.evolution_instance_status === "connected" && !data.display_phone && data.evolution_instance_name) {
      await invokeCloud("evolution-manage", {
        body: { action: "status", instance_name: data.evolution_instance_name },
      });
      const refreshed = await fetchConfig();
      data = refreshed.data || data;
    }

    if (data) {
      setExistingConfig(data);
      setInstanceName(data.evolution_instance_name || "");
      if (data.evolution_instance_status === "connected" && data.is_connected) {
        setInstanceStatus("connected");
      } else if (data.evolution_instance_name) {
        setInstanceStatus("disconnected");
      }
      onConfigChange?.();
    } else {
      setExistingConfig(null);
      setInstanceName("");
      setInstanceStatus("idle");
    }
    setIsLoadingConfig(false);
  };

  const loadUnofficialLimits = async () => {
    if (!orgId) return;
    const [channelsRes, orgRes] = await Promise.all([
      supabase.rpc("get_org_whatsapp_channels"),
      supabase.from("organizations").select("plans(max_unofficial_phones)").eq("id", orgId).maybeSingle(),
    ]);
    const unofficialChannels = ((channelsRes.data || []) as any[]).filter((config) => config.org_id === orgId && config.channel_type === "evolution");
    setUnofficialCount(unofficialChannels.length);
    const planData = orgRes?.data as any;
    if (planData?.plans?.max_unofficial_phones != null) setMaxUnofficialPhones(planData.plans.max_unofficial_phones);
  };

  const createInstance = async () => {
    const guessedName = `org_${(orgId || "").replace(/-/g, "").slice(0, 12)}`;

    if (unofficialCount >= maxUnofficialPhones && !isSuperAdmin) {
      toast.error(`وصلت للحد الأقصى (${maxUnofficialPhones} رقم غير رسمي). ترقّ لباقة أعلى لإضافة أرقام جديدة.`);
      return;
    }
    setIsCreating(true);
    try {
      const { data, error } = await invokeCloud("evolution-manage", {
        body: { action: "create" },
      });

      if (error || !data?.success) {
        const errorMessage = data?.error || error?.message || "فشل إنشاء الجلسة";

        // If instance already exists on server, show reconnect options
        if (errorMessage.toLowerCase().includes("already")) {
          toast.info("جلسة موجودة مسبقاً — يمكنك إعادة الاتصال أو حذفها");
          setInstanceStatus("disconnected");
          setInstanceName(guessedName);
          await fetchQR(guessedName, { allowRecreate: false, silent: true });
          setIsCreating(false);
          return;
        }

        if (guessedName && !errorMessage.toLowerCase().includes("unauthorized")) {
          const recovered = await fetchQR(guessedName, { allowRecreate: false, silent: true });
          if (recovered) {
            setInstanceName(guessedName);
            setIsCreating(false);
            return;
          }
        }

        toast.error(errorMessage.includes("Unauthorized") ? "انتهت الجلسة، أعد تسجيل الدخول" : errorMessage);
        setIsCreating(false);
        return;
      }

      setInstanceName(data.instance_name);

      if (data.qr_code) {
        const qrSrc = data.qr_code.startsWith("data:") ? data.qr_code : `data:image/png;base64,${data.qr_code}`;
        setQrCode(qrSrc);
        setInstanceStatus("qr_pending");
        startPolling(data.instance_name);
      } else {
        setInstanceStatus("connecting");
        await fetchQR(data.instance_name, { allowRecreate: false, silent: true });
      }
    } catch {
      toast.error("خطأ في الاتصال بالسيرفر");
    }
    setIsCreating(false);
  };

   const fetchQR = async (name?: string, options?: { allowRecreate?: boolean; silent?: boolean }) => {
    const iName = name || instanceName;
     if (!iName) return false;

     const allowRecreate = options?.allowRecreate ?? true;
     const silent = options?.silent ?? false;

    setInstanceStatus("connecting");
    
    try {
      const { data, error } = await invokeCloud("evolution-manage", {
        body: { action: "connect", instance_name: iName },
      });

        if (error || data?.error) {
          if (!silent) {
            toast.error(data?.error || error?.message || "تعذر جلب رمز QR");
          }
          return false;
        }

       // If instance doesn't exist on server (deleted/expired), recreate it
       if (!data?.qr_code && !data?.status) {
         if (!allowRecreate) return false;
        console.log("Instance not found, recreating...");
        toast.info("جاري إعادة إنشاء الجلسة...");
        await createInstance();
         return false;
      }

      if (data?.qr_code) {
        const qrSrc = data.qr_code.startsWith("data:") ? data.qr_code : `data:image/png;base64,${data.qr_code}`;
        setQrCode(qrSrc);
        setInstanceStatus("qr_pending");
        startPolling(iName);
         return true;
      } else if (data?.status === "open") {
        setInstanceStatus("connected");
        setQrCode(null);
        toast.success("✅ الرقم متصل بالفعل");
        loadExistingConfig();
        onConfigChange?.();
        return true;
       } else if (data?.status) {
         setInstanceStatus("connecting");
         startPolling(iName);
         return true;
      }
    } catch {
       if (!silent) {
         toast.error("خطأ في الاتصال بالسيرفر");
       }
       return false;
    }

     // If we get here, try creating fresh
     if (allowRecreate) {
       toast.info("جاري إعادة إنشاء الجلسة...");
       await createInstance();
     }
     return false;
  };

  const requestPairingCode = async () => {
    if (!pairingPhone.trim()) {
      toast.error("أدخل رقم الهاتف أولاً");
      return;
    }
    setIsRequestingCode(true);
    setPairingCode(null);

    try {
      // Ensure instance exists first
      let iName = instanceName;
      if (!iName) {
        const { data, error } = await invokeCloud("evolution-manage", {
          body: { action: "create" },
        });
        if (error || !data?.success) {
          // If already exists, use the default name
          iName = `org_${(orgId || "").replace(/-/g, "").slice(0, 12)}`;
        } else {
          iName = data.instance_name;
        }
        setInstanceName(iName);
      }

      const { data, error } = await invokeCloud("evolution-manage", {
        body: { action: "pairing_code", instance_name: iName, phone_number: pairingPhone.trim() },
      });

      if (error || !data?.success) {
        toast.error(data?.error || "فشل الحصول على كود الربط");
        setIsRequestingCode(false);
        return;
      }

      if (data.status === "open") {
        setInstanceStatus("connected");
        toast.success("✅ الرقم متصل بالفعل");
        loadExistingConfig();
        onConfigChange?.();
        setIsRequestingCode(false);
        return;
      }

      setPairingCode(data.pairing_code);
      setInstanceStatus("qr_pending"); // reuse this state for polling
      startPolling(iName);
    } catch {
      toast.error("خطأ في الاتصال بالسيرفر");
    }
    setIsRequestingCode(false);
  };
  const startPolling = (name: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 40) { // Stop after ~3.5 minutes
        if (pollRef.current) clearInterval(pollRef.current);
        toast.error("⚠️ انتهت مهلة المسح — اضغط تحديث QR للمحاولة مجدداً");
        return;
      }

      // Every other attempt: fetch fresh QR (Evolution regenerates QR every ~20s)
      // Alternate attempts: check connection status
      if (attempts % 2 === 0) {
        // Refresh QR to keep it valid
        try {
          const { data } = await invokeCloud("evolution-manage", {
            body: { action: "connect", instance_name: name },
          });
          if (data?.status === "open") {
            setInstanceStatus("connected");
            setQrCode(null);
            if (pollRef.current) clearInterval(pollRef.current);
            toast.success("✅ تم ربط الرقم بنجاح!");
            loadExistingConfig();
            onConfigChange?.();
            return;
          }
          if (data?.qr_code) {
            const qrSrc = data.qr_code.startsWith("data:") ? data.qr_code : `data:image/png;base64,${data.qr_code}`;
            setQrCode(qrSrc);
          }
        } catch { /* ignore */ }
      } else {
        // Check status
        const { data } = await invokeCloud("evolution-manage", {
          body: { action: "status", instance_name: name },
        });
        if (data?.status === "open") {
          setInstanceStatus("connected");
          setQrCode(null);
          if (pollRef.current) clearInterval(pollRef.current);
          toast.success("✅ تم ربط الرقم بنجاح!");
          loadExistingConfig();
          onConfigChange?.();
        }
      }
    }, 5000); // every 5 seconds (alternating = QR refresh every 10s)
  };

  const checkStatus = async () => {
    if (!instanceName) return;
    setIsCheckingStatus(true);
    const { data } = await invokeCloud("evolution-manage", {
      body: { action: "status", instance_name: instanceName },
    });

    if (data?.status === "open") {
      setInstanceStatus("connected");
      toast.success("✅ متصل");
    } else {
      setInstanceStatus("disconnected");
      toast.info(`الحالة: ${data?.status || "غير معروف"}`);
    }
    setIsCheckingStatus(false);
    loadExistingConfig();
    onConfigChange?.();
  };

  const logout = async () => {
    if (!instanceName || !confirm("هل تريد فصل الرقم؟")) return;
    const { data } = await invokeCloud("evolution-manage", {
      body: { action: "logout", instance_name: instanceName },
    });
    if (data?.success) {
      setInstanceStatus("disconnected");
      setQrCode(null);
      toast.success("تم فصل الرقم");
      loadExistingConfig();
      onConfigChange?.();
    }
  };

  const deleteInstance = async () => {
    if (!instanceName || !confirm("هل تريد حذف الجلسة نهائياً؟")) return;
    setIsDeleting(true);
    const { data } = await invokeCloud("evolution-manage", {
      body: { action: "delete", instance_name: instanceName },
    });
    if (data?.success) {
      setInstanceStatus("idle");
      setQrCode(null);
      setInstanceName("");
      setExistingConfig(null);
      toast.success("تم حذف الجلسة");
      onConfigChange?.();
    }
    setIsDeleting(false);
  };

  const sendTestMessage = async () => {
    if (!testPhone.trim()) { toast.error("أدخل رقم الهاتف"); return; }
    setTestSending(true);
    try {
      const { data, error } = await invokeCloud("evolution-send", {
        body: { to: testPhone.trim(), message: "✅ تم الربط بنجاح! هذه رسالة اختبار من Respondly (WhatsApp Web)." },
      });
      if (error || data?.error) {
        toast.error(data?.error || "فشل إرسال الرسالة");
      } else {
        toast.success("✅ تم إرسال الرسالة!");
      }
    } catch { toast.error("خطأ"); }
    setTestSending(false);
  };

  if (isLoadingConfig) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
            <QrCode className="w-4 h-4 text-warning" />
          </div>
           <div>
            <div className="flex items-center gap-2">
              {editingLabel ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={labelText}
                    onChange={(e) => setLabelText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        supabase.from("whatsapp_config").update({ channel_label: labelText.trim() || null }).eq("id", existingConfig?.id).then(() => { setEditingLabel(false); toast.success("تم تحديث الاسم"); loadExistingConfig(); onConfigChange?.(); });
                      }
                      if (e.key === "Escape") setEditingLabel(false);
                    }}
                    className="h-6 text-xs w-28 bg-secondary border-0"
                    placeholder="اسم القناة..."
                    autoFocus
                  />
                  <button onClick={() => { supabase.from("whatsapp_config").update({ channel_label: labelText.trim() || null }).eq("id", existingConfig?.id).then(() => { setEditingLabel(false); toast.success("تم تحديث الاسم"); loadExistingConfig(); onConfigChange?.(); }); }} className="text-success"><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setEditingLabel(false)} className="text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <div className="flex items-center gap-1 group">
                  <h2 className="font-semibold text-sm">{existingConfig?.channel_label || "واتساب ويب"}</h2>
                  {existingConfig && (
                    <button onClick={() => { setEditingLabel(true); setLabelText(existingConfig?.channel_label || ""); }} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary">
                      <Pencil className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              )}
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-warning border-warning/30">غير رسمي</Badge>
              {instanceStatus === "connected" && (
                <Badge className="bg-success/10 text-success border-0 text-[9px] gap-0.5">
                  <CheckCircle2 className="w-2.5 h-2.5" /> متصل
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              ربط عبر مسح QR — Evolution API
            </p>
          </div>
        </div>
        {!autoOpen && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={() => setShowSetup(!showSetup)}
          >
            <Smartphone className="w-3.5 h-3.5" />
            {showSetup ? "إخفاء" : instanceStatus === "connected" ? "إدارة" : "ربط رقم"}
          </Button>
        )}
      </div>

      {/* Compact Risk Warning - only visible when setup is open */}
      {showSetup && (
        <div className="flex items-center gap-2 bg-warning/5 border border-warning/20 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
          <p className="text-[10px] text-warning/80 leading-snug">
            طريقة <strong>غير رسمية</strong> — قد يتم حظر الرقم بدون إنذار. لا تدعم القوالب أو الإرسال خارج 24 ساعة.
          </p>
        </div>
      )}

      {showSetup && (
        <div className="bg-card rounded-xl shadow-card border border-border p-4 space-y-4 animate-fade-in">

          {/* ═══ CONNECTED STATE ═══ */}
          {instanceStatus === "connected" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-success/5 border border-success/20 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-success" />
                  <div>
                    <p className="text-xs font-bold text-success">الرقم متصل</p>
                    <p className="text-[10px] text-muted-foreground font-mono" dir="ltr">
                      {existingConfig?.display_phone || existingConfig?.business_name || instanceName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={checkStatus} disabled={isCheckingStatus}>
                    {isCheckingStatus ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    تحقق
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 text-destructive" onClick={logout}>
                    <LogOut className="w-3 h-3" /> فصل
                  </Button>
                </div>
              </div>

              {/* Test Message */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-primary" /> إرسال رسالة اختبار
                </p>
                <div className="flex gap-2">
                  <Input
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="966535195202"
                    className="bg-card border border-border text-xs flex-1"
                    dir="ltr"
                  />
                  <Button size="sm" className="gap-1 text-xs" onClick={sendTestMessage} disabled={testSending || !testPhone}>
                    {testSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    إرسال
                  </Button>
                </div>
              </div>

              {/* Profile Editor */}
              {existingConfig?.id && (
                <div className="flex justify-center">
                  <WhatsAppProfileEditor configId={existingConfig.id} channelType="evolution" />
                </div>
              )}

              {/* Channel Routing */}
              {orgId && existingConfig?.id && (
                <ChannelRoutingConfig
                  configId={existingConfig.id}
                  orgId={orgId}
                  defaultTeamId={existingConfig.default_team_id}
                  defaultAgentId={existingConfig.default_agent_id}
                />
              )}

              {/* Rate Limit Settings */}
              {existingConfig?.id && (
                <RateLimitPanel configId={existingConfig.id} initialSettings={existingConfig.rate_limit_settings} />
              )}

              {/* Delete Instance */}
              {isSuperAdmin && (
                <Button variant="outline" size="sm" className="w-full text-xs gap-1.5 text-destructive border-destructive/30" onClick={deleteInstance} disabled={isDeleting}>
                  {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  حذف الجلسة نهائياً
                </Button>
              )}
            </div>
          )}

          {/* ═══ QR PENDING STATE ═══ */}
          {instanceStatus === "qr_pending" && qrCode && !pairingCode && (
            <div className="space-y-3">
              <div className="bg-white rounded-xl p-6 text-center space-y-3 border border-border">
                <p className="text-sm font-bold text-foreground">امسح رمز QR بهاتفك</p>
                <p className="text-[11px] text-muted-foreground">واتساب → الأجهزة المرتبطة → ربط جهاز</p>
                <div className="flex justify-center">
                  <img src={qrCode} alt="QR Code" className="w-52 h-52 rounded-lg" />
                </div>
                <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  جاري انتظار المسح...
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 text-xs gap-1" onClick={() => fetchQR()}>
                  <RefreshCw className="w-3 h-3" /> تحديث QR
                </Button>
                <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={() => { setQrCode(null); setInstanceStatus("disconnected"); if (pollRef.current) clearInterval(pollRef.current); }}>
                  إلغاء
                </Button>
              </div>
            </div>
          )}

          {/* ═══ PAIRING CODE PENDING STATE ═══ */}
          {instanceStatus === "qr_pending" && pairingCode && (
            <div className="space-y-3">
              <div className="bg-white rounded-xl p-6 text-center space-y-4 border border-border">
                <p className="text-sm font-bold text-foreground">أدخل الكود في هاتفك</p>
                <p className="text-[11px] text-muted-foreground">واتساب → الأجهزة المرتبطة → ربط جهاز → الربط برقم الهاتف</p>
                <div className="flex justify-center">
                  <div className="bg-muted rounded-xl px-6 py-4 font-mono text-2xl font-bold tracking-[0.4em] text-foreground" dir="ltr">
                    {pairingCode.slice(0, 4)}-{pairingCode.slice(4)}
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  جاري انتظار الربط...
                </div>
                <p className="text-[10px] text-muted-foreground">الكود صالح لمدة دقيقة واحدة فقط</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 text-xs gap-1" onClick={() => requestPairingCode()}>
                  <RefreshCw className="w-3 h-3" /> كود جديد
                </Button>
                <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={() => { setPairingCode(null); setInstanceStatus("disconnected"); if (pollRef.current) clearInterval(pollRef.current); }}>
                  إلغاء
                </Button>
              </div>
            </div>
          )}

          {/* ═══ CONNECTING STATE ═══ */}
          {instanceStatus === "connecting" && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
              <p className="text-sm font-bold">جاري توليد رمز QR...</p>
              <p className="text-[11px] text-muted-foreground">يتم إعادة إنشاء الجلسة والاتصال بسيرفرات واتساب</p>
            </div>
          )}

          {/* ═══ IDLE / DISCONNECTED STATE ═══ */}
          {(instanceStatus === "idle" || instanceStatus === "disconnected") && !qrCode && !pairingCode && (
            <div className="space-y-3">
              {/* Method Toggle */}
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <button
                  onClick={() => setLinkMethod("qr")}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-md transition-colors ${linkMethod === "qr" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <QrCode className="w-3.5 h-3.5" /> مسح QR
                </button>
                <button
                  onClick={() => setLinkMethod("code")}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-md transition-colors ${linkMethod === "code" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Smartphone className="w-3.5 h-3.5" /> ربط بالكود
                </button>
              </div>

              {instanceStatus === "disconnected" && instanceName && (
                <div className="bg-warning/5 border border-warning/20 rounded-lg p-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-warning">الجلسة غير متصلة</p>
                    <p className="text-[10px] text-muted-foreground">
                      {linkMethod === "qr" ? 'اضغط "إعادة الربط" لعرض QR جديد' : "أدخل رقم الهاتف للحصول على كود الربط"}
                    </p>
                  </div>
                </div>
              )}

              {linkMethod === "qr" ? (
                <Button
                  className="w-full gap-1.5 text-xs py-5 font-bold"
                  onClick={instanceName ? () => fetchQR() : createInstance}
                  disabled={isCreating}
                >
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                  {instanceName ? "توليد QR للربط" : "إنشاء جلسة وتوليد QR"}
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={pairingPhone}
                      onChange={(e) => setPairingPhone(e.target.value)}
                      placeholder="966535195202"
                      className="bg-card border border-border text-xs flex-1"
                      dir="ltr"
                    />
                    <Button
                      className="gap-1.5 text-xs font-bold"
                      onClick={requestPairingCode}
                      disabled={isRequestingCode || !pairingPhone.trim()}
                    >
                      {isRequestingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                      طلب الكود
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    أدخل رقم الواتساب الذي تريد ربطه (مع رمز الدولة بدون +)
                  </p>
                </div>
              )}

              {instanceName && isSuperAdmin && (
                <Button variant="outline" size="sm" className="w-full text-xs gap-1.5 text-destructive border-destructive/30" onClick={deleteInstance} disabled={isDeleting}>
                  {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  حذف الجلسة
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WhatsAppWebSection;
