import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { invokeCloud } from "@/lib/supabase";
import { toast } from "sonner";
import { Download, Database, Loader2, Calendar, Shield } from "lucide-react";

const BackupManager = () => {
  const { orgId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  const handleBackup = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const { data, error } = await invokeCloud("export-backup", {});

      if (error) throw error;

      // Create downloadable file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setLastBackup(new Date().toLocaleString("ar-SA"));
      toast.success("تم تحميل النسخة الاحتياطية بنجاح");
    } catch (err: any) {
      toast.error("فشل إنشاء النسخة الاحتياطية: " + (err.message || "خطأ غير معروف"));
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" />
          النسخ الاحتياطي
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          قم بتصدير نسخة احتياطية كاملة من بياناتك تشمل المحادثات والعملاء والحملات وقواعد الأتمتة.
        </p>

        <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-xl">
          <Shield className="w-5 h-5 text-primary shrink-0" />
          <div className="text-xs">
            <p className="font-medium">بياناتك محمية</p>
            <p className="text-muted-foreground">يتم تشفير النسخة الاحتياطية وتحتوي على بيانات منظمتك فقط</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            {lastBackup && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                <span>آخر نسخة: {lastBackup}</span>
              </div>
            )}
          </div>
          <Button onClick={handleBackup} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            تحميل نسخة احتياطية
          </Button>
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-[10px] text-muted-foreground">
            💡 ننصح بإنشاء نسخة احتياطية بشكل دوري (أسبوعياً على الأقل) لضمان حماية بياناتك
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default BackupManager;

