import { useState, useEffect, useCallback } from "react";
import { Building2, Bell, Globe, CreditCard, Shield, ChevronLeft, CheckCircle2, Copy, ExternalLink, Loader2, AlertCircle, Phone, RefreshCw, MessageSquare, KeyRound, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const WEBHOOK_URL = `https://dgnqehcezvewkdodqpyh.supabase.co/functions/v1/whatsapp-webhook`;
const META_APP_ID = "1276045851157317";
const META_CONFIG_ID = "2159780324784856";

const getOAuthRedirectUri = () => window.location.href.split("#")[0].split("?")[0];

interface PhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
  waba_id?: string;
}

interface WabaResult {
  waba_id: string;
  phone_numbers: PhoneNumber[];
}

type OnboardingStep = "idle" | "connecting" | "select-phone" | "saving" | "connected";

const SettingsPage = () => {
  const { orgId } = useAuth();
  const [step, setStep] = useState<OnboardingStep>("idle");
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [webhookVerifyToken, setWebhookVerifyToken] = useState("");
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [selectedPhoneDisplay, setSelectedPhoneDisplay] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [sdkLoaded, setSdkLoaded] = useState(false);

  // Manual connection
  const [showManual, setShowManual] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [manualPhoneId, setManualPhoneId] = useState("");
  const [manualWabaId, setManualWabaId] = useState("");

  // Session info from Embedded Signup callback
  const [sessionWabaId, setSessionWabaId] = useState("");
  const [sessionPhoneId, setSessionPhoneId] = useState("");

  useEffect(() => {
    loadConfig();
    loadFacebookSDK();
    setupSessionListener();
  }, []);

  const loadConfig = async () => {
    const { data } = await supabase
      .from("whatsapp_config")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (data) {
      setConfigId(data.id);
      setWebhookVerifyToken(data.webhook_verify_token);
      setSelectedPhoneDisplay(data.display_phone || "");
      setBusinessName(data.business_name || "");
      setIsConnected(data.is_connected || false);
      if (data.is_connected) setStep("connected");
    }
  };

  const loadFacebookSDK = () => {
    if (document.getElementById("facebook-jssdk")) {
      setSdkLoaded(true);
      return;
    }

    (window as any).fbAsyncInit = function () {
      (window as any).FB.init({
        appId: META_APP_ID,
        cookie: true,
        xfbml: true,
        version: "v21.0",
      });
      setSdkLoaded(true);
    };

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  };

  // Listen for Embedded Signup sessionInfoListener callback
  const setupSessionListener = () => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data.type === "WA_EMBEDDED_SIGNUP") {
          // data contains: { type, data: { waba_id, phone_number_id } }
          if (data.data?.waba_id) setSessionWabaId(data.data.waba_id);
          if (data.data?.phone_number_id) setSessionPhoneId(data.data.phone_number_id);
          console.log("Embedded Signup session info:", data.data);
        }
      } catch {
        // Not our message
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  };

  const handleFacebookLogin = useCallback(() => {
    const FB = (window as any).FB;
    if (!FB) {
      toast.error("جاري تحميل Facebook SDK...");
      return;
    }

    setIsLoading(true);
    setStep("connecting");

    FB.login(
      (response: any) => {
        if (response.authResponse) {
          const code = response.authResponse.code;
          const token = response.authResponse.accessToken;

          if (code) {
            completeSignup({ code });
          } else if (token) {
            completeSignup({ access_token: token });
          } else {
            setIsLoading(false);
            setStep("idle");
            toast.error("لم يتم الحصول على بيانات المصادقة");
          }
        } else {
          setIsLoading(false);
          setStep("idle");
          toast.error("تم إلغاء عملية الربط");
        }
      },
      {
        config_id: META_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        scope: "whatsapp_business_management,whatsapp_business_messaging",
        extras: {
          setup: {},
          featureType: "",
          sessionInfoVersion: 3,
        },
      }
    );
  }, [orgId, sessionWabaId, sessionPhoneId]);

  const completeSignup = async (params: { code?: string; access_token?: string }) => {
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-complete-signup", {
        body: {
          ...params,
          redirect_uri: getOAuthRedirectUri(),
          waba_id: sessionWabaId || undefined,
          phone_number_id: sessionPhoneId || undefined,
          org_id: orgId,
          auto_register: !!(sessionPhoneId), // Only auto-register if we have a phone from Embedded Signup
        },
      });

      if (error || data?.error) {
        toast.error(data?.error || "فشل في إكمال الربط");
        setIsLoading(false);
        setStep("idle");
        return;
      }

      setAccessToken(data.access_token);

      // If phone was auto-selected and saved (from Embedded Signup)
      if (data.saved_config) {
        setConfigId(data.saved_config.id);
        setWebhookVerifyToken(data.saved_config.webhook_verify_token || "");
        setSelectedPhoneDisplay(data.selected_phone?.display_phone_number || "");
        setBusinessName(data.selected_phone?.verified_name || "");
        setIsConnected(true);
        setStep("connected");
        toast.success(`✅ تم ربط الرقم ${data.selected_phone?.display_phone_number} بنجاح!`);
        setIsLoading(false);
        return;
      }

      // Otherwise, show phone selection
      const allPhones: PhoneNumber[] = [];
      if (data.results && data.results.length > 0) {
        data.results.forEach((result: WabaResult) => {
          result.phone_numbers.forEach((p) => {
            allPhones.push({ ...p, waba_id: result.waba_id });
          });
        });
      }

      if (allPhones.length > 0) {
        setPhoneNumbers(allPhones);
        setStep("select-phone");
        toast.success(`تم العثور على ${allPhones.length} رقم — اختر واحد`);
      } else {
        setStep("idle");
        toast.error("لا توجد أرقام واتساب مربوطة بحسابك.");
      }
    } catch {
      toast.error("حدث خطأ في الربط");
      setStep("idle");
    }
    setIsLoading(false);
  };

  const handleSelectPhone = async (phone: PhoneNumber) => {
    setIsLoading(true);
    setStep("saving");

    try {
      // Call complete-signup again with selected phone to save + register + subscribe
      const { data, error } = await supabase.functions.invoke("whatsapp-complete-signup", {
        body: {
          access_token: accessToken,
          waba_id: phone.waba_id,
          phone_number_id: phone.id,
          org_id: orgId,
          auto_register: true,
        },
      });

      if (error || data?.error) {
        toast.error(data?.error || "فشل في حفظ الإعدادات");
        setStep("select-phone");
        setIsLoading(false);
        return;
      }

      if (data.saved_config) {
        setConfigId(data.saved_config.id);
        setWebhookVerifyToken(data.saved_config.webhook_verify_token || "");
      }

      setSelectedPhoneDisplay(phone.display_phone_number);
      setBusinessName(phone.verified_name || "");
      setIsConnected(true);
      setStep("connected");
      toast.success(`✅ تم ربط الرقم ${phone.display_phone_number} بنجاح!`);
    } catch {
      toast.error("حدث خطأ");
      setStep("select-phone");
    }
    setIsLoading(false);
  };

  const handleManualConnect = async () => {
    if (!manualToken.trim() || !manualPhoneId.trim() || !manualWabaId.trim()) {
      toast.error("يرجى تعبئة جميع الحقول");
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-complete-signup", {
        body: {
          access_token: manualToken.trim(),
          waba_id: manualWabaId.trim(),
          phone_number_id: manualPhoneId.trim(),
          org_id: orgId,
          auto_register: false,
        },
      });

      if (error || data?.error) {
        toast.error(data?.error || "فشل في الربط");
        setIsLoading(false);
        return;
      }

      if (data.saved_config) {
        setConfigId(data.saved_config.id);
        setWebhookVerifyToken(data.saved_config.webhook_verify_token || "");
      }
      const selectedDisplay = data.selected_phone?.display_phone_number || manualPhoneId;
      setSelectedPhoneDisplay(selectedDisplay);
      setBusinessName(data.selected_phone?.verified_name || "");
      setIsConnected(true);
      setStep("connected");
      setShowManual(false);
      toast.success(`✅ تم ربط الرقم ${selectedDisplay} بنجاح!`);
    } catch {
      toast.error("حدث خطأ في الربط");
    }
    setIsLoading(false);
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setStep("idle");
    setPhoneNumbers([]);
    setAccessToken("");
    setSessionWabaId("");
    setSessionPhoneId("");
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
          {/* ─── Connected State ─── */}
          {step === "connected" && (
            <div className="space-y-4">
              <div className="text-center py-4 space-y-2">
                <div className="w-14 h-14 rounded-full gradient-whatsapp flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7 text-whatsapp-foreground" />
                </div>
                <p className="font-bold">الرقم {selectedPhoneDisplay} مربوط ✅</p>
                {businessName && <p className="text-xs text-muted-foreground">{businessName}</p>}
                <p className="text-xs text-muted-foreground">النظام جاهز لاستقبال وإرسال الرسائل</p>
              </div>

              <div className="bg-success/5 border border-success/20 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-success text-xs font-medium">
                  <Zap className="w-3 h-3" />
                  تم تلقائياً
                </div>
                <ul className="text-[11px] text-muted-foreground space-y-0.5 mr-5">
                  <li>✓ تسجيل الرقم على Cloud API</li>
                  <li>✓ اشتراك التطبيق في Webhooks</li>
                  <li>✓ ربط الرقم بحسابك</li>
                </ul>
              </div>

              {/* Webhook info */}
              <details className="group">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors flex items-center gap-1">
                  <ChevronLeft className="w-3 h-3 group-open:rotate-[-90deg] transition-transform" />
                  بيانات الـ Webhook (للإعداد اليدوي إن لزم)
                </summary>
                <div className="mt-3 border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input value={WEBHOOK_URL} readOnly className="bg-secondary border-0 text-[11px] flex-1" dir="ltr" />
                    <Button size="sm" variant="outline" className="shrink-0 h-8" onClick={() => copyToClipboard(WEBHOOK_URL, "URL")}><Copy className="w-3 h-3" /></Button>
                  </div>
                  {webhookVerifyToken && (
                    <div className="flex items-center gap-2">
                      <Input value={webhookVerifyToken} readOnly className="bg-secondary border-0 text-[11px] flex-1" dir="ltr" />
                      <Button size="sm" variant="outline" className="shrink-0 h-8" onClick={() => copyToClipboard(webhookVerifyToken, "Token")}><Copy className="w-3 h-3" /></Button>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    الصق هذي البيانات في{" "}
                    <a href="https://developers.facebook.com/apps/" target="_blank" className="text-primary underline">Meta Developers</a>
                    {" "}→ تطبيقك → WhatsApp → Configuration → Webhook
                  </p>
                </div>
              </details>

              <Button variant="outline" size="sm" className="text-xs gap-1" onClick={handleDisconnect}>
                <RefreshCw className="w-3 h-3" /> تغيير الرقم
              </Button>
            </div>
          )}

          {/* ─── Idle: Setup State ─── */}
          {step === "idle" && (
            <div className="space-y-4">
              <div className="bg-secondary/50 rounded-lg p-4 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <MessageSquare className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">اربط حساب واتساب للأعمال</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    سجّل دخولك بحساب فيسبوك واختر رقم واتساب — بضغطة زر واحدة
                  </p>
                </div>

                {/* Steps preview */}
                <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
                  <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full">1. تسجيل دخول</span>
                  <ChevronLeft className="w-3 h-3 rotate-180" />
                  <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full">2. اختيار الرقم</span>
                  <ChevronLeft className="w-3 h-3 rotate-180" />
                  <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full">3. جاهز!</span>
                </div>

                <Button
                  onClick={handleFacebookLogin}
                  disabled={isLoading || !sdkLoaded}
                  className="w-full gap-2 gradient-whatsapp text-whatsapp-foreground text-sm py-5"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                      <path d="M12.001 2.002c-5.522 0-9.999 4.477-9.999 9.999 0 4.99 3.657 9.126 8.437 9.879v-6.988h-2.54v-2.891h2.54V9.798c0-2.508 1.493-3.891 3.776-3.891 1.094 0 2.24.195 2.24.195v2.459h-1.264c-1.24 0-1.628.772-1.628 1.563v1.875h2.771l-.443 2.891h-2.328v6.988C18.344 21.129 22 16.992 22 12.001c0-5.522-4.477-9.999-9.999-9.999z" />
                    </svg>
                  )}
                  {!sdkLoaded ? "جاري التحميل..." : "ربط بحساب فيسبوك"}
                </Button>
              </div>

              {/* Manual connection toggle */}
              <div className="text-center">
                <button
                  onClick={() => setShowManual(!showManual)}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2"
                >
                  {showManual ? "إخفاء الربط اليدوي" : "أو اربط يدوياً بإدخال البيانات"}
                </button>
              </div>

              {/* Manual connection form */}
              {showManual && (
                <div className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <KeyRound className="w-4 h-4 text-primary" />
                    <h4 className="text-sm font-semibold">ربط يدوي</h4>
                  </div>
                  <div className="bg-secondary/60 rounded-lg p-3 space-y-2 text-[11px] text-muted-foreground">
                    <p className="font-semibold text-foreground text-xs">كيف تحصل على البيانات؟</p>
                    <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
                      <li>
                        افتح{" "}
                        <a href="https://developers.facebook.com/apps/" target="_blank" className="text-primary underline">Meta Developers</a>
                        {" "}وادخل على تطبيقك
                      </li>
                      <li>
                        من القائمة الجانبية اختر <span className="font-medium text-foreground">WhatsApp → API Setup</span>
                      </li>
                      <li>
                        <span className="font-medium text-foreground">Access Token:</span> استخدم{" "}
                        <a href="https://developers.facebook.com/docs/whatsapp/business-management-api/get-started#system-user-access-tokens" target="_blank" className="text-primary underline">System User Token</a> الدائم
                      </li>
                      <li>
                        <span className="font-medium text-foreground">Phone Number ID:</span> يظهر تحت الرقم في API Setup
                      </li>
                      <li>
                        <span className="font-medium text-foreground">WABA ID:</span> يظهر أعلى الصفحة
                      </li>
                    </ol>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Access Token</Label>
                    <Input value={manualToken} onChange={(e) => setManualToken(e.target.value)} placeholder="EAAxxxxxxx..." className="bg-secondary border-0 text-xs" dir="ltr" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Phone Number ID</Label>
                    <Input value={manualPhoneId} onChange={(e) => setManualPhoneId(e.target.value)} placeholder="1234567890" className="bg-secondary border-0 text-xs" dir="ltr" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">WhatsApp Business Account ID</Label>
                    <Input value={manualWabaId} onChange={(e) => setManualWabaId(e.target.value)} placeholder="1234567890" className="bg-secondary border-0 text-xs" dir="ltr" />
                  </div>
                  <Button onClick={handleManualConnect} disabled={isLoading || !manualToken || !manualPhoneId || !manualWabaId} className="w-full gap-2 text-sm">
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                    ربط يدوي
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ─── Connecting State ─── */}
          {step === "connecting" && (
            <div className="text-center py-8 space-y-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
              <p className="text-sm font-medium">جاري الربط مع Meta...</p>
              <p className="text-xs text-muted-foreground">أكمل العملية في النافذة المنبثقة</p>
            </div>
          )}

          {/* ─── Phone Selection ─── */}
          {step === "select-phone" && (
            <div className="space-y-3">
              <div className="text-center pb-2">
                <h4 className="font-semibold text-sm">اختر رقمك</h4>
                <p className="text-xs text-muted-foreground mt-0.5">سيتم تسجيل الرقم وربطه تلقائياً</p>
              </div>
              {phoneNumbers.map((phone) => (
                <button key={phone.id} onClick={() => handleSelectPhone(phone)} disabled={isLoading}
                  className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-right disabled:opacity-50">
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
                      {phone.quality_rating === "GREEN" ? "✅ جودة عالية" : "⚠️ متوسطة"}
                    </Badge>
                  )}
                </button>
              ))}
              <Button variant="ghost" size="sm" className="text-xs" onClick={handleDisconnect}>← رجوع</Button>
            </div>
          )}

          {/* ─── Saving State ─── */}
          {step === "saving" && (
            <div className="text-center py-8 space-y-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
              <p className="text-sm font-medium">جاري تسجيل الرقم وإعداد الـ Webhooks...</p>
              <p className="text-xs text-muted-foreground">ثواني وتنتهي</p>
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
