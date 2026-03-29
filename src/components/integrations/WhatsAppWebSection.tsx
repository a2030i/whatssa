import { useState, useEffect, useRef } from "react";
import {
  AlertTriangle, CheckCircle2, Loader2, QrCode,
  Server, Trash2, Wifi, Settings, Smartphone, RefreshCw,
  LogOut, Send
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  orgId: string | null;
  isSuperAdmin: boolean;
}

type InstanceStatus = "idle" | "connecting" | "qr_pending" | "connected" | "disconnected";

const WhatsAppWebSection = ({ orgId, isSuperAdmin }: Props) => {
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
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadExistingConfig();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const loadExistingConfig = async () => {
    setIsLoadingConfig(true);
    if (!orgId) { setIsLoadingConfig(false); return; }
    const { data } = await supabase
      .from("whatsapp_config")
      .select("*")
      .eq("org_id", orgId)
      .eq("channel_type", "evolution")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setExistingConfig(data);
      setInstanceName(data.evolution_instance_name || "");
      if (data.evolution_instance_status === "connected" && data.is_connected) {
        setInstanceStatus("connected");
      } else if (data.evolution_instance_name) {
        setInstanceStatus("disconnected");
      }
    }
    setIsLoadingConfig(false);
  };

  const createInstance = async () => {
    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("evolution-manage", {
        body: { action: "create" },
      });

      if (error || !data?.success) {
        // If instance already exists on server, show reconnect options
        if (data?.error?.toLowerCase?.()?.includes?.("already")) {
          toast.info("جلسة موجودة مسبقاً — يمكنك إعادة الاتصال أو حذفها");
          setInstanceStatus("disconnected");
          // Try to get instance name from server
          const guessName = `org_${(orgId || "").replace(/-/g, "").slice(0, 12)}`;
          setInstanceName(guessName);
          setIsCreating(false);
          return;
        }
        toast.error(data?.error || "فشل إنشاء الجلسة");
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
        // No QR yet, fetch it
        await fetchQR(data.instance_name);
      }
    } catch {
      toast.error("خطأ في الاتصال بالسيرفر");
    }
    setIsCreating(false);
  };

  const fetchQR = async (name?: string) => {
    const iName = name || instanceName;
    if (!iName) return;

    setInstanceStatus("connecting");
    
    try {
      const { data, error } = await supabase.functions.invoke("evolution-manage", {
        body: { action: "connect", instance_name: iName },
      });

      // If instance doesn't exist on server (deleted/expired), recreate it
      if (!data?.qr_code && !data?.status) {
        console.log("Instance not found, recreating...");
        toast.info("جاري إعادة إنشاء الجلسة...");
        await createInstance();
        return;
      }

      if (data?.qr_code) {
        const qrSrc = data.qr_code.startsWith("data:") ? data.qr_code : `data:image/png;base64,${data.qr_code}`;
        setQrCode(qrSrc);
        setInstanceStatus("qr_pending");
        startPolling(iName);
        return;
      } else if (data?.status === "open") {
        setInstanceStatus("connected");
        setQrCode(null);
        toast.success("✅ الرقم متصل بالفعل");
        loadExistingConfig();
        return;
      }
    } catch {
      // continue
    }

    // If we get here, try creating fresh
    toast.info("جاري إعادة إنشاء الجلسة...");
    await createInstance();
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
          const { data } = await supabase.functions.invoke("evolution-manage", {
            body: { action: "connect", instance_name: name },
          });
          if (data?.status === "open") {
            setInstanceStatus("connected");
            setQrCode(null);
            if (pollRef.current) clearInterval(pollRef.current);
            toast.success("✅ تم ربط الرقم بنجاح!");
            loadExistingConfig();
            return;
          }
          if (data?.qr_code) {
            const qrSrc = data.qr_code.startsWith("data:") ? data.qr_code : `data:image/png;base64,${data.qr_code}`;
            setQrCode(qrSrc);
          }
        } catch { /* ignore */ }
      } else {
        // Check status
        const { data } = await supabase.functions.invoke("evolution-manage", {
          body: { action: "status", instance_name: name },
        });
        if (data?.status === "open") {
          setInstanceStatus("connected");
          setQrCode(null);
          if (pollRef.current) clearInterval(pollRef.current);
          toast.success("✅ تم ربط الرقم بنجاح!");
          loadExistingConfig();
        }
      }
    }, 5000); // every 5 seconds (alternating = QR refresh every 10s)
  };

  const checkStatus = async () => {
    if (!instanceName) return;
    setIsCheckingStatus(true);
    const { data } = await supabase.functions.invoke("evolution-manage", {
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
  };

  const logout = async () => {
    if (!instanceName || !confirm("هل تريد فصل الرقم؟")) return;
    const { data } = await supabase.functions.invoke("evolution-manage", {
      body: { action: "logout", instance_name: instanceName },
    });
    if (data?.success) {
      setInstanceStatus("disconnected");
      setQrCode(null);
      toast.success("تم فصل الرقم");
      loadExistingConfig();
    }
  };

  const deleteInstance = async () => {
    if (!instanceName || !confirm("هل تريد حذف الجلسة نهائياً؟")) return;
    setIsDeleting(true);
    const { data } = await supabase.functions.invoke("evolution-manage", {
      body: { action: "delete", instance_name: instanceName },
    });
    if (data?.success) {
      setInstanceStatus("idle");
      setQrCode(null);
      setInstanceName("");
      setExistingConfig(null);
      toast.success("تم حذف الجلسة");
    }
    setIsDeleting(false);
  };

  const sendTestMessage = async () => {
    if (!testPhone.trim()) { toast.error("أدخل رقم الهاتف"); return; }
    setTestSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("evolution-send", {
        body: { to: testPhone.trim(), message: "✅ تم الربط بنجاح! هذه رسالة اختبار من واتس ديسك (WhatsApp Web)." },
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
              <h2 className="font-semibold text-sm">واتساب ويب</h2>
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
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs"
          onClick={() => setShowSetup(!showSetup)}
        >
          <Smartphone className="w-3.5 h-3.5" />
          {showSetup ? "إخفاء" : instanceStatus === "connected" ? "إدارة" : "ربط رقم"}
        </Button>
      </div>

      {/* Risk Warning */}
      <div className="bg-warning/5 border border-warning/20 rounded-xl p-3.5">
        <div className="flex gap-2.5">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-warning">تحذير — خطر حظر الرقم</p>
            <ul className="text-[11px] text-muted-foreground space-y-0.5 leading-relaxed list-disc list-inside">
              <li>هذه الطريقة <strong>غير رسمية</strong> وتخالف شروط خدمة Meta</li>
              <li>قد يتم <strong>حظر رقمك نهائياً</strong> بدون إنذار مسبق</li>
              <li>لا تدعم قوالب الرسائل أو الإرسال خارج نافذة 24 ساعة</li>
            </ul>
          </div>
        </div>
      </div>

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
                      {existingConfig?.display_phone || instanceName}
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
          {instanceStatus === "qr_pending" && qrCode && (
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

          {/* ═══ CONNECTING STATE ═══ */}
          {instanceStatus === "connecting" && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
              <p className="text-sm font-bold">جاري توليد رمز QR...</p>
              <p className="text-[11px] text-muted-foreground">يتم إعادة إنشاء الجلسة والاتصال بسيرفرات واتساب</p>
            </div>
          )}

          {/* ═══ IDLE / DISCONNECTED STATE ═══ */}
          {(instanceStatus === "idle" || instanceStatus === "disconnected") && !qrCode && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-border">
                <QrCode className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold">ربط رقم عبر QR</h3>
              </div>

              {instanceStatus === "disconnected" && instanceName && (
                <div className="bg-warning/5 border border-warning/20 rounded-lg p-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-warning">الجلسة غير متصلة</p>
                    <p className="text-[10px] text-muted-foreground">اضغط "إعادة الربط" لعرض QR جديد</p>
                  </div>
                </div>
              )}

              <Button
                className="w-full gap-1.5 text-xs py-5 font-bold"
                onClick={instanceName ? () => fetchQR() : createInstance}
                disabled={isCreating}
              >
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                {instanceName ? "إعادة الربط — عرض QR" : "إنشاء جلسة جديدة"}
              </Button>

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
