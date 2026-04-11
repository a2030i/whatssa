import { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { MessageSquare, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSearchParams } from "react-router-dom";
import { Conversation, Message } from "@/data/mockData";
import { supabase, invokeCloud } from "@/lib/supabase";
import ConversationList from "@/components/inbox/ConversationList";
import ChatArea from "@/components/inbox/ChatArea";
import CustomerInfoPanel from "@/components/inbox/CustomerInfoPanel";
import NewConversationDialog from "@/components/inbox/NewConversationDialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "sonner";
import { buildTemplateComponents, mapMetaTemplate, type WhatsAppTemplate } from "@/types/whatsapp";

const TYPING_TIMEOUT = 3000;
const SENTIMENT_ANALYSIS_INTERVAL = 5; // Analyze every N customer messages
const MESSAGE_RESYNC_INTERVAL = 4000;
const sentimentCounters = new Map<string, number>();

const sortMessagesByCreatedAt = (messages: Message[]) =>
  [...messages].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (aTime === bTime) return a.id.localeCompare(b.id);
    return aTime - bTime;
  });

const isReactionPlaceholderMessage = (message: Pick<Message, "type" | "text">) => {
  const normalizedText = typeof message.text === "string" ? message.text.trim().toLowerCase() : "";
  return message.type === "reaction" || normalizedText === "[reaction]";
};

const triggerSentimentAnalysis = async (conversationId: string, orgId: string) => {
  const count = (sentimentCounters.get(conversationId) || 0) + 1;
  sentimentCounters.set(conversationId, count);
  if (count % SENTIMENT_ANALYSIS_INTERVAL !== 0) return;

  try {
    // Fetch last 10 messages for context
    const { data: msgs } = await supabase
      .from("messages")
      .select("content, sender")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (!msgs || msgs.length < 3) return;

    const messagesText = msgs.reverse().map((m: any) =>
      `${m.sender === "customer" ? "العميل" : "الموظف"}: ${m.content}`
    ).join("\n");

    invokeCloud("analyze-sentiment", {
      body: { conversation_id: conversationId, messages_text: messagesText, org_id: orgId },
    }).catch(e => console.error("Sentiment analysis failed:", e));
  } catch (e) {
    console.error("Sentiment trigger error:", e);
  }
};

const getSendFunction = (channelType?: string, conversationType?: string): string => {
  if (channelType === "email" || conversationType === "email") return "email-send";
  if (channelType === "meta_api") return "whatsapp-send";
  if (channelType === "evolution") return "evolution-send";
  // IMPORTANT: If channelType is unknown/undefined, we must NOT default blindly.
  // Return empty string — caller must resolve channel_type from DB first.
  return "";
};

/** Resolve channel_type from DB when it's missing on the conversation object */
const resolveChannelType = async (channelId?: string): Promise<string | null> => {
  if (!channelId) return null;
  const { data } = await supabase
    .from("whatsapp_config_safe")
    .select("channel_type")
    .eq("id", channelId)
    .maybeSingle();
  return data?.channel_type || null;
};

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
  return date.toLocaleDateString("ar-SA-u-ca-gregory");
};

interface InboxPageProps {
  inboxMode?: "whatsapp" | "email";
}

