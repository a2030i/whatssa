import { useState, useEffect, useMemo } from "react";
import { Search, Phone, Send, MessageSquare, ShieldCheck, Wifi, User, FileText, Loader2, Plus, X, Save, Globe, ChevronDown, Users, Radio } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { supabase, invokeCloud } from "@/lib/supabase";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { WhatsAppTemplate } from "@/types/whatsapp";
import { buildTemplateComponents } from "@/types/whatsapp";

interface Channel {
  id: string;
  org_id?: string | null;
  display_phone: string;
  channel_type: string;
  evolution_instance_name: string | null;
  business_name: string | null;
  is_connected?: boolean | null;
  created_at?: string | null;
}

interface Customer {
  id: string;
  name: string | null;
  phone: string;
}

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: WhatsAppTemplate[];
  onConversationCreated: (convId: string) => void;
}

type ConversationMode = "private" | "group" | "broadcast";
type Step = "contact" | "channel" | "message";

const COUNTRY_CODES = [
  { code: "966", flag: "🇸🇦", name: "السعودية", digits: 9 },
  { code: "971", flag: "🇦🇪", name: "الإمارات", digits: 9 },
  { code: "965", flag: "🇰🇼", name: "الكويت", digits: 8 },
  { code: "973", flag: "🇧🇭", name: "البحرين", digits: 8 },
  { code: "968", flag: "🇴🇲", name: "عُمان", digits: 8 },
  { code: "974", flag: "🇶🇦", name: "قطر", digits: 8 },
  { code: "20", flag: "🇪🇬", name: "مصر", digits: 10 },
  { code: "962", flag: "🇯🇴", name: "الأردن", digits: 9 },
  { code: "964", flag: "🇮🇶", name: "العراق", digits: 10 },
  { code: "967", flag: "🇾🇪", name: "اليمن", digits: 9 },
  { code: "218", flag: "🇱🇾", name: "ليبيا", digits: 9 },
  { code: "212", flag: "🇲🇦", name: "المغرب", digits: 9 },
  { code: "216", flag: "🇹🇳", name: "تونس", digits: 8 },
  { code: "213", flag: "🇩🇿", name: "الجزائر", digits: 9 },
  { code: "249", flag: "🇸🇩", name: "السودان", digits: 9 },
  { code: "961", flag: "🇱🇧", name: "لبنان", digits: 8 },
  { code: "963", flag: "🇸🇾", name: "سوريا", digits: 9 },
  { code: "970", flag: "🇵🇸", name: "فلسطين", digits: 9 },
  { code: "90", flag: "🇹🇷", name: "تركيا", digits: 10 },
  { code: "44", flag: "🇬🇧", name: "بريطانيا", digits: 10 },
  { code: "1", flag: "🇺🇸", name: "أمريكا", digits: 10 },
];

