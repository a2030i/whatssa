import { useState, useEffect, useMemo, useRef } from "react";
import { Search, Phone, Send, MessageSquare, ShieldCheck, Wifi, User, FileText, Loader2, Plus, X, Save, Globe, ChevronDown, Users, Image as ImageIcon, Mail } from "lucide-react";
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
  channel_label?: string | null;
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

type DialogMode = "private" | "group" | "email";
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
  const { orgId, profile } = useAuth();
  const [step, setStep] = useState<Step>("contact");
  const [dialogMode, setDialogMode] = useState<DialogMode>("private");
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
  // Group state
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [groupMemberInput, setGroupMemberInput] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupImageFile, setGroupImageFile] = useState<File | null>(null);
  const [groupImagePreview, setGroupImagePreview] = useState<string | null>(null);
  const groupImageInputRef = useRef<HTMLInputElement>(null);
  // Email state
  const [emailToInput, setEmailToInput] = useState("");
  const [emailToList, setEmailToList] = useState<string[]>([]);
  const [emailCcInput, setEmailCcInput] = useState("");
  const [emailCcList, setEmailCcList] = useState<string[]>([]);
  const [emailBccInput, setEmailBccInput] = useState("");
  const [emailBccList, setEmailBccList] = useState<string[]>([]);
  const [showCcField, setShowCcField] = useState(false);
  const [showBccField, setShowBccField] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailConfigs, setEmailConfigs] = useState<{ id: string; email_address: string; label: string | null }[]>([]);
  const [selectedEmailConfig, setSelectedEmailConfig] = useState<string | null>(null);

  const addEmailTo = (val?: string) => {
    const email = (val || emailToInput).trim().toLowerCase();
    if (!email || !email.includes("@") || emailToList.includes(email)) return;
    setEmailToList(prev => [...prev, email]);
    setEmailToInput("");
  };
  const addEmailCc = (val?: string) => {
    const email = (val || emailCcInput).trim().toLowerCase();
    if (!email || !email.includes("@") || emailCcList.includes(email) || emailToList.includes(email)) return;
    setEmailCcList(prev => [...prev, email]);
    setEmailCcInput("");
  };
  const addEmailBcc = (val?: string) => {
    const email = (val || emailBccInput).trim().toLowerCase();
    if (!email || !email.includes("@") || emailBccList.includes(email) || emailToList.includes(email) || emailCcList.includes(email)) return;
    setEmailBccList(prev => [...prev, email]);
    setEmailBccInput("");
  };

  const selectedCountry = COUNTRY_CODES.find(c => c.code === countryCode) || COUNTRY_CODES[0];
  const fullPhone = `${countryCode}${localNumber.replace(/^0+/, "")}`;
  const cleanDigits = localNumber.replace(/[^0-9]/g, "").replace(/^0+/, "");
  const isValidNumber = cleanDigits.length === selectedCountry.digits;

  // Reset on open
  useEffect(() => {
    if (open) {
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
      setGroupMembers([]);
      setGroupMemberInput("");
      setGroupImageFile(null);
      setGroupImagePreview(null);
      setEmailToInput("");
      setEmailToList([]);
      setEmailCcInput("");
      setEmailCcList([]);
      setEmailBccInput("");
      setEmailBccList([]);
      setShowCcField(false);
      setShowBccField(false);
      setEmailSubject("");
      setEmailBody("");
      setSelectedEmailConfig(null);
      // Don't set dialogMode here - will be set after channels/email load
    }
  }, [open]);

  // Auto-select default mode based on available channels
  useEffect(() => {
    if (!open) return;
    if (channels.length > 0) {
      setDialogMode("private");
    } else if (emailConfigs.length > 0) {
      setDialogMode("email");
    } else {
      setDialogMode("private");
    }
  }, [open, channels.length, emailConfigs.length]);

  // Load channels
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

  // Load email configs
  useEffect(() => {
    if (!orgId || !open) return;
    const load = async () => {
      const { data: res } = await invokeCloud("email-config-manage", {
        body: { action: "list" },
      });
      setEmailConfigs(res?.data || []);
      if (res?.data?.length > 0) {
        setSelectedEmailConfig(res.data[0].id);
      }
    };
    load();
  }, [orgId, open]);

  // Search customers - triggered by searchQuery OR localNumber input
  useEffect(() => {
    if (!orgId || !open) return;
    const query = searchQuery || localNumber;
    if (!query.trim()) {
      // Load recent customers
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
  const hasEvolution = evolutionChannels.length > 0;
  const hasEmailConfigs = emailConfigs.length > 0;
  const hasWhatsApp = channels.length > 0;

  const handleSendEmail = async () => {
    if (emailToList.length === 0 || !emailSubject || !emailBody) {
      toast.error("يرجى تعبئة جميع حقول الإيميل");
      return;
    }
    setSendingEmail(true);
    try {
      const { data, error } = await invokeCloud("email-send", {
        body: {
          to: emailToList.join(", "),
          cc: emailCcList.length > 0 ? emailCcList.join(", ") : undefined,
          subject: emailSubject,
          body: emailBody,
          config_id: selectedEmailConfig,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      toast.success("✅ تم إرسال الإيميل بنجاح");
      if (data?.conversation_id) {
        onConversationCreated(data.conversation_id);
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "فشل إرسال الإيميل");
    } finally {
      setSendingEmail(false);
    }
  };

  const addGroupMember = () => {
    const raw = groupMemberInput.replace(/[^0-9]/g, "");
    if (raw.length < 7) { toast.error("رقم غير صالح"); return; }
    if (groupMembers.includes(raw)) { toast.error("الرقم مضاف مسبقاً"); return; }
    setGroupMembers(prev => [...prev, raw]);
    setGroupMemberInput("");
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) { toast.error("أدخل اسم القروب"); return; }
    if (groupMembers.length < 1) { toast.error("أضف عضو واحد على الأقل"); return; }
    const ch = selectedChannel || evolutionChannels[0];
    if (!ch) { toast.error("لا توجد قناة واتساب ويب متصلة"); return; }
    
    setCreatingGroup(true);
    try {
      const { data, error } = await invokeCloud("evolution-send", {
        body: {
          action: "create_group",
          channel_id: ch.id,
          group_name: groupName.trim(),
          members: groupMembers,
        },
      });
      if (error || data?.error) throw new Error(data?.error || "فشل إنشاء القروب");

      // Upload group picture if selected
      if (groupImageFile && data?.group_jid) {
        try {
          // Upload to storage first
          const ext = groupImageFile.name.split(".").pop() || "jpg";
          const path = `group-pics/${orgId}/${Date.now()}.${ext}`;
          const { error: uploadErr } = await supabase.storage.from("chat-media").upload(path, groupImageFile);
          if (!uploadErr) {
            const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(path);
            if (urlData?.publicUrl) {
              await invokeCloud("evolution-manage", {
                body: {
                  action: "update_group_picture",
                  channel_id: ch.id,
                  group_jid: data.group_jid,
                  image_url: urlData.publicUrl,
                },
              });
            }
          }
        } catch {
          // Non-critical - group was created
          console.warn("Failed to set group picture");
        }
      }

      toast.success(`✅ تم إنشاء قروب "${groupName}" بنجاح`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setCreatingGroup(false);
    }
  };

  const selectCustomer = (c: Customer) => {
    // Parse phone - try to extract country code
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

  const handleSend = async () => {
    if (!selectedChannel || !isValidNumber) return;

    setSending(true);
    try {
      const cleanPhone = fullPhone;
      const messagePreview = isMeta ? `📋 ${selectedTemplate?.name}` : messageText.trim();

      // Save customer if requested
      if (saveCustomer && !isExistingCustomer && orgId) {
        await supabase.from("customers").upsert(
          {
            org_id: orgId,
            phone: cleanPhone,
            name: customerName || null,
            source: "manual",
          },
          { onConflict: "org_id,phone" }
        );
      }

      // Find existing conversation (read-only, no RLS issue)
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
        // Edge function may return conversation_id if it created one
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
        // Edge function creates conversation if needed — get its ID
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

      // Auto-assign private conversations to the creator
      if (conversationId && dialogMode === "private" && profile?.id) {
        await supabase
          .from("conversations")
          .update({
            assigned_to: profile.full_name || "موظف",
            assigned_to_id: profile.id,
            assigned_at: new Date().toISOString(),
          })
          .eq("id", conversationId);
      }

      if (conversationId) {
        onConversationCreated(conversationId);
      }

      toast.success("تم إرسال الرسالة بنجاح");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setSending(false);
    }
  };

  const canSend = isValidNumber && (isMeta ? !!selectedTemplate : messageText.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden max-h-[90dvh] overflow-y-auto" dir="rtl">
        {/* Header */}
        <DialogHeader className="p-4 pb-3 border-b border-border/40 bg-card">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Plus className="w-4 h-4 text-primary" />
            </div>
            {dialogMode === "group" ? "إنشاء قروب" : dialogMode === "email" ? "إرسال إيميل" : "محادثة جديدة"}
          </DialogTitle>

          {/* Mode toggle - only show modes that have channels/configs */}
          {(hasWhatsApp || hasEvolution || hasEmailConfigs) ? (
            <div className="flex items-center gap-1 mt-3 bg-muted rounded-lg p-1">
              {hasWhatsApp && (
                <button
                  onClick={() => setDialogMode("private")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-md transition-colors",
                    dialogMode === "private" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <MessageSquare className="w-3.5 h-3.5" /> واتساب
                </button>
              )}
              {hasEvolution && (
                <button
                  onClick={() => setDialogMode("group")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-md transition-colors",
                    dialogMode === "group" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Users className="w-3.5 h-3.5" /> قروب
                </button>
              )}
              {hasEmailConfigs && (
                <button
                  onClick={() => setDialogMode("email")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-md transition-colors",
                    dialogMode === "email" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Mail className="w-3.5 h-3.5" /> إيميل
                </button>
              )}
            </div>
          ) : (
            <div className="mt-3 bg-warning/10 border border-warning/20 rounded-xl p-3 text-center">
              <p className="text-xs text-warning font-medium">⚠️ لا توجد قنوات متصلة</p>
              <p className="text-[10px] text-muted-foreground mt-1">يجب ربط رقم واتساب أو إعداد إيميل من صفحة التكاملات</p>
            </div>
          )}

          {/* Stepper - only for private mode */}
          {dialogMode === "private" && (
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

        {/* ═══ GROUP MODE ═══ */}
        {dialogMode === "group" && (
          <div className="p-4 space-y-4">
            {/* Group image + name */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => groupImageInputRef.current?.click()}
                className="w-14 h-14 rounded-2xl bg-secondary/60 border border-border/40 flex items-center justify-center shrink-0 hover:bg-secondary transition-colors overflow-hidden"
              >
                {groupImagePreview ? (
                  <img src={groupImagePreview} alt="صورة القروب" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-5 h-5 text-muted-foreground" />
                )}
              </button>
              <input
                ref={groupImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setGroupImageFile(file);
                    setGroupImagePreview(URL.createObjectURL(file));
                  }
                }}
              />
              <div className="flex-1 space-y-1">
                <Label className="text-xs font-medium">📝 اسم القروب</Label>
                <Input
                  placeholder="مثال: فريق المبيعات"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="h-10 text-sm bg-background"
                />
              </div>
            </div>

            {/* Channel selector for group - evolution channels */}
            {evolutionChannels.length > 0 ? (
              <div className="space-y-2">
                <Label className="text-xs font-medium">📱 القناة</Label>
                <div className="grid gap-2">
                  {evolutionChannels.map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => setSelectedChannel(ch)}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border transition-all text-right",
                        (selectedChannel?.id === ch.id || (evolutionChannels.length === 1))
                          ? "border-primary/40 bg-primary/5"
                          : "border-border/40 bg-card/50 hover:border-border/80"
                      )}
                    >
                      <Wifi className="w-4 h-4 text-warning shrink-0" />
                      <span className="text-sm font-medium truncate">{ch.channel_label || ch.business_name || ch.display_phone || ch.evolution_instance_name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-warning/10 border border-warning/20 rounded-xl p-3 text-center">
                <p className="text-xs text-warning font-medium">⚠️ لا توجد قناة واتساب ويب متصلة</p>
                <p className="text-[10px] text-muted-foreground mt-1">يجب ربط رقم واتساب ويب أولاً من صفحة التكاملات</p>
              </div>
            )}

            {/* Add members */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">👥 الأعضاء ({groupMembers.length})</Label>
              <div className="flex gap-1.5" dir="ltr">
                <Input
                  type="tel"
                  inputMode="numeric"
                  placeholder="966535195202"
                  value={groupMemberInput}
                  onChange={(e) => setGroupMemberInput(e.target.value.replace(/[^0-9]/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGroupMember(); } }}
                  className="text-sm h-10 bg-background font-mono"
                />
                <Button size="sm" className="h-10 px-4" onClick={addGroupMember} disabled={!groupMemberInput.trim()}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">أدخل الرقم مع مفتاح الدولة (بدون +)</p>

              {/* Members list */}
              {groupMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {groupMembers.map((m, i) => (
                    <Badge key={i} variant="secondary" className="gap-1 text-xs py-1 px-2 font-mono" dir="ltr">
                      +{m}
                      <button onClick={() => setGroupMembers(prev => prev.filter((_, j) => j !== i))} className="hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Quick add from customers */}
              <div className="mt-3">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="ابحث عن عميل لإضافته..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pr-9 text-sm h-9 bg-background"
                  />
                </div>
                <ScrollArea className="h-[140px] mt-2">
                  <div className="space-y-0.5">
                    {customers.map((c) => {
                      const rawPhone = c.phone.replace(/[^0-9]/g, "");
                      const isAdded = groupMembers.includes(rawPhone);
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            if (!isAdded) setGroupMembers(prev => [...prev, rawPhone]);
                          }}
                          disabled={isAdded}
                          className={cn(
                            "w-full flex items-center gap-2 p-2 rounded-lg text-right transition-colors",
                            isAdded ? "opacity-50" : "hover:bg-accent/50"
                          )}
                        >
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{c.name || "بدون اسم"}</p>
                            <p className="text-[10px] text-muted-foreground" dir="ltr">{c.phone}</p>
                          </div>
                          {isAdded && <Badge variant="outline" className="text-[9px]">مضاف ✓</Badge>}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            </div>

            {/* Create button */}
            <Button
              className="w-full h-11 gap-2"
              disabled={!groupName.trim() || groupMembers.length < 1 || creatingGroup}
              onClick={handleCreateGroup}
            >
              {creatingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              {creatingGroup ? "جاري الإنشاء..." : `إنشاء القروب (${groupMembers.length} عضو)`}
            </Button>
          </div>
        )}

        {/* ═══ EMAIL MODE ═══ */}
        {dialogMode === "email" && (
          <div className="p-4 space-y-4">
            {/* From selector */}
            {emailConfigs.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">📤 من</Label>
                <div className="grid gap-1.5">
                  {emailConfigs.map((ec) => (
                    <button
                      key={ec.id}
                      onClick={() => setSelectedEmailConfig(ec.id)}
                      className={cn(
                        "flex items-center gap-2 p-2.5 rounded-lg border text-right transition-all text-sm",
                        selectedEmailConfig === ec.id
                          ? "border-primary/40 bg-primary/5"
                          : "border-border/40 hover:border-border/80"
                      )}
                    >
                      <Mail className="w-4 h-4 text-primary shrink-0" />
                      <span className="truncate">{ec.label || ec.email_address}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {emailConfigs.length === 1 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2.5">
                <Mail className="w-3.5 h-3.5 text-primary" />
                <span>من: {emailConfigs[0].label || emailConfigs[0].email_address}</span>
              </div>
            )}

            {/* To - chips style */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">📩 إلى</Label>
                {!showCcField && (
                  <button onClick={() => setShowCcField(true)} className="text-[10px] text-primary hover:underline">+ Cc</button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1 min-h-[40px] rounded-lg border border-input bg-background px-2 py-1.5" dir="ltr">
                {emailToList.map((email, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 text-xs py-0.5 px-2 shrink-0">
                    {email}
                    <button onClick={() => setEmailToList(prev => prev.filter((_, j) => j !== i))} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
                <input
                  type="email"
                  placeholder={emailToList.length === 0 ? "example@email.com" : ""}
                  value={emailToInput}
                  onChange={(e) => setEmailToInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "," || e.key === " " || e.key === "Tab") {
                      e.preventDefault();
                      addEmailTo();
                    }
                    if (e.key === "Backspace" && !emailToInput && emailToList.length > 0) {
                      setEmailToList(prev => prev.slice(0, -1));
                    }
                  }}
                  onBlur={() => addEmailTo()}
                  className="flex-1 min-w-[120px] text-sm bg-transparent outline-none border-0 h-7"
                />
              </div>
            </div>

            {/* CC - chips style */}
            {showCcField && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">📋 Cc</Label>
                <div className="flex flex-wrap items-center gap-1 min-h-[40px] rounded-lg border border-input bg-background px-2 py-1.5" dir="ltr">
                  {emailCcList.map((email, i) => (
                    <Badge key={i} variant="outline" className="gap-1 text-xs py-0.5 px-2 shrink-0">
                      {email}
                      <button onClick={() => setEmailCcList(prev => prev.filter((_, j) => j !== i))} className="hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                  <input
                    type="email"
                    placeholder={emailCcList.length === 0 ? "cc@email.com" : ""}
                    value={emailCcInput}
                    onChange={(e) => setEmailCcInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "," || e.key === " " || e.key === "Tab") {
                        e.preventDefault();
                        addEmailCc();
                      }
                      if (e.key === "Backspace" && !emailCcInput && emailCcList.length > 0) {
                        setEmailCcList(prev => prev.slice(0, -1));
                      }
                    }}
                    onBlur={() => addEmailCc()}
                    className="flex-1 min-w-[120px] text-sm bg-transparent outline-none border-0 h-7"
                  />
                </div>
              </div>
            )}

            {/* Subject */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">📝 الموضوع</Label>
              <Input
                placeholder="موضوع الإيميل..."
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                className="h-10 text-sm bg-background"
              />
            </div>

            {/* Body */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">✉️ نص الرسالة</Label>
              <Textarea
                placeholder="اكتب نص الإيميل هنا..."
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                className="min-h-[120px] text-sm resize-none bg-background"
              />
            </div>

            {/* Send */}
            <Button
              className="w-full h-11 gap-2"
              disabled={emailToList.length === 0 || !emailSubject || !emailBody || sendingEmail}
              onClick={handleSendEmail}
            >
              {sendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sendingEmail ? "جاري الإرسال..." : "إرسال الإيميل"}
            </Button>
          </div>
        )}

        {/* ═══ PRIVATE MODE ═══ */}
        {/* Step: Contact */}
        {dialogMode === "private" && step === "contact" && (
          <div className="flex flex-col">
            {/* Phone input with country code */}
            <div className="p-4 pb-2 space-y-2">
              <Label className="text-xs text-muted-foreground">أدخل رقم الهاتف</Label>
              <div className="flex gap-1.5" dir="ltr">
                {/* Country code picker */}
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

                {/* Number input */}
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

                {/* Next button */}
                <Button
                  size="sm"
                  className="h-10 px-4"
                  onClick={proceedWithNumber}
                  disabled={!isValidNumber}
                >
                  التالي
                </Button>
              </div>

              {/* Validation feedback */}
              <div className="flex items-center justify-between">
                <p className={cn(
                  "text-[10px] transition-colors",
                  localNumber.length > 0
                    ? isValidNumber ? "text-emerald-500" : "text-destructive"
                    : "text-muted-foreground"
                )}>
                  {localNumber.length > 0
                    ? isValidNumber
                      ? `✓ رقم صحيح: +${fullPhone}`
                      : `${cleanDigits.length}/${selectedCountry.digits} أرقام`
                    : `${selectedCountry.digits} أرقام بعد مفتاح الدولة`
                  }
                </p>

                {/* Save customer checkbox */}
                {!isExistingCustomer && localNumber.length > 0 && (
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox
                      checked={saveCustomer}
                      onCheckedChange={(v) => setSaveCustomer(v === true)}
                      className="w-3.5 h-3.5"
                    />
                    <span className="text-[10px] text-muted-foreground">حفظ كعميل</span>
                  </label>
                )}
              </div>

              {/* Customer name input (when saving) */}
              {saveCustomer && !isExistingCustomer && (
                <Input
                  placeholder="اسم العميل (اختياري)"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="h-9 text-sm bg-background"
                />
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 px-4 py-2">
              <div className="flex-1 h-px bg-border/50" />
              <span className="text-[10px] text-muted-foreground">أو اختر من العملاء</span>
              <div className="flex-1 h-px bg-border/50" />
            </div>

            {/* Customer search */}
            <div className="px-4 pb-2">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="ابحث بالاسم أو الرقم..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-9 text-sm h-9 bg-background"
                />
              </div>
            </div>

            {/* Customer list */}
            <ScrollArea className="h-[200px]">
              <div className="px-2 pb-2">
                {loadingCustomers ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : customers.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-xs">
                    لا يوجد عملاء
                  </div>
                ) : (
                  customers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => selectCustomer(c)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent/50 transition-colors text-right"
                    >
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

        {/* Step: Channel Selection */}
        {dialogMode === "private" && step === "channel" && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="w-4 h-4" />
              <span dir="ltr">+{fullPhone}</span>
              {customerName && <Badge variant="outline" className="text-[10px]">{customerName}</Badge>}
              <button onClick={() => setStep("contact")} className="mr-auto text-xs text-primary hover:underline">تغيير</button>
            </div>

            <Label className="text-xs font-medium">اختر القناة للإرسال</Label>

            <div className="grid gap-2">
              {channels.map((ch) => {
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
                      <p className="text-sm font-medium truncate">
                        {ch.business_name || ch.display_phone || ch.evolution_instance_name || "قناة"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {ch.display_phone || ch.evolution_instance_name}
                      </p>
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

            {channels.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-xs">
                لا توجد قنوات متصلة. اربط واتساب أولاً
              </div>
            )}
          </div>
        )}

        {/* Step: Message */}
        {dialogMode === "private" && step === "message" && selectedChannel && (
          <div className="flex flex-col">
            {/* Summary bar */}
            <div className="p-3 border-b border-border/30 flex items-center gap-2 text-xs text-muted-foreground bg-muted/30">
              <User className="w-3.5 h-3.5" />
              <span>{customerName || `+${fullPhone}`}</span>
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
                <p className="text-[10px] text-muted-foreground">
                  القناة الرسمية تتطلب إرسال قالب معتمد كأول رسالة
                </p>

                {!selectedTemplate ? (
                  <ScrollArea className="h-[200px]">
                    <div className="grid gap-1.5">
                      {approvedTemplates.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground text-xs">
                          لا توجد قوالب معتمدة
                        </div>
                      ) : (
                        approvedTemplates.map((t) => (
                          <button
                            key={t.id || t.name}
                            onClick={() => handleSelectTemplate(t)}
                            className="w-full text-right p-3 rounded-xl border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all"
                          >
                            <p className="text-sm font-medium">{t.name}</p>
                            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                              {t.components?.find(c => c.type === "BODY")?.text || ""}
                            </p>
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
                      <p className="text-[11px] text-muted-foreground">
                        {selectedTemplate.components?.find(c => c.type === "BODY")?.text || ""}
                      </p>
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
                  القناة غير الرسمية تتيح إرسال رسائل حرة مباشرة
                </p>
                <Textarea
                  placeholder="اكتب رسالتك هنا..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  className="min-h-[100px] text-sm resize-none bg-background"
                />
              </div>
            )}

            {/* Send button */}
            <div className="p-4 pt-2 border-t border-border/30">
              <Button
                className="w-full h-11 gap-2"
                disabled={!canSend || sending}
                onClick={handleSend}
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {sending ? "جاري الإرسال..." : saveCustomer ? "حفظ وإرسال" : "إرسال"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default NewConversationDialog;