const InboxPage = ({ inboxMode = "whatsapp" }: InboxPageProps) => {
  const { orgId, profile, userRole, teamId, isSupervisor, isSuperAdmin, isLoading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [allMessages, setAllMessages] = useState<Record<string, Message[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("conversation"));
  const [scrollToMessageId, setScrollToMessageId] = useState<string | null>(searchParams.get("message"));
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [mobileCustomerInfoOpen, setMobileCustomerInfoOpen] = useState(false);
  const [desktopInfoOpen, setDesktopInfoOpen] = useState(false);
  const selectedIdRef = useRef<string | null>(null);
  const deepLinkApplied = useRef(false);
  const fetchConversationsRef = useRef<(() => Promise<void>) | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  const lateAlertShownRef = useRef<Set<string>>(new Set());
  const slaThresholdMsRef = useRef<number>(10 * 60 * 1000); // default 10 min, updated from DB

  // Load SLA policy threshold from DB once
  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("sla_policies")
      .select("first_response_minutes")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("first_response_minutes", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.first_response_minutes) {
          slaThresholdMsRef.current = data.first_response_minutes * 60 * 1000;
        }
      });
  }, [orgId]);

  // Late response alert — check every 60s for conversations waiting beyond SLA threshold
  useEffect(() => {
    const checkLateResponses = () => {
      const now = Date.now();
      conversationsRef.current.forEach(conv => {
        if (conv.status === "closed" || conv.lastMessageSender !== "customer" || !conv.lastCustomerMessageAt) return;
        const elapsed = now - new Date(conv.lastCustomerMessageAt).getTime();
        if (elapsed >= slaThresholdMsRef.current && !lateAlertShownRef.current.has(conv.id)) {
          lateAlertShownRef.current.add(conv.id);
          const mins = Math.floor(elapsed / 60000);
          toast.warning(`⏱️ ${conv.customerName || conv.customerPhone} ينتظر رد منذ ${mins} دقيقة`, {
            duration: 8000,
            action: { label: "فتح", onClick: () => setSelectedId(conv.id) },
          });
        }
      });
    };
    const interval = setInterval(checkLateResponses, 60000);
    const timeout = setTimeout(checkLateResponses, 5000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, []);

  const isMobile = useIsMobile();

  // Sync URL when selectedId changes
  useEffect(() => {
    const current = searchParams.get("conversation");
    if (selectedId && selectedId !== current) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set("conversation", selectedId);
        return next;
      }, { replace: true });
    } else if (!selectedId && current) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete("conversation");
        return next;
      }, { replace: true });
    }
  }, [selectedId]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Listen for linked conversation navigation
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.conversationId) setSelectedId(detail.conversationId);
    };
    window.addEventListener("navigate-conversation", handler);
    return () => window.removeEventListener("navigate-conversation", handler);
  }, []);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    if (authLoading || !orgId) {
      setTemplates([]);
      return;
    }

    const loadTemplates = async () => {
      const { data: metaConfig } = await supabase
        .from("whatsapp_config_safe")
        .select("id")
        .eq("org_id", orgId)
        .eq("channel_type", "meta_api")
        .eq("is_connected", true)
        .limit(1)
        .maybeSingle();

      if (!metaConfig) {
        setTemplates([]);
        return;
      }

      const { data, error } = await invokeCloud("whatsapp-templates", {
        body: { action: "list_all" },
      });

      if (!error && !data?.error) {
        setTemplates((data?.templates || []).map(mapMetaTemplate));
      }
    };

    loadTemplates();
  }, [orgId, authLoading]);

  useEffect(() => {
    if (authLoading) return; // Wait for auth to fully settle before fetching
    if (!orgId) {
      setConversations([]);
      setAllMessages({});
      setSelectedId(null);
      setLoading(false);
      return;
    }

    let active = true;
    const currentOrgId = orgId;

    setLoading(true);
    setConversations([]);
    setAllMessages({});
    // Preserve deep link selection on first load
    if (!deepLinkApplied.current && searchParams.get("conversation")) {
      // keep selectedId from URL
    } else {
      setSelectedId(null);
    }

    const fetchConversations = async () => {
      // Fetch conversations and channel configs in parallel
      // Try with channel_label first; if it fails (column missing on external DB), retry without it
      const convPromise = supabase
        .from("conversations")
        .select("*")
        .eq("org_id", currentOrgId)
        .order("last_message_at", { ascending: false })
        .limit(500);

      let channelPromise = supabase
        .from("whatsapp_config_safe")
        .select("id, display_phone, business_name, channel_label, channel_type, evolution_instance_name, default_team_id, default_agent_id")
        .eq("org_id", currentOrgId);

      const [convRes, channelRes1] = await Promise.all([convPromise, channelPromise]);

      let channelRes: { data: any[] | null; error: any } = channelRes1;
      // Fallback: if channel_label column doesn't exist, retry without it
      if (channelRes1.error && channelRes1.error.message?.includes("channel_label")) {
        console.warn("[INBOX] channel_label missing, retrying without it");
        channelRes = await supabase
          .from("whatsapp_config_safe")
          .select("id, display_phone, business_name, channel_type, evolution_instance_name, default_team_id, default_agent_id")
          .eq("org_id", currentOrgId) as any;
      }

      const { data, error } = convRes;

      if (!active) return;

      if (error) {
        console.error("Error fetching conversations:", error);
        setLoading(false);
        return;
      }

      const channelConfigs = channelRes.data || [];
      const channelMap = new Map(channelConfigs.map((c: any) => [c.id, c]));

      // Build accessible channel set for the current member
      const isRegularMember = userRole === "member" && !isSupervisor && !isSuperAdmin;
      const myId = profile?.id;
      const myTeamIds: string[] = Array.isArray(profile?.team_ids) && profile.team_ids.length > 0
        ? profile.team_ids
        : profile?.team_id ? [profile.team_id] : [];

      const accessibleChannelIds = new Set<string>();
      for (const ch of channelConfigs) {
        if (!isRegularMember) {
          accessibleChannelIds.add(ch.id); // admin/supervisor see all
        } else if (ch.default_agent_id === myId) {
          accessibleChannelIds.add(ch.id);
        } else if (ch.default_team_id && myTeamIds.includes(ch.default_team_id)) {
          accessibleChannelIds.add(ch.id);
        } else if (!ch.default_team_id && !ch.default_agent_id) {
          accessibleChannelIds.add(ch.id); // No routing = accessible to all
        }
      }

      let filteredData = data || [];
      // For regular members, also load explicitly granted group access
      let grantedGroupIds = new Set<string>();
      if (isRegularMember && profile) {
        const { data: groupAccess, error: gaErr } = await supabase
          .from("employee_group_access")
          .select("conversation_id")
          .eq("profile_id", myId);
        console.log("[INBOX] employee_group_access query:", { myId, groupAccess, gaErr, isRegularMember });
        grantedGroupIds = new Set((groupAccess || []).map((g: any) => g.conversation_id));

        const beforeCount = filteredData.length;
        const groupConvs = filteredData.filter((c: any) => c.conversation_type === "group");
        console.log("[INBOX] groups in raw data:", groupConvs.length, "granted:", [...grantedGroupIds]);

        filteredData = filteredData.filter((conv: any) => {
          // Explicitly granted group access
          if (grantedGroupIds.has(conv.id)) return true;
          if (conv.assigned_to_id === myId) return true;
          if (conv.assigned_team_id && myTeamIds.includes(conv.assigned_team_id)) return true;
          if (!conv.channel_id) return true;
          return accessibleChannelIds.has(conv.channel_id);
        });
        console.log("[INBOX] filtered:", beforeCount, "->", filteredData.length, "groups after filter:", filteredData.filter((c: any) => c.conversation_type === "group").length);
      }

      const mapped: Conversation[] = (filteredData).map((conversation: any) => {
        const channelConfig = conversation.channel_id ? channelMap.get(conversation.channel_id) : null;
        const channelType = conversation.conversation_type === "email" ? "email" as const :
          channelConfig?.channel_type === "evolution" ? "evolution" : 
          channelConfig?.channel_type === "meta_api" ? "meta_api" : undefined;

        return {
          id: conversation.id,
          customerName: conversation.customer_name || conversation.customer_phone,
          customerPhone: conversation.customer_phone,
          lastMessage: conversation.last_message || "",
          timestamp: formatTimestamp(conversation.last_message_at),
          unread: conversation.unread_count || 0,
          assignedTo: conversation.assigned_to || "غير معيّن",
          assignedToId: conversation.assigned_to_id || undefined,
          assignedTeam: conversation.assigned_team || undefined,
          assignedTeamId: conversation.assigned_team_id || undefined,
          status: (conversation.status as "active" | "waiting" | "closed") || "active",
          tags: conversation.tags || [],
          notes: conversation.notes || "",
          lastCustomerMessageAt: conversation.last_message_at || undefined,
          firstResponseAt: conversation.first_response_at || undefined,
          conversationType: (conversation.conversation_type as "private" | "group" | "broadcast" | "email") || "private",
          channelType,
          channelId: conversation.channel_id || undefined,
          channelName: channelConfig ? (channelConfig.channel_label || channelConfig.business_name || channelConfig.display_phone || channelConfig.evolution_instance_name || "") : undefined,
          profilePic: conversation.customer_profile_pic || undefined,
          unreadMentionCount: conversation.unread_mention_count || 0,
          isPinned: conversation.is_pinned || false,
          isArchived: conversation.is_archived || false,
          dedicatedAgentId: conversation.dedicated_agent_id || null,
          lastMessageSender: (conversation as any).last_message_sender || null,
          sentiment: conversation.sentiment || null,
          sentimentScore: conversation.sentiment_score || null,
          closedBy: conversation.closed_by || null,
        };
      });

      // Load blocked numbers for this org
      const { data: blockedNumbers } = await supabase
        .from("blacklisted_numbers")
        .select("phone")
        .eq("org_id", currentOrgId);
      const blockedSet = new Set((blockedNumbers || []).map((b: any) => b.phone));
      mapped.forEach(conv => {
        if (blockedSet.has(conv.customerPhone)) conv.isBlocked = true;
      });

      // Team-based visibility filtering
      const isAdmin = userRole === "admin" || isSuperAdmin;
      const myTeamIdsList: string[] = Array.isArray(profile?.team_ids) && profile.team_ids.length > 0
        ? profile.team_ids
        : profile?.team_id ? [profile.team_id] : [];
      const filtered = isAdmin ? mapped : mapped.filter(conv => {
        // Granted group access always visible
        if (grantedGroupIds.has(conv.id)) return true;

        // No team assigned to user → show all (legacy behavior)
        if (myTeamIdsList.length === 0 && !teamId) return true;

        // Always show conversations assigned directly to this member
        if (conv.assignedToId === profile?.id) return true;
        if (conv.dedicatedAgentId === profile?.id) return true;

        // Show conversations assigned to any of my teams (all members see team conversations)
        const effectiveTeamIds = myTeamIdsList.length > 0 ? myTeamIdsList : (teamId ? [teamId] : []);
        if (conv.assignedTeamId && effectiveTeamIds.includes(conv.assignedTeamId)) return true;

        // Unassigned conversations — only if channel is routed to me/my team or has no routing
        if (!conv.assignedTeamId && !conv.assignedToId) {
          if (!conv.channelId) return true; // No channel = visible
          return accessibleChannelIds.has(conv.channelId);
        }

        // Closed conversations: show if closed by this member OR belongs to accessible channel
        if (conv.status === "closed") {
          if (conv.closedBy === profile?.id) return true;
          if (conv.channelId && accessibleChannelIds.has(conv.channelId)) return true;
          return false;
        }

        return false;
      });

      // Filter by inbox mode (whatsapp vs email)
      const modeFiltered = filtered.filter(conv => {
        if (inboxMode === "email") return conv.conversationType === "email";
        // whatsapp mode: exclude email conversations
        return conv.conversationType !== "email";
      });

      // Zero out unread for the currently viewed conversation
      const activeId = selectedIdRef.current;
      if (activeId) {
        const activeConv = modeFiltered.find(c => c.id === activeId);
        if (activeConv && activeConv.unread > 0) {
          activeConv.unread = 0;
          supabase.from("conversations").update({ unread_count: 0 }).eq("id", activeId).then();
        }
        if (activeConv && (activeConv.unreadMentionCount || 0) > 0) {
          activeConv.unreadMentionCount = 0;
          supabase.from("conversations").update({ unread_mention_count: 0 }).eq("id", activeId).then();
        }
      }

      setConversations(modeFiltered);
      // On first load, honour deep link; otherwise auto-select first
      if (!deepLinkApplied.current) {
        deepLinkApplied.current = true;
        const urlConvId = searchParams.get("conversation");
        if (urlConvId && modeFiltered.some(c => c.id === urlConvId)) {
          setSelectedId(urlConvId);
        } else if (!isMobile && modeFiltered.length > 0) {
          setSelectedId(modeFiltered[0].id);
        }
      } else if (!isMobile && modeFiltered.length > 0) {
        setSelectedId((prev) => (prev && modeFiltered.some((item) => item.id === prev) ? prev : modeFiltered[0].id));
      }
      setLoading(false);
    };

    fetchConversationsRef.current = fetchConversations;

    fetchConversations();

    const conversationsChannel = supabase
      .channel(`conversations-changes-${currentOrgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `org_id=eq.${currentOrgId}` }, () => {
        void fetchConversations();
      })
      .subscribe();

    const channelsChannel = supabase
      .channel(`whatsapp-config-changes-${currentOrgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_config", filter: `org_id=eq.${currentOrgId}` }, () => {
        void fetchConversations();
      })
      .subscribe();

    const handleWindowRefresh = () => {
      if (document.visibilityState === "visible") {
        void fetchConversations();
      }
    };

    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchConversations();
      }
    }, 12000);

    window.addEventListener("focus", handleWindowRefresh);
    document.addEventListener("visibilitychange", handleWindowRefresh);

    return () => {
      active = false;
      fetchConversationsRef.current = null;
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", handleWindowRefresh);
      document.removeEventListener("visibilitychange", handleWindowRefresh);
      supabase.removeChannel(conversationsChannel);
      supabase.removeChannel(channelsChannel);
    };
  }, [orgId, authLoading, inboxMode]);

  useEffect(() => {
    if (!selectedId) return;

    let active = true;
    const currentConversationId = selectedId;

    const fetchMessages = async () => {
      // Fetch messages and email details in parallel
      const conv = conversationsRef.current.find(c => c.id === currentConversationId);
      const isEmailConv = conv?.channelType === "email" || conv?.conversationType === "email";

      const [msgResult, emailDetailsResult] = await Promise.all([
        supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", currentConversationId)
          .order("created_at", { ascending: true }),
        isEmailConv
          ? supabase
              .from("email_message_details" as any)
              .select("*")
              .eq("conversation_id", currentConversationId)
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (!active) return;

      if (msgResult.error) {
        console.error("Error fetching messages:", msgResult.error);
        return;
      }

      // Build a map of message_id -> email details for quick lookup
      const emailDetailsMap = new Map<string, any>();
      if (emailDetailsResult.data && Array.isArray(emailDetailsResult.data)) {
        for (const d of emailDetailsResult.data) {
          emailDetailsMap.set(d.message_id, d);
        }
      }

      const mapped: Message[] = (msgResult.data || []).map((message) => {
        // Try email_message_details first, fallback to metadata
        const detail = emailDetailsMap.get(message.id);
        const meta = message.metadata as any;
        const hasEmailData = detail || meta?.email_subject;

        return {
          id: message.id,
          conversationId: message.conversation_id,
          text: message.content,
          sender: message.sender as "customer" | "agent" | "system",
          timestamp: new Date(message.created_at || "").toLocaleTimeString("ar-SA-u-ca-gregory", { hour: "2-digit", minute: "2-digit" }),
          status: message.status as "sent" | "delivered" | "read" | undefined,
          type: (message.message_type as Message["type"]) || "text",
          mediaUrl: message.media_url || undefined,
          senderName: meta?.sender_name || undefined,
          senderJid: meta?.participant || undefined,
          senderPhone: meta?.sender_pn || undefined,
          quoted: meta?.quoted || undefined,
          mentioned: meta?.mentioned || undefined,
          waMessageId: message.wa_message_id || undefined,
          reactions: meta?.reactions || undefined,
          location: meta?.location || undefined,
          contacts: meta?.contacts || undefined,
          editedAt: meta?.edited_at || undefined,
          editedBy: meta?.edited_by || undefined,
          isDeleted: meta?.is_deleted || false,
          deletedBy: meta?.deleted_by || undefined,
          poll: meta?.poll || undefined,
          createdAt: message.created_at || undefined,
          readBy: meta?.read_by || undefined,
          groupSize: meta?.group_size || undefined,
          emailMeta: hasEmailData ? {
            subject: detail?.email_subject || meta?.email_subject,
            from: detail?.email_from || meta?.email_from,
            fromName: detail?.email_from_name || meta?.email_from_name,
            to: detail?.email_to || meta?.email_to,
            cc: detail?.email_cc || meta?.email_cc,
            bcc: detail?.email_bcc || meta?.email_bcc,
            messageId: detail?.email_message_id || meta?.email_message_id,
            attachments: detail?.email_attachments || (meta?.email_attachments ? meta.email_attachments.map((f: string) => ({ filename: f })) : undefined),
            direction: detail?.direction || (message.sender === "customer" ? "inbound" : "outbound"),
          } : undefined,
        };
      }).filter((m) => !isReactionPlaceholderMessage(m));

      setAllMessages((prev) => {
        const existing = prev[currentConversationId] || [];
        const optimistic = existing.filter((message) => message.id.startsWith("optimistic-"));
        const unresolvedOptimistic = optimistic.filter((optimisticMessage) => {
          return !mapped.some((dbMessage) =>
            dbMessage.id === optimisticMessage.id ||
            (optimisticMessage.sender === "agent" && dbMessage.sender === "agent" && (
              dbMessage.text === optimisticMessage.text ||
              (optimisticMessage.type === "audio" && dbMessage.type === "audio")
            ))
          );
        });

        return {
          ...prev,
          [currentConversationId]: sortMessagesByCreatedAt([...mapped, ...unresolvedOptimistic]),
        };
      });
    };

    void fetchMessages();

    const channel = supabase
      .channel(`messages-${currentConversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${currentConversationId}` }, (payload) => {
        const message = payload.new as any;
        const newMessage: Message = {
          id: message.id,
          conversationId: message.conversation_id,
          text: message.content,
          sender: message.sender,
          timestamp: new Date(message.created_at || "").toLocaleTimeString("ar-SA-u-ca-gregory", { hour: "2-digit", minute: "2-digit" }),
          status: message.status,
          type: message.message_type || "text",
          mediaUrl: message.media_url || undefined,
          senderName: message.metadata?.sender_name || undefined,
          senderJid: message.metadata?.participant || undefined,
          senderPhone: message.metadata?.sender_pn || undefined,
          quoted: message.metadata?.quoted || undefined,
          mentioned: message.metadata?.mentioned || undefined,
          waMessageId: message.wa_message_id || undefined,
          reactions: message.metadata?.reactions || undefined,
          location: message.metadata?.location || undefined,
          contacts: message.metadata?.contacts || undefined,
          editedAt: message.metadata?.edited_at || undefined,
          editedBy: message.metadata?.edited_by || undefined,
          isDeleted: message.metadata?.is_deleted || false,
          deletedBy: message.metadata?.deleted_by || undefined,
          poll: message.metadata?.poll || undefined,
          createdAt: message.created_at || undefined,
          readBy: message.metadata?.read_by || undefined,
          groupSize: message.metadata?.group_size || undefined,
          emailMeta: message.metadata?.email_subject ? {
            subject: message.metadata?.email_subject,
            from: message.metadata?.email_from,
            fromName: message.metadata?.email_from_name,
            to: message.metadata?.email_to,
            cc: message.metadata?.email_cc,
            bcc: message.metadata?.email_bcc,
            messageId: message.metadata?.email_message_id,
            attachments: message.metadata?.email_attachments
              ? (Array.isArray(message.metadata.email_attachments)
                ? message.metadata.email_attachments.map((f: any) => typeof f === "string" ? { filename: f } : f)
                : undefined)
              : undefined,
            direction: message.sender === "customer" ? "inbound" : "outbound",
          } : undefined,
        };
        // Skip reaction placeholder rows — reactions are shown as badges on the original message
        if (isReactionPlaceholderMessage(newMessage)) return;
        setAllMessages((prev) => ({
          ...prev,
          [currentConversationId]: (prev[currentConversationId] || []).some((m) => m.id === newMessage.id)
            ? sortMessagesByCreatedAt((prev[currentConversationId] || []).map((m) => m.id === newMessage.id ? newMessage : m))
            : // Replace matching optimistic message (text match or audio type match)
              (() => {
                const withoutOptimistic = (prev[currentConversationId] || []).filter((m) =>
                  !(m.id.startsWith("optimistic-") && m.sender === "agent" && (
                    m.text === newMessage.text ||
                    newMessage.text?.includes(m.text) ||
                    (m.type === "audio" && newMessage.type === "audio")
                  ))
                );
                return sortMessagesByCreatedAt([...withoutOptimistic, newMessage]);
              })(),
        }));

        // Trigger sentiment analysis for customer messages
        if (message.sender === "customer" && orgId) {
          triggerSentimentAnalysis(currentConversationId, orgId);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${currentConversationId}` }, (payload) => {
        const updated = payload.new as any;
        setAllMessages((prev) => ({
          ...prev,
          [currentConversationId]: sortMessagesByCreatedAt((prev[currentConversationId] || []).map((m) => {
            const isMatch = m.id === updated.id || (m.waMessageId && m.waMessageId === updated.wa_message_id);
            if (!isMatch) return m;
            return {
              ...m,
              text: updated.content || m.text,
              status: updated.status as any,
              reactions: updated.metadata?.reactions || m.reactions,
              editedAt: updated.metadata?.edited_at || m.editedAt,
              editedBy: updated.metadata?.edited_by || m.editedBy,
              isDeleted: updated.metadata?.is_deleted || false,
              deletedBy: updated.metadata?.deleted_by || m.deletedBy,
              readBy: updated.metadata?.read_by || m.readBy,
              groupSize: updated.metadata?.group_size || m.groupSize,
            };
          })),
        }));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void fetchMessages();
        }
      });

    const conversationSyncChannel = supabase
      .channel(`conversation-sync-${currentConversationId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${currentConversationId}` }, () => {
        void fetchMessages();
      })
      .subscribe();

    const handleMessagesRefresh = () => {
      if (document.visibilityState === "visible") {
        void fetchMessages();
      }
    };

    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchMessages();
      }
    }, MESSAGE_RESYNC_INTERVAL);

    window.addEventListener("focus", handleMessagesRefresh);
    document.addEventListener("visibilitychange", handleMessagesRefresh);

    return () => {
      active = false;
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", handleMessagesRefresh);
      document.removeEventListener("visibilitychange", handleMessagesRefresh);
      supabase.removeChannel(channel);
      supabase.removeChannel(conversationSyncChannel);
    };
  }, [selectedId]);

  // Listen for optimistic reaction updates from ChatArea
  useEffect(() => {
    const handler = (e: Event) => {
      const { messageId, emoji } = (e as CustomEvent).detail;
      setAllMessages((prev) => {
        const updated: Record<string, Message[]> = {};
        for (const [convId, msgs] of Object.entries(prev)) {
          updated[convId] = msgs.map((m) => {
            if (m.id !== messageId) return m;
            const reactions = [...(m.reactions || [])];
            const idx = reactions.findIndex((r) => r.fromMe === true);
            if (idx >= 0) {
              reactions[idx] = { emoji, fromMe: true, timestamp: new Date().toISOString() };
            } else {
              reactions.push({ emoji, fromMe: true, timestamp: new Date().toISOString() });
            }
            return { ...m, reactions };
          });
        }
        return updated;
      });
    };
    window.addEventListener("optimistic-reaction", handler);
    return () => window.removeEventListener("optimistic-reaction", handler);
  }, []);

  // Listen for reaction rollback (when API call fails)
  useEffect(() => {
    const handler = (e: Event) => {
      const { messageId } = (e as CustomEvent).detail;
      setAllMessages((prev) => {
        const updated: Record<string, Message[]> = {};
        for (const [convId, msgs] of Object.entries(prev)) {
          updated[convId] = msgs.map((m) => {
            if (m.id !== messageId) return m;
            // Remove the agent's optimistic reaction (fromMe === true)
            const reactions = (m.reactions || []).filter((r) => r.fromMe !== true);
            return { ...m, reactions: reactions.length > 0 ? reactions : undefined };
          });
        }
        return updated;
      });
    };
    window.addEventListener("optimistic-reaction-rollback", handler);
    return () => window.removeEventListener("optimistic-reaction-rollback", handler);
  }, []);

  // Listen for optimistic messages (voice, etc.) from ChatArea
  useEffect(() => {
    const addHandler = (e: Event) => {
      const { conversationId, message } = (e as CustomEvent).detail;
      setAllMessages((prev) => ({
        ...prev,
        [conversationId]: [...(prev[conversationId] || []), message as Message],
      }));
      // Update conversation list preview
      setConversations((prev) => prev.map((c) =>
        c.id === conversationId ? { ...c, lastMessage: "🎤 رسالة صوتية", lastMessageTime: "الآن" } : c
      ));
    };
    const failHandler = (e: Event) => {
      const { conversationId, messageId } = (e as CustomEvent).detail;
      setAllMessages((prev) => ({
        ...prev,
        [conversationId]: (prev[conversationId] || []).map((m) =>
          m.id === messageId ? { ...m, status: "failed" as any } : m
        ),
      }));
    };
    window.addEventListener("optimistic-message", addHandler);
    window.addEventListener("optimistic-message-failed", failHandler);
    return () => {
      window.removeEventListener("optimistic-message", addHandler);
      window.removeEventListener("optimistic-message-failed", failHandler);
    };
  }, []);

  // Listen for email attachment sends from ChatArea
  useEffect(() => {
    const handler = async (e: Event) => {
      const { conversationId, text, attachment } = (e as CustomEvent).detail;
      const conversation = conversations.find((c) => c.id === conversationId);
      if (!conversation) return;

      // Optimistic message
      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMsg: Message = {
        id: optimisticId,
        conversationId,
        text: `📎 ${attachment.filename}${text && text !== `📎 ${attachment.filename}` ? `\n${text}` : ""}`,
        sender: "agent",
        timestamp: new Date().toLocaleTimeString("ar-SA-u-ca-gregory", { hour: "2-digit", minute: "2-digit" }),
        status: "sent",
        type: "text",
        createdAt: new Date().toISOString(),
        senderName: profile?.full_name || "النظام",
      };
      setAllMessages((prev) => ({
        ...prev,
        [conversationId]: [...(prev[conversationId] || []), optimisticMsg],
      }));

      const { data, error } = await invokeCloud("email-send", {
        body: {
          to: conversation.customerPhone,
          subject: text || `📎 ${attachment.filename}`,
          body: text || `📎 ${attachment.filename}`,
          conversation_id: conversationId,
          attachments: [attachment],
        },
      });

      if (error || data?.error) {
        toast.error(data?.error || "فشل إرسال المرفق");
        setAllMessages((prev) => ({
          ...prev,
          [conversationId]: (prev[conversationId] || []).filter((m) => m.id !== optimisticId),
        }));
      } else {
        toast.success("تم إرسال المرفق بنجاح");
      }
    };
    window.addEventListener("email-send-attachment", handler);
    return () => window.removeEventListener("email-send-attachment", handler);
  }, [conversations, profile]);

  // Listen for email recipient overrides
  const emailOverridesRef = useRef<{ to?: string; cc?: string } | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      emailOverridesRef.current = { to: detail.to, cc: detail.cc };
      setTimeout(() => { emailOverridesRef.current = null; }, 2000);
    };
    window.addEventListener("email-override-recipients", handler);
    return () => window.removeEventListener("email-override-recipients", handler);
  }, []);

  useEffect(() => {
    if (!selectedId) return;

    const conversation = conversations.find((item) => item.id === selectedId);
    if (!conversation || conversation.channelType !== "evolution") return;

    const pendingMessages = (allMessages[selectedId] || []).filter(
      (message) => message.sender === "agent" && message.waMessageId && message.status !== "read"
    );

    if (pendingMessages.length === 0) return;

    const timer = window.setTimeout(() => {
      invokeCloud("evolution-manage", {
        body: {
          action: "sync_message_statuses",
          phone: conversation.customerPhone,
          channel_id: conversation.channelId,
          messages: pendingMessages.map((message) => ({
            message_id: message.waMessageId,
            status: message.status,
          })),
        },
      }).catch(() => {});
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [selectedId, allMessages, conversations]);

  // Send read receipts when the latest customer message is available
  const lastReadMessageRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId || !orgId) return;

    const conv = conversations.find(c => c.id === selectedId);
    if (!conv) return;

    const msgs = allMessages[selectedId];
    if (!msgs || msgs.length === 0) return;

    const customerMsgs = msgs.filter(m => m.sender === "customer" && m.waMessageId);
    if (customerMsgs.length === 0) return;

    const lastMsg = customerMsgs[customerMsgs.length - 1];
    if (!lastMsg?.waMessageId) return;

    // Avoid duplicates for the same latest incoming WhatsApp message,
    // while still allowing retry after messages finish loading.
    if (lastReadMessageRef.current === lastMsg.waMessageId) return;

    if (conv.channelType === "meta_api") {
      lastReadMessageRef.current = lastMsg.waMessageId;
      invokeCloud("whatsapp-catalog", {
        body: { action: "mark_read", message_id: lastMsg.waMessageId, org_id: orgId, channel_id: conv.channelId },
      }).catch(() => {
        if (lastReadMessageRef.current === lastMsg.waMessageId) {
          lastReadMessageRef.current = null;
        }
      });
    } else {
      // Evolution: send read receipts for recent customer messages
      const unreadKeys = customerMsgs
        .slice(-20)
        .map(m => ({
          remoteJid: conv.customerPhone.includes("@") ? conv.customerPhone : `${conv.customerPhone}@s.whatsapp.net`,
          fromMe: false,
          id: m.waMessageId!,
        }));

      if (unreadKeys.length > 0) {
        lastReadMessageRef.current = lastMsg.waMessageId;
        invokeCloud("evolution-manage", {
          body: { action: "read_messages", messages: unreadKeys, channel_id: conv.channelId },
        }).catch(() => {
          if (lastReadMessageRef.current === lastMsg.waMessageId) {
            lastReadMessageRef.current = null;
          }
        });
      }
    }
  }, [selectedId, allMessages, conversations, orgId]);

  const selected = conversations.find((conversation) => conversation.id === selectedId) || null;
  const currentMessages = selectedId
    ? (allMessages[selectedId] || []).filter((message) => !isReactionPlaceholderMessage(message))
    : [];

  const handleSendMessage = useCallback(async (convId: string, text: string, type: "text" | "note" = "text", replyTo?: { id: string; waMessageId?: string; senderName?: string; text: string }, mentionedJids?: string[]) => {
    const agentDisplayName = profile?.full_name || "النظام";
    if (type === "note") {
      const { error } = await supabase.from("messages").insert({
        conversation_id: convId,
        content: text,
        sender: "agent",
        message_type: "note",
        status: "sent",
        metadata: {
          ...(replyTo ? { quoted: { message_id: replyTo.id, sender_name: replyTo.senderName || "أنت", text: replyTo.text } } : {}),
          sender_name: agentDisplayName,
        },
      });

      if (error) {
        toast.error("فشل حفظ الملاحظة");
        return;
      }

      return;
    }

    const conversation = conversations.find((item) => item.id === convId);
    if (!conversation) {
      toast.error("تعذر تحديد المحادثة");
      return;
    }

    let sendFunction = getSendFunction(conversation.channelType, conversation.conversationType);
    // If channel type is unknown, resolve from DB before sending
    if (!sendFunction && conversation.channelId) {
      const resolved = await resolveChannelType(conversation.channelId);
      if (resolved) {
        sendFunction = getSendFunction(resolved, conversation.conversationType);
        // Update local state so future sends don't need another lookup
        setConversations(prev => prev.map(c => c.id === convId ? { ...c, channelType: resolved as any } : c));
      }
    }
    if (!sendFunction) {
      toast.error("تعذر تحديد نوع القناة — يرجى إعادة تحميل الصفحة");
      return;
    }
    const isEmail = sendFunction === "email-send";

    // Optimistic: add message to UI immediately
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMsg: Message = {
      id: optimisticId,
      conversationId: convId,
      text,
      sender: "agent",
      timestamp: new Date().toLocaleTimeString("ar-SA-u-ca-gregory", { hour: "2-digit", minute: "2-digit" }),
      status: "sent",
      type: "text",
      createdAt: new Date().toISOString(),
      senderName: agentDisplayName,
      quoted: replyTo ? { message_id: replyTo.id, sender_name: replyTo.senderName || "أنت", text: replyTo.text } : undefined,
    };
    setAllMessages((prev) => ({
      ...prev,
      [convId]: [...(prev[convId] || []), optimisticMsg],
    }));

    const overrides = emailOverridesRef.current;
    emailOverridesRef.current = null;

    const body = isEmail
      ? {
          to: overrides?.to || conversation.customerPhone,
          cc: overrides?.cc || undefined,
          subject: text.length > 60 ? text.substring(0, 60) + "..." : text,
          body: replyTo?.text
            ? `${text}\n\n---\n\nفي ${new Date().toLocaleDateString("ar-SA-u-ca-gregory")}، كتب ${replyTo.senderName || "العميل"}:\n> ${replyTo.text.split("\n").join("\n> ")}`
            : text,
          conversation_id: convId,
        }
      : {
          to: conversation.customerPhone,
          message: text,
          conversation_id: convId,
          channel_id: conversation.channelId,
          sender_name: agentDisplayName,
          reply_to: replyTo ? { wa_message_id: replyTo.waMessageId, sender_name: replyTo.senderName, text: replyTo.text, message_id: replyTo.id } : undefined,
          mentioned_jids: mentionedJids?.length ? mentionedJids : undefined,
        };

    const { data, error } = await invokeCloud(sendFunction, { body });

    if (error || (data?.error && !data?.queued)) {
      const errMsg = data?.error || (error instanceof Error ? error.message : typeof error === "string" ? error : "فشل إرسال الرسالة");
      console.error("[send] function:", sendFunction, "error:", error, "data:", data);
      
      // Safety paused: show persistent warning instead of generic error
      if (data?.safety_paused) {
        // Calculate remaining time
        let timeInfo = "";
        if (data?.reset_at) {
          const diff = new Date(data.reset_at).getTime() - Date.now();
          if (diff > 0) {
            const mins = Math.floor(diff / 60000);
            timeInfo = mins >= 60 ? ` (يتجدد خلال ${Math.floor(mins / 60)}س ${mins % 60}د)` : ` (يتجدد خلال ${mins}د)`;
          }
        }
        toast.warning(`⛔ الإرسال متوقف مؤقتاً لحماية الرقم${timeInfo}. الرسالة ستُعلّق ⏳ وترسل تلقائياً فور تجدد الحد.`, {
          duration: 12000,
          icon: "🛡️",
        });
        // Keep optimistic message but mark as pending
        setAllMessages((prev) => ({
          ...prev,
          [convId]: (prev[convId] || []).map((m) => m.id === optimisticId ? { ...m, status: "pending" } : m),
        }));
      } else {
        toast.error(errMsg);
        // Remove optimistic message on failure
        setAllMessages((prev) => ({
          ...prev,
          [convId]: (prev[convId] || []).filter((m) => m.id !== optimisticId),
        }));
      }
    } else if (data?.queued) {
      // Message was queued for later delivery
      toast.info("⏳ الرسالة معلّقة - سيتم إرسالها تلقائياً عند اتصال القناة", { duration: 5000 });
      // Update optimistic message status to pending
      setAllMessages((prev) => ({
        ...prev,
        [convId]: (prev[convId] || []).map((m) => m.id === optimisticId ? { ...m, status: "pending" } : m),
      }));
    } else {
      // Auto-assign private conversations to the agent who replied
      if (conversation.conversationType !== "group" && !conversation.assignedToId && profile?.id) {
        const agentName = profile?.full_name || "موظف";
        await supabase.from("conversations").update({
          assigned_to: agentName,
          assigned_to_id: profile.id,
          assigned_at: new Date().toISOString(),
        }).eq("id", convId);
        // Update local state
        setConversations(prev => prev.map(c => 
          c.id === convId ? { ...c, assignedTo: agentName, assignedToId: profile.id } : c
        ));
      }
    }
  }, [conversations, templates]);

  const handleStatusChange = useCallback(async (convId: string, status: "active" | "waiting" | "closed") => {
    const conv = conversations.find(c => c.id === convId);
    const prevStatus = conv?.status;
    const updateData: { status: string; updated_at: string; closed_at: string | null } = { 
      status, 
      updated_at: new Date().toISOString(),
      closed_at: status === "closed" ? new Date().toISOString() : null,
    };
    
    const { error: updateError } = await supabase
      .from("conversations")
      .update(updateData)
      .eq("id", convId);
    
    if (updateError) {
      console.error("Status update failed:", updateError);
      toast.error("فشل تغيير الحالة: " + (updateError.message || "خطأ غير معروف"));
      return;
    }
    
    setConversations((prev) => prev.map((conversation) => (conversation.id === convId ? { ...conversation, status } : conversation)));

    // Log status change as system message
    const statusLabels: Record<string, string> = { active: "نشط", waiting: "بانتظار", closed: "مغلق" };
    const agentName = profile?.full_name || "النظام";
    if (status === "closed") {
      await supabase.from("messages").insert({
        conversation_id: convId,
        content: `تم إغلاق المحادثة بواسطة ${agentName}`,
        sender: "system",
        message_type: "text",
      });
    } else {
      await supabase.from("messages").insert({
        conversation_id: convId,
        content: `تم تغيير الحالة إلى "${statusLabels[status]}" بواسطة ${agentName}`,
        sender: "system",
        message_type: "text",
      });
    }

    if (status === "closed") {
      // Send satisfaction survey if enabled (check channel-level first, then org)
      try {
        if (conv && orgId) {
          let satEnabled = false;
          let satMessage = "";

          // Check channel-level settings first
          if (conv.channelId) {
            const { data: chData } = await supabase.from("whatsapp_config_safe").select("settings").eq("id", conv.channelId).single();
            const chSettings = ((chData as any)?.settings as Record<string, any>) || {};
            if (chSettings.sat?.enabled && chSettings.sat?.message) {
              satEnabled = true;
              satMessage = chSettings.sat.message;
            }
          }

          // Fallback to org-level
          if (!satEnabled) {
            const { data: org } = await supabase.from("organizations").select("settings").eq("id", orgId).single();
            const settings = (org?.settings as Record<string, any>) || {};
            if (settings.satisfaction_enabled && settings.satisfaction_message) {
              satEnabled = true;
              satMessage = settings.satisfaction_message;
            }
          }

          if (satEnabled && satMessage) {
            let satFunc = getSendFunction(conv.channelType);
            if (!satFunc && conv.channelId) {
              const resolved = await resolveChannelType(conv.channelId);
              if (resolved) satFunc = getSendFunction(resolved);
            }
            if (!satFunc) return; // skip CSAT if channel unknown
            await invokeCloud(satFunc, {
              body: {
                to: conv.customerPhone,
                message: satMessage,
                conversation_id: convId,
                channel_id: conv.channelId,
              },
            });
            await supabase.from("conversations").update({ satisfaction_status: "pending" }).eq("id", convId);
          }
        }
      } catch (e) {
        console.error("Failed to send satisfaction survey:", e);
      }
    }
  }, [conversations, orgId, profile]);

  const handleTransfer = useCallback(async (convId: string, agent: string) => {
    const conv = conversations.find(c => c.id === convId);
    const previousAgent = conv?.assignedTo;
    const agentName = profile?.full_name || "النظام";
    
    // Look up the agent's profile ID
    const { data: agentProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("org_id", orgId)
      .eq("full_name", agent)
      .limit(1)
      .maybeSingle();
    const agentId = agentProfile?.id || null;
    
    await supabase.from("conversations").update({
      assigned_to: agent,
      assigned_to_id: agentId,
      assigned_at: new Date().toISOString(),
    }).eq("id", convId);
    setConversations((prev) => prev.map((conversation) => (conversation.id === convId ? { ...conversation, assignedTo: agent, assignedToId: agentId || undefined } : conversation)));
    
    // Log transfer with details
    const content = previousAgent && previousAgent !== "غير معيّن"
      ? `تم تحويل المحادثة من ${previousAgent} إلى ${agent} بواسطة ${agentName}`
      : `تم إسناد المحادثة إلى ${agent} بواسطة ${agentName}`;
    
    await supabase.from("messages").insert({
      conversation_id: convId,
      content,
      sender: "system",
      message_type: "text",
    });
  }, [conversations, profile, orgId]);

  const handleAssignAgent = useCallback(async (convId: string, agentId: string | null, agentName: string) => {
    const actorName = profile?.full_name || "النظام";
    await supabase.from("conversations").update({
      assigned_to: agentName === "غير معيّن" ? null : agentName,
      assigned_to_id: agentId,
      assigned_at: agentId ? new Date().toISOString() : null,
    }).eq("id", convId);
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, assignedTo: agentName, assignedToId: agentId || undefined } : c));
    
    await supabase.from("messages").insert({
      conversation_id: convId,
      content: agentId ? `تم تثبيت الموظف "${agentName}" كمسؤول عن المحادثة بواسطة ${actorName}` : `تم إلغاء تعيين الموظف بواسطة ${actorName}`,
      sender: "system",
      message_type: "text",
    });
    toast.success(agentId ? `تم تعيين ${agentName} كمسؤول` : "تم إلغاء تعيين الموظف");
  }, [profile]);

  const handleAssignTeam = useCallback(async (convId: string, teamId: string | null, teamName: string) => {
    const actorName = profile?.full_name || "النظام";
    await supabase.from("conversations").update({
      assigned_team: teamId ? teamName : null,
      assigned_team_id: teamId,
    }).eq("id", convId);
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, assignedTeam: teamId ? teamName : undefined, assignedTeamId: teamId || undefined } : c));
    
    await supabase.from("messages").insert({
      conversation_id: convId,
      content: teamId ? `تم تعيين الفريق "${teamName}" كمسؤول عن المحادثة بواسطة ${actorName}` : `تم إلغاء تعيين الفريق بواسطة ${actorName}`,
      sender: "system",
      message_type: "text",
    });
    toast.success(teamId ? `تم تعيين فريق ${teamName}` : "تم إلغاء تعيين الفريق");
  }, [profile]);

  const handleUpdateNotes = useCallback(async (convId: string, notes: string) => {
    await supabase.from("conversations").update({ notes }).eq("id", convId);
    setConversations((prev) => prev.map((conversation) => (conversation.id === convId ? { ...conversation, notes } : conversation)));
  }, []);

  const handleTagsChange = useCallback(async (convId: string, tags: string[]) => {
    const conv = conversations.find(c => c.id === convId);
    const oldTags = conv?.tags || [];
    const actorName = profile?.full_name || "النظام";

    // Determine added and removed tags
    const addedTags = tags.filter(t => !oldTags.includes(t));
    const removedTags = oldTags.filter(t => !tags.includes(t));

    await supabase.from("conversations").update({ tags }).eq("id", convId);
    setConversations((prev) => prev.map((conversation) => (conversation.id === convId ? { ...conversation, tags } : conversation)));

    // Insert system messages for tag changes
    const systemMessages: Array<{ conversation_id: string; content: string; sender: string; message_type: string }> = [];
    for (const tag of addedTags) {
      systemMessages.push({
        conversation_id: convId,
        content: `تم إضافة الوسم "${tag}" بواسطة ${actorName}`,
        sender: "system",
        message_type: "text",
      });
    }
    for (const tag of removedTags) {
      systemMessages.push({
        conversation_id: convId,
        content: `تم حذف الوسم "${tag}" بواسطة ${actorName}`,
        sender: "system",
        message_type: "text",
      });
    }
    if (systemMessages.length > 0) {
      await supabase.from("messages").insert(systemMessages);
    }
  }, [conversations, profile]);

  const handleTogglePin = useCallback(async (convId: string) => {
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;
    const newVal = !conv.isPinned;
    await supabase.from("conversations").update({ is_pinned: newVal }).eq("id", convId);
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, isPinned: newVal } : c)));
    toast.success(newVal ? "📌 تم تثبيت المحادثة" : "تم إلغاء التثبيت");
  }, [conversations]);

  const handleToggleArchive = useCallback(async (convId: string) => {
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;
    const newVal = !conv.isArchived;
    await supabase.from("conversations").update({ is_archived: newVal }).eq("id", convId);
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, isArchived: newVal } : c)));
    toast.success(newVal ? "📁 تم أرشفة المحادثة" : "تم إلغاء الأرشفة");
  }, [conversations]);

  const handleDeleteConversation = useCallback(async (convId: string) => {
    try {
      // Delete all messages first, then the conversation
      await supabase.from("messages").delete().eq("conversation_id", convId);
      await supabase.from("conversations").delete().eq("id", convId);
      
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      setAllMessages((prev) => {
        const next = { ...prev };
        delete next[convId];
        return next;
      });
      
      if (selectedId === convId) {
        setSelectedId(null);
      }
      
      toast.success("🗑️ تم حذف المحادثة");
    } catch (e: any) {
      toast.error("فشل حذف المحادثة: " + (e.message || ""));
    }
  }, [selectedId]);

  const handleEditMessage = useCallback(async (msgId: string, waMessageId: string, newText: string, convPhone: string) => {
    const conv = conversations.find(c => c.customerPhone === convPhone);
    let effectiveChannelType = conv?.channelType;
    if (!effectiveChannelType && conv?.channelId) {
      effectiveChannelType = (await resolveChannelType(conv.channelId)) as any;
    }
    const isEvolution = effectiveChannelType === "evolution";

    const { data, error } = await invokeCloud(isEvolution ? "evolution-manage" : "whatsapp-send", {
      body: isEvolution
        ? { action: "edit_message", phone: convPhone, message_id: waMessageId, new_text: newText, channel_id: conv?.channelId }
        : { to: convPhone, type: "edit", edit_message_id: waMessageId, message: newText, channel_id: conv?.channelId },
    });

    if (error || data?.error || data?.success === false) {
      toast.error(data?.error || data?.message || "فشل تعديل الرسالة");
    } else {
      toast.success("تم تعديل الرسالة");
    }
  }, [conversations]);

  const handleDeleteMessage = useCallback(async (msgId: string, waMessageId: string, convPhone: string) => {
    // Optimistic: update UI immediately
    setAllMessages(prev => {
      const updated: Record<string, Message[]> = {};
      for (const [convId, msgs] of Object.entries(prev)) {
        updated[convId] = msgs.map(m => m.id === msgId ? { ...m, text: "تم حذف هذه الرسالة", isDeleted: true, deletedBy: profile?.full_name || "موظف" } : m);
      }
      return updated;
    });
    toast.success("تم حذف الرسالة");

    // Background: call the edge function
    const conv = conversations.find(c => c.customerPhone === convPhone);
    let func = getSendFunction(conv?.channelType);
    if (!func && conv?.channelId) {
      const resolved = await resolveChannelType(conv.channelId);
      if (resolved) func = getSendFunction(resolved);
    }
    if (!func) { toast.error("تعذر تحديد نوع القناة"); return; }
    invokeCloud(func, {
      body: { to: convPhone, delete_message_id: waMessageId, channel_id: conv?.channelId },
    }).then(({ data, error }) => {
      if (error || data?.error) {
        // Revert on failure
        toast.error(data?.error || "فشل حذف الرسالة من واتساب");
      }
    });
  }, [conversations]);

  const handleSendTemplate = useCallback(async (convId: string, template: WhatsAppTemplate, variables: string[]) => {
    const conversation = conversations.find((item) => item.id === convId);
    if (!conversation) {
      toast.error("تعذر تحديد المحادثة");
      return;
    }

    // Optimistic: show template in chat immediately
    let previewBody = template.body;
    variables.forEach((v, i) => { previewBody = previewBody.replace(`{{${i + 1}}}`, v || `{{${i + 1}}}`); });
    const optimisticId = `optimistic-tpl-${Date.now()}`;
    setAllMessages((prev) => ({
      ...prev,
      [convId]: [...(prev[convId] || []), {
        id: optimisticId,
        conversationId: convId,
        text: previewBody,
        sender: "agent" as const,
        timestamp: new Date().toLocaleTimeString("ar-SA-u-ca-gregory", { hour: "2-digit", minute: "2-digit" }),
        status: "sent" as const,
        type: "template" as const,
        createdAt: new Date().toISOString(),
        senderName: profile?.full_name || "النظام",
      }],
    }));

    let sendFunc = getSendFunction(conversation.channelType);
    if (!sendFunc && conversation.channelId) {
      const resolved = await resolveChannelType(conversation.channelId);
      if (resolved) sendFunc = getSendFunction(resolved);
    }
    if (!sendFunc) { toast.error("تعذر تحديد نوع القناة"); return; }
    const { data, error } = await invokeCloud(sendFunc, {
      body: {
        to: conversation.customerPhone,
        type: "template",
        template_name: template.name,
        template_language: template.language,
        template_components: buildTemplateComponents(template, variables),
        conversation_id: convId,
        channel_id: conversation.channelId,
        sender_name: profile?.full_name || "النظام",
      },
    });

    if (error || data?.error) {
      toast.error(data?.error || "فشل إرسال القالب");
      setAllMessages((prev) => ({
        ...prev,
        [convId]: (prev[convId] || []).filter((m) => m.id !== optimisticId),
      }));
      return;
    }
  }, [conversations]);

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

  // On mobile with a selected chat, go full-screen over the layout
  if (isMobile && selected) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background" dir="rtl">
        <ChatArea
          conversation={selected}
          messages={currentMessages}
          templates={templates}
          onBack={() => setSelectedId(null)}
          onSendMessage={handleSendMessage}
          onSendTemplate={handleSendTemplate}
           onStatusChange={handleStatusChange}
           onTransfer={handleTransfer}
           onTagsChange={handleTagsChange}
           onEditMessage={handleEditMessage}
           onDeleteMessage={handleDeleteMessage}
           onShowCustomerInfo={() => setMobileCustomerInfoOpen(true)}
           scrollToMessageId={scrollToMessageId}
           onScrollToMessageDone={() => setScrollToMessageId(null)}
            onDeleteConversation={handleDeleteConversation}
         />

        {/* Mobile Customer Info Sheet */}
        <Sheet open={mobileCustomerInfoOpen} onOpenChange={setMobileCustomerInfoOpen}>
          <SheetContent side="bottom" className="h-[85dvh] rounded-t-2xl p-0 overflow-hidden" dir="rtl">
            <div className="h-full overflow-y-auto p-4 pt-6">
              <CustomerInfoPanel
                conversation={selected}
                onUpdateNotes={handleUpdateNotes}
                onAssignAgent={handleAssignAgent}
                onAssignTeam={handleAssignTeam}
                isMobileSheet
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-3rem)] overflow-hidden bg-background" dir="rtl">
      {/* On mobile: show list when no selection, show chat when selected */}
      {(!isMobile || !selected) && (
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setConversations(prev => prev.map(c => c.id === id ? { ...c, unread: 0 } : c));
            supabase.from("conversations").update({ unread_count: 0 }).eq("id", id).then();
          }}
          hasSelection={!!selected}
          onNewConversation={() => setNewConvOpen(true)}
          onTogglePin={handleTogglePin}
          onToggleArchive={handleToggleArchive}
          inboxMode={inboxMode}
        />
      )}

      {selected ? (
        <ChatArea
          conversation={selected}
          messages={currentMessages}
          templates={templates}
          onBack={() => setSelectedId(null)}
          onSendMessage={handleSendMessage}
          onSendTemplate={handleSendTemplate}
           onStatusChange={handleStatusChange}
           onTransfer={handleTransfer}
           onTagsChange={handleTagsChange}
           onEditMessage={handleEditMessage}
           onDeleteMessage={handleDeleteMessage}
           onShowCustomerInfo={() => setDesktopInfoOpen(prev => !prev)}
           scrollToMessageId={scrollToMessageId}
           onScrollToMessageDone={() => setScrollToMessageId(null)}
            onDeleteConversation={handleDeleteConversation}
         />
      ) : (
        !isMobile && (
          <div className="flex flex-1 items-center justify-center bg-background">
            <div className="text-center text-muted-foreground">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-7 h-7 opacity-20" />
              </div>
              <p className="text-base font-medium text-foreground/60 tracking-tight">
                {conversations.length === 0 ? "لا توجد محادثات بعد" : "اختر محادثة للبدء"}
              </p>
              <p className="text-sm text-muted-foreground/40 mt-1.5 font-light">
                {conversations.length === 0 ? "اربط واتساب وابدأ باستقبال الرسائل" : "اختر من القائمة على اليمين"}
              </p>
            </div>
          </div>
        )
      )}

      {selected && !isMobile && desktopInfoOpen && (
        <div className="relative animate-in slide-in-from-left duration-200 h-full">
          <button
            onClick={() => setDesktopInfoOpen(false)}
            className="absolute top-3 left-3 z-10 w-7 h-7 rounded-lg bg-muted hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-all"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
          <CustomerInfoPanel conversation={selected} onUpdateNotes={handleUpdateNotes} onAssignAgent={handleAssignAgent} onAssignTeam={handleAssignTeam} />
        </div>
      )}

      <NewConversationDialog
        open={newConvOpen}
        onOpenChange={setNewConvOpen}
        templates={templates}
        defaultMode={inboxMode}
        onConversationCreated={async (convId) => {
          await fetchConversationsRef.current?.();
          setSelectedId(convId);
        }}
      />
    </div>
  );
};

export default InboxPage;