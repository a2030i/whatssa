import { useState, useRef, useEffect } from "react";
import { Send, Phone, MoreVertical, ArrowRight, Smile, Paperclip, Zap, Check, CheckCheck, StickyNote, UserPlus, XCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Conversation, Message, quickReplies, agents } from "@/data/mockData";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const emojis = ["😊", "👍", "❤️", "🎉", "🙏", "👋", "✅", "⭐", "🔥", "💯", "😂", "🤝", "📦", "💳", "🚚", "⏰"];

interface ChatAreaProps {
  conversation: Conversation;
  messages: Message[];
  onBack: () => void;
  onSendMessage: (convId: string, text: string) => void;
  onStatusChange: (convId: string, status: "active" | "waiting" | "closed") => void;
  onTransfer: (convId: string, agent: string) => void;
}

const MessageStatus = ({ status }: { status?: string }) => {
  if (!status) return null;
  if (status === "sent") return <Check className="w-3 h-3 text-muted-foreground inline-block mr-1" />;
  if (status === "delivered") return <CheckCheck className="w-3 h-3 text-muted-foreground inline-block mr-1" />;
  if (status === "read") return <CheckCheck className="w-3 h-3 text-primary inline-block mr-1" />;
  return null;
};

const ChatArea = ({ conversation, messages, onBack, onSendMessage, onStatusChange, onTransfer }: ChatAreaProps) => {
  const [inputText, setInputText] = useState("");
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSendMessage(conversation.id, inputText.trim());
    setInputText("");
    // Simulate typing indicator
    setIsTyping(true);
    setTimeout(() => setIsTyping(false), 2000);
  };

  const handleQuickReply = (text: string) => {
    onSendMessage(conversation.id, text);
    setShowQuickReplies(false);
    setIsTyping(true);
    setTimeout(() => setIsTyping(false), 2000);
  };

  const handleEmoji = (emoji: string) => {
    setInputText((prev) => prev + emoji);
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="h-16 border-b border-border bg-card flex items-center justify-between px-4 md:px-5">
        <div className="flex items-center gap-3">
          <button className="md:hidden p-1" onClick={onBack}>
            <ArrowRight className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="relative">
            <div className="w-9 h-9 rounded-full gradient-whatsapp flex items-center justify-center text-sm font-bold text-whatsapp-foreground">
              {conversation.customerName.charAt(0)}
            </div>
            {conversation.lastSeen === "متصل الآن" && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-success border-2 border-card" />
            )}
          </div>
          <div>
            <p className="font-semibold text-sm">{conversation.customerName}</p>
            <p className="text-[10px] text-muted-foreground">{conversation.lastSeen || conversation.customerPhone}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
            <Phone className="w-4 h-4 text-muted-foreground" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => { onStatusChange(conversation.id, "active"); toast.success("تم تغيير الحالة إلى نشط"); }}>
                <CheckCircle2 className="w-4 h-4 ml-2 text-success" /> تعيين كنشط
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { onStatusChange(conversation.id, "waiting"); toast.success("تم تغيير الحالة إلى بانتظار"); }}>
                <StickyNote className="w-4 h-4 ml-2 text-warning" /> تعيين كبانتظار
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { onStatusChange(conversation.id, "closed"); toast.success("تم إغلاق المحادثة"); }}>
                <XCircle className="w-4 h-4 ml-2 text-destructive" /> إغلاق المحادثة
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {agents.map((agent) => (
                <DropdownMenuItem key={agent.id} onClick={() => { onTransfer(conversation.id, agent.name); toast.success(`تم تحويل المحادثة إلى ${agent.name}`); }}>
                  <UserPlus className="w-4 h-4 ml-2" /> تحويل إلى {agent.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-3 bg-secondary/30">
        {messages.map((msg) => (
          <div key={msg.id} className={cn(
            "flex",
            msg.sender === "agent" ? "justify-start" : msg.sender === "system" ? "justify-center" : "justify-end"
          )}>
            {msg.sender === "system" ? (
              <div className="bg-muted/50 text-muted-foreground text-[11px] px-3 py-1 rounded-full">
                {msg.text}
              </div>
            ) : (
              <div className={cn(
                "max-w-[85%] md:max-w-[70%] rounded-xl px-4 py-2.5 text-sm",
                msg.sender === "agent"
                  ? "bg-card shadow-card text-foreground rounded-bl-sm"
                  : "gradient-whatsapp text-whatsapp-foreground rounded-br-sm"
              )}>
                {msg.type === "note" && (
                  <div className="flex items-center gap-1 mb-1 text-warning">
                    <StickyNote className="w-3 h-3" />
                    <span className="text-[10px] font-semibold">ملاحظة داخلية</span>
                  </div>
                )}
                <p>{msg.text}</p>
                <div className={cn("flex items-center gap-0.5 mt-1", msg.sender === "agent" ? "text-muted-foreground" : "text-whatsapp-foreground/70")}>
                  <span className="text-[10px]">{msg.timestamp}</span>
                  {msg.sender === "agent" && <MessageStatus status={msg.status} />}
                </div>
              </div>
            )}
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-end">
            <div className="gradient-whatsapp text-whatsapp-foreground rounded-xl rounded-br-sm px-4 py-2.5 text-sm">
              <div className="flex gap-1 items-center">
                <span className="text-xs opacity-70">يكتب</span>
                <span className="flex gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-whatsapp-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-whatsapp-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-whatsapp-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies */}
      {showQuickReplies && (
        <div className="border-t border-border bg-card px-3 py-2 flex gap-2 overflow-x-auto">
          {quickReplies.map((qr) => (
            <button key={qr.id} onClick={() => handleQuickReply(qr.text)} className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium">
              {qr.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border bg-card p-3 md:p-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <button className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
                  <Smile className="w-4 h-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" side="top" align="start">
                <div className="grid grid-cols-8 gap-1">
                  {emojis.map((e) => (
                    <button key={e} onClick={() => handleEmoji(e)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-secondary transition-colors text-lg">
                      {e}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <button className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground" onClick={() => toast.info("سيتم دعم المرفقات قريباً")}>
              <Paperclip className="w-4 h-4" />
            </button>
            <button onClick={() => setShowQuickReplies(!showQuickReplies)} className={cn("p-2 rounded-lg transition-colors", showQuickReplies ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground")}>
              <Zap className="w-4 h-4" />
            </button>
          </div>
          <Input
            placeholder="اكتب رسالة..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            className="flex-1 bg-secondary border-0"
          />
          <button onClick={handleSend} disabled={!inputText.trim()} className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-opacity", inputText.trim() ? "gradient-whatsapp hover:opacity-90" : "bg-muted")}>
            <Send className="w-4 h-4 text-whatsapp-foreground" style={{ transform: "scaleX(-1)" }} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatArea;
