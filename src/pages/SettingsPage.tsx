import { useState, useEffect } from "react";
import { Building2, Bell, Timer, BellRing, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import BlacklistSection from "@/components/settings/BlacklistSection";
import OutgoingWebhooksSection from "@/components/settings/OutgoingWebhooksSection";
import AuditLogSection from "@/components/settings/AuditLogSection";

const SettingsPage = () => {
  const { orgId, profile } = useAuth();
  const [companyName, setCompanyName] = useState(profile?.full_name || "");
  const [companyPhone, setCompanyPhone] = useState(profile?.phone || "");
  const [autoCloseHours, setAutoCloseHours] = useState("0");

  useEffect(() => {
    if (!orgId) return;
    const loadOrgSettings = async () => {
      const { data } = await supabase.from("organizations").select("settings, name").eq("id", orgId).single();
      if (data) {
        setCompanyName(data.name || "");
        const settings = (data.settings as Record<string, any>) || {};
        setAutoCloseHours(String(settings.auto_close_hours || 0));
      }
    };
    loadOrgSettings();
  }, [orgId]);

  const saveCompanyInfo = async () => {
    if (!orgId) return;
    await supabase.from("organizations").update({ name: companyName }).eq("id", orgId);
    toast.success("تم حفظ البيانات");
  };

  const saveAutoClose = async () => {
    if (!orgId) return;
    const { data: org } = await supabase.from("organizations").select("settings").eq("id", orgId).single();
    const settings = (org?.settings as Record<string, any>) || {};
    await supabase.from("organizations").update({
      settings: { ...settings, auto_close_hours: parseInt(autoCloseHours) || 0 },
    }).eq("id", orgId);
    toast.success("تم حفظ إعدادات الإغلاق التلقائي");
  };

  return (
    <div className="p-3 md:p-6 space-y-5 max-w-[800px] mx-auto" dir="rtl">
      <div>
        <h1 className="text-xl font-bold">الإعدادات العامة</h1>
        <p className="text-sm text-muted-foreground mt-1">بيانات الشركة والإشعارات والأدوات العامة</p>
      </div>

      {/* Company Info */}
      <div className="bg-card rounded-lg shadow-card">
        <div className="p-5 border-b border-border flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">بيانات الشركة</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">اسم الشركة</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="bg-secondary border-0" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">رقم الهاتف</Label>
              <Input value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} className="bg-secondary border-0" dir="ltr" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveCompanyInfo}>حفظ</Button>
          </div>
        </div>
      </div>

      {/* Auto-Close Conversations */}
      <div className="bg-card rounded-lg shadow-card">
        <div className="p-5 border-b border-border flex items-center gap-2">
          <Timer className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">إغلاق المحادثات تلقائياً</h3>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-muted-foreground">إغلاق المحادثات غير النشطة تلقائياً بعد فترة معينة من عدم النشاط</p>
          <div className="flex items-center gap-3">
            <Select value={autoCloseHours} onValueChange={setAutoCloseHours}>
              <SelectTrigger className="w-48 h-9 text-sm bg-secondary border-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">معطّل</SelectItem>
                <SelectItem value="2">ساعتين</SelectItem>
                <SelectItem value="4">4 ساعات</SelectItem>
                <SelectItem value="8">8 ساعات</SelectItem>
                <SelectItem value="12">12 ساعة</SelectItem>
                <SelectItem value="24">24 ساعة</SelectItem>
                <SelectItem value="48">48 ساعة</SelectItem>
                <SelectItem value="72">72 ساعة (3 أيام)</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={saveAutoClose}>حفظ</Button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-card rounded-lg shadow-card">
        <div className="p-5 border-b border-border flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">الإشعارات</h3>
        </div>
        <div className="p-5 space-y-4">
          {[
            { label: "محادثة جديدة", desc: "إشعار عند وصول محادثة جديدة" },
            { label: "محادثة متأخرة", desc: "تنبيه عند تأخر الرد" },
            { label: "تقرير يومي", desc: "ملخص يومي بالبريد" },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Switch defaultChecked={i < 2} />
            </div>
          ))}
        </div>
      </div>

      {/* Blacklist */}
      <div className="bg-card rounded-lg shadow-card p-5">
        <BlacklistSection />
      </div>

      {/* Outgoing Webhooks */}
      <div className="bg-card rounded-lg shadow-card p-5">
        <OutgoingWebhooksSection />
      </div>

      {/* Audit Log */}
      <div className="bg-card rounded-lg shadow-card p-5">
        <AuditLogSection />
      </div>
    </div>
  );
};

export default SettingsPage;