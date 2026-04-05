import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase, cloudSupabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  RefreshCw, Database, AlertTriangle, CheckCircle, XCircle,
  Clock, ExternalLink, Shield, Phone, Save, QrCode, Send
} from "lucide-react";

interface HealthLog {
  checked_at: string;
  db_status: string;
  auth_status: string;
  latency_ms: number;
}

const AdminEmergency = () => {
  const [dbStatus, setDbStatus] = useState<"checking" | "online" | "offline">("checking");
  const [authStatus, setAuthStatus] = useState<"checking" | "online" | "offline">("checking");
  const [latency, setLatency] = useState<number | null>(null);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [alertInstance, setAlertInstance] = useState("");
  const [evolutionChannels, setEvolutionChannels] = useState<{instance: string; phone: string; name: string}[]>([]);
  const [savingPhone, setSavingPhone] = useState(false);
  const [savingInstance, setSavingInstance] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const EXTERNAL_URL = "https://ovbrrumnqfvtgmqsscat.supabase.co";
  const EXTERNAL_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92YnJydW1ucWZ2dGdtcXNzY2F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzc4ODQsImV4cCI6MjA5MDY1Mzg4NH0.-ed8-nrAbfO1lMm9Rc5bjwsIzmonunVKkcwRY586SrQ";
  const CLOUD_URL = import.meta.env.VITE_SUPABASE_URL;
  const CLOUD_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  // Load emergency settings from system_settings
  useEffect(() => {
    Promise.all([
      cloudSupabase.from("system_settings").select("value").eq("key", "emergency_phone").maybeSingle(),
      cloudSupabase.from("system_settings").select("value").eq("key", "alert_evolution_instance").maybeSingle(),
    ]).then(([phoneRes, instanceRes]) => {
      if (phoneRes.data?.value) setEmergencyPhone(String(phoneRes.data.value));
      if (instanceRes.data?.value) setAlertInstance(String(instanceRes.data.value));
    });

    // Load Evolution channels for selection
    supabase.from("whatsapp_config")
      .select("evolution_instance_name, display_phone, business_name")
      .eq("channel_type", "evolution")
      .eq("is_connected", true)
      .then(({ data }) => {
        setEvolutionChannels(
          (data || [])
            .filter((c: any) => c.evolution_instance_name)
            .map((c: any) => ({
              instance: c.evolution_instance_name,
              phone: c.display_phone || "—",
              name: c.business_name || "",
            }))
        );
      });
  }, []);

  const saveSetting = async (key: string, value: string, description: string) => {
    const { data: existing } = await supabase.from("system_settings").select("key").eq("key", key).maybeSingle();
    if (existing) {
      await supabase.from("system_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
    } else {
      await supabase.from("system_settings").insert({ key, value, description });
    }
  };

  const saveEmergencyPhone = async () => {
    setSavingPhone(true);
    await saveSetting("emergency_phone", emergencyPhone, "رقم الطوارئ لتنبيهات تعطل النظام");
    toast.success("تم حفظ رقم الطوارئ");
    setSavingPhone(false);
  };

  const saveAlertInstance = async () => {
    setSavingInstance(true);
    await saveSetting("alert_evolution_instance", alertInstance, "اسم Instance الواتساب لإرسال تنبيهات الطوارئ");
    toast.success("تم حفظ رقم الإرسال");
    setSavingInstance(false);
  };

  const checkExternalDB = async () => {
    setIsChecking(true);
    setDbStatus("checking");
    setAuthStatus("checking");
    const start = Date.now();

    let dbOk = false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${EXTERNAL_URL}/rest/v1/`, {
        signal: controller.signal,
        headers: { apikey: EXTERNAL_KEY, Authorization: `Bearer ${EXTERNAL_KEY}` },
      });
      clearTimeout(timeout);
      dbOk = res.ok || res.status === 401 || res.status === 406;
      setDbStatus(dbOk ? "online" : "offline");
    } catch {
      setDbStatus("offline");
    }

    let authOk = false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${EXTERNAL_URL}/auth/v1/settings`, {
        signal: controller.signal,
        headers: { apikey: EXTERNAL_KEY },
      });
      clearTimeout(timeout);
      authOk = res.ok;
      setAuthStatus(authOk ? "online" : "offline");
    } catch {
      setAuthStatus("offline");
    }

    const ms = Date.now() - start;
    setLatency(ms);
    setLastCheck(new Date());

    const log: HealthLog = {
      checked_at: new Date().toISOString(),
      db_status: dbOk ? "online" : "offline",
      auth_status: authOk ? "online" : "offline",
      latency_ms: ms,
    };
    setHealthLogs(prev => [log, ...prev].slice(0, 50));

    try {
      await fetch(`${CLOUD_URL}/functions/v1/db-health-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${CLOUD_KEY}` },
        body: JSON.stringify({ manual: true }),
      });
    } catch {}

    setIsChecking(false);
  };

  useEffect(() => {
    checkExternalDB();
    const interval = setInterval(() => {
      if (!document.hidden) checkExternalDB();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const statusIcon = (s: string) => {
    if (s === "online") return <CheckCircle className="w-5 h-5 text-green-500" />;
    if (s === "offline") return <XCircle className="w-5 h-5 text-red-500" />;
    return <Clock className="w-5 h-5 text-muted-foreground animate-spin" />;
  };

  const sendTestAlert = async () => {
    setIsTesting(true);
    try {
      const res = await fetch(`${CLOUD_URL}/functions/v1/db-health-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${CLOUD_KEY}` },
        body: JSON.stringify({ test: true }),
      });
      const data = await res.json();
      if (data.alert_sent) {
        toast.success("تم إرسال التنبيه التجريبي بنجاح ✅");
      } else {
        toast.error(`فشل الإرسال: ${data.alert_reason || data.alert_error || "خطأ غير معروف"}`);
      }
    } catch (e: any) {
      toast.error("فشل الاتصال بالخادم");
    }
    setIsTesting(false);
  };

  // Generate QR data for emergency access
  const emergencyUrl = `${window.location.origin}/emergency-admin`;
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(emergencyUrl)}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Shield className="w-4 h-4 text-destructive" /> الطوارئ ومراقبة النظام
        </h2>
        <Button variant="outline" size="sm" onClick={checkExternalDB} disabled={isChecking}>
          <RefreshCw className={`w-4 h-4 ml-2 ${isChecking ? "animate-spin" : ""}`} />
          فحص الآن
        </Button>
      </div>

      {/* Emergency QR + Phone */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <QrCode className="w-4 h-4 text-primary" />
              رمز QR للدخول السريع
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <img src={qrApiUrl} alt="Emergency QR" className="w-40 h-40 rounded-lg border" />
            <p className="text-[10px] text-muted-foreground text-center">
              امسح الرمز من الجوال للوصول للوحة الطوارئ مباشرة
            </p>
            <code className="text-[10px] bg-muted px-2 py-1 rounded select-all break-all" dir="ltr">
              {emergencyUrl}
            </code>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Phone className="w-4 h-4 text-destructive" />
              إعدادات تنبيه الطوارئ
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-[10px] text-muted-foreground">
              سيتم إرسال تنبيه واتساب فوري عند تعطل القاعدة الخارجية
            </p>

            {/* رقم المستقبل */}
            <div className="space-y-1.5">
              <Label className="text-xs">رقم المستقبل</Label>
              <div className="flex gap-2">
                <Input
                  value={emergencyPhone}
                  onChange={e => setEmergencyPhone(e.target.value)}
                  placeholder="966500000000"
                  className="h-9 text-sm font-mono"
                  dir="ltr"
                />
                <Button size="sm" variant="outline" className="h-9" onClick={saveEmergencyPhone} disabled={savingPhone}>
                  <Save className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {/* رقم الإرسال (Instance) */}
            <div className="space-y-1.5">
              <Label className="text-xs">الرقم المرسل منه</Label>
              <div className="flex gap-2">
                <Select value={alertInstance} onValueChange={setAlertInstance}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="اختر رقم الإرسال" />
                  </SelectTrigger>
                  <SelectContent>
                    {evolutionChannels.map(ch => (
                      <SelectItem key={ch.instance} value={ch.instance}>
                        {ch.phone} {ch.name ? `(${ch.name})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="h-9" onClick={saveAlertInstance} disabled={savingInstance}>
                  <Save className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {emergencyPhone && alertInstance ? (
              <div className="space-y-2">
                <div className="bg-primary/5 rounded-lg p-2 text-xs text-primary font-medium flex items-center gap-2">
                  <CheckCircle className="w-3 h-3" />
                  التنبيهات مفعّلة — المستقبل: {emergencyPhone}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-8 text-xs"
                  disabled={isTesting}
                  onClick={sendTestAlert}
                >
                  <Send className={`w-3 h-3 ml-1 ${isTesting ? "animate-pulse" : ""}`} />
                  {isTesting ? "جارٍ الإرسال..." : "إرسال تنبيه تجريبي"}
                </Button>
              </div>
            ) : (
              <div className="bg-yellow-500/10 rounded-lg p-2 text-xs text-yellow-600 font-medium flex items-center gap-2">
                <AlertTriangle className="w-3 h-3" />
                {!emergencyPhone ? "لم يتم تعيين رقم المستقبل" : "لم يتم اختيار رقم الإرسال"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={`border-2 ${dbStatus === "online" ? "border-green-500/30" : dbStatus === "offline" ? "border-red-500/30" : ""}`}>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              <span className="font-medium text-sm">قاعدة البيانات</span>
            </div>
            {statusIcon(dbStatus)}
          </CardContent>
        </Card>
        <Card className={`border-2 ${authStatus === "online" ? "border-green-500/30" : authStatus === "offline" ? "border-red-500/30" : ""}`}>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              <span className="font-medium text-sm">المصادقة</span>
            </div>
            {statusIcon(authStatus)}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <span className="font-medium text-sm">زمن الاستجابة</span>
            <Badge variant={latency && latency > 3000 ? "destructive" : "secondary"}>
              {latency ? `${latency}ms` : "..."}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Offline Alert */}
      {dbStatus === "offline" && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              القاعدة الخارجية متوقفة!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ol className="text-xs space-y-1 list-decimal list-inside text-muted-foreground">
              <li>ادخل على لوحة تحكم Supabase وأعد تشغيل المشروع</li>
              <li>تأكد من أن المشروع ليس في حالة Paused</li>
              <li>إذا كانت المشكلة مستمرة، تواصل مع دعم Supabase</li>
            </ol>
            <Button variant="outline" size="sm" onClick={() => window.open("https://supabase.com/dashboard", "_blank")}>
              <ExternalLink className="w-4 h-4 ml-2" />
              فتح لوحة Supabase
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Health Logs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">سجل الفحوصات</CardTitle>
        </CardHeader>
        <CardContent>
          {healthLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">لا توجد فحوصات بعد</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {healthLogs.map((log, i) => (
                <div key={i} className="flex items-center justify-between text-sm p-2 rounded border">
                  <span className="text-muted-foreground text-xs">
                    {new Date(log.checked_at).toLocaleTimeString("ar-SA")}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{log.latency_ms}ms</span>
                    <Badge variant={log.db_status === "online" ? "secondary" : "destructive"} className="text-xs">
                      DB: {log.db_status === "online" ? "✅" : "❌"}
                    </Badge>
                    <Badge variant={log.auth_status === "online" ? "secondary" : "destructive"} className="text-xs">
                      Auth: {log.auth_status === "online" ? "✅" : "❌"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        {lastCheck ? `آخر فحص: ${lastCheck.toLocaleTimeString("ar-SA")} — يتم الفحص تلقائياً كل 30 ثانية` : "جارٍ الفحص..."}
      </p>
    </div>
  );
};

export default AdminEmergency;
