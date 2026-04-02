import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Settings, Save, AlertTriangle, CreditCard, Eye, EyeOff } from "lucide-react";

const AdminSettings = () => {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showSecretKey, setShowSecretKey] = useState(false);

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
    const { data: existing } = await supabase.from("system_settings").select("key").eq("key", key).maybeSingle();
    if (existing) {
      const { error } = await supabase.from("system_settings").update({
        value: JSON.parse(JSON.stringify(value)),
        updated_at: new Date().toISOString(),
      }).eq("key", key);
      if (error) toast.error("فشل الحفظ"); else { toast.success("تم الحفظ"); load(); }
    } else {
      const { error } = await supabase.from("system_settings").insert({
        key,
        value: JSON.parse(JSON.stringify(value)),
        description: key,
      });
      if (error) toast.error("فشل الحفظ"); else { toast.success("تم الحفظ"); load(); }
    }
  };

  const maintenanceMode = settings.maintenance_mode?.value === true || settings.maintenance_mode?.value === "true";

  const getVal = (key: string, fallback: any = "") => {
    const v = settings[key]?.value;
    return typeof v === "string" ? v : (v !== undefined && v !== null ? String(v) : fallback);
  };

  const setVal = (key: string, value: any) => {
    setSettings({ ...settings, [key]: { ...settings[key], value } });
  };

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

      {/* Moyasar Payment Settings */}
      <div className="bg-card rounded-xl shadow-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold">إعدادات بوابة الدفع (ميسّر)</p>
        </div>
        <p className="text-[10px] text-muted-foreground -mt-2">
          أدخل مفاتيح API من لوحة تحكم Moyasar — <a href="https://dashboard.moyasar.com" target="_blank" rel="noreferrer" className="text-primary underline">dashboard.moyasar.com</a>
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Publishable Key</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={getVal("moyasar_publishable_key")}
                onChange={(e) => setVal("moyasar_publishable_key", e.target.value)}
                placeholder="pk_live_..."
                className="h-9 text-sm font-mono"
                dir="ltr"
              />
              <Button size="sm" variant="outline" className="h-9" onClick={() => updateSetting("moyasar_publishable_key", getVal("moyasar_publishable_key"))}>
                <Save className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Secret Key</Label>
            <div className="flex gap-2 mt-1">
              <div className="relative flex-1">
                <Input
                  type={showSecretKey ? "text" : "password"}
                  value={getVal("moyasar_secret_key")}
                  onChange={(e) => setVal("moyasar_secret_key", e.target.value)}
                  placeholder="sk_live_..."
                  className="h-9 text-sm font-mono pl-9"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowSecretKey(!showSecretKey)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecretKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <Button size="sm" variant="outline" className="h-9" onClick={() => updateSetting("moyasar_secret_key", getVal("moyasar_secret_key"))}>
                <Save className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
        {getVal("moyasar_publishable_key") && getVal("moyasar_secret_key") && (
          <div className="bg-primary/5 rounded-lg p-3 text-xs text-primary font-medium flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            بوابة الدفع مُفعّلة وجاهزة لاستقبال المدفوعات
          </div>
        )}
        {(!getVal("moyasar_publishable_key") || !getVal("moyasar_secret_key")) && (
          <div className="bg-yellow-500/10 rounded-lg p-3 text-xs text-yellow-600 font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            بوابة الدفع غير مكتملة — أدخل المفتاحين لتفعيل الدفع الإلكتروني
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
                value={getVal("platform_name", "Respondly")}
                onChange={(e) => setVal("platform_name", e.target.value)}
                className="h-9 text-sm"
              />
              <Button size="sm" variant="outline" className="h-9" onClick={() => updateSetting("platform_name", getVal("platform_name", "Respondly"))}>
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
                onChange={(e) => setVal("default_trial_days", +e.target.value)}
                className="h-9 text-sm"
              />
              <Button size="sm" variant="outline" className="h-9" onClick={() => updateSetting("default_trial_days", settings.default_trial_days?.value || 14)}>
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
                onChange={(e) => setVal("max_file_upload_mb", +e.target.value)}
                className="h-9 text-sm"
              />
              <Button size="sm" variant="outline" className="h-9" onClick={() => updateSetting("max_file_upload_mb", settings.max_file_upload_mb?.value || 25)}>
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
