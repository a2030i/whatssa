import { useState, useEffect } from "react";
import { Building2, Bell, Globe, CreditCard, Shield, ChevronLeft, CheckCircle2, Copy, ExternalLink, Loader2, AlertCircle, Phone, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const WEBHOOK_URL = `https://dgnqehcezvewkdodqpyh.supabase.co/functions/v1/whatsapp-webhook`;

interface PhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
}

const SettingsPage = () => {
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [webhookVerifyToken, setWebhookVerifyToken] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [selectedPhoneDisplay, setSelectedPhoneDisplay] = useState("");
  const [showPhones, setShowPhones] = useState(false);

  useEffect(() => { loadConfig(); }, []);

  const loadConfig = async () => {
    const { data } = await supabase.from("whatsapp_config").select("*").limit(1).maybeSingle();
    if (data) {
      setConfigId(data.id);
      setBusinessAccountId(data.business_account_id);
      setAccessToken(data.access_token);
      setWebhookVerifyToken(data.webhook_verify_token);
      setSelectedPhoneDisplay(data.display_phone || "");
      setIsConnected(data.is_connected || false);
    }
  };

  const handleConnect = async () => {
    if (!businessAccountId || !accessToken) {
      toast.error("يرجى إدخال البيانات المطلوبة");
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-list-phones", {
        body: { business_account_id: businessAccountId, access_token: accessToken },
      });
      if (error || data?.error) {
        toast.error(data?.error || "فشل - تحقق من البيانات");
      } else if (data.phone_numbers?.length > 0) {
        setPhoneNumbers(data.phone_numbers);
        setShowPhones(true);
        toast.success(`تم العثور على ${data.phone_numbers.length} رقم — اختر واحد`);
      } else {
        toast.error("لا توجد أرقام مربوطة بهذا الحساب");
      }
    } catch {
      toast.error("حدث خطأ - تحقق من البيانات");
    }
    setIsLoading(false);
  };

  const handleSelectPhone = async (phone: PhoneNumber) => {
    setIsLoading(true);
    try {
      if (configId) {
        await supabase.from("whatsapp_config").update({
          phone_number_id: phone.id, business_account_id: businessAccountId,
          access_token: accessToken, display_phone: phone.display_phone_number,
          business_name: phone.verified_name, is_connected: true,
        }).eq("id", configId);
      } else {
        const { data } = await supabase.from("whatsapp_config").insert({
          phone_number_id: phone.id, business_account_id: businessAccountId,
          access_token: accessToken, display_phone: phone.display_phone_number,
          business_name: phone.verified_name, is_connected: true,
        }).select().single();
        if (data) { setConfigId(data.id); setWebhookVerifyToken(data.webhook_verify_token); }
      }
      setSelectedPhoneDisplay(phone.display_phone_number);
      setIsConnected(true);
      setShowPhones(false);
      toast.success(`✅ تم ربط الرقم ${phone.display_phone_number} بنجاح!`);
    } catch {
      toast.error("حدث خطأ");
    }
    setIsLoading(false);
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

      {/* WhatsApp Connection */}
      <div className="bg-card rounded-lg shadow-card">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">ربط WhatsApp</h3>
          </div>
          {isConnected ? (
            <Badge className="bg-success/10 text-success border-0 text-xs gap-1"><CheckCircle2 className="w-3 h-3" /> متصل</Badge>
          ) : (
            <Badge className="bg-warning/10 text-warning border-0 text-xs gap-1"><AlertCircle className="w-3 h-3" /> غير متصل</Badge>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Connected State */}
          {isConnected && selectedPhoneDisplay && !showPhones && (
            <div className="space-y-4">
              <div className="text-center py-4 space-y-2">
                <div className="w-14 h-14 rounded-full gradient-whatsapp flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7 text-whatsapp-foreground" />
                </div>
                <p className="font-bold">الرقم {selectedPhoneDisplay} مربوط ✅</p>
                <p className="text-xs text-muted-foreground">النظام جاهز لاستقبال وإرسال الرسائل</p>
              </div>

              {/* Webhook info - collapsible */}
              <details className="group">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors flex items-center gap-1">
                  <ChevronLeft className="w-3 h-3 group-open:rotate-[-90deg] transition-transform" />
                  بيانات الـ Webhook (لو ما ضبطته بعد)
                </summary>
                <div className="mt-3 border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input value={WEBHOOK_URL} readOnly className="bg-secondary border-0 text-[11px] flex-1" dir="ltr" />
                    <Button size="sm" variant="outline" className="shrink-0 h-8" onClick={() => copyToClipboard(WEBHOOK_URL, "URL")}><Copy className="w-3 h-3" /></Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input value={webhookVerifyToken} readOnly className="bg-secondary border-0 text-[11px] flex-1" dir="ltr" />
                    <Button size="sm" variant="outline" className="shrink-0 h-8" onClick={() => copyToClipboard(webhookVerifyToken, "Token")}><Copy className="w-3 h-3" /></Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    الصق هذي البيانات في{" "}
                    <a href="https://developers.facebook.com/apps/" target="_blank" className="text-primary underline">Meta Developers</a>
                    {" "}→ تطبيقك → WhatsApp → Configuration → Webhook
                  </p>
                </div>
              </details>

              <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => { setShowPhones(false); setIsConnected(false); }}>
                <RefreshCw className="w-3 h-3" /> تغيير الرقم
              </Button>
            </div>
          )}

          {/* Setup State */}
          {(!isConnected || showPhones) && !showPhones && (
            <div className="space-y-4">
              <div className="bg-secondary/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">
                  تحتاج حساب{" "}
                  <a href="https://developers.facebook.com/apps/" target="_blank" className="text-primary underline inline-flex items-center gap-0.5">
                    Meta Developers <ExternalLink className="w-3 h-3" />
                  </a>
                  {" "}مع تطبيق WhatsApp Business. أدخل البيانات والنظام يجيب لك أرقامك تختار منها.
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Business Account ID</Label>
                  <Input value={businessAccountId} onChange={(e) => setBusinessAccountId(e.target.value)}
                    placeholder="123456789012345" className="bg-secondary border-0 text-sm" dir="ltr" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Access Token</Label>
                  <Input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="EAAxxxxxxxxxxxxx..." className="bg-secondary border-0 text-sm" dir="ltr" />
                </div>
                <Button onClick={handleConnect} disabled={isLoading} className="w-full gap-2 gradient-whatsapp text-whatsapp-foreground">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                  اربط رقمي
                </Button>
              </div>
            </div>
          )}

          {/* Phone Selection */}
          {showPhones && (
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">اختر رقمك:</h4>
              {phoneNumbers.map((phone) => (
                <button key={phone.id} onClick={() => handleSelectPhone(phone)} disabled={isLoading}
                  className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-right">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full gradient-whatsapp flex items-center justify-center">
                      <Phone className="w-5 h-5 text-whatsapp-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" dir="ltr">{phone.display_phone_number}</p>
                      <p className="text-xs text-muted-foreground">{phone.verified_name}</p>
                    </div>
                  </div>
                  {phone.quality_rating && (
                    <Badge variant="outline" className={cn("text-[10px]",
                      phone.quality_rating === "GREEN" ? "text-success border-success/30" : "text-warning border-warning/30"
                    )}>
                      {phone.quality_rating === "GREEN" ? "✅" : "⚠️"} {phone.quality_rating === "GREEN" ? "جودة عالية" : "متوسطة"}
                    </Badge>
                  )}
                </button>
              ))}
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowPhones(false)}>← رجوع</Button>
            </div>
          )}
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
          <div className="flex justify-end">
            <Button size="sm">حفظ</Button>
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

      {/* Quick Links */}
      <div className="bg-card rounded-lg shadow-card">
        {[
          { id: "billing", icon: CreditCard, title: "الاشتراك والفواتير", description: "إدارة الاشتراك والدفع" },
          { id: "security", icon: Shield, title: "الأمان", description: "كلمة المرور والمصادقة" },
        ].map((section, i, arr) => (
          <button key={section.id} className={cn("w-full flex items-center justify-between p-5 hover:bg-secondary/30 transition-colors", i < arr.length - 1 && "border-b border-border")}>
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