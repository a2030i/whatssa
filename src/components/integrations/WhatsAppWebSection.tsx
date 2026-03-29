import { useState } from "react";
import {
  AlertTriangle, CheckCircle2, Globe, Loader2, QrCode,
  Server, Shield, Trash2, Wifi, WifiOff
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface WhatsAppWebConfig {
  id: string;
  vps_url: string;
  phone_number: string;
  status: "connected" | "disconnected" | "qr_pending";
  session_name: string;
}

interface Props {
  orgId: string | null;
}

const WhatsAppWebSection = ({ orgId }: Props) => {
  const [showSetup, setShowSetup] = useState(false);
  const [vpsUrl, setVpsUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [sessions, setSessions] = useState<WhatsAppWebConfig[]>([]);
  const [isTesting, setIsTesting] = useState(false);

  const testConnection = async () => {
    if (!vpsUrl.trim()) { toast.error("أدخل رابط السيرفر"); return; }
    setIsTesting(true);
    try {
      const url = vpsUrl.replace(/\/$/, "");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey.trim()) headers["x-api-key"] = apiKey.trim();

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

  const startSession = async () => {
    if (!vpsUrl.trim() || !sessionName.trim()) {
      toast.error("أدخل رابط السيرفر واسم الجلسة");
      return;
    }
    setIsConnecting(true);
    try {
      const url = vpsUrl.replace(/\/$/, "");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey.trim()) headers["x-api-key"] = apiKey.trim();

      const res = await fetch(`${url}/api/sessions/${sessionName.trim()}/start`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(30000),
      });

      const data = await res.json();

      if (data.qr) {
        setQrCode(data.qr);
        toast.success("امسح رمز QR بهاتفك لإتمام الربط");
      } else if (data.status === "connected") {
        toast.success("✅ الجلسة متصلة بالفعل");
        setQrCode(null);
        setSessions(prev => [...prev, {
          id: sessionName,
          vps_url: url,
          phone_number: data.phone || sessionName,
          status: "connected",
          session_name: sessionName,
        }]);
      } else {
        toast.error(data.error || "فشل في بدء الجلسة");
      }
    } catch {
      toast.error("تعذر الاتصال بالسيرفر");
    }
    setIsConnecting(false);
  };

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
            <p className="text-[11px] text-muted-foreground">ربط عبر مسح QR — يتطلب سيرفر خارجي (VPS)</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs"
          onClick={() => setShowSetup(!showSetup)}
        >
          <Server className="w-3.5 h-3.5" />
          {showSetup ? "إخفاء" : "إعداد"}
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
              <li>تحتاج سيرفر VPS يعمل 24/7 لاستمرار الاتصال</li>
            </ul>
            <p className="text-[10px] text-warning/80 pt-1">
              💡 ننصح باستخدام الربط الرسمي (WhatsApp Business API) للاستقرار والأمان
            </p>
          </div>
        </div>
      </div>

      {/* Setup Form */}
      {showSetup && (
        <div className="bg-card rounded-xl shadow-card border border-border p-4 space-y-4 animate-fade-in">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <Server className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold">إعدادات سيرفر WhatsApp Web</h3>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            تحتاج سيرفر VPS يشغّل خدمة مثل{" "}
            <a href="https://github.com/nicnocquee/whatsapp-web-api" target="_blank" rel="noopener" className="text-primary underline underline-offset-2">
              whatsapp-web-api
            </a>{" "}
            أو{" "}
            <a href="https://github.com/AkashSkyworlds/Whatsapp-Web" target="_blank" rel="noopener" className="text-primary underline underline-offset-2">
              Baileys REST API
            </a>
            . أدخل رابط السيرفر أدناه.
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

            <div className="space-y-1.5">
              <Label className="text-xs">اسم الجلسة</Label>
              <Input
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="my-session"
                className="bg-secondary border-0 text-xs"
                dir="ltr"
              />
            </div>
          </div>

          <div className="flex gap-2">
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
            <Button
              size="sm"
              className="gap-1.5 text-xs flex-1"
              onClick={startSession}
              disabled={isConnecting || !vpsUrl || !sessionName}
            >
              {isConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
              بدء الجلسة
            </Button>
          </div>

          {/* QR Code Display */}
          {qrCode && (
            <div className="bg-white rounded-xl p-6 text-center space-y-3 border border-border">
              <p className="text-sm font-bold text-foreground">امسح رمز QR</p>
              <p className="text-[11px] text-muted-foreground">افتح واتساب على هاتفك → الأجهزة المرتبطة → ربط جهاز</p>
              <div className="flex justify-center">
                <img src={qrCode} alt="QR Code" className="w-48 h-48 rounded-lg" />
              </div>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setQrCode(null)}>
                إغلاق
              </Button>
            </div>
          )}

          {/* Connected Sessions */}
          {sessions.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground">الجلسات النشطة</p>
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between bg-secondary/50 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-success" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">{s.session_name}</p>
                      <p className="text-[10px] text-muted-foreground" dir="ltr">{s.phone_number}</p>
                    </div>
                  </div>
                  <Badge className="bg-success/10 text-success border-0 text-[10px]">متصل</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WhatsAppWebSection;
