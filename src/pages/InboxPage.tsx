import { useState, useMemo } from "react";
import { Search, Send, Phone, MoreVertical, Tag, Clock, ArrowRight, MessageSquare, Filter, X, User, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { conversations, messages } from "@/data/mockData";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statusColors = {
  active: "bg-success/10 text-success",
  waiting: "bg-warning/10 text-warning",
  closed: "bg-muted text-muted-foreground",
};
const statusLabels: Record<string, string> = { active: "نشط", waiting: "بانتظار", closed: "مغلق", all: "الكل" };

const allAgents = [...new Set(conversations.map((c) => c.assignedTo))];
const allTags = [...new Set(conversations.flatMap((c) => c.tags))];

const InboxPage = () => {
  const [selectedId, setSelectedId] = useState<string | null>(conversations[0].id);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const selected = conversations.find((c) => c.id === selectedId);

  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      if (searchQuery && !conv.customerName.includes(searchQuery) && !conv.lastMessage.includes(searchQuery) && !conv.customerPhone.includes(searchQuery)) return false;
      if (statusFilter !== "all" && conv.status !== statusFilter) return false;
      if (agentFilter !== "all" && conv.assignedTo !== agentFilter) return false;
      if (selectedTags.length > 0 && !selectedTags.some((t) => conv.tags.includes(t))) return false;
      return true;
    });
  }, [searchQuery, statusFilter, agentFilter, selectedTags]);

  const hasActiveFilters = statusFilter !== "all" || agentFilter !== "all" || selectedTags.length > 0;

  const clearFilters = () => {
    setStatusFilter("all");
    setAgentFilter("all");
    setSelectedTags([]);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  };

  return (
    <div className="flex h-screen" dir="rtl">
      {/* Conversation List */}
      <div className={cn(
        "border-l border-border flex flex-col bg-card",
        selected ? "hidden md:flex md:w-[320px] lg:w-[340px]" : "w-full md:w-[320px] lg:w-[340px]"
      )}>
        {/* Header */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">المحادثات</h1>
            <div className="flex items-center gap-1">
              {hasActiveFilters && (
                <button onClick={clearFilters} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" title="مسح الفلاتر">
                  <X className="w-4 h-4 text-destructive" />
                </button>
              )}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={cn("p-1.5 rounded-lg transition-colors", showFilters || hasActiveFilters ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground")}
              >
                <Filter className="w-4 h-4" />
                {hasActiveFilters && (
                  <span className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-primary" />
                )}
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم أو الرسالة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9 bg-secondary border-0 text-sm"
            />
          </div>

          {/* Filters */}
          {showFilters && (
            <div className="space-y-2.5 animate-fade-in">
              {/* Status filter */}
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 text-xs bg-secondary border-0">
                    <SelectValue placeholder="الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الحالات</SelectItem>
                    <SelectItem value="active">نشط</SelectItem>
                    <SelectItem value="waiting">بانتظار</SelectItem>
                    <SelectItem value="closed">مغلق</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Agent filter */}
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <Select value={agentFilter} onValueChange={setAgentFilter}>
                  <SelectTrigger className="h-8 text-xs bg-secondary border-0">
                    <SelectValue placeholder="الموظف" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الموظفين</SelectItem>
                    {allAgents.map((agent) => (
                      <SelectItem key={agent} value={agent}>{agent}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tags filter */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground font-medium">التصنيفات</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full transition-colors font-medium",
                        selectedTags.includes(tag)
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:bg-accent"
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Results count */}
        {hasActiveFilters && (
          <div className="px-4 py-2 bg-accent/50 text-xs text-accent-foreground">
            {filteredConversations.length} محادثة
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">لا توجد محادثات مطابقة</p>
            </div>
          ) : (
            filteredConversations.map((conv) => (
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
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      {selected ? (
        <div className="flex-1 flex flex-col">
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

      {/* Customer Info Panel */}
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

export default InboxPage;