const NewConversationDialog = ({ open, onOpenChange, templates, onConversationCreated }: NewConversationDialogProps) => {
  const { orgId } = useAuth();
  const [mode, setMode] = useState<ConversationMode>("private");
  const [step, setStep] = useState<Step>("contact");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [countryCode, setCountryCode] = useState("966");
  const [localNumber, setLocalNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [messageText, setMessageText] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [templateVars, setTemplateVars] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [saveCustomer, setSaveCustomer] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [isExistingCustomer, setIsExistingCustomer] = useState(false);

  // Group-specific state
  const [groupName, setGroupName] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState<Customer[]>([]);
  const [addingNumber, setAddingNumber] = useState("");

  // Broadcast-specific state
  const [broadcastRecipients, setBroadcastRecipients] = useState<Customer[]>([]);

  const selectedCountry = COUNTRY_CODES.find(c => c.code === countryCode) || COUNTRY_CODES[0];
  const fullPhone = `${countryCode}${localNumber.replace(/^0+/, "")}`;
  const cleanDigits = localNumber.replace(/[^0-9]/g, "").replace(/^0+/, "");
  const isValidNumber = cleanDigits.length === selectedCountry.digits;

  useEffect(() => {
    if (open) {
      setMode("private");
      setStep("contact");
      setSelectedChannel(null);
      setCountryCode("966");
      setLocalNumber("");
      setCustomerName("");
      setMessageText("");
      setSelectedTemplate(null);
      setTemplateVars([]);
      setSearchQuery("");
      setSaveCustomer(false);
      setIsExistingCustomer(false);
      setShowCountryPicker(false);
      setGroupName("");
      setSelectedParticipants([]);
      setAddingNumber("");
      setBroadcastRecipients([]);
    }
  }, [open]);

  useEffect(() => {
    if (!orgId || !open) return;
    const load = async () => {
      const { data } = await supabase.rpc("get_org_whatsapp_channels");
      const connectedChannels = ((data || []) as Channel[])
        .filter((channel) => channel.org_id === orgId && channel.is_connected)
        .sort((a: any, b: any) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
      setChannels(connectedChannels);
    };
    load();
  }, [orgId, open]);

  useEffect(() => {
    if (!orgId || !open) return;
    const query = searchQuery || localNumber;
    if (!query.trim()) {
      const load = async () => {
        setLoadingCustomers(true);
        const { data } = await supabase
          .from("customers")
          .select("id, name, phone")
          .eq("org_id", orgId)
          .order("updated_at", { ascending: false })
          .limit(30);
        setCustomers((data || []) as Customer[]);
        setLoadingCustomers(false);
      };
      load();
      return;
    }

    const load = async () => {
      setLoadingCustomers(true);
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("org_id", orgId)
        .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
        .order("updated_at", { ascending: false })
        .limit(30);
      setCustomers((data || []) as Customer[]);
      setLoadingCustomers(false);
    };
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [orgId, open, searchQuery, localNumber]);

  const isMeta = selectedChannel?.channel_type === "meta_api";
  const approvedTemplates = useMemo(() => templates.filter(t => t.status === "APPROVED"), [templates]);
  const evolutionChannels = useMemo(() => channels.filter(c => c.channel_type === "evolution"), [channels]);

  const selectCustomer = (c: Customer) => {
    if (mode === "group") {
      if (!selectedParticipants.find(p => p.phone === c.phone)) {
        setSelectedParticipants(prev => [...prev, c]);
      }
      return;
    }
    if (mode === "broadcast") {
      if (!broadcastRecipients.find(p => p.phone === c.phone)) {
        setBroadcastRecipients(prev => [...prev, c]);
      }
      return;
    }
    const rawPhone = c.phone.replace(/[^0-9]/g, "");
    const matched = COUNTRY_CODES.find(cc => rawPhone.startsWith(cc.code));
    if (matched) {
      setCountryCode(matched.code);
      setLocalNumber(rawPhone.slice(matched.code.length));
    } else {
      setLocalNumber(rawPhone);
    }
    setCustomerName(c.name || "");
    setIsExistingCustomer(true);
    if (channels.length === 1) {
      setSelectedChannel(channels[0]);
      setStep("message");
    } else {
      setStep("channel");
    }
  };

  const proceedWithNumber = () => {
    if (!isValidNumber) {
      toast.error(`الرقم يجب أن يكون ${selectedCountry.digits} أرقام بعد مفتاح الدولة`);
      return;
    }
    if (channels.length === 1) {
      setSelectedChannel(channels[0]);
      setStep("message");
    } else {
      setStep("channel");
    }
  };

  const selectChannel = (ch: Channel) => {
    setSelectedChannel(ch);
    setSelectedTemplate(null);
    setTemplateVars([]);
    setMessageText("");
    setStep("message");
  };

  const handleSelectTemplate = (t: WhatsAppTemplate) => {
    setSelectedTemplate(t);
    const varCount = t.components?.reduce((acc, c) => {
      const matches = c.text?.match(/\{\{(\d+)\}\}/g);
      return acc + (matches ? matches.length : 0);
    }, 0) || 0;
    setTemplateVars(Array(varCount).fill(""));
  };

  const addManualParticipant = () => {
    const raw = addingNumber.replace(/[^0-9]/g, "");
    if (raw.length < 7) {
      toast.error("رقم غير صالح");
      return;
    }
    const phone = raw.startsWith("0") ? `966${raw.slice(1)}` : raw;
    if (mode === "group") {
      if (!selectedParticipants.find(p => p.phone === phone)) {
        setSelectedParticipants(prev => [...prev, { id: phone, name: null, phone }]);
      }
    } else {
      if (!broadcastRecipients.find(p => p.phone === phone)) {
        setBroadcastRecipients(prev => [...prev, { id: phone, name: null, phone }]);
      }
    }
    setAddingNumber("");
  };

  const proceedGroupOrBroadcast = () => {
    const list = mode === "group" ? selectedParticipants : broadcastRecipients;
    if (list.length === 0) {
      toast.error("أضف عضو واحد على الأقل");
      return;
    }
    if (mode === "group" && !groupName.trim()) {
      toast.error("أدخل اسم القروب");
      return;
    }
    const relevantChannels = mode === "group" ? evolutionChannels : channels;
    if (relevantChannels.length === 1) {
      setSelectedChannel(relevantChannels[0]);
      setStep("message");
    } else if (relevantChannels.length === 0) {
      toast.error(mode === "group" ? "إنشاء القروب يتطلب واتساب ويب" : "لا توجد قنوات متصلة");
    } else {
      setStep("channel");
    }
  };

  const handleSend = async () => {
    if (mode === "group") return handleCreateGroup();
    if (mode === "broadcast") return handleSendBroadcast();
    return handleSendPrivate();
  };

  const handleCreateGroup = async () => {
    if (!selectedChannel || selectedParticipants.length === 0 || !groupName.trim()) return;
    setSending(true);
    try {
      const { data, error } = await invokeCloud("evolution-manage", {
        body: {
          action: "create_group",
          group_name: groupName,
          participants: selectedParticipants.map(p => p.phone),
          instance_name: selectedChannel.evolution_instance_name,
          channel_id: selectedChannel.id,
        },
      });
      if (error || data?.error) throw new Error(data?.error || "فشل إنشاء القروب");

      toast.success(`تم إنشاء القروب "${groupName}" بنجاح`);
      if (data?.conversation_id) {
        onConversationCreated(data.conversation_id);
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setSending(false);
    }
  };

  const handleSendBroadcast = async () => {
    if (!selectedChannel || broadcastRecipients.length === 0) return;
    const isMetaCh = selectedChannel.channel_type === "meta_api";
    if (isMetaCh && !selectedTemplate) {
      toast.error("يجب اختيار قالب للقناة الرسمية");
      return;
    }
    if (!isMetaCh && !messageText.trim()) {
      toast.error("أدخل نص الرسالة");
      return;
    }
    setSending(true);
    try {
      if (isMetaCh && selectedTemplate) {
        let successCount = 0;
        for (const r of broadcastRecipients) {
          const { error } = await invokeCloud("whatsapp-send", {
            body: {
              to: r.phone,
              type: "template",
              template_name: selectedTemplate.name,
              template_language: selectedTemplate.language,
              template_components: buildTemplateComponents(selectedTemplate, templateVars),
              channel_id: selectedChannel.id,
              customer_name: r.name || r.phone,
            },
          });
          if (!error) successCount++;
        }
        toast.success(`تم الإرسال لـ ${successCount}/${broadcastRecipients.length} جهة اتصال`);
      } else {
        const { data, error } = await invokeCloud("evolution-manage", {
          body: {
            action: "send_broadcast",
            phones: broadcastRecipients.map(r => r.phone),
            text: messageText,
            instance_name: selectedChannel.evolution_instance_name,
          },
        });
        if (error || data?.error) throw new Error(data?.error || "فشل الإرسال الجماعي");
        toast.success(`تم الإرسال لـ ${data?.sent || 0}/${broadcastRecipients.length} جهة اتصال`);
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setSending(false);
    }
  };

  const handleSendPrivate = async () => {
    if (!selectedChannel || !isValidNumber) return;
    setSending(true);
    try {
      const cleanPhone = fullPhone;
      const messagePreview = isMeta ? `📋 ${selectedTemplate?.name}` : messageText.trim();

      if (saveCustomer && !isExistingCustomer && orgId) {
        await supabase.from("customers").upsert(
          { org_id: orgId, phone: cleanPhone, name: customerName || null, source: "manual" },
          { onConflict: "org_id,phone" }
        );
      }

      const { data: existingConv } = await supabase
        .from("conversations")
        .select("id")
        .eq("org_id", orgId)
        .eq("customer_phone", cleanPhone)
        .eq("channel_id", selectedChannel.id)
        .neq("status", "closed")
        .limit(1)
        .maybeSingle();

      let conversationId = existingConv?.id;

      if (isMeta && selectedTemplate) {
        const { data, error } = await invokeCloud("whatsapp-send", {
          body: {
            to: cleanPhone,
            type: "template",
            template_name: selectedTemplate.name,
            template_language: selectedTemplate.language,
            template_components: buildTemplateComponents(selectedTemplate, templateVars),
            conversation_id: conversationId,
            channel_id: selectedChannel.id,
            customer_name: customerName || cleanPhone,
          },
        });
        if (error || data?.error) throw new Error(data?.error || "فشل إرسال القالب");
        if (!conversationId && data?.conversation_id) conversationId = data.conversation_id;
      } else if (!isMeta && messageText.trim()) {
        const { data, error } = await invokeCloud("evolution-send", {
          body: {
            to: cleanPhone,
            message: messageText,
            conversation_id: conversationId,
            channel_id: selectedChannel.id,
            customer_name: customerName || cleanPhone,
          },
        });
        if (error || data?.error) throw new Error(data?.error || "فشل إرسال الرسالة");
        if (!conversationId && data?.conversation_id) conversationId = data.conversation_id;
      } else if (isMeta && !selectedTemplate) {
        toast.error("يجب اختيار قالب للقناة الرسمية");
        setSending(false);
        return;
      } else {
        toast.error("أدخل نص الرسالة");
        setSending(false);
        return;
      }

      if (conversationId && !existingConv && messagePreview) {
        await supabase
          .from("conversations")
          .update({
            last_message: messagePreview,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversationId);
      }

      if (conversationId) onConversationCreated(conversationId);
      toast.success("تم إرسال الرسالة بنجاح");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setSending(false);
    }
  };

  const canSend = mode === "private"
    ? isValidNumber && (isMeta ? !!selectedTemplate : messageText.trim().length > 0)
    : mode === "group"
      ? selectedParticipants.length > 0 && groupName.trim().length > 0
      : broadcastRecipients.length > 0 && (isMeta ? !!selectedTemplate : messageText.trim().length > 0);

  const renderModeTabs = () => (
    <div className="flex gap-1 p-1 bg-muted/50 rounded-lg mx-4 mt-3">
      {([
        { key: "private" as const, label: "محادثة", icon: MessageSquare },
        { key: "group" as const, label: "قروب", icon: Users },
        { key: "broadcast" as const, label: "بث جماعي", icon: Radio },
      ]).map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => {
            setMode(key);
            setStep("contact");
            setSelectedChannel(null);
            setSelectedTemplate(null);
            setMessageText("");
          }}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-all",
            mode === key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </button>
      ))}
    </div>
  );

  const renderParticipantChips = (list: Customer[], onRemove: (phone: string) => void) => (
    list.length > 0 && (
      <div className="flex flex-wrap gap-1.5 px-4 py-2">
        {list.map(p => (
          <Badge key={p.phone} variant="secondary" className="gap-1 text-[11px] pl-2 pr-1 py-1">
            {p.name || p.phone}
            <button onClick={() => onRemove(p.phone)} className="hover:bg-destructive/20 rounded-full p-0.5">
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
      </div>
    )
  );

  const renderAddNumberInput = () => (
    <div className="px-4 pb-2">
      <div className="flex gap-1.5" dir="ltr">
        <Input
          type="tel"
          inputMode="numeric"
          placeholder="أضف رقم يدوياً..."
          value={addingNumber}
          onChange={(e) => setAddingNumber(e.target.value.replace(/[^0-9]/g, ""))}
          className="text-sm h-9 bg-background font-mono"
          onKeyDown={(e) => e.key === "Enter" && addManualParticipant()}
        />
        <Button size="sm" variant="outline" className="h-9 px-3" onClick={addManualParticipant} disabled={!addingNumber}>
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden max-h-[90dvh] overflow-y-auto" dir="rtl">
        {/* Header */}
        <DialogHeader className="p-4 pb-3 border-b border-border/40 bg-card">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Plus className="w-4 h-4 text-primary" />
            </div>
            محادثة جديدة
          </DialogTitle>
          {renderModeTabs()}
          {mode === "private" && (
            <div className="flex items-center gap-2 mt-3">
              {(["contact", "channel", "message"] as Step[]).map((s, i) => {
                const labels = ["جهة الاتصال", "القناة", "الرسالة"];
                const isActive = s === step;
                const isDone = (step === "channel" && i === 0) || (step === "message" && i < 2);
                return (
                  <div key={s} className="flex items-center gap-1.5 flex-1">
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all",
                      isActive ? "bg-primary text-primary-foreground" :
                      isDone ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                    )}>
                      {i + 1}
                    </div>
                    <span className={cn("text-[11px]", isActive ? "text-foreground font-medium" : "text-muted-foreground")}>
                      {labels[i]}
                    </span>
                    {i < 2 && <div className="flex-1 h-px bg-border/60" />}
                  </div>
                );
              })}
            </div>
          )}
        </DialogHeader>

        {/* ═══ PRIVATE MODE ═══ */}
        {mode === "private" && step === "contact" && (
          <div className="flex flex-col">
            <div className="p-4 pb-2 space-y-2">
              <Label className="text-xs text-muted-foreground">أدخل رقم الهاتف</Label>
              <div className="flex gap-1.5" dir="ltr">
                <div className="relative">
                  <button
                    onClick={() => setShowCountryPicker(!showCountryPicker)}
                    className="h-10 px-2.5 rounded-lg border border-input bg-background flex items-center gap-1 text-sm hover:bg-accent/50 transition-colors min-w-[90px]"
                  >
                    <span>{selectedCountry.flag}</span>
                    <span className="text-xs font-medium">+{countryCode}</span>
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  </button>
                  {showCountryPicker && (
                    <div className="absolute top-11 left-0 z-50 w-[220px] bg-popover border border-border rounded-xl shadow-lg overflow-hidden" dir="rtl">
                      <ScrollArea className="h-[200px]">
                        {COUNTRY_CODES.map((cc) => (
                          <button
                            key={cc.code}
                            onClick={() => { setCountryCode(cc.code); setShowCountryPicker(false); }}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-2 text-right hover:bg-accent/50 transition-colors",
                              cc.code === countryCode && "bg-primary/10"
                            )}
                          >
                            <span>{cc.flag}</span>
                            <span className="text-xs flex-1">{cc.name}</span>
                            <span className="text-[10px] text-muted-foreground" dir="ltr">+{cc.code}</span>
                          </button>
                        ))}
                      </ScrollArea>
                    </div>
                  )}
                </div>
                <div className="relative flex-1">
                  <Input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="tel-national"
                    enterKeyHint="next"
                    placeholder={`${"0".repeat(selectedCountry.digits)}`}
                    value={localNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, "");
                      setLocalNumber(val);
                      setIsExistingCustomer(false);
                    }}
                    className="text-sm h-10 bg-background font-mono tracking-wider"
                    maxLength={selectedCountry.digits + 1}
                  />
                </div>
                <Button size="sm" className="h-10 px-4" onClick={proceedWithNumber} disabled={!isValidNumber}>
                  التالي
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <p className={cn(
                  "text-[10px] transition-colors",
                  localNumber.length > 0
                    ? isValidNumber ? "text-emerald-500" : "text-destructive"
                    : "text-muted-foreground"
                )}>
                  {localNumber.length > 0
                    ? isValidNumber ? `✓ رقم صحيح: +${fullPhone}` : `${cleanDigits.length}/${selectedCountry.digits} أرقام`
                    : `${selectedCountry.digits} أرقام بعد مفتاح الدولة`
                  }
                </p>
                {!isExistingCustomer && localNumber.length > 0 && (
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox checked={saveCustomer} onCheckedChange={(v) => setSaveCustomer(v === true)} className="w-3.5 h-3.5" />
                    <span className="text-[10px] text-muted-foreground">حفظ كعميل</span>
                  </label>
                )}
              </div>
              {saveCustomer && !isExistingCustomer && (
                <Input placeholder="اسم العميل (اختياري)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="h-9 text-sm bg-background" />
              )}
            </div>
            <div className="flex items-center gap-3 px-4 py-2">
              <div className="flex-1 h-px bg-border/50" />
              <span className="text-[10px] text-muted-foreground">أو اختر من العملاء</span>
              <div className="flex-1 h-px bg-border/50" />
            </div>
            <div className="px-4 pb-2">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="ابحث بالاسم أو الرقم..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pr-9 text-sm h-9 bg-background" />
              </div>
            </div>
            <ScrollArea className="h-[200px]">
              <div className="px-2 pb-2">
                {loadingCustomers ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                ) : customers.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-xs">لا يوجد عملاء</div>
                ) : (
                  customers.map((c) => (
                    <button key={c.id} onClick={() => selectCustomer(c)} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent/50 transition-colors text-right">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{c.name || "بدون اسم"}</p>
                        <p className="text-[11px] text-muted-foreground" dir="ltr">{c.phone}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* ═══ GROUP MODE - Contact Step ═══ */}
        {mode === "group" && step === "contact" && (
          <div className="flex flex-col">
            <div className="p-4 pb-2 space-y-2">
              <Label className="text-xs text-muted-foreground">اسم القروب</Label>
              <Input
                placeholder="أدخل اسم القروب..."
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="h-10 text-sm bg-background"
              />
            </div>

            {renderParticipantChips(selectedParticipants, (phone) =>
              setSelectedParticipants(prev => prev.filter(p => p.phone !== phone))
            )}

            <div className="flex items-center gap-3 px-4 py-2">
              <div className="flex-1 h-px bg-border/50" />
              <span className="text-[10px] text-muted-foreground">أضف أعضاء ({selectedParticipants.length})</span>
              <div className="flex-1 h-px bg-border/50" />
            </div>

            {renderAddNumberInput()}

            <div className="px-4 pb-2">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="ابحث بالاسم أو الرقم..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pr-9 text-sm h-9 bg-background" />
              </div>
            </div>

            <ScrollArea className="h-[180px]">
              <div className="px-2 pb-2">
                {loadingCustomers ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                ) : (
                  customers.map((c) => {
                    const isSelected = selectedParticipants.some(p => p.phone === c.phone);
                    return (
                      <button key={c.id} onClick={() => selectCustomer(c)} className={cn(
                        "w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors text-right",
                        isSelected ? "bg-primary/5 opacity-60" : "hover:bg-accent/50"
                      )}>
                        <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", isSelected ? "bg-primary/20" : "bg-primary/10")}>
                          {isSelected ? <Checkbox checked className="w-4 h-4" /> : <User className="w-4 h-4 text-primary" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{c.name || "بدون اسم"}</p>
                          <p className="text-[11px] text-muted-foreground" dir="ltr">{c.phone}</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            <div className="p-4 pt-2 border-t border-border/30">
              <Button className="w-full h-10 gap-2" onClick={proceedGroupOrBroadcast} disabled={selectedParticipants.length === 0 || !groupName.trim()}>
                <Users className="w-4 h-4" />
                التالي ({selectedParticipants.length} عضو)
              </Button>
            </div>
          </div>
        )}

        {/* ═══ BROADCAST MODE - Contact Step ═══ */}
        {mode === "broadcast" && step === "contact" && (
          <div className="flex flex-col">
            {renderParticipantChips(broadcastRecipients, (phone) =>
              setBroadcastRecipients(prev => prev.filter(p => p.phone !== phone))
            )}

            <div className="flex items-center gap-3 px-4 py-2">
              <div className="flex-1 h-px bg-border/50" />
              <span className="text-[10px] text-muted-foreground">اختر المستلمين ({broadcastRecipients.length})</span>
              <div className="flex-1 h-px bg-border/50" />
            </div>

            {renderAddNumberInput()}

            <div className="px-4 pb-2">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="ابحث بالاسم أو الرقم..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pr-9 text-sm h-9 bg-background" />
              </div>
            </div>

            <ScrollArea className="h-[220px]">
              <div className="px-2 pb-2">
                {loadingCustomers ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                ) : (
                  customers.map((c) => {
                    const isSelected = broadcastRecipients.some(p => p.phone === c.phone);
                    return (
                      <button key={c.id} onClick={() => selectCustomer(c)} className={cn(
                        "w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors text-right",
                        isSelected ? "bg-primary/5 opacity-60" : "hover:bg-accent/50"
                      )}>
                        <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", isSelected ? "bg-primary/20" : "bg-primary/10")}>
                          {isSelected ? <Checkbox checked className="w-4 h-4" /> : <User className="w-4 h-4 text-primary" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{c.name || "بدون اسم"}</p>
                          <p className="text-[11px] text-muted-foreground" dir="ltr">{c.phone}</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            <div className="p-4 pt-2 border-t border-border/30">
              <Button className="w-full h-10 gap-2" onClick={proceedGroupOrBroadcast} disabled={broadcastRecipients.length === 0}>
                <Radio className="w-4 h-4" />
                التالي ({broadcastRecipients.length} مستلم)
              </Button>
            </div>
          </div>
        )}

        {/* ═══ CHANNEL SELECTION (all modes) ═══ */}
        {step === "channel" && (
          <div className="p-4 space-y-3">
            {mode === "private" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="w-4 h-4" />
                <span dir="ltr">+{fullPhone}</span>
                {customerName && <Badge variant="outline" className="text-[10px]">{customerName}</Badge>}
                <button onClick={() => setStep("contact")} className="mr-auto text-xs text-primary hover:underline">تغيير</button>
              </div>
            )}
            {mode === "group" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="w-4 h-4" />
                <span>{groupName}</span>
                <Badge variant="outline" className="text-[10px]">{selectedParticipants.length} عضو</Badge>
                <button onClick={() => setStep("contact")} className="mr-auto text-xs text-primary hover:underline">تغيير</button>
              </div>
            )}
            {mode === "broadcast" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Radio className="w-4 h-4" />
                <span>بث جماعي</span>
                <Badge variant="outline" className="text-[10px]">{broadcastRecipients.length} مستلم</Badge>
                <button onClick={() => setStep("contact")} className="mr-auto text-xs text-primary hover:underline">تغيير</button>
              </div>
            )}

            <Label className="text-xs font-medium">اختر القناة للإرسال</Label>

            <div className="grid gap-2">
              {(mode === "group" ? evolutionChannels : channels).map((ch) => {
                const isMetaCh = ch.channel_type === "meta_api";
                return (
                  <button
                    key={ch.id}
                    onClick={() => selectChannel(ch)}
                    className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-card/50 hover:border-primary/40 hover:bg-primary/5 transition-all text-right"
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      isMetaCh ? "bg-emerald-500/10" : "bg-amber-500/10"
                    )}>
                      {isMetaCh ? <ShieldCheck className="w-5 h-5 text-emerald-500" /> : <Wifi className="w-5 h-5 text-amber-500" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{ch.business_name || ch.display_phone || ch.evolution_instance_name || "قناة"}</p>
                      <p className="text-[10px] text-muted-foreground">{ch.display_phone || ch.evolution_instance_name}</p>
                    </div>
                    <Badge variant="outline" className={cn(
                      "text-[9px] shrink-0",
                      isMetaCh ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/5" : "border-amber-500/30 text-amber-600 bg-amber-500/5"
                    )}>
                      {isMetaCh ? "رسمي - يتطلب قالب" : "ويب - رسالة حرة"}
                    </Badge>
                  </button>
                );
              })}
            </div>

            {(mode === "group" ? evolutionChannels : channels).length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-xs">
                {mode === "group" ? "إنشاء القروب يتطلب قناة واتساب ويب" : "لا توجد قنوات متصلة"}
              </div>
            )}
          </div>
        )}

        {/* ═══ MESSAGE STEP (private & broadcast) ═══ */}
        {step === "message" && selectedChannel && mode !== "group" && (
          <div className="flex flex-col">
            <div className="p-3 border-b border-border/30 flex items-center gap-2 text-xs text-muted-foreground bg-muted/30">
              {mode === "private" ? <User className="w-3.5 h-3.5" /> : <Radio className="w-3.5 h-3.5" />}
              <span>{mode === "private" ? (customerName || `+${fullPhone}`) : `${broadcastRecipients.length} مستلم`}</span>
              <span className="mx-1">•</span>
              {isMeta ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> : <Wifi className="w-3.5 h-3.5 text-amber-500" />}
              <span>{selectedChannel.business_name || selectedChannel.display_phone || selectedChannel.evolution_instance_name}</span>
              <button onClick={() => setStep(channels.length > 1 ? "channel" : "contact")} className="mr-auto text-primary hover:underline text-[11px]">تغيير</button>
            </div>

            {isMeta ? (
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <Label className="text-xs font-medium">اختر قالب للإرسال</Label>
                </div>
                <p className="text-[10px] text-muted-foreground">القناة الرسمية تتطلب إرسال قالب معتمد كأول رسالة</p>

                {!selectedTemplate ? (
                  <ScrollArea className="h-[200px]">
                    <div className="grid gap-1.5">
                      {approvedTemplates.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground text-xs">لا توجد قوالب معتمدة</div>
                      ) : (
                        approvedTemplates.map((t) => (
                          <button key={t.id || t.name} onClick={() => handleSelectTemplate(t)} className="w-full text-right p-3 rounded-xl border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all">
                            <p className="text-sm font-medium">{t.name}</p>
                            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{t.components?.find(c => c.type === "BODY")?.text || ""}</p>
                            <div className="flex gap-1.5 mt-1.5">
                              <Badge variant="outline" className="text-[9px]">{t.language}</Badge>
                              <Badge variant="outline" className="text-[9px]">{t.category}</Badge>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium">{selectedTemplate.name}</p>
                        <button onClick={() => setSelectedTemplate(null)} className="text-muted-foreground hover:text-foreground">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{selectedTemplate.components?.find(c => c.type === "BODY")?.text || ""}</p>
                    </div>
                    {templateVars.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">المتغيرات</Label>
                        {templateVars.map((v, i) => (
                          <Input
                            key={i}
                            placeholder={`متغير {{${i + 1}}}`}
                            value={v}
                            onChange={(e) => {
                              const next = [...templateVars];
                              next[i] = e.target.value;
                              setTemplateVars(next);
                            }}
                            className="h-9 text-sm"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <Label className="text-xs font-medium">اكتب رسالتك</Label>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {mode === "broadcast" ? "سيتم إرسال هذه الرسالة لجميع المستلمين" : "القناة غير الرسمية تتيح إرسال رسائل حرة مباشرة"}
                </p>
                <Textarea
                  placeholder="اكتب رسالتك هنا..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  className="min-h-[100px] text-sm resize-none bg-background"
                />
              </div>
            )}

            <div className="p-4 pt-2 border-t border-border/30">
              <Button className="w-full h-11 gap-2" disabled={!canSend || sending} onClick={handleSend}>
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? "جاري الإرسال..." : mode === "broadcast" ? `إرسال لـ ${broadcastRecipients.length} مستلم` : saveCustomer ? "حفظ وإرسال" : "إرسال"}
              </Button>
            </div>
          </div>
        )}

        {/* ═══ GROUP - Confirm Step ═══ */}
        {step === "message" && selectedChannel && mode === "group" && (
          <div className="flex flex-col">
            <div className="p-3 border-b border-border/30 flex items-center gap-2 text-xs text-muted-foreground bg-muted/30">
              <Users className="w-3.5 h-3.5" />
              <span>{groupName}</span>
              <span className="mx-1">•</span>
              <span>{selectedParticipants.length} عضو</span>
              <span className="mx-1">•</span>
              <Wifi className="w-3.5 h-3.5 text-amber-500" />
              <span>{selectedChannel.business_name || selectedChannel.evolution_instance_name}</span>
              <button onClick={() => setStep("contact")} className="mr-auto text-primary hover:underline text-[11px]">تغيير</button>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <Label className="text-xs font-medium">تأكيد إنشاء القروب</Label>
              </div>
              <div className="p-3 rounded-xl bg-muted/50 space-y-2">
                <p className="text-sm font-medium">{groupName}</p>
                <p className="text-xs text-muted-foreground">{selectedParticipants.length} عضو</p>
                <div className="flex flex-wrap gap-1">
                  {selectedParticipants.map(p => (
                    <Badge key={p.phone} variant="outline" className="text-[10px]">
                      {p.name || p.phone}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 pt-2 border-t border-border/30">
              <Button className="w-full h-11 gap-2" disabled={sending} onClick={handleSend}>
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                {sending ? "جاري الإنشاء..." : "إنشاء القروب"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default NewConversationDialog;
