import { useState, useEffect } from "react";
import { Building2, Bell, Globe, CreditCard, Shield, ChevronLeft, CheckCircle2, Copy, ExternalLink, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const WEBHOOK_URL = `https://dgnqehcezvewkdodqpyh.supabase.co/functions/v1/whatsapp-webhook`;

const SettingsPage = () => {
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [webhookVerifyToken, setWebhookVerifyToken] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    const { data } = await supabase
      .from("whatsapp_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (data) {
      setConfigId(data.id);
      setPhoneNumberId(data.phone_number_id);
      setBusinessAccountId(data.business_account_id);
      setAccessToken(data.access_token);
      setWebhookVerifyToken(data.webhook_verify_token);
      setIsConnected(data.is_connected || false);
    }
  };

  const handleSave = async () => {
    if (!phoneNumberId || !businessAccountId || !accessToken) {
      toast.error("يرجى ملء جميع الحقول المطلوبة");
      return;
    }
    setIsSaving(true);
    try {
      if (configId) {
        await supabase.from("whatsapp_config").update({
          phone_number_id: phoneNumberId,
          business_account_id: businessAccountId,
          access_token: accessToken,
        }).eq("id", configId);
      } else {
        const { data } = await supabase.from("whatsapp_config").insert({
          phone_number_id: phoneNumberId,
          business_account_id: businessAccountId,
          access_token: accessToken,
        }).select().single();
        if (data) {
          setConfigId(data.id);
          setWebhookVerifyToken(data.webhook_verify_token);
        }
      }
      toast.success("تم حفظ الإعدادات بنجاح");
    } catch (e) {
      toast.error("حدث خطأ أثناء الحفظ");
    }
    setIsSaving(false);
  };

  const handleTestConnection = async () => {
    if (!phoneNumberId || !accessToken) {
      toast.error("يرجى حفظ الإعدادات أولاً");
      return;
    }
    setIsTesting(true);
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setIsConnected(true);
        if (configId) {
          await supabase.from("whatsapp_config").update({
            is_connected: true,
            display_phone: data.display_phone_number || null,
            business_name: data.verified_name || null,
          }).eq("id", configId);
        }
        toast.success(`✅ متصل بنجاح! الرقم: ${data.display_phone_number || phoneNumberId}`);
      } else {
        setIsConnected(false);
        if (configId) {
          await supabase.from("whatsapp_config").update({ is_connected: false }).eq("id", configId);
        }
        toast.error(`فشل الاتصال: ${data.error?.message || "تحقق من البيانات"}`);
      }
    } catch {
      toast.error("فشل الاتصال - تحقق من الإنترنت والبيانات");
    }
    setIsTesting(false);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`تم نسخ ${label}`);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[800px]" dir="rtl">
      <div>
        <h1 className="text-xl font-bold">الإعدادات</h1>
        <p className="text-sm text-muted-foreground mt-1">إدارة إعدادات حسابك والنظام</p>
      </div>

      {/* WhatsApp API - Main Section */}
      <div className="bg-card rounded-lg shadow-card">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">ربط WhatsApp Business API</h3>
          </div>
          {isConnected ? (
            <Badge className="bg-success/10 text-success border-0 text-xs gap-1">
              <CheckCircle2 className="w-3 h-3" /> متصل
            </Badge>
          ) : (
            <Badge className="bg-warning/10 text-warning border-0 text-xs gap-1">
              <AlertCircle className="w-3 h-3" /> غير متصل
            </Badge>
          )}
        </div>

        {/* Steps Guide */}
        <div className="p-5 space-y-5">
          <div className="bg-secondary/50 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-sm">📋 خطوات الربط (مرة وحدة بس)</h4>
            <ol className="text-xs text-muted-foreground space-y-2 pr-4 list-decimal">
              <li>
                ادخل على{" "}
                <a href="https://business.facebook.com" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-0.5">
                  Meta Business Suite <ExternalLink className="w-3 h-3" />
                </a>{" "}
                وسجّل حسابك التجاري
              </li>
              <li>
                ادخل على{" "}
                <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-0.5">
                  Meta Developers <ExternalLink className="w-3 h-3" />
                </a>{" "}
                → أنشئ تطبيق جديد → اختر "Business" → أضف منتج "WhatsApp"
              </li>
              <li>من لوحة WhatsApp في التطبيق، انسخ <strong>Phone Number ID</strong> و <strong>Business Account ID</strong></li>
              <li>من Settings → أنشئ <strong>Permanent Access Token</strong> بصلاحيات whatsapp_business_messaging</li>
              <li>الصق البيانات هنا واضغط "حفظ" ثم "اختبار الاتصال"</li>
              <li>
                أخيراً، في لوحة Meta أضف الـ Webhook URL و Verify Token (موجودين بالأسفل)
              </li>
            </ol>
          </div>

          {/* Config Fields */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Phone Number ID *</Label>
                <Input
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  placeholder="مثال: 123456789012345"
                  className="bg-secondary border-0 text-sm"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Business Account ID *</Label>
                <Input
                  value={businessAccountId}
                  onChange={(e) => setBusinessAccountId(e.target.value)}
                  placeholder="مثال: 987654321098765"
                  className="bg-secondary border-0 text-sm"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Access Token *</Label>
              <Input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="EAAxxxxxxxxxxxxx..."
                className="bg-secondary border-0 text-sm"
                dir="ltr"
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={isSaving} className="gap-1.5 flex-1 sm:flex-none">
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                حفظ الإعدادات
              </Button>
              <Button variant="outline" onClick={handleTestConnection} disabled={isTesting} className="gap-1.5 flex-1 sm:flex-none">
                {isTesting && <Loader2 className="w-4 h-4 animate-spin" />}
                اختبار الاتصال
              </Button>
            </div>
          </div>

          {/* Webhook Info */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-xs text-muted-foreground">بيانات الـ Webhook (انسخها وحطها في لوحة Meta)</h4>

            <div className="space-y-2">
              <Label className="text-[10px] text-muted-foreground">Webhook URL</Label>
              <div className="flex items-center gap-2">
                <Input value={WEBHOOK_URL} readOnly className="bg-secondary border-0 text-xs flex-1" dir="ltr" />
                <Button size="sm" variant="outline" className="shrink-0 h-9" onClick={() => copyToClipboard(WEBHOOK_URL, "Webhook URL")}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] text-muted-foreground">Verify Token</Label>
              <div className="flex items-center gap-2">
                <Input value={webhookVerifyToken || "احفظ الإعدادات أولاً"} readOnly className="bg-secondary border-0 text-xs flex-1" dir="ltr" />
                {webhookVerifyToken && (
                  <Button size="sm" variant="outline" className="shrink-0 h-9" onClick={() => copyToClipboard(webhookVerifyToken, "Verify Token")}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground">
              في لوحة Meta → WhatsApp → Configuration → اضغط "Edit" بجانب Webhook → الصق الـ URL والـ Token → اشترك في messages و message_deliveries و message_reads
            </p>
          </div>
        </div>
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
      <div className="bg-card rounded-lg shadow-card">
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

      {/* Quick Links */}
      <div className="bg-card rounded-lg shadow-card">
        {[
          { id: "billing", icon: CreditCard, title: "الاشتراك والفواتير", description: "إدارة خطة الاشتراك والدفع" },
          { id: "security", icon: Shield, title: "الأمان", description: "كلمة المرور والمصادقة الثنائية" },
        ].map((section, i, arr) => (
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