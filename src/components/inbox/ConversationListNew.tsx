import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Download, Loader2, Search, Filter, X, User, CheckCircle, Tag, MessageSquare, Pin, UserX, Eye, AtSign, Clock, XCircle, Bot, ChevronDown, ChevronUp, Users, Radio, ShieldCheck, Wifi, Inbox, Plus, RotateCcw, Pencil, Trash2, Sparkles, Archive, PinOff, CheckSquare, Square, Mail, Send, UserCheck } from "lucide-react";
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
import { useSearchParams } from "react-router-dom";

const statusColors: Record<string, string> = {
  active: "bg-emerald-500",
  waiting: "bg-amber-400",
  closed: "bg-muted-foreground/40",
};

const getConversationDisplayName = (conv: Conversation) => {
  if (conv.conversationType === "group") {
    return conv.customerName && conv.customerName !== conv.customerPhone ? conv.customerName : "مجموعة واتساب";
  }
  return conv.customerName || conv.customerPhone || "بدون اسم";
};

const getWaitTime = (conv: Conversation): { text: string; urgency: "normal" | "warning" | "critical" } | null => {
  if (conv.status === "closed" || conv.lastMessageSender !== "customer" || !conv.lastCustomerMessageAt) return null;
  const elapsed = Date.now() - new Date(conv.lastCustomerMessageAt).getTime();
  if (elapsed < 60000) return null;
  const mins = Math.floor(elapsed / 60000);
  const hours = Math.floor(mins / 60);
  const urgency = mins >= 30 ? "critical" : mins >= 10 ? "warning" : "normal";
  const text = hours > 0 ? `${hours}س ${mins % 60}د` : `${mins}د`;
  return { text, urgency };
};

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  hasSelection: boolean;
  onNewConversation?: () => void;
  onTogglePin?: (id: string) => void;
  onToggleArchive?: (id: string) => void;
  inboxMode?: "whatsapp" | "email";
}

