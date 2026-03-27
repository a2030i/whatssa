import { useState, useCallback } from "react";
import { MessageSquare } from "lucide-react";
import { conversations as initialConversations, messagesMap as initialMessages, Message } from "@/data/mockData";
import ConversationList from "@/components/inbox/ConversationList";
import ChatArea from "@/components/inbox/ChatArea";
import CustomerInfoPanel from "@/components/inbox/CustomerInfoPanel";

const InboxPage = () => {
  const [conversations, setConversations] = useState(initialConversations);
  const [allMessages, setAllMessages] = useState<Record<string, Message[]>>(initialMessages);
  const [selectedId, setSelectedId] = useState<string | null>(conversations[0].id);

  const selected = conversations.find((c) => c.id === selectedId) || null;
  const currentMessages = selectedId ? (allMessages[selectedId] || []) : [];

  const handleSendMessage = useCallback((convId: string, text: string) => {
    const newMsg: Message = {
      id: `${convId}-${Date.now()}`,
      conversationId: convId,
      text,
      sender: "agent",
      timestamp: new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
      status: "sent",
      type: "text",
    };
    setAllMessages((prev) => ({ ...prev, [convId]: [...(prev[convId] || []), newMsg] }));
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, lastMessage: text, timestamp: "الآن" } : c));

    // Simulate delivery & read
    setTimeout(() => {
      setAllMessages((prev) => ({
        ...prev,
        [convId]: (prev[convId] || []).map((m) => m.id === newMsg.id ? { ...m, status: "delivered" } : m),
      }));
    }, 1000);
    setTimeout(() => {
      setAllMessages((prev) => ({
        ...prev,
        [convId]: (prev[convId] || []).map((m) => m.id === newMsg.id ? { ...m, status: "read" } : m),
      }));
    }, 2500);
  }, []);

  const handleStatusChange = useCallback((convId: string, status: "active" | "waiting" | "closed") => {
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, status } : c));
    if (status === "closed") {
      const sysMsg: Message = {
        id: `${convId}-sys-${Date.now()}`,
        conversationId: convId,
        text: "تم إغلاق المحادثة",
        sender: "system",
        timestamp: new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
        type: "text",
      };
      setAllMessages((prev) => ({ ...prev, [convId]: [...(prev[convId] || []), sysMsg] }));
    }
  }, []);

  const handleTransfer = useCallback((convId: string, agent: string) => {
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, assignedTo: agent } : c));
    const sysMsg: Message = {
      id: `${convId}-sys-${Date.now()}`,
      conversationId: convId,
      text: `تم تحويل المحادثة إلى ${agent}`,
      sender: "system",
      timestamp: new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
      type: "text",
    };
    setAllMessages((prev) => ({ ...prev, [convId]: [...(prev[convId] || []), sysMsg] }));
  }, []);

  const handleUpdateNotes = useCallback((convId: string, notes: string) => {
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, notes } : c));
  }, []);

  return (
    <div className="flex h-screen" dir="rtl">
      <ConversationList
        conversations={conversations}
        selectedId={selectedId}
        onSelect={setSelectedId}
        hasSelection={!!selected}
      />

      {selected ? (
        <ChatArea
          conversation={selected}
          messages={currentMessages}
          onBack={() => setSelectedId(null)}
          onSendMessage={handleSendMessage}
          onStatusChange={handleStatusChange}
          onTransfer={handleTransfer}
        />
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-secondary/20">
          <div className="text-center text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">اختر محادثة للبدء</p>
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
