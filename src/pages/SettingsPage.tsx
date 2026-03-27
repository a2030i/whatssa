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
  code_verification_status: string;
}

const SettingsPage = () => {
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [webhookVerifyToken, setWebhookVerifyToken] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFetchingPhones, setIsFetchingPhones] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [selectedPhoneId, setSelectedPhoneId] = useState("");
  const [selectedPhoneDisplay, setSelectedPhoneDisplay] = useState("");
  const [step, setStep] = useState<"credentials" | "select-phone" | "webhook" | "done">("credentials");

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
      setBusinessAccountId(data.business_account_id);
      setAccessToken(data.access_token);
      setWebhookVerifyToken(data.webhook_verify_token);
      setSelectedPhoneId(data.phone_number_id);
      setSelectedPhoneDisplay(data.display_phone || "");
      setIsConnected(data.is_connected || false);
      if (data.is_connected) setStep("done");
      else if (data.phone_number_id) setStep("webhook");
      else if (data.access_token) setStep("select-phone");
    }
  };

  const handleFetchPhones = async () => {
    if (!businessAccountId || !accessToken) {
      toast.error("يرجى إدخال Business Account ID و Access Token أولاً");
      return;
    }
    setIsFetchingPhones(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-list-phones", {
        body: { business_account_id: businessAccountId, access_token: accessToken },
      });

      if (error || data?.error) {
        toast.error(data?.error || "فشل جلب الأرقام - تحقق من البيانات");
        setIsFetchingPhones(false);
        return;
      }

      if (data.phone_numbers && data.phone_numbers.length > 0) {
        setPhoneNumbers(data.phone_numbers);
        setStep("select-phone");
        toast.success(`تم العثور على ${data.phone_numbers.length} رقم`);
      } else {
        toast.error("لا توجد أرقام مربوطة بهذا الحساب");
      }
    } catch {
      toast.error("حدث خطأ - تحقق من البيانات");
    }
    setIsFetchingPhones(false);
  };

  const handleSelectPhone = async (phone: PhoneNumber) => {
    setSelectedPhoneId(phone.id);
    setSelectedPhoneDisplay(phone.display_phone_number);
    setIsSaving(true);

    try {
      if (configId) {
        await supabase.from("whatsapp_config").update({
          phone_number_id: phone.id,
          business_account_id: businessAccountId,
          access_token: accessToken,
          display_phone: phone.display_phone_number,
          business_name: phone.verified_name,
        }).eq("id", configId);
      } else {
        const { data } = await supabase.from("whatsapp_config").insert({
          phone_number_id: phone.id,
          business_account_id: businessAccountId,
          access_token: accessToken,
          display_phone: phone.display_phone_number,
          business_name: phone.verified_name,
        }).select().single();
        if (data) {
          setConfigId(data.id);
          setWebhookVerifyToken(data.webhook_verify_token);
        }
      }
      setStep("webhook");
      toast.success(`تم اختيار الرقم ${phone.display_phone_number}`);
    } catch {
      toast.error("حدث خطأ أثناء الحفظ");
    }
    setIsSaving(false);
  };

  const handleTestConnection = async () => {
    if (!selectedPhoneId || !accessToken) return;
    setIsSaving(true);
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${selectedPhoneId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setIsConnected(true);
        if (configId) {
          await supabase.from("whatsapp_config").update({ is_connected: true }).eq("id", configId);
        }
        setStep("done");
        toast.success("✅ تم الاتصال بنجاح! النظام جاهز لاستقبال وإرسال الرسائل");
      } else {
        toast.error(`فشل: ${data.error?.message || "تحقق من البيانات"}`);
      }
    } catch {
      toast.error("فشل الاتصال");
    }
    setIsSaving(false);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`تم نسخ ${label}`);
  };

  const resetSetup = () => {
    setStep("credentials");
    setPhoneNumbers([]);
    setSelectedPhoneId("");
    setIsConnected(false);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[800px]" dir="rtl">
      <div>
        <h1 className="text-xl font-bold">الإعدادات</h1>
        <p className="text-sm text-muted-foreground mt-1">إدارة إعدادات حسابك والنظام</p>
      </div>

      {/* WhatsApp API Connection */}
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

        <div className="p-5 space-y-5">
          {/* Progress Steps */}
          <div className="flex items-center gap-2 text-xs">
            {[
              { key: "credentials", label: "١. البيانات" },
              { key: "select-phone", label: "٢. اختر الرقم" },
              { key: "webhook", label: "٣. الـ Webhook" },
              { key: "done", label: "٤. جاهز ✅" },
            ].map((s, i, arr) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className={cn(
                  "px-2 py-1 rounded-full font-medium",
                  step === s.key ? "bg-primary text-primary-foreground" :
                  ["credentials", "select-phone", "webhook", "done"].indexOf(step) > i ? "bg-success/10 text-success" :
                  "bg-muted text-muted-foreground"
                )}>
                  {s.label}
                </span>
                {i < arr.length - 1 && <div className="w-4 h-px bg-border" />}
              </div>
            ))}
          </div>

          {/* Step 1: Credentials */}
          {step === "credentials" && (
            <div className="space-y-4">
              <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-sm">📋 كيف تجيب البيانات؟</h4>
                <ol className="text-xs text-muted-foreground space-y-1.5 pr-4 list-decimal">
                  <li>
                    ادخل{" "}
                    <a href="https://developers.facebook.com/apps/" target="_blank" className="text-primary underline inline-flex items-center gap-0.5">
                      Meta Developers <ExternalLink className="w-3 h-3" />
                    </a>{" "}
                    → أنشئ تطبيق → اختر WhatsApp
                  </li>
                  <li>من لوحة WhatsApp انسخ <strong>Business Account ID</strong></li>
                  <li>من Settings → أنشئ <strong>Access Token</strong></li>
                </ol>
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

              <Button onClick={handleFetchPhones} disabled={isFetchingPhones} className="w-full gap-2 gradient-whatsapp text-whatsapp-foreground">
                {isFetchingPhones ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                جلب الأرقام المربوطة
              </Button>
            </div>
          )}

          {/* Step 2: Select Phone */}
          {step === "select-phone" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">اختر الرقم اللي تبي تربطه:</h4>
                <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => handleFetchPhones()}>
                  <RefreshCw className="w-3 h-3" /> تحديث
                </Button>
              </div>

              {phoneNumbers.map((phone) => (
                <button
                  key={phone.id}
                  onClick={() => handleSelectPhone(phone)}
                  disabled={isSaving}
                  className={cn(
                    "w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all text-right",
                    selectedPhoneId === phone.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-secondary/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full gradient-whatsapp flex items-center justify-center">
                      <Phone className="w-5 h-5 text-whatsapp-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" dir="ltr">{phone.display_phone_number}</p>
                      <p className="text-xs text-muted-foreground">{phone.verified_name}</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <Badge variant="outline" className={cn("text-[10px]",
                      phone.quality_rating === "GREEN" ? "text-success border-success/30" :
                      phone.quality_rating === "YELLOW" ? "text-warning border-warning/30" :
                      "text-destructive border-destructive/30"
                    )}>
                      {phone.quality_rating === "GREEN" ? "جودة عالية" : phone.quality_rating === "YELLOW" ? "متوسطة" : phone.quality_rating || "—"}
                    </Badge>
                  </div>
                </button>
              ))}

              <Button variant="outline" size="sm" className="text-xs" onClick={() => setStep("credentials")}>
                ← رجوع
              </Button>
            </div>
          )}

          {/* Step 3: Webhook */}
          {step === "webhook" && (
            <div className="space-y-4">
              {selectedPhoneDisplay && (
                <div className="flex items-center gap-2 p-3 bg-success/10 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <span className="text-sm font-medium text-success">تم اختيار الرقم: {selectedPhoneDisplay}</span>
                </div>
              )}

              <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-sm">📌 آخر خطوة — أضف الـ Webhook في Meta</h4>
                <ol className="text-xs text-muted-foreground space-y-1.5 pr-4 list-decimal">
                  <li>ادخل لوحة Meta Developers → تطبيقك → WhatsApp → Configuration</li>
                  <li>اضغط "Edit" بجانب Webhook</li>
                  <li>الصق الـ <strong>Callback URL</strong> و <strong>Verify Token</strong> من الأسفل</li>
                  <li>اشترك في: <strong>messages</strong> و <strong>message_deliveries</strong> و <strong>message_reads</strong></li>
                </ol>
              </div>

              <div className="space-y-3 border border-border rounded-lg p-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground">Callback URL</Label>
                  <div className="flex items-center gap-2">
                    <Input value={WEBHOOK_URL} readOnly className="bg-secondary border-0 text-xs flex-1" dir="ltr" />
                    <Button size="sm" variant="outline" className="shrink-0 h-9" onClick={() => copyToClipboard(WEBHOOK_URL, "Webhook URL")}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] text-muted-foreground">Verify Token</Label>
                  <div className="flex items-center gap-2">
                    <Input value={webhookVerifyToken || "جاري التحميل..."} readOnly className="bg-secondary border-0 text-xs flex-1" dir="ltr" />
                    {webhookVerifyToken && (
                      <Button size="sm" variant="outline" className="shrink-0 h-9" onClick={() => copyToClipboard(webhookVerifyToken, "Verify Token")}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <Button onClick={handleTestConnection} disabled={isSaving} className="w-full gap-2 gradient-whatsapp text-whatsapp-foreground">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                اختبار الاتصال والتفعيل
              </Button>

              <Button variant="outline" size="sm" className="text-xs" onClick={() => setStep("select-phone")}>
                ← رجوع
              </Button>
            </div>
          )}

          {/* Step 4: Done */}
          {step === "done" && (
            <div className="space-y-4">
              <div className="text-center py-6 space-y-3">
                <div className="w-16 h-16 rounded-full gradient-whatsapp flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-whatsapp-foreground" />
                </div>
                <h4 className="font-bold text-lg">🎉 تم الربط بنجاح!</h4>
                <p className="text-sm text-muted-foreground">الرقم {selectedPhoneDisplay} جاهز لاستقبال وإرسال الرسائل</p>
              </div>

              <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
                <h4 className="font-semibold text-xs">ملخص الربط:</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <span className="text-muted-foreground">الرقم:</span>
                  <span className="font-medium" dir="ltr">{selectedPhoneDisplay}</span>
                  <span className="text-muted-foreground">الحالة:</span>
                  <span className="text-success font-medium">متصل ✅</span>
                </div>
              </div>

              <Button variant="outline" size="sm" className="text-xs gap-1" onClick={resetSetup}>
                <RefreshCw className="w-3 h-3" /> تغيير الرقم أو إعادة الإعداد
              </Button>
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