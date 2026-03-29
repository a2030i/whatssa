import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2, Copy, Loader2, Phone, RefreshCw,
  MessageSquare, KeyRound, Plus, Trash2, Instagram,
  Plug, Radio, Smartphone, Send, AlertTriangle, ExternalLink
} from "lucide-react";
import WhatsAppWebSection from "@/components/integrations/WhatsAppWebSection";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const WEBHOOK_URL = `https://dgnqehcezvewkdodqpyh.supabase.co/functions/v1/whatsapp-webhook`;
const META_APP_ID = "1239578701681497";

interface PhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
}

interface WabaResult {
  waba_id: string;
  phone_numbers: PhoneNumber[];
}

interface WhatsAppConfig {
  id: string;
  phone_number_id: string;
  business_account_id: string;
  access_token: string;
  display_phone: string | null;
  business_name: string | null;
  is_connected: boolean | null;
  webhook_verify_token: string;
  org_id: string | null;
  registration_status: string | null;
  registration_error: string | null;
  registered_at: string | null;
}

type FlowStep = "idle" | "connecting" | "pick_phone" | "success" | "error";

const IntegrationsPage = () => {
  const { orgId, isSuperAdmin } = useAuth();
  const [configs, setConfigs] = useState<WhatsAppConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [flowStep, setFlowStep] = useState<FlowStep>("idle");
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [accessToken, setAccessToken] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [manualPhoneId, setManualPhoneId] = useState("");
  const [manualWabaId, setManualWabaId] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [connectedPhone, setConnectedPhone] = useState<string>("");
  const [testSending, setTestSending] = useState(false);
  const [testPhone, setTestPhone] = useState("");

  useEffect(() => {
    loadConfigs();
    loadFacebookSDK();
  }, []);

  const loadConfigs = async () => {
    const { data } = await supabase.from("whatsapp_config").select("*").order("created_at", { ascending: true });
    setConfigs(data || []);
  };

  const loadFacebookSDK = () => {
    if (document.getElementById("facebook-jssdk")) { setSdkLoaded(true); return; }
    (window as any).fbAsyncInit = function () {
      (window as any).FB.init({ appId: META_APP_ID, cookie: true, xfbml: true, version: "v21.0" });
      setSdkLoaded(true);
    };
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  };

  const startConnect = useCallback(() => {
    const FB = (window as any).FB;
    if (!FB) { toast.error("جاري تحميل SDK..."); return; }

    setFlowStep("connecting");
    setIsLoading(true);
    setErrorMessage("");

    FB.login(
      (response: any) => {
        if (response.authResponse) {
          const code = response.authResponse.code;
          const token = response.authResponse.accessToken;
          if (code) {
            handleCodeExchange(code);
          } else if (token) {
            handleDirectToken(token);
          } else {
            handleError("لم يتم الحصول على بيانات المصادقة");
          }
        } else {
          handleError("تم إلغاء عملية الربط");
        }
      },
      {
        config_id: "841284742321361",
        response_type: "code",
        override_default_response_type: true,
        scope: "whatsapp_business_management,whatsapp_business_messaging",
      }
    );
  }, []);

  const handleCodeExchange = async (code: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-exchange-token", { body: { code } });
      if (error || data?.error) {
        handleError(data?.error || "فشل في تبادل الرمز");
        return;
      }
      if (data.access_token) {
        handleDirectToken(data.access_token);
      } else {
        handleError("لم يتم الحصول على التوكن");
      }
    } catch {
      handleError("حدث خطأ أثناء الربط");
    }
  };

  const handleDirectToken = async (token: string) => {
    try {
      setAccessToken(token);
      const { data, error } = await supabase.functions.invoke("whatsapp-exchange-token", { body: { access_token: token } });
      if (error || data?.error) { handleError(data?.error || "فشل في جلب بيانات الحساب"); return; }

      const allPhones: PhoneNumber[] = [];
      let firstWabaId = "";
      if (data.results?.length > 0) {
        data.results.forEach((r: WabaResult) => {
          if (!firstWabaId) firstWabaId = r.waba_id;
          allPhones.push(...r.phone_numbers);
        });
      }

      if (allPhones.length === 1) {
        // Auto-select if only one number
        setBusinessAccountId(firstWabaId);
        await selectPhone(allPhones[0], token, firstWabaId);
      } else if (allPhones.length > 0) {
        setBusinessAccountId(firstWabaId);
        setPhoneNumbers(allPhones);
        setFlowStep("pick_phone");
        setIsLoading(false);
      } else {
        handleError("لا توجد أرقام واتساب مربوطة بحسابك");
      }
    } catch {
      handleError("حدث خطأ");
    }
  };

  const selectPhone = async (phone: PhoneNumber, token?: string, wabaId?: string) => {
    setIsLoading(true);
    try {
      const result = await completeSignup({
        token: token || accessToken,
        phoneId: phone.id,
        wabaId: wabaId || businessAccountId,
      });
      if (result) {
        setConnectedPhone(phone.display_phone_number);
        setFlowStep("success");
      }
    } catch {
      handleError("فشل في إكمال الربط");
    }
    setIsLoading(false);
  };

  const completeSignup = async ({ token, phoneId, wabaId }: { token: string; phoneId: string; wabaId: string }) => {
    if (!orgId) { handleError("تعذر تحديد المؤسسة"); return false; }

    const { data, error } = await supabase.functions.invoke("whatsapp-complete-signup", {
      body: { access_token: token, phone_number_id: phoneId, waba_id: wabaId, org_id: orgId, auto_register: true },
    });

    if (error || data?.error) { handleError(data?.error || "فشل في إكمال الربط"); return false; }
    if (!data?.selected_phone || !data?.saved_config) { handleError("تعذر تسجيل الرقم"); return false; }

    // Check registration result
    if (data.registration && !data.registration.success) {
      const regError = data.registration.error || "فشل تسجيل الرقم في WhatsApp Cloud API";
      toast.error(`تحذير: تم حفظ البيانات لكن فشل التسجيل: ${regError}`);
    }

    await loadConfigs();
    return true;
  };

  const handleError = (msg: string) => {
    setErrorMessage(msg);
    setFlowStep("error");
    setIsLoading(false);
  };

  const handleManualConnect = async () => {
    if (!manualToken.trim() || !manualPhoneId.trim() || !manualWabaId.trim()) { toast.error("يرجى تعبئة جميع الحقول"); return; }
    setIsLoading(true);
    try {
      const result = await completeSignup({ token: manualToken.trim(), phoneId: manualPhoneId.trim(), wabaId: manualWabaId.trim() });
      if (result) {
        setConnectedPhone(manualPhoneId);
        setFlowStep("success");
        setShowManual(false);
        setManualToken(""); setManualPhoneId(""); setManualWabaId("");
      }
    } catch { handleError("حدث خطأ في الربط"); }
    setIsLoading(false);
  };

  const handleDisconnect = async (configId: string) => {
    if (!confirm("هل تريد فصل هذا الرقم؟")) return;
    await supabase.from("whatsapp_config").delete().eq("id", configId);
    toast.success("تم فصل الرقم");
    loadConfigs();
  };

  const retryRegister = async (config: WhatsAppConfig) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-complete-signup", {
        body: {
          access_token: config.access_token,
          phone_number_id: config.phone_number_id,
          waba_id: config.business_account_id,
          org_id: config.org_id,
          auto_register: true,
        },
      });
      if (error || data?.error) {
        toast.error(data?.error || "فشل إعادة التسجيل");
      } else if (data?.registration?.success) {
        toast.success("✅ تم تسجيل الرقم بنجاح!");
      } else {
        toast.error(`فشل التسجيل: ${data?.registration?.error || "خطأ غير معروف"}`);
      }
      await loadConfigs();
    } catch {
      toast.error("حدث خطأ");
    }
    setIsLoading(false);
  };

  const sendTestMessage = async () => {
    if (!testPhone.trim()) { toast.error("أدخل رقم الهاتف"); return; }
    setTestSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-send", {
        body: { to: testPhone.trim(), message: "✅ تم الربط بنجاح! هذه رسالة اختبار من واتس ديسك." },
      });
      if (error || data?.error) {
        toast.error(data?.error || "فشل إرسال الرسالة");
      } else {
        toast.success("✅ تم إرسال رسالة الاختبار بنجاح!");
      }
    } catch { toast.error("حدث خطأ"); }
    setTestSending(false);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`تم نسخ ${label}`);
  };

  const resetFlow = () => {
    setFlowStep("idle");
    setPhoneNumbers([]);
    setErrorMessage("");
    setIsLoading(false);
    setConnectedPhone("");
    setTestPhone("");
    setShowManual(false);
  };

  // ============ EMPTY STATE: Show all channels ============
  if (configs.length === 0 && flowStep === "idle") {
    return (
      <div className="p-3 md:p-6 space-y-6 max-w-[900px]" dir="rtl">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Plug className="w-5 h-5 text-primary" />
            الربط والتكامل
          </h1>
          <p className="text-sm text-muted-foreground mt-1">اربط قنوات التواصل لإرسال واستقبال الرسائل</p>
        </div>

        {/* WhatsApp Official API */}
        <div className="bg-card rounded-xl shadow-card border border-border overflow-hidden">
          <div className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="font-bold text-sm">واتساب الرسمي (API)</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">ربط عبر WhatsApp Business API — للأعمال والمنصات</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] text-muted-foreground">غير مربوط</Badge>
          </div>
          <div className="px-5 pb-5 space-y-3">
            <div className="bg-primary/5 rounded-lg p-3">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                💡 يتطلب حساب WhatsApp Business — ستفتح نافذة Meta لتسجيل الدخول واختيار رقمك. تستغرق أقل من دقيقة.
              </p>
            </div>
            <Button
              onClick={startConnect}
              disabled={isLoading || !sdkLoaded}
              className="w-full gap-2 py-5 text-sm font-bold rounded-xl"
            >
              {!sdkLoaded ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
              {!sdkLoaded ? "جاري التحميل..." : "ربط واتساب الرسمي"}
            </Button>

            {isSuperAdmin && (
              <div className="pt-3 border-t border-border">
                <button
                  onClick={() => setShowManual(!showManual)}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2 w-full text-center"
                >
                  {showManual ? "إخفاء الربط اليدوي" : "ربط يدوي (متقدم)"}
                </button>
                {showManual && (
                  <div className="mt-3 border border-border rounded-lg p-4 space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Access Token</Label>
                      <Input value={manualToken} onChange={(e) => setManualToken(e.target.value)} placeholder="EAAxxxxxxx..." className="bg-secondary border-0 text-xs" dir="ltr" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Phone Number ID</Label>
                      <Input value={manualPhoneId} onChange={(e) => setManualPhoneId(e.target.value)} placeholder="1234567890" className="bg-secondary border-0 text-xs" dir="ltr" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">WABA ID</Label>
                      <Input value={manualWabaId} onChange={(e) => setManualWabaId(e.target.value)} placeholder="1234567890" className="bg-secondary border-0 text-xs" dir="ltr" />
                    </div>
                    <Button onClick={handleManualConnect} disabled={isLoading || !manualToken || !manualPhoneId || !manualWabaId} className="w-full gap-2 text-sm">
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                      ربط
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* WhatsApp Web QR */}
        <WhatsAppWebSection orgId={orgId} isSuperAdmin={isSuperAdmin} />

        {/* Upcoming Channels */}
        <div className="space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground">قنوات أخرى</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { name: "انستغرام", icon: Instagram, desc: "تواصل عبر Instagram Direct" },
              { name: "تيليغرام", icon: Radio, desc: "استقبل رسائل تيليغرام" },
              { name: "SMS", icon: Smartphone, desc: "رسائل نصية قصيرة" },
            ].map((ch) => (
              <div key={ch.name} className="bg-card rounded-xl shadow-card p-4 border border-border opacity-60">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                    <ch.icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{ch.name}</p>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">قريباً</Badge>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">{ch.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ============ CONNECTING / LOADING ============
  if (flowStep === "connecting") {
    return (
      <div className="p-3 md:p-6 max-w-[600px] mx-auto" dir="rtl">
        <div className="bg-card rounded-2xl shadow-card border border-border p-12 text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <h2 className="text-lg font-bold text-foreground">جاري الربط...</h2>
          <p className="text-sm text-muted-foreground mt-2">أكمل الخطوات في نافذة Meta المنبثقة</p>
        </div>
      </div>
    );
  }

  // ============ PICK PHONE NUMBER ============
  if (flowStep === "pick_phone") {
    return (
      <div className="p-3 md:p-6 max-w-[600px] mx-auto" dir="rtl">
        <div className="bg-card rounded-2xl shadow-card border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-bold text-foreground">اختر رقمك</h2>
            <p className="text-sm text-muted-foreground mt-1">تم العثور على {phoneNumbers.length} رقم — اختر الرقم الذي تريد ربطه</p>
          </div>
          <div className="p-4 space-y-2">
            {phoneNumbers.map((phone) => (
              <button
                key={phone.id}
                onClick={() => selectPhone(phone)}
                disabled={isLoading}
                className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-right"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center">
                    <Phone className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-sm" dir="ltr">{phone.display_phone_number}</p>
                    <p className="text-xs text-muted-foreground">{phone.verified_name}</p>
                  </div>
                </div>
                {phone.quality_rating && (
                  <Badge variant="outline" className={cn("text-[10px]",
                    phone.quality_rating === "GREEN" ? "text-success border-success/30" : "text-warning border-warning/30"
                  )}>
                    {phone.quality_rating === "GREEN" ? "جودة عالية" : "متوسطة"}
                  </Badge>
                )}
              </button>
            ))}
            <Button variant="ghost" size="sm" className="text-xs mt-2" onClick={resetFlow}>← رجوع</Button>
          </div>
        </div>
      </div>
    );
  }

  // ============ SUCCESS ============
  if (flowStep === "success") {
    return (
      <div className="p-3 md:p-6 max-w-[600px] mx-auto" dir="rtl">
        <div className="bg-card rounded-2xl shadow-card border border-success/30 overflow-hidden">
          <div className="bg-success/5 p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-10 h-10 text-success" />
            </div>
            <h2 className="text-xl font-bold text-foreground">✅ تم ربط الرقم بنجاح</h2>
            {connectedPhone && (
              <p className="text-lg font-bold text-primary mt-2" dir="ltr">{connectedPhone}</p>
            )}
            <Badge className="mt-2 bg-success/10 text-success border-0">متصل</Badge>
          </div>

          {/* Test Message */}
          <div className="p-6 space-y-4">
            <div className="bg-muted/50 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">أرسل رسالة اختبار</h3>
              </div>
              <p className="text-xs text-muted-foreground">تأكد من جاهزية الرقم بإرسال رسالة اختبار</p>
              <div className="flex gap-2">
                <Input
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="9665xxxxxxxx"
                  className="bg-card border border-border text-sm flex-1"
                  dir="ltr"
                />
                <Button onClick={sendTestMessage} disabled={testSending || !testPhone} className="gap-1.5 shrink-0">
                  {testSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  إرسال
                </Button>
              </div>
            </div>

            <Button onClick={resetFlow} variant="outline" className="w-full gap-2">
              <CheckCircle2 className="w-4 h-4" />
              تم — الذهاب لإدارة الأرقام
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ============ ERROR ============
  if (flowStep === "error") {
    return (
      <div className="p-3 md:p-6 max-w-[600px] mx-auto" dir="rtl">
        <div className="bg-card rounded-2xl shadow-card border border-destructive/30 overflow-hidden">
          <div className="bg-destructive/5 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-lg font-bold text-foreground">لم يتم إكمال الربط</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-[320px] mx-auto">{errorMessage}</p>
          </div>

          <div className="p-6 space-y-3">
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                💡 تأكد أن الرقم غير مربوط بتطبيق واتساب على هاتفك. يجب فصله أولاً لربطه بالمنصة.
              </p>
            </div>

            <Button onClick={() => { resetFlow(); startConnect(); }} className="w-full gap-2">
              <RefreshCw className="w-4 h-4" />
              إعادة المحاولة
            </Button>
            <Button onClick={resetFlow} variant="ghost" className="w-full text-sm">
              رجوع
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ============ MAIN: Connected Numbers Management ============
  return (
    <div className="p-3 md:p-6 space-y-6 max-w-[900px]" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Plug className="w-5 h-5 text-primary" />
            الربط والتكامل
          </h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة قنوات التواصل وأرقام واتساب</p>
        </div>
      </div>

      {/* WhatsApp Numbers */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-sm">أرقام واتساب</h2>
              <p className="text-[11px] text-muted-foreground">{configs.length} رقم مربوط</p>
            </div>
          </div>
          <Button size="sm" className="gap-1.5 text-xs" onClick={startConnect} disabled={!sdkLoaded}>
            <Plus className="w-3.5 h-3.5" /> إضافة رقم
          </Button>
        </div>

        <div className="grid gap-3">
          {configs.map((config) => (
            <div key={config.id} className="bg-card rounded-xl shadow-card p-4 border border-border hover:shadow-card-hover transition-shadow">
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3">
                   <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center">
                     <Phone className="w-5 h-5 text-primary" />
                   </div>
                   <div>
                     <div className="flex items-center gap-2">
                       <p className="font-semibold text-sm" dir="ltr">{config.display_phone || config.phone_number_id}</p>
                       {config.registration_status === "connected" ? (
                         <Badge className="bg-success/10 text-success border-0 text-[10px] gap-0.5">
                           <CheckCircle2 className="w-2.5 h-2.5" /> متصل
                         </Badge>
                       ) : config.registration_status === "failed" ? (
                         <Badge className="bg-destructive/10 text-destructive border-0 text-[10px] gap-0.5">
                           <AlertTriangle className="w-2.5 h-2.5" /> فشل التسجيل
                         </Badge>
                       ) : config.registration_status === "registering" ? (
                         <Badge className="bg-warning/10 text-warning border-0 text-[10px] gap-0.5">
                           <Loader2 className="w-2.5 h-2.5 animate-spin" /> جاري التسجيل
                         </Badge>
                       ) : (
                         <Badge className="bg-warning/10 text-warning border-0 text-[10px] gap-0.5">
                           <AlertTriangle className="w-2.5 h-2.5" /> معلّق
                         </Badge>
                       )}
                     </div>
                     <p className="text-xs text-muted-foreground">{config.business_name || "واتساب للأعمال"}</p>
                   </div>
                 </div>
                 <div className="flex items-center gap-1">
                   {(config.registration_status === "failed" || config.registration_status === "pending" || !config.registration_status) && (
                     <Button variant="outline" size="sm" className="text-xs h-8 gap-1 text-primary" onClick={() => retryRegister(config)} disabled={isLoading}>
                       <RefreshCw className="w-3 h-3" /> إعادة التسجيل
                     </Button>
                   )}
                   <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => setExpandedId(expandedId === config.id ? null : config.id)}>
                     التفاصيل
                   </Button>
                   <Button variant="ghost" size="sm" className="text-destructive h-8 w-8 p-0" onClick={() => handleDisconnect(config.id)}>
                     <Trash2 className="w-3.5 h-3.5" />
                   </Button>
                 </div>
              </div>

              {/* Expanded */}
              {expandedId === config.id && (
                <div className="mt-4 pt-4 border-t border-border space-y-3 animate-fade-in">
                  {isSuperAdmin && (
                    <>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Webhook URL</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Input value={WEBHOOK_URL} readOnly className="bg-secondary border-0 text-[11px] flex-1" dir="ltr" />
                          <Button size="sm" variant="outline" className="shrink-0 h-8 w-8 p-0" onClick={() => copyToClipboard(WEBHOOK_URL, "URL")}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Verify Token</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Input value={config.webhook_verify_token} readOnly className="bg-secondary border-0 text-[11px] flex-1" dir="ltr" />
                          <Button size="sm" variant="outline" className="shrink-0 h-8 w-8 p-0" onClick={() => copyToClipboard(config.webhook_verify_token, "Token")}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Phone Number ID</Label>
                          <p className="text-xs mt-0.5 font-mono" dir="ltr">{config.phone_number_id}</p>
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">WABA ID</Label>
                          <p className="text-xs mt-0.5 font-mono" dir="ltr">{config.business_account_id}</p>
                        </div>
                      </div>
                    </>
                  )}
                  {/* Registration error */}
                  {config.registration_status === "failed" && config.registration_error && (
                    <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-destructive">سبب فشل التسجيل</p>
                          <p className="text-[11px] text-muted-foreground mt-1" dir="ltr">{config.registration_error}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {config.registered_at && (
                    <div className="text-[10px] text-muted-foreground">
                      آخر تسجيل ناجح: {new Date(config.registered_at).toLocaleString("ar-SA")}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* WhatsApp Web (Unofficial) */}
      <WhatsAppWebSection orgId={orgId} isSuperAdmin={isSuperAdmin} />

      {/* Upcoming Channels */}
      <div className="space-y-3">
        <h2 className="font-semibold text-sm text-muted-foreground">قنوات أخرى</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { name: "انستغرام", icon: Instagram, desc: "تواصل عبر Instagram Direct" },
            { name: "تيليغرام", icon: Radio, desc: "استقبل رسائل تيليغرام" },
            { name: "SMS", icon: Smartphone, desc: "رسائل نصية قصيرة" },
          ].map((ch) => (
            <div key={ch.name} className="bg-card rounded-xl shadow-card p-4 border border-border opacity-60">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                  <ch.icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{ch.name}</p>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0">قريباً</Badge>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">{ch.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default IntegrationsPage;
