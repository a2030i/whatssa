import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Shield, RefreshCw, Database, AlertTriangle, CheckCircle, XCircle, Clock, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const EMERGENCY_PIN = "admin2024"; // Change this to a secure PIN

interface HealthLog {
  checked_at: string;
  db_status: string;
  auth_status: string;
  latency_ms: number;
}

const EmergencyAdminPage = () => {
  const [authenticated, setAuthenticated] = useState(false);
  const [pin, setPin] = useState("");
  const [dbStatus, setDbStatus] = useState<"checking" | "online" | "offline">("checking");
  const [authStatus, setAuthStatus] = useState<"checking" | "online" | "offline">("checking");
  const [latency, setLatency] = useState<number | null>(null);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const EXTERNAL_URL = "https://ovbrrumnqfvtgmqsscat.supabase.co";
  const EXTERNAL_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92YnJydW1ucWZ2dGdtcXNzY2F0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzc4ODQsImV4cCI6MjA5MDY1Mzg4NH0.-ed8-nrAbfO1lMm9Rc5bjwsIzmonunVKkcwRY586SrQ";
  const CLOUD_URL = import.meta.env.VITE_SUPABASE_URL;
  const CLOUD_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const handleLogin = () => {
    if (pin === EMERGENCY_PIN) {
      setAuthenticated(true);
      toast.success("تم الدخول للوحة الطوارئ");
    } else {
      toast.error("رمز الطوارئ غير صحيح");
    }
  };

  const checkExternalDB = async () => {
    setIsChecking(true);
    setDbStatus("checking");
    setAuthStatus("checking");

    const start = Date.now();

    // Check DB
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

    // Check Auth
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

    // Save to health logs
    const log: HealthLog = {
      checked_at: new Date().toISOString(),
      db_status: dbOk ? "online" : "offline",
      auth_status: authOk ? "online" : "offline",
      latency_ms: ms,
    };
    setHealthLogs(prev => [log, ...prev].slice(0, 50));

    // Also log to Lovable Cloud
    try {
      await fetch(`${CLOUD_URL}/functions/v1/db-health-check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CLOUD_KEY}`,
        },
        body: JSON.stringify({ manual: true }),
      });
    } catch {
      // Cloud might also be down, ignore
    }

    setIsChecking(false);
  };

  useEffect(() => {
    if (authenticated) {
      checkExternalDB();
      const interval = setInterval(checkExternalDB, 30000);
      return () => clearInterval(interval);
    }
  }, [authenticated]);

  const statusIcon = (s: string) => {
    if (s === "online") return <CheckCircle className="w-5 h-5 text-green-500" />;
    if (s === "offline") return <XCircle className="w-5 h-5 text-red-500" />;
    return <Clock className="w-5 h-5 text-muted-foreground animate-spin" />;
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <Shield className="w-12 h-12 mx-auto text-red-500 mb-2" />
            <CardTitle>لوحة الطوارئ</CardTitle>
            <p className="text-sm text-muted-foreground">أدخل رمز الطوارئ للدخول</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="password"
              placeholder="رمز الطوارئ"
              value={pin}
              onChange={e => setPin(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              className="text-center text-lg"
            />
            <Button className="w-full" onClick={handleLogin}>
              دخول
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-red-500" />
            <div>
              <h1 className="text-2xl font-bold">لوحة الطوارئ</h1>
              <p className="text-sm text-muted-foreground">مراقبة وإدارة النظام عند تعطل القاعدة الخارجية</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={checkExternalDB} disabled={isChecking}>
            <RefreshCw className={`w-4 h-4 ml-2 ${isChecking ? "animate-spin" : ""}`} />
            فحص الآن
          </Button>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className={`border-2 ${dbStatus === "online" ? "border-green-500/30" : dbStatus === "offline" ? "border-red-500/30" : ""}`}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                <span className="font-medium">قاعدة البيانات</span>
              </div>
              {statusIcon(dbStatus)}
            </CardContent>
          </Card>
          <Card className={`border-2 ${authStatus === "online" ? "border-green-500/30" : authStatus === "offline" ? "border-red-500/30" : ""}`}>
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                <span className="font-medium">المصادقة</span>
              </div>
              {statusIcon(authStatus)}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <span className="font-medium">زمن الاستجابة</span>
              <Badge variant={latency && latency > 3000 ? "destructive" : "secondary"}>
                {latency ? `${latency}ms` : "..."}
              </Badge>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        {dbStatus === "offline" && (
          <Card className="border-red-500/30 bg-red-500/5">
            <CardHeader>
              <CardTitle className="text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                القاعدة الخارجية متوقفة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">الإجراءات المطلوبة:</p>
              <ol className="text-sm space-y-2 list-decimal list-inside">
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
          <CardHeader>
            <CardTitle className="text-lg">سجل الفحوصات</CardTitle>
          </CardHeader>
          <CardContent>
            {healthLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">لا توجد فحوصات بعد</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {healthLogs.map((log, i) => (
                  <div key={i} className="flex items-center justify-between text-sm p-2 rounded border">
                    <span className="text-muted-foreground">
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
    </div>
  );
};

export default EmergencyAdminPage;
