import { useState, useMemo, useEffect } from "react";
import { Search, Filter, X, User, CheckCircle, Tag, MessageSquare, Pin, UserX, Eye, AtSign, Clock, XCircle, Bot, ChevronDown, ChevronUp, Users, Radio, ShieldCheck, Wifi, Inbox, Plus, RotateCcw, Pencil, Trash2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Conversation } from "@/data/mockData";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import CustomInboxBuilder, { type CustomInbox } from "./CustomInboxBuilder";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  active: "bg-emerald-500",
  waiting: "bg-amber-400",
  closed: "bg-muted-foreground/40",
};
const statusLabels: Record<string, string> = { active: "نشط", waiting: "بانتظار", closed: "مغلق" };

const get24hCountdown = (lastCustomerMessageAt?: string): { text: string; color: string } | null => {
  if (!lastCustomerMessageAt) return null;
  const elapsed = Date.now() - new Date(lastCustomerMessageAt).getTime();
  const windowMs = 24 * 3600000;
  const remaining = windowMs - elapsed;
  if (remaining <= 0) return { text: "انتهت", color: "text-destructive" };
  const remHours = Math.floor(remaining / 3600000);
  const remMinutes = Math.floor((remaining % 3600000) / 60000);
  const text = remHours > 0 ? `${remHours}:${String(remMinutes).padStart(2, "0")}` : `${remMinutes}د`;
  const color = remHours < 2 ? "text-destructive" : remHours < 6 ? "text-amber-500" : "text-muted-foreground";
  return { text, color };
};

interface QuickFilter {
  id: string;
  label: string;
  icon: any;
  count?: number;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  hasSelection: boolean;
  onNewConversation?: () => void;
}

