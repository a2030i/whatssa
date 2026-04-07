import { useState, useEffect, useCallback, useRef } from "react";
import {
  CheckCircle2, Copy, Loader2, Phone, RefreshCw,
  MessageSquare, KeyRound, Plus, Trash2, Send,
  AlertTriangle, ExternalLink, ArrowLeftRight, ArrowRight,
  ShieldCheck, CreditCard, PhoneCall, Building2, QrCode, Pencil, Check, X, Smartphone,
  LogOut, Shield, Clock, Gauge, Settings, Globe
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import WhatsAppWebSection from "@/components/integrations/WhatsAppWebSection";
import SallaIntegrationSection from "@/components/integrations/SallaIntegrationSection";
import ChannelRoutingConfig from "@/components/integrations/ChannelRoutingConfig";
import WhatsAppProfileEditor from "@/components/integrations/WhatsAppProfileEditor";
import { QRCodeSection } from "@/components/integrations/CatalogQRSection";
import EmailConfigSection from "@/components/integrations/EmailConfigSection";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase, invokeCloud } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const WEBHOOK_URL = `https://dgnqehcezvewkdodqpyh.supabase.co/functions/v1/whatsapp-webhook`;
const DEFAULT_META_APP_ID = "1306128431426603";
const DEFAULT_META_CONFIG_ID = "1492677925851114";

interface PhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
  waba_id?: string;
  status?: string;
}

interface WabaResult {
  waba_id: string;
  phone_numbers: PhoneNumber[];
}

interface EmbeddedSignupSelection {
  phoneNumberId: string;
  wabaId: string;
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
  onboarding_type?: string;
  migration_source?: string;
  migration_status?: string;
  migration_error?: string;
  migrated_at?: string;
  previous_provider?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
  meta_business_id?: string;
  [key: string]: any;
}

type OnboardingMode = "new" | "migrate_app" | "migrate_provider";

type FlowStep = "idle" | "choose_type" | "checklist" | "migration_info" | "connecting" | "pick_phone" | "migration_prereqs" | "success" | "error" | "manual_token";

