import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Copy, Globe, Webhook, Phone, Building2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

const WEBHOOK_URL = `https://dgnqehcezvewkdodqpyh.supabase.co/functions/v1/whatsapp-webhook`;

const AdminMeta = () => {
  const [configs, setConfigs] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    const [c, o] = await Promise.all([
      supabase.from("whatsapp_config").select("*"),
      supabase.from("organizations").select("id, name"),
    ]);
    setConfigs(c.data || []);
    setOrgs(o.data || []);
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`تم نسخ ${label}`);
  };

  const getOrgName = (orgId: string) => orgs.find((o) => o.id === orgId)?.name || "غير محدد";

  return (
    <div className="space-y-6">
      {/* Webhook & Domain Info */}
      <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Webhook className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">بيانات Webhook العامة</h3>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-muted-foreground">Webhook URL</label>
            <div className="flex items-center gap-2 mt-1">
              <Input value={WEBHOOK_URL} readOnly className="bg-secondary border-0 text-[11px] flex-1" dir="ltr" />
              <Button size="sm" variant="outline" className="shrink-0 h-8" onClick={() => copy(WEBHOOK_URL, "Webhook URL")}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Valid OAuth Redirect URI</label>
            <div className="flex items-center gap-2 mt-1">
              <Input value="https://whatssa.lovable.app/settings" readOnly className="bg-secondary border-0 text-[11px] flex-1" dir="ltr" />
              <Button size="sm" variant="outline" className="shrink-0 h-8" onClick={() => copy("https://whatssa.lovable.app/settings", "Redirect URI")}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">App Domain</label>
            <div className="flex items-center gap-2 mt-1">
              <Input value="whatssa.lovable.app" readOnly className="bg-secondary border-0 text-[11px] flex-1" dir="ltr" />
              <Button size="sm" variant="outline" className="shrink-0 h-8" onClick={() => copy("whatssa.lovable.app", "Domain")}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Privacy Policy URL</label>
            <div className="flex items-center gap-2 mt-1">
              <Input value="https://whatssa.lovable.app/privacy" readOnly className="bg-secondary border-0 text-[11px] flex-1" dir="ltr" />
              <Button size="sm" variant="outline" className="shrink-0 h-8" onClick={() => copy("https://whatssa.lovable.app/privacy", "Privacy URL")}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Connected Accounts */}
      <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">الحسابات المربوطة ({configs.length})</h3>
        </div>

        {configs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">لا توجد حسابات مربوطة بعد</p>
        ) : (
          <div className="space-y-3">
            {configs.map((config) => (
              <div key={config.id} className="border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {config.is_connected ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive" />
                    )}
                    <span className="text-sm font-semibold">{config.display_phone || "بدون رقم"}</span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${config.is_connected ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {config.is_connected ? "متصل" : "غير متصل"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-muted-foreground">المنظمة:</span>
                    <span className="mr-1 font-medium">{getOrgName(config.org_id)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">اسم النشاط:</span>
                    <span className="mr-1 font-medium">{config.business_name || "-"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Phone Number ID:</span>
                    <span className="mr-1 font-medium font-mono">{config.phone_number_id}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">WABA ID:</span>
                    <span className="mr-1 font-medium font-mono">{config.business_account_id}</span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Verify Token</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input value={config.webhook_verify_token} readOnly className="bg-secondary border-0 text-[10px] flex-1 h-7" dir="ltr" />
                    <Button size="sm" variant="outline" className="shrink-0 h-7 w-7 p-0" onClick={() => copy(config.webhook_verify_token, "Verify Token")}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminMeta;
