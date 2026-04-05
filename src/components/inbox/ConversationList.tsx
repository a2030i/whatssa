import { useState, useMemo, useEffect } from "react";
import { Search, Filter, X, User, CheckCircle, Tag, MessageSquare, Pin, UserX, Eye, AtSign, Clock, XCircle, Bot, ChevronDown, ChevronUp, Users, Radio, ShieldCheck, Wifi, Inbox, Plus, RotateCcw, Pencil, Trash2, Sparkles, Archive, PinOff, CheckSquare, Square } from "lucide-react";
import BulkActionsBar from "./BulkActionsBar";
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
  onTogglePin?: (id: string) => void;
  onToggleArchive?: (id: string) => void;
}

const ConversationList = ({ conversations, selectedId, onSelect, hasSelection, onNewConversation, onTogglePin, onToggleArchive }: ConversationListProps) => {
  const { orgId, profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeQuickFilter, setActiveQuickFilter] = useState("mine");
  const [agentFilter, setAgentFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [customInboxes, setCustomInboxes] = useState<CustomInbox[]>([]);
  const [activeCustomInbox, setActiveCustomInbox] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingInbox, setEditingInbox] = useState<CustomInbox | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
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

  const myId = profile?.id;
  const counts = useMemo(() => ({
    all: conversations.filter(c => c.status !== "closed" && !c.isArchived).length,
    mine: conversations.filter(c => c.status !== "closed" && !c.isArchived && c.assignedToId === myId).length,
    waitingCustomer: conversations.filter(c => c.status !== "closed" && !c.isArchived && c.assignedToId === myId && c.lastMessageSender === "agent").length,
    unassigned: conversations.filter(c => c.status !== "closed" && !c.isArchived && (!c.assignedTo || c.assignedTo === "غير معيّن")).length,
    unread: conversations.filter(c => c.status !== "closed" && !c.isArchived && c.unread > 0 && c.assignedToId === myId).length,
    mentions: conversations.filter(c => c.status !== "closed" && !c.isArchived && (c.unreadMentionCount || 0) > 0).length,
    closed: conversations.filter(c => c.status === "closed" && !c.isArchived).length,
    archived: conversations.filter(c => c.isArchived).length,
  }), [conversations, myId]);

  const quickFilters: QuickFilter[] = [
    { id: "mine", label: "محادثاتي", icon: User, count: counts.mine },
    { id: "unread", label: "غير مقروءة", icon: Eye, count: counts.unread },
    { id: "waitingCustomer", label: "بانتظار العميل", icon: Clock, count: counts.waitingCustomer },
    { id: "unassigned", label: "غير معينة", icon: UserX, count: counts.unassigned },
    { id: "mentions", label: "إشارات", icon: AtSign, count: counts.mentions },
    { id: "all", label: "الكل", icon: MessageSquare, count: counts.all },
    { id: "closed", label: "مغلقة", icon: XCircle, count: counts.closed },
    { id: "archived", label: "مؤرشفة", icon: Archive, count: counts.archived },
  ];

  const activeInbox = customInboxes.find((i) => i.id === activeCustomInbox);

  const filtered = useMemo(() => {
    const list = conversations.filter((conv) => {
      if (searchQuery && !conv.customerName.includes(searchQuery) && !conv.lastMessage.includes(searchQuery) && !conv.customerPhone.includes(searchQuery)) return false;
      if (activeInbox) return applyCustomFilters(conv, activeInbox);
      // Hide archived unless specifically filtering for them
      if (activeQuickFilter !== "archived" && conv.isArchived) return false;
      if (activeQuickFilter !== "closed" && activeQuickFilter !== "archived" && conv.status === "closed") return false;
      switch (activeQuickFilter) {
        case "mine": if (conv.assignedToId !== myId) return false; break;
        case "waitingCustomer": if (conv.assignedToId !== myId || conv.lastMessageSender !== "agent") return false; break;
        case "unassigned": if (conv.assignedTo && conv.assignedTo !== "غير معيّن") return false; break;
        case "mentions": if ((conv.unreadMentionCount || 0) <= 0) return false; break;
        case "unread": if (conv.unread <= 0 || conv.assignedToId !== myId) return false; break;
        case "closed": if (conv.status !== "closed") return false; break;
        case "archived": if (!conv.isArchived) return false; break;
      }
      if (agentFilter !== "all" && conv.assignedTo !== agentFilter) return false;
      if (channelFilter !== "all") {
        if (channelFilter === "meta_api" && conv.channelType !== "meta_api") return false;
        if (channelFilter === "evolution" && conv.channelType !== "evolution") return false;
      }
      if (selectedTags.length > 0 && !selectedTags.some((t) => conv.tags.includes(t))) return false;
      return true;
    });
    // Sort: pinned first, then by default order
    list.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return 0; // preserve existing order (by last_message_at)
    });
    return list;
  }, [conversations, searchQuery, activeQuickFilter, agentFilter, channelFilter, selectedTags, activeInbox]);

  const hasActiveFilters = agentFilter !== "all" || channelFilter !== "all" || selectedTags.length > 0 || !!activeCustomInbox;
  const clearFilters = () => { setAgentFilter("all"); setChannelFilter("all"); setSelectedTags([]); setActiveCustomInbox(null); setActiveQuickFilter("all"); };
  const toggleTag = (tag: string) => setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  const hasListConstraints = !!searchQuery.trim() || activeQuickFilter !== "all" || hasActiveFilters;
  const resetListView = () => {
    setSearchQuery("");
    clearFilters();
  };

  return (
    <div className={cn(
      "border-l border-border/40 flex flex-col bg-background",
      hasSelection ? "hidden md:flex md:w-[360px] lg:w-[380px]" : "w-full md:w-[360px] lg:w-[380px]"
    )}>
      {/* Header */}
      <div className="px-4 pt-4 pb-2 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-foreground tracking-tight">
            {activeInbox ? activeInbox.name : "المحادثات"}
          </h1>
          <div className="flex items-center gap-1">
            {onNewConversation && (
              <button
                onClick={onNewConversation}
                className="w-9 h-9 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center justify-center shadow-sm"
                title="محادثة جديدة"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => { setEditingInbox(null); setBuilderOpen(true); }}
              className="w-9 h-9 rounded-xl hover:bg-secondary text-muted-foreground transition-all flex items-center justify-center hover:text-foreground"
              title="صندوق مخصص"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setBulkMode(!bulkMode); setBulkSelected(new Set()); }}
              className={cn("w-9 h-9 rounded-xl transition-all flex items-center justify-center", bulkMode ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground")}
              title="تحديد متعدد"
            >
              <CheckSquare className="w-4 h-4" />
            </button>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="w-9 h-9 rounded-xl hover:bg-destructive/10 transition-all flex items-center justify-center" title="إعادة ضبط">
                <RotateCcw className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={cn("w-9 h-9 rounded-xl transition-all relative flex items-center justify-center", showAdvancedFilters || hasActiveFilters ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground")}
            >
              <Filter className="w-4 h-4" />
              {hasActiveFilters && <span className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-primary animate-pulse" />}
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
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <Input
            placeholder="بحث بالاسم أو الرقم..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10 bg-secondary/60 border-0 text-sm h-11 rounded-2xl focus:bg-secondary focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/40"
          />
        </div>
      </div>

      {/* Quick Filters */}
      <div className="shrink-0 border-b border-border/20 px-4 pb-3 overflow-x-auto scrollbar-none">
        <div className="flex gap-1.5 w-max">
          {quickFilters.map((qf) => (
            <button
              key={qf.id}
              onClick={() => { setActiveQuickFilter(qf.id); setActiveCustomInbox(null); }}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all",
                activeQuickFilter === qf.id && !activeCustomInbox
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <qf.icon className="w-3.5 h-3.5" />
              <span>{qf.label}</span>
              {(qf.count ?? 0) > 0 && (
                <span className={cn(
                  "text-[10px] min-w-[20px] h-5 rounded-full flex items-center justify-center font-bold px-1.5",
                  activeQuickFilter === qf.id && !activeCustomInbox
                    ? "bg-primary-foreground/20"
                    : "bg-background text-foreground"
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
        <div className="px-4 py-3 border-b border-border/20 space-y-2.5 animate-fade-in bg-secondary/10 shrink-0">
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="h-9 text-xs bg-card border-border/30 rounded-xl"><SelectValue placeholder="الموظف" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الموظفين</SelectItem>
                {allAgents.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="h-9 text-xs bg-card border-border/30 rounded-xl"><SelectValue placeholder="القناة" /></SelectTrigger>
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
                      "text-[10px] px-2.5 py-1 rounded-full transition-all font-medium",
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
            <div className="w-16 h-16 rounded-2xl bg-secondary/60 flex items-center justify-center mb-3">
              <MessageSquare className="w-7 h-7 opacity-30" />
            </div>
            <p className="text-sm font-medium">{hasListConstraints ? "لا توجد محادثات مطابقة" : "لا توجد محادثات"}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{hasListConstraints ? "جرّب تغيير الفلاتر" : "ابدأ بإرسال رسالة جديدة"}</p>
            {hasListConstraints && (
              <button
                onClick={resetListView}
                className="mt-3 text-xs px-4 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all font-medium"
              >
                عرض كل المحادثات
              </button>
            )}
          </div>
        ) : (
          filtered.map((conv) => {
            const isSelected = conv.id === selectedId;
            const countdown = conv.channelType === "meta_api" ? get24hCountdown(conv.lastCustomerMessageAt) : null;
            return (
              <button
                key={conv.id}
                onClick={() => {
                  if (bulkMode) {
                    setBulkSelected(prev => {
                      const next = new Set(prev);
                      if (next.has(conv.id)) next.delete(conv.id); else next.add(conv.id);
                      return next;
                    });
                  } else {
                    onSelect(conv.id);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const menu = document.createElement("div");
                  menu.className = "fixed z-50 bg-popover border border-border rounded-xl shadow-xl p-1.5 min-w-[150px] text-sm backdrop-blur-lg";
                  menu.style.left = `${e.clientX}px`;
                  menu.style.top = `${e.clientY}px`;
                  const items = [
                    { label: conv.isPinned ? "إلغاء التثبيت" : "📌 تثبيت", action: () => onTogglePin?.(conv.id) },
                    { label: conv.isArchived ? "إلغاء الأرشفة" : "📁 أرشفة", action: () => onToggleArchive?.(conv.id) },
                  ];
                  items.forEach(item => {
                    const btn = document.createElement("button");
                    btn.className = "w-full text-right px-3 py-2 rounded-lg hover:bg-accent text-xs transition-colors";
                    btn.textContent = item.label;
                    btn.onclick = () => { item.action(); menu.remove(); };
                    menu.appendChild(btn);
                  });
                  document.body.appendChild(menu);
                  const dismiss = () => { menu.remove(); document.removeEventListener("click", dismiss); };
                  setTimeout(() => document.addEventListener("click", dismiss), 0);
                }}
                className={cn(
                  "w-full text-right px-4 py-3.5 transition-all group relative",
                  isSelected && !bulkMode
                    ? "bg-primary/[0.06] border-r-[3px] border-r-primary"
                    : "hover:bg-secondary/60 border-r-[3px] border-r-transparent",
                  bulkMode && bulkSelected.has(conv.id) && "bg-primary/10"
                )}
              >
                <div className="flex items-start gap-3">
                  {bulkMode && (
                    <div className="flex items-center pt-3 shrink-0">
                      {bulkSelected.has(conv.id) ? (
                        <CheckSquare className="w-4.5 h-4.5 text-primary" />
                      ) : (
                        <Square className="w-4.5 h-4.5 text-muted-foreground/40" />
                      )}
                    </div>
                  )}
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    {conv.profilePic ? (
                      <img
                        src={conv.profilePic}
                        alt={conv.customerName}
                        className="w-12 h-12 rounded-2xl object-cover ring-2 ring-background shadow-sm"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                        }}
                      />
                    ) : null}
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold transition-all shadow-sm",
                      conv.profilePic ? "hidden" : "",
                      isSelected
                        ? "bg-primary/15 text-primary ring-2 ring-primary/20"
                        : "bg-gradient-to-br from-secondary to-muted text-muted-foreground"
                    )}>
                      {conv.conversationType === "group" ? (
                        <Users className="w-5 h-5" />
                      ) : (
                        conv.customerName.charAt(0)
                      )}
                    </div>
                    {/* Online status dot */}
                    <span className={cn(
                      "absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 rounded-full border-[2.5px] border-background",
                      statusColors[conv.status]
                    )} />
                    {/* Channel badge */}
                    {conv.channelType === "meta_api" && (
                      <span className="absolute -top-1 -right-1 w-4.5 h-4.5 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm ring-2 ring-background">
                        <ShieldCheck className="w-2.5 h-2.5 text-white" />
                      </span>
                    )}
                    {conv.channelType === "evolution" && (
                      <span className="absolute -top-1 -right-1 w-4.5 h-4.5 rounded-full bg-muted-foreground/60 flex items-center justify-center shadow-sm ring-2 ring-background">
                        <Wifi className="w-2.5 h-2.5 text-white" />
                      </span>
                    )}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn("text-sm font-bold truncate flex items-center gap-1.5", isSelected ? "text-primary" : "text-foreground")}>
                        {conv.isPinned && <Pin className="w-3 h-3 text-primary shrink-0 rotate-45" />}
                        {conv.customerName}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {countdown && (
                          <span className={cn("text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-secondary/80", countdown.color)}>
                            {countdown.text}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground/50 font-medium">{conv.timestamp}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn(
                        "text-[13px] truncate max-w-[200px] leading-relaxed",
                        conv.unread > 0 ? "text-foreground font-medium" : "text-muted-foreground/70"
                      )}>
                        {conv.lastMessage}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {conv.assignedTo && conv.assignedTo !== "غير معيّن" && (
                          <div className="flex items-center gap-1 bg-secondary rounded-lg px-1.5 py-0.5" title={conv.assignedTo}>
                            <User className="w-2.5 h-2.5 text-muted-foreground" />
                            <span className="text-[9px] font-medium text-muted-foreground max-w-[50px] truncate">{conv.assignedTo.split(" ")[0]}</span>
                          </div>
                        )}
                        {(conv.unreadMentionCount || 0) > 0 && (
                          <span className="min-w-[22px] h-[22px] rounded-lg bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center px-1 shadow-sm">
                            <AtSign className="w-3 h-3" />
                          </span>
                        )}
                        {conv.unread > 0 && (
                          <span className="min-w-[22px] h-[22px] rounded-lg bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1.5 shadow-md">
                            {conv.unread}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Tags */}
                    {conv.tags.length > 0 && (
                      <div className="flex gap-1 mt-2 overflow-x-auto scrollbar-none">
                        {conv.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="text-[9px] px-2 py-0.5 rounded-lg bg-secondary text-muted-foreground shrink-0 font-medium">
                            {tag}
                          </span>
                        ))}
                        {conv.tags.length > 3 && (
                          <span className="text-[9px] text-muted-foreground/50 flex items-center">+{conv.tags.length - 3}</span>
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

      {/* Bulk Actions Bar */}
      {bulkMode && bulkSelected.size > 0 && (
        <BulkActionsBar
          selectedIds={Array.from(bulkSelected)}
          onClear={() => setBulkSelected(new Set())}
          onDone={() => { setBulkMode(false); setBulkSelected(new Set()); }}
        />
      )}

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
