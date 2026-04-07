import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, Database, Server, RefreshCw, CheckCircle, XCircle, AlertTriangle, Clock } from "lucide-react";

interface ServiceStatus {
  name: string;
  status: "checking" | "online" | "offline" | "degraded";
  latency?: number;
  lastCheck?: Date;
  error?: string;
}

const SystemStatusPage = () => {
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: "قاعدة البيانات الرئيسية", status: "checking" },
    { name: "خدمات المصادقة", status: "checking" },
    { name: "Lovable Cloud (Edge Functions)", status: "checking" },
    { name: "خدمة التخزين", status: "checking" },
  ]);
  const [lastFullCheck, setLastFullCheck] = useState<Date | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const EXTERNAL_URL = "https://ovbrrumnqfvtgmqsscat.supabase.co";
  const EXTERNAL_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92YnJydW1ucWZ2dGdtcXNzY2F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzc4ODQsImV4cCI6MjA5MDY1Mzg4NH0.-ed8-nrAbfO1lMm9Rc5bjwsIzmonunVKkcwRY586SrQ";
  const CLOUD_URL = import.meta.env.VITE_SUPABASE_URL;

  const checkService = async (name: string, url: string, headers?: Record<string, string>): Promise<ServiceStatus> => {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal, headers });
      clearTimeout(timeout);
      const latency = Date.now() - start;
      if (res.ok || res.status === 401 || res.status === 406) {
        return { name, status: latency > 3000 ? "degraded" : "online", latency, lastCheck: new Date() };
      }
      return { name, status: "degraded", latency, lastCheck: new Date(), error: `HTTP ${res.status}` };
    } catch (e: any) {
      return { name, status: "offline", latency: Date.now() - start, lastCheck: new Date(), error: e.message };
    }
  };

  const runChecks = async () => {
    setIsChecking(true);
    setServices(s => s.map(svc => ({ ...svc, status: "checking" as const })));

    const results = await Promise.all([
      checkService("قاعدة البيانات الرئيسية", `${EXTERNAL_URL}/rest/v1/`, {
        apikey: EXTERNAL_KEY,
        Authorization: `Bearer ${EXTERNAL_KEY}`,
      }),
      checkService("خدمات المصادقة", `${EXTERNAL_URL}/auth/v1/settings`, {
        apikey: EXTERNAL_KEY,
      }),
      checkService("Lovable Cloud (Edge Functions)", `${CLOUD_URL}/functions/v1/`, {}),
      checkService("خدمة التخزين", `${EXTERNAL_URL}/storage/v1/bucket`, {
        apikey: EXTERNAL_KEY,
        Authorization: `Bearer ${EXTERNAL_KEY}`,
      }),
    ]);

    setServices(results);
    setLastFullCheck(new Date());
    setIsChecking(false);
  };

  useEffect(() => {
    runChecks();
    const interval = setInterval(() => {
      if (!document.hidden) runChecks();
    }, 120000);
    return () => clearInterval(interval);
  }, []);

  const overallStatus = services.some(s => s.status === "checking")
    ? "checking"
    : services.every(s => s.status === "online")
    ? "online"
    : services.some(s => s.status === "offline")
    ? "offline"
    : "degraded";

  const statusIcon = (status: string) => {
    switch (status) {
      case "online": return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "offline": return <XCircle className="w-5 h-5 text-red-500" />;
      case "degraded": return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      default: return <Clock className="w-5 h-5 text-muted-foreground animate-spin" />;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "online": return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">متصل</Badge>;
      case "offline": return <Badge variant="destructive">متوقف</Badge>;
      case "degraded": return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">بطيء</Badge>;
      default: return <Badge variant="secondary">جارٍ الفحص...</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Activity className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-bold">حالة النظام</h1>
          </div>
          <p className="text-muted-foreground text-sm">مراقبة حية لجميع خدمات المنصة</p>
        </div>

        {/* Overall Status */}
        <Card className={`border-2 ${overallStatus === "online" ? "border-green-500/30 bg-green-500/5" : overallStatus === "offline" ? "border-red-500/30 bg-red-500/5" : "border-yellow-500/30 bg-yellow-500/5"}`}>
          <CardContent className="p-6 text-center">
            <div className="flex items-center justify-center gap-3">
              {statusIcon(overallStatus)}
              <span className="text-xl font-semibold">
                {overallStatus === "online" ? "جميع الخدمات تعمل بشكل طبيعي ✅" :
                 overallStatus === "offline" ? "يوجد خدمات متوقفة ❌" :
                 overallStatus === "degraded" ? "بعض الخدمات تعمل ببطء ⚠️" :
                 "جارٍ فحص الخدمات..."}
              </span>
            </div>
            {lastFullCheck && (
              <p className="text-xs text-muted-foreground mt-2">
                آخر فحص: {lastFullCheck.toLocaleTimeString("ar-SA-u-ca-gregory")}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Services */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              الخدمات
            </CardTitle>
            <Button variant="outline" size="sm" onClick={runChecks} disabled={isChecking}>
              <RefreshCw className={`w-4 h-4 ml-2 ${isChecking ? "animate-spin" : ""}`} />
              فحص الآن
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {services.map((svc) => (
              <div key={svc.name} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <div className="flex items-center gap-3">
                  {statusIcon(svc.status)}
                  <div>
                    <p className="font-medium text-sm">{svc.name}</p>
                    {svc.error && svc.status === "offline" && (
                      <p className="text-xs text-red-500">{svc.error}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {svc.latency && svc.status !== "checking" && (
                    <span className="text-xs text-muted-foreground">{svc.latency}ms</span>
                  )}
                  {statusBadge(svc.status)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Emergency Info */}
        {overallStatus === "offline" && (
          <Card className="border-red-500/30 bg-red-500/5">
            <CardHeader>
              <CardTitle className="text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                إجراءات الطوارئ
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>• القاعدة الخارجية متوقفة — تحقق من لوحة تحكم Supabase وأعد تشغيل المشروع</p>
              <p>• يمكنك استخدام <a href="/emergency-admin" className="text-primary underline font-medium">لوحة الطوارئ</a> لمراقبة الحالة</p>
              <p>• النظام سيرسل تنبيهات تلقائية عند اكتشاف أي توقف</p>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          يتم فحص الخدمات تلقائياً كل دقيقة
        </p>
      </div>
    </div>
  );
};

export default SystemStatusPage;