const IntegrationsPage = () => {
  const { orgId, isSuperAdmin, isImpersonating } = useAuth();
  const [configs, setConfigs] = useState<WhatsAppConfig[]>([]);
  const [maxPhones, setMaxPhones] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [flowStep, setFlowStep] = useState<FlowStep>("idle");
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [accessToken, setAccessToken] = useState("");
  const fbCallbackFiredRef = useRef(false);
  const postMessageHandledRef = useRef(false);
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isReviewMode, setIsReviewMode] = useState(() => window.localStorage.getItem("meta-review-mode") === "1");

  useEffect(() => {
    window.localStorage.setItem("meta-review-mode", isReviewMode ? "1" : "0");
  }, [isReviewMode]);

  const t = useCallback((ar: string, en: string) => isReviewMode ? en : ar, [isReviewMode]);
  const dir = isReviewMode ? "ltr" : "rtl";
  // Manual connect removed
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedChannelBadgeId, setExpandedChannelBadgeId] = useState<string | null>(null);
  const [expandedFullSettingsId, setExpandedFullSettingsId] = useState<string | null>(null);
  const [connectedPhone, setConnectedPhone] = useState<string>("");
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelText, setEditingLabelText] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [showWhatsAppChoice, setShowWhatsAppChoice] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [twoStepPin, setTwoStepPin] = useState("");
  const [onboardingMode, setOnboardingMode] = useState<OnboardingMode>("new");
  // Manual token connect state
  const [manualAccessToken, setManualAccessToken] = useState("");
  const [manualPhoneNumberId, setManualPhoneNumberId] = useState("");
  const [manualWabaId, setManualWabaId] = useState("");
  const [manualConnecting, setManualConnecting] = useState(false);
  const [migrationPrereqs, setMigrationPrereqs] = useState<{ ready: boolean; issues: string[] } | null>(null);
  const [previousProvider, setPreviousProvider] = useState("");
  const [wabaInfo, setWabaInfo] = useState<any>(null);
  const [webhookStatus, setWebhookStatus] = useState<{ app_webhook: boolean | null; waba_subscription: boolean | null; auto_configured: boolean } | null>(null);
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
  const [unofficialConfigs, setUnofficialConfigs] = useState<WhatsAppConfig[]>([]);
  const [unofficialTestPhone, setUnofficialTestPhone] = useState("");
  const [unofficialTestSending, setUnofficialTestSending] = useState(false);
  const [unofficialCheckingStatus, setUnofficialCheckingStatus] = useState<string | null>(null);
  const [syncingUnofficialPhoneIds, setSyncingUnofficialPhoneIds] = useState<string[]>([]);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [reconnectQr, setReconnectQr] = useState<string | null>(null);
  const [syncingMessagesId, setSyncingMessagesId] = useState<string | null>(null);
  const [metaAppId, setMetaAppId] = useState("");
  const [metaConfigId, setMetaConfigId] = useState("");
  const [officialEnabled, setOfficialEnabled] = useState(false);
  const [metaSettingsLoaded, setMetaSettingsLoaded] = useState(false);
  const embeddedSignupSelectionRef = useRef<EmbeddedSignupSelection | null>(null);

  const rememberEmbeddedSignupSelection = useCallback((selection: EmbeddedSignupSelection) => {
    embeddedSignupSelectionRef.current = selection;
  }, []);

  const clearEmbeddedSignupSelection = useCallback(() => {
    embeddedSignupSelectionRef.current = null;
  }, []);

  // Load Meta settings first, then load SDK with correct appId
  useEffect(() => {
    invokeCloud("get-meta-settings").then(({ data, error }) => {
      console.log("[get-meta-settings] raw response:", { data, error });
      let settings: any[] = [];
      if (Array.isArray(data)) {
        settings = data;
      } else if (typeof data === "string") {
        try { settings = JSON.parse(data); } catch { /* ignore */ }
      }
      let appId = DEFAULT_META_APP_ID;
      let configId = DEFAULT_META_CONFIG_ID;
      settings.forEach((s: any) => {
        if (s.key === "meta_app_id" && s.value) appId = String(s.value);
        if (s.key === "meta_config_id" && s.value) configId = String(s.value);
        if (s.key === "official_whatsapp_enabled") setOfficialEnabled(s.value === true || s.value === "true");
      });
      setMetaAppId(appId);
      setMetaConfigId(configId);
      setMetaSettingsLoaded(true);
    }).catch((err) => {
      console.warn("[get-meta-settings] failed, using defaults:", err);
      setMetaAppId(DEFAULT_META_APP_ID);
      setMetaConfigId(DEFAULT_META_CONFIG_ID);
      setOfficialEnabled(true);
      setMetaSettingsLoaded(true);
    });
  }, []);

  // Load Facebook SDK only after we have the correct appId
  useEffect(() => {
    if (!metaSettingsLoaded || !metaAppId) return;
    loadFacebookSDK();
  }, [metaSettingsLoaded, metaAppId]);

  useEffect(() => {
    if (orgId) loadConfigs();
  }, [orgId]);

  // Smart recovery: when in "connecting" state, poll to detect popup closure
  // If FB.login callback never fired, try recovering the token or check DB
  useEffect(() => {
    if (flowStep !== "connecting") return;
    let cancelled = false;
    let elapsed = 0;
    const POLL_MS = 2000;
    const MAX_MS = 180000; // 3 min absolute max

    const interval = setInterval(async () => {
      elapsed += POLL_MS;

      // If callback already fired, the flow will transition on its own — stop polling
      if (fbCallbackFiredRef.current || cancelled) {
        clearInterval(interval);
        return;
      }

      // After 10s start checking if popup was closed (user returned to page)
      if (elapsed >= 10000) {
        // Try FB.getAuthResponse as a last-ditch effort
        try {
          const FB = (window as any).FB;
          if (FB) {
            const auth = FB.getAuthResponse();
            if (auth?.accessToken) {
              console.log("[Embedded Signup] Recovered token via FB.getAuthResponse after popup close");
              clearInterval(interval);
              if (!cancelled) handleDirectToken(auth.accessToken);
              return;
            }
          }
        } catch { /* ignore */ }

        // Check if a new channel appeared in the DB (connection completed server-side)
        try {
          const { data: freshConfigs } = await supabase.rpc("get_org_whatsapp_channels");
          const orgConfigs = ((freshConfigs || []) as WhatsAppConfig[]).filter(
            (c) => c.org_id === orgId && c.channel_type !== "evolution" && c.is_connected && c.phone_number_id
          );
          const existingIds = configs.map(c => c.id);
          const newChannel = orgConfigs.find(c => !existingIds.includes(c.id));
          if (newChannel) {
            console.log("[Embedded Signup] Found new connected channel in DB, recovering");
            clearInterval(interval);
            if (!cancelled) {
              setFlowStep("idle");
              setIsLoading(false);
              await loadConfigs(true);
              toast.success("تم ربط الرقم بنجاح!");
            }
            return;
          }
        } catch { /* ignore */ }
      }

      // Absolute timeout
      if (elapsed >= MAX_MS) {
        clearInterval(interval);
        if (!cancelled) {
          console.warn("[Embedded Signup] Watchdog: connecting state timed out after 3min");
          setFlowStep("idle");
          setIsLoading(false);
          loadConfigs(true);
          toast.info("انتهت مهلة الربط — تحقق من حالة القناة أو أعد المحاولة");
        }
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [flowStep]);

  const loadConfigs = async (skipAutoSync = false) => {
    if (!orgId) return;
    const [allConfigsRes, orgRes] = await Promise.all([
      supabase.rpc("get_org_whatsapp_channels"),
      supabase.from("organizations").select("plans(max_phone_numbers)").eq("id", orgId).maybeSingle(),
    ]);

    const allConfigs = ((allConfigsRes.data || []) as WhatsAppConfig[]).filter((config) => config.org_id === orgId);
    const officialConfigs = allConfigs.filter((config) => config.channel_type !== "evolution");
    const unofficial = allConfigs.filter((config) => config.channel_type === "evolution");

    setConfigs(officialConfigs);
    setUnofficialConfigs(unofficial);

    // Auto-sync Evolution channels on initial load: check live status + missing phone numbers
    if (!skipAutoSync) {
      const connectedUnofficial = unofficial.filter((uc) => uc.evolution_instance_name);
      const needsPhoneSync = connectedUnofficial.filter((uc) => uc.is_connected && uc.evolution_instance_status === "connected" && !uc.display_phone);
      setSyncingUnofficialPhoneIds(connectedUnofficial.map((uc) => uc.id));

      if (connectedUnofficial.length > 0) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          // Check live status for ALL evolution channels to sync DB state
          await Promise.allSettled(
            connectedUnofficial.map((uc) =>
              invokeCloud("evolution-manage", {
                body: { action: "status", instance_name: uc.evolution_instance_name },
              })
            )
          );

          const { data: refreshed } = await supabase.rpc("get_org_whatsapp_channels");
          const updated = ((refreshed || []) as WhatsAppConfig[]).filter((c) => c.org_id === orgId && c.channel_type === "evolution");
          setUnofficialConfigs(updated);
        }
      }

      setSyncingUnofficialPhoneIds([]);
    } else {
      setSyncingUnofficialPhoneIds([]);
    }

    const planData = orgRes?.data as any;
    if (planData?.plans?.max_phone_numbers) setMaxPhones(planData.plans.max_phone_numbers);

    const connected = officialConfigs.filter((config) => config.is_connected && config.phone_number_id);
    for (let i = 0; i < connected.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 2000));
      fetchMetaStatus(connected[i]);
    }
  };

  const fetchMetaStatus = async (config: WhatsAppConfig, force = false) => {
    // Skip if already fetched recently (within 60s) unless forced
    const existing = metaStatus[config.id];
    if (!force && existing && !existing.isLoading && existing.phoneStatus) return;

    setMetaStatus(p => ({ ...p, [config.id]: { ...p[config.id], isLoading: true } }));
    try {
      const { data, error } = await invokeCloud("whatsapp-check-status", {
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
        loadConfigs(true);
      } else if (data.phone?.status === "CONNECTED" && config.registration_status !== "connected") {
        await supabase.from("whatsapp_config").update({
          is_connected: true,
          registration_status: "connected",
          registration_error: null,
          registered_at: new Date().toISOString(),
        }).eq("id", config.id);
        loadConfigs(true);
      }
    } catch {
      setMetaStatus(p => ({ ...p, [config.id]: { isLoading: false } }));
    }
  };

  const loadFacebookSDK = () => {
    // Add session logging event listener for Embedded Signup v4
    if (!(window as any).__waEsListenerAdded) {
      window.addEventListener('message', (event) => {
        if (event.origin && !event.origin.endsWith('facebook.com')) return;
        try {
          const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
          if (!data || typeof data !== "object") return;
          if (data.type === 'WA_EMBEDDED_SIGNUP') {
            console.log('[Embedded Signup] session event:', data);
            // Store phone_number_id and waba_id from session info
            if (data.data?.phone_number_id && data.data?.waba_id) {
              rememberEmbeddedSignupSelection({
                phoneNumberId: data.data.phone_number_id,
                wabaId: data.data.waba_id,
              });
              console.log('[Embedded Signup] Got IDs from session:', data.data.phone_number_id, data.data.waba_id);
            }

            // CANCEL: user exited before completing — immediately leave connecting state
            if (data.event === 'CANCEL') {
              console.log('[Embedded Signup] User cancelled at step:', data.data?.current_step);
              // Give FB.login callback a brief grace period (it might still fire)
              setTimeout(() => {
                if (!fbCallbackFiredRef.current && !postMessageHandledRef.current) {
                  postMessageHandledRef.current = true;
                  setFlowStep("idle");
                  setIsLoading(false);
                  toast.info("تم إلغاء عملية الربط");
                }
              }, 2000);
            }

            // FINISH: user completed the flow — try to recover token immediately
            if (data.event === 'FINISH') {
              console.log('[Embedded Signup] User finished signup flow');
              // Give FB.login callback a brief grace period
              setTimeout(() => {
                if (!fbCallbackFiredRef.current && !postMessageHandledRef.current) {
                  postMessageHandledRef.current = true;
                  console.log('[Embedded Signup] FB.login callback not received, recovering via postMessage FINISH');
                  // Try FB.getAuthResponse
                  try {
                    const FB = (window as any).FB;
                    if (FB) {
                      const auth = FB.getAuthResponse();
                      if (auth?.code) {
                        handleCodeExchange(auth.code);
                        return;
                      }
                      if (auth?.accessToken) {
                        handleDirectToken(auth.accessToken);
                        return;
                      }
                    }
                  } catch { /* ignore */ }
                  // Fallback: if we have embedded selection IDs, check DB after a delay
                  const selection = embeddedSignupSelectionRef.current;
                  if (selection?.phoneNumberId && selection?.wabaId) {
                    console.log('[Embedded Signup] Using postMessage IDs to check DB');
                    // Check DB for new channel after short delay
                    setTimeout(async () => {
                      try {
                        const { data: freshConfigs } = await supabase.rpc("get_org_whatsapp_channels");
                        const orgConfigs = ((freshConfigs || []) as WhatsAppConfig[]).filter(
                          (c: WhatsAppConfig) => c.org_id === orgId && c.channel_type !== "evolution" && c.is_connected
                        );
                        if (orgConfigs.length > configs.length) {
                          setFlowStep("idle");
                          setIsLoading(false);
                          await loadConfigs(true);
                          toast.success("تم ربط الرقم بنجاح!");
                          return;
                        }
                      } catch { /* ignore */ }
                      // If still nothing, show informational message
                      setFlowStep("idle");
                      setIsLoading(false);
                      loadConfigs(true);
                      toast.info("اكتملت العملية — تحقق من حالة القناة");
                    }, 5000);
                  } else {
                    setFlowStep("idle");
                    setIsLoading(false);
                    loadConfigs(true);
                    toast.info("اكتملت العملية — تحقق من حالة القناة");
                  }
                }
              }, 3000);
            }
          }
        } catch {
          // non-JSON message, ignore
        }
      });
      (window as any).__waEsListenerAdded = true;
    }

    if (document.getElementById("facebook-jssdk")) {
      const FB = (window as any).FB;
      if (FB) {
        FB.init({ appId: metaAppId, autoLogAppEvents: true, xfbml: true, version: "v22.0" });
        setSdkLoaded(true);
      }
      return;
    }
    (window as any).fbAsyncInit = function () {
      (window as any).FB.init({ appId: metaAppId, autoLogAppEvents: true, xfbml: true, version: "v22.0" });
      setSdkLoaded(true);
    };
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    document.body.appendChild(script);
  };

  const startConnect = useCallback(() => {
    if (configs.length >= maxPhones && !isSuperAdmin) {
      toast.error(`وصلت للحد الأقصى (${maxPhones} رقم). ترقّ لباقة أعلى لإضافة أرقام جديدة.`);
      return;
    }
    clearEmbeddedSignupSelection();
    // Always show type chooser first
    setFlowStep("choose_type");
    setOnboardingMode("new");
    setPreviousProvider("");
    setMigrationPrereqs(null);
    setWabaInfo(null);
  }, [clearEmbeddedSignupSelection, configs, maxPhones, isSuperAdmin]);

  const proceedFromTypeChoice = useCallback(() => {
    if (onboardingMode === "new") {
      setFlowStep("checklist");
    } else {
      setFlowStep("migration_info");
    }
  }, [onboardingMode]);

  const proceedToMetaLogin = useCallback(() => {
    const FB = (window as any).FB;
    if (!FB) { toast.error("جاري تحميل SDK..."); return; }

    clearEmbeddedSignupSelection();
    fbCallbackFiredRef.current = false;
    postMessageHandledRef.current = false;
    setFlowStep("connecting");
    setIsLoading(true);
    setErrorMessage("");

    console.log("[Embedded Signup] Starting FB.login with config_id:", metaConfigId, "appId:", metaAppId);

    FB.login(
      (response: any) => {
        fbCallbackFiredRef.current = true;
        postMessageHandledRef.current = true; // Prevent postMessage handler from double-processing
        console.log("[Embedded Signup] FB.login response:", JSON.stringify(response));
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
          // Log the full response for debugging
          console.error("[Embedded Signup] No authResponse. Status:", response?.status, "Full:", JSON.stringify(response));
          const fbStatus = response?.status;
          const statusMessages: Record<string, string> = {
            "not_authorized": "لم يتم منح الصلاحيات المطلوبة — أعد المحاولة واقبل جميع الأذونات",
            "unknown": "انتهت الجلسة أو تم إلغاء العملية من نافذة ميتا",
            "connected": "تم الاتصال لكن لم يتم الحصول على بيانات المصادقة",
          };
          const detail = statusMessages[fbStatus] || `تم إلغاء العملية أو حدث خطأ (الحالة: ${fbStatus || "غير معروفة"})`;
          handleError(detail);
        }
      },
      {
        config_id: metaConfigId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
        },
      }
    );
  }, [clearEmbeddedSignupSelection, metaConfigId, metaAppId, onboardingMode]);

  const handleCodeExchange = async (code: string) => {
    try {
      console.log("[Embedded Signup] Exchanging code for token...");
      const { data, error } = await invokeCloud("whatsapp-exchange-token", { body: { code } });
      console.log("[Embedded Signup] Exchange result:", { data: data ? "received" : "null", error });
      if (error || data?.error) {
        handleError(data?.error || "فشل في تبادل الرمز");
        return;
      }
      if (data.access_token) {
        handleDirectToken(data.access_token);
      } else {
        handleError("لم يتم الحصول على التوكن");
      }
    } catch (e) {
      console.error("[Embedded Signup] Code exchange error:", e);
      handleError("حدث خطأ أثناء الربط");
    }
  };

  const handleDirectToken = async (token: string) => {
    try {
      setAccessToken(token);
      const embeddedSelection = embeddedSignupSelectionRef.current;
      console.log("[Embedded Signup] Calling exchange-token with access_token...");
      const { data, error } = await invokeCloud("whatsapp-exchange-token", { body: { access_token: token } });
      console.log("[Embedded Signup] Exchange response:", JSON.stringify({ 
        error, 
        waba_ids: data?.waba_ids, 
        resultsCount: data?.results?.length,
        message: data?.message,
        businesses: data?.businesses?.length,
      }));
      if (error || data?.error) { handleError(data?.error || "فشل في جلب بيانات الحساب"); return; }

      const allPhones: PhoneNumber[] = [];
      if (data.results?.length > 0) {
        data.results.forEach((r: WabaResult) => {
          console.log("[Embedded Signup] WABA:", r.waba_id, "phones:", r.phone_numbers?.length);
          allPhones.push(...(r.phone_numbers || []).map((phone) => ({
            ...phone,
            waba_id: r.waba_id,
          })));
        });
      }

      console.log("[Embedded Signup] Total phones found:", allPhones.length);

      if (embeddedSelection?.phoneNumberId && embeddedSelection?.wabaId) {
        const selectedPhone = allPhones.find((phone) => phone.id === embeddedSelection.phoneNumberId);

        if (selectedPhone) {
          console.log("[Embedded Signup] Using exact phone selected in popup:", embeddedSelection.phoneNumberId);
          setBusinessAccountId(embeddedSelection.wabaId);
          await selectPhone(selectedPhone, token, embeddedSelection.wabaId);
          return;
        }
      }

      if (allPhones.length === 1) {
        const selectedPhone = allPhones[0];
        setBusinessAccountId(selectedPhone.waba_id || "");
        await selectPhone(selectedPhone, token, selectedPhone.waba_id);
      } else if (allPhones.length > 0) {
        setBusinessAccountId(allPhones[0].waba_id || "");
        setPhoneNumbers(allPhones);
        setFlowStep("pick_phone");
        setIsLoading(false);
      } else if (embeddedSelection?.phoneNumberId && embeddedSelection?.wabaId) {
        console.warn("[Embedded Signup] No phones returned from token lookup, using popup-selected IDs fallback");
        setBusinessAccountId(embeddedSelection.wabaId);
        await selectPhone({
          id: embeddedSelection.phoneNumberId,
          display_phone_number: "",
          verified_name: "",
          quality_rating: "",
          waba_id: embeddedSelection.wabaId,
        }, token, embeddedSelection.wabaId);
      } else {
        console.error("[Embedded Signup] No phones found. WABA IDs:", data.waba_ids, "Message:", data.message);
        handleError("لا توجد أرقام واتساب مربوطة بحسابك");
      }
    } catch (e) {
      console.error("[Embedded Signup] handleDirectToken error:", e);
      handleError("حدث خطأ");
    }
  };

  const selectPhone = async (phone: PhoneNumber, token?: string, wabaId?: string) => {
    setIsLoading(true);
    try {
      const result = await completeSignup({
        token: token || accessToken,
        phoneId: phone.id,
        wabaId: wabaId || phone.waba_id || businessAccountId,
      });
      if (result) {
        const resolvedDisplayPhone = phone.display_phone_number || result?.selected_phone?.display_phone_number || result?.saved_config?.display_phone || "";
        // If migration, check prereqs before showing success
        if (result.migration_prereqs && !result.migration_prereqs.ready) {
          setMigrationPrereqs(result.migration_prereqs);
          setWabaInfo(result.waba_details);
          setConnectedPhone(resolvedDisplayPhone);
          setFlowStep("migration_prereqs");
        } else {
          setConnectedPhone(resolvedDisplayPhone);
          setWabaInfo(result.waba_details);
          setWebhookStatus(result.webhook_status || null);
          setFlowStep("success");
        }
        clearEmbeddedSignupSelection();
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
      return "آخر محاولة وصلت إلى ميتا وتم رفضها بسبب كثرة محاولات التسجيل لهذا الرقم. إذا مر أكثر من 24 ساعة بدون محاولات جديدة وما زالت المشكلة مستمرة، فأعد الربط الكامل للرقم وتحقق من قيود حساب الأعمال في ميتا.";
    if (lower.includes("token") || lower.includes("expired") || lower.includes("session"))
      return "انتهت صلاحية الجلسة. أعد ربط الرقم من جديد.";
    if (lower.includes("phone number") && lower.includes("not found"))
      return "لم يتم العثور على الرقم في حسابك. تأكد من إضافته في Meta Business Suite.";
    if (lower.includes("two step") || lower.includes("two-step") || lower.includes("pin"))
      return "الرقم محمي بالتحقق بخطوتين. أزل رمز PIN من إعدادات واتساب على هاتفك ثم أعد المحاولة.";
    return raw;
  };

  const completeSignup = async ({ token, phoneId, wabaId }: { token: string; phoneId: string; wabaId: string }): Promise<any> => {
    if (!orgId) { handleError("تعذر تحديد المؤسسة. أعد تسجيل الدخول وحاول مرة أخرى."); return null; }

    const migrationBody: Record<string, any> = {
      access_token: token, phone_number_id: phoneId, waba_id: wabaId, org_id: orgId, auto_register: true,
      ...(twoStepPin ? { pin: twoStepPin } : {}),
    };
    if (onboardingMode === "migrate_app") {
      migrationBody.migration_source = "business_app";
    } else if (onboardingMode === "migrate_provider") {
      migrationBody.migration_source = "other_provider";
      if (previousProvider) migrationBody.previous_provider = previousProvider;
    }

    const { data, error } = await invokeCloud("whatsapp-complete-signup", { body: migrationBody });

    if (error || data?.error) { handleError(friendlyError(data?.error || "فشل في إكمال الربط")); return null; }
    if (!data?.selected_phone || !data?.saved_config) { handleError("تعذر تسجيل الرقم — حاول مرة أخرى"); return null; }

    // Check registration result
    if (data.registration && !data.registration.success) {
      const regError = friendlyError(data.registration.error || "فشل تسجيل الرقم");
      toast.error(regError);
    }

    await loadConfigs(true);
    return data;
  };

  const handleError = (msg: string) => {
    setErrorMessage(msg);
    setFlowStep("error");
    setIsLoading(false);
  };

  // Manual token connect handler
  const handleManualTokenConnect = async () => {
    if (!manualAccessToken.trim() || !manualPhoneNumberId.trim() || !manualWabaId.trim()) {
      toast.error("جميع الحقول مطلوبة");
      return;
    }
    if (!orgId) { toast.error("تعذر تحديد المؤسسة"); return; }
    setManualConnecting(true);
    try {
      const { data, error } = await invokeCloud("whatsapp-complete-signup", {
        body: {
          access_token: manualAccessToken.trim(),
          phone_number_id: manualPhoneNumberId.trim(),
          waba_id: manualWabaId.trim(),
          org_id: orgId,
          auto_register: true,
          ...(twoStepPin ? { pin: twoStepPin } : {}),
        },
      });
      if (error || data?.error) {
        handleError(friendlyError(data?.error || "فشل في إكمال الربط"));
      } else if (!data?.selected_phone || !data?.saved_config) {
        handleError("تعذر تسجيل الرقم — حاول مرة أخرى");
      } else {
        if (data.registration && !data.registration.success) {
          toast.error(friendlyError(data.registration.error || "فشل تسجيل الرقم"));
        }
        setConnectedPhone(data.selected_phone?.display_phone_number || manualPhoneNumberId);
        setWabaInfo(data.waba_details);
        setWebhookStatus(data.webhook_status || null);
        setFlowStep("success");
        await loadConfigs(true);
      }
    } catch {
      handleError("حدث خطأ أثناء الربط");
    }
    setManualConnecting(false);
  };

  const handleDisconnect = async (configId: string) => {
    if (!confirm("هل تريد فصل هذا الرقم؟")) return;
    await supabase.from("whatsapp_config").delete().eq("id", configId);
    toast.success("تم فصل الرقم");
    loadConfigs(true);
  };

  const retryRegister = async (config: WhatsAppConfig) => {
    setIsLoading(true);
    try {
      const { data, error } = await invokeCloud("whatsapp-complete-signup", {
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
      await loadConfigs(true);
    } catch {
      toast.error("حدث خطأ");
    }
    setIsLoading(false);
  };

  const sendTestMessage = async () => {
    if (!testPhone.trim()) { toast.error("أدخل رقم الهاتف"); return; }
    setTestSending(true);
    try {
      const { data, error } = await invokeCloud("whatsapp-send", {
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
    loadConfigs(true);
  };

  const resetFlow = () => {
    setFlowStep("idle");
    setPhoneNumbers([]);
    setErrorMessage("");
    setIsLoading(false);
    setConnectedPhone("");
    setTestPhone("");
    setOnboardingMode("new");
    setPreviousProvider("");
    setMigrationPrereqs(null);
    setWabaInfo(null);
    setWebhookStatus(null);
    setManualAccessToken("");
    setManualPhoneNumberId("");
    setManualWabaId("");
    setManualConnecting(false);
  };

  const onboardingTypeLabel = (type?: string) => {
    if (type === "migrated") return "منقول";
    if (type === "existing") return "موجود";
    return "جديد";
  };

  const migrationIssueLabel = (issue: string) => {
    const map: Record<string, { title: string; desc: string; link?: string }> = {
      business_not_verified: { title: "النشاط التجاري غير موثّق", desc: "وثّق نشاطك من إعدادات الأمان في Meta Business Suite", link: "https://business.facebook.com/settings/security" },
      account_not_approved: { title: "حساب WABA غير معتمد", desc: "يجب اعتماد حسابك من ميتا قبل نقل الرقم", link: "https://business.facebook.com/settings/whatsapp-business-accounts" },
      payment_method_missing: { title: "طريقة الدفع مفقودة", desc: "أضف بطاقة ائتمان في إعدادات الدفع", link: "https://business.facebook.com/billing_hub/payment_methods" },
      phone_not_registered: { title: "الرقم غير مسجّل", desc: "سيتم تسجيل الرقم تلقائياً بعد النقل" },
    };
    return map[issue] || { title: issue, desc: "" };
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
          {config.onboarding_type && config.onboarding_type !== "new" && (
            <Badge className="bg-primary/10 text-primary border-0 text-[10px] gap-1 px-2 py-0.5">
              <ArrowLeftRight className="w-2.5 h-2.5" /> {onboardingTypeLabel(config.onboarding_type)}
            </Badge>
          )}
          {config.migration_status === "pending" && (
            <Badge className="bg-warning/10 text-warning border-0 text-[10px] gap-1 px-2 py-0.5">
              <Loader2 className="w-2.5 h-2.5 animate-spin" /> نقل جارٍ
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

            {config.registered_at && (
              <p className="text-[10px] text-muted-foreground text-center">
                آخر تسجيل: {new Date(config.registered_at).toLocaleString("ar-SA-u-ca-gregory")}
              </p>
            )}

            {/* Test Message */}
            {isConnected && (
              <div className="bg-muted/30 rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Send className="w-4 h-4 text-primary" />
                  <h4 className="text-xs font-bold">إرسال رسالة اختبار</h4>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="9665xxxxxxxx"
                    className="h-8 text-xs flex-1"
                    dir="ltr"
                  />
                  <Button size="sm" className="h-8 text-xs gap-1 shrink-0" onClick={sendTestMessage} disabled={testSending || !testPhone}>
                    {testSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    إرسال
                  </Button>
                </div>
              </div>
            )}

            {/* Profile Editor */}
            {isConnected && (
              <WhatsAppProfileEditor configId={config.id} channelType="meta_api" />
            )}

            {/* Channel Routing */}
            {isConnected && orgId && (
              <div className="bg-muted/30 rounded-xl border border-border p-3 space-y-2">
                <ChannelRoutingConfig
                  configId={config.id}
                  orgId={orgId}
                  defaultTeamId={(config as any).default_team_id}
                  defaultAgentId={(config as any).default_agent_id}
                  excludeSupervisors={(config as any).exclude_supervisors}
                />
              </div>
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
    const qualityMap: Record<string, { label: string; color: string; icon: string }> = {
      GREEN: { label: "عالية", color: "text-success", icon: "🟢" }, YELLOW: { label: "متوسطة", color: "text-warning", icon: "🟡" }, RED: { label: "منخفضة", color: "text-destructive", icon: "🔴" },
    };
    const phoneStatusMap: Record<string, { label: string; color: string }> = {
      VERIFIED: { label: "نشط", color: "text-success" }, NOT_VERIFIED: { label: "غير مفعّل", color: "text-warning" }, PENDING: { label: "معلّق", color: "text-warning" },
      FLAGGED: { label: "مُبلَّغ عنه", color: "text-destructive" }, RESTRICTED: { label: "مقيّد", color: "text-destructive" }, CONNECTED: { label: "متصل", color: "text-success" },
    };
    const limitMap: Record<string, { label: string; desc: string }> = {
      TIER_1K: { label: "1,000", desc: "المستوى 1" },
      TIER_10K: { label: "10,000", desc: "المستوى 2" },
      TIER_100K: { label: "100,000", desc: "المستوى 3" },
      TIER_UNLIMITED: { label: "غير محدود", desc: "أعلى مستوى" },
      TIER_250: { label: "250", desc: "مستوى تجريبي" },
      TIER_50: { label: "50", desc: "مستوى محدود" },
    };
    const verificationMap: Record<string, { label: string; color: string }> = {
      verified: { label: "موثّق ✓", color: "text-success" },
      not_verified: { label: "غير موثّق", color: "text-warning" },
      failed: { label: "فشل التوثيق", color: "text-destructive" },
    };
    const quality = ms.qualityRating ? qualityMap[ms.qualityRating] : null;
    const phoneStatus = ms.phoneStatus ? phoneStatusMap[ms.phoneStatus] : null;
    const limit = ms.messagingLimit ? limitMap[ms.messagingLimit] : null;
    const verification = ms.businessVerification ? verificationMap[ms.businessVerification] : null;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> حالة الرقم والجودة</p>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => fetchMetaStatus(config, true)}>
            <RefreshCw className="w-2.5 h-2.5" /> تحديث
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {phoneStatus && (
            <div className="bg-muted/50 rounded-lg p-2">
              <p className="text-[10px] text-muted-foreground">حالة الرقم</p>
              <p className={cn("text-xs font-bold", phoneStatus.color)}>{phoneStatus.label}</p>
            </div>
          )}
          {quality && (
            <div className="bg-muted/50 rounded-lg p-2">
              <p className="text-[10px] text-muted-foreground">تقييم الجودة</p>
              <p className={cn("text-xs font-bold", quality.color)}>{quality.icon} {quality.label}</p>
            </div>
          )}
          {limit && (
            <div className="bg-muted/50 rounded-lg p-2">
              <p className="text-[10px] text-muted-foreground">حد الرسائل / 24 ساعة</p>
              <p className="text-xs font-bold text-foreground">{limit.label}</p>
              <p className="text-[9px] text-muted-foreground">{limit.desc}</p>
            </div>
          )}
          {verification && (
            <div className="bg-muted/50 rounded-lg p-2">
              <p className="text-[10px] text-muted-foreground">توثيق النشاط التجاري</p>
              <p className={cn("text-xs font-bold", verification.color)}>{verification.label}</p>
            </div>
          )}
          {ms.nameStatus && (
            <div className="bg-muted/50 rounded-lg p-2">
              <p className="text-[10px] text-muted-foreground">حالة اسم العرض</p>
              <p className={cn("text-xs font-bold", ms.nameStatus === "APPROVED" ? "text-success" : ms.nameStatus === "DECLINED" ? "text-destructive" : "text-warning")}>
                {ms.nameStatus === "APPROVED" ? "معتمد ✓" : ms.nameStatus === "DECLINED" ? "مرفوض" : "قيد المراجعة"}
              </p>
            </div>
          )}
          {ms.accountReviewStatus && (
            <div className="bg-muted/50 rounded-lg p-2">
              <p className="text-[10px] text-muted-foreground">مراجعة الحساب</p>
              <p className={cn("text-xs font-bold", ms.accountReviewStatus === "APPROVED" ? "text-success" : "text-warning")}>
                {ms.accountReviewStatus === "APPROVED" ? "معتمد ✓" : "قيد المراجعة"}
              </p>
            </div>
          )}
        </div>
        {/* Quality tips */}
        {quality && ms.qualityRating === "RED" && (
          <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-2.5">
            <p className="text-[10px] font-semibold text-destructive">⚠️ جودة الرقم منخفضة</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">قد يتم تخفيض حد الرسائل. تحقق من نسبة الحظر وجودة المحتوى المرسل.</p>
          </div>
        )}
        {quality && ms.qualityRating === "YELLOW" && (
          <div className="bg-warning/5 border border-warning/20 rounded-lg p-2.5">
            <p className="text-[10px] font-semibold text-warning">تنبيه: جودة متوسطة</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">حافظ على جودة المحتوى لتجنب تخفيض المستوى.</p>
          </div>
        )}
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

  const sendUnofficialTestMessage = async (configId: string) => {
    if (!unofficialTestPhone.trim()) { toast.error("أدخل رقم الهاتف"); return; }
    setUnofficialTestSending(true);
    try {
      const { data, error } = await invokeCloud("evolution-send", {
        body: { to: unofficialTestPhone.trim(), message: "✅ تم الربط بنجاح! هذه رسالة اختبار من Respondly (WhatsApp Web)." },
      });
      if (error || data?.error) {
        toast.error(data?.error || "فشل إرسال الرسالة");
      } else {
        toast.success("✅ تم إرسال الرسالة!");
      }
    } catch { toast.error("خطأ"); }
    setUnofficialTestSending(false);
  };

  const checkUnofficialStatus = async (config: WhatsAppConfig) => {
    if (!config.evolution_instance_name) return;
    setUnofficialCheckingStatus(config.id);
    const { data } = await invokeCloud("evolution-manage", {
      body: { action: "status", instance_name: config.evolution_instance_name },
    });
    if (data?.status === "open") {
      toast.success("✅ متصل");
    } else {
      toast.info(`الحالة: ${data?.status || "غير معروف"}`);
    }
    setUnofficialCheckingStatus(null);
    loadConfigs(true);
  };

  const logoutUnofficial = async (config: WhatsAppConfig) => {
    if (!config.evolution_instance_name || !confirm("هل تريد فصل الرقم؟")) return;
    const { data } = await invokeCloud("evolution-manage", {
      body: { action: "logout", instance_name: config.evolution_instance_name },
    });
    if (data?.success) {
      toast.success("تم فصل الرقم");
      loadConfigs(true);
    }
  };

  const deleteUnofficialInstance = async (config: WhatsAppConfig) => {
    if (!config.evolution_instance_name || !confirm("هل تريد حذف الجلسة نهائياً؟")) return;
    const { data } = await invokeCloud("evolution-manage", {
      body: { action: "delete", instance_name: config.evolution_instance_name },
    });
    if (data?.success) {
      toast.success("تم حذف الجلسة");
      loadConfigs(true);
    }
  };

  const reconnectUnofficial = async (config: WhatsAppConfig) => {
    if (!config.evolution_instance_name) return;
    setReconnectingId(config.id);
    setReconnectQr(null);
    try {
      const { data } = await invokeCloud("evolution-manage", {
        body: { action: "reconnect", instance_name: config.evolution_instance_name },
      });
      if (data?.qr_code) {
        setReconnectQr(data.qr_code);
        toast.success("تم توليد رمز QR جديد — امسحه من واتساب");
      } else if (data?.status === "open") {
        toast.success("✅ الرقم متصل بالفعل");
        setReconnectingId(null);
        loadConfigs(true);
      } else {
        toast.info("جاري إعادة الاتصال...");
      }
    } catch {
      toast.error("فشل إعادة الاتصال");
      setReconnectingId(null);
    }
  };

  const syncMissedMessages = async (config: WhatsAppConfig) => {
    if (!config.evolution_instance_name) return;
    setSyncingMessagesId(config.id);
    try {
      const { data } = await invokeCloud("evolution-manage", {
        body: { action: "sync_missed_messages", instance_name: config.evolution_instance_name },
      });
      if (data?.success) {
        toast.success(`✅ تمت مزامنة ${data.synced || 0} رسالة فائتة`);
      } else {
        toast.error(data?.error || "فشلت المزامنة");
      }
    } catch {
      toast.error("خطأ في المزامنة");
    }
    setSyncingMessagesId(null);
  };

  // ── Inline Rate Limit Panel for unofficial cards ──
  const UnofficialRateLimitPanel = ({ configId, initialSettings }: { configId: string; initialSettings: any }) => {
    const defaults = {
      enabled: true, min_delay_seconds: 8, max_delay_seconds: 15,
      batch_size: 10, batch_pause_seconds: 30, daily_limit: 200, hourly_limit: 50,
    };
    const [rlSettings, setRlSettings] = useState({ ...defaults, ...(initialSettings || {}) });
    const [rlOpen, setRlOpen] = useState(false);
    const [rlSaving, setRlSaving] = useState(false);

    const saveRl = async () => {
      setRlSaving(true);
      const cleaned = {
        ...rlSettings,
        min_delay_seconds: Math.max(1, Math.min(rlSettings.min_delay_seconds, rlSettings.max_delay_seconds)),
        max_delay_seconds: Math.max(rlSettings.min_delay_seconds, rlSettings.max_delay_seconds),
      };
      await supabase.from("whatsapp_config").update({ rate_limit_settings: cleaned }).eq("id", configId);
      setRlSettings(cleaned);
      setRlSaving(false);
      toast.success("تم حفظ إعدادات الحماية");
    };

    if (!rlOpen) {
      return (
        <button onClick={() => setRlOpen(true)} className="w-full flex items-center justify-between bg-warning/5 border border-warning/20 rounded-lg px-3 py-2.5 hover:bg-warning/10 transition-colors group">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-warning" />
            <div className="text-right">
              <p className="text-xs font-semibold text-foreground">حماية من الحظر</p>
              <p className="text-[10px] text-muted-foreground">
                {rlSettings.enabled ? `فاصل ${rlSettings.min_delay_seconds}-${rlSettings.max_delay_seconds}ث · ${rlSettings.hourly_limit}/ساعة · ${rlSettings.daily_limit}/يوم` : "معطّلة"}
              </p>
            </div>
          </div>
          <Settings className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
        </button>
      );
    }

    return (
      <div className="bg-card border border-warning/20 rounded-xl p-4 space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-warning" />
            <h4 className="text-xs font-bold">حماية من الحظر</h4>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">{rlSettings.enabled ? "مفعّل" : "معطّل"}</span>
            <Switch checked={rlSettings.enabled} onCheckedChange={(v: boolean) => setRlSettings({ ...rlSettings, enabled: v })} />
          </div>
        </div>
        {rlSettings.enabled && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px]">حد بالساعة</Label>
                <Input type="number" min={1} max={500} value={rlSettings.hourly_limit}
                  onChange={(e) => setRlSettings({ ...rlSettings, hourly_limit: Number(e.target.value) || 50 })}
                  className="h-7 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">حد يومي</Label>
                <Input type="number" min={1} max={5000} value={rlSettings.daily_limit}
                  onChange={(e) => setRlSettings({ ...rlSettings, daily_limit: Number(e.target.value) || 200 })}
                  className="h-7 text-xs" />
              </div>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 text-xs gap-1" onClick={saveRl} disabled={rlSaving}>
            {rlSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            حفظ
          </Button>
          <Button size="sm" variant="ghost" className="text-xs" onClick={() => setRlOpen(false)}>إغلاق</Button>
        </div>
      </div>
    );
  };

  const renderAllChannelsView = (currentConfigs: WhatsAppConfig[]) => {
    const allOfficialConfigs = currentConfigs.filter(c => (!(c as any).channel_type || (c as any).channel_type !== "evolution"));
    const allUnofficialConfigs = unofficialConfigs;
    const connectedOfficialConfigs = allOfficialConfigs.filter(c => c.is_connected);
    const connectedUnofficialConfigs = allUnofficialConfigs.filter(c => c.is_connected || c.evolution_instance_status === "connected" || c.evolution_instance_status === "connecting" || !!c.display_phone);
    // Show ALL channels (connected + disconnected) so users can reconnect
    const displayOfficialConfigs = allOfficialConfigs;
    const displayUnofficialConfigs = allUnofficialConfigs;
    const allConnected = [...connectedOfficialConfigs, ...connectedUnofficialConfigs];
    const allChannels = [...allOfficialConfigs, ...allUnofficialConfigs];
    const hasAnyChannel = allChannels.length > 0;
    const hasAnyConnected = allConnected.length > 0;

    return (
      <>

        {/* WhatsApp Channel */}
        <div className="space-y-3">
          <h2 className="text-base font-bold text-foreground">قنوات التواصل</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* WhatsApp — unified card with expandable connected numbers */}
            <div className="bg-card rounded-xl border border-border p-4 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-success" />
              </div>
              <div>
                <h3 className="font-bold text-xs">واتساب</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">رسمي أو عبر واتساب ويب</p>
              </div>

              {/* Summary badge */}
              {hasAnyChannel && (
                <Badge className={cn("text-[10px] gap-1 px-2.5 py-0.5 border-0", hasAnyConnected ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                  <MessageSquare className="w-2.5 h-2.5" />
                  {hasAnyConnected ? `واتساب متصل (${allConnected.length})` : `أرقام غير متصلة (${allChannels.length})`}
                </Badge>
              )}

              <div className="flex flex-col items-center gap-1.5 w-full">
                {/* Individual official numbers (all, not just connected) */}
                {displayOfficialConfigs.map((config) => {
                  const isExpanded = expandedChannelBadgeId === config.id;
                  const ms = metaStatus[config.id];
                  return (
                    <div key={config.id} className="w-full">
                      <button
                        onClick={() => setExpandedChannelBadgeId(isExpanded ? null : config.id)}
                        className="w-full flex items-center justify-center gap-1.5"
                      >
                        <Badge className={cn("text-[10px] gap-1 px-2 py-0.5 border-0 cursor-pointer", config.is_connected ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                          {config.is_connected ? <CheckCircle2 className="w-2.5 h-2.5" /> : <AlertTriangle className="w-2.5 h-2.5" />}
                          {config.channel_label || config.display_phone || config.business_name || "رسمي"}
                          {!config.is_connected && " (غير متصل)"}
                        </Badge>
                      </button>

                      {isExpanded && (
                        <div className="mt-2 p-3 bg-muted/50 rounded-lg text-right space-y-2.5 animate-fade-in">
                          {/* Summary info — like email */}
                          <div className="text-[11px] space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">الحالة:</span>
                              <span className={config.registration_status === "connected" ? "text-success font-medium" : "text-warning font-medium"}>
                                {config.registration_status === "connected" ? "✅ متصل رسمي" : config.registration_status === "failed" ? "❌ فشل التسجيل" : "⏳ معلّق"}
                              </span>
                            </div>
                            {config.display_phone && (
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">الرقم:</span>
                                <span className="text-foreground font-mono text-[10px]" dir="ltr">{config.display_phone}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">النوع:</span>
                              <span className="text-foreground">رسمي (Meta API)</span>
                            </div>
                            {ms?.qualityRating && (
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">الجودة:</span>
                                <span className={cn("font-medium", ms.qualityRating === "GREEN" ? "text-success" : ms.qualityRating === "YELLOW" ? "text-warning" : "text-destructive")}>
                                  {ms.qualityRating === "GREEN" ? "🟢 عالية" : ms.qualityRating === "YELLOW" ? "🟡 متوسطة" : "🔴 منخفضة"}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Action buttons — like email */}
                          <div className="flex gap-2 justify-end flex-wrap">
                            <Button size="sm" variant="outline" onClick={() => { fetchMetaStatus(config, true); }} className="text-[10px] h-7 px-2.5 gap-1">
                              <RefreshCw className="w-3 h-3" /> تحديث الحالة
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setExpandedFullSettingsId(expandedFullSettingsId === config.id ? null : config.id)} className="text-[10px] h-7 px-2 gap-1">
                              <Settings className="w-3 h-3" /> إعدادات
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDisconnect(config.id)} className="text-[10px] h-7 px-2 text-destructive gap-1">
                              <Trash2 className="w-3 h-3" /> فصل
                            </Button>
                          </div>

                          {/* Full settings — only when clicking إعدادات */}
                          {expandedFullSettingsId === config.id && (
                            <div className="space-y-3 border-t border-border pt-3 animate-fade-in">
                              {/* Label editing */}
                              <div className="flex items-center gap-1.5 justify-center">
                                {editingLabelId === config.id ? (
                                  <div className="flex items-center gap-1">
                                    <Input value={editingLabelText} onChange={(e) => setEditingLabelText(e.target.value)} className="h-7 text-xs text-center w-32 bg-secondary border-0" placeholder="اسم القناة" autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveChannelLabel(config.id); if (e.key === "Escape") setEditingLabelId(null); }} />
                                    <button onClick={() => saveChannelLabel(config.id)} className="text-success hover:text-success/80"><Check className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => setEditingLabelId(null)} className="text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                                  </div>
                                ) : (
                                  <button onClick={() => { setEditingLabelId(config.id); setEditingLabelText((config as any).channel_label || ""); }} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1">
                                    <Pencil className="w-2.5 h-2.5" /> تعديل الاسم
                                  </button>
                                )}
                              </div>

                              {/* Registration retry */}
                              {(config.registration_status === "failed" || !config.registration_status || config.registration_status === "pending") && (
                                <div className="flex items-center gap-2 justify-center">
                                  <Input value={twoStepPin} onChange={(e) => setTwoStepPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="PIN (اختياري)" className="bg-secondary border-0 text-xs w-24 h-8 text-center" dir="ltr" maxLength={6} />
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

                              {/* Webhook & IDs (super admin) */}
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

                              {/* Registration error */}
                              {config.registration_status === "failed" && config.registration_error && (
                                <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 text-right">
                                  <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5" /> سبب الفشل
                                  </p>
                                  <p className="text-[11px] text-foreground mt-1">{friendlyError(config.registration_error)}</p>
                                </div>
                              )}

                              {/* Test Message */}
                              {config.registration_status === "connected" && (
                                <div className="bg-muted/30 rounded-xl border border-border p-3 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Send className="w-4 h-4 text-primary" />
                                    <h4 className="text-xs font-bold">إرسال رسالة اختبار</h4>
                                  </div>
                                  <div className="flex gap-2">
                                    <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="9665xxxxxxxx" className="h-8 text-xs flex-1" dir="ltr" />
                                    <Button size="sm" className="h-8 text-xs gap-1 shrink-0" onClick={sendTestMessage} disabled={testSending || !testPhone}>
                                      {testSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                      إرسال
                                    </Button>
                                  </div>
                                </div>
                              )}

                              {/* Profile Editor */}
                              {config.registration_status === "connected" && (
                                <WhatsAppProfileEditor configId={config.id} channelType="meta_api" />
                              )}

                              {/* Channel Routing */}
                              {config.registration_status === "connected" && orgId && (
                                <div className="bg-muted/30 rounded-xl border border-border p-3 space-y-2">
                                  <ChannelRoutingConfig configId={config.id} orgId={orgId} defaultTeamId={(config as any).default_team_id} defaultAgentId={(config as any).default_agent_id} excludeSupervisors={(config as any).exclude_supervisors} />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Individual unofficial numbers (all, not just connected) */}
                {displayUnofficialConfigs.map((config) => {
                  const isExpanded = expandedChannelBadgeId === config.id;
                  const isActuallyConnected = config.is_connected && (config.registration_status === "connected" || config.evolution_instance_status === "connected");
                  return (
                    <div key={config.id} className="w-full">
                      <button
                        onClick={() => setExpandedChannelBadgeId(isExpanded ? null : config.id)}
                        className="w-full flex items-center justify-center gap-1.5"
                      >
                        <Badge className={cn("text-[10px] gap-1 px-2 py-0.5 border-0 cursor-pointer", isActuallyConnected ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                          <QrCode className="w-2.5 h-2.5" />
                          {config.channel_label || config.display_phone || config.business_name || "واتساب ويب"}
                        </Badge>
                      </button>

                      {isExpanded && (
                        <div className="mt-2 p-3 bg-muted/50 rounded-lg text-right space-y-2.5 animate-fade-in">
                          {/* Summary info */}
                          <div className="text-[11px] space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">الحالة:</span>
                              {isActuallyConnected 
                                ? <span className="text-success font-medium">✅ متصل</span>
                                : <span className="text-destructive font-medium">❌ منفصل</span>
                              }
                            </div>
                            {config.display_phone && (
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">الرقم:</span>
                                <span className="text-foreground font-mono text-[10px]" dir="ltr">{config.display_phone}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">النوع:</span>
                              <span className="text-warning font-medium">غير رسمي (QR)</span>
                            </div>
                            {config.registration_error && !isActuallyConnected && (
                              <div className="text-[10px] text-destructive/80 bg-destructive/5 rounded p-1.5 mt-1">
                                {config.registration_error}
                              </div>
                            )}
                          </div>

                          {/* Reconnect QR display */}
                          {reconnectingId === config.id && reconnectQr && (
                            <div className="flex flex-col items-center gap-2 p-3 bg-background rounded-lg border border-border">
                              <p className="text-[11px] text-muted-foreground">امسح رمز QR من واتساب لإعادة الاتصال</p>
                              <img src={reconnectQr} alt="QR Code" className="w-48 h-48 rounded" />
                              <Button size="sm" variant="ghost" className="text-[10px] h-7" onClick={() => { setReconnectingId(null); setReconnectQr(null); loadConfigs(true); }}>
                                <X className="w-3 h-3 mr-1" /> إغلاق
                              </Button>
                            </div>
                          )}

                          {/* Action buttons */}
                          <div className="flex gap-2 justify-end flex-wrap">
                            <Button size="sm" variant="outline" onClick={() => checkUnofficialStatus(config)} disabled={unofficialCheckingStatus === config.id} className="text-[10px] h-7 px-2.5 gap-1">
                              {unofficialCheckingStatus === config.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              تحقق
                            </Button>
                            {/* Reconnect button — generates new QR without deleting */}
                            {!isActuallyConnected && (
                              <Button size="sm" variant="outline" onClick={() => reconnectUnofficial(config)} disabled={reconnectingId === config.id} className="text-[10px] h-7 px-2.5 gap-1 text-success border-success/30">
                                {reconnectingId === config.id && !reconnectQr ? <Loader2 className="w-3 h-3 animate-spin" /> : <QrCode className="w-3 h-3" />}
                                إعادة اتصال
                              </Button>
                            )}
                            {/* Sync missed messages */}
                            {isActuallyConnected && (
                              <Button size="sm" variant="outline" onClick={() => syncMissedMessages(config)} disabled={syncingMessagesId === config.id} className="text-[10px] h-7 px-2.5 gap-1">
                                {syncingMessagesId === config.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowLeftRight className="w-3 h-3" />}
                                مزامنة الرسائل
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => setExpandedFullSettingsId(expandedFullSettingsId === config.id ? null : config.id)} className="text-[10px] h-7 px-2 gap-1">
                              <Settings className="w-3 h-3" /> إعدادات
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => logoutUnofficial(config)} className="text-[10px] h-7 px-2 text-destructive gap-1">
                              <LogOut className="w-3 h-3" /> فصل
                            </Button>
                          </div>

                          {/* Full settings — only when clicking إعدادات */}
                          {expandedFullSettingsId === config.id && (
                            <div className="space-y-3 border-t border-border pt-3 animate-fade-in">
                              {/* Label editing */}
                              <div className="flex items-center gap-1.5 justify-center">
                                {editingLabelId === config.id ? (
                                  <div className="flex items-center gap-1">
                                    <Input value={editingLabelText} onChange={(e) => setEditingLabelText(e.target.value)} className="h-7 text-xs text-center w-32 bg-secondary border-0" placeholder="اسم القناة" autoFocus onKeyDown={(e) => { if (e.key === "Enter") saveChannelLabel(config.id); if (e.key === "Escape") setEditingLabelId(null); }} />
                                    <button onClick={() => saveChannelLabel(config.id)} className="text-success hover:text-success/80"><Check className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => setEditingLabelId(null)} className="text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                                  </div>
                                ) : (
                                  <button onClick={() => { setEditingLabelId(config.id); setEditingLabelText(config.channel_label || ""); }} className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1">
                                    <Pencil className="w-2.5 h-2.5" /> تعديل الاسم
                                  </button>
                                )}
                              </div>

                              {/* Test Message */}
                              <div className="bg-muted/30 rounded-xl border border-border p-3 space-y-2">
                                <div className="flex items-center gap-2">
                                  <Send className="w-4 h-4 text-primary" />
                                  <h4 className="text-xs font-bold">إرسال رسالة اختبار</h4>
                                </div>
                                <div className="flex gap-2">
                                  <Input value={unofficialTestPhone} onChange={(e) => setUnofficialTestPhone(e.target.value)} placeholder="9665xxxxxxxx" className="h-8 text-xs flex-1" dir="ltr" />
                                  <Button size="sm" className="h-8 text-xs gap-1 shrink-0" onClick={() => sendUnofficialTestMessage(config.id)} disabled={unofficialTestSending || !unofficialTestPhone}>
                                    {unofficialTestSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                    إرسال
                                  </Button>
                                </div>
                              </div>

                              {/* Profile Editor */}
                              <WhatsAppProfileEditor configId={config.id} channelType="evolution" />

                              {/* Channel Routing */}
                              {orgId && (
                                <div className="bg-muted/30 rounded-xl border border-border p-3 space-y-2">
                                  <ChannelRoutingConfig configId={config.id} orgId={orgId} defaultTeamId={(config as any).default_team_id} defaultAgentId={(config as any).default_agent_id} excludeSupervisors={(config as any).exclude_supervisors} />
                                </div>
                              )}

                              {/* Safety Limits Toggle */}
                              <div className="bg-muted/30 rounded-xl border border-border p-3 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex-1 text-right">
                                    <p className="text-xs font-semibold text-foreground">🛡️ {t("حماية من الحظر", "Ban Protection")}</p>
                                    <p className="text-[10px] text-muted-foreground">{t("تفعيل حدود الإرسال التلقائية لحماية الرقم", "Enable auto rate limits to protect number")}</p>
                                  </div>
                                  <Switch
                                    checked={(config as any).safety_limits_enabled || false}
                                    onCheckedChange={async (checked) => {
                                      await supabase.from("whatsapp_config").update({
                                        safety_limits_enabled: checked,
                                        ...(!checked ? { safety_paused: false, safety_paused_at: null, safety_paused_reason: null } : {}),
                                      }).eq("id", config.id);
                                      toast.success(checked ? t("تم تفعيل حدود الحماية", "Safety limits enabled") : t("تم إلغاء حدود الحماية", "Safety limits disabled"));
                                      loadConfigs(true);
                                    }}
                                  />
                                </div>

                                {/* Safety Pause Banner - only when limits enabled & paused */}
                                {(config as any).safety_limits_enabled && (config as any).safety_paused && (
                                  <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 space-y-2">
                                    <div className="flex items-center gap-2">
                                      <AlertTriangle className="w-4 h-4 text-destructive" />
                                      <div className="flex-1 text-right">
                                        <p className="text-xs font-bold text-destructive">⚠️ الإرسال متوقف مؤقتاً</p>
                                        <p className="text-[10px] text-muted-foreground">{(config as any).safety_paused_reason || "تجاوز حدود الإرسال الآمنة"}</p>
                                        {(config as any).safety_paused_at && (
                                          <p className="text-[9px] text-muted-foreground mt-0.5">منذ: {new Date((config as any).safety_paused_at).toLocaleString("ar-SA")}</p>
                                        )}
                                      </div>
                                    </div>
                                    <Button size="sm" variant="outline" className="w-full text-[10px] h-7 gap-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                                      onClick={async () => {
                                        await supabase.from("whatsapp_config").update({
                                          safety_paused: false, safety_paused_at: null, safety_paused_reason: null,
                                        }).eq("id", config.id);
                                        toast.success("تم إعادة تفعيل الإرسال");
                                        loadConfigs(true);
                                      }}>
                                      <RefreshCw className="w-3 h-3" /> إعادة تفعيل الإرسال
                                    </Button>
                                  </div>
                                )}
                              </div>

                              {/* Delete (super admin) */}
                              {isSuperAdmin && (
                                <Button variant="outline" size="sm" className="w-full text-[10px] h-7 text-destructive border-destructive/30 gap-1" onClick={() => deleteUnofficialInstance(config)}>
                                  <Trash2 className="w-3 h-3" /> حذف نهائياً
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                <Button size="sm" className="text-[10px] h-8 gap-1 rounded-lg px-4 w-full" onClick={() => setShowWhatsAppChoice(true)}>
                  <Plus className="w-3 h-3" /> إضافة رقم
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Email Channel — separate section */}
        <EmailConfigSection />

        {/* WhatsApp Type Choice Dialog */}
        <Dialog open={showWhatsAppChoice} onOpenChange={setShowWhatsAppChoice}>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-center text-lg">اختر نوع الربط</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-3 pt-2">
              {/* Official — only shown if enabled or super admin */}
              {(officialEnabled || isSuperAdmin) && (
              <button
                onClick={() => { setShowWhatsAppChoice(false); startConnect(); }}
                className="flex items-center gap-3 p-4 rounded-xl border-2 border-border hover:border-emerald-500 hover:bg-emerald-500/5 transition-all text-right"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-6 h-6 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm">واتساب رسمي</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">WhatsApp Business API — ربط رسمي عبر Meta مع قوالب وحملات</p>
                </div>
              </button>
              )}
              {/* Web / Unofficial */}
              <div className="rounded-xl border-2 border-border hover:border-warning hover:bg-warning/5 transition-all p-4">
                <div className="flex items-center gap-3 text-right mb-3">
                  <div className="w-12 h-12 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
                    <QrCode className="w-6 h-6 text-warning" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-sm">واتساب ويب</p>
                      <Badge variant="outline" className="text-[8px] px-1 py-0 text-warning border-warning/30">غير رسمي</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">ربط عبر مسح QR — بدون حساب بزنس رسمي</p>
                  </div>
                </div>
                <WhatsAppWebSection orgId={orgId} isSuperAdmin={isSuperAdmin} autoOpen forNewNumber onConfigChange={() => { loadConfigs(true); setShowWhatsAppChoice(false); }} />
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* E-commerce Integrations */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-foreground">تكاملات المتاجر الإلكترونية</h2>
          <div className="bg-card rounded-2xl border border-border p-5">
            <SallaIntegrationSection />
          </div>
        </div>
      </>
    );
  };

  const reviewToggle = isSuperAdmin ? (
    <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => setIsReviewMode(p => !p)}>
      <Globe className="w-4 h-4" />
      {isReviewMode ? "Arabic mode" : "Meta Review Mode"}
    </Button>
  ) : null;

  // ============ CHOOSE TYPE ============
  if (flowStep === "choose_type") {
    return (
      <div className="p-3 md:p-6 max-w-[600px] mx-auto" dir={dir}>
        <div className="flex justify-end mb-4">{reviewToggle}</div>
        <div className="bg-card rounded-2xl shadow-card border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              {t("اختر نوع العملية", "Choose Operation Type")}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("هل تريد ربط رقم جديد أم نقل رقم موجود؟", "Do you want to connect a new number or migrate an existing one?")}
            </p>
          </div>
          <div className="p-5 space-y-3">
            <button
              onClick={() => { setOnboardingMode("new"); proceedFromTypeChoice(); }}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-right ${onboardingMode === "new" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-primary/5"}`}
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Plus className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm text-foreground">{t("ربط رقم جديد", "Connect New Number")}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{t("إضافة رقم واتساب لأول مرة عبر Meta", "Add a WhatsApp number for the first time via Meta")}</p>
              </div>
            </button>

            <button
              onClick={() => { setOnboardingMode("migrate_app"); setFlowStep("migration_info"); }}
              className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-border hover:border-warning/50 hover:bg-warning/5 transition-all text-right"
            >
              <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
                <ArrowLeftRight className="w-5 h-5 text-warning" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm text-foreground">{t("نقل رقم من تطبيق آخر", "Migrate from Another App")}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{t("نقل رقم مربوط حالياً مع مزوّد آخر", "Migrate a number currently linked with another provider")}</p>
              </div>
            </button>

            <button
              onClick={() => { setOnboardingMode("migrate_provider"); setFlowStep("migration_info"); }}
              className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-border hover:border-warning/50 hover:bg-warning/5 transition-all text-right"
            >
              <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
                <ArrowLeftRight className="w-5 h-5 text-warning" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm text-foreground">{t("نقل من مزوّد BSP آخر", "Migrate from Another BSP")}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{t("نقل من Twilio أو 360dialog أو غيره", "Migrate from Twilio, 360dialog, etc.")}</p>
              </div>
            </button>

            <Button variant="ghost" size="sm" className="w-full text-xs mt-2" onClick={resetFlow}>{t("← رجوع", "← Back")}</Button>
          </div>
        </div>
      </div>
    );
  }

  if (flowStep === "migration_info") {
    return (
      <div className="p-3 md:p-6 max-w-[600px] mx-auto" dir={dir}>
        <div className="bg-card rounded-2xl shadow-card border border-border overflow-hidden p-6 space-y-4">
          <h2 className="text-lg font-bold text-foreground">{t("معلومات النقل", "Migration Info")}</h2>
            {onboardingMode === "migrate_provider" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs">اسم المزوّد الحالي (اختياري)</Label>
                  <Input
                    value={previousProvider}
                    onChange={(e) => setPreviousProvider(e.target.value)}
                    placeholder="مثال: 360dialog, Twilio, MessageBird..."
                    className="bg-secondary border-0 text-xs"
                  />
                </div>
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                  <p className="text-xs font-semibold text-primary flex items-center gap-1.5 mb-2">
                    <ShieldCheck className="w-3.5 h-3.5" /> خطوات النقل
                  </p>
                  <ol className="text-[11px] text-muted-foreground space-y-1.5 pr-4">
                    <li>1. أوقف الخدمة لدى المزوّد الحالي (لا تحذف الرقم)</li>
                    <li>2. اطلب من المزوّد الحالي تحرير الرقم (Release) من حسابه</li>
                    <li>3. انتظر حتى يتم التحرير (قد يستغرق 24-48 ساعة)</li>
                    <li>4. ابدأ عملية الربط عبر Respondly بمجرد تحرير الرقم</li>
                  </ol>
                </div>
              </div>
            )}
            <div className="pt-2 space-y-2">
              <Button onClick={proceedToMetaLogin} disabled={!sdkLoaded} className="w-full gap-2 py-5 text-sm font-bold rounded-xl">
                {!sdkLoaded ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                بدء عملية النقل
              </Button>
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setFlowStep("choose_type")}>← رجوع</Button>
            </div>
        </div>
      </div>
    );
  }

  // ============ CHECKLIST BEFORE ADDING NEW NUMBER ============
  if (flowStep === "checklist") {
    return (
      <div className="p-3 md:p-6 max-w-[600px] mx-auto" dir={dir}>
        <div className="flex justify-end mb-4">{reviewToggle}</div>
        <div className="bg-card rounded-2xl shadow-card border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              {t("قائمة التحقق قبل الربط", "Pre-connection Checklist")}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">{t("تأكد من استيفاء هذه المتطلبات في Meta Business Suite قبل إضافة رقم جديد", "Make sure these requirements are met in Meta Business Suite before adding a new number")}</p>
          </div>
          <div className="p-5 space-y-3">
            {[
              {
                icon: Building2,
                title: t("توثيق النشاط التجاري", "Business Verification"),
                desc: t("وثّق حافظة الأعمال (Business Verification) لرفع حدود الإرسال وتفعيل المحادثات", "Verify your Business Portfolio to increase messaging limits and activate conversations"),
                link: "https://business.facebook.com/settings/security",
                linkLabel: t("تحقق من التوثيق", "Check verification"),
                required: false,
              },
              {
                icon: CreditCard,
                title: t("وسيلة الدفع", "Payment Method"),
                desc: t("أضف بطاقة ائتمان صالحة في إعدادات الدفع — مطلوبة لإرسال الرسائل التسويقية", "Add a valid credit card in payment settings — required for sending marketing messages"),
                link: "https://business.facebook.com/billing_hub/payment_methods",
                linkLabel: t("إدارة وسائل الدفع", "Manage payment methods"),
                required: true,
              },
              {
                icon: PhoneCall,
                title: t("رقم واتساب جاهز", "WhatsApp Number Ready"),
                desc: t("رقم غير مربوط بتطبيق واتساب على الهاتف — يجب فصله أولاً قبل ربطه بالمنصة", "A number not linked to any WhatsApp app on your phone — must be disconnected first"),
                required: true,
              },
              {
                icon: MessageSquare,
                title: t("حساب WABA مفعّل", "WABA Account Active"),
                desc: t("أنشئ حساب WhatsApp Business Account من Meta Business Suite إن لم يكن موجوداً", "Create a WhatsApp Business Account from Meta Business Suite if not already created"),
                link: "https://business.facebook.com/wa/manage/home",
                linkLabel: t("إدارة حسابات WhatsApp", "Manage WhatsApp accounts"),
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
                      <Badge className="bg-destructive/10 text-destructive border-0 text-[9px] px-1.5 py-0">{t("مطلوب", "Required")}</Badge>
                    ) : (
                      <Badge className="bg-warning/10 text-warning border-0 text-[9px] px-1.5 py-0">{t("موصى به", "Recommended")}</Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
                  {item.link && (
                    <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline underline-offset-2 mt-1 inline-flex items-center gap-1">
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
                {t("تأكدت — متابعة الربط", "Confirmed — Continue to Connect")}
              </Button>
              <div className="flex items-center gap-2">
                <div className="flex-1 border-t border-border" />
                <span className="text-[10px] text-muted-foreground">{t("أو", "or")}</span>
                <div className="flex-1 border-t border-border" />
              </div>
              <Button variant="outline" size="sm" className="w-full text-xs gap-1.5" onClick={() => setFlowStep("manual_token")}>
                <KeyRound className="w-3.5 h-3.5" />
                {t("ربط يدوي بالتوكن (بدون Embedded Signup)", "Manual connect with token (without Embedded Signup)")}
              </Button>
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={resetFlow}>{t("← رجوع", "← Back")}</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ MANUAL TOKEN CONNECT ============
  if (flowStep === "manual_token") {
    return (
      <div className="p-3 md:p-6 max-w-[600px] mx-auto" dir={dir}>
        <div className="flex justify-end mb-4">{reviewToggle}</div>
        <div className="bg-card rounded-2xl shadow-card border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              {t("ربط يدوي بالتوكن", "Manual Token Connect")}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("أدخل بيانات الاتصال يدوياً بدلاً من استخدام Embedded Signup", "Enter connection details manually instead of using Embedded Signup")}
            </p>
          </div>
          <div className="p-5 space-y-4">
            {/* Guide */}
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-primary flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                {t("دليل الربط خطوة بخطوة", "Step-by-step Connection Guide")}
              </p>

              {/* Step 1: Create App */}
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
                  {t("إنشاء تطبيق ميتا", "Create a Meta App")}
                </p>
                <div className="text-[11px] text-muted-foreground mr-7 space-y-1">
                  <p>{t("ادخل على", "Go to")} <a href="https://developers.facebook.com/apps/create/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">developers.facebook.com/apps/create</a></p>
                  <p>{t('اختر نوع التطبيق "Business" ← أدخل اسم التطبيق ← اضغط "Create App"', 'Select app type "Business" → Enter app name → Click "Create App"')}</p>
                </div>
              </div>

              {/* Step 2: Add WhatsApp product */}
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
                  {t("إضافة منتج واتساب", "Add WhatsApp Product")}
                </p>
                <div className="text-[11px] text-muted-foreground mr-7">
                  <p>{t('من لوحة التطبيق ← اضغط "Add Product" ← ابحث عن WhatsApp ← اضغط "Set Up"', 'From App Dashboard → Click "Add Product" → Find WhatsApp → Click "Set Up"')}</p>
                </div>
              </div>

              {/* Step 3: Get Phone Number ID & WABA ID */}
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
                  {t("نسخ Phone Number ID و WABA ID", "Copy Phone Number ID & WABA ID")}
                </p>
                <div className="text-[11px] text-muted-foreground mr-7 space-y-1">
                  <p>{t("من القائمة الجانبية: WhatsApp → API Setup", "From sidebar: WhatsApp → API Setup")}</p>
                  <p>{t("ستجد الأرقام المتاحة مع Phone Number ID في الأعلى", "You'll find available numbers with Phone Number ID at the top")}</p>
                  <p>{t('الـ WABA ID موجود في عنوان الصفحة أو من "WhatsApp Accounts" في Business Settings', 'WABA ID is in the page header or from "WhatsApp Accounts" in Business Settings')}</p>
                </div>
              </div>

              {/* Step 4: Create System User & Token */}
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shrink-0">4</span>
                  {t("إنشاء التوكن الدائم", "Create Permanent Token")}
                </p>
                <div className="text-[11px] text-muted-foreground mr-7 space-y-1">
                  <p>{t("ادخل على", "Go to")} <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">Business Settings → System Users</a></p>
                  <p>{t('اضغط "Add" ← أدخل اسم المستخدم ← اختر الدور "Admin"', 'Click "Add" → Enter username → Select role "Admin"')}</p>
                  <p>{t('اضغط "Generate New Token" ← اختر تطبيقك ← فعّل الصلاحيات:', 'Click "Generate New Token" → Select your app → Enable permissions:')}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <span className="font-mono text-[9px] bg-secondary px-1.5 py-0.5 rounded text-foreground">whatsapp_business_management</span>
                    <span className="font-mono text-[9px] bg-secondary px-1.5 py-0.5 rounded text-foreground">whatsapp_business_messaging</span>
                  </div>
                  <p className="mt-1">{t('اضغط "Generate Token" ← انسخ التوكن فوراً (لن يظهر مرة أخرى!)', 'Click "Generate Token" → Copy the token immediately (it won\'t show again!)')}</p>
                </div>
              </div>

              {/* Step 5: Assign assets */}
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shrink-0">5</span>
                  {t("ربط الأصول بالمستخدم", "Assign Assets to System User")}
                </p>
                <div className="text-[11px] text-muted-foreground mr-7 space-y-1">
                  <p>{t('في صفحة System User ← اضغط "Assign Assets" ← Apps ← اختر تطبيقك ← فعّل "Full Control"', 'On System User page → Click "Assign Assets" → Apps → Select your app → Enable "Full Control"')}</p>
                  <p>{t('ثم اذهب لتبويب "WhatsApp Accounts" ← اختر حسابك ← فعّل "Full Control"', 'Then go to "WhatsApp Accounts" tab → Select your account → Enable "Full Control"')}</p>
                </div>
              </div>

              <div className="border-t border-primary/20 pt-2 mt-2">
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-warning shrink-0" />
                  {t("تأكد من نسخ التوكن فور إنشائه — ميتا لا تعرضه مرة أخرى", "Make sure to copy the token immediately — Meta won't show it again")}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{t("Access Token (التوكن الدائم)", "Access Token (Permanent)")}</Label>
                <Input
                  value={manualAccessToken}
                  onChange={(e) => setManualAccessToken(e.target.value)}
                  placeholder="EAAxxxxxxx..."
                  className="bg-secondary border-0 text-xs font-mono"
                  dir="ltr"
                  type="password"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Phone Number ID</Label>
                <Input
                  value={manualPhoneNumberId}
                  onChange={(e) => setManualPhoneNumberId(e.target.value)}
                  placeholder="1234567890..."
                  className="bg-secondary border-0 text-xs font-mono"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">WABA ID (WhatsApp Business Account ID)</Label>
                <Input
                  value={manualWabaId}
                  onChange={(e) => setManualWabaId(e.target.value)}
                  placeholder="1234567890..."
                  className="bg-secondary border-0 text-xs font-mono"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("رمز PIN (اختياري — فقط إذا كان الرقم محمي بالتحقق بخطوتين)", "PIN (optional — only if 2FA is enabled)")}</Label>
                <Input
                  value={twoStepPin}
                  onChange={(e) => setTwoStepPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="bg-secondary border-0 text-xs w-32 text-center"
                  dir="ltr"
                  maxLength={6}
                />
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <Button
                onClick={handleManualTokenConnect}
                disabled={manualConnecting || !manualAccessToken || !manualPhoneNumberId || !manualWabaId}
                className="w-full gap-2 py-5 text-sm font-bold rounded-xl"
              >
                {manualConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {t("ربط الرقم", "Connect Number")}
              </Button>
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setFlowStep("checklist")}>
                {t("← رجوع", "← Back")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ CONNECTING / LOADING ============
  if (flowStep === "connecting") {
    return (
      <div className="p-3 md:p-6 max-w-[600px] mx-auto" dir={dir}>
        <div className="bg-card rounded-2xl shadow-card border border-border p-12 text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
          <h2 className="text-lg font-bold text-foreground">{t("جاري الربط...", "Connecting...")}</h2>
          <p className="text-sm text-muted-foreground">{t("أكمل الخطوات في نافذة Meta المنبثقة", "Complete the steps in the Meta popup window")}</p>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground mt-4" onClick={() => { setFlowStep("idle"); setIsLoading(false); loadConfigs(true); }}>
            {t("إلغاء والعودة", "Cancel & go back")}
          </Button>
        </div>
      </div>
    );
  }

  // ============ PICK PHONE NUMBER ============
  if (flowStep === "pick_phone") {
    const isMigration = onboardingMode !== "new";
    return (
      <div className="p-3 md:p-6 max-w-[600px] mx-auto" dir={dir}>
        <div className="bg-card rounded-2xl shadow-card border border-border overflow-hidden">
          <div className="p-6 border-b border-border">
            <div className="flex items-center gap-2">
              {isMigration && <ArrowLeftRight className="w-5 h-5 text-primary" />}
              <h2 className="text-lg font-bold text-foreground">
                {isMigration ? t("اختر الرقم للنقل", "Select number to migrate") : t("اختر رقمك", "Select your number")}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {t(`تم العثور على ${phoneNumbers.length} رقم — اختر الرقم الذي تريد ${isMigration ? "نقله" : "ربطه"}`, `Found ${phoneNumbers.length} number(s) — select the one you want to ${isMigration ? "migrate" : "connect"}`)}
            </p>
          </div>
          <div className="p-4 space-y-2">
            {phoneNumbers.map((phone) => {
              const phoneStatus = (phone as any).status;
              const isAlreadyConnected = phoneStatus === "CONNECTED";
              const statusLabel = isAlreadyConnected ? "متصل" : phoneStatus === "PENDING" ? "معلّق" : null;
              return (
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
                      <div className="flex items-center gap-1.5 mt-1">
                        {statusLabel && (
                          <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0",
                            isAlreadyConnected ? "text-success border-success/30" : "text-warning border-warning/30"
                          )}>
                            {statusLabel}
                          </Badge>
                        )}
                        {(phone as any).account_mode && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground">
                            {(phone as any).account_mode}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {phone.quality_rating && (
                      <Badge variant="outline" className={cn("text-[10px]",
                        phone.quality_rating === "GREEN" ? "text-success border-success/30" : "text-warning border-warning/30"
                      )}>
                        {phone.quality_rating === "GREEN" ? "جودة عالية" : "متوسطة"}
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })}
            <Button variant="ghost" size="sm" className="text-xs mt-2" onClick={resetFlow}>{t("← رجوع", "← Back")}</Button>
          </div>
        </div>
      </div>
    );
  }

  // ============ MIGRATION PREREQUISITES ============
  if (flowStep === "migration_prereqs" && migrationPrereqs) {
    return (
      <div className="p-3 md:p-6 max-w-[600px] mx-auto" dir="rtl">
        <div className="bg-card rounded-2xl shadow-card border border-warning/30 overflow-hidden">
          <div className="bg-warning/5 p-6 border-b border-warning/20">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-warning" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">متطلبات ناقصة للنقل</h2>
                <p className="text-sm text-muted-foreground">يجب حل المشاكل التالية قبل اكتمال نقل الرقم</p>
              </div>
            </div>
            {connectedPhone && (
              <p className="text-sm font-mono text-primary mt-3" dir="ltr">{connectedPhone}</p>
            )}
          </div>
          <div className="p-5 space-y-3">
            {migrationPrereqs.issues.map((issue, i) => {
              const info = migrationIssueLabel(issue);
              return (
                <div key={i} className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                    {info.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground pr-3">{info.desc}</p>
                  {info.link && (
                    <a href={info.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline pr-3">
                      <ExternalLink className="w-3 h-3" /> حل المشكلة ←
                    </a>
                  )}
                </div>
              );
            })}
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                💡 تم حفظ بيانات الرقم. بعد حل المشاكل أعلاه، يمكنك إعادة محاولة التسجيل من بطاقة الرقم.
              </p>
            </div>
            <div className="pt-2 space-y-2">
              <Button onClick={resetFlow} className="w-full gap-2">
                <CheckCircle2 className="w-4 h-4" />
                تم — الذهاب لإدارة الأرقام
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ SUCCESS ============
  if (flowStep === "success") {
    return (
      <div className="p-3 md:p-6 max-w-[600px] mx-auto" dir={dir}>
        <div className="bg-card rounded-2xl shadow-card border border-success/30 overflow-hidden">
          <div className="bg-success/5 p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-10 h-10 text-success" />
            </div>
            <h2 className="text-xl font-bold text-foreground">{t("✅ تم ربط الرقم بنجاح", "✅ Number Connected Successfully")}</h2>
            {connectedPhone && (
              <p className="text-lg font-bold text-primary mt-2" dir="ltr">{connectedPhone}</p>
            )}
            <Badge className="mt-2 bg-success/10 text-success border-0">{t("متصل", "Connected")}</Badge>
          </div>

          <div className="p-6 space-y-4">
            <div className="bg-muted/50 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">{t("أرسل رسالة اختبار", "Send a Test Message")}</h3>
              </div>
              <p className="text-xs text-muted-foreground">{t("تأكد من جاهزية الرقم بإرسال رسالة اختبار", "Verify the number is ready by sending a test message")}</p>
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
                  {t("إرسال", "Send")}
                </Button>
              </div>
            </div>

            {/* Webhook Status */}
            {webhookStatus?.auto_configured ? (
              <div className="bg-success/5 border border-success/20 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-foreground">{t("✅ الـ Webhook مضبوط تلقائياً", "✅ Webhook Auto-Configured")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("الرسائل الواردة ستصل مباشرة للمنصة.", "Incoming messages will be received automatically.")}</p>
                </div>
              </div>
            ) : webhookStatus ? (
              <div className="bg-warning/5 border border-warning/20 rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-foreground">{t("⚠️ ضبط الـ Webhook يدوياً", "⚠️ Manual Webhook Setup Required")}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("لم يتم ضبط الـ Webhook تلقائياً. اتبع الخطوات التالية لاستقبال الرسائل:", "Webhook auto-setup failed. Follow these steps to receive messages:")}
                    </p>
                  </div>
                </div>
                <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside" dir={dir}>
                  <li>
                    {t("افتح ", "Go to ")}
                    <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-primary underline font-medium">Meta App Dashboard</a>
                    {t(" → اختر تطبيقك", " → Select your app")}
                  </li>
                  <li>{t("اذهب إلى WhatsApp → Configuration", "Go to WhatsApp → Configuration")}</li>
                  <li>
                    {t("في قسم Webhook، ألصق هذا الرابط:", "In Webhook section, paste this URL:")}
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        value="https://dgnqehcezvewkdodqpyh.supabase.co/functions/v1/whatsapp-webhook"
                        readOnly
                        className="bg-secondary border-0 text-[11px] flex-1 font-mono"
                        dir="ltr"
                      />
                      <Button size="sm" variant="outline" className="h-7 px-2 shrink-0" onClick={() => { navigator.clipboard.writeText("https://dgnqehcezvewkdodqpyh.supabase.co/functions/v1/whatsapp-webhook"); toast.success(t("تم النسخ", "Copied")); }}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </li>
                  <li>
                    {t("في Verify Token أدخل:", "Enter Verify Token:")}
                    <div className="mt-1 flex items-center gap-2">
                      <Input value="respondly_verify" readOnly className="bg-secondary border-0 text-[11px] flex-1 font-mono" dir="ltr" />
                      <Button size="sm" variant="outline" className="h-7 px-2 shrink-0" onClick={() => { navigator.clipboard.writeText("respondly_verify"); toast.success(t("تم النسخ", "Copied")); }}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </li>
                  <li>{t("اضغط Verify and Save ثم اشترك في حقل messages", "Click Verify and Save, then subscribe to the messages field")}</li>
                </ol>
              </div>
            ) : null}

            <Button onClick={resetFlow} variant="outline" className="w-full gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {t("تم — الذهاب لإدارة الأرقام", "Done — Go to Number Management")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ============ ERROR ============
  if (flowStep === "error") {
    return (
      <div className="p-3 md:p-6 max-w-[600px] mx-auto" dir={dir}>
        <div className="bg-card rounded-2xl shadow-card border border-destructive/30 overflow-hidden">
          <div className="bg-destructive/5 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-lg font-bold text-foreground">{t("لم يتم إكمال الربط", "Connection Not Completed")}</h2>
          </div>

          <div className="p-6 space-y-3">
            {/* السبب الفعلي */}
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
              <p className="text-xs font-semibold text-destructive mb-1">{t("سبب الفشل:", "Failure reason:")}</p>
              <p className="text-sm text-foreground leading-relaxed">{errorMessage}</p>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("💡 تأكد من إكمال جميع الخطوات داخل نافذة ميتا ومنح الصلاحيات المطلوبة قبل إغلاقها.", "💡 Make sure to complete all steps in the Meta popup and grant the required permissions before closing it.")}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("💡 إذا تكرر الخطأ، جرّب تسجيل الخروج من فيسبوك ثم أعد تسجيل الدخول وحاول مرة أخرى.", "💡 If the error persists, try logging out of Facebook, then log back in and retry.")}
              </p>
            </div>

            <Button onClick={() => { resetFlow(); startConnect(); }} className="w-full gap-2">
              <RefreshCw className="w-4 h-4" />
              {t("إعادة المحاولة", "Try Again")}
            </Button>
            <Button onClick={resetFlow} variant="ghost" className="w-full text-sm">
              {t("رجوع", "Back")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ============ MAIN: Connected Numbers Management ============
  return (
    <div className="p-3 md:p-6 space-y-6 max-w-5xl" dir={dir}>
      <div className="flex justify-end">{reviewToggle}</div>
      {renderAllChannelsView(configs)}
    </div>
  );
};

export default IntegrationsPage;
