import { Building2, Bell, Palette, Globe, CreditCard, Shield, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const settingsSections = [
  {
    id: "company",
    icon: Building2,
    title: "بيانات الشركة",
    description: "اسم الشركة والمعلومات الأساسية",
  },
  {
    id: "notifications",
    icon: Bell,
    title: "الإشعارات",
    description: "إعدادات التنبيهات والإشعارات",
  },
  {
    id: "whatsapp",
    icon: Globe,
    title: "WhatsApp API",
    description: "إعدادات الاتصال بـ WhatsApp Business API",
  },
  {
    id: "billing",
    icon: CreditCard,
    title: "الاشتراك والفواتير",
    description: "إدارة خطة الاشتراك والدفع",
  },
  {
    id: "security",
    icon: Shield,
    title: "الأمان",
    description: "كلمة المرور والمصادقة الثنائية",
  },
];

const SettingsPage = () => {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[800px]">
      <div>
        <h1 className="text-xl font-bold">الإعدادات</h1>
        <p className="text-sm text-muted-foreground mt-1">إدارة إعدادات حسابك والنظام</p>
      </div>

      {/* Company Info */}
      <div className="bg-card rounded-lg shadow-card animate-fade-in">
        <div className="p-5 border-b border-border flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">بيانات الشركة</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">اسم الشركة</Label>
              <Input defaultValue="شركة التقنية المتقدمة" className="bg-secondary border-0" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">رقم الهاتف</Label>
              <Input defaultValue="+966 50 123 4567" className="bg-secondary border-0" dir="ltr" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">البريد الإلكتروني</Label>
            <Input defaultValue="info@techco.sa" className="bg-secondary border-0" dir="ltr" />
          </div>
          <div className="flex justify-end">
            <Button size="sm">حفظ التغييرات</Button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-card rounded-lg shadow-card animate-fade-in">
        <div className="p-5 border-b border-border flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">الإشعارات</h3>
        </div>
        <div className="p-5 space-y-4">
          {[
            { label: "محادثة جديدة", desc: "إشعار عند وصول محادثة جديدة" },
            { label: "محادثة متأخرة", desc: "تنبيه عند تأخر الرد على محادثة" },
            { label: "تقرير يومي", desc: "إرسال ملخص يومي بالبريد الإلكتروني" },
            { label: "أعطال النظام", desc: "تنبيهات فورية عند حدوث أخطاء" },
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

      {/* WhatsApp API */}
      <div className="bg-card rounded-lg shadow-card animate-fade-in">
        <div className="p-5 border-b border-border flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">WhatsApp Business API</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">API Token</Label>
            <Input type="password" defaultValue="sk_test_xxxxxxxxxxxxx" className="bg-secondary border-0" dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Webhook URL</Label>
            <Input defaultValue="https://api.example.com/webhook" className="bg-secondary border-0" dir="ltr" readOnly />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-success/10">
            <span className="text-xs font-medium text-success">● متصل بنجاح</span>
            <Button variant="outline" size="sm">إعادة اتصال</Button>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-card rounded-lg shadow-card animate-fade-in">
        {settingsSections.filter(s => ["billing", "security"].includes(s.id)).map((section, i, arr) => (
          <button
            key={section.id}
            className={cn(
              "w-full flex items-center justify-between p-5 hover:bg-secondary/30 transition-colors",
              i < arr.length - 1 && "border-b border-border"
            )}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <section.icon className="w-4 h-4" />
              </div>
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
