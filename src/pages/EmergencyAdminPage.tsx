import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, RefreshCw, Database, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import { invokeCloud } from "@/lib/supabase";

interface HealthLog {
  checked_at: string;
  db_status: string;
  auth_status: string;
  latency_ms: number;
}

const EmergencyAdminPage = () => {
  const [dbStatus, setDbStatus] = useState<"checking" | "online" | "offline">("checking");
  const [authStatus, setAuthStatus] = useState<"checking" | "online" | "offline">("checking");
  const [latency, setLatency] = useState<number | null>(null);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const checkHealth = async () => {
    setIsChecking(true);
    setDbStatus("checking");
    setAuthStatus("checking");

    const start = Date.now();

    try {
      const { data, error } = await invokeCloud("db-health-check", {
        body: { manual: true },
      });

      const ms = Date.now() - start;
      setLatency(ms);
      setLastCheck(new Date());

      if (error || !data) {
        setDbStatus("offline");
        setAuthStatus("offline");
      } else {
        setDbStatus(data.db_status === "online" ? "online" : "offline");
        setAuthStatus(data.auth_status === "online" ? "online" : "offline");
      }

      const log: HealthLog = {
        checked_at: new Date().toISOString(),
        db_status: data?.db_status || "offline",
        auth_status: data?.auth_status || "offline",
        latency_ms: ms,
      };
      setHealthLogs(prev => [log, ...prev].slice(0, 50));
    } catch {
      setDbStatus("offline");
      setAuthStatus("offline");
      setLatency(Date.now() - start);
      setLastCheck(new Date());
    }

    setIsChecking(false);
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(() => {
      if (!document.hidden) checkHealth();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const statusIcon = (s: string) => {
    if (s === "online") return <CheckCircle className="w-5 h-5 text-green-500" />;
    if (s === "offline") return <XCircle className="w-5 h-5 text-red-500" />;
    return <Clock className="w-5 h-5 text-muted-foreground animate-spin" />;
  };

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
          <Button variant="outline" size="sm" onClick={checkHealth} disabled={isChecking}>
            <RefreshCw className={`w-4 h-4 ml-2 ${isChecking ? "animate-spin" : ""}`} />
            فحص الآن
          </Button>
        </div>

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
                <li>أعد تشغيل المشروع من لوحة التحكم</li>
                <li>تأكد من أن المشروع ليس في حالة إيقاف مؤقت</li>
                <li>إذا كانت المشكلة مستمرة، تواصل مع الدعم التقني</li>
              </ol>
            </CardContent>
          </Card>
        )}

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
                      {new Date(log.checked_at).toLocaleTimeString("ar-SA-u-ca-gregory")}
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
          {lastCheck ? `آخر فحص: ${lastCheck.toLocaleTimeString("ar-SA-u-ca-gregory")} — يتم الفحص تلقائياً كل دقيقة` : "جارٍ الفحص..."}
        </p>
      </div>
    </div>
  );
};

export default EmergencyAdminPage;
