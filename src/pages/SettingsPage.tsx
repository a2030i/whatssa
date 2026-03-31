import { useState, useEffect } from "react";
import { Building2, Bell, CreditCard, Shield, ChevronLeft, BellRing, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import usePushNotifications from "@/hooks/usePushNotifications";

const PushNotificationSettings = () => {
  const { isSupported, isSubscribed, subscribe, unsubscribe } = usePushNotifications();

  if (!isSupported) return null;

  return (
    <div className="bg-card rounded-lg shadow-card">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BellRing className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">إشعارات المتصفح</h3>
        </div>
        <Switch checked={isSubscribed} onCheckedChange={(v) => v ? subscribe() : unsubscribe()} />
      </div>
      <div className="p-5">
        <p className="text-xs text-muted-foreground">
          {isSubscribed
            ? "✅ الإشعارات مفعلة — ستصلك تنبيهات عند وصول رسائل جديدة حتى لو كانت الصفحة مغلقة"
            : "فعّل الإشعارات لتلقي تنبيهات فورية عند وصول رسائل جديدة من العملاء"}
        </p>
      </div>
    </div>
  );
};

const SettingsPage = () => {
  const { orgId, profile } = useAuth();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState(profile?.full_name || "");
  const [companyPhone, setCompanyPhone] = useState(profile?.phone || "");

  const saveCompanyInfo = async () => {
    if (!orgId) return;
    await supabase.from("organizations").update({ name: companyName }).eq("id", orgId);
    toast.success("تم حفظ البيانات");
  };

  return (
    <div className="p-3 md:p-6 space-y-5 max-w-[800px]" dir="rtl">
      <div>
        <h1 className="text-xl font-bold">الإعدادات العامة</h1>
        <p className="text-sm text-muted-foreground mt-1">بيانات الشركة والإشعارات والأمان</p>
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

      {/* Push Notifications */}
      <PushNotificationSettings />

      {/* Quick Links */}
      <div className="bg-card rounded-lg shadow-card">
        {[
          { id: "integrations", icon: CreditCard, title: "الربط والتكامل", description: "إدارة قنوات التواصل وأرقام واتساب", onClick: () => navigate("/integrations") },
          { id: "billing", icon: CreditCard, title: "الاشتراك والفواتير", description: "إدارة الاشتراك والدفع", onClick: () => navigate("/wallet") },
          { id: "security", icon: Shield, title: "الأمان", description: "كلمة المرور والمصادقة", onClick: () => {} },
        ].map((section, i, arr) => (
          <button key={section.id} onClick={section.onClick} className={cn("w-full flex items-center justify-between p-5 hover:bg-secondary/30 transition-colors", i < arr.length - 1 && "border-b border-border")}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><section.icon className="w-4 h-4" /></div>
              <div className="text-right">
                <p className="text-sm font-medium">{section.title}</p>
                <p className="text-xs text-muted-foreground">{section.description}</p>
              </div>
            </div>
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default SettingsPage;
