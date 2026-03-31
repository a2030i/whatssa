import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2, Copy, Loader2, Phone, RefreshCw,
  MessageSquare, KeyRound, Plus, Trash2, Instagram,
  Plug, Radio, Smartphone, Send, AlertTriangle, ExternalLink,
  ShieldCheck, CreditCard, PhoneCall, Building2, Circle, QrCode, Pencil, Check, X
} from "lucide-react";
import WhatsAppWebSection from "@/components/integrations/WhatsAppWebSection";
import SallaIntegrationSection from "@/components/integrations/SallaIntegrationSection";
import ChannelRoutingConfig from "@/components/integrations/ChannelRoutingConfig";
import WhatsAppProfileEditor from "@/components/integrations/WhatsAppProfileEditor";
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
  display_phone: string | null;
  business_name: string | null;
  is_connected: boolean | null;
  org_id: string | null;
  registration_status: string | null;
  registration_error: string | null;
  registered_at: string | null;
  channel_type?: string;
  [key: string]: any;
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
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelText, setEditingLabelText] = useState("");
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
      supabase.from("whatsapp_config_safe").select("*").eq("org_id", orgId).neq("channel_type", "evolution").order("created_at", { ascending: true }),
      supabase.from("organizations").select("plans(max_phone_numbers)").eq("id", orgId).maybeSingle(),
    ]);
    const data = configsRes.data || [];
    setConfigs(data);
    const planData = orgRes?.data as any;
    if (planData?.plans?.max_phone_numbers) setMaxPhones(planData.plans.max_phone_numbers);
    // Fetch Meta status for connected configs — sequentially with delay to avoid rate limits
    if (data) {
      const connected = data.filter(c => c.is_connected && c.phone_number_id);
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
          config_id: config.id,
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
        body: { to: testPhone.trim(), message: "✅ تم الربط بنجاح! هذه رسالة اختبار من Respondly." },
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

  const saveChannelLabel = async (configId: string) => {
    const label = editingLabelText.trim();
    await supabase.from("whatsapp_config").update({ channel_label: label || null }).eq("id", configId);
    setEditingLabelId(null);
    toast.success("تم تحديث اسم القناة");
    loadConfigs();
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

  const renderConfigCard = (config: WhatsAppConfig) => {
    const isConnected = config.registration_status === "connected";
    const isFailed = config.registration_status === "failed";
    const isPending = !config.registration_status || config.registration_status === "pending";
    const isExpanded = expandedId === config.id;
    const ms = metaStatus[config.id];

    return (
      <div key={config.id} className="bg-card rounded-xl border border-border p-4 flex flex-col items-center text-center gap-2 hover:shadow-md transition-shadow">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
          <MessageSquare className="w-7 h-7 text-emerald-600" />
        </div>
        <div className="space-y-1">
          {editingLabelId === config.id ? (
            <div className="flex items-center gap-1.5 justify-center">
              <Input
                value={editingLabelText}
                onChange={(e) => setEditingLabelText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveChannelLabel(config.id); if (e.key === "Escape") setEditingLabelId(null); }}
                className="h-7 text-xs text-center w-36 bg-secondary border-0"
                placeholder="اسم القناة..."
                autoFocus
              />
              <button onClick={() => saveChannelLabel(config.id)} className="text-success hover:text-success/80"><Check className="w-4 h-4" /></button>
              <button onClick={() => setEditingLabelId(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 justify-center group">
              <h3 className="font-bold text-sm">{(config as any).channel_label || "واتساب"}</h3>
              <button
                onClick={() => { setEditingLabelId(config.id); setEditingLabelText((config as any).channel_label || ""); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground font-mono" dir="ltr">
            {config.display_phone || config.phone_number_id}
          </p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          تواصل مع المستخدمين من خلال WhatsApp Business API
        </p>
        <div className="flex items-center gap-2 flex-wrap justify-center mt-auto">
          {isConnected && (
            <Badge className="bg-success/10 text-success border-0 text-xs gap-1 px-3 py-1">
              <CheckCircle2 className="w-3 h-3" /> متصل
            </Badge>
          )}
          {isFailed && (
            <Badge className="bg-destructive/10 text-destructive border-0 text-xs gap-1 px-3 py-1">
              <AlertTriangle className="w-3 h-3" /> فشل التسجيل
            </Badge>
          )}
          {isPending && (
            <Badge className="bg-warning/10 text-warning border-0 text-xs gap-1 px-3 py-1">
              <AlertTriangle className="w-3 h-3" /> معلّق
            </Badge>
          )}
          <Button variant="outline" size="sm" className="text-xs h-8 gap-1 rounded-lg" onClick={() => setExpandedId(isExpanded ? null : config.id)}>
            عرض التفاصيل
          </Button>
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="w-full mt-3 pt-3 border-t border-border space-y-3 text-right animate-fade-in">
            {(isFailed || isPending) && (
              <div className="flex items-center gap-2 justify-center">
                <Input
                  value={twoStepPin}
                  onChange={(e) => setTwoStepPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="PIN (اختياري)"
                  className="bg-secondary border-0 text-xs w-24 h-8 text-center"
                  dir="ltr"
                  maxLength={6}
                />
                <Button variant="outline" size="sm" className="text-xs h-8 gap-1 text-primary" onClick={() => retryRegister(config)} disabled={isLoading}>
                  <RefreshCw className="w-3 h-3" /> تسجيل
                </Button>
              </div>
            )}

            {/* Meta Status */}
            {ms && !ms.isLoading && renderMetaStatus(config, ms)}
            {ms?.isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2 justify-center">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> جاري جلب حالة الرقم...
              </div>
            )}

            {isSuperAdmin && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input value={WEBHOOK_URL} readOnly className="bg-secondary border-0 text-[11px] flex-1" dir="ltr" />
                  <Button size="sm" variant="outline" className="shrink-0 h-8 w-8 p-0" onClick={() => copyToClipboard(WEBHOOK_URL, "URL")}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                  <div><span className="font-medium">Phone ID:</span> <span className="font-mono" dir="ltr">{config.phone_number_id}</span></div>
                  <div><span className="font-medium">WABA ID:</span> <span className="font-mono" dir="ltr">{config.business_account_id}</span></div>
                </div>
              </div>
            )}

            {config.registration_status === "failed" && config.registration_error && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 text-right">
                <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> سبب الفشل
                </p>
                <p className="text-[11px] text-foreground mt-1">{friendlyError(config.registration_error)}</p>
              </div>
            )}

            {/* Profile Editor */}
            {isConnected && (
              <div className="flex justify-center">
                <WhatsAppProfileEditor configId={config.id} channelType="meta_api" />
              </div>
            )}

            {/* Channel Routing */}
            {orgId && (
              <ChannelRoutingConfig
                configId={config.id}
                orgId={orgId}
                defaultTeamId={(config as any).default_team_id}
                defaultAgentId={(config as any).default_agent_id}
              />
            )}

            {config.registered_at && (
              <p className="text-[10px] text-muted-foreground text-center">
                آخر تسجيل: {new Date(config.registered_at).toLocaleString("ar-SA")}
              </p>
            )}

            <Button variant="ghost" size="sm" className="w-full text-xs text-destructive gap-1" onClick={() => handleDisconnect(config.id)}>
              <Trash2 className="w-3 h-3" /> فصل الرقم
            </Button>
          </div>
        )}
      </div>
    );
  };

  const translateHealthIssue = (issue: { entity: string; error: string; solution: string }): { title: string; solution: string; severity: "critical" | "warning"; link?: { url: string; label: string } } | null => {
    const err = issue.error.toLowerCase();
    if (err.includes("sip")) return null;
    
    if (err.includes("not linked") || err.includes("not registered") || err.includes("141000"))
      return { title: "الرقم غير مسجّل في Cloud API", solution: "اضغط زر 'تسجيل' أدناه لتسجيل الرقم، أو انتظر إذا كانت المحاولات كثيرة.", severity: "critical" };
    if (err.includes("payment method") || err.includes("141006"))
      return { title: "مشكلة في طريقة الدفع", solution: "أضف بطاقة ائتمان صالحة في إعدادات حساب واتساب بزنس لتتمكن من إرسال الرسائل.", severity: "critical", link: { url: "https://business.facebook.com/settings/payment-methods", label: "إضافة طريقة دفع ←" } };
    if (err.includes("display name") || err.includes("not been approved"))
      return { title: "اسم العرض قيد المراجعة", solution: "سيتم مراجعة الاسم تلقائياً من Meta. حد الرسائل محدود حتى الاعتماد.", severity: "warning", link: { url: "https://business.facebook.com/settings/whatsapp-business-accounts", label: "متابعة حالة الاسم ←" } };
    if (err.includes("rate limit") || err.includes("too many"))
      return { title: "تجاوز حد المحاولات", solution: "انتظر ساعة إلى ساعتين ثم أعد المحاولة.", severity: "warning" };
    if (err.includes("not verified") || err.includes("verification"))
      return { title: "الحساب غير موثّق", solution: "وثّق نشاطك التجاري من إعدادات الأمان في Meta Business Suite.", severity: "critical", link: { url: "https://business.facebook.com/settings/security", label: "توثيق النشاط التجاري ←" } };
    return { title: `[${issue.entity}] مشكلة`, solution: issue.error, severity: "warning" };
  };

  const renderMetaStatus = (config: WhatsAppConfig, ms: any) => {
    const qualityMap: Record<string, { label: string; color: string }> = {
      GREEN: { label: "عالية", color: "text-success" }, YELLOW: { label: "متوسطة", color: "text-warning" }, RED: { label: "منخفضة", color: "text-destructive" },
    };
    const phoneStatusMap: Record<string, { label: string; color: string }> = {
      VERIFIED: { label: "نشط", color: "text-success" }, NOT_VERIFIED: { label: "غير مفعّل", color: "text-warning" }, PENDING: { label: "معلّق", color: "text-warning" },
      FLAGGED: { label: "مُبلَّغ عنه", color: "text-destructive" }, RESTRICTED: { label: "مقيّد", color: "text-destructive" }, CONNECTED: { label: "متصل", color: "text-success" },
    };
    const quality = ms.qualityRating ? qualityMap[ms.qualityRating] : null;
    const phoneStatus = ms.phoneStatus ? phoneStatusMap[ms.phoneStatus] : null;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-muted-foreground">حالة Meta</p>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => fetchMetaStatus(config, true)}>
            <RefreshCw className="w-2.5 h-2.5" /> تحديث
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {phoneStatus && (
            <div className="bg-muted/50 rounded-lg p-2">
              <p className="text-[10px] text-muted-foreground">الحالة</p>
              <p className={cn("text-xs font-bold", phoneStatus.color)}>{phoneStatus.label}</p>
            </div>
          )}
          {quality && (
            <div className="bg-muted/50 rounded-lg p-2">
              <p className="text-[10px] text-muted-foreground">الجودة</p>
              <p className={cn("text-xs font-bold", quality.color)}>{quality.label}</p>
            </div>
          )}
        </div>
        {ms.healthIssues && ms.healthIssues.length > 0 && (
          <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 space-y-2">
            <p className="text-[11px] font-semibold text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> مشاكل تحتاج معالجة
            </p>
            {ms.healthIssues.map((issue: any, i: number) => {
              const translated = translateHealthIssue(issue);
              if (!translated) return null;
              return (
                <div key={i} className="bg-background/50 rounded-md p-2 space-y-1">
                  <p className="text-[11px] font-medium text-foreground flex items-center gap-1">
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", translated.severity === "critical" ? "bg-destructive" : "bg-warning")} />
                    {translated.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground pr-3">{translated.solution}</p>
                  {translated.link && (
                    <a
                      href={translated.link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline pr-3"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {translated.link.label}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderAllChannelsView = (currentConfigs: WhatsAppConfig[]) => {
    const connectedOfficialConfigs = currentConfigs.filter(c => !(c as any).channel_type || (c as any).channel_type !== "evolution");
    const hasConnected = connectedOfficialConfigs.length > 0;

    return (
      <>
        {/* Connected Numbers */}
        {hasConnected && (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-foreground">الأرقام المتصلة</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {connectedOfficialConfigs.map(renderConfigCard)}
            </div>
          </div>
        )}

        {/* All Channels */}
        <div className="space-y-3">
          <h2 className="text-base font-bold text-foreground">قنوات التواصل</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* WhatsApp Official */}
            <ChannelCard
              icon={MessageSquare}
              iconBg="bg-emerald-500/10 text-emerald-600"
              name="واتساب"
              description="WhatsApp Business API"
              actions={
                hasConnected ? (
                  <div className="flex flex-col items-center gap-1.5">
                    <Badge className="bg-success/10 text-success border-0 text-[10px] gap-1 px-2 py-0.5">
                      <CheckCircle2 className="w-2.5 h-2.5" /> متصل ({connectedOfficialConfigs.length})
                    </Badge>
                    {(connectedOfficialConfigs.length < maxPhones || isSuperAdmin) && (
                      <Button size="sm" variant="outline" className="text-[10px] h-7 gap-1 rounded-lg" onClick={startConnect} disabled={!sdkLoaded}>
                        <Plus className="w-3 h-3" /> إضافة رقم
                      </Button>
                    )}
                  </div>
                ) : (
                  <Button size="sm" className="text-[10px] h-8 gap-1 rounded-lg px-4" onClick={startConnect} disabled={!sdkLoaded || isLoading}>
                    {!sdkLoaded ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    يتصل
                  </Button>
                )
              }
            />

            {/* WhatsApp Web */}
            <div className="bg-card rounded-xl border border-border p-4 flex flex-col items-center text-center gap-2 hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
                <QrCode className="w-5 h-5 text-warning" />
              </div>
              <div>
                <h3 className="font-bold text-xs">واتساب ويب</h3>
                <Badge variant="outline" className="text-[8px] px-1 py-0 text-warning border-warning/30 mt-0.5">غير رسمي</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">ربط عبر مسح QR</p>
              <div className="w-full mt-auto">
                <WhatsAppWebSection orgId={orgId} isSuperAdmin={isSuperAdmin} />
              </div>
            </div>

            {/* Instagram */}
            <ChannelCard
              icon={Instagram}
              iconBg="bg-pink-500/10 text-pink-500"
              name="انستغرام"
              description="Instagram Business API"
              actions={<Badge variant="outline" className="text-[10px] px-2 py-0.5">قريباً</Badge>}
            />

            {/* Telegram */}
            <ChannelCard
              icon={Radio}
              iconBg="bg-blue-500/10 text-blue-500"
              name="تيليغرام"
              description="استقبال رسائل تيليغرام"
              actions={<Badge variant="outline" className="text-[10px] px-2 py-0.5">قريباً</Badge>}
            />

            {/* SMS */}
            <ChannelCard
              icon={Smartphone}
              iconBg="bg-violet-500/10 text-violet-500"
              name="رسالة قصيرة"
              description="إرسال واستقبال SMS"
              actions={<Badge variant="outline" className="text-[10px] px-2 py-0.5">قريباً</Badge>}
            />

            {/* Phone */}
            <ChannelCard
              icon={PhoneCall}
              iconBg="bg-sky-500/10 text-sky-500"
              name="هاتف"
              description="مكالمات صوتية"
              actions={<Badge variant="outline" className="text-[10px] px-2 py-0.5">قريباً</Badge>}
            />
          </div>
        </div>

        {/* E-commerce Integrations */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-foreground">تكاملات المتاجر الإلكترونية</h2>
          <div className="bg-card rounded-2xl border border-border p-5">
            <SallaIntegrationSection />
          </div>
        </div>

        {/* Manual Connect for Super Admin */}
        {isSuperAdmin && (
          <div className="pt-2">
            <button
              onClick={() => setShowManual(!showManual)}
              className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2"
            >
              {showManual ? "إخفاء الربط اليدوي" : "ربط يدوي (متقدم)"}
            </button>
            {showManual && (
              <div className="mt-3 bg-card border border-border rounded-xl p-4 space-y-3 max-w-md">
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
      </>
    );
  };

  // ============ EMPTY STATE: Show all channels ============
  if (configs.length === 0 && flowStep === "idle") {
    return (
      <div className="p-3 md:p-6 space-y-6 max-w-5xl" dir="rtl">
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
    <div className="p-3 md:p-6 space-y-6 max-w-5xl" dir="rtl">
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
    <div className="bg-card rounded-xl border border-border p-4 flex flex-col items-center text-center gap-2 hover:shadow-md transition-shadow">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", iconBg)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h3 className="font-bold text-xs">{name}</h3>
        {statusLabel && (
          <p className={cn("text-[10px] mt-0.5 font-medium", statusColor || "text-muted-foreground")}>{statusLabel}</p>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">{description}</p>
      {actions && <div className="flex items-center gap-2 flex-wrap justify-center mt-auto">{actions}</div>}
      {children}
    </div>
  );
}

export default IntegrationsPage;