const ConversationList = ({ conversations, selectedId, onSelect, hasSelection, onNewConversation }: ConversationListProps) => {
  const { orgId } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeQuickFilter, setActiveQuickFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [customInboxes, setCustomInboxes] = useState<CustomInbox[]>([]);
  const [activeCustomInbox, setActiveCustomInbox] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingInbox, setEditingInbox] = useState<CustomInbox | null>(null);
  const isMobile = useIsMobile();

  const loadCustomInboxes = async () => {
    if (!orgId) return;
    const { data } = await supabase
      .from("custom_inboxes")
      .select("*")
      .eq("org_id", orgId)
      .order("sort_order");
    if (data) {
      setCustomInboxes(data.map((d: any) => ({
        id: d.id,
        name: d.name,
        filters: d.filters || [],
        is_shared: d.is_shared,
      })));
    }
  };

  useEffect(() => {
    loadCustomInboxes();
  }, [orgId]);

  const applyCustomFilters = (conv: Conversation, inbox: CustomInbox): boolean => {
    if (!inbox.filters || inbox.filters.length === 0) return true;
    return inbox.filters.some((group) => {
      return group.conditions.every((cond) => {
        const val = cond.value;
        switch (cond.field) {
          case "status":
            if (cond.operator === "eq") return conv.status === val;
            if (cond.operator === "neq") return conv.status !== val;
            break;
          case "assigned_to":
            if (cond.operator === "eq") return conv.assignedTo === val;
            if (cond.operator === "neq") return conv.assignedTo !== val;
            if (cond.operator === "is_null") return !conv.assignedTo || conv.assignedTo === "غير معيّن";
            if (cond.operator === "is_not_null") return conv.assignedTo && conv.assignedTo !== "غير معيّن";
            break;
          case "tags":
            if (cond.operator === "contains") return conv.tags.includes(val);
            if (cond.operator === "not_contains") return !conv.tags.includes(val);
            break;
          case "conversation_type":
            if (cond.operator === "eq") return (conv.conversationType || "private") === val;
            if (cond.operator === "neq") return (conv.conversationType || "private") !== val;
            break;
          case "unread_count":
            if (cond.operator === "gt") return conv.unread > Number(val);
            if (cond.operator === "eq") return conv.unread === Number(val);
            if (cond.operator === "lt") return conv.unread < Number(val);
            break;
          case "customer_name":
            if (cond.operator === "contains") return conv.customerName.includes(val);
            if (cond.operator === "eq") return conv.customerName === val;
            break;
        }
        return true;
      });
    });
  };

  const deleteCustomInbox = async (id: string) => {
    await supabase.from("custom_inboxes").delete().eq("id", id);
    if (activeCustomInbox === id) setActiveCustomInbox(null);
    loadCustomInboxes();
    toast.success("تم حذف الصندوق");
  };

  const allAgents = useMemo(() => [...new Set(conversations.map((c) => c.assignedTo))], [conversations]);
  const allTags = useMemo(() => [...new Set(conversations.flatMap((c) => c.tags))], [conversations]);

  const counts = useMemo(() => ({
    all: conversations.filter(c => c.status !== "closed").length,
    active: conversations.filter(c => c.status === "active").length,
    unassigned: conversations.filter(c => c.status !== "closed" && (!c.assignedTo || c.assignedTo === "غير معيّن")).length,
    unread: conversations.filter(c => c.status !== "closed" && c.unread > 0).length,
    waiting: conversations.filter(c => c.status === "waiting").length,
    closed: conversations.filter(c => c.status === "closed").length,
    private: conversations.filter(c => c.status !== "closed" && (!c.conversationType || c.conversationType === "private")).length,
    group: conversations.filter(c => c.status !== "closed" && c.conversationType === "group").length,
    broadcast: conversations.filter(c => c.status !== "closed" && c.conversationType === "broadcast").length,
  }), [conversations]);

  const quickFilters: QuickFilter[] = [
    { id: "all", label: "الكل", icon: MessageSquare, count: counts.all },
    { id: "unread", label: "غير مقروءة", icon: Eye, count: counts.unread },
    { id: "unassigned", label: "غير معينة", icon: UserX, count: counts.unassigned },
    { id: "waiting", label: "بانتظار", icon: Clock, count: counts.waiting },
    { id: "closed", label: "مغلقة", icon: XCircle, count: counts.closed },
  ];

  const activeInbox = customInboxes.find((i) => i.id === activeCustomInbox);

  const filtered = useMemo(() => {
    return conversations.filter((conv) => {
      if (searchQuery && !conv.customerName.includes(searchQuery) && !conv.lastMessage.includes(searchQuery) && !conv.customerPhone.includes(searchQuery)) return false;
      if (activeInbox) return applyCustomFilters(conv, activeInbox);
      if (activeQuickFilter !== "closed" && conv.status === "closed") return false;
      switch (activeQuickFilter) {
        case "active": if (conv.status !== "active") return false; break;
        case "unassigned": if (conv.assignedTo && conv.assignedTo !== "غير معيّن") return false; break;
        case "unread": if (conv.unread <= 0) return false; break;
        case "waiting": if (conv.status !== "waiting") return false; break;
        case "closed": if (conv.status !== "closed") return false; break;
      }
      if (agentFilter !== "all" && conv.assignedTo !== agentFilter) return false;
      if (channelFilter !== "all") {
        if (channelFilter === "meta_api" && conv.channelType !== "meta_api") return false;
        if (channelFilter === "evolution" && conv.channelType !== "evolution") return false;
      }
      if (selectedTags.length > 0 && !selectedTags.some((t) => conv.tags.includes(t))) return false;
      return true;
    });
  }, [conversations, searchQuery, activeQuickFilter, agentFilter, channelFilter, selectedTags, activeInbox]);

  const hasActiveFilters = agentFilter !== "all" || channelFilter !== "all" || selectedTags.length > 0 || !!activeCustomInbox;
  const clearFilters = () => { setAgentFilter("all"); setChannelFilter("all"); setSelectedTags([]); setActiveCustomInbox(null); setActiveQuickFilter("all"); };
  const toggleTag = (tag: string) => setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);

  return (
    <div className={cn(
      "border-l border-border/50 flex flex-col bg-card/50 backdrop-blur-sm",
      hasSelection ? "hidden md:flex md:w-[340px] lg:w-[360px]" : "w-full md:w-[340px] lg:w-[360px]"
    )}>
      {/* Header */}
      <div className="p-3 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold bg-gradient-to-l from-foreground to-foreground/70 bg-clip-text">
            {activeInbox ? activeInbox.name : "المحادثات"}
          </h1>
          <div className="flex items-center gap-1">
            {onNewConversation && (
              <button
                onClick={onNewConversation}
                className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all"
                title="محادثة جديدة"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => { setEditingInbox(null); setBuilderOpen(true); }}
              className="p-2 rounded-xl hover:bg-secondary/80 text-muted-foreground transition-all hover:text-foreground"
              title="صندوق مخصص"
            >
              <Plus className="w-4 h-4" />
            </button>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="p-2 rounded-xl hover:bg-destructive/10 transition-all" title="إعادة ضبط">
                <RotateCcw className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={cn("p-2 rounded-xl transition-all relative", showAdvancedFilters || hasActiveFilters ? "bg-primary/10 text-primary" : "hover:bg-secondary/80 text-muted-foreground")}
            >
              <Filter className="w-4 h-4" />
              {hasActiveFilters && <span className="absolute -top-0.5 -left-0.5 w-2 h-2 rounded-full bg-primary animate-pulse" />}
            </button>
          </div>
        </div>

        {/* Custom Inbox Chips */}
        {customInboxes.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            {customInboxes.map((inbox) => (
              <div key={inbox.id} className="flex items-center gap-0.5 group">
                <button
                  onClick={() => {
                    if (activeCustomInbox === inbox.id) setActiveCustomInbox(null);
                    else { setActiveCustomInbox(inbox.id); setActiveQuickFilter("all"); }
                  }}
                  className={cn(
                    "text-[11px] px-3 py-1.5 rounded-full whitespace-nowrap font-medium transition-all flex items-center gap-1.5",
                    activeCustomInbox === inbox.id
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-secondary/70 text-muted-foreground hover:bg-accent"
                  )}
                >
                  <Inbox className="w-3 h-3" />
                  {inbox.name}
                </button>
                <button
                  onClick={() => { setEditingInbox(inbox); setBuilderOpen(true); }}
                  className="hidden group-hover:flex p-0.5 rounded text-muted-foreground hover:text-primary"
                >
                  <Pencil className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <Input
            placeholder="بحث بالاسم أو الرقم..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9 bg-secondary/50 border-0 text-sm h-10 rounded-xl focus:bg-secondary transition-colors"
          />
        </div>
      </div>

      {/* Quick Filters - Always horizontal chips */}
      <div className="shrink-0 border-b border-border/30 px-3 pb-2.5 overflow-x-auto scrollbar-none">
        <div className="flex gap-1.5 w-max">
          {quickFilters.map((qf) => (
            <button
              key={qf.id}
              onClick={() => { setActiveQuickFilter(qf.id); setActiveCustomInbox(null); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all",
                activeQuickFilter === qf.id && !activeCustomInbox
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <qf.icon className="w-3.5 h-3.5" />
              <span>{qf.label}</span>
              {(qf.count ?? 0) > 0 && (
                <span className={cn(
                  "text-[10px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center font-bold",
                  activeQuickFilter === qf.id && !activeCustomInbox
                    ? "bg-primary-foreground/20"
                    : "bg-muted"
                )}>
                  {qf.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Filters */}
      {showAdvancedFilters && (
        <div className="px-3 py-2.5 border-b border-border/30 space-y-2 animate-fade-in bg-secondary/20 shrink-0">
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="h-8 text-xs bg-card border-0 rounded-lg"><SelectValue placeholder="الموظف" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الموظفين</SelectItem>
                {allAgents.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="h-8 text-xs bg-card border-0 rounded-lg"><SelectValue placeholder="القناة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل القنوات</SelectItem>
                <SelectItem value="meta_api">رسمي (Meta API)</SelectItem>
                <SelectItem value="evolution">غير رسمي (QR)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {allTags.length > 0 && (
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
                      "text-[10px] px-2 py-0.5 rounded-full transition-all font-medium",
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
          )}
        </div>
      )}

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <MessageSquare className="w-10 h-10 mb-2 opacity-20" />
            <p className="text-sm">لا توجد محادثات</p>
          </div>
        ) : (
          filtered.map((conv) => {
            const isSelected = conv.id === selectedId;
            const countdown = conv.channelType === "meta_api" ? get24hCountdown(conv.lastCustomerMessageAt) : null;
            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={cn(
                  "w-full text-right px-3 py-3 transition-all border-b border-border/20 hover:bg-accent/50 group relative",
                  isSelected && "bg-primary/5 border-r-2 border-r-primary"
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    {conv.profilePic ? (
                      <img
                        src={conv.profilePic}
                        alt={conv.customerName}
                        className="w-11 h-11 rounded-2xl object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                        }}
                      />
                    ) : null}
                    <div className={cn(
                      "w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-bold transition-all",
                      conv.profilePic ? "hidden" : "",
                      isSelected
                        ? "bg-gradient-to-br from-primary/30 to-primary/10 text-primary"
                        : "bg-secondary text-muted-foreground"
                    )}>
                      {conv.customerName.charAt(0)}
                    </div>
                    {/* Status dot */}
                    <span className={cn(
                      "absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded-full border-2 border-card",
                      statusColors[conv.status]
                    )} />
                    {/* Channel badge */}
                    {conv.channelType === "meta_api" && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                        <ShieldCheck className="w-2.5 h-2.5 text-white" />
                      </span>
                    )}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={cn("text-sm font-semibold truncate", isSelected && "text-primary")}>
                        {conv.customerName}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {countdown && (
                          <span className={cn("text-[9px] font-mono font-bold", countdown.color)}>
                            {countdown.text}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground/60">{conv.timestamp}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground truncate max-w-[200px] leading-relaxed">
                        {conv.lastMessage}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {conv.assignedTo && conv.assignedTo !== "غير معيّن" && (
                          <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center" title={conv.assignedTo}>
                            <User className="w-2.5 h-2.5 text-primary" />
                          </div>
                        )}
                        {(conv.unreadMentionCount || 0) > 0 && (
                          <span className="min-w-[20px] h-5 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center px-1.5 shadow-sm border border-primary/30">
                            <AtSign className="w-3 h-3" />
                          </span>
                        )}
                        {conv.unread > 0 && (
                          <span className="min-w-[20px] h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1.5 shadow-md">
                            {conv.unread}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Tags */}
                    {conv.tags.length > 0 && (
                      <div className="flex gap-1 mt-1.5 overflow-x-auto scrollbar-none">
                        {conv.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-md bg-secondary/80 text-muted-foreground shrink-0 font-medium">
                            {tag}
                          </span>
                        ))}
                        {conv.tags.length > 3 && (
                          <span className="text-[9px] text-muted-foreground/60">+{conv.tags.length - 3}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Custom Inbox Builder */}
      <CustomInboxBuilder
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        editInbox={editingInbox}
        onSaved={loadCustomInboxes}
      />
    </div>
  );
};

export default ConversationList;
