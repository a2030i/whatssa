import { useEffect, useState } from "react";
import { supabase, cloudSupabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Copy, Webhook, Phone, CheckCircle2, XCircle, RefreshCw, Clock, AlertTriangle, ShieldCheck, Server, Wifi, Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";

const WEBHOOK_URL = `https://dgnqehcezvewkdodqpyh.supabase.co/functions/v1/whatsapp-webhook`;

const SYSTEM_KEY = "whatsapp_web_vps";

const AdminMeta = () => {
  const [configs, setConfigs] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  // VPS config state
  const [vpsUrl, setVpsUrl] = useState("");
  const [vpsApiKey, setVpsApiKey] = useState("");
  const [vpsConfigSaved, setVpsConfigSaved] = useState(false);
  const [isSavingVps, setIsSavingVps] = useState(false);
  const [isTestingVps, setIsTestingVps] = useState(false);

  useEffect(() => { load(); loadVpsConfig(); }, []);

  const load = async () => {
    const [c, o] = await Promise.all([
      supabase.from("whatsapp_config_safe").select("*"),
      supabase.from("organizations").select("id, name"),
    ]);
    setConfigs(c.data || []);
    setOrgs(o.data || []);
  };

  const loadVpsConfig = async () => {
    const { data } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", SYSTEM_KEY)
      .maybeSingle();
    if (data?.value) {
      const cfg = data.value as any;
      setVpsUrl(cfg.url || "");
      setVpsApiKey(cfg.api_key || "");
      setVpsConfigSaved(true);
    }
  };

  const saveVpsConfig = async () => {
    if (!vpsUrl.trim()) { toast.error("أدخل رابط السيرفر"); return; }
    setIsSavingVps(true);
    const value = { url: vpsUrl.trim().replace(/\/$/, ""), api_key: vpsApiKey.trim() };
    const { error } = await supabase
      .from("system_settings")
      .upsert({ key: SYSTEM_KEY, value: value as any, description: "WhatsApp Web VPS server configuration" }, { onConflict: "key" });
    if (error) { toast.error("تعذر حفظ الإعدادات"); }
    else { toast.success("✅ تم حفظ إعدادات السيرفر"); setVpsConfigSaved(true); }
    setIsSavingVps(false);
  };

  const testVpsConnection = async () => {
    const url = vpsUrl.trim().replace(/\/$/, "");
    if (!url) { toast.error("لا يوجد رابط سيرفر"); return; }
    setIsTestingVps(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (vpsApiKey.trim()) headers["x-api-key"] = vpsApiKey.trim();
      const res = await fetch(`${url}/api/health`, { headers, signal: AbortSignal.timeout(10000) });
      if (res.ok) toast.success("✅ السيرفر متصل ويعمل");
      else toast.error(`السيرفر أرجع حالة ${res.status}`);
    } catch { toast.error("تعذر الاتصال بالسيرفر"); }
    setIsTestingVps(false);
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`تم نسخ ${label}`);
  };

  const getOrgName = (orgId: string) => orgs.find((o) => o.id === orgId)?.name || "غير محدد";

  const refreshAll = async () => {
    setRefreshingAll(true);
    try {
      const { data, error } = await cloudSupabase.functions.invoke("whatsapp-refresh-token");
      if (error) throw error;
      toast.success(`تم تجديد ${data?.processed || 0} توكن`);
      load();
    } catch (e: any) {
      toast.error(e.message || "فشل التجديد");
    } finally {
      setRefreshingAll(false);
    }
  };

  const getTokenStatus = (config: any) => {
    if (config.token_refresh_error) {
      return { label: "فشل التجديد", color: "bg-destructive/10 text-destructive", icon: AlertTriangle };
    }
    if (!config.token_expires_at) {
      return { label: "غير محدد", color: "bg-muted text-muted-foreground", icon: Clock };
    }
    const daysLeft = Math.ceil((new Date(config.token_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 0) return { label: "منتهي", color: "bg-destructive/10 text-destructive", icon: XCircle };
    if (daysLeft <= 7) return { label: `${daysLeft} أيام`, color: "bg-warning/10 text-warning", icon: AlertTriangle };
    return { label: `${daysLeft} يوم`, color: "bg-green-100 text-green-700", icon: ShieldCheck };
  };

  return (
    <div className="space-y-6">
      {/* Webhook & Domain Info */}
      <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Webhook className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">بيانات Webhook العامة</h3>
        </div>
        <div className="space-y-3">
          {[
            { label: "Webhook URL", value: WEBHOOK_URL },
            { label: "Valid OAuth Redirect URI", value: "https://respondly.chat/settings" },
            { label: "App Domain", value: "respondly.chat" },
            { label: "Privacy Policy URL", value: "https://respondly.chat/privacy" },
          ].map((item) => (
            <div key={item.label}>
              <label className="text-[10px] text-muted-foreground">{item.label}</label>
              <div className="flex items-center gap-2 mt-1">
                <Input value={item.value} readOnly className="bg-secondary border-0 text-[11px] flex-1" dir="ltr" />
                <Button size="sm" variant="outline" className="shrink-0 h-8" onClick={() => copy(item.value, item.label)}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Token Status Overview */}
      <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">حالة التوكنات ({configs.length})</h3>
          </div>
          <Button size="sm" variant="outline" className="text-xs gap-1" onClick={refreshAll} disabled={refreshingAll}>
            <RefreshCw className={`w-3 h-3 ${refreshingAll ? "animate-spin" : ""}`} />
            {refreshingAll ? "جاري التجديد..." : "تجديد الكل"}
          </Button>
        </div>

        {configs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">لا توجد حسابات مربوطة</p>
        ) : (
          <div className="space-y-3">
            {configs.map((config) => {
              const tokenStatus = getTokenStatus(config);
              const TokenIcon = tokenStatus.icon;

              return (
                <div key={config.id} className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {config.is_connected ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive" />
                      )}
                      <span className="text-sm font-semibold">{config.display_phone || "بدون رقم"}</span>
                      <span className="text-[10px] text-muted-foreground">— {getOrgName(config.org_id)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${tokenStatus.color}`}>
                        <TokenIcon className="w-3 h-3" />
                        {tokenStatus.label}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${config.is_connected ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {config.is_connected ? "متصل" : "غير متصل"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                    <div>
                      <span className="text-muted-foreground">Phone Number ID:</span>
                      <span className="mr-1 font-medium font-mono">{config.phone_number_id}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">WABA ID:</span>
                      <span className="mr-1 font-medium font-mono">{config.business_account_id}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">انتهاء التوكن:</span>
                      <span className="mr-1 font-medium">
                        {config.token_expires_at ? new Date(config.token_expires_at).toLocaleDateString("ar-SA") : "غير محدد"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">آخر تجديد:</span>
                      <span className="mr-1 font-medium">
                        {config.token_last_refreshed_at ? new Date(config.token_last_refreshed_at).toLocaleDateString("ar-SA") : "لم يتم"}
                      </span>
                    </div>
                  </div>

                  {config.token_refresh_error && (
                    <div className="bg-destructive/10 rounded-lg px-3 py-2 text-[11px] text-destructive flex items-start gap-2">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>{config.token_refresh_error}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* WhatsApp Web VPS Server Config */}
      <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <QrCode className="w-4 h-4 text-warning" />
          <h3 className="font-semibold text-sm">سيرفر واتساب ويب (QR)</h3>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-warning border-warning/30">غير رسمي</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          اضبط سيرفر VPS مركزي واحد. أدمن كل مؤسسة سيمسح QR مباشرة من صفحة التكامل بدون الحاجة لإعداد سيرفر خاص.
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
              value={vpsApiKey}
              onChange={(e) => setVpsApiKey(e.target.value)}
              placeholder="api-key-here"
              className="bg-secondary border-0 text-xs"
              dir="ltr"
              type="password"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" className="gap-1.5 text-xs flex-1" onClick={saveVpsConfig} disabled={isSavingVps || !vpsUrl}>
            {isSavingVps ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5" />}
            حفظ الإعدادات
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs flex-1" onClick={testVpsConnection} disabled={isTestingVps || !vpsUrl}>
            {isTestingVps ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
            اختبار الاتصال
          </Button>
        </div>

        {vpsConfigSaved && vpsUrl && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
            <div>
              <p className="text-xs font-semibold text-primary">السيرفر مضبوط</p>
              <p className="text-[10px] text-muted-foreground" dir="ltr">{vpsUrl}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminMeta;
