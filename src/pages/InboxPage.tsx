import { useState, useCallback, useEffect, useRef } from "react";
import { MessageSquare } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Conversation, Message } from "@/data/mockData";
import { supabase } from "@/integrations/supabase/client";
import ConversationList from "@/components/inbox/ConversationList";
import ChatArea from "@/components/inbox/ChatArea";
import CustomerInfoPanel from "@/components/inbox/CustomerInfoPanel";
import { toast } from "sonner";
import { buildTemplateComponents, mapMetaTemplate, type WhatsAppTemplate } from "@/types/whatsapp";

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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [allMessages, setAllMessages] = useState<Record<string, Message[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const selectedIdRef = useRef<string | null>(null);

  const isMobile = useIsMobile();

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const loadTemplates = async () => {
      // Check if there's a Meta API config before calling templates
      const { data: metaConfig } = await supabase
        .from("whatsapp_config")
        .select("id")
        .eq("channel_type", "meta_api")
        .eq("is_connected", true)
        .limit(1)
        .maybeSingle();

      if (!metaConfig) return; // No Meta API config, skip templates

      const { data, error } = await supabase.functions.invoke("whatsapp-templates", {
        body: { action: "list" },
      });

      if (!error && !data?.error) {
        setTemplates((data?.templates || []).map(mapMetaTemplate));
      }
    };

    loadTemplates();
  }, []);

  useEffect(() => {
    const fetchConversations = async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .order("last_message_at", { ascending: false });

      if (error) {
        console.error("Error fetching conversations:", error);
        setLoading(false);
        return;
      }

      const mapped: Conversation[] = (data || []).map((conversation) => ({
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
      }));

      setConversations(mapped);
      if (!isMobile && mapped.length > 0 && !selectedIdRef.current) {
        setSelectedId(mapped[0].id);
      }
      setLoading(false);
    };

    fetchConversations();

    const channel = supabase
      .channel("conversations-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        fetchConversations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
      .from("whatsapp_config")
      .select("id, channel_type")
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
    await supabase.from("conversations").update({ status }).eq("id", convId);
    setConversations((prev) => prev.map((conversation) => (conversation.id === convId ? { ...conversation, status } : conversation)));
    if (status === "closed") {
      await supabase.from("messages").insert({
        conversation_id: convId,
        content: "تم إغلاق المحادثة",
        sender: "system",
        message_type: "text",
      });
    }
  }, []);

  const handleTransfer = useCallback(async (convId: string, agent: string) => {
    await supabase.from("conversations").update({ assigned_to: agent }).eq("id", convId);
    setConversations((prev) => prev.map((conversation) => (conversation.id === convId ? { ...conversation, assignedTo: agent } : conversation)));
    await supabase.from("messages").insert({
      conversation_id: convId,
      content: `تم تحويل المحادثة إلى ${agent}`,
      sender: "system",
      message_type: "text",
    });
  }, []);

  const handleUpdateNotes = useCallback(async (convId: string, notes: string) => {
    await supabase.from("conversations").update({ notes }).eq("id", convId);
    setConversations((prev) => prev.map((conversation) => (conversation.id === convId ? { ...conversation, notes } : conversation)));
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

  return (
    <div className="flex h-[100dvh] overflow-hidden" dir="rtl">
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