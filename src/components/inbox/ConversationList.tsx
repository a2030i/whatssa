import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Download, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Search, Filter, X, User, CheckCircle, Tag, MessageSquare, Pin, UserX, Eye, AtSign, Clock, XCircle, Bot, ChevronDown, ChevronUp, Users, Radio, ShieldCheck, Wifi, Inbox, Plus, RotateCcw, Pencil, Trash2, Sparkles, Archive, PinOff, CheckSquare, Square, Mail, Send, UserCheck } from "lucide-react";
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

/** Calculate customer wait time when last message is from customer and conv is open */
const getWaitTime = (conv: Conversation): { text: string; urgency: "normal" | "warning" | "critical" } | null => {
  if (conv.status === "closed" || conv.lastMessageSender !== "customer" || !conv.lastCustomerMessageAt) return null;
  const elapsed = Date.now() - new Date(conv.lastCustomerMessageAt).getTime();
  if (elapsed < 60000) return null; // less than 1 min, skip
  const mins = Math.floor(elapsed / 60000);
  const hours = Math.floor(mins / 60);
  const urgency = mins >= 30 ? "critical" : mins >= 10 ? "warning" : "normal";
  const text = hours > 0 ? `${hours}س ${mins % 60}د` : `${mins}د`;
  return { text, urgency };
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
  inboxMode?: "whatsapp" | "email";
}

const ConversationList = ({ conversations, selectedId, onSelect, hasSelection, onNewConversation, onTogglePin, onToggleArchive, inboxMode = "whatsapp" }: ConversationListProps) => {
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

  // Save scroll position continuously
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => { savedScrollRef.current = el.scrollTop; };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Restore scroll position after conversations update (polling)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el && savedScrollRef.current > 0) {
      requestAnimationFrame(() => {
        el.scrollTop = savedScrollRef.current;
      });
    }
  }, [conversations]);

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
  const counts = useMemo(() => {
    if (inboxMode === "email") {
      const active = conversations.filter(c => c.status !== "closed" && !c.isArchived);
      // "sent" = conversations where agent has replied at least once (assigned)
      // "inbox" = new inbound conversations with no agent reply yet
      const hasAgentReply = (c: any) => c.assignedTo && c.assignedTo !== "غير معيّن";
      return {
        all: active.length,
        inbox: active.filter(c => !hasAgentReply(c) || c.lastMessageSender === "customer").length,
        sent: active.filter(c => hasAgentReply(c)).length,
        unread: active.filter(c => c.unread > 0).length,
        read: active.filter(c => c.unread === 0).length,
        mine: active.filter(c => c.assignedToId === myId).length,
        unassigned: active.filter(c => !c.assignedTo || c.assignedTo === "غير معيّن").length,
        waitingReply: active.filter(c => c.lastMessageSender === "customer").length,
        closed: conversations.filter(c => c.status === "closed" && !c.isArchived).length,
        archived: conversations.filter(c => c.isArchived).length,
      };
    }
    return {
      all: conversations.filter(c => c.status !== "closed" && !c.isArchived && c.conversationType !== "group").length,
      mine: conversations.filter(c => c.status !== "closed" && !c.isArchived && c.assignedToId === myId && c.conversationType !== "group").length,
      waitingCustomer: conversations.filter(c => c.status !== "closed" && !c.isArchived && c.assignedToId === myId && c.lastMessageSender === "agent" && c.conversationType !== "group").length,
      unassigned: conversations.filter(c => c.status !== "closed" && !c.isArchived && (!c.assignedTo || c.assignedTo === "غير معيّن") && c.conversationType !== "group").length,
      assigned: conversations.filter(c => c.status !== "closed" && !c.isArchived && c.assignedTo && c.assignedTo !== "غير معيّن" && c.conversationType !== "group").length,
      unread: conversations.filter(c => c.status !== "closed" && !c.isArchived && c.unread > 0 && c.assignedToId === myId && c.conversationType !== "group").length,
      mentions: conversations.filter(c => c.status !== "closed" && !c.isArchived && (c.unreadMentionCount || 0) > 0).length,
      groups: conversations.filter(c => c.status !== "closed" && !c.isArchived && c.conversationType === "group").length,
      closed: conversations.filter(c => c.status === "closed" && !c.isArchived).length,
      archived: conversations.filter(c => c.isArchived).length,
    };
  }, [conversations, myId, inboxMode]);

  const allQuickFilters: (QuickFilter & { minRole?: string })[] = inboxMode === "email" ? [
    { id: "all", label: "الكل", icon: Mail, count: counts.all },
    { id: "inbox", label: "وارد", icon: Inbox, count: (counts as any).inbox },
    { id: "sent", label: "صادر", icon: Send, count: (counts as any).sent },
    { id: "unread", label: "غير مقروء", icon: Eye, count: counts.unread },
    { id: "read", label: "مقروء", icon: CheckCircle, count: (counts as any).read },
    { id: "mine", label: "بريدي", icon: User, count: counts.mine },
    { id: "unassigned", label: "غير معينة", icon: UserX, count: counts.unassigned },
    { id: "closed", label: "مغلقة", icon: XCircle, count: counts.closed, minRole: "supervisor" },
    { id: "archived", label: "مؤرشفة", icon: Archive, count: counts.archived, minRole: "supervisor" },
  ] : [
    { id: "mine", label: "محادثاتي", icon: User, count: counts.mine },
    { id: "unread", label: "غير مقروءة", icon: Eye, count: counts.unread },
    { id: "waitingCustomer", label: "بانتظار العميل", icon: Clock, count: (counts as any).waitingCustomer },
    { id: "unassigned", label: "غير معينة", icon: UserX, count: counts.unassigned },
    { id: "assigned", label: "معيّنة", icon: UserCheck, count: (counts as any).assigned, minRole: "supervisor" },
    { id: "mentions", label: "إشارات", icon: AtSign, count: (counts as any).mentions, minRole: "supervisor" },
    { id: "groups", label: "المجموعات", icon: Users, count: (counts as any).groups },
    { id: "all", label: "المفتوحة", icon: MessageSquare, count: counts.all },
    { id: "closed", label: "مغلقة", icon: XCircle, count: counts.closed },
    { id: "archived", label: "مؤرشفة", icon: Archive, count: counts.archived, minRole: "supervisor" },
  ];

  const roleHierarchy: Record<string, number> = { member: 0, supervisor: 1, admin: 2 };
  const userLevel = roleHierarchy[effectiveRole] ?? 0;
  // Always-visible filters (shown even when count is 0)
  const hasAnyGroup = conversations.some(c => c.conversationType === "group");
  console.log("[ConvList] hasAnyGroup:", hasAnyGroup, "groupCount:", (counts as any).groups, "total convs:", conversations.length, "groups in data:", conversations.filter(c => c.conversationType === "group").length);
  const alwaysVisible = new Set(inboxMode === "email" ? ["all", "inbox", "sent"] : ["mine", "all", ...(hasAnyGroup ? ["groups"] : []), ...(userLevel >= 1 ? ["assigned"] : [])]);
  const quickFilters = allQuickFilters.filter(f => {
    if (f.minRole && userLevel < (roleHierarchy[f.minRole] ?? 0)) return false;
    // Hide filters with 0 count (except always-visible ones)
    if (!alwaysVisible.has(f.id) && f.count === 0) return false;
    return true;
  });

  const activeInbox = customInboxes.find((i) => i.id === activeCustomInbox);

  const filtered = useMemo(() => {
    const list = conversations.filter((conv) => {
      if (searchQuery && !conv.customerName.includes(searchQuery) && !conv.lastMessage.includes(searchQuery) && !conv.customerPhone.includes(searchQuery)) return false;
      if (activeInbox) return applyCustomFilters(conv, activeInbox);
      // Hide archived unless specifically filtering for them
      if (activeQuickFilter !== "archived" && conv.isArchived) return false;
      if (activeQuickFilter !== "closed" && activeQuickFilter !== "archived" && conv.status === "closed") return false;

      if (inboxMode === "email") {
        // Email inbox filters
        switch (activeQuickFilter) {
          case "inbox": {
            const hasAgent = conv.assignedTo && conv.assignedTo !== "غير معيّن";
            if (hasAgent && conv.lastMessageSender !== "customer") return false;
            break;
          }
          case "sent": {
            const hasAgent = conv.assignedTo && conv.assignedTo !== "غير معيّن";
            if (!hasAgent) return false;
            break;
          }
          case "unread": if (conv.unread <= 0) return false; break;
          case "read": if (conv.unread > 0) return false; break;
          case "mine": if (conv.assignedToId !== myId) return false; break;
          case "unassigned": if (conv.assignedTo && conv.assignedTo !== "غير معيّن") return false; break;
          case "closed": if (conv.status !== "closed") return false; break;
          case "archived": if (!conv.isArchived) return false; break;
        }
      } else {
        // WhatsApp inbox filters - exclude groups from non-group filters
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
      }
      if (agentFilter !== "all" && conv.assignedTo !== agentFilter) return false;
      if (channelFilter !== "all") {
        if (channelFilter === "meta_api" && conv.channelType !== "meta_api") return false;
        if (channelFilter === "evolution" && conv.channelType !== "evolution") return false;
        if (channelFilter === "email" && conv.conversationType !== "email") return false;
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

  const [fetchingEmails, setFetchingEmails] = useState(false);
  const handleFetchEmails = async () => {
    if (!orgId || fetchingEmails) return;
    setFetchingEmails(true);
    try {
      const { data: configs } = await supabase
        .from("email_configs")
        .select("id")
        .eq("org_id", orgId)
        .eq("is_active", true);
      if (!configs?.length) {
        toast.error("لا يوجد بريد مفعّل");
        return;
      }
      await Promise.all(configs.map(c =>
        supabase.functions.invoke("email-fetch-imap", { body: { config_id: c.id } })
      ));
      toast.success("تم جلب الوارد بنجاح");
    } catch {
      toast.error("فشل جلب الوارد");
    } finally {
      setFetchingEmails(false);
    }
  };

  return (
    <div className={cn(
      "flex flex-col bg-card border-l border-border/40",
      hasSelection ? "hidden md:flex md:w-[340px] lg:w-[370px]" : "w-full md:w-[340px] lg:w-[370px]"
    )}>
      {/* Header */}
      <div className="px-4 pt-5 pb-3 space-y-3 shrink-0 border-b border-border/30">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-foreground tracking-tight">
            {activeInbox ? activeInbox.name : inboxMode === "email" ? "صندوق الإيميل" : "صندوق الواتساب"}
          </h1>
          <div className="flex items-center gap-0.5">
            {inboxMode === "email" && (
              <button
                onClick={handleFetchEmails}
                disabled={fetchingEmails}
                className="w-9 h-9 rounded-xl border border-border/50 bg-background hover:bg-muted text-foreground/70 hover:text-foreground transition-all flex items-center justify-center disabled:opacity-50"
                title="جلب الوارد"
              >
                {fetchingEmails ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              </button>
            )}
            {onNewConversation && (
              <button
                onClick={onNewConversation}
                className="w-9 h-9 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center justify-center shadow-[0_2px_6px_hsl(var(--primary)/0.25)]"
                title="محادثة جديدة"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => { setEditingInbox(null); setBuilderOpen(true); }}
              className="w-9 h-9 rounded-xl border border-border/50 bg-background hover:bg-muted text-foreground/70 hover:text-foreground transition-all flex items-center justify-center"
              title="صندوق مخصص"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setBulkMode(!bulkMode); setBulkSelected(new Set()); }}
              className={cn("w-9 h-9 rounded-xl border transition-all flex items-center justify-center", bulkMode ? "bg-primary/10 text-primary border-primary/30" : "border-border/50 bg-background hover:bg-muted text-foreground/70 hover:text-foreground")}
              title="تحديد متعدد"
            >
              <CheckSquare className="w-4 h-4" />
            </button>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="w-9 h-9 rounded-xl border border-border/50 bg-background hover:bg-destructive/10 transition-all flex items-center justify-center" title="إعادة ضبط">
                <RotateCcw className="w-4 h-4 text-foreground/70" />
              </button>
            )}
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={cn("w-9 h-9 rounded-xl border transition-all relative flex items-center justify-center", showAdvancedFilters || hasActiveFilters ? "bg-primary/10 text-primary border-primary/30" : "border-border/50 bg-background hover:bg-muted text-foreground/70 hover:text-foreground")}
            >
              <Filter className="w-4 h-4" />
              {hasActiveFilters && <span className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-primary" />}
            </button>
          </div>
        </div>

        {/* Custom Inbox Chips */}
        {customInboxes.length > 0 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {customInboxes.map((inbox) => (
              <div key={inbox.id} className="flex items-center gap-0.5 group">
                <button
                  onClick={() => {
                    if (activeCustomInbox === inbox.id) setActiveCustomInbox(null);
                    else { setActiveCustomInbox(inbox.id); setActiveQuickFilter("all"); }
                  }}
                  className={cn(
                    "text-[11px] px-3.5 py-1.5 rounded-xl whitespace-nowrap font-semibold transition-all flex items-center gap-1.5 border",
                    activeCustomInbox === inbox.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border/50 hover:border-primary/30 hover:text-foreground"
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
                <button
                  onClick={() => deleteCustomInbox(inbox.id)}
                  className="hidden group-hover:flex p-0.5 rounded text-muted-foreground hover:text-destructive"
                  title="حذف الصندوق"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
          <Input
            placeholder="بحث..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10 bg-background border border-border/50 text-sm h-10 rounded-xl focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/40"
          />
        </div>
      </div>

      {/* Quick Filters - Compact chips in 2 rows */}
      <div className="shrink-0 px-3 py-2">
        <div className="flex flex-wrap gap-1.5">
          {quickFilters.map((qf) => {
            const isActive = activeQuickFilter === qf.id && !activeCustomInbox;
            return (
              <button
                key={qf.id}
                onClick={() => { setActiveQuickFilter(qf.id); setActiveCustomInbox(null); }}
                className={cn(
                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <qf.icon className="w-3 h-3 shrink-0" />
                <span>{qf.label}</span>
                {(qf.count ?? 0) > 0 && (
                  <span className={cn(
                    "text-[9px] min-w-[14px] h-[14px] rounded-full flex items-center justify-center font-bold px-0.5 shrink-0",
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-primary/10 text-primary"
                  )}>
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
                <SelectItem value="email">إيميل</SelectItem>
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
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 pt-1 pb-2 border-t border-primary/15">
        {activeQuickFilter === "groups" && filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center mb-3">
              <Users className="w-6 h-6 opacity-25" />
            </div>
            <p className="text-sm font-medium">لا توجد مجموعات</p>
            <p className="text-xs text-muted-foreground/60 mt-1 text-center px-4 leading-relaxed">
              القروبات متاحة فقط في قناة الواتساب غير الرسمية (QR).
              <br />
              القناة الرسمية (Meta API) لا تدعم المجموعات.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center mb-3">
              <MessageSquare className="w-6 h-6 opacity-25" />
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
          <div className="divide-y divide-primary/15">
          {filtered.map((conv) => {
            const isSelected = conv.id === selectedId;
            const countdown = conv.channelType === "meta_api" ? get24hCountdown(conv.lastCustomerMessageAt) : null;
            const displayName = getConversationDisplayName(conv);
            const hasUnread = conv.unread > 0;
            const hasMention = (conv.unreadMentionCount || 0) > 0;
            const waitTime = getWaitTime(conv);
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
                  "w-full text-right px-3 py-3 rounded-xl transition-all group relative border",
                  isSelected && !bulkMode
                    ? "bg-primary/[0.06] border-primary/20 shadow-[0_1px_6px_hsl(var(--primary)/0.08)]"
                    : "border-transparent hover:bg-card hover:border-border/40 hover:shadow-[0_1px_4px_rgba(0,0,0,0.04)]",
                  bulkMode && bulkSelected.has(conv.id) && "bg-primary/5 border-primary/15",
                  hasUnread && !isSelected && "bg-primary/[0.03]"
                )}
              >
                <div className="flex items-start gap-3">
                  {bulkMode && (
                    <div className="flex items-center pt-1.5 shrink-0">
                      {bulkSelected.has(conv.id) ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : (
                        <Square className="w-4 h-4 text-muted-foreground/30" />
                      )}
                    </div>
                  )}

                  {/* Avatar */}
                  <div className="relative shrink-0">
                    {conv.profilePic ? (
                      <img
                        src={conv.profilePic}
                        alt={displayName}
                        className={cn(
                          "w-11 h-11 rounded-full object-cover ring-2 transition-all",
                          isSelected ? "ring-primary/30" : "ring-border/20"
                        )}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                        }}
                      />
                    ) : null}
                    <div className={cn(
                      "w-11 h-11 rounded-full flex items-center justify-center text-[14px] font-semibold transition-all",
                      conv.profilePic ? "hidden" : "",
                      isSelected
                        ? "bg-primary/12 text-primary ring-2 ring-primary/20"
                        : "bg-muted text-muted-foreground ring-2 ring-border/20"
                    )}>
                      {conv.conversationType === "group" ? (
                        <Users className="w-4.5 h-4.5" />
                      ) : (
                        displayName.charAt(0)
                      )}
                    </div>
                    {hasUnread && (
                      <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0" style={{ writingMode: "horizontal-tb" }}>
                    <p className={cn(
                      "text-[13.5px] leading-tight flex items-center gap-1",
                      hasUnread ? "font-bold text-foreground" : "font-semibold text-foreground/80"
                    )} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", wordBreak: "normal", overflowWrap: "normal" }}>
                      {conv.isPinned && <Pin className="w-2.5 h-2.5 text-primary/50 shrink-0 rotate-45" />}
                      {conv.channelType === "meta_api" && <ShieldCheck className="w-3 h-3 text-primary shrink-0" />}
                      {conv.channelType === "email" && <Mail className="w-3 h-3 text-primary/60 shrink-0" />}
                      {conv.channelType === "evolution" && <Wifi className="w-3 h-3 text-warning/60 shrink-0" />}
                      <span className="truncate">{displayName}</span>
                    </p>
                    <p className={cn(
                      "text-[12px] truncate leading-snug mt-1",
                      hasUnread ? "text-foreground/65 font-medium" : "text-muted-foreground/60"
                    )} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", wordBreak: "normal", overflowWrap: "normal" }}>
                      {conv.lastMessage || (conv.conversationType === "group" ? "محادثة جماعية" : "لا توجد رسائل بعد")}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      {conv.channelType === "meta_api" ? (
                        <span className="text-[8px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded leading-none">Meta</span>
                      ) : conv.channelType === "evolution" ? (
                        <span className="text-[8px] font-bold text-warning bg-warning/10 px-1.5 py-0.5 rounded leading-none">QR</span>
                      ) : (conv.channelType === "email" || conv.conversationType === "email") ? (
                        <span className="text-[8px] font-bold text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded leading-none">Email</span>
                      ) : conv.conversationType === "group" ? (
                        <span className="text-[8px] font-bold text-accent-foreground bg-accent px-1.5 py-0.5 rounded leading-none">قروب</span>
                      ) : conv.conversationType === "broadcast" ? (
                        <span className="text-[8px] font-bold text-accent-foreground bg-accent px-1.5 py-0.5 rounded leading-none">قائمة</span>
                      ) : (
                        <span className="text-[8px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded leading-none">واتساب</span>
                      )}
                      {conv.channelName && conv.channelName.trim() && (
                        <span className="text-[9px] text-muted-foreground/80 truncate max-w-[90px] font-medium">
                          {conv.channelName}
                        </span>
                      )}
                      {conv.assignedTo && conv.assignedTo !== "غير معيّن" && (
                        <>
                          <span className="text-[9px] text-muted-foreground/30">•</span>
                          <span className="text-[10px] text-primary/60 leading-none truncate max-w-[80px] font-medium">
                            {conv.assignedTo.split(" ")[0]}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="flex flex-col items-start gap-1.5 shrink-0 pt-0.5 min-w-[50px]">
                    <span className={cn(
                      "text-[10.5px] leading-none",
                      hasUnread ? "text-primary font-bold" : "text-muted-foreground/45"
                    )}>
                      {conv.timestamp}
                    </span>
                    <div className="flex items-center gap-1">
                      {waitTime && (
                        <span className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 leading-none",
                          waitTime.urgency === "critical" ? "bg-destructive/15 text-destructive" :
                          waitTime.urgency === "warning" ? "bg-warning/15 text-warning" :
                          "bg-muted text-muted-foreground"
                        )} title="وقت انتظار العميل">
                          <Clock className="w-2.5 h-2.5" />
                          {waitTime.text}
                        </span>
                      )}
                      {conv.sentiment === "negative" && (
                        <span className="w-[20px] h-[20px] rounded-full bg-destructive/15 text-destructive text-[10px] flex items-center justify-center" title="عميل غير راضٍ">😠</span>
                      )}
                      {conv.sentiment === "positive" && (
                        <span className="w-[20px] h-[20px] rounded-full bg-emerald-500/15 text-[10px] flex items-center justify-center" title="عميل راضٍ">😊</span>
                      )}
                      {hasUnread && (
                        <span className="min-w-[20px] h-[20px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1.5 shadow-[0_1px_4px_hsl(var(--primary)/0.3)]">
                          {conv.unread}
                        </span>
                      )}
                      {hasMention && (
                        <span className="w-[20px] h-[20px] rounded-full bg-accent text-accent-foreground text-[9px] font-bold flex items-center justify-center">@</span>
                      )}
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

