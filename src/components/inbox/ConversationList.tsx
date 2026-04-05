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

const getConversationDisplayName = (conv: Conversation) => {
  if (conv.conversationType === "group") {
    return conv.customerName && conv.customerName !== conv.customerPhone ? conv.customerName : "مجموعة واتساب";
  }
  return conv.customerName || conv.customerPhone || "بدون اسم";
};

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
    { id: "all", label: "الكل", count: counts.all },
    { id: "mine", label: "محادثاتي", count: counts.mine },
    { id: "unread", label: "غير مقروءة", count: counts.unread },
    { id: "waitingCustomer", label: "بانتظار العميل", count: counts.waitingCustomer },
    { id: "closed", label: "مغلقة", count: counts.closed },
  ];

  const activeInbox = customInboxes.find((i) => i.id === activeCustomInbox);

  const filtered = useMemo(() => {
    const list = conversations.filter((conv) => {
      if (searchQuery && !conv.customerName.includes(searchQuery) && !conv.lastMessage.includes(searchQuery) && !conv.customerPhone.includes(searchQuery)) return false;
      if (activeInbox) return applyCustomFilters(conv, activeInbox);
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
    list.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return 0;
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
      "flex flex-col bg-card/50 h-full",
      hasSelection ? "hidden md:flex md:w-[340px] lg:w-[370px]" : "w-full md:w-[340px] lg:w-[370px]"
    )}>
      {/* Header */}
      <div className="px-4 pt-5 pb-3 space-y-3 shrink-0">
        {/* Title row */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">
            {activeInbox ? activeInbox.name : "المحادثات"}
          </h1>
          <div className="flex items-center gap-0.5">
            {onNewConversation && (
              <button
                onClick={onNewConversation}
                className="w-7 h-7 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center"
                title="محادثة جديدة"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => { setBulkMode(!bulkMode); setBulkSelected(new Set()); }}
              className={cn("w-7 h-7 rounded-lg transition-colors flex items-center justify-center", bulkMode ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground")}
              title="تحديد متعدد"
            >
              <CheckSquare className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={cn("w-7 h-7 rounded-lg transition-colors relative flex items-center justify-center", showAdvancedFilters || hasActiveFilters ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground")}
            >
              <Filter className="w-3.5 h-3.5" />
              {hasActiveFilters && <span className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-primary" />}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
          <Input
            placeholder="بحث في المحادثات..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9 h-9 bg-background border-0 text-[13px] rounded-lg focus:ring-1 focus:ring-ring/30 transition-all placeholder:text-muted-foreground/40"
          />
        </div>

        {/* Segmented filter control */}
        <div className="bg-background rounded-lg p-0.5 flex gap-0.5">
          {quickFilters.map((qf) => {
            const isActive = activeQuickFilter === qf.id && !activeCustomInbox;
            return (
              <button
                key={qf.id}
                onClick={() => { setActiveQuickFilter(qf.id); setActiveCustomInbox(null); }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 py-[7px] rounded-md text-[11px] font-medium transition-all whitespace-nowrap",
                  isActive
                    ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    : "text-muted-foreground hover:text-foreground/70"
                )}
              >
                <span>{qf.label}</span>
                {isActive && (qf.count ?? 0) > 0 && (
                  <span className="text-[9px] bg-primary/10 text-primary rounded-full min-w-[16px] h-[16px] px-1 flex items-center justify-center font-semibold">
                    {qf.count}
                  </span>
                )}
              </button>
            );
          })}
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
                    "text-[10px] px-3 py-1 rounded-md whitespace-nowrap font-medium transition-all",
                    activeCustomInbox === inbox.id
                      ? "bg-primary/10 text-primary"
                      : "bg-background text-muted-foreground hover:text-foreground/70"
                  )}
                >
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
      </div>

      {/* Advanced Filters */}
      {showAdvancedFilters && (
        <div className="px-4 py-3 border-t border-border/10 space-y-2.5 bg-background/50 shrink-0">
          <div className="flex items-center gap-2">
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="h-8 text-[11px] bg-background border-border/20 rounded-lg"><SelectValue placeholder="الموظف" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الموظفين</SelectItem>
                {allAgents.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="h-8 text-[11px] bg-background border-border/20 rounded-lg"><SelectValue placeholder="القناة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل القنوات</SelectItem>
                <SelectItem value="meta_api">رسمي (Meta API)</SelectItem>
                <SelectItem value="evolution">غير رسمي (QR)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {allTags.length > 0 && (
            <div>
              <span className="text-[10px] text-muted-foreground font-medium mb-1.5 block">التصنيفات</span>
              <div className="flex flex-wrap gap-1">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded-md transition-all font-medium",
                      selectedTags.includes(tag)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-[10px] text-destructive/70 hover:text-destructive font-medium transition-colors">
              إعادة ضبط الفلاتر
            </button>
          )}
        </div>
      )}

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto px-2 pt-1 pb-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
              <MessageSquare className="w-5 h-5 opacity-20" />
            </div>
            <p className="text-[13px] font-medium">{hasListConstraints ? "لا توجد محادثات مطابقة" : "لا توجد محادثات"}</p>
            <p className="text-[11px] text-muted-foreground/50 mt-0.5">{hasListConstraints ? "جرّب تغيير الفلاتر" : "ابدأ بإرسال رسالة جديدة"}</p>
            {hasListConstraints && (
              <button
                onClick={resetListView}
                className="mt-3 text-[11px] px-4 py-1.5 rounded-lg bg-primary/8 text-primary hover:bg-primary/15 transition-colors font-medium"
              >
                عرض كل المحادثات
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-px">
          {filtered.map((conv) => {
            const isSelected = conv.id === selectedId;
            const displayName = getConversationDisplayName(conv);
            const hasUnread = conv.unread > 0;
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
                  menu.className = "fixed z-50 bg-popover border border-border/20 rounded-xl shadow-lg p-1 min-w-[140px] text-sm backdrop-blur-xl";
                  menu.style.left = `${e.clientX}px`;
                  menu.style.top = `${e.clientY}px`;
                  const items = [
                    { label: conv.isPinned ? "إلغاء التثبيت" : "📌 تثبيت", action: () => onTogglePin?.(conv.id) },
                    { label: conv.isArchived ? "إلغاء الأرشفة" : "📁 أرشفة", action: () => onToggleArchive?.(conv.id) },
                  ];
                  items.forEach(item => {
                    const btn = document.createElement("button");
                    btn.className = "w-full text-right px-3 py-1.5 rounded-lg hover:bg-accent text-[11px] transition-colors";
                    btn.textContent = item.label;
                    btn.onclick = () => { item.action(); menu.remove(); };
                    menu.appendChild(btn);
                  });
                  document.body.appendChild(menu);
                  const dismiss = () => { menu.remove(); document.removeEventListener("click", dismiss); };
                  setTimeout(() => document.addEventListener("click", dismiss), 0);
                }}
                className={cn(
                  "w-full text-right px-3 py-2.5 transition-all group relative rounded-lg",
                  isSelected && !bulkMode
                    ? "bg-primary/[0.06]"
                    : "hover:bg-muted/50",
                  bulkMode && bulkSelected.has(conv.id) && "bg-primary/5"
                )}
              >
                <div className="flex items-start gap-3">
                  {bulkMode && (
                    <div className="flex items-center shrink-0 mt-1">
                      {bulkSelected.has(conv.id) ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : (
                        <Square className="w-4 h-4 text-muted-foreground/30" />
                      )}
                    </div>
                  )}

                  {/* Avatar */}
                  <div className="relative shrink-0 mt-0.5">
                    {conv.profilePic ? (
                      <img
                        src={conv.profilePic}
                        alt={conv.customerName}
                        className="w-10 h-10 rounded-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                        }}
                      />
                    ) : null}
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-semibold",
                      conv.profilePic ? "hidden" : "",
                      isSelected
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground/70"
                    )}>
                      {conv.conversationType === "group" ? (
                        <Users className="w-4 h-4" />
                      ) : (
                        conv.customerName.charAt(0)
                      )}
                    </div>
                    {/* Unread dot */}
                    {hasUnread && (
                      <span className="absolute -top-0.5 -left-0.5 w-2.5 h-2.5 rounded-full bg-primary border-[1.5px] border-card" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Row 1: Name + Time */}
                    <div className="flex items-baseline justify-between gap-2 mb-0.5">
                      <span className={cn(
                        "text-[13px] truncate flex items-center gap-1",
                        hasUnread ? "font-semibold text-foreground" : "font-medium text-foreground/90"
                      )}>
                        {conv.isPinned && <Pin className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0 rotate-45" />}
                        {displayName}
                      </span>
                      <span className="text-[10px] text-muted-foreground/40 shrink-0 font-normal tabular-nums">
                        {conv.timestamp}
                      </span>
                    </div>

                    {/* Row 2: Preview + indicators */}
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn(
                        "text-[12px] truncate leading-normal",
                        hasUnread ? "text-foreground/60 font-medium" : "text-muted-foreground/50"
                      )}>
                        {conv.lastMessage || (conv.conversationType === "group" ? "محادثة جماعية" : "لا توجد رسائل بعد")}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {conv.assignedTo && conv.assignedTo !== "غير معيّن" && (
                          <span className="text-[9px] text-muted-foreground/30 max-w-[36px] truncate" title={conv.assignedTo}>
                            {conv.assignedTo.split(" ")[0]}
                          </span>
                        )}
                        {(conv.unreadMentionCount || 0) > 0 && (
                          <span className="w-4 h-4 rounded-full bg-accent text-accent-foreground text-[8px] font-bold flex items-center justify-center">
                            @
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          </div>
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
