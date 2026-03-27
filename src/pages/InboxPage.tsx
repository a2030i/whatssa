import { useState, useCallback, useEffect } from "react";
import { MessageSquare } from "lucide-react";
import { Conversation, Message, MessageTemplate } from "@/data/mockData";
import { supabase } from "@/integrations/supabase/client";
import ConversationList from "@/components/inbox/ConversationList";
import ChatArea from "@/components/inbox/ChatArea";
import CustomerInfoPanel from "@/components/inbox/CustomerInfoPanel";
import { toast } from "sonner";

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
  const [loading, setLoading] = useState(true);

  const isMobile = window.innerWidth < 768;

  // Fetch conversations from DB
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

      const mapped: Conversation[] = (data || []).map((c) => ({
        id: c.id,
        customerName: c.customer_name || c.customer_phone,
        customerPhone: c.customer_phone,
        lastMessage: c.last_message || "",
        timestamp: formatTimestamp(c.last_message_at),
        unread: c.unread_count || 0,
        assignedTo: c.assigned_to || "غير معيّن",
        status: (c.status as "active" | "waiting" | "closed") || "active",
        tags: c.tags || [],
        notes: c.notes || "",
        lastCustomerMessageAt: c.last_message_at || undefined,
      }));

      setConversations(mapped);
      if (!isMobile && mapped.length > 0 && !selectedId) {
        setSelectedId(mapped[0].id);
      }
      setLoading(false);
    };

    fetchConversations();

    // Realtime subscription for conversations
    const channel = supabase
      .channel("conversations-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        fetchConversations();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Fetch messages for selected conversation
  useEffect(() => {
    if (!selectedId) return;
    if (allMessages[selectedId]) return; // already loaded

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

      const mapped: Message[] = (data || []).map((m) => ({
        id: m.id,
        conversationId: m.conversation_id,
        text: m.content,
        sender: m.sender as "customer" | "agent" | "system",
        timestamp: new Date(m.created_at || "").toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
        status: m.status as "sent" | "delivered" | "read" | undefined,
        type: (m.message_type as Message["type"]) || "text",
      }));

      setAllMessages((prev) => ({ ...prev, [selectedId]: mapped }));
    };

    fetchMessages();

    // Realtime for messages
    const channel = supabase
      .channel(`messages-${selectedId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedId}` }, (payload) => {
        const m = payload.new as any;
        const newMsg: Message = {
          id: m.id,
          conversationId: m.conversation_id,
          text: m.content,
          sender: m.sender,
          timestamp: new Date(m.created_at || "").toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
          status: m.status,
          type: m.message_type || "text",
        };
        setAllMessages((prev) => ({
          ...prev,
          [selectedId]: [...(prev[selectedId] || []), newMsg],
        }));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedId]);

  const selected = conversations.find((c) => c.id === selectedId) || null;
  const currentMessages = selectedId ? (allMessages[selectedId] || []) : [];

  const handleSendMessage = useCallback(async (convId: string, text: string, type: "text" | "note" = "text") => {
    // Insert message to DB
    const { error } = await supabase.from("messages").insert({
      conversation_id: convId,
      content: text,
      sender: "agent",
      message_type: type,
      status: "sent",
    });

    if (error) {
      toast.error("فشل إرسال الرسالة");
      console.error(error);
      return;
    }

    // Update conversation last message
    await supabase.from("conversations").update({
      last_message: text,
      last_message_at: new Date().toISOString(),
    }).eq("id", convId);

    // Also send via WhatsApp API if not a note
    if (type !== "note") {
      const conv = conversations.find(c => c.id === convId);
      if (conv) {
        supabase.functions.invoke("whatsapp-send", {
          body: { to: conv.customerPhone, message: text },
        }).catch(err => console.error("WhatsApp send error:", err));
      }
    }
  }, [conversations]);

  const handleStatusChange = useCallback(async (convId: string, status: "active" | "waiting" | "closed") => {
    await supabase.from("conversations").update({ status }).eq("id", convId);
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, status } : c));
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
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, assignedTo: agent } : c));
    await supabase.from("messages").insert({
      conversation_id: convId,
      content: `تم تحويل المحادثة إلى ${agent}`,
      sender: "system",
      message_type: "text",
    });
  }, []);

  const handleUpdateNotes = useCallback(async (convId: string, notes: string) => {
    await supabase.from("conversations").update({ notes }).eq("id", convId);
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, notes } : c));
  }, []);

  const handleSendTemplate = useCallback(async (convId: string, template: MessageTemplate, variables: string[]) => {
    let text = template.body;
    variables.forEach((v, i) => { text = text.replace(`{{${i + 1}}}`, v); });
    let header = template.header || "";
    variables.forEach((v, i) => { header = header.replace(`{{${i + 1}}}`, v); });
    const fullText = header ? `${header}\n\n${text}${template.footer ? `\n\n${template.footer}` : ""}` : `${text}${template.footer ? `\n\n${template.footer}` : ""}`;

    await supabase.from("messages").insert({
      conversation_id: convId,
      content: fullText,
      sender: "agent",
      message_type: "template",
      status: "sent",
    });

    await supabase.from("conversations").update({
      last_message: `[قالب] ${template.name}`,
      last_message_at: new Date().toISOString(),
    }).eq("id", convId);
  }, []);

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
    <div className="flex h-screen" dir="rtl">
      <ConversationList
        conversations={conversations}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          // Reset unread
          supabase.from("conversations").update({ unread_count: 0 }).eq("id", id).then();
        }}
        hasSelection={!!selected}
      />

      {selected ? (
        <ChatArea
          conversation={selected}
          messages={currentMessages}
          onBack={() => setSelectedId(null)}
          onSendMessage={handleSendMessage}
          onSendTemplate={handleSendTemplate}
          onStatusChange={handleStatusChange}
          onTransfer={handleTransfer}
        />
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-secondary/20">
          <div className="text-center text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {conversations.length === 0
                ? "لا توجد محادثات بعد — اربط واتساب وابدأ باستقبال الرسائل"
                : "اختر محادثة للبدء"}
            </p>
          </div>
        </div>
      )}

      {selected && (
        <CustomerInfoPanel
          conversation={selected}
          onUpdateNotes={handleUpdateNotes}
        />
      )}
    </div>
  );
};

export default InboxPage;
