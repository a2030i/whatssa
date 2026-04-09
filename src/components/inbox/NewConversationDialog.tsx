import { useState, useEffect, useMemo, useRef } from "react";
import { Search, Phone, Send, MessageSquare, ShieldCheck, Wifi, User, Loader2, Plus, X, Globe, ChevronDown, Users, Image as ImageIcon, Mail, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, getPhoneSearchVariants, phoneNumbersMatch } from "@/lib/utils";
import { supabase, invokeCloud } from "@/lib/supabase";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { WhatsAppTemplate } from "@/types/whatsapp";

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
  defaultMode?: "whatsapp" | "email";
}

type DialogMode = "private" | "group" | "email";

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

const NewConversationDialog = ({ open, onOpenChange, templates, onConversationCreated, defaultMode }: NewConversationDialogProps) => {
  const { orgId, profile, userRole, isSuperAdmin, isSupervisor } = useAuth();
  const [dialogMode, setDialogMode] = useState<DialogMode>("private");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [countryCode, setCountryCode] = useState("966");
  const [localNumber, setLocalNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [navigating, setNavigating] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [isExistingCustomer, setIsExistingCustomer] = useState(false);
  const [saveCustomer, setSaveCustomer] = useState(false);
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
  const loadChannelsRef = useRef<(() => Promise<void>) | null>(null);

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
      setSelectedChannel(null);
      setCountryCode("966");
      setLocalNumber("");
      setCustomerName("");
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
      setNavigating(false);
    }
  }, [open]);

  // Auto-select default mode based on inbox context
  useEffect(() => {
    if (!open) return;
    if (defaultMode === "email" && emailConfigs.length > 0) {
      setDialogMode("email");
    } else if (defaultMode === "whatsapp" && channels.length > 0) {
      setDialogMode("private");
    } else if (channels.length > 0) {
      setDialogMode("private");
    } else if (emailConfigs.length > 0) {
      setDialogMode("email");
    } else {
      setDialogMode("private");
    }
  }, [open, channels.length, emailConfigs.length, defaultMode]);

  // Load channels (filtered by routing for non-admin members)
  useEffect(() => {
    if (!orgId || !open) return;
    const load = async () => {
      let connectedChannels: Channel[] = [];

      const { data: allChannels } = await supabase
        .from("whatsapp_config_safe")
        .select("id, display_phone, channel_type, evolution_instance_name, business_name, is_connected, created_at, channel_label, default_team_id, default_agent_id")
        .eq("org_id", orgId)
        .eq("is_connected", true)
        .order("created_at");
      connectedChannels = ((allChannels || []) as unknown as (Channel & { default_team_id?: string | null; default_agent_id?: string | null })[]);

      const isAdmin = isSuperAdmin || userRole === "admin";
      const isSup = isSupervisor || profile?.is_supervisor;
      if (!isAdmin && !isSup && profile?.id) {
        const myTeamIds: string[] = Array.isArray(profile.team_ids)
          ? profile.team_ids
          : profile.team_id ? [profile.team_id] : [];

        connectedChannels = connectedChannels.filter((ch: any) => {
          const hasRouting = ch.default_agent_id || ch.default_team_id;
          if (!hasRouting) return true;
          if (ch.default_agent_id === profile.id) return true;
          if (ch.default_team_id && myTeamIds.includes(ch.default_team_id)) return true;
          return false;
        });
      }

      setChannels(connectedChannels);
      setSelectedChannel((prev) => {
        if (!connectedChannels.length) return null;
        if (prev && connectedChannels.some((channel) => channel.id === prev.id)) return prev;
        return connectedChannels[0];
      });
    };
    loadChannelsRef.current = load;
    load();

    const handleRefreshChannels = () => {
      if (document.visibilityState === "visible") void load();
    };

    const channelsChannel = supabase
      .channel(`new-conversation-whatsapp-config-${orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_config", filter: `org_id=eq.${orgId}` }, () => void load())
      .subscribe();

    window.addEventListener("focus", handleRefreshChannels);
    document.addEventListener("visibilitychange", handleRefreshChannels);

    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 12000);

    return () => {
      loadChannelsRef.current = null;
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", handleRefreshChannels);
      document.removeEventListener("visibilitychange", handleRefreshChannels);
      supabase.removeChannel(channelsChannel);
    };
  }, [orgId, open, userRole, isSuperAdmin, isSupervisor, profile?.id, profile?.team_id, profile?.team_ids, profile?.is_supervisor]);

  // Load email configs
  useEffect(() => {
    if (!orgId || !open) return;
    const load = async () => {
      const { data: res } = await invokeCloud("email-config-manage", {
        body: { action: "list" },
      });
      setEmailConfigs(res?.data || []);
      if (res?.data?.length > 0) setSelectedEmailConfig(res.data[0].id);
    };
    load();
  }, [orgId, open]);

  // Search customers
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
          bcc: emailBccList.length > 0 ? emailBccList.join(", ") : undefined,
          subject: emailSubject,
          body: emailBody,
          config_id: selectedEmailConfig,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      toast.success("✅ تم إرسال الإيميل بنجاح");
      if (data?.conversation_id) onConversationCreated(data.conversation_id);
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

      if (groupImageFile && data?.group_jid) {
        try {
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
  };

  // ═══ NEW: Navigate directly to conversation ═══
  const handleStartConversation = async () => {
    if (!isValidNumber || !orgId) return;
    const channel = selectedChannel || channels[0];
    if (!channel) {
      toast.error("لا توجد قناة متصلة");
      return;
    }

    setNavigating(true);
    try {
      const cleanPhone = fullPhone;

      // Save customer if requested
      if (saveCustomer && !isExistingCustomer) {
        await supabase.from("customers").upsert(
          { org_id: orgId, phone: cleanPhone, name: customerName || null, source: "manual" },
          { onConflict: "org_id,phone" }
        );
      }

      // Find existing conversation for this phone + channel
      const phoneVariants = getPhoneSearchVariants(cleanPhone);
      const phoneFilters = Array.from(new Set(phoneVariants.flatMap((variant) => [
        `customer_phone.eq.${variant}`,
        `customer_phone.like.%${variant}%`,
      ])));

      const { data: existingConvs } = await supabase
        .from("conversations")
        .select("id, status, customer_phone")
        .eq("org_id", orgId)
        .eq("channel_id", channel.id)
        .or(phoneFilters.join(","))
        .order("updated_at", { ascending: false })
        .limit(10);

      const existingConv = (existingConvs || []).find((conv: any) => phoneNumbersMatch(conv.customer_phone, cleanPhone));

      let conversationId = existingConv?.id;

      if (!conversationId) {
        // Create a new conversation record
        const { data: newConv, error: createErr } = await supabase
          .from("conversations")
          .insert({
            org_id: orgId,
            customer_phone: cleanPhone,
            customer_name: customerName || cleanPhone,
            channel_id: channel.id,
            status: "active",
            conversation_type: "private",
            last_message_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (createErr || !newConv) throw new Error("فشل إنشاء المحادثة");
        conversationId = newConv.id;
      } else if (existingConv?.status === "closed") {
        // Reopen closed conversation
        await supabase
          .from("conversations")
          .update({ status: "active", updated_at: new Date().toISOString() })
          .eq("id", conversationId);
      }

      // Auto-assign to creator
      if (conversationId && profile?.id) {
        await supabase
          .from("conversations")
          .update({
            assigned_to: profile.full_name || "موظف",
            assigned_to_id: profile.id,
            assigned_at: new Date().toISOString(),
          })
          .eq("id", conversationId);
      }

      onConversationCreated(conversationId!);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setNavigating(false);
    }
  };

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

          {/* Mode toggle */}
          {(hasWhatsApp || hasEvolution || hasEmailConfigs) ? (
            <div className="flex items-center gap-1 mt-3 bg-muted rounded-lg p-1">
              {hasWhatsApp && defaultMode !== "email" && (
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
              {hasEvolution && defaultMode !== "email" && (
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
              {hasEmailConfigs && defaultMode !== "whatsapp" && (
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
        </DialogHeader>

        {/* ═══ GROUP MODE ═══ */}
        {dialogMode === "group" && (
          <div className="p-4 space-y-4">
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
                          onClick={() => { if (!isAdded) setGroupMembers(prev => [...prev, rawPhone]); }}
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

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">📩 إلى</Label>
                <div className="flex items-center gap-2">
                  {!showCcField && <button onClick={() => setShowCcField(true)} className="text-[10px] text-primary hover:underline">+ Cc</button>}
                  {!showBccField && <button onClick={() => setShowBccField(true)} className="text-[10px] text-primary hover:underline">+ Bcc</button>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1 min-h-[40px] rounded-lg border border-input bg-background px-2 py-1.5" dir="ltr">
                {emailToList.map((email, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 text-xs py-0.5 px-2 shrink-0">
                    {email}
                    <button onClick={() => setEmailToList(prev => prev.filter((_, j) => j !== i))} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                  </Badge>
                ))}
                <input
                  type="email"
                  placeholder={emailToList.length === 0 ? "example@email.com" : ""}
                  value={emailToInput}
                  onChange={(e) => setEmailToInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "," || e.key === " " || e.key === "Tab") { e.preventDefault(); addEmailTo(); }
                    if (e.key === "Backspace" && !emailToInput && emailToList.length > 0) setEmailToList(prev => prev.slice(0, -1));
                  }}
                  onBlur={() => addEmailTo()}
                  className="flex-1 min-w-[120px] text-base bg-transparent outline-none border-0 h-7"
                />
              </div>
            </div>

            {showCcField && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">📋 Cc</Label>
                <div className="flex flex-wrap items-center gap-1 min-h-[40px] rounded-lg border border-input bg-background px-2 py-1.5" dir="ltr">
                  {emailCcList.map((email, i) => (
                    <Badge key={i} variant="outline" className="gap-1 text-xs py-0.5 px-2 shrink-0">
                      {email}
                      <button onClick={() => setEmailCcList(prev => prev.filter((_, j) => j !== i))} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                  <input
                    type="email"
                    placeholder={emailCcList.length === 0 ? "cc@email.com" : ""}
                    value={emailCcInput}
                    onChange={(e) => setEmailCcInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "," || e.key === " " || e.key === "Tab") { e.preventDefault(); addEmailCc(); }
                      if (e.key === "Backspace" && !emailCcInput && emailCcList.length > 0) setEmailCcList(prev => prev.slice(0, -1));
                    }}
                    onBlur={() => addEmailCc()}
                    className="flex-1 min-w-[120px] text-base bg-transparent outline-none border-0 h-7"
                  />
                </div>
              </div>
            )}

            {showBccField && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">🔒 Bcc</Label>
                <div className="flex flex-wrap items-center gap-1 min-h-[40px] rounded-lg border border-input bg-background px-2 py-1.5" dir="ltr">
                  {emailBccList.map((email, i) => (
                    <Badge key={i} variant="outline" className="gap-1 text-xs py-0.5 px-2 shrink-0 border-dashed">
                      {email}
                      <button onClick={() => setEmailBccList(prev => prev.filter((_, j) => j !== i))} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                    </Badge>
                  ))}
                  <input
                    type="email"
                    placeholder={emailBccList.length === 0 ? "bcc@email.com" : ""}
                    value={emailBccInput}
                    onChange={(e) => setEmailBccInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "," || e.key === " " || e.key === "Tab") { e.preventDefault(); addEmailBcc(); }
                      if (e.key === "Backspace" && !emailBccInput && emailBccList.length > 0) setEmailBccList(prev => prev.slice(0, -1));
                    }}
                    onBlur={() => addEmailBcc()}
                    className="flex-1 min-w-[120px] text-base bg-transparent outline-none border-0 h-7"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">📝 الموضوع</Label>
              <Input placeholder="موضوع الإيميل..." value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="h-10 text-base bg-background" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">✉️ نص الرسالة</Label>
              <Textarea placeholder="اكتب نص الإيميل هنا..." value={emailBody} onChange={(e) => setEmailBody(e.target.value)} className="min-h-[120px] text-base resize-none bg-background" />
            </div>

            <Button className="w-full h-11 gap-2" disabled={emailToList.length === 0 || !emailSubject || !emailBody || sendingEmail} onClick={handleSendEmail}>
              {sendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sendingEmail ? "جاري الإرسال..." : "إرسال الإيميل"}
            </Button>
          </div>
        )}

        {/* ═══ PRIVATE MODE — Single screen: Phone + Channel ═══ */}
        {dialogMode === "private" && (
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
                <Input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="tel-national"
                  enterKeyHint="go"
                  placeholder={`${"0".repeat(selectedCountry.digits)}`}
                  value={localNumber}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, "");
                    setLocalNumber(val);
                    setIsExistingCustomer(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && isValidNumber) handleStartConversation();
                  }}
                  className="flex-1 text-base h-10 bg-background font-mono tracking-wider"
                  maxLength={selectedCountry.digits + 1}
                />
              </div>

              {/* Validation feedback */}
              <div className="flex items-center justify-between">
                <p className={cn(
                  "text-[10px] transition-colors",
                  localNumber.length > 0
                    ? isValidNumber ? "text-success" : "text-destructive"
                    : "text-muted-foreground"
                )}>
                  {localNumber.length > 0
                    ? isValidNumber
                      ? `✓ رقم صحيح: +${fullPhone}`
                      : `${cleanDigits.length}/${selectedCountry.digits} أرقام`
                    : `${selectedCountry.digits} أرقام بعد مفتاح الدولة`
                  }
                </p>

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

              {saveCustomer && !isExistingCustomer && (
                <Input
                  placeholder="اسم العميل (اختياري)"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="h-9 text-sm bg-background"
                />
              )}
            </div>

            {/* Channel selector - show inline if multiple channels */}
            {channels.length > 1 && (
              <div className="px-4 pb-2 space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  اختر القناة
                </Label>
                <div className="grid gap-1.5">
                  {channels.map((ch) => {
                    const isMetaCh = ch.channel_type === "meta_api";
                    const isSelected = selectedChannel?.id === ch.id;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => setSelectedChannel(ch)}
                        className={cn(
                          "flex items-center gap-3 p-2.5 rounded-xl border transition-all text-right",
                          isSelected
                            ? "border-primary/30 bg-primary/5"
                            : "border-border/40 bg-card/50 hover:border-border/80"
                        )}
                      >
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center",
                          isMetaCh ? "bg-success/10" : "bg-warning/10"
                        )}>
                          {isMetaCh ? <ShieldCheck className="w-4 h-4 text-success" /> : <Wifi className="w-4 h-4 text-warning" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">
                            {ch.channel_label || ch.business_name || ch.display_phone || ch.evolution_instance_name || "قناة"}
                          </p>
                          <p className="text-[10px] text-muted-foreground" dir="ltr">
                            {ch.display_phone || ch.evolution_instance_name}
                          </p>
                        </div>
                        <Badge variant="outline" className={cn(
                          "text-[9px] shrink-0",
                          isMetaCh ? "border-success/30 text-success" : "border-warning/30 text-warning"
                        )}>
                          {isMetaCh ? "رسمي" : "ويب"}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Single channel indicator */}
            {channels.length === 1 && (
              <div className="px-4 pb-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2.5">
                  {channels[0].channel_type === "meta_api" 
                    ? <ShieldCheck className="w-3.5 h-3.5 text-success" /> 
                    : <Wifi className="w-3.5 h-3.5 text-warning" />}
                  <span>{channels[0].channel_label || channels[0].business_name || channels[0].display_phone || channels[0].evolution_instance_name}</span>
                  <Badge variant="outline" className="text-[9px] mr-auto">
                    {channels[0].channel_type === "meta_api" ? "رسمي" : "ويب"}
                  </Badge>
                </div>
              </div>
            )}

            {/* Start conversation button */}
            <div className="px-4 pb-2">
              <Button
                className="w-full h-11 gap-2"
                disabled={!isValidNumber || channels.length === 0 || navigating}
                onClick={handleStartConversation}
              >
                {navigating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4" />
                )}
                {navigating ? "جاري الفتح..." : "ابدأ المحادثة"}
              </Button>
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
            <ScrollArea className="h-[180px]">
              <div className="px-2 pb-2">
                {loadingCustomers ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : customers.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-xs">لا يوجد عملاء</div>
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
      </DialogContent>
    </Dialog>
  );
};

export default NewConversationDialog;
