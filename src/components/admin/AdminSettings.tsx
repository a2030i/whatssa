import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Settings, Save, AlertTriangle } from "lucide-react";

const AdminSettings = () => {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setIsLoading(true);
    const { data } = await supabase.from("system_settings").select("*");
    const map: Record<string, any> = {};
    (data || []).forEach((s) => { map[s.key] = { value: s.value, description: s.description }; });
    setSettings(map);
    setIsLoading(false);
  };

  const updateSetting = async (key: string, value: any) => {
    const { error } = await supabase.from("system_settings").update({
      value: JSON.parse(JSON.stringify(value)),
      updated_at: new Date().toISOString(),
    }).eq("key", key);
    if (error) toast.error("فشل الحفظ"); else { toast.success("تم الحفظ"); load(); }
  };

  const maintenanceMode = settings.maintenance_mode?.value === true || settings.maintenance_mode?.value === "true";

  return (
    <div className="space-y-6">
      <h2 className="font-semibold text-sm flex items-center gap-2"><Settings className="w-4 h-4 text-primary" /> إعدادات النظام</h2>

      {/* Maintenance Mode */}
      <div className="bg-card rounded-xl shadow-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className={`w-5 h-5 ${maintenanceMode ? "text-destructive" : "text-muted-foreground"}`} />
            <div>
              <p className="text-sm font-semibold">وضع الصيانة</p>
              <p className="text-[10px] text-muted-foreground">تعطيل وصول العملاء للمنصة مؤقتاً</p>
            </div>
          </div>
          <Switch checked={maintenanceMode} onCheckedChange={(v) => updateSetting("maintenance_mode", v)} />
        </div>
        {maintenanceMode && (
          <div className="mt-3 bg-destructive/10 rounded-lg p-3 text-xs text-destructive font-medium">
            ⚠️ وضع الصيانة مفعّل — العملاء لا يمكنهم الوصول للمنصة
          </div>
        )}
      </div>

      {/* General Settings */}
      <div className="bg-card rounded-xl shadow-card p-4 space-y-4">
        <p className="text-sm font-semibold">إعدادات عامة</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">اسم المنصة</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={typeof settings.platform_name?.value === "string" ? settings.platform_name.value : "واتس ديسك"}
                onChange={(e) => setSettings({ ...settings, platform_name: { ...settings.platform_name, value: e.target.value } })}
                className="h-9 text-sm"
              />
              <Button size="sm" variant="outline" className="h-9" onClick={() => updateSetting("platform_name", settings.platform_name?.value)}>
                <Save className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">أيام الفترة التجريبية</Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="number"
                value={settings.default_trial_days?.value || 14}
                onChange={(e) => setSettings({ ...settings, default_trial_days: { ...settings.default_trial_days, value: +e.target.value } })}
                className="h-9 text-sm"
              />
              <Button size="sm" variant="outline" className="h-9" onClick={() => updateSetting("default_trial_days", settings.default_trial_days?.value)}>
                <Save className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">حد حجم الملف (MB)</Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="number"
                value={settings.max_file_upload_mb?.value || 25}
                onChange={(e) => setSettings({ ...settings, max_file_upload_mb: { ...settings.max_file_upload_mb, value: +e.target.value } })}
                className="h-9 text-sm"
              />
              <Button size="sm" variant="outline" className="h-9" onClick={() => updateSetting("max_file_upload_mb", settings.max_file_upload_mb?.value)}>
                <Save className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">حد الرسائل في الدقيقة</Label>
            <div className="flex gap-2 mt-1">
              <Input
                type="number"
                value={settings.message_rate_limit?.value || 100}
                onChange={(e) => setSettings({ ...settings, message_rate_limit: { ...settings.message_rate_limit, value: +e.target.value } })}
                className="h-9 text-sm"
              />
              <Button size="sm" variant="outline" className="h-9" onClick={() => updateSetting("message_rate_limit", settings.message_rate_limit?.value)}>
                <Save className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;