import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2, Copy, Loader2, Phone, RefreshCw,
  MessageSquare, KeyRound, Plus, Trash2, Instagram,
  Plug, Radio, Smartphone, Send, AlertTriangle, ExternalLink,
  ShieldCheck, CreditCard, PhoneCall, Building2, Circle
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

type FlowStep = "idle" | "checklist" | "connecting" | "pick_phone" | "success" | "error";

const IntegrationsPage = () => {
  const { orgId, isSuperAdmin } = useAuth();
  const [configs, setConfigs] = useState<WhatsAppConfig[]>([]);
  const [maxPhones, setMaxPhones] = useState<number>(1);
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
  const [twoStepPin, setTwoStepPin] = useState("");
  const [metaStatus, setMetaStatus] = useState<Record<string, {
    phoneStatus?: string;
    nameStatus?: string;
    qualityRating?: string;
    messagingLimit?: string;
    businessVerification?: string;
    accountReviewStatus?: string;
    healthIssues?: { entity: string; error: string; solution: string }[];
    isLoading: boolean;
  }>>({});

  useEffect(() => {
    loadConfigs();
    loadFacebookSDK();
  }, []);

  const loadConfigs = async () => {
    if (!orgId) return;
    const [configsRes, orgRes] = await Promise.all([
      supabase.from("whatsapp_config").select("*").eq("org_id", orgId).order("created_at", { ascending: true }),
      supabase.from("organizations").select("plans(max_phone_numbers)").eq("id", orgId).maybeSingle(),
    ]);
    const data = configsRes.data || [];
    setConfigs(data);
    const planData = orgRes?.data as any;
    if (planData?.plans?.max_phone_numbers) setMaxPhones(planData.plans.max_phone_numbers);
    // Fetch Meta status for connected configs — sequentially with delay to avoid rate limits
    if (data) {
      const connected = data.filter(c => c.is_connected && c.access_token && c.phone_number_id);
      for (let i = 0; i < connected.length; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 2000));
        fetchMetaStatus(connected[i]);
      }
    }
  };

  const fetchMetaStatus = async (config: WhatsAppConfig, force = false) => {
    // Skip if already fetched recently (within 60s) unless forced
    const existing = metaStatus[config.id];
    if (!force && existing && !existing.isLoading && existing.phoneStatus) return;

    setMetaStatus(p => ({ ...p, [config.id]: { ...p[config.id], isLoading: true } }));
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-check-status", {
        body: { config_id: config.id },
      });
      if (error || !data) {
        // Handle rate limit specifically
        if (data?.error?.includes?.("rate") || data?.error?.includes?.("too many")) {
          toast.error("طلبات كثيرة لـ Meta — انتظر دقيقة ثم حاول مرة أخرى");
        }
        setMetaStatus(p => ({ ...p, [config.id]: { ...p[config.id], isLoading: false } }));
        return;
      }

      // Extract health issues from all entities
      const healthIssues: { entity: string; error: string; solution: string }[] = [];
      const entityLabels: Record<string, string> = {
        PHONE_NUMBER: "الرقم",
        WABA: "حساب WABA",
        BUSINESS: "حافظة الأعمال",
        APP: "التطبيق",
      };
      (data.phone?.health_status || []).forEach((entity: any) => {
        (entity.errors || []).forEach((err: any) => {
          healthIssues.push({
            entity: entityLabels[entity.entity_type] || entity.entity_type,
            error: err.error_description || "",
            solution: err.possible_solution || "",
          });
        });
      });

      setMetaStatus(p => ({
        ...p,
        [config.id]: {
          phoneStatus: data.phone?.status || data.phone?.code_verification_status || null,
          nameStatus: data.phone?.name_status || null,
          qualityRating: data.phone?.quality_rating || null,
          messagingLimit: data.phone?.messaging_limit_tier || null,
          businessVerification: data.waba?.business_verification_status || null,
          accountReviewStatus: data.waba?.account_review_status || null,
          healthIssues,
          isLoading: false,
        },
      }));

      // Sync local DB status if Meta says phone is actually PENDING but we have "connected"
      if (data.phone?.status === "PENDING" && config.registration_status === "connected") {
        await supabase.from("whatsapp_config").update({
          is_connected: false,
          registration_status: "pending",
          registration_error: "الرقم غير مسجّل في Cloud API — يحتاج إعادة تسجيل (Register)",
        }).eq("id", config.id);
        loadConfigs();
      } else if (data.phone?.status === "CONNECTED" && config.registration_status !== "connected") {
        await supabase.from("whatsapp_config").update({
          is_connected: true,
          registration_status: "connected",
          registration_error: null,
          registered_at: new Date().toISOString(),
        }).eq("id", config.id);
        loadConfigs();
      }
    } catch {
      setMetaStatus(p => ({ ...p, [config.id]: { isLoading: false } }));
    }
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
    if (configs.length >= maxPhones && !isSuperAdmin) {
      toast.error(`وصلت للحد الأقصى (${maxPhones} رقم). ترقّ لباقة أعلى لإضافة أرقام جديدة.`);
      return;
    }
    // Show checklist first if there are already connected numbers
    if (configs.length > 0) {
      setFlowStep("checklist");
      return;
    }
    proceedToMetaLogin();
  }, [configs, maxPhones, isSuperAdmin]);

  const proceedToMetaLogin = useCallback(() => {
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

  const friendlyError = (raw: string): string => {
    const lower = raw.toLowerCase();
    if (lower.includes("unverified waba") || lower.includes("not verified"))
      return "حساب واتساب بزنس (WABA) غير موثّق. يجب توثيق حسابك من خلال Meta Business Suite أولاً. زر صفحة Business Support Home على فيسبوك لحل المشكلة.";
    if (lower.includes("already") && lower.includes("registered"))
      return "الرقم مسجّل بالفعل وجاهز للاستخدام! لا تحتاج إعادة تسجيل.";
    if (lower.includes("#100") || lower.includes("invalid parameter"))
      return "فشل تسجيل الرقم. السبب المحتمل: حساب واتساب بزنس غير موثّق أو الرقم يحتاج إعداد إضافي في Meta Business Suite.";
    if (lower.includes("#10") || lower.includes("permission"))
      return "لا توجد صلاحيات كافية. تأكد من منح جميع الأذونات المطلوبة أثناء تسجيل الدخول.";
    if (lower.includes("rate limit") || lower.includes("too many"))
      return "تم إرسال طلبات كثيرة. انتظر بضع دقائق ثم أعد المحاولة.";
    if (lower.includes("token") || lower.includes("expired") || lower.includes("session"))
      return "انتهت صلاحية الجلسة. أعد ربط الرقم من جديد.";
    if (lower.includes("phone number") && lower.includes("not found"))
      return "لم يتم العثور على الرقم في حسابك. تأكد من إضافته في Meta Business Suite.";
    if (lower.includes("two step") || lower.includes("two-step") || lower.includes("pin"))
      return "الرقم محمي بالتحقق بخطوتين. أزل رمز PIN من إعدادات واتساب على هاتفك ثم أعد المحاولة.";
    return raw;
  };

  const completeSignup = async ({ token, phoneId, wabaId }: { token: string; phoneId: string; wabaId: string }) => {
    if (!orgId) { handleError("تعذر تحديد المؤسسة. أعد تسجيل الدخول وحاول مرة أخرى."); return false; }

    const { data, error } = await supabase.functions.invoke("whatsapp-complete-signup", {
      body: { access_token: token, phone_number_id: phoneId, waba_id: wabaId, org_id: orgId, auto_register: true, ...(twoStepPin ? { pin: twoStepPin } : {}) },
    });

    if (error || data?.error) { handleError(friendlyError(data?.error || "فشل في إكمال الربط")); return false; }
    if (!data?.selected_phone || !data?.saved_config) { handleError("تعذر تسجيل الرقم — حاول مرة أخرى"); return false; }

    // Check registration result
    if (data.registration && !data.registration.success) {
      const regError = friendlyError(data.registration.error || "فشل تسجيل الرقم");
      toast.error(regError);
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
          ...(twoStepPin ? { pin: twoStepPin } : {}),
        },
      });
      if (error || data?.error) {
        toast.error(friendlyError(data?.error || "فشل إعادة التسجيل"));
      } else if (data?.registration?.success) {
        toast.success("✅ تم تسجيل الرقم بنجاح!");
      } else {
        toast.error(friendlyError(data?.registration?.error || "خطأ غير معروف"));
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
      <div className="p-3 md:p-6 space-y-8 max-w-[900px]" dir="rtl">
        {renderAllChannelsView([])}
      </div>
    );
  }

  // ============ CHECKLIST BEFORE ADDING NEW NUMBER ============
  if (flowStep === "checklist") {
    return (
      <div className="p-3 md:p-6 max-w-[600px] mx-auto" dir="rtl">
        <div className="bg-card rounded-2xl shadow-card border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              قائمة التحقق قبل الربط
            </h2>
            <p className="text-sm text-muted-foreground mt-1">تأكد من استيفاء هذه المتطلبات في Meta Business Suite قبل إضافة رقم جديد</p>
          </div>
          <div className="p-5 space-y-3">
            {[
              {
                icon: Building2,
                title: "توثيق النشاط التجاري",
                desc: "وثّق حافظة الأعمال (Business Verification) لرفع حدود الإرسال وتفعيل المحادثات",
                link: "https://business.facebook.com/settings/security",
                linkLabel: "تحقق من التوثيق",
                required: false,
              },
              {
                icon: CreditCard,
                title: "وسيلة الدفع",
                desc: "أضف بطاقة ائتمان صالحة في إعدادات الدفع — مطلوبة لإرسال الرسائل التسويقية",
                link: "https://business.facebook.com/billing_hub/payment_methods",
                linkLabel: "إدارة وسائل الدفع",
                required: true,
              },
              {
                icon: PhoneCall,
                title: "رقم واتساب جاهز",
                desc: "رقم غير مربوط بتطبيق واتساب على الهاتف — يجب فصله أولاً قبل ربطه بالمنصة",
                required: true,
              },
              {
                icon: MessageSquare,
                title: "حساب WABA مفعّل",
                desc: "أنشئ حساب WhatsApp Business Account من Meta Business Suite إن لم يكن موجوداً",
                link: "https://business.facebook.com/wa/manage/home",
                linkLabel: "إدارة حسابات WhatsApp",
                required: true,
              },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2.5 bg-muted/30 rounded-lg border border-border p-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <item.icon className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-foreground">{item.title}</p>
                    {item.required ? (
                      <Badge className="bg-destructive/10 text-destructive border-0 text-[9px] px-1.5 py-0">مطلوب</Badge>
                    ) : (
                      <Badge className="bg-warning/10 text-warning border-0 text-[9px] px-1.5 py-0">موصى به</Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
                  {item.link && (
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-primary hover:underline underline-offset-2 mt-1 inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                      {item.linkLabel}
                    </a>
                  )}
                </div>
              </div>
            ))}

            <div className="pt-3 space-y-2">
              <Button onClick={proceedToMetaLogin} disabled={!sdkLoaded} className="w-full gap-2 py-5 text-sm font-bold rounded-xl">
                {!sdkLoaded ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                تأكدت — متابعة الربط
              </Button>
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={resetFlow}>← رجوع</Button>
            </div>
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
    <div className="p-3 md:p-6 space-y-8 max-w-[900px]" dir="rtl">
      {renderAllChannelsView(configs)}
    </div>
  );
};

function ChannelCard({ icon: Icon, iconBg, name, description, status, statusLabel, statusColor, actions, children }: {
  icon: any; iconBg: string; name: string; description: string;
  status?: "connected" | "pending" | "disconnected";
  statusLabel?: string; statusColor?: string;
  actions?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 flex flex-col items-center text-center gap-3 hover:shadow-md transition-shadow min-h-[180px]">
      <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center", iconBg)}>
        <Icon className="w-7 h-7" />
      </div>
      <div>
        <h3 className="font-bold text-sm">{name}</h3>
        {statusLabel && (
          <p className={cn("text-xs mt-0.5 font-medium", statusColor || "text-muted-foreground")}>{statusLabel}</p>
        )}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      {actions && <div className="flex items-center gap-2 flex-wrap justify-center mt-auto">{actions}</div>}
      {children}
    </div>
  );
}

export default IntegrationsPage;
