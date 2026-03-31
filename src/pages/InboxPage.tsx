import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { MessageSquare } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Conversation, Message } from "@/data/mockData";
import { supabase } from "@/integrations/supabase/client";
import ConversationList from "@/components/inbox/ConversationList";
import ChatArea from "@/components/inbox/ChatArea";
import CustomerInfoPanel from "@/components/inbox/CustomerInfoPanel";
import NewConversationDialog from "@/components/inbox/NewConversationDialog";
import { toast } from "sonner";
import { buildTemplateComponents, mapMetaTemplate, type WhatsAppTemplate } from "@/types/whatsapp";

const TYPING_TIMEOUT = 3000;

const formatTimestamp = (isoStr: string | null): string => {
  if (!isoStr) return "";
  const date = new Date(isoStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "الآن";
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  return date.toLocaleDateString("ar-SA");
};

const InboxPage = () => {
  const { orgId, profile } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [allMessages, setAllMessages] = useState<Record<string, Message[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newConvOpen, setNewConvOpen] = useState(false);
  const selectedIdRef = useRef<string | null>(null);

  const isMobile = useIsMobile();

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (!orgId) {
      setTemplates([]);
      return;
    }

    const loadTemplates = async () => {
      const { data: metaConfig } = await supabase
        .from("whatsapp_config_safe")
        .select("id")
        .eq("org_id", orgId)
        .eq("channel_type", "meta_api")
        .eq("is_connected", true)
        .limit(1)
        .maybeSingle();

      if (!metaConfig) {
        setTemplates([]);
        return;
      }

      const { data, error } = await supabase.functions.invoke("whatsapp-templates", {
        body: { action: "list" },
      });

      if (!error && !data?.error) {
        setTemplates((data?.templates || []).map(mapMetaTemplate));
      }
    };

    loadTemplates();
  }, [orgId]);

  useEffect(() => {
    if (!orgId) {
      setConversations([]);
      setAllMessages({});
      setSelectedId(null);
      setLoading(false);
      return;
    }

    let active = true;
    const currentOrgId = orgId;

    setLoading(true);
    setConversations([]);
    setAllMessages({});
    setSelectedId(null);

    const fetchConversations = async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("org_id", currentOrgId)
        .order("last_message_at", { ascending: false });

      if (!active) return;

      if (error) {
        console.error("Error fetching conversations:", error);
        setLoading(false);
        return;
      }

      // Load channel configs for channel name mapping
      const { data: channelConfigs } = await supabase
        .from("whatsapp_config_safe")
        .select("id, display_phone, business_name, channel_type, evolution_instance_name")
        .eq("org_id", currentOrgId)
        .eq("is_connected", true);

      const channelMap = new Map((channelConfigs || []).map((c: any) => [c.id, c]));

      const mapped: Conversation[] = (data || []).map((conversation: any) => {
        const channelConfig = conversation.channel_id ? channelMap.get(conversation.channel_id) : null;
        const channelType = channelConfig?.channel_type === "evolution" ? "evolution" : 
          channelConfig?.channel_type === "meta_api" ? "meta_api" : undefined;

        return {
          id: conversation.id,
          customerName: conversation.customer_name || conversation.customer_phone,
          customerPhone: conversation.customer_phone,
          lastMessage: conversation.last_message || "",
          timestamp: formatTimestamp(conversation.last_message_at),
          unread: conversation.unread_count || 0,
          assignedTo: conversation.assigned_to || "غير معيّن",
          status: (conversation.status as "active" | "waiting" | "closed") || "active",
          tags: conversation.tags || [],
          notes: conversation.notes || "",
          lastCustomerMessageAt: conversation.last_message_at || undefined,
          conversationType: (conversation.conversation_type as "private" | "group" | "broadcast") || "private",
          channelType,
          channelId: conversation.channel_id || undefined,
          channelName: channelConfig ? (channelConfig.display_phone || channelConfig.business_name || channelConfig.evolution_instance_name || "") : undefined,
        };
      });

      setConversations(mapped);
      if (!isMobile && mapped.length > 0) {
        setSelectedId((prev) => (prev && mapped.some((item) => item.id === prev) ? prev : mapped[0].id));
      }
      setLoading(false);
    };

    fetchConversations();

    const channel = supabase
      .channel(`conversations-changes-${currentOrgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `org_id=eq.${currentOrgId}` }, () => {
        fetchConversations();
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [orgId, isMobile]);

  useEffect(() => {
    if (!selectedId) return;

    // Fetch messages if not already loaded
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching messages:", error);
        return;
      }

      const mapped: Message[] = (data || []).map((message) => ({
        id: message.id,
        conversationId: message.conversation_id,
        text: message.content,
        sender: message.sender as "customer" | "agent" | "system",
        timestamp: new Date(message.created_at || "").toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
        status: message.status as "sent" | "delivered" | "read" | undefined,
        type: (message.message_type as Message["type"]) || "text",
        mediaUrl: message.media_url || undefined,
        senderName: (message.metadata as any)?.sender_name || undefined,
        quoted: (message.metadata as any)?.quoted || undefined,
        waMessageId: message.wa_message_id || undefined,
      }));

      setAllMessages((prev) => ({ ...prev, [selectedId]: mapped }));
    };

    fetchMessages();

    const channel = supabase
      .channel(`messages-${selectedId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedId}` }, (payload) => {
        const message = payload.new as any;
        const newMessage: Message = {
          id: message.id,
          conversationId: message.conversation_id,
          text: message.content,
          sender: message.sender,
          timestamp: new Date(message.created_at || "").toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
          status: message.status,
          type: message.message_type || "text",
          mediaUrl: message.media_url || undefined,
          senderName: message.metadata?.sender_name || undefined,
          quoted: message.metadata?.quoted || undefined,
          waMessageId: message.wa_message_id || undefined,
        };
        setAllMessages((prev) => ({
          ...prev,
          [selectedId]: [...(prev[selectedId] || []), newMessage],
        }));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedId}` }, (payload) => {
        const updated = payload.new as any;
        setAllMessages((prev) => ({
          ...prev,
          [selectedId]: (prev[selectedId] || []).map((m) =>
            m.id === updated.id
              ? { ...m, status: updated.status as any }
              : m.waMessageId && m.waMessageId === updated.wa_message_id
                ? { ...m, status: updated.status as any }
                : m
          ),
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedId]);

  const selected = conversations.find((conversation) => conversation.id === selectedId) || null;
  const currentMessages = selectedId ? allMessages[selectedId] || [] : [];

  const handleSendMessage = useCallback(async (convId: string, text: string, type: "text" | "note" = "text", replyTo?: { id: string; waMessageId?: string; senderName?: string; text: string }) => {
    if (type === "note") {
      const { error } = await supabase.from("messages").insert({
        conversation_id: convId,
        content: text,
        sender: "agent",
        message_type: "note",
        status: "sent",
        metadata: replyTo ? { quoted: { message_id: replyTo.id, sender_name: replyTo.senderName || "أنت", text: replyTo.text } } : {},
      });

      if (error) {
        toast.error("فشل حفظ الملاحظة");
        return;
      }

      return;
    }

    const conversation = conversations.find((item) => item.id === convId);
    if (!conversation) {
      toast.error("تعذر تحديد المحادثة");
      return;
    }

    // Determine channel: check if org has an evolution config that's connected
    // Try evolution-send first if evolution config exists, fall back to whatsapp-send
    const { data: evoConfig } = await supabase
      .from("whatsapp_config_safe")
      .select("id, channel_type")
      .eq("org_id", orgId)
      .eq("channel_type", "evolution")
      .eq("is_connected", true)
      .limit(1)
      .maybeSingle();

    const sendFunction = evoConfig ? "evolution-send" : "whatsapp-send";

    const { data, error } = await supabase.functions.invoke(sendFunction, {
      body: {
        to: conversation.customerPhone,
        message: text,
        conversation_id: convId,
        reply_to: replyTo ? { wa_message_id: replyTo.waMessageId, sender_name: replyTo.senderName, text: replyTo.text, message_id: replyTo.id } : undefined,
      },
    });

    if (error || data?.error) {
      // If evolution failed, try meta as fallback
      if (evoConfig) {
        const { data: fallbackData, error: fallbackError } = await supabase.functions.invoke("whatsapp-send", {
          body: { to: conversation.customerPhone, message: text, conversation_id: convId },
        });
        if (!fallbackError && !fallbackData?.error) return;
      }
      toast.error(data?.error || "فشل إرسال الرسالة");
    }
  }, [conversations]);

  const handleStatusChange = useCallback(async (convId: string, status: "active" | "waiting" | "closed") => {
    const conv = conversations.find(c => c.id === convId);
    const prevStatus = conv?.status;
    const updateData: Record<string, unknown> = { 
      status, 
      updated_at: new Date().toISOString(),
      ...(status === "closed" ? { closed_at: new Date().toISOString() } : { closed_at: null }),
    };
    
    const { error: updateError } = await supabase
      .from("conversations")
      .update(updateData)
      .eq("id", convId);
    
    if (updateError) {
      console.error("Status update failed:", updateError);
      toast.error("فشل تغيير الحالة: " + (updateError.message || "خطأ غير معروف"));
      return;
    }
    
    setConversations((prev) => prev.map((conversation) => (conversation.id === convId ? { ...conversation, status } : conversation)));

    // Log status change as system message
    const statusLabels: Record<string, string> = { active: "نشط", waiting: "بانتظار", closed: "مغلق" };
    const agentName = profile?.full_name || "النظام";
    if (status === "closed") {
      await supabase.from("messages").insert({
        conversation_id: convId,
        content: `تم إغلاق المحادثة بواسطة ${agentName}`,
        sender: "system",
        message_type: "text",
      });
    } else {
      await supabase.from("messages").insert({
        conversation_id: convId,
        content: `تم تغيير الحالة إلى "${statusLabels[status]}" بواسطة ${agentName}`,
        sender: "system",
        message_type: "text",
      });
    }

    if (status === "closed") {
      // Send satisfaction survey if enabled (check channel-level first, then org)
      try {
        if (conv && orgId) {
          let satEnabled = false;
          let satMessage = "";

          // Check channel-level settings first
          if (conv.channelId) {
            const { data: chData } = await supabase.from("whatsapp_config" as any).select("settings").eq("id", conv.channelId).single();
            const chSettings = ((chData as any)?.settings as Record<string, any>) || {};
            if (chSettings.sat?.enabled && chSettings.sat?.message) {
              satEnabled = true;
              satMessage = chSettings.sat.message;
            }
          }

          // Fallback to org-level
          if (!satEnabled) {
            const { data: org } = await supabase.from("organizations").select("settings").eq("id", orgId).single();
            const settings = (org?.settings as Record<string, any>) || {};
            if (settings.satisfaction_enabled && settings.satisfaction_message) {
              satEnabled = true;
              satMessage = settings.satisfaction_message;
            }
          }

          if (satEnabled && satMessage) {
            await supabase.functions.invoke("whatsapp-send", {
              body: {
                phone: conv.customerPhone,
                message: satMessage,
                org_id: orgId,
              },
            });
            await supabase.from("conversations").update({ satisfaction_status: "pending" }).eq("id", convId);
          }
        }
      } catch (e) {
        console.error("Failed to send satisfaction survey:", e);
      }
    }
  }, [conversations, orgId, profile]);

  const handleTransfer = useCallback(async (convId: string, agent: string) => {
    const conv = conversations.find(c => c.id === convId);
    const previousAgent = conv?.assignedTo;
    const agentName = profile?.full_name || "النظام";
    
    await supabase.from("conversations").update({ assigned_to: agent }).eq("id", convId);
    setConversations((prev) => prev.map((conversation) => (conversation.id === convId ? { ...conversation, assignedTo: agent } : conversation)));
    
    // Log transfer with details
    const content = previousAgent && previousAgent !== "غير معيّن"
      ? `تم تحويل المحادثة من ${previousAgent} إلى ${agent} بواسطة ${agentName}`
      : `تم إسناد المحادثة إلى ${agent} بواسطة ${agentName}`;
    
    await supabase.from("messages").insert({
      conversation_id: convId,
      content,
      sender: "system",
      message_type: "text",
    });
  }, [conversations, profile]);

  const handleUpdateNotes = useCallback(async (convId: string, notes: string) => {
    await supabase.from("conversations").update({ notes }).eq("id", convId);
    setConversations((prev) => prev.map((conversation) => (conversation.id === convId ? { ...conversation, notes } : conversation)));
  }, []);

  const handleTagsChange = useCallback(async (convId: string, tags: string[]) => {
    await supabase.from("conversations").update({ tags }).eq("id", convId);
    setConversations((prev) => prev.map((conversation) => (conversation.id === convId ? { ...conversation, tags } : conversation)));
  }, []);

  const handleSendTemplate = useCallback(async (convId: string, template: WhatsAppTemplate, variables: string[]) => {
    const conversation = conversations.find((item) => item.id === convId);
    if (!conversation) {
      toast.error("تعذر تحديد المحادثة");
      return;
    }

    const { data, error } = await supabase.functions.invoke("whatsapp-send", {
      body: {
        to: conversation.customerPhone,
        type: "template",
        template_name: template.name,
        template_language: template.language,
        template_components: buildTemplateComponents(template, variables),
        conversation_id: convId,
      },
    });

    if (error || data?.error) {
      toast.error(data?.error || "فشل إرسال القالب");
      return;
    }

    toast.success("تم إرسال القالب الحقيقي");
  }, [conversations]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" dir="rtl">
        <div className="text-center text-muted-foreground">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30 animate-pulse" />
          <p className="text-sm">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  // On mobile with a selected chat, go full-screen over the layout
  if (isMobile && selected) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background" dir="rtl">
        <ChatArea
          conversation={selected}
          messages={currentMessages}
          templates={templates}
          onBack={() => setSelectedId(null)}
          onSendMessage={handleSendMessage}
          onSendTemplate={handleSendTemplate}
          onStatusChange={handleStatusChange}
          onTransfer={handleTransfer}
          onTagsChange={handleTagsChange}
        />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-3rem)] overflow-hidden" dir="rtl">
      {/* On mobile: show list when no selection, show chat when selected */}
      {(!isMobile || !selected) && (
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            supabase.from("conversations").update({ unread_count: 0 }).eq("id", id).then();
          }}
          hasSelection={!!selected}
        />
      )}

      {selected ? (
        <ChatArea
          conversation={selected}
          messages={currentMessages}
          templates={templates}
          onBack={() => setSelectedId(null)}
          onSendMessage={handleSendMessage}
          onSendTemplate={handleSendTemplate}
          onStatusChange={handleStatusChange}
          onTransfer={handleTransfer}
          onTagsChange={handleTagsChange}
        />
      ) : (
        !isMobile && (
          <div className="flex flex-1 items-center justify-center bg-secondary/20">
            <div className="text-center text-muted-foreground">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {conversations.length === 0 ? "لا توجد محادثات بعد — اربط واتساب وابدأ باستقبال الرسائل" : "اختر محادثة للبدء"}
              </p>
            </div>
          </div>
        )
      )}

      {selected && !isMobile && <CustomerInfoPanel conversation={selected} onUpdateNotes={handleUpdateNotes} />}
    </div>
  );
};

export default InboxPage;