import { useState, useEffect, useCallback } from "react";
import {
  Globe, CheckCircle2, Copy, Loader2, AlertCircle, Phone, RefreshCw,
  MessageSquare, KeyRound, ChevronLeft, Plus, Trash2, Instagram, ExternalLink,
  Plug, Radio, Smartphone
} from "lucide-react";
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
}

const IntegrationsPage = () => {
  const { orgId, isEcommerce } = useAuth();
  const [configs, setConfigs] = useState<WhatsAppConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [showPhones, setShowPhones] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [manualToken, setManualToken] = useState("");
  const [manualPhoneId, setManualPhoneId] = useState("");
  const [manualWabaId, setManualWabaId] = useState("");
  const [selectedConfig, setSelectedConfig] = useState<WhatsAppConfig | null>(null);

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

  const handleFacebookLogin = useCallback(() => {
    const FB = (window as any).FB;
    if (!FB) { toast.error("جاري تحميل Facebook SDK..."); return; }

    setIsLoading(true);
    FB.login(
      (response: any) => {
        if (response.authResponse) {
          const token = response.authResponse.accessToken;
          if (token) handleDirectToken(token);
          else { setIsLoading(false); toast.error("لم يتم الحصول على بيانات المصادقة"); }
        } else { setIsLoading(false); toast.error("تم إلغاء عملية الربط"); }
      },
      {
        config_id: "913936624804564",
        response_type: "token",
        override_default_response_type: true,
        scope: "whatsapp_business_management,whatsapp_business_messaging",
      }
    );
  }, []);

  const handleDirectToken = async (token: string) => {
    try {
      setAccessToken(token);
      const { data, error } = await supabase.functions.invoke("whatsapp-exchange-token", { body: { access_token: token } });
      if (error || data?.error) { toast.error(data?.error || "فشل في جلب بيانات الحساب"); setIsLoading(false); return; }
      const allPhones: PhoneNumber[] = [];
      let firstWabaId = "";
      if (data.results?.length > 0) {
        data.results.forEach((r: WabaResult) => { if (!firstWabaId) firstWabaId = r.waba_id; allPhones.push(...r.phone_numbers); });
      }
      if (allPhones.length > 0) { setBusinessAccountId(firstWabaId); setPhoneNumbers(allPhones); setShowPhones(true); toast.success(`تم العثور على ${allPhones.length} رقم — اختر واحد`); }
      else toast.error("لا توجد أرقام واتساب مربوطة بحسابك.");
    } catch { toast.error("حدث خطأ"); }
    setIsLoading(false);
  };

  const exchangeToken = async (code: string, redirectUri: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-exchange-token", { body: { code, redirect_uri: redirectUri } });
      if (error || data?.error) { toast.error(data?.error || "فشل في تبادل التوكن"); setIsLoading(false); return; }
      setAccessToken(data.access_token);
      const allPhones: PhoneNumber[] = [];
      let firstWabaId = "";
      if (data.results?.length > 0) {
        data.results.forEach((r: WabaResult) => { if (!firstWabaId) firstWabaId = r.waba_id; allPhones.push(...r.phone_numbers); });
      }
      if (allPhones.length > 0) { setBusinessAccountId(firstWabaId); setPhoneNumbers(allPhones); setShowPhones(true); toast.success(`تم العثور على ${allPhones.length} رقم`); }
      else toast.error("لا توجد أرقام واتساب.");
    } catch { toast.error("حدث خطأ في الربط"); }
    setIsLoading(false);
  };

  const handleSelectPhone = async (phone: PhoneNumber) => {
    setIsLoading(true);
    try {
      const { data } = await supabase.from("whatsapp_config").insert({
        phone_number_id: phone.id, business_account_id: businessAccountId, access_token: accessToken,
        display_phone: phone.display_phone_number, business_name: phone.verified_name, is_connected: true, org_id: orgId,
      }).select().single();
      if (data) {
        setShowPhones(false);
        setShowAddDialog(false);
        toast.success(`✅ تم ربط الرقم ${phone.display_phone_number} بنجاح!`);
        loadConfigs();
      }
    } catch { toast.error("حدث خطأ"); }
    setIsLoading(false);
  };

  const handleManualConnect = async () => {
    if (!manualToken.trim() || !manualPhoneId.trim() || !manualWabaId.trim()) { toast.error("يرجى تعبئة جميع الحقول"); return; }
    setIsLoading(true);
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${manualPhoneId.trim()}?fields=display_phone_number,verified_name,quality_rating`, { headers: { Authorization: `Bearer ${manualToken.trim()}` } });
      const phoneData = await res.json();
      if (phoneData.error) { toast.error(phoneData.error.message || "بيانات غير صحيحة"); setIsLoading(false); return; }
      await supabase.from("whatsapp_config").insert({
        phone_number_id: manualPhoneId.trim(), business_account_id: manualWabaId.trim(), access_token: manualToken.trim(),
        display_phone: phoneData.display_phone_number || manualPhoneId, business_name: phoneData.verified_name || "",
        is_connected: true, org_id: orgId,
      });
      toast.success(`✅ تم ربط الرقم بنجاح!`);
      setShowManual(false);
      setShowAddDialog(false);
      setManualToken(""); setManualPhoneId(""); setManualWabaId("");
      loadConfigs();
    } catch { toast.error("حدث خطأ في الربط"); }
    setIsLoading(false);
  };

  const handleDisconnect = async (configId: string) => {
    if (!confirm("هل تريد فصل هذا الرقم؟")) return;
    await supabase.from("whatsapp_config").delete().eq("id", configId);
    toast.success("تم فصل الرقم");
    loadConfigs();
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`تم نسخ ${label}`);
  };

  const upcomingChannels = [
    { name: "انستغرام", icon: Instagram, description: "تواصل مع العملاء عبر Instagram Direct", status: "قريباً" },
    { name: "تيليغرام", icon: Radio, description: "استقبل رسائل تيليغرام مباشرة", status: "قريباً" },
    { name: "SMS", icon: Smartphone, description: "أرسل رسائل نصية قصيرة", status: "قريباً" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[900px]" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Plug className="w-5 h-5 text-primary" />
            الربط والتكامل
          </h1>
          <p className="text-sm text-muted-foreground mt-1">اربط قنوات التواصل وأدر حسابات واتساب المتعددة</p>
        </div>
      </div>

      {/* WhatsApp Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-whatsapp flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-whatsapp-foreground" />
            </div>
            <div>
              <h2 className="font-semibold text-sm">أرقام واتساب</h2>
              <p className="text-[11px] text-muted-foreground">{configs.length} رقم مربوط</p>
            </div>
          </div>
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => { setShowAddDialog(true); setShowPhones(false); setShowManual(false); }}>
            <Plus className="w-3.5 h-3.5" /> إضافة رقم
          </Button>
        </div>

        {/* Connected Numbers */}
        {configs.length === 0 ? (
          <div className="bg-card rounded-xl shadow-card p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Globe className="w-8 h-8 text-primary" />
            </div>
            <h3 className="font-semibold mb-1">لم يتم ربط أي رقم بعد</h3>
            <p className="text-sm text-muted-foreground mb-4">اربط رقم واتساب للأعمال لبدء استقبال وإرسال الرسائل</p>
            <Button className="gap-2" onClick={() => setShowAddDialog(true)}>
              <Plus className="w-4 h-4" /> إضافة رقم واتساب
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {configs.map((config) => (
              <div key={config.id} className="bg-card rounded-xl shadow-card p-4 border border-border hover:shadow-card-hover transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full gradient-whatsapp flex items-center justify-center">
                      <Phone className="w-5 h-5 text-whatsapp-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm" dir="ltr">{config.display_phone || config.phone_number_id}</p>
                        <Badge className="bg-success/10 text-success border-0 text-[10px] gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5" /> متصل
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{config.business_name || "واتساب للأعمال"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => setSelectedConfig(selectedConfig?.id === config.id ? null : config)}>
                      التفاصيل
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive h-8 w-8 p-0" onClick={() => handleDisconnect(config.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Expanded Details */}
                {selectedConfig?.id === config.id && (
                  <div className="mt-4 pt-4 border-t border-border space-y-3 animate-fade-in">
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
                    <p className="text-[10px] text-muted-foreground">
                      الصق بيانات Webhook في{" "}
                      <a href="https://developers.facebook.com/apps/" target="_blank" className="text-primary underline">Meta Developers</a>
                      {" "}→ تطبيقك → WhatsApp → Configuration
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Store Platforms */}
      {isEcommerce && (
        <div className="space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground">منصات المتاجر الإلكترونية</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { id: "salla", name: "سلة", logo: "🛒", desc: "ربط متجرك على سلة لاستيراد الطلبات والمنتجات والعملاء تلقائياً", color: "bg-purple-500/10 text-purple-600" },
              { id: "zid", name: "زد", logo: "🏪", desc: "ربط متجرك على زد لمزامنة البيانات والطلبات تلقائياً", color: "bg-blue-500/10 text-blue-600" },
              { id: "shopify", name: "Shopify", logo: "🛍️", desc: "ربط متجر Shopify لاستيراد الطلبات والمنتجات والسلات المتروكة", color: "bg-green-500/10 text-green-600" },
            ].map((platform) => (
              <div key={platform.id} className="bg-card rounded-xl shadow-card p-5 border border-border hover:border-primary/30 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center text-xl", platform.color)}>
                    {platform.logo}
                  </div>
                  <div>
                    <p className="text-sm font-bold">{platform.name}</p>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">قريباً</Badge>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mb-3">{platform.desc}</p>
                <Button size="sm" variant="outline" className="w-full text-xs" disabled>
                  <Plug className="w-3 h-3 ml-1" /> ربط المتجر
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Channels */}
      <div className="space-y-3">
        <h2 className="font-semibold text-sm text-muted-foreground">قنوات أخرى</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {upcomingChannels.map((ch) => (
            <div key={ch.name} className="bg-card rounded-xl shadow-card p-4 border border-border opacity-60">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                  <ch.icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{ch.name}</p>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0">{ch.status}</Badge>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">{ch.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Add Number Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-whatsapp flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-whatsapp-foreground" />
              </div>
              إضافة رقم واتساب
            </DialogTitle>
          </DialogHeader>

          {!showPhones ? (
            <div className="space-y-4">
              {/* Steps */}
              <div className="flex items-center justify-center gap-2 py-3">
                {["ربط الحساب", "اختر الرقم", "إعدادات الربط"].map((step, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                      i === 0 ? "gradient-whatsapp text-whatsapp-foreground" : "bg-secondary text-muted-foreground"
                    )}>{i + 1}</div>
                    <span className="text-[11px] text-muted-foreground hidden sm:inline">{step}</span>
                    {i < 2 && <ChevronLeft className="w-3 h-3 text-muted-foreground" />}
                  </div>
                ))}
              </div>

              <div className="bg-secondary/50 rounded-lg p-5 text-center space-y-3">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <MessageSquare className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">اربط حساب واتساب للأعمال</p>
                  <p className="text-xs text-muted-foreground mt-1">سجّل دخولك بحساب فيسبوك واختر رقم واتساب</p>
                </div>
                <Button onClick={handleFacebookLogin} disabled={isLoading || !sdkLoaded} className="w-full gap-2 gradient-whatsapp text-whatsapp-foreground text-sm py-5">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                      <path d="M12.001 2.002c-5.522 0-9.999 4.477-9.999 9.999 0 4.99 3.657 9.126 8.437 9.879v-6.988h-2.54v-2.891h2.54V9.798c0-2.508 1.493-3.891 3.776-3.891 1.094 0 2.24.195 2.24.195v2.459h-1.264c-1.24 0-1.628.772-1.628 1.563v1.875h2.771l-.443 2.891h-2.328v6.988C18.344 21.129 22 16.992 22 12.001c0-5.522-4.477-9.999-9.999-9.999z" />
                    </svg>
                  )}
                  {!sdkLoaded ? "جاري التحميل..." : "ربط بحساب فيسبوك"}
                </Button>
              </div>

              <div className="text-center">
                <button onClick={() => setShowManual(!showManual)} className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2">
                  {showManual ? "إخفاء الربط اليدوي" : "أو اربط يدوياً بإدخال البيانات"}
                </button>
              </div>

              {showManual && (
                <div className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <KeyRound className="w-4 h-4 text-primary" />
                    <h4 className="text-sm font-semibold">ربط يدوي</h4>
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
          ) : (
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
                      {phone.quality_rating === "GREEN" ? "✅ جودة عالية" : "⚠️ متوسطة"}
                    </Badge>
                  )}
                </button>
              ))}
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowPhones(false)}>← رجوع</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default IntegrationsPage;
