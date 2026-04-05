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

const getSendFunction = (channelType?: string): string => {
  if (channelType === "meta_api") return "whatsapp-send";
  return "evolution-send"; // Default to evolution for evolution or unknown channels
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
  return date.toLocaleDateString("ar-SA");
};

const InboxPage = () => {
  const { orgId, profile, userRole, teamId, isSupervisor, isSuperAdmin } = useAuth();
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

  const isMobile = useIsMobile();

  // Sync URL when selectedId changes
  useEffect(() => {
    const current = searchParams.get("conversation");
    if (selectedId && selectedId !== current) {
      setSearchParams({ conversation: selectedId }, { replace: true });
    } else if (!selectedId && current) {
      setSearchParams({}, { replace: true });
    }
  }, [selectedId]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (!orgId) {
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
        body: { action: "list" },
      });

      if (!error && !data?.error) {
        setTemplates((data?.templates || []).map(mapMetaTemplate));
      }
    };

    loadTemplates();
  }, [orgId]);

  useEffect(() => {
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
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("org_id", currentOrgId)
        .order("last_message_at", { ascending: false });

      if (!active) return;

      if (error) {
        console.error("Error fetching conversations:", error);
        setLoading(false);
        return;
      }

      // Load channel configs for channel name mapping
      const { data: channelConfigs } = await supabase
        .from("whatsapp_config_safe")
        .select("id, display_phone, business_name, channel_type, evolution_instance_name")
        .eq("org_id", currentOrgId)
        .eq("is_connected", true);

      const channelMap = new Map((channelConfigs || []).map((c: any) => [c.id, c]));

      const mapped: Conversation[] = (data || []).map((conversation: any) => {
        const channelConfig = conversation.channel_id ? channelMap.get(conversation.channel_id) : null;
        const channelType = channelConfig?.channel_type === "evolution" ? "evolution" : 
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
          conversationType: (conversation.conversation_type as "private" | "group" | "broadcast") || "private",
          channelType,
          channelId: conversation.channel_id || undefined,
          channelName: channelConfig ? (channelConfig.display_phone || channelConfig.business_name || channelConfig.evolution_instance_name || "") : undefined,
          profilePic: conversation.customer_profile_pic || undefined,
          unreadMentionCount: conversation.unread_mention_count || 0,
          isPinned: conversation.is_pinned || false,
          isArchived: conversation.is_archived || false,
          dedicatedAgentId: conversation.dedicated_agent_id || null,
          lastMessageSender: (conversation as any).last_message_sender || null,
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
      const filtered = isAdmin ? mapped : mapped.filter(conv => {
        // No team assigned to user → show all (legacy behavior)
        if (!teamId) return true;
        // Conversation not assigned to any team → visible to all in org
        if (!conv.assignedTeamId) return true;
        // Conversation assigned to user's team
        if (conv.assignedTeamId === teamId) {
          // Supervisors see all team conversations
          if (isSupervisor) return true;
          // Members see only their own or unassigned
          return !conv.assignedToId || conv.assignedToId === profile?.id;
        }
        // Conversation assigned to different team → not visible
        return false;
      });

      // Zero out unread for the currently viewed conversation
      const activeId = selectedIdRef.current;
      if (activeId) {
        const activeConv = filtered.find(c => c.id === activeId);
        if (activeConv && activeConv.unread > 0) {
          activeConv.unread = 0;
          supabase.from("conversations").update({ unread_count: 0 }).eq("id", activeId).then();
        }
        if (activeConv && (activeConv.unreadMentionCount || 0) > 0) {
          activeConv.unreadMentionCount = 0;
          supabase.from("conversations").update({ unread_mention_count: 0 }).eq("id", activeId).then();
        }
      }

      setConversations(filtered);
      // On first load, honour deep link; otherwise auto-select first
      if (!deepLinkApplied.current) {
        deepLinkApplied.current = true;
        const urlConvId = searchParams.get("conversation");
        if (urlConvId && filtered.some(c => c.id === urlConvId)) {
          setSelectedId(urlConvId);
        } else if (!isMobile && filtered.length > 0) {
          setSelectedId(filtered[0].id);
        }
      } else if (!isMobile && mapped.length > 0) {
        setSelectedId((prev) => (prev && mapped.some((item) => item.id === prev) ? prev : mapped[0].id));
      }
      setLoading(false);
    };

    fetchConversations();

    const channel = supabase
      .channel(`conversations-changes-${currentOrgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `org_id=eq.${currentOrgId}` }, () => {
        fetchConversations();
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [orgId, isMobile, userRole, teamId, isSupervisor, isSuperAdmin, profile?.id]);

  useEffect(() => {
    if (!selectedId) return;

    // Fetch messages if not already loaded
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching messages:", error);
        return;
      }

      const mapped: Message[] = (data || []).map((message) => ({
        id: message.id,
        conversationId: message.conversation_id,
        text: message.content,
        sender: message.sender as "customer" | "agent" | "system",
        timestamp: new Date(message.created_at || "").toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
        status: message.status as "sent" | "delivered" | "read" | undefined,
        type: (message.message_type as Message["type"]) || "text",
        mediaUrl: message.media_url || undefined,
        senderName: (message.metadata as any)?.sender_name || undefined,
        senderJid: (message.metadata as any)?.participant || undefined,
        senderPhone: (message.metadata as any)?.sender_pn || undefined,
        quoted: (message.metadata as any)?.quoted || undefined,
        mentioned: (message.metadata as any)?.mentioned || undefined,
        waMessageId: message.wa_message_id || undefined,
        reactions: (message.metadata as any)?.reactions || undefined,
        location: (message.metadata as any)?.location || undefined,
        contacts: (message.metadata as any)?.contacts || undefined,
        editedAt: (message.metadata as any)?.edited_at || undefined,
        editedBy: (message.metadata as any)?.edited_by || undefined,
        isDeleted: (message.metadata as any)?.is_deleted || false,
        deletedBy: (message.metadata as any)?.deleted_by || undefined,
        poll: (message.metadata as any)?.poll || undefined,
        createdAt: message.created_at || undefined,
        readBy: (message.metadata as any)?.read_by || undefined,
        groupSize: (message.metadata as any)?.group_size || undefined,
      }));

      setAllMessages((prev) => ({ ...prev, [selectedId]: mapped }));
    };

    fetchMessages();

    const channel = supabase
      .channel(`messages-${selectedId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedId}` }, (payload) => {
        const message = payload.new as any;
        const newMessage: Message = {
          id: message.id,
          conversationId: message.conversation_id,
          text: message.content,
          sender: message.sender,
          timestamp: new Date(message.created_at || "").toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
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
        };
        setAllMessages((prev) => ({
          ...prev,
          [selectedId]: (prev[selectedId] || []).some((m) => m.id === newMessage.id)
            ? (prev[selectedId] || []).map((m) => m.id === newMessage.id ? newMessage : m)
            : // Replace matching optimistic message (text match or audio type match)
              (() => {
                const withoutOptimistic = (prev[selectedId] || []).filter((m) =>
                  !(m.id.startsWith("optimistic-") && m.sender === "agent" && (
                    m.text === newMessage.text ||
                    (m.type === "audio" && newMessage.type === "audio")
                  ))
                );
                return [...withoutOptimistic, newMessage];
              })(),
        }));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedId}` }, (payload) => {
        const updated = payload.new as any;
        setAllMessages((prev) => ({
          ...prev,
          [selectedId]: (prev[selectedId] || []).map((m) => {
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
          }),
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
  const currentMessages = selectedId ? allMessages[selectedId] || [] : [];

  const handleSendMessage = useCallback(async (convId: string, text: string, type: "text" | "note" = "text", replyTo?: { id: string; waMessageId?: string; senderName?: string; text: string }) => {
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

    const sendFunction = getSendFunction(conversation.channelType);

    // Optimistic: add message to UI immediately
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMsg: Message = {
      id: optimisticId,
      conversationId: convId,
      text,
      sender: "agent",
      timestamp: new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
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

    const { data, error } = await invokeCloud(sendFunction, {
      body: {
        to: conversation.customerPhone,
        message: text,
        conversation_id: convId,
        channel_id: conversation.channelId,
        sender_name: agentDisplayName,
        reply_to: replyTo ? { wa_message_id: replyTo.waMessageId, sender_name: replyTo.senderName, text: replyTo.text, message_id: replyTo.id } : undefined,
      },
    });

    if (error || data?.error) {
      toast.error(data?.error || "فشل إرسال الرسالة");
      // Remove optimistic message on failure
      setAllMessages((prev) => ({
        ...prev,
        [convId]: (prev[convId] || []).filter((m) => m.id !== optimisticId),
      }));
    }
  }, [conversations, templates]);

  const handleStatusChange = useCallback(async (convId: string, status: "active" | "waiting" | "closed") => {
    const conv = conversations.find(c => c.id === convId);
    const prevStatus = conv?.status;
    const updateData: Record<string, unknown> = { 
      status, 
      updated_at: new Date().toISOString(),
      ...(status === "closed" ? { closed_at: new Date().toISOString() } : { closed_at: null }),
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
            const satFunc = getSendFunction(conv.channelType);
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
    const isEvolution = conv?.channelType === "evolution" || !conv?.channelType;

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
    const func = getSendFunction(conv?.channelType);
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
        timestamp: new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
        status: "sent" as const,
        type: "template" as const,
        createdAt: new Date().toISOString(),
        senderName: profile?.full_name || "النظام",
      }],
    }));

    const sendFunc = getSendFunction(conversation.channelType);
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
        onConversationCreated={(convId) => {
          setSelectedId(convId);
        }}
      />
    </div>
  );
};

export default InboxPage;