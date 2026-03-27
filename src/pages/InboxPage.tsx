import { useState } from "react";
import { Search, Send, Phone, MoreVertical, Tag, Clock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { conversations, messages } from "@/data/mockData";
import type { Conversation } from "@/data/mockData";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const statusColors = {
  active: "bg-success/10 text-success",
  waiting: "bg-warning/10 text-warning",
  closed: "bg-muted text-muted-foreground",
};
const statusLabels = { active: "نشط", waiting: "بانتظار", closed: "مغلق" };

const InboxPage = () => {
  const [selectedId, setSelectedId] = useState<string | null>(conversations[0].id);
  const selected = conversations.find((c) => c.id === selectedId);

  return (
    <div className="flex h-screen" dir="rtl">
      {/* Conversation List */}
      <div className={cn(
        "border-l border-border flex flex-col bg-card",
        selected ? "hidden md:flex md:w-[320px] lg:w-[340px]" : "w-full md:w-[320px] lg:w-[340px]"
      )}>
        <div className="p-4 border-b border-border">
          <h1 className="text-lg font-bold mb-3">المحادثات</h1>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="بحث..." className="pr-9 bg-secondary border-0 text-sm" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelectedId(conv.id)}
              className={cn(
                "w-full text-right p-4 border-b border-border transition-colors hover:bg-secondary/50",
                selectedId === conv.id && "bg-accent"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full gradient-whatsapp flex items-center justify-center text-sm font-bold text-whatsapp-foreground shrink-0">
                  {conv.customerName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">{conv.customerName}</span>
                    <span className="text-[10px] text-muted-foreground">{conv.timestamp}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{conv.lastMessage}</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border-0", statusColors[conv.status])}>
                      {statusLabels[conv.status]}
                    </Badge>
                    {conv.unread > 0 && (
                      <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                        {conv.unread}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      {selected ? (
        <div className={cn("flex-1 flex flex-col", !selected && "hidden md:flex")}>
          {/* Chat Header */}
          <div className="h-16 border-b border-border bg-card flex items-center justify-between px-4 md:px-5">
            <div className="flex items-center gap-3">
              <button className="md:hidden p-1" onClick={() => setSelectedId(null)}>
                <ArrowRight className="w-5 h-5 text-muted-foreground" />
              </button>
              <div className="w-9 h-9 rounded-full gradient-whatsapp flex items-center justify-center text-sm font-bold text-whatsapp-foreground">
                {selected.customerName.charAt(0)}
              </div>
              <div>
                <p className="font-semibold text-sm">{selected.customerName}</p>
                <p className="text-xs text-muted-foreground">{selected.customerPhone}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
                <Phone className="w-4 h-4 text-muted-foreground" />
              </button>
              <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-3 bg-secondary/30">
            {messages.map((msg) => (
              <div key={msg.id} className={cn("flex", msg.sender === "agent" ? "justify-start" : "justify-end")}>
                <div className={cn(
                  "max-w-[85%] md:max-w-[70%] rounded-xl px-4 py-2.5 text-sm",
                  msg.sender === "agent"
                    ? "bg-card shadow-card text-foreground rounded-bl-sm"
                    : "gradient-whatsapp text-whatsapp-foreground rounded-br-sm"
                )}>
                  <p>{msg.text}</p>
                  <p className={cn("text-[10px] mt-1", msg.sender === "agent" ? "text-muted-foreground" : "text-whatsapp-foreground/70")}>
                    {msg.timestamp}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="border-t border-border bg-card p-3 md:p-4">
            <div className="flex items-center gap-3">
              <Input placeholder="اكتب رسالة..." className="flex-1 bg-secondary border-0" />
              <button className="w-10 h-10 rounded-lg gradient-whatsapp flex items-center justify-center hover:opacity-90 transition-opacity shrink-0">
                <Send className="w-4 h-4 text-whatsapp-foreground" style={{ transform: "scaleX(-1)" }} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-secondary/20">
          <div className="text-center text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">اختر محادثة للبدء</p>
          </div>
        </div>
      )}

      {/* Customer Info Panel - desktop only */}
      {selected && (
        <div className="w-[260px] border-r border-border bg-card p-5 hidden xl:block">
          <div className="text-center mb-5">
            <div className="w-16 h-16 rounded-full gradient-whatsapp flex items-center justify-center text-xl font-bold text-whatsapp-foreground mx-auto mb-3">
              {selected.customerName.charAt(0)}
            </div>
            <h3 className="font-bold">{selected.customerName}</h3>
            <p className="text-sm text-muted-foreground" dir="ltr">{selected.customerPhone}</p>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <Tag className="w-3 h-3" /> التصنيفات
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selected.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> المسؤول
              </p>
              <p className="text-sm">{selected.assignedTo}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Need to import MessageSquare for the empty state
import { MessageSquare } from "lucide-react";

export default InboxPage;
