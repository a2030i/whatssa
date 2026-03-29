import { useState, useEffect } from "react";
import {
  AlertTriangle, CheckCircle2, Loader2, QrCode,
  Server, Trash2, Wifi, Settings, Smartphone
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

interface VpsConfig {
  url: string;
  api_key: string;
}

const SYSTEM_KEY = "whatsapp_web_vps";

const WhatsAppWebSection = ({ orgId, isSuperAdmin }: Props) => {
  const [showSetup, setShowSetup] = useState(false);
  const [vpsConfig, setVpsConfig] = useState<VpsConfig | null>(null);
  const [vpsUrl, setVpsUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  // QR flow for org admin
  const [sessionName, setSessionName] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<"idle" | "connected" | "qr_pending">("idle");
  const [connectedPhone, setConnectedPhone] = useState("");

  useEffect(() => {
    loadVpsConfig();
  }, []);

  const loadVpsConfig = async () => {
    setIsLoadingConfig(true);
    const { data } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", SYSTEM_KEY)
      .maybeSingle();

    if (data?.value) {
      const cfg = data.value as unknown as VpsConfig;
      setVpsConfig(cfg);
      setVpsUrl(cfg.url || "");
      setApiKey(cfg.api_key || "");
    }
    setIsLoadingConfig(false);
  };

  // ── Super Admin: Save VPS config ──
  const saveVpsConfig = async () => {
    if (!vpsUrl.trim()) { toast.error("أدخل رابط السيرفر"); return; }
    setIsSaving(true);

    const value = { url: vpsUrl.trim().replace(/\/$/, ""), api_key: apiKey.trim() };

    const { error } = await supabase
      .from("system_settings")
      .upsert({ key: SYSTEM_KEY, value: value as any, description: "WhatsApp Web VPS server configuration" }, { onConflict: "key" });

    if (error) {
      toast.error("تعذر حفظ الإعدادات");
    } else {
      toast.success("✅ تم حفظ إعدادات السيرفر");
      setVpsConfig(value);
    }
    setIsSaving(false);
  };

  const testConnection = async () => {
    const url = vpsConfig?.url || vpsUrl.trim().replace(/\/$/, "");
    if (!url) { toast.error("لا يوجد سيرفر مضبوط"); return; }
    setIsTesting(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const key = vpsConfig?.api_key || apiKey.trim();
      if (key) headers["x-api-key"] = key;

      const res = await fetch(`${url}/api/health`, { headers, signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        toast.success("✅ السيرفر متصل ويعمل بشكل صحيح");
      } else {
        toast.error(`السيرفر أرجع حالة ${res.status}`);
      }
    } catch {
      toast.error("تعذر الاتصال بالسيرفر — تأكد من الرابط");
    }
    setIsTesting(false);
  };

  // ── Org Admin: Start session & get QR ──
  const startSession = async () => {
    if (!vpsConfig?.url) { toast.error("السيرفر غير مضبوط — تواصل مع مدير المنصة"); return; }
    const name = sessionName.trim() || orgId || "default";
    setIsConnecting(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (vpsConfig.api_key) headers["x-api-key"] = vpsConfig.api_key;

      const res = await fetch(`${vpsConfig.url}/api/sessions/${name}/start`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(30000),
      });

      const data = await res.json();

      if (data.qr) {
        setQrCode(data.qr);
        setSessionStatus("qr_pending");
        toast.success("امسح رمز QR بهاتفك لإتمام الربط");
      } else if (data.status === "connected") {
        toast.success("✅ الجلسة متصلة بالفعل");
        setQrCode(null);
        setSessionStatus("connected");
        setConnectedPhone(data.phone || name);
      } else {
        toast.error(data.error || "فشل في بدء الجلسة");
      }
    } catch {
      toast.error("تعذر الاتصال بالسيرفر");
    }
    setIsConnecting(false);
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
            </div>
            <p className="text-[11px] text-muted-foreground">
              {vpsConfig?.url ? "ربط عبر مسح QR — السيرفر مضبوط" : "ربط عبر مسح QR — السيرفر غير مضبوط"}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs"
          onClick={() => setShowSetup(!showSetup)}
        >
          {isSuperAdmin ? <Settings className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
          {showSetup ? "إخفاء" : isSuperAdmin ? "إعداد السيرفر" : "ربط رقم"}
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
            <p className="text-[10px] text-warning/80 pt-1">
              💡 ننصح باستخدام الربط الرسمي (WhatsApp Business API) للاستقرار والأمان
            </p>
          </div>
        </div>
      </div>

      {showSetup && (
        <div className="bg-card rounded-xl shadow-card border border-border p-4 space-y-4 animate-fade-in">

          {/* ═══ SUPER ADMIN: Server Configuration ═══ */}
          {isSuperAdmin && (
            <>
              <div className="flex items-center gap-2 pb-2 border-b border-border">
                <Server className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold">إعدادات السيرفر المركزي</h3>
                <Badge variant="outline" className="text-[9px] px-1.5 py-0">سوبر أدمن</Badge>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                اضبط سيرفر VPS مركزي واحد. أدمن كل مؤسسة سيمسح QR مباشرة بدون الحاجة لإعداد سيرفر خاص.
              </p>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">رابط السيرفر (VPS URL)</Label>
                  <Input
                    value={vpsUrl}
                    onChange={(e) => setVpsUrl(e.target.value)}
                    placeholder="https://your-vps.example.com"
                    className="bg-secondary border-0 text-xs"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">مفتاح API (اختياري)</Label>
                  <Input
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="api-key-here"
                    className="bg-secondary border-0 text-xs"
                    dir="ltr"
                    type="password"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="gap-1.5 text-xs flex-1"
                  onClick={saveVpsConfig}
                  disabled={isSaving || !vpsUrl}
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5" />}
                  حفظ الإعدادات
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs flex-1"
                  onClick={testConnection}
                  disabled={isTesting || !vpsUrl}
                >
                  {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                  اختبار الاتصال
                </Button>
              </div>

              {vpsConfig?.url && (
                <div className="bg-success/5 border border-success/20 rounded-lg p-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-success">السيرفر مضبوط</p>
                    <p className="text-[10px] text-muted-foreground" dir="ltr">{vpsConfig.url}</p>
                  </div>
                </div>
              )}

              <div className="border-t border-border pt-3" />
            </>
          )}

          {/* ═══ ORG ADMIN: QR Scan ═══ */}
          {!vpsConfig?.url ? (
            <div className="text-center py-6">
              <Server className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-sm text-muted-foreground">السيرفر غير مضبوط بعد</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {isSuperAdmin ? "اضبط إعدادات السيرفر أعلاه أولاً" : "تواصل مع مدير المنصة لإعداد السيرفر"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-border">
                <QrCode className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold">ربط رقم عبر QR</h3>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">اسم الجلسة (اختياري)</Label>
                <Input
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder={orgId || "my-session"}
                  className="bg-secondary border-0 text-xs"
                  dir="ltr"
                />
                <p className="text-[10px] text-muted-foreground">اتركه فارغاً ليُستخدم معرّف مؤسستك</p>
              </div>

              <Button
                className="w-full gap-1.5 text-xs"
                onClick={startSession}
                disabled={isConnecting}
              >
                {isConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
                عرض رمز QR
              </Button>

              {/* QR Code Display */}
              {qrCode && (
                <div className="bg-white rounded-xl p-6 text-center space-y-3 border border-border">
                  <p className="text-sm font-bold text-foreground">امسح رمز QR</p>
                  <p className="text-[11px] text-muted-foreground">افتح واتساب على هاتفك → الأجهزة المرتبطة → ربط جهاز</p>
                  <div className="flex justify-center">
                    <img src={qrCode} alt="QR Code" className="w-48 h-48 rounded-lg" />
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setQrCode(null); setSessionStatus("idle"); }}>
                    إغلاق
                  </Button>
                </div>
              )}

              {/* Connected */}
              {sessionStatus === "connected" && (
                <div className="flex items-center justify-between bg-success/5 border border-success/20 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    <div>
                      <p className="text-xs font-semibold text-success">متصل</p>
                      <p className="text-[10px] text-muted-foreground" dir="ltr">{connectedPhone}</p>
                    </div>
                  </div>
                  <Badge className="bg-success/10 text-success border-0 text-[10px]">نشط</Badge>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WhatsAppWebSection;