const ConversationListNew = ({ conversations, selectedId, onSelect, hasSelection, onNewConversation, onTogglePin, onToggleArchive, inboxMode = "whatsapp" }: ConversationListProps) => {
  const { orgId, profile, userRole, isSuperAdmin } = useAuth();
  const effectiveRole = isSuperAdmin ? "admin" : userRole === "admin" ? "admin" : profile?.is_supervisor ? "supervisor" : "member";
  const [searchQuery, setSearchQuery] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = searchParams.get("filter") || (inboxMode === "email" ? "all" : "mine");
  const [activeQuickFilter, setActiveQuickFilterState] = useState(initialFilter);
  const setActiveQuickFilter = useCallback((id: string) => {
    setActiveQuickFilterState(id);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (id === "mine" && inboxMode !== "email") next.delete("filter");
      else next.set("filter", id);
      return next;
    }, { replace: true });
  }, [setSearchParams, inboxMode]);
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollRef = useRef(0);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => { savedScrollRef.current = el.scrollTop; };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el && savedScrollRef.current > 0) {
      requestAnimationFrame(() => { el.scrollTop = savedScrollRef.current; });
    }
  }, [conversations]);

  const loadCustomInboxes = async () => {
    if (!orgId) return;
    const { data } = await supabase.from("custom_inboxes").select("*").eq("org_id", orgId).order("sort_order");
    if (data) {
      setCustomInboxes(data.map((d: any) => ({ id: d.id, name: d.name, filters: d.filters || [], is_shared: d.is_shared })));
    }
  };

  useEffect(() => { loadCustomInboxes(); }, [orgId]);

  const applyCustomFilters = (conv: Conversation, inbox: CustomInbox): boolean => {
    if (!inbox.filters || inbox.filters.length === 0) return true;
    return inbox.filters.some((group) => group.conditions.every((cond) => {
      const val = cond.value;
      switch (cond.field) {
        case "status": return cond.operator === "eq" ? conv.status === val : conv.status !== val;
        case "assigned_to":
          if (cond.operator === "is_null") return !conv.assignedTo || conv.assignedTo === "غير معيّن";
          if (cond.operator === "is_not_null") return conv.assignedTo && conv.assignedTo !== "غير معيّن";
          return cond.operator === "eq" ? conv.assignedTo === val : conv.assignedTo !== val;
        case "tags": return cond.operator === "contains" ? conv.tags.includes(val) : !conv.tags.includes(val);
        case "conversation_type": return cond.operator === "eq" ? (conv.conversationType || "private") === val : (conv.conversationType || "private") !== val;
        case "unread_count": return cond.operator === "gt" ? conv.unread > Number(val) : cond.operator === "lt" ? conv.unread < Number(val) : conv.unread === Number(val);
        case "customer_name": return cond.operator === "contains" ? conv.customerName.includes(val) : conv.customerName === val;
        default: return true;
      }
    }));
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
    all: conversations.filter(c => c.status !== "closed" && !c.isArchived && c.conversationType !== "group").length,
    mine: conversations.filter(c => c.status !== "closed" && !c.isArchived && c.assignedToId === myId && c.conversationType !== "group").length,
    unassigned: conversations.filter(c => c.status !== "closed" && !c.isArchived && (!c.assignedTo || c.assignedTo === "غير معيّن") && c.conversationType !== "group").length,
    unread: conversations.filter(c => c.status !== "closed" && !c.isArchived && c.unread > 0 && c.assignedToId === myId && c.conversationType !== "group").length,
    groups: conversations.filter(c => c.status !== "closed" && !c.isArchived && c.conversationType === "group").length,
    closed: conversations.filter(c => c.status === "closed" && !c.isArchived).length,
    waitingCustomer: conversations.filter(c => c.status !== "closed" && !c.isArchived && c.assignedToId === myId && c.lastMessageSender === "agent" && c.conversationType !== "group").length,
    mentions: conversations.filter(c => c.status !== "closed" && !c.isArchived && (c.unreadMentionCount || 0) > 0).length,
    assigned: conversations.filter(c => c.status !== "closed" && !c.isArchived && c.assignedTo && c.assignedTo !== "غير معيّن" && c.conversationType !== "group").length,
    archived: conversations.filter(c => c.isArchived).length,
  }), [conversations, myId]);

  const quickFilters = [
    { id: "mine", label: "محادثاتي", icon: "👤", count: counts.mine },
    { id: "unread", label: "غير مقروءة", icon: "🔵", count: counts.unread },
    { id: "unassigned", label: "غير معينة", icon: "❓", count: counts.unassigned },
    { id: "groups", label: "المجموعات", icon: "👥", count: counts.groups },
    { id: "all", label: "المفتوحة", icon: "💬", count: counts.all },
    { id: "closed", label: "مغلقة", icon: "✅", count: counts.closed },
  ].filter(f => f.count > 0 || f.id === "mine" || f.id === "all");

  const activeInbox = customInboxes.find((i) => i.id === activeCustomInbox);

  const filtered = useMemo(() => {
    const list = conversations.filter((conv) => {
      if (searchQuery && !conv.customerName.includes(searchQuery) && !conv.lastMessage.includes(searchQuery) && !conv.customerPhone.includes(searchQuery)) return false;
      if (activeInbox) return applyCustomFilters(conv, activeInbox);
      if (activeQuickFilter !== "archived" && conv.isArchived) return false;
      if (activeQuickFilter !== "closed" && activeQuickFilter !== "archived" && conv.status === "closed") return false;
      if (activeQuickFilter !== "groups" && activeQuickFilter !== "mentions" && activeQuickFilter !== "closed" && activeQuickFilter !== "archived" && conv.conversationType === "group") return false;
      switch (activeQuickFilter) {
        case "mine": if (conv.assignedToId !== myId) return false; break;
        case "waitingCustomer": if (conv.assignedToId !== myId || conv.lastMessageSender !== "agent") return false; break;
        case "unassigned": if (conv.assignedTo && conv.assignedTo !== "غير معيّن") return false; break;
        case "assigned": if (!conv.assignedTo || conv.assignedTo === "غير معيّن") return false; break;
        case "mentions": if ((conv.unreadMentionCount || 0) <= 0) return false; break;
        case "unread": if (conv.unread <= 0 || conv.assignedToId !== myId) return false; break;
        case "groups": if (conv.conversationType !== "group") return false; break;
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

  return (
    <div className={cn(
      "flex flex-col border-l border-border/40 h-full",
      "bg-[#f4f6f8]",
      hasSelection ? "hidden md:flex md:w-[340px] lg:w-[380px]" : "w-full md:w-[340px] lg:w-[380px]"
    )}>

      {/* ── Header ── */}
      <div className="px-4 pt-5 pb-3 space-y-3 shrink-0 bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[17px] font-black text-gray-900 tracking-tight">
              {activeInbox ? activeInbox.name : inboxMode === "email" ? "📧 صندوق الإيميل" : "💬 صندوق الواتساب"}
            </h1>
            <p className="text-[11px] text-gray-400 mt-0.5">{filtered.length} محادثة</p>
          </div>
          <div className="flex items-center gap-1.5">
            {onNewConversation && (
              <button onClick={onNewConversation}
                className="w-9 h-9 rounded-xl bg-[#25D366] text-white hover:bg-[#20c05a] transition-all flex items-center justify-center shadow-sm"
                title="محادثة جديدة">
                <MessageSquare className="w-4 h-4" />
              </button>
            )}
            <button onClick={() => { setEditingInbox(null); setBuilderOpen(true); }}
              className="w-9 h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 transition-all flex items-center justify-center"
              title="صندوق مخصص">
              <Plus className="w-4 h-4" />
            </button>
            <button onClick={() => { setBulkMode(!bulkMode); setBulkSelected(new Set()); }}
              className={cn("w-9 h-9 rounded-xl border transition-all flex items-center justify-center",
                bulkMode ? "bg-[#25D366]/10 text-[#25D366] border-[#25D366]/30" : "border-gray-200 bg-white hover:bg-gray-50 text-gray-500")}
              title="تحديد متعدد">
              <CheckSquare className="w-4 h-4" />
            </button>
            <button onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={cn("w-9 h-9 rounded-xl border transition-all flex items-center justify-center relative",
                showAdvancedFilters || hasActiveFilters ? "bg-[#25D366]/10 text-[#25D366] border-[#25D366]/30" : "border-gray-200 bg-white hover:bg-gray-50 text-gray-500")}>
              <Filter className="w-4 h-4" />
              {hasActiveFilters && <span className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-[#25D366]" />}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
          <input
            placeholder="بحث عن محادثة..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 bg-gray-50 border border-gray-100 text-sm rounded-xl focus:outline-none focus:border-[#25D366]/40 focus:bg-white transition-all placeholder:text-gray-300 text-right"
          />
        </div>

        {/* Quick Filters */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
          {quickFilters.map((qf) => {
            const isActive = activeQuickFilter === qf.id && !activeCustomInbox;
            return (
              <button key={qf.id} onClick={() => { setActiveQuickFilter(qf.id); setActiveCustomInbox(null); }}
                className={cn(
                  "inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all border",
                  isActive
                    ? "bg-[#25D366] text-white border-[#25D366] shadow-sm"
                    : "bg-white text-gray-500 border-gray-100 hover:border-[#25D366]/30 hover:text-gray-700"
                )}>
                <span>{qf.icon}</span>
                <span>{qf.label}</span>
                {qf.count > 0 && (
                  <span className={cn("text-[9px] min-w-[16px] h-[16px] rounded-full flex items-center justify-center font-bold px-1",
                    isActive ? "bg-white/20 text-white" : "bg-[#25D366]/10 text-[#25D366]")}>
                    {qf.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Advanced Filters */}
      {showAdvancedFilters && (
        <div className="px-4 py-3 border-b border-gray-100 space-y-2 bg-white shrink-0">
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="h-9 text-xs bg-gray-50 border-gray-100 rounded-xl">
              <SelectValue placeholder="فلتر الموظف" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الموظفين</SelectItem>
              {allAgents.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="h-9 text-xs bg-gray-50 border-gray-100 rounded-xl">
              <SelectValue placeholder="فلتر القناة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل القنوات</SelectItem>
              <SelectItem value="meta_api">رسمي (Meta)</SelectItem>
              <SelectItem value="evolution">غير رسمي (QR)</SelectItem>
            </SelectContent>
          </Select>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => (
                <button key={tag} onClick={() => toggleTag(tag)}
                  className={cn("text-[10px] px-2.5 py-1 rounded-full transition-all font-medium border",
                    selectedTags.includes(tag) ? "bg-[#25D366] text-white border-[#25D366]" : "bg-gray-50 text-gray-500 border-gray-100 hover:border-[#25D366]/30")}>
                  {tag}
                </button>
              ))}
            </div>
          )}
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-[11px] text-red-400 hover:text-red-500 font-medium">
              مسح الفلاتر ✕
            </button>
          )}
        </div>
      )}

      {/* Custom Inboxes */}
      {customInboxes.length > 0 && (
        <div className="flex gap-2 px-4 py-2 overflow-x-auto scrollbar-none bg-white border-b border-gray-100 shrink-0">
          {customInboxes.map((inbox) => (
            <div key={inbox.id} className="flex items-center gap-0.5 group shrink-0">
              <button onClick={() => { if (activeCustomInbox === inbox.id) setActiveCustomInbox(null); else { setActiveCustomInbox(inbox.id); setActiveQuickFilter("all"); } }}
                className={cn("text-[11px] px-3 py-1.5 rounded-xl whitespace-nowrap font-semibold transition-all border",
                  activeCustomInbox === inbox.id ? "bg-[#25D366] text-white border-[#25D366]" : "bg-gray-50 text-gray-500 border-gray-100 hover:border-[#25D366]/30")}>
                📥 {inbox.name}
              </button>
              <button onClick={() => { setEditingInbox(inbox); setBuilderOpen(true); }} className="hidden group-hover:flex p-0.5 rounded text-gray-400 hover:text-[#25D366]">
                <Pencil className="w-2.5 h-2.5" />
              </button>
              <button onClick={() => deleteCustomInbox(inbox.id)} className="hidden group-hover:flex p-0.5 rounded text-gray-400 hover:text-red-400">
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Conversation List ── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3 text-2xl">💬</div>
            <p className="text-sm font-medium">لا توجد محادثات</p>
            <p className="text-xs text-gray-300 mt-1">جرّب تغيير الفلاتر</p>
          </div>
        ) : filtered.map((conv) => {
          const isSelected = conv.id === selectedId;
          const displayName = getConversationDisplayName(conv);
          const hasUnread = conv.unread > 0;
          const waitTime = getWaitTime(conv);
          const isBulkSelected = bulkSelected.has(conv.id);

          return (
            <button key={conv.id}
              onClick={() => {
                if (bulkMode) {
                  setBulkSelected(prev => { const next = new Set(prev); if (next.has(conv.id)) next.delete(conv.id); else next.add(conv.id); return next; });
                } else { onSelect(conv.id); }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                const menu = document.createElement("div");
                menu.className = "fixed z-50 bg-white border border-gray-100 rounded-2xl shadow-xl p-1.5 min-w-[150px] text-sm";
                menu.style.left = `${e.clientX}px`;
                menu.style.top = `${e.clientY}px`;
                [
                  { label: conv.isPinned ? "📌 إلغاء التثبيت" : "📌 تثبيت", action: () => onTogglePin?.(conv.id) },
                  { label: conv.isArchived ? "📁 إلغاء الأرشفة" : "📁 أرشفة", action: () => onToggleArchive?.(conv.id) },
                ].forEach(item => {
                  const btn = document.createElement("button");
                  btn.className = "w-full text-right px-3 py-2 rounded-xl hover:bg-gray-50 text-xs transition-colors text-gray-700";
                  btn.textContent = item.label;
                  btn.onclick = () => { item.action(); menu.remove(); };
                  menu.appendChild(btn);
                });
                document.body.appendChild(menu);
                const dismiss = () => { menu.remove(); document.removeEventListener("click", dismiss); };
                setTimeout(() => document.addEventListener("click", dismiss), 0);
              }}
              className={cn(
                "w-full text-right p-3 rounded-2xl transition-all border relative",
                isSelected && !bulkMode
                  ? "bg-[#25D366]/8 border-[#25D366]/20 shadow-sm"
                  : "bg-white border-gray-100 hover:border-[#25D366]/20 hover:shadow-sm",
                isBulkSelected && "bg-[#25D366]/5 border-[#25D366]/15",
                hasUnread && !isSelected && "border-r-2 border-r-[#25D366]"
              )}>

              <div className="flex items-start gap-3">
                {/* Bulk checkbox */}
                {bulkMode && (
                  <div className="flex items-center pt-1 shrink-0">
                    {isBulkSelected
                      ? <CheckSquare className="w-4 h-4 text-[#25D366]" />
                      : <Square className="w-4 h-4 text-gray-200" />}
                  </div>
                )}

                {/* Avatar */}
                <div className="relative shrink-0">
                  {conv.profilePic ? (
                    <img src={conv.profilePic} alt={displayName}
                      className="w-11 h-11 rounded-2xl object-cover ring-2 ring-gray-100"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className={cn(
                      "w-11 h-11 rounded-2xl flex items-center justify-center text-[15px] font-bold",
                      isSelected ? "bg-[#25D366]/15 text-[#25D366]" : "bg-gray-100 text-gray-500"
                    )}>
                      {conv.conversationType === "group" ? "👥" : displayName.charAt(0)}
                    </div>
                  )}
                  {/* Status dot */}
                  <span className={cn(
                    "absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded-full border-2 border-white",
                    conv.status === "active" ? "bg-[#25D366]" : conv.status === "waiting" ? "bg-amber-400" : "bg-gray-300"
                  )} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className={cn("text-[13.5px] truncate", hasUnread ? "font-bold text-gray-900" : "font-semibold text-gray-700")}>
                      {conv.isPinned && <span className="text-[#25D366] ml-1">📌</span>}
                      {displayName}
                    </p>
                    <span className={cn("text-[10.5px] shrink-0", hasUnread ? "text-[#25D366] font-bold" : "text-gray-300")}>
                      {conv.timestamp}
                    </span>
                  </div>

                  <p className={cn("text-[12px] truncate leading-snug",
                    hasUnread ? "text-gray-600 font-medium" : "text-gray-400")}>
                    {conv.lastMessage || "لا توجد رسائل بعد"}
                  </p>

                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-1">
                      {conv.channelType === "meta_api" && (
                        <span className="text-[9px] font-bold text-[#25D366] bg-[#25D366]/10 px-1.5 py-0.5 rounded-lg">Meta</span>
                      )}
                      {conv.channelType === "evolution" && (
                        <span className="text-[9px] font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded-lg">QR</span>
                      )}
                      {conv.assignedTo && conv.assignedTo !== "غير معيّن" && (
                        <span className="text-[10px] text-gray-400 truncate max-w-[80px]">
                          {conv.assignedTo.split(" ")[0]}
                        </span>
                      )}
                      {waitTime && (
                        <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5",
                          waitTime.urgency === "critical" ? "bg-red-50 text-red-500" :
                          waitTime.urgency === "warning" ? "bg-amber-50 text-amber-500" : "bg-gray-50 text-gray-400")}>
                          <Clock className="w-2.5 h-2.5" />
                          {waitTime.text}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {conv.sentiment === "negative" && <span className="text-[12px]">😠</span>}
                      {conv.sentiment === "positive" && <span className="text-[12px]">😊</span>}
                      {hasUnread && (
                        <span className="min-w-[20px] h-[20px] rounded-full bg-[#25D366] text-white text-[10px] font-bold flex items-center justify-center px-1.5 shadow-sm">
                          {conv.unread}
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

      {/* Bulk Actions */}
      {bulkMode && bulkSelected.size > 0 && (
        <BulkActionsBar
          selectedIds={Array.from(bulkSelected)}
          onClear={() => setBulkSelected(new Set())}
          onDone={() => { setBulkMode(false); setBulkSelected(new Set()); }}
        />
      )}

      <CustomInboxBuilder
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        editInbox={editingInbox}
        onSaved={loadCustomInboxes}
      />
    </div>
  );
};

export default ConversationListNew;