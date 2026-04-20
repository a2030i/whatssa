import { useState, useRef, useEffect, useCallback } from "react";
import { Send, MoreVertical, ArrowRight, Smile, Paperclip, Zap, Check, CheckCheck, StickyNote, UserPlus, XCircle, CheckCircle2, FileText, AlertTriangle, Clock, AtSign, Mic, Loader2, X, Play, Image as ImageIcon, Video, Reply, Plus, Timer, ShieldCheck, Wifi, MapPin, Contact, Phone as PhoneIcon, Pencil, Trash2, Brain, Languages, Sparkles, Search as SearchIcon, Square, ShoppingBag, Ban, ShieldOff, LogOut, UserMinus, Crown, ChevronUp, ChevronDown, Link2, Forward, Star, BarChart3, Timer as TimerIcon, Tag, Ticket, CornerDownLeft, WrapText, Mail, Users, BellOff, CalendarDays } from "lucide-react";
import { useSwipeReply } from "@/hooks/useSwipeReply";
import ImageLightbox from "./ImageLightbox";
import MessageSearch from "./MessageSearch";
import ProductPicker from "./ProductPicker";
import InternalProductPicker from "./InternalProductPicker";
import { supabase, cloudSupabase, invokeCloud } from "@/lib/supabase";
import { cn, getPhoneSearchVariants, phoneNumbersMatch } from "@/lib/utils";
import { Conversation, Message } from "@/data/mockData";
import type { WhatsAppTemplate } from "@/types/whatsapp";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import TransferDialog from "./TransferDialog";
import AudioPlayer from "./AudioPlayer";
import VoiceRecorder from "./VoiceRecorder";
import ClosureReasonDialog from "./ClosureReasonDialog";
import InputAreaNew from "@/components/inbox/InputAreaNew";
import ExportConversation from "./ExportConversation";
import { useAuth } from "@/contexts/AuthContext";
import FollowUpDialog from "./FollowUpDialog";
import SnoozeDialog from "./SnoozeDialog";
import ConversationEventsLog from "./ConversationEventsLog";
import ScheduleMessagePopover from "./ScheduleMessagePopover";
import ForwardMessageDialog from "./ForwardMessageDialog";
import PollCreatorDialog from "./PollCreatorDialog";
import ContactCardDialog from "./ContactCardDialog";
import CreateTicketDialog from "@/components/tickets/CreateTicketDialog";
import SendQuotaBanner from "./SendQuotaBanner";
import EmailTemplatePicker from "./EmailTemplatePicker";
import EmailRecipientAutocomplete from "./EmailRecipientAutocomplete";
import ConfirmDialog from "@/components/ui/confirm-dialog";

const emojis = ["😊", "👍", "❤️", "🎉", "🙏", "👋", "✅", "⭐", "🔥", "💯", "😂", "🤝", "📦", "💳", "🚚", "⏰"];

interface ChatAreaProps {
  conversation: Conversation;
  messages: Message[];
  templates: WhatsAppTemplate[];
  onBack: () => void;
  onSendMessage: (convId: string, text: string, type?: "text" | "note", replyTo?: { id: string; waMessageId?: string; senderName?: string; text: string }, mentionedJids?: string[]) => void;
  onSendTemplate: (convId: string, template: WhatsAppTemplate, variables: string[]) => void;
  onStatusChange: (convId: string, status: "active" | "waiting" | "closed") => void;
  onTransfer: (convId: string, agent: string) => void;
  onTagsChange?: (convId: string, tags: string[]) => void;
  onEditMessage?: (msgId: string, waMessageId: string, newText: string, convPhone: string) => void;
  onDeleteMessage?: (msgId: string, waMessageId: string, convPhone: string) => void;
  onShowCustomerInfo?: () => void;
  scrollToMessageId?: string | null;
  onScrollToMessageDone?: () => void;
  onStarMessage?: (msgId: string, starred: boolean) => void;
  onForwardMessage?: (msg: Message) => void;
  onConversationMerged?: (sourceConversationId: string, targetConversationId: string) => void;
  onDeleteConversation?: (convId: string) => void;
  hasMoreMessages?: boolean;
  onLoadMoreMessages?: (convId: string) => void;
  loadingMoreMessages?: boolean;
}

const MessageStatus = ({ status, isGroup, readBy, groupSize }: { status?: string; isGroup?: boolean; readBy?: string[]; groupSize?: number }) => {
  if (!status) return null;
  if (status === "sent") return <span className="inline-block mr-1"><Check className="w-3 h-3 text-muted-foreground inline-block" /></span>;
  if (status === "delivered") return (
    <span className="inline-flex items-center mr-1">
      <CheckCheck className="w-3 h-3 text-muted-foreground inline-block" />
      {isGroup && readBy && readBy.length > 0 && groupSize && groupSize > 0 && (
        <span className="text-[8px] text-muted-foreground font-bold mr-0.5">{readBy.length}/{groupSize}</span>
      )}
    </span>
  );
  if (status === "read") return (
    <span className="inline-flex items-center mr-1">
      <CheckCheck className="w-3 h-3 text-primary inline-block" />
      {isGroup && <span className="text-[8px] text-primary font-bold mr-0.5">الكل</span>}
    </span>
  );
  if (status === "failed") return <span className="inline-block mr-1"><AlertTriangle className="w-3 h-3 text-destructive inline-block" /></span>;
  if (status === "pending") return <span className="inline-flex items-center gap-0.5 mr-1"><Clock className="w-3 h-3 text-warning inline-block animate-pulse" /><span className="text-[8px] text-warning font-medium">معلّقة</span></span>;
  return null;
};

const isWindowExpired = (lastCustomerMessageAt?: string): boolean => {
  if (!lastCustomerMessageAt) return true;
  const diff = Date.now() - new Date(lastCustomerMessageAt).getTime();
  return diff > 24 * 60 * 60 * 1000;
};

const getWindowRemaining = (lastCustomerMessageAt?: string): { expired: boolean; hours: number; minutes: number; percentage: number } => {
  if (!lastCustomerMessageAt) return { expired: true, hours: 0, minutes: 0, percentage: 0 };
  const end = new Date(lastCustomerMessageAt).getTime() + 24 * 60 * 60 * 1000;
  const remaining = end - Date.now();
  if (remaining <= 0) return { expired: true, hours: 0, minutes: 0, percentage: 0 };
  const totalMs = 24 * 60 * 60 * 1000;
  return {
    expired: false,
    hours: Math.floor(remaining / (60 * 60 * 1000)),
    minutes: Math.floor((remaining % (60 * 60 * 1000)) / 60000),
    percentage: Math.round((remaining / totalMs) * 100),
  };
};

const isImageUrl = (url?: string | null) => !!url && /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url);
const isPdfUrl = (url?: string | null) => !!url && /\.pdf(\?.*)?(#.*)?$/i.test(url);

const getStorageUrlFromText = (text: string) => {
  const match = text.match(/\n(https:\/\/[^\s]+|storage:chat-media\/[^\s]+)/i);
  return match?.[1];
};

/** Resolve a media URL: if it's a storage path, get signed URL via edge function; otherwise return as-is */
const resolveMediaUrl = async (url: string | null | undefined): Promise<string | null> => {
  if (!url) return null;
  // Blob URLs (optimistic) – pass through directly
  if (url.startsWith("blob:")) return url;
  if (url.startsWith("storage:chat-media/")) {
    const path = url.replace("storage:chat-media/", "");
    try {
      // Use edge function to generate signed URL from the correct storage (Lovable Cloud)
      const { data, error } = await invokeCloud("upload-chat-media", {
        body: { action: "sign", path },
      });
      if (error) {
        console.error("[resolveMediaUrl] Edge sign error:", error, "path:", path);
        return null;
      }
      return data?.signedUrl || null;
    } catch (e) {
      console.error("[resolveMediaUrl] Exception:", e, "path:", path);
      return null;
    }
  }
  return url;
};

const normalizeDigits = (value: unknown) =>
  typeof value === "string" ? value.replace(/@.*/, "").replace(/\D/g, "") : "";

// Consistent per-member color based on phone/id hash — WhatsApp-style
const MEMBER_PALETTE = [
  "#e53935","#d81b60","#8e24aa","#5e35b1","#1e88e5",
  "#039be5","#00897b","#43a047","#f4511e","#fb8c00",
  "#6d4c41","#546e7a","#00acc1","#3949ab","#c0ca33",
];
const getMemberColor = (key: string): string => {
  if (!key) return MEMBER_PALETTE[0];
  const digits = key.replace(/\D/g, "");
  const seed = (digits || key).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return MEMBER_PALETTE[seed % MEMBER_PALETTE.length];
};

const extractParticipantPhone = (participant: any) => {
  const rawId = participant?.id || participant?.jid || "";
  const candidates = [participant?.phone, participant?.number, participant?.senderPn, participant?.participantPn]
    .map(normalizeDigits)
    .filter(Boolean);
  if (candidates.length > 0) return candidates[0];
  if (rawId.includes("@s.whatsapp.net")) return normalizeDigits(rawId);
  if (rawId.includes("@g.us")) return "";
  if (rawId.includes("@lid")) return "";
  return "";
};

const extractParticipantName = (participant: any, phone: string) => {
  const candidate = [participant?.pushName, participant?.name, participant?.notify, participant?.verifiedName, participant?.shortName]
    .find((value) => typeof value === "string" && value.trim());
  if (candidate) return candidate.trim();
  if (phone) return `+${phone}`;
  // For @lid participants without any name, show a generic label with partial id
  const rawId = participant?.id || participant?.jid || "";
  if (rawId.includes("@lid")) {
    const lidShort = rawId.replace(/@.*/, "").slice(-6);
    return `عضو #${lidShort}`;
  }
  return "عضو بالقروب";
};

const scrollToMessage = (messageId?: string) => {
  if (!messageId) return;
  const el = document.querySelector(`[data-message-id="${messageId}"]`) || document.querySelector(`[data-wa-message-id="${messageId}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-primary/60", "rounded-xl");
  setTimeout(() => el.classList.remove("ring-2", "ring-primary/60", "rounded-xl"), 1500);
};

/** Component to resolve storage: URLs to signed URLs for media display */
const ResolvedMedia = ({ url, type, isAgent = false, onImageClick }: { url: string; type: string; isAgent?: boolean; onImageClick?: (src: string) => void }) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveMediaUrl(url).then((resolved) => {
      if (!cancelled) {
        setResolvedUrl(resolved);
        setLoading(false);
        if (!resolved) {
          setFailed(true);
          console.warn("[ResolvedMedia] Failed to resolve URL:", url, "type:", type);
        }
      }
    });
    return () => { cancelled = true; };
  }, [url]);

  if (loading) return <div className="w-[120px] h-[80px] rounded-lg bg-muted animate-pulse mb-1" />;

  // Show fallback for audio when URL can't be resolved
  if (!resolvedUrl) {
    if (type === "audio") {
      return (
        <div className="flex items-center gap-2 text-xs py-1 mb-1">
          <Mic className="w-3.5 h-3.5" />
          <span>رسالة صوتية</span>
        </div>
      );
    }
    return null;
  }

  const isImage = type === "image" || isImageUrl(resolvedUrl) || isImageUrl(url);
  const isSticker = type === "sticker";

  if (isSticker) {
    return <img src={resolvedUrl} alt="ملصق" className="max-w-[140px] max-h-[140px] object-contain mb-1" />;
  }
  if (isImage) {
    return <img src={resolvedUrl} alt="صورة مرفقة" className="rounded-xl w-full max-w-[min(88vw,420px)] md:max-w-[min(82vw,420px)] max-h-[460px] object-cover mb-1.5 cursor-pointer active:scale-[0.98] transition-transform" onClick={() => onImageClick?.(resolvedUrl)} />;
  }
  if (type === "audio") {
    return <AudioPlayer src={resolvedUrl} isAgent={isAgent} className="mb-1" />;
  }
  if (type === "video") {
    return (
      <div className="mb-1.5 min-w-[220px] rounded-xl bg-white dark:bg-card overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="flex items-center gap-2 p-2.5 text-[12px] font-medium text-foreground"><Video className="h-4 w-4 text-primary" /><span>مقطع فيديو</span></div>
        <video controls preload="metadata" className="max-h-[260px] w-full"><source src={resolvedUrl} />متصفحك لا يدعم تشغيل الفيديو.</video>
      </div>
    );
  }
  if (type === "document") {
    const pdfFile = isPdfUrl(resolvedUrl) || isPdfUrl(url);
    return (
      <div className="mb-1.5 min-w-[220px] max-w-[min(82vw,420px)] rounded-xl bg-white dark:bg-card overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="flex items-center gap-3 p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8 shrink-0">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-foreground">{pdfFile ? "ملف PDF" : "ملف مرفق"}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">اضغط للمعاينة</p>
          </div>
          <a
            href={resolvedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            فتح
          </a>
        </div>
        {pdfFile ? (
          <iframe
            src={resolvedUrl}
            title="معاينة PDF"
            className="h-[280px] w-full border-t border-border/10 bg-background"
          />
        ) : (
          <a
            href={resolvedUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center border-t border-border/10 px-3 py-5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/30"
          >
            فتح الملف المرفق
          </a>
        )}
      </div>
    );
  }
  return null;
};

const SwipeableMessageBubble = ({ msg, conversation, onReply, onEdit, onDelete, onImageClick, hasAiConfig, groupParticipants, onCopyLink, onForward, onStar, translationText, isFirstInGroup }: { msg: Message; conversation: Conversation; onReply: (msg: Message) => void; onEdit?: (msg: Message) => void; onDelete?: (msg: Message) => void; onImageClick?: (src: string) => void; hasAiConfig?: boolean; groupParticipants?: Array<{ id: string; name: string; phone: string; rawDigits?: string }>; onCopyLink?: (msgId: string) => void; onForward?: (msg: Message) => void; onStar?: (msg: Message) => void; translationText?: string; isFirstInGroup?: boolean }) => {
  const swipeDirection = msg.sender === "agent" ? "left" : "right";
  const isEmailConversation = conversation.channelType === "email" || conversation.conversationType === "email";
  const canReply = msg.type !== "note" && !msg.isDeleted;
  const swipe = useSwipeReply({
    onSwipe: () => canReply && onReply(msg),
    direction: swipeDirection,
    threshold: 60,
  });

  // Evolution allows editing up to 60 min; Meta API allows 15 min
  const isEvolutionConv = conversation.channelType === "evolution" || !conversation.channelType;
  const editWindowMs = isEvolutionConv ? 60 * 60 * 1000 : 15 * 60 * 1000;
  // Can edit agent text messages (not for email — emails can't be recalled)
  const canEdit = !isEmailConversation && msg.sender === "agent" && msg.type === "text" && msg.waMessageId && !msg.isDeleted && msg.createdAt &&
    (Date.now() - new Date(msg.createdAt).getTime()) < editWindowMs;
  const canDelete = !isEmailConversation && msg.sender === "agent" && msg.waMessageId && !msg.isDeleted && msg.createdAt &&
    (Date.now() - new Date(msg.createdAt).getTime()) < 15 * 60 * 1000;

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);

  const resolveMentionLabel = (value: string) => {
    const normalized = normalizeDigits(value);
    if (!normalized) return value;
    const participant = groupParticipants?.find((item) => item.phone === normalized || item.rawDigits === normalized);
    if (participant?.name && participant.name !== participant.rawDigits) return participant.name;
    if (participant?.phone) return `+${participant.phone}`;
    return value;
  };

  const handleReaction = async (emoji: string) => {
    try {
      // Optimistic update
      window.dispatchEvent(new CustomEvent("optimistic-reaction", {
        detail: { messageId: msg.id, waMessageId: msg.waMessageId, emoji },
      }));

      console.log("[Reaction] Sending:", { channelType: conversation.channelType, phone: conversation.customerPhone, channelId: conversation.channelId, waMessageId: msg.waMessageId, emoji });

      if (conversation.channelType === "evolution") {
        const result = await invokeCloud("evolution-manage", {
          body: {
            action: "send_reaction",
            phone: conversation.customerPhone,
            channel_id: conversation.channelId,
            message_id: msg.waMessageId,
            emoji,
            is_group: conversation.conversationType === "group",
            from_me: msg.sender === "agent",
          },
        });
        console.log("[Reaction] Evolution result:", result);
        if (result.error) throw result.error;
        if (result.data?.error) throw new Error(result.data.error);
        // Check for success: false pattern (edge function returns 200 with error in body)
        if (result.data?.success === false) throw new Error(result.data?.error || "فشل إرسال التفاعل");
      } else {
        // Meta API reaction
        const result = await invokeCloud("whatsapp-send", {
          body: {
            to: conversation.customerPhone,
            channel_id: conversation.channelId,
            type: "reaction",
            reaction_message_id: msg.waMessageId,
            reaction_emoji: emoji,
          },
        });
        console.log("[Reaction] Meta result:", result);
        if (result.error || result.data?.error) throw new Error(result.data?.error || "Failed");
      }
      setReactionPickerOpen(false);
      toast.success("تم إرسال التفاعل");
    } catch (err: any) {
      console.error("[Reaction] Error:", err);
      // Rollback optimistic reaction
      window.dispatchEvent(new CustomEvent("optimistic-reaction-rollback", {
        detail: { messageId: msg.id },
      }));
      toast.error(err?.message || "فشل إرسال التفاعل");
    }
  };

  const handleTranslate = async () => {
    try {
      const { data } = await invokeCloud("ai-features", {
        body: { action: "translate", text: msg.text, target_language: "العربية" },
      });
      if (data?.error === "ai_not_configured") {
        toast.error("لم يتم إعداد مزود AI");
      } else if (data?.translation) {
        toast.success(data.translation, { duration: 8000 });
      }
    } catch { toast.error("فشل الترجمة"); }
  };

  const hasAnyAction = !msg.isDeleted && (canReply || canEdit || canDelete || (msg.sender === "customer" && msg.type === "text") || msg.waMessageId);

  return (
    <div
      ref={canReply ? swipe.ref : undefined}
      onTouchStart={canReply ? swipe.onTouchStart : undefined}
      onTouchMove={canReply ? swipe.onTouchMove : undefined}
      onTouchEnd={canReply ? swipe.onTouchEnd : undefined}
      className="group relative w-fit max-w-[88%] md:max-w-[75%] lg:max-w-[75%]"
      data-message-id={msg.id}
      data-wa-message-id={msg.waMessageId || undefined}
    >
      {/* Desktop action buttons */}
      {!msg.isDeleted && (
        <div className={cn(
          "absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-10 hidden md:flex items-center gap-0.5",
          msg.sender === "agent" ? "left-full ml-2" : "right-full mr-2"
        )}>
          {canReply && (
            <button onClick={() => onReply(msg)} className="w-7 h-7 rounded-full bg-secondary shadow-md flex items-center justify-center hover:bg-accent" title="رد">
              <Reply className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
          {hasAiConfig && msg.sender === "customer" && msg.type === "text" && (
            <button onClick={handleTranslate} className="w-7 h-7 rounded-full bg-secondary shadow-md flex items-center justify-center hover:bg-accent" title="ترجمة">
              <Languages className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
          {!isEmailConversation && msg.waMessageId && (
            <Popover open={reactionPickerOpen} onOpenChange={setReactionPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="w-7 h-7 rounded-full bg-secondary shadow-md flex items-center justify-center hover:bg-accent"
                  title="تفاعل"
                >
                  <Smile className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" side="top" align="center" style={{ pointerEvents: "auto" }}>
                <div className="flex items-center gap-1">
                  {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-full text-lg transition-transform hover:scale-110 hover:bg-accent active:scale-100"
                      onClick={() => handleReaction(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
          {canEdit && onEdit && (
            <button onClick={() => onEdit(msg)} className="w-7 h-7 rounded-full bg-secondary shadow-md flex items-center justify-center hover:bg-accent" title="تعديل">
              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
          {canDelete && onDelete && (
            <button onClick={() => onDelete(msg)} className="w-7 h-7 rounded-full bg-secondary shadow-md flex items-center justify-center hover:bg-destructive/10" title="حذف">
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </button>
          )}
          {onForward && msg.type === "text" && !msg.isDeleted && (
            <button onClick={() => onForward(msg)} className="w-7 h-7 rounded-full bg-secondary shadow-md flex items-center justify-center hover:bg-accent" title="إعادة توجيه">
              <Forward className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
          {onStar && !msg.isDeleted && (
            <button onClick={() => onStar(msg)} className="w-7 h-7 rounded-full bg-secondary shadow-md flex items-center justify-center hover:bg-accent" title="تمييز">
              <Star className={cn("w-3.5 h-3.5", (msg as any).isStarred ? "text-amber-500 fill-amber-500" : "text-muted-foreground")} />
            </button>
          )}
        </div>
      )}

      {/* Mobile action button (three-dot menu) */}
      {hasAnyAction && (
        <div className={cn(
          "absolute top-1 z-10 md:hidden",
          msg.sender === "agent" ? "-right-8" : "-left-8"
        )}>
          <DropdownMenu open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button className="w-6 h-6 rounded-full bg-secondary/80 shadow-sm flex items-center justify-center opacity-60 active:opacity-100">
                <MoreVertical className="w-3 h-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={msg.sender === "agent" ? "end" : "start"} className="min-w-[140px]">
              {canReply && (
                <DropdownMenuItem onClick={() => onReply(msg)} className="text-xs gap-2">
                  <Reply className="w-3.5 h-3.5" /> رد
                </DropdownMenuItem>
              )}
              {msg.type === "text" && (
                <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(msg.text); toast.success("تم النسخ"); }} className="text-xs gap-2">
                  <FileText className="w-3.5 h-3.5" /> نسخ الرسالة
                </DropdownMenuItem>
              )}
              {onCopyLink && (
                <DropdownMenuItem onClick={() => onCopyLink(msg.id)} className="text-xs gap-2">
                  <Link2 className="w-3.5 h-3.5" /> نسخ رابط الرسالة
                </DropdownMenuItem>
               )}
              {onForward && msg.type === "text" && !msg.isDeleted && (
                <DropdownMenuItem onClick={() => onForward(msg)} className="text-xs gap-2">
                  <Forward className="w-3.5 h-3.5" /> إعادة توجيه
                </DropdownMenuItem>
              )}
              {onStar && !msg.isDeleted && (
                <DropdownMenuItem onClick={() => onStar(msg)} className="text-xs gap-2">
                  <Star className={cn("w-3.5 h-3.5", (msg as any).isStarred ? "text-amber-500 fill-amber-500" : "")} /> {(msg as any).isStarred ? "إلغاء التمييز" : "تمييز ⭐"}
                </DropdownMenuItem>
              )}
              {hasAiConfig && msg.sender === "customer" && msg.type === "text" && (
                <DropdownMenuItem onClick={handleTranslate} className="text-xs gap-2">
                  <Languages className="w-3.5 h-3.5" /> ترجمة
                </DropdownMenuItem>
              )}
              {!isEmailConversation && msg.waMessageId && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5">
                    <p className="text-[10px] text-muted-foreground mb-1">تفاعل</p>
                    <div className="flex gap-1">
                      {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((emoji) => (
                        <button key={emoji} className="text-base hover:scale-125 transition-transform" onClick={() => { handleReaction(emoji); setMobileMenuOpen(false); }}>{emoji}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {(canEdit || canDelete) && <DropdownMenuSeparator />}
              {canEdit && onEdit && (
                <DropdownMenuItem onClick={() => onEdit(msg)} className="text-xs gap-2">
                  <Pencil className="w-3.5 h-3.5" /> تعديل
                </DropdownMenuItem>
              )}
              {canDelete && onDelete && (
                <DropdownMenuItem onClick={() => onDelete(msg)} className="text-xs gap-2 text-destructive focus:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" /> حذف
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {/* Determine if message has media that should render outside bubble */}
      {(() => {
        const isMediaMsg = !msg.isDeleted && msg.type !== "note" && msg.type !== "location" && msg.type !== "contacts" && msg.type !== "poll" && msg.type !== "sticker";
        const textMediaUrl = isMediaMsg ? getStorageUrlFromText(msg.text) : undefined;
        const mediaUrl = isMediaMsg ? (msg.mediaUrl || textMediaUrl) : undefined;
        let textWithoutUrl = textMediaUrl ? msg.text.replace(`\n${textMediaUrl}`, "").trim() : msg.text;
        const isPlaceholder = /^\[(audio|image|video|document|sticker)\]$/i.test(textWithoutUrl);
        if (isPlaceholder) textWithoutUrl = "";
        const hasMedia = !!mediaUrl || (isMediaMsg && msg.type === "audio" && !mediaUrl);
        const hasMediaContent = hasMedia && (mediaUrl || msg.type === "audio");
        const hasText = !!textWithoutUrl && textWithoutUrl.length > 0;
        const isImageOrVideo = hasMediaContent && mediaUrl && (msg.type === "image" || msg.type === "video" || isImageUrl(mediaUrl));
        const isDocument = hasMediaContent && mediaUrl && msg.type === "document";
        const isAudio = msg.type === "audio";
        const shouldSplitMedia = hasMediaContent && (isImageOrVideo || isDocument || isAudio);

        // Group sender name (for groups)
        const groupSenderEl = conversation.conversationType === "group" && msg.sender === "customer" && (() => {
          const rawJid = msg.senderJid || "";
          const jidIsLidBubble = rawJid.includes("@lid");
          const rawPhone = msg.senderPhone || (!jidIsLidBubble ? normalizeDigits(rawJid) : "");
          let resolvedName = msg.senderName || "";
          let isAdmin = false;
          if (rawPhone && groupParticipants?.length) {
            const found = groupParticipants.find(p => p.phone === rawPhone || p.rawDigits === rawPhone || (rawPhone.length >= 7 && (p.phone.endsWith(rawPhone) || rawPhone.endsWith(p.phone))));
            if (found?.name && found.name !== found.phone && found.name !== found.rawDigits && !found.name.startsWith("عضو")) {
              resolvedName = found.name;
            }
            if (found?.admin) isAdmin = true;
          }
          if (!resolvedName && rawPhone) resolvedName = `+${rawPhone}`;
          if (!resolvedName && msg.senderName) resolvedName = msg.senderName;
          if (!resolvedName) return null;
          const colorKey = rawPhone || rawJid || resolvedName;
          return { name: resolvedName, color: getMemberColor(colorKey), isAdmin };
        })();

        // Timestamp element — separate footer row to avoid bubble width collapse
        const timestampEl = (
          <div className={cn(
            "mt-1.5 flex w-full items-center justify-end gap-1 text-[10px] tracking-tight leading-none select-none",
            msg.type === "note" ? "text-amber-500/50"
            : msg.sender === "customer" ? "text-white/55"
            : "text-muted-foreground/50"
          )}>
            <span>{msg.timestamp}</span>
            {msg.editedAt && <span className="text-[9px] italic">{msg.editedBy ? `عدّلها ${msg.editedBy}` : "معدّلة"}</span>}
            {msg.sender === "agent" && msg.type !== "note" && <MessageStatus status={msg.status} isGroup={conversation.conversationType === "group"} readBy={msg.readBy} groupSize={msg.groupSize} />}
          </div>
        );

        // Quoted message element
        const quotedSenderColor = (() => {
          if (conversation.conversationType !== "group" || !msg.quoted?.sender_name) return null;
          // Try to find the phone from groupParticipants by name
          const p = groupParticipants.find(gp => gp.name === msg.quoted?.sender_name);
          return getMemberColor(p?.phone || p?.rawDigits || msg.quoted.sender_name || "");
        })();
        const quotedEl = msg.quoted && (msg.quoted.text || msg.quoted.stanza_id || msg.quoted.message_id) && (
          <div
            onClick={() => scrollToMessage(msg.quoted?.message_id || msg.quoted?.stanza_id)}
            style={quotedSenderColor ? { borderRightColor: quotedSenderColor } : undefined}
            className="rounded-lg px-3 py-2 mb-1.5 border-r-3 text-[12px] leading-relaxed cursor-pointer hover:opacity-80 transition-opacity bg-secondary/60 border-primary/30"
          >
            {msg.quoted.sender_name && (
              <p className="text-[11px] font-bold mb-0.5" style={{ color: quotedSenderColor || undefined }}>{msg.quoted.sender_name}</p>
            )}
            <p className="line-clamp-2 text-muted-foreground">{msg.quoted.text || "[رسالة]"}</p>
          </div>
        );

        // Text rendering function
        const renderText = (text: string) => {
          // Split on mentions: @ followed by phone/name, but NOT inside emails
          const parts: React.ReactNode[] = [];
          // Use a regex that matches standalone mentions (not preceded by alphanumeric/dot)
          const mentionRegex = /(?:^|(?<=[\s\n]))(@\+?[\u0600-\u06FF\w\d]+)/g;
          let lastIndex = 0;
          let match;
          const textStr = text;
          while ((match = mentionRegex.exec(textStr)) !== null) {
            const mentionFull = match[1];
            const mentionRaw = mentionFull.slice(1).replace(/^\+/, "");
            // Skip email-like patterns (pure latin like @gmail, @yahoo)
            const isPhone = /^\d{6,}$/.test(mentionRaw);
            const isArabic = /[\u0600-\u06FF]/.test(mentionRaw);
            if (!isPhone && !isArabic) {
              continue; // skip, it's probably part of an email
            }
            // Add text before this mention
            if (match.index > lastIndex) {
              parts.push(<span key={`t${lastIndex}`}>{textStr.slice(lastIndex, match.index)}</span>);
            }
            let displayLabel = mentionFull;
            if (isPhone) {
              if (conversation.conversationType === "group" && groupParticipants?.length) {
                const participant = groupParticipants.find(p => p.phone === mentionRaw || p.rawDigits === mentionRaw);
                if (participant?.name && participant.name !== participant.phone && participant.name !== participant.rawDigits) {
                  displayLabel = `@${participant.name}`;
                } else {
                  displayLabel = `@+${mentionRaw}`;
                }
              } else {
                displayLabel = `@+${mentionRaw}`;
              }
            }
            parts.push(
              <span key={`m${match.index}`} className={cn(
                "font-semibold px-1 py-0.5 rounded",
                msg.sender === "customer"
                  ? "bg-white/20 text-white"
                  : "bg-primary/10 text-primary"
              )}>{displayLabel}</span>
            );
            lastIndex = match.index + match[0].length;
          }
          if (lastIndex < textStr.length) {
            parts.push(<span key={`t${lastIndex}`}>{textStr.slice(lastIndex)}</span>);
          }
          return <p className="leading-[1.65]" style={{ whiteSpace: "pre-wrap", wordBreak: "normal", overflowWrap: "anywhere", writingMode: "horizontal-tb" }}>{parts.length > 0 ? parts : text}</p>;
        };

        // Translation element
        const translationEl = translationText && msg.sender === "customer" && (
          <div className="mt-1 pt-1 border-t border-border/20">
            <p className="text-[11px] text-primary/80 whitespace-pre-wrap leading-relaxed">
              <Languages className="w-3 h-3 inline-block ml-1 opacity-60" />
              {translationText}
            </p>
          </div>
        );

        // === DELETED MESSAGE ===
        if (msg.isDeleted) {
          return (
            <div className="rounded-2xl px-4 py-2.5 bg-muted/30 border border-dashed border-border/20 text-muted-foreground italic">
              <div className="flex items-center gap-1.5 text-xs opacity-70">
                <XCircle className="w-3.5 h-3.5" />
                <span>تم حذف هذه الرسالة</span>
                {msg.deletedBy && <span className="text-[10px] font-medium">— {msg.deletedBy}</span>}
              </div>
            </div>
          );
        }

        // === NOTE MESSAGE ===
        if (msg.type === "note") {
          return (
            <div className="inline-block min-w-[100px] max-w-full rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed bg-amber-50 dark:bg-amber-500/10 border border-amber-200/30 dark:border-amber-500/10 text-foreground rounded-br-sm" style={{ wordBreak: "normal", overflowWrap: "anywhere", whiteSpace: "pre-wrap", writingMode: "horizontal-tb" }}>
              <div className="flex items-center gap-1 mb-1 text-amber-500 whitespace-nowrap">
                <StickyNote className="w-3 h-3 shrink-0" />
                <span className="text-[10px] font-semibold">ملاحظة داخلية</span>
              </div>
              {quotedEl}
              {renderText(msg.text)}
              {timestampEl}
            </div>
          );
        }

        // === STICKER ===
        if (msg.type === "sticker") {
          const stickerUrl = msg.mediaUrl || getStorageUrlFromText(msg.text) || undefined;
          return (
            <div>
              {stickerUrl && <ResolvedMedia url={stickerUrl} type="sticker" isAgent={msg.sender === "agent"} onImageClick={onImageClick} />}
              {!stickerUrl && <span className="text-xs text-muted-foreground">ملصق</span>}
              {timestampEl}
            </div>
          );
        }

        // === LOCATION ===
        if (msg.type === "location" && msg.location) {
          return (
            <div>
              <a
                href={`https://www.google.com/maps?q=${msg.location.latitude},${msg.location.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:opacity-90 transition-opacity"
              >
                <img
                  src={`https://maps.googleapis.com/maps/api/staticmap?center=${msg.location.latitude},${msg.location.longitude}&zoom=15&size=280x150&markers=color:red|${msg.location.latitude},${msg.location.longitude}&key=${import.meta.env.VITE_GOOGLE_MAPS_KEY||''}`}
                  alt="موقع"
                  className="w-[280px] h-[150px] object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://staticmap.openstreetmap.de/staticmap.php?center=${msg.location!.latitude},${msg.location!.longitude}&zoom=15&size=280x150&markers=${msg.location!.latitude},${msg.location!.longitude},red-pushpin`;
                  }}
                />
                <div className="px-2.5 py-1.5 bg-card flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-destructive shrink-0" />
                  <div>
                    {msg.location.name && <p className="text-[11px] font-semibold">{msg.location.name}</p>}
                    {msg.location.address && <p className="text-[10px] text-muted-foreground">{msg.location.address}</p>}
                    {!msg.location.name && !msg.location.address && <p className="text-[10px]">📍 عرض الموقع</p>}
                  </div>
                </div>
              </a>
              {timestampEl}
            </div>
          );
        }

        // === CONTACTS ===
        if (msg.type === "contacts" && msg.contacts && msg.contacts.length > 0) {
          return (
            <div>
              <div className="space-y-1.5 mb-1">
                {msg.contacts.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 bg-card rounded-xl px-3 py-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Contact className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate">{c.name}</p>
                      {c.phone && <p className="text-[10px] text-muted-foreground font-mono" dir="ltr">{c.phone}</p>}
                      {c.email && <p className="text-[10px] text-muted-foreground">{c.email}</p>}
                    </div>
                  </div>
                ))}
              </div>
              {timestampEl}
            </div>
          );
        }

        // === POLL ===
        if (msg.type === "poll" && msg.poll) {
          return (
            <div className="bg-card rounded-xl p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <p className="text-xs font-bold flex items-center gap-1 mb-2">📊 {msg.poll.question}</p>
              {msg.poll.options.map((opt) => {
                const votes = msg.poll.votes?.[opt.id]?.length || 0;
                return (
                  <div key={opt.id} className="flex items-center gap-2 bg-secondary/50 rounded-lg px-2.5 py-1.5 mb-1">
                    <span className="text-xs flex-1">{opt.title}</span>
                    {votes > 0 && <Badge variant="secondary" className="text-[9px] px-1.5">{votes}</Badge>}
                  </div>
                );
              })}
              {timestampEl}
            </div>
          );
        }

        // === MEDIA + TEXT MESSAGES ===
        // Media renders OUTSIDE the bubble, text (if any) in a bubble below
        if (shouldSplitMedia) {
          return (
            <div className="inline-flex flex-col gap-1 max-w-full">
              {/* Group sender label — only for first in consecutive group */}
              {groupSenderEl && isFirstInGroup !== false && (
                <span className="text-[10.5px] font-bold flex items-center gap-1" style={{ color: groupSenderEl.color }}>
                  {groupSenderEl.name}
                  {groupSenderEl.isAdmin && <Crown className="w-2.5 h-2.5 inline shrink-0" />}
                </span>
              )}
              {/* Quoted message */}
              {quotedEl}
              {/* Media - standalone, no bubble */}
              {isImageOrVideo && mediaUrl && msg.type !== "video" && (
                <ResolvedMedia url={mediaUrl} type={msg.type} isAgent={msg.sender === "agent"} onImageClick={onImageClick} />
              )}
              {isImageOrVideo && mediaUrl && msg.type === "video" && (
                <ResolvedMedia url={mediaUrl} type="video" isAgent={msg.sender === "agent"} onImageClick={onImageClick} />
              )}
              {isDocument && mediaUrl && (
                <ResolvedMedia url={mediaUrl} type="document" isAgent={msg.sender === "agent"} onImageClick={onImageClick} />
              )}
              {isAudio && mediaUrl && (
                <div className={cn(
                  "rounded-2xl px-3.5 py-2.5 w-[260px] max-w-full overflow-hidden",
                  msg.sender === "agent"
                    ? "bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    : "bg-[hsl(158,45%,42%)]"
                )}>
                  <ResolvedMedia url={mediaUrl} type="audio" isAgent={msg.sender === "agent"} onImageClick={onImageClick} />
                </div>
              )}
              {isAudio && !mediaUrl && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                  <Mic className="w-3.5 h-3.5" />
                  <span>رسالة صوتية</span>
                </div>
              )}
              {/* Caption text in a mini bubble */}
              {hasText && (
                <div className={cn(
                  "inline-block min-w-[100px] max-w-full rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed",
                  msg.sender === "agent"
                    ? "bg-card text-foreground rounded-br-sm shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    : "bg-[hsl(158,45%,42%)] text-white rounded-bl-sm"
                )} style={{ wordBreak: "normal", overflowWrap: "anywhere", whiteSpace: "pre-wrap", writingMode: "horizontal-tb" }}>
                  {renderText(textWithoutUrl)}
                  {translationEl}
                  {timestampEl}
                </div>
              )}
              {/* Timestamp if no text caption */}
              {!hasText && timestampEl}
            </div>
          );
        }

        // === EMAIL MESSAGE (professional layout) ===
        const isEmailConv = conversation.channelType === "email" || conversation.conversationType === "email";
        if (isEmailConv && msg.emailMeta) {
          const em = msg.emailMeta;

          // Decode MIME-encoded strings (=?UTF-8?B?...?=) that may leak into stored data
          const decodeMime = (s: string | undefined | null): string => {
            if (!s) return "";
            return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, charset, enc, encoded) => {
              try {
                if (enc.toUpperCase() === "B") {
                  const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
                  return new TextDecoder(charset).decode(bytes);
                }
                const qp = encoded.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_: string, h: string) => String.fromCharCode(parseInt(h, 16)));
                return new TextDecoder(charset).decode(new Uint8Array([...qp].map(c => c.charCodeAt(0))));
              } catch { return encoded; }
            });
          };

          const decodedSubject = decodeMime(em.subject);
          const decodedFrom = decodeMime(em.from);
          const decodedTo = decodeMime(em.to);
          const decodedCc = decodeMime(em.cc);

          // Strip the "📧 subject\n\n" prefix from display text if present
          let emailDisplayText = textWithoutUrl;
          if (em.subject) {
            const prefix = `📧 ${em.subject}\n\n`;
            const decodedPrefix = `📧 ${decodedSubject}\n\n`;
            if (emailDisplayText.startsWith(prefix)) {
              emailDisplayText = emailDisplayText.slice(prefix.length);
            } else if (emailDisplayText.startsWith(decodedPrefix)) {
              emailDisplayText = emailDisplayText.slice(decodedPrefix.length);
            } else if (emailDisplayText.startsWith(`📧 `)) {
              const nlIdx = emailDisplayText.indexOf("\n\n");
              if (nlIdx !== -1) emailDisplayText = emailDisplayText.slice(nlIdx + 2);
            }
          }
          if (!emailDisplayText.trim()) emailDisplayText = textWithoutUrl;

          // Client-side cleanup of email body: remove trailing signatures, URLs, phone numbers
          const cleanEmailDisplay = (text: string): string => {
            const lines = text.split("\n");
            // Cut at signature delimiters
            const sigIdx = lines.findIndex(l => /^--\s*$/.test(l) || /^_{5,}$/.test(l.trim()) || /^-{5,}$/.test(l.trim()) || /^Sent from my /i.test(l.trim()) || /^(تم الإرسال من|أُرسل من|مرسل من)\s/i.test(l.trim()) || /^Get Outlook for/i.test(l.trim()));
            const trimmedLines = sigIdx > 0 ? lines.slice(0, sigIdx) : lines;
            // Remove trailing URL-only, domain-only, phone-only lines
            while (trimmedLines.length > 0) {
              const last = trimmedLines[trimmedLines.length - 1].trim();
              if (!last) { trimmedLines.pop(); continue; }
              if (/^(https?:\/\/|www\.)\S+$/i.test(last)) { trimmedLines.pop(); continue; }
              if (/^[a-z0-9-]+\.[a-z]{2,}(\.[a-z]{2,})?$/i.test(last)) { trimmedLines.pop(); continue; }
              if (/^(www\.|https?:\/\/).*https?:\/\//i.test(last)) { trimmedLines.pop(); continue; }
              if (/^[+\d\s()-]{7,}$/.test(last)) { trimmedLines.pop(); continue; }
              if (/^\[since\s+\d{4}\]$/i.test(last)) { trimmedLines.pop(); continue; }
              break;
            }
            return trimmedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
          };

          emailDisplayText = cleanEmailDisplay(emailDisplayText);

          return (
            <div className={cn(
              "inline-block min-w-[280px] max-w-full rounded-2xl overflow-hidden text-[14px] leading-relaxed",
              msg.sender === "agent"
                ? "bg-card text-foreground rounded-br-sm shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
                : "bg-card text-foreground rounded-bl-sm shadow-[0_1px_4px_rgba(0,0,0,0.06)] border border-border/30"
            )}>
              {/* Email Header */}
              <div className="px-4 pt-3 pb-2 border-b border-border/20 space-y-1.5">
                {/* Subject */}
                {decodedSubject && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
                    <p className="text-[13px] font-bold text-foreground truncate">{decodedSubject}</p>
                  </div>
                )}
                {/* From */}
                {decodedFrom && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-muted-foreground/70 font-medium min-w-[28px]">من:</span>
                    <span className="text-foreground/80 truncate">{decodedFrom}</span>
                  </div>
                )}
                {/* To */}
                {decodedTo && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-muted-foreground/70 font-medium min-w-[28px]">إلى:</span>
                    <span className="text-foreground/80 truncate">{decodedTo}</span>
                  </div>
                )}
                {/* CC */}
                {decodedCc && (
                  <div className="flex items-center gap-2 text-[11px]">
                    <Users className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                    <span className="text-muted-foreground/70 font-medium">نسخة:</span>
                    <span className="text-foreground/70 truncate">{decodedCc}</span>
                  </div>
                )}
              </div>
              {/* Attachments */}
              {em.attachments && em.attachments.length > 0 && (
                <div className="px-4 py-2 border-t border-border/20 space-y-1">
                  {em.attachments.map((att, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5 px-2 bg-secondary/40 rounded-lg">
                      <Paperclip className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-[12px] text-foreground/80 truncate">{att.filename}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Email Body */}
              <div className="px-4 py-3" style={{ wordBreak: "normal", overflowWrap: "anywhere", whiteSpace: "pre-wrap", writingMode: "horizontal-tb" }}>
                {renderText(emailDisplayText)}
                {translationEl}
              </div>
              {/* Footer */}
              <div className="px-4 pb-2">
                {timestampEl}
              </div>
            </div>
          );
        }

        // === REACTION MESSAGE ===
        if (msg.type === "reaction") {
          const meta = msg.metadata as any;
          const emoji   = meta?.reaction?.text || meta?.emoji || msg.text?.replace(/\[reaction[^\]]*\]/i, "").trim() || "❤️";
          const onMsg   = meta?.reaction?.key?.id || meta?.quoted_id;
          if (!emoji || emoji.startsWith("[")) {
            // invisible reaction placeholder — skip rendering
            return <></>;
          }
          return (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-muted/40 border border-border/30 text-sm">
              <span className="text-xl leading-none">{emoji}</span>
              <span className="text-[11px] text-muted-foreground">
                {msg.sender === "customer" ? "تفاعل العميل" : "تفاعلت"}{onMsg ? " على رسالة" : ""}
              </span>
              {timestampEl}
            </div>
          );
        }

        // === POLL RESPONSE / POLL UPDATE ===
        if (msg.type === "poll_update" || msg.type === "poll_response") {
          const meta = msg.metadata as any;
          const votes: string[] = meta?.selected_options || meta?.votes || [];
          return (
            <div className="px-3 py-2 rounded-2xl bg-muted/40 border border-border/30 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-semibold">
                <span>📊</span>
                <span>صوّت في استطلاع</span>
              </div>
              {votes.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {votes.map((v, i) => (
                    <span key={i} className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">{v}</span>
                  ))}
                </div>
              )}
              {timestampEl}
            </div>
          );
        }

        // === ORDER MESSAGE ===
        if (msg.type === "order") {
          const meta = msg.metadata as any;
          const items: any[] = meta?.order?.product_items || meta?.products || [];
          const total   = meta?.order?.total_amount;
          const currency = meta?.order?.currency || "SAR";
          return (
            <div className="px-3 py-2.5 rounded-2xl bg-muted/40 border border-border/30 space-y-1.5 min-w-[180px]">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold">
                <ShoppingBag className="w-4 h-4 text-primary shrink-0" />
                <span>طلب منتجات</span>
              </div>
              {items.length > 0 && (
                <div className="space-y-0.5">
                  {items.slice(0, 3).map((item: any, i: number) => (
                    <div key={i} className="flex justify-between items-center text-[11px]">
                      <span className="text-foreground truncate max-w-[130px]">{item.product_name || item.name || "منتج"}</span>
                      <span className="text-muted-foreground shrink-0 mr-2">x{item.quantity || 1}</span>
                    </div>
                  ))}
                  {items.length > 3 && <span className="text-[10px] text-muted-foreground">+{items.length - 3} منتجات أخرى</span>}
                </div>
              )}
              {total && (
                <div className="text-[11px] font-semibold text-primary border-t border-border/30 pt-1">
                  الإجمالي: {Number(total) / 1000} {currency}
                </div>
              )}
              {timestampEl}
            </div>
          );
        }

        // === CALL LOG ===
        if (msg.type === "call_log" || msg.type === "call") {
          const meta = msg.metadata as any;
          const status   = meta?.call_status || (msg.text?.includes("missed") ? "missed" : "received");
          const duration = meta?.duration;
          const isMissed = status === "missed" || status === "rejected";
          return (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-2xl border ${isMissed ? "bg-destructive/5 border-destructive/20" : "bg-success/5 border-success/20"}`}>
              <PhoneIcon className={`w-4 h-4 shrink-0 ${isMissed ? "text-destructive" : "text-success"}`} />
              <div className="flex flex-col">
                <span className={`text-[11px] font-semibold ${isMissed ? "text-destructive" : "text-success"}`}>
                  {isMissed ? "مكالمة فائتة" : "مكالمة واتساب"}
                </span>
                {duration && <span className="text-[10px] text-muted-foreground">{Math.floor(Number(duration) / 60)}:{String(Number(duration) % 60).padStart(2, "0")}</span>}
              </div>
              {timestampEl}
            </div>
          );
        }

        // === EPHEMERAL / DISAPPEARING MESSAGE NOTICE ===
        if (msg.type === "ephemeral" || msg.type === "disappearing") {
          return (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-muted/30 border border-dashed border-border/30 text-[11px] text-muted-foreground">
              <Timer className="w-3.5 h-3.5 shrink-0" />
              <span>تم تفعيل الرسائل المختفية</span>
              {timestampEl}
            </div>
          );
        }

        // === PAYMENT / INVOICE ===
        if (msg.type === "payment") {
          const meta = msg.metadata as any;
          const amount   = meta?.amount;
          const currency = meta?.currency || "SAR";
          return (
            <div className="px-3 py-2.5 rounded-2xl bg-success/5 border border-success/20 space-y-0.5 min-w-[160px]">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-success">
                <CreditCard className="w-4 h-4 shrink-0" />
                <span>طلب دفع</span>
              </div>
              {amount && <div className="text-[12px] font-bold">{amount} {currency}</div>}
              {timestampEl}
            </div>
          );
        }

        // === UNSUPPORTED / UNKNOWN FALLBACK ===
        const isUnsupportedText = !msg.text || msg.text.startsWith("[") || msg.text === "null" || msg.text === "undefined";
        if (isUnsupportedText && !msg.mediaUrl) {
          const typeLabel: Record<string, { icon: string; label: string }> = {
            "gif":           { icon: "🎞️", label: "صورة متحركة GIF" },
            "sticker_pack":  { icon: "🎨", label: "مجموعة ملصقات" },
            "product":       { icon: "🛍️", label: "منتج" },
            "catalog":       { icon: "📂", label: "كتالوج منتجات" },
            "cta_url":       { icon: "🔗", label: "رابط زر" },
            "interactive":   { icon: "📋", label: "رسالة تفاعلية" },
            "button_reply":  { icon: "🔘", label: "ردّ على زر" },
            "list_reply":    { icon: "📝", label: "اختيار من قائمة" },
            "system":        { icon: "⚙️", label: "رسالة نظام" },
            "native_flow":   { icon: "📱", label: "نموذج واتساب" },
            "request_welcome":{ icon: "👋", label: "طلب بدء محادثة" },
          };
          const fallback = typeLabel[msg.type || ""] || { icon: "📎", label: `رسالة (${msg.type || "غير معروف"})` };
          return (
            <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-muted/30 border border-dashed border-border/30">
              <span className="text-base leading-none">{fallback.icon}</span>
              <span className="text-[11px] text-muted-foreground italic">{fallback.label}</span>
              {timestampEl}
            </div>
          );
        }

        // === PURE TEXT MESSAGE (no media) ===
        return (
          <div className={cn(
            "inline-block min-w-[100px] max-w-full rounded-2xl px-4 py-2 text-[14px] leading-relaxed",
            msg.sender === "agent"
              ? "bg-card text-foreground rounded-br-sm shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              : "bg-[hsl(158,45%,42%)] text-white rounded-bl-sm"
          )} style={{ wordBreak: "normal", overflowWrap: "anywhere", whiteSpace: "pre-wrap", writingMode: "horizontal-tb" }}>
            {groupSenderEl && isFirstInGroup !== false && (
              <div className="text-[10.5px] font-bold mb-0.5 flex items-center gap-1" style={{ color: groupSenderEl.color }}>
                {groupSenderEl.name}
                {groupSenderEl.isAdmin && <Crown className="w-2.5 h-2.5 inline shrink-0" />}
              </div>
            )}
            {quotedEl && msg.sender === "customer" && (
              <div
                onClick={() => scrollToMessage(msg.quoted?.message_id || msg.quoted?.stanza_id)}
                className="rounded-lg px-3 py-2 mb-1.5 border-r-3 text-[12px] leading-relaxed cursor-pointer hover:opacity-80 transition-opacity bg-white/12 border-white/40"
              >
                {msg.quoted?.sender_name && (
                  <p className="text-[11px] font-bold mb-0.5 text-white/90">{msg.quoted.sender_name}</p>
                )}
                <p className="line-clamp-2 text-white/70">{msg.quoted?.text || "[رسالة]"}</p>
              </div>
            )}
            {quotedEl && msg.sender === "agent" && (
              <div
                onClick={() => scrollToMessage(msg.quoted?.message_id || msg.quoted?.stanza_id)}
                className="rounded-lg px-3 py-2 mb-1.5 border-r-3 text-[12px] leading-relaxed cursor-pointer hover:opacity-80 transition-opacity bg-secondary/60 border-primary/30"
              >
                {msg.quoted?.sender_name && (
                  <p className="text-[11px] font-bold mb-0.5 text-primary">{msg.quoted.sender_name}</p>
                )}
                <p className="line-clamp-2 text-muted-foreground">{msg.quoted?.text || "[رسالة]"}</p>
              </div>
            )}
            {msg.type === "template" && (
              <div className="flex items-center gap-1 mb-1 text-white/70">
                <FileText className="w-3 h-3" />
                <span className="text-[10px] font-semibold">قالب</span>
              </div>
            )}
            {renderText(textWithoutUrl)}
            {translationEl}
            {timestampEl}
          </div>
        );
      })()}
      {/* Reactions badge - WhatsApp style floating below bubble */}
      {msg.reactions && msg.reactions.length > 0 && (() => {
        // Group reactions by emoji with count
        const grouped = msg.reactions.reduce((acc, r) => {
          if (!acc[r.emoji]) acc[r.emoji] = [];
          acc[r.emoji].push(r);
          return acc;
        }, {} as Record<string, typeof msg.reactions>);
        return (
          <div className={cn("flex -mt-2 mb-1", msg.sender === "agent" ? "justify-start ml-2" : "justify-end mr-2")}>
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent("show-reaction-details", {
                  detail: { reactions: msg.reactions, messageId: msg.id },
                }));
              }}
              className="flex items-center gap-0.5 bg-card border border-border/40 rounded-full px-1.5 py-0.5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            >
              {Object.entries(grouped).map(([emoji, list]) => (
                <span key={emoji} className="flex items-center gap-0.5">
                  <span className="text-sm">{emoji}</span>
                  {list.length > 1 && <span className="text-[10px] text-muted-foreground font-medium">{list.length}</span>}
                </span>
              ))}
            </button>
          </div>
        );
      })()}
    </div>
  );
};

const ChatArea = ({ conversation, messages, templates, onBack, onSendMessage, onSendTemplate, onStatusChange, onTransfer, onTagsChange, onEditMessage, onDeleteMessage, onShowCustomerInfo, scrollToMessageId, onScrollToMessageDone, onStarMessage, onForwardMessage, onConversationMerged, onDeleteConversation, hasMoreMessages, onLoadMoreMessages, loadingMoreMessages }: ChatAreaProps) => {
  const { orgId, user, profile, userRole, isSuperAdmin } = useAuth();
  const [inputText, setInputText] = useState("");
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [templateVars, setTemplateVars] = useState<string[]>([]);
  const [customerTyping, setCustomerTyping] = useState(false);
  const [isNoteMode, setIsNoteMode] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showClosureReason, setShowClosureReason] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState<string | null>((conversation as any).snoozed_until || null);
  const [imagePreview, setImagePreview] = useState<{ file: File; url: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [editText, setEditText] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTagText, setNewTagText] = useState("");
  const [allOrgTags, setAllOrgTags] = useState<string[]>([]);
  const [showTagPopover, setShowTagPopover] = useState(false);
  const [orgTagDefs, setOrgTagDefs] = useState<Array<{ id: string; name: string; color: string; count: number }>>([]);
  const [newTagDefName, setNewTagDefName] = useState("");
  const [savedReplies, setSavedReplies] = useState<Array<{ id: string; shortcut: string; title: string; content: string; category: string }>>([]);
  const [showSavedReplies, setShowSavedReplies] = useState(false);
  const [savedReplyFilter, setSavedReplyFilter] = useState("");
  const [windowInfo, setWindowInfo] = useState(() => getWindowRemaining(conversation.lastCustomerMessageAt));
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [groupParticipants, setGroupParticipants] = useState<Array<{ id: string; name: string; phone: string; rawDigits: string; admin?: boolean; isSaved?: boolean }>>([]);
  const [filterMemberPhone, setFilterMemberPhone] = useState<string | null>(null); // filter messages by member
  const [showGroupMembersBar, setShowGroupMembersBar] = useState(false);
  const [otherTypingAgents, setOtherTypingAgents] = useState<string[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [translatingMsgId, setTranslatingMsgId] = useState<string | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [hasAiConfig, setHasAiConfig] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showInternalProductPicker, setShowInternalProductPicker] = useState(false);
  const [isBlocked, setIsBlocked] = useState(conversation.isBlocked || false);
  const [hasProducts, setHasProducts] = useState(false);
  const [groupPicture, setGroupPicture] = useState<string | null>(conversation.profilePic || null);
  const [showAddMembersDialog, setShowAddMembersDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ title: string; description?: string; action: () => void } | null>(null);
  const [currentChannelPhone, setCurrentChannelPhone] = useState("");
  const [mentionMessageIds, setMentionMessageIds] = useState<string[]>([]);
  const [currentMentionIdx, setCurrentMentionIdx] = useState(-1);
  const [reactionDetails, setReactionDetails] = useState<{ reactions: Array<{ emoji: string; fromMe: boolean; participant?: string; participantName?: string }>; messageId: string } | null>(null);
  const [addMemberPhone, setAddMemberPhone] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [showContactCard, setShowContactCard] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [showDisappearingMenu, setShowDisappearingMenu] = useState(false);
  const [showTicketDialog, setShowTicketDialog] = useState(false);
  const [selectingMessages, setSelectingMessages] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set());
  const [enterToSend, setEnterToSend] = useState(() => {
    const saved = localStorage.getItem("enterToSend");
    return saved !== null ? saved === "true" : true;
  });
  const [emailToChips, setEmailToChips] = useState<string[]>([]);
  const [emailCcChips, setEmailCcChips] = useState<string[]>([]);
  const [emailBccChips, setEmailBccChips] = useState<string[]>([]);
  const [emailToInput, setEmailToInput] = useState("");
  const [emailCcInput, setEmailCcInput] = useState("");
  const [emailBccInput, setEmailBccInput] = useState("");
  const [showEmailFields, setShowEmailFields] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailSignature, setEmailSignature] = useState("");
  const [ticketAgents, setTicketAgents] = useState<{id:string;full_name:string}[]>([]);
  const [showEmailTemplatePicker, setShowEmailTemplatePicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserNearBottomRef = useRef(true);
  const prevConvIdRef = useRef(conversation.id);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const groupPicInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track @lid mention JIDs that can't be extracted from message text by phone regex
  const mentionedJidsRef = useRef<string[]>([]);
  const [customerLastSeen, setCustomerLastSeen] = useState<string | null>(null);
  const isGroup = conversation.conversationType === "group";
  const isEvolutionChannel = conversation.channelType === "evolution";
  const isMetaChannel = conversation.channelType === "meta_api";
  const isEmailChannel = conversation.channelType === "email" || conversation.conversationType === "email";

  // Deep link: scroll to specific message
  useEffect(() => {
    if (!scrollToMessageId || messages.length === 0) return;
    const el = document.getElementById(`msg-${scrollToMessageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "rounded-lg");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary", "rounded-lg"), 3000);
      onScrollToMessageDone?.();
    }
  }, [scrollToMessageId, messages.length]);

  // Fetch customer last seen for evolution channels
  useEffect(() => {
    if (isGroup || !isEvolutionChannel || !conversation.customerPhone || !conversation.channelId) return;
    setCustomerLastSeen(null);
    invokeCloud("evolution-manage", {
      body: {
        action: "fetch_presence",
        phone: conversation.customerPhone,
        channel_id: conversation.channelId,
      },
    }).then(({ data }) => {
      if (data?.last_seen) {
        const ts = typeof data.last_seen === "number"
          ? new Date(data.last_seen * 1000)
          : new Date(data.last_seen);
        if (!isNaN(ts.getTime())) {
          const diff = Date.now() - ts.getTime();
          const mins = Math.floor(diff / 60000);
          if (mins < 2) {
            setCustomerLastSeen("متصل الآن");
          } else if (mins < 60) {
            setCustomerLastSeen(`آخر ظهور: منذ ${mins} دقيقة`);
          } else {
            const hours = Math.floor(mins / 60);
            if (hours < 24) {
              setCustomerLastSeen(`آخر ظهور: منذ ${hours} ساعة`);
            } else {
              setCustomerLastSeen(`آخر ظهور: ${ts.toLocaleDateString("ar-SA")}`);
            }
          }
        }
      } else if (data?.status === "composing") {
        setCustomerLastSeen("يكتب...");
      } else if (data?.status === "available" || data?.status === "online") {
        setCustomerLastSeen("متصل الآن");
      }
    }).catch(() => {});
  }, [conversation.id, conversation.customerPhone, conversation.channelId, isEvolutionChannel, isGroup]);

  const copyConversationLink = useCallback(() => {
    const url = `${window.location.origin}/inbox?conversation=${conversation.id}`;
    navigator.clipboard.writeText(url).then(() => toast.success("تم نسخ رابط المحادثة"));
  }, [conversation.id]);

  const copyMessageLink = useCallback((msgId: string) => {
    const url = `${window.location.origin}/inbox?conversation=${conversation.id}&message=${msgId}`;
    navigator.clipboard.writeText(url).then(() => toast.success("تم نسخ رابط الرسالة"));
  }, [conversation.id]);


  useEffect(() => {
    setIsBlocked(conversation.isBlocked || false);
    setGroupPicture(conversation.profilePic || null);
    // Reset template picker state on conversation switch.
    // Templates should only be shown when user attempts to send and the 24h window requires it.
    setShowTemplates(false);
    setSelectedTemplate(null);
    setTemplateVars([]);
    // Auto-populate email subject from conversation notes
    if (isEmailChannel) {
      const subj = (conversation as any).notes?.replace(/^📧\s*/, "") || "";
      setEmailSubject(subj ? `Re: ${subj}` : "");
      // Auto-populate CC from last inbound message's CC
      const lastInbound = [...messages].reverse().find(m => m.sender === "customer" && (m as any).metadata?.email_cc);
      if (lastInbound) {
        const ccRaw = (lastInbound as any).metadata?.email_cc || "";
        const ccList = ccRaw.split(",").map((s: string) => s.trim()).filter(Boolean);
        setEmailCcChips(ccList);
      } else {
        setEmailCcChips([]);
      }
      setEmailBccChips([]);
    }
  }, [conversation.id, conversation.isBlocked, conversation.profilePic]);

  // Fetch email signature for preview (per-employee takes priority over org-level)
  useEffect(() => {
    if (!isEmailChannel || !orgId) return;
    (async () => {
      const [{ data: profileData }, { data: configData }] = await Promise.all([
        supabase.from("profiles").select("email_signature").eq("id", user?.id || "").maybeSingle(),
        supabase.from("email_configs").select("email_signature").eq("org_id", orgId).eq("is_active", true).limit(1).maybeSingle(),
      ]);
      setEmailSignature(profileData?.email_signature || configData?.email_signature || "");
    })();
  }, [isEmailChannel, orgId]);

  // Compute mention message IDs for floating @ navigation
  useEffect(() => {
    if (!isGroup || !currentChannelPhone) {
      setMentionMessageIds([]);
      setCurrentMentionIdx(-1);
      return;
    }
    const ids = messages
      .filter((m) => m.mentioned && Array.isArray(m.mentioned) && m.mentioned.some((mn) => {
        const normalized = String(mn).replace(/\D/g, "");
        return normalized === currentChannelPhone || currentChannelPhone.endsWith(normalized) || normalized.endsWith(currentChannelPhone);
      }))
      .map((m) => m.id);
    setMentionMessageIds(ids);
    if (ids.length > 0) setCurrentMentionIdx(ids.length - 1);
    else setCurrentMentionIdx(-1);
  }, [messages, currentChannelPhone, isGroup]);

  const navigateToMention = (direction: "up" | "down") => {
    if (mentionMessageIds.length === 0) return;
    let nextIdx = currentMentionIdx;
    if (direction === "up") nextIdx = Math.max(0, currentMentionIdx - 1);
    else nextIdx = Math.min(mentionMessageIds.length - 1, currentMentionIdx + 1);
    setCurrentMentionIdx(nextIdx);
    const msgId = mentionMessageIds[nextIdx];
    const el = document.querySelector(`[data-message-id="${msgId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary/60", "rounded-xl");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary/60", "rounded-xl"), 2000);
    }
    // Reset mention count on first navigation
    if (conversation.unreadMentionCount && conversation.unreadMentionCount > 0) {
      supabase.from("conversations").update({ unread_mention_count: 0 }).eq("id", conversation.id).then();
    }
  };

  // Listen for reaction detail sheet
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setReactionDetails(detail);
    };
    window.addEventListener("show-reaction-details", handler);
    return () => window.removeEventListener("show-reaction-details", handler);
  }, []);

  const handleToggleBlock = async () => {
    const action = isBlocked ? "unblock_contact" : "block_contact";
    const newBlocked = !isBlocked;
    try {
      if (conversation.channelType === "evolution") {
        const { data, error } = await invokeCloud("evolution-manage", {
          body: { action, phone: conversation.customerPhone, channel_id: conversation.channelId },
        });
        if (error || data?.error) {
          throw new Error(data?.error || "فشل تنفيذ الحظر على واتساب");
        }
      }
      // Update blacklisted_numbers table
      if (newBlocked) {
        // Delete first to avoid conflicts, then insert
        await supabase.from("blacklisted_numbers")
          .delete()
          .eq("org_id", orgId)
          .eq("phone", conversation.customerPhone);
        await supabase.from("blacklisted_numbers").insert({
          org_id: orgId,
          phone: conversation.customerPhone,
          blocked_by: user?.id || null,
          reason: "حظر يدوي من صندوق الوارد",
        });
      } else {
        await supabase.from("blacklisted_numbers")
          .delete()
          .eq("org_id", orgId)
          .eq("phone", conversation.customerPhone);
      }
      setIsBlocked(newBlocked);
      toast.success(newBlocked ? "✅ تم حظر الرقم في واتساب بنجاح" : "✅ تم إلغاء حظر الرقم في واتساب");
    } catch (err: any) {
      toast.error(newBlocked ? `فشل حظر الرقم: ${err?.message || ""}` : `فشل إلغاء الحظر: ${err?.message || ""}`);
    }
  };

  const handleChangeGroupPicture = async (file: File) => {
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `group-pics/${orgId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("chat-media").upload(path, file);
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(path);
      if (!urlData?.publicUrl) throw new Error("لم يتم الحصول على رابط الصورة");
      const { error } = await invokeCloud("evolution-manage", {
        body: {
          action: "update_group_picture",
          channel_id: conversation.channelId,
          group_jid: conversation.customerPhone,
          image_url: urlData.publicUrl,
        },
      });
      if (error) throw error;
      toast.success("✅ تم تحديث صورة القروب");
    } catch (err: any) {
      toast.error("فشل تحديث صورة القروب: " + (err.message || ""));
    }
  };

  const handleLeaveGroup = () => {
    setConfirmAction({
      title: "الخروج من القروب؟",
      action: async () => {
        try {
          const { error } = await invokeCloud("evolution-manage", {
            body: { action: "leave_group", group_jid: conversation.customerPhone, channel_id: conversation.channelId },
          });
          if (error) throw error;
          toast.success("✅ تم الخروج من القروب");
        } catch (err: any) {
          toast.error("فشل الخروج: " + (err.message || ""));
        }
      },
    });
  };

  const handleAddMember = async () => {
    const phone = addMemberPhone.replace(/\D/g, "");
    if (!phone) return;
    setAddingMember(true);
    try {
      const { error } = await invokeCloud("evolution-manage", {
        body: { action: "group_add", group_jid: conversation.customerPhone, participants: [phone], channel_id: conversation.channelId },
      });
      if (error) throw error;
      toast.success("✅ تمت إضافة العضو");
      setAddMemberPhone("");
      setShowAddMembersDialog(false);
      // Refresh participants list
      const { data } = await invokeCloud("evolution-manage", {
        body: { action: "group_info", group_jid: conversation.customerPhone, channel_id: conversation.channelId },
      });
      const info = data?.data?.data || data?.data || {};
      setGroupPicture(info?.pictureUrl || info?.picture || info?.profilePictureUrl || conversation.profilePic || null);
      const participants = info?.participants || [];
      setGroupParticipants(participants.map((p: any) => {
        const rawId = p.id || p.jid || "";
        const ph = extractParticipantPhone(p);
        return { id: rawId, name: extractParticipantName(p, ph), phone: ph, rawDigits: normalizeDigits(rawId) };
      }));
    } catch (err: any) {
      toast.error("فشل إضافة العضو: " + (err.message || ""));
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = (phone: string) => {
    setConfirmAction({
      title: `إزالة ${phone} من القروب؟`,
      action: async () => {
        try {
          const { error } = await invokeCloud("evolution-manage", {
            body: { action: "group_remove", group_jid: conversation.customerPhone, participants: [phone], channel_id: conversation.channelId },
          });
          if (error) throw error;
          toast.success("✅ تمت إزالة العضو");
          setGroupParticipants(prev => prev.filter(p => p.phone !== phone));
        } catch (err: any) {
          toast.error("فشل إزالة العضو: " + (err.message || ""));
        }
      },
    });
  };


  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("ai_provider_configs" as any)
      .select("id")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .limit(1)
      .then(({ data }) => setHasAiConfig(!!(data && data.length > 0)));
  }, [orgId]);

  // Auto-suggest AI replies when opening a conversation with pending customer message
  const autoSuggestDoneRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hasAiConfig || !conversation.id || autoSuggestDoneRef.current === conversation.id) return;
    if (conversation.lastMessageSender !== "customer" || conversation.status === "closed") return;
    const customerMsgs = messages.filter(m => m.sender === "customer" && m.type === "text");
    if (customerMsgs.length === 0) return;
    autoSuggestDoneRef.current = conversation.id;
    (async () => {
      setAiLoading(true);
      try {
        const { data } = await invokeCloud("ai-features", {
          body: {
            action: "suggest_replies",
            conversation_messages: messages.slice(-5).map(m => ({ sender: m.sender, content: m.text })),
            customer_name: conversation.customerName,
          },
        });
        if (data?.suggestions?.length > 0) setAiSuggestions(data.suggestions);
      } catch { /* silent */ }
      setAiLoading(false);
    })();
  }, [hasAiConfig, conversation.id, conversation.lastMessageSender, messages.length]);
  // Auto-translate incoming customer messages
  useEffect(() => {
    if (!autoTranslate || !hasAiConfig) return;
    const customerMsgs = messages.filter(m => m.sender === "customer" && m.type === "text" && !translations[m.id]);
    const lastMsg = customerMsgs[customerMsgs.length - 1];
    if (!lastMsg) return;
    (async () => {
      try {
        const { data } = await invokeCloud("ai-features", {
          body: { action: "translate", text: lastMsg.text, target_language: "العربية" },
        });
        if (data?.translation) {
          setTranslations(prev => ({ ...prev, [lastMsg.id]: data.translation }));
        }
      } catch { /* silent */ }
    })();
  }, [autoTranslate, hasAiConfig, messages.length]);

  // Check if org has products (to conditionally show catalog button)
  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("is_active", true)
      .then(({ count }) => setHasProducts((count || 0) > 0));
  }, [orgId]);

  // Real-time typing presence
  useEffect(() => {
    if (!conversation.id || !user?.id) return;

    const channelName = `typing:${conversation.id}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: user.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const typingNames: string[] = [];
        Object.entries(state).forEach(([key, presences]) => {
          if (key !== user?.id) {
            const p = (presences as any[])[0];
            if (p?.is_typing) {
              typingNames.push(p.name || "موظف");
            }
          }
        });
        setOtherTypingAgents(typingNames);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ is_typing: false, name: profile?.full_name || "موظف" });
        }
      });

    // Listen for customer typing broadcasts from Evolution webhook
    const customerTypingChannel = supabase.channel(`customer-typing:${conversation.id}`);
    customerTypingChannel
      .on("broadcast", { event: "typing" }, (payload) => {
        setCustomerTyping(true);
        setTimeout(() => setCustomerTyping(false), 4000);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(customerTypingChannel);
    };
  }, [conversation.id, user?.id, profile?.full_name]);

  const broadcastTyping = useCallback((typing: boolean) => {
    const channelName = `typing:${conversation.id}`;
    const channel = supabase.channel(channelName);
    channel.track({ is_typing: typing, name: profile?.full_name || "موظف" });
  }, [conversation.id, profile?.full_name]);

  // Fetch real team members from database
  useEffect(() => {
    if (!orgId) return;
    const fetchMembers = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("full_name");
      if (data) setTeamMembers(data.filter(m => m.full_name));
    };
    fetchMembers();
  }, [orgId]);

  // Fetch group participants for group conversations (Evolution only)
  useEffect(() => {
    if (!isGroup || !isEvolutionChannel || !conversation.customerPhone) return;
    const fetchGroupMembers = async () => {
      try {
        const { data, error } = await invokeCloud("evolution-manage", {
          body: { action: "group_info", group_jid: conversation.customerPhone, channel_id: conversation.channelId },
        });
        if (error) {
          const msgParticipants: any[] = [];
          const seen = new Set<string>();
          messages.forEach(m => {
            if (m.sender === "customer" && m.senderName) {
              const key = (m as any).senderJid || m.senderName;
              if (!seen.has(key)) {
                seen.add(key);
                msgParticipants.push({
                  id: (m as any).senderJid || key,
                  name: m.senderName,
                  phone: (m as any).senderPhone || "",
                  rawDigits: ((m as any).senderJid || "").replace(/@.*/, "").replace(/\D/g, ""),
                  admin: false, isSaved: false,
                });
              }
            }
          });
          if (msgParticipants.length > 0) setGroupParticipants(msgParticipants);
          return;
        }
        const info = data?.data?.data || data?.data || {};
        setGroupPicture(info?.pictureUrl || info?.picture || info?.profilePictureUrl || conversation.profilePic || null);
        const participants = info?.participants || [];

        // fallback: جيب الأعضاء من الرسائل إذا API ما رجع أحد
        if (!participants || participants.length === 0) {
          const msgParticipants: any[] = [];
          const seen = new Set<string>();
          messages.forEach(m => {
            if (m.sender === "customer" && m.senderName) {
              const key = (m as any).senderJid || m.senderName;
              if (!seen.has(key)) {
                seen.add(key);
                msgParticipants.push({
                  id: (m as any).senderJid || key,
                  name: m.senderName,
                  phone: (m as any).senderPhone || "",
                  rawDigits: ((m as any).senderJid || "").replace(/@.*/, "").replace(/\D/g, ""),
                  admin: false,
                  isSaved: false,
                });
              }
            }
          });
          if (msgParticipants.length > 0) {
            setGroupParticipants(msgParticipants);
            return;
          }
        }

        const mapped = participants.map((p: any) => {
          const rawId = p.id || p.jid || "";
          const phone = extractParticipantPhone(p);
          return {
            id: rawId,
            name: extractParticipantName(p, phone),
            phone,
            rawDigits: normalizeDigits(rawId),
            admin: p.admin === "admin" || p.admin === "superadmin" || p.isAdmin || p.isSuperAdmin,
          };
        });

        // Enrich with saved customer names from DB + message sender names
        if (mapped.length > 0 && orgId) {
          const phones = mapped.map((m: any) => m.phone).filter(Boolean);
          const rawDigits = mapped.map((m: any) => m.rawDigits).filter(Boolean);
          const allLookups = [...new Set([...phones, ...rawDigits])];
          
          // 1. Check customers table
          const { data: savedCustomers } = await supabase
            .from("customers")
            .select("phone, name")
            .eq("org_id", orgId)
            .in("phone", allLookups);

          // 1b. Check profiles table (team members) by phone
          const { data: savedProfiles } = await supabase
            .from("profiles")
            .select("phone, full_name")
            .eq("org_id", orgId)
            .in("phone", allLookups);

          const customerMap = new Map<string, string>();
          (savedCustomers || []).forEach(c => { if (c.name) customerMap.set(c.phone, c.name); });
          // Profiles override customers (team members should show their name)
          (savedProfiles || []).forEach(p => { if (p.full_name && p.phone) customerMap.set(p.phone, p.full_name); });

          // 2. Extract names from recent messages metadata (sender_name field)
          const msgNameMap = new Map<string, string>();
          messages.forEach(m => {
            const meta = m as any;
            const senderName = meta.senderName || (meta.metadata as any)?.sender_name;
            const senderJid = (meta.metadata as any)?.sender_jid || (meta.metadata as any)?.participant;
            if (senderName && senderJid) {
              const senderDigits = normalizeDigits(senderJid);
              if (senderDigits) msgNameMap.set(senderDigits, senderName);
            }
          });

          mapped.forEach((p: any) => {
            // Try exact phone match from customers
            const savedName = customerMap.get(p.phone) || customerMap.get(p.rawDigits);
            if (savedName) {
              p.name = savedName;
              p.isSaved = true;
              return;
            }
            // Try suffix matching (some phones stored with/without country code)
            for (const [cPhone, cName] of customerMap) {
              if (cPhone && p.phone && (cPhone.endsWith(p.phone) || p.phone.endsWith(cPhone)) && cPhone.length >= 7) {
                p.name = cName;
                p.isSaved = true;
                return;
              }
            }
            // Try name from message metadata
            const msgName = msgNameMap.get(p.phone) || msgNameMap.get(p.rawDigits);
            if (msgName && (p.name.startsWith("عضو") || p.name.startsWith("+"))) {
              p.name = msgName;
            }
          });
        }

        mapped.sort((a: any, b: any) => {
          if (a.admin && !b.admin) return -1;
          if (!a.admin && b.admin) return 1;
          if (a.isSaved && !b.isSaved) return -1;
          if (!a.isSaved && b.isSaved) return 1;
          return (a.name || a.phone || a.rawDigits).localeCompare(b.name || b.phone || b.rawDigits);
        });

        setGroupParticipants(mapped);
      } catch (e) {
        console.error("Failed to fetch group participants:", e);
      }
    };
    fetchGroupMembers();
  }, [conversation.id, isGroup, isEvolutionChannel, messages.length]);

  const windowExpired = isMetaChannel ? windowInfo.expired : false;
  const approvedTemplates = templates.filter((template) => template.status === "approved");
  // In note mode: show team members. In group non-note mode: show group participants
  const isGroupMentionMode = isGroup && !isNoteMode;
  const filteredMentionAgents = isGroupMentionMode
    ? groupParticipants
        .filter((p) => [p.name, p.phone, p.rawDigits].some((value) => (value || "").toLowerCase().includes(mentionFilter.toLowerCase())))
        .sort((a, b) => {
          if (a.admin && !b.admin) return -1;
          if (!a.admin && b.admin) return 1;
          if (a.isSaved && !b.isSaved) return -1;
          if (!a.isSaved && b.isSaved) return 1;
          return (a.name || a.phone || a.rawDigits).localeCompare(b.name || b.phone || b.rawDigits);
        })
    : teamMembers.filter((m) => (m.full_name || "").includes(mentionFilter));

  // 24h window: query actual last INBOUND message across org channels for same customer
  const [realLastInbound, setRealLastInbound] = useState<string | undefined>(conversation.lastCustomerMessageAt);

  useEffect(() => {
    const phoneVariants = getPhoneSearchVariants(conversation.customerPhone);

    if (!isMetaChannel || !orgId || phoneVariants.length === 0) {
      setRealLastInbound(conversation.lastCustomerMessageAt);
      return;
    }

    const fetchLastInbound = async () => {
      const phoneFilters = Array.from(new Set(phoneVariants.flatMap((variant) => [
        `customer_phone.eq.${variant}`,
        `customer_phone.like.%${variant}%`,
      ])));

      const { data: candidateConversations } = await supabase
        .from("conversations")
        .select("id, customer_phone")
        .eq("org_id", orgId)
        .eq("conversation_type", "private")
        .or(phoneFilters.join(","))
        .limit(25);

      const matchedConversationIds = (candidateConversations || [])
        .filter((candidate: any) => phoneNumbersMatch(candidate.customer_phone, conversation.customerPhone))
        .map((candidate: any) => candidate.id);

      if (matchedConversationIds.length === 0) {
        setRealLastInbound(undefined);
        return;
      }

      const { data } = await supabase
        .from("messages")
        .select("created_at, conversation_id")
        .eq("sender", "customer")
        .in("conversation_id", matchedConversationIds)
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        setRealLastInbound(data[0].created_at);
      } else {
        setRealLastInbound(undefined);
      }
    };
    fetchLastInbound();
  }, [conversation.id, conversation.customerPhone, conversation.lastCustomerMessageAt, orgId, isMetaChannel, messages.length]);

  // 24h window countdown - update every minute
  useEffect(() => {
    setWindowInfo(getWindowRemaining(realLastInbound));
    const interval = setInterval(() => {
      setWindowInfo(getWindowRemaining(realLastInbound));
    }, 60000);
    return () => clearInterval(interval);
  }, [realLastInbound]);

  // Load saved replies
  useEffect(() => {
    if (!orgId) return;
    const loadReplies = async () => {
      const { data } = await supabase
        .from("saved_replies")
        .select("id, shortcut, title, content, category")
        .eq("org_id", orgId)
        .order("shortcut");
      if (data) setSavedReplies(data);
    };
    loadReplies();
  }, [orgId]);

  // SLA countdown: fetch active policy and compute remaining time
  const [slaMinutes, setSlaMinutes] = useState<number | null>(null);
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
      .then(({ data }) => { if (data?.first_response_minutes) setSlaMinutes(data.first_response_minutes); });
  }, [orgId]);

  const [slaStatus, setSlaStatus] = useState<{ remainingMin: number; level: "ok" | "warning" | "breached" } | null>(null);
  useEffect(() => {
    if (!slaMinutes || conversation.lastMessageSender !== "customer" || !conversation.lastCustomerMessageAt || conversation.status === "closed") {
      setSlaStatus(null);
      return;
    }
    const compute = () => {
      const deadline = new Date(conversation.lastCustomerMessageAt!).getTime() + slaMinutes * 60 * 1000;
      const remaining = Math.round((deadline - Date.now()) / 60000);
      setSlaStatus({ remainingMin: remaining, level: remaining <= 0 ? "breached" : remaining <= Math.max(5, slaMinutes * 0.2) ? "warning" : "ok" });
    };
    compute();
    const iv = setInterval(compute, 30000);
    return () => clearInterval(iv);
  }, [slaMinutes, conversation.lastCustomerMessageAt, conversation.lastMessageSender, conversation.status]);

  // Track if user is near bottom of scroll
  const handleMessagesScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const threshold = 150;
    isUserNearBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  // Only auto-scroll to bottom if user is near bottom or conversation changed
  useEffect(() => {
    const convChanged = prevConvIdRef.current !== conversation.id;
    if (convChanged) {
      prevConvIdRef.current = conversation.id;
      isUserNearBottomRef.current = true;
    }
    if (isUserNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: convChanged ? "auto" : "smooth" });
    }
  }, [messages, conversation.id]);

  // Load all unique tags from org conversations for suggestions
  useEffect(() => {
    const loadOrgTags = async () => {
      const { data } = await supabase
        .from("conversations")
        .select("tags")
        .not("tags", "eq", "{}");
      if (data) {
        const tagSet = new Set<string>();
        data.forEach((c: any) => (c.tags || []).forEach((t: string) => tagSet.add(t)));
        setAllOrgTags(Array.from(tagSet).sort());
      }
    };
    const loadTagDefs = async () => {
      const { data: defs } = await supabase
        .from("customer_tag_definitions")
        .select("id, name, color")
        .order("name");
      if (defs) {
        // Count conversations per tag
        const { data: convs } = await supabase
          .from("conversations")
          .select("tags")
          .not("tags", "eq", "{}");
        const countMap: Record<string, number> = {};
        (convs || []).forEach((c: any) => (c.tags || []).forEach((t: string) => { countMap[t] = (countMap[t] || 0) + 1; }));
        setOrgTagDefs(defs.map((d: any) => ({ id: d.id, name: d.name, color: d.color || "#25D366", count: countMap[d.name] || 0 })));
      }
    };
    loadOrgTags();
    loadTagDefs();
  }, []);

  const handleSend = () => {
    if (!inputText.trim()) return;
    if (isNoteMode) {
      const noteReplyData = replyTo ? { id: replyTo.id, waMessageId: replyTo.waMessageId, senderName: replyTo.sender === "agent" ? "أنت" : (replyTo.senderName || conversation.customerName), text: replyTo.text } : undefined;
      onSendMessage(conversation.id, inputText.trim(), "note", noteReplyData);
      setInputText("");
      setReplyTo(null);
      setIsNoteMode(false);
      toast.success("تم إضافة الملاحظة الداخلية");
      return;
    }
    if (isBlocked) {
      toast.error("⚠️ هذا الرقم محظور. هل تريد إلغاء الحظر أولاً؟", {
        action: {
          label: "إلغاء الحظر",
          onClick: () => handleToggleBlock(),
        },
        duration: 5000,
      });
      return;
    }
    if (windowExpired || (isMetaChannel && conversation.status === "closed")) {
      toast.error("انتهت نافذة الـ 24 ساعة - يرجى إرسال قالب معتمد أولاً");
      setShowTemplates(true);
      return;
    }
    const replyData = replyTo ? { id: replyTo.id, waMessageId: replyTo.waMessageId, senderName: replyTo.sender === "agent" ? "أنت" : (replyTo.senderName || conversation.customerName), text: replyTo.text } : undefined;
    // Dispatch email overrides if set
    const allTo = [...emailToChips, ...(emailToInput.trim() ? [emailToInput.trim()] : [])];
    const allCc = [...emailCcChips, ...(emailCcInput.trim() ? [emailCcInput.trim()] : [])];
    const allBcc = [...emailBccChips, ...(emailBccInput.trim() ? [emailBccInput.trim()] : [])];
    if (isEmailChannel && (allTo.length > 0 || allCc.length > 0 || allBcc.length > 0 || emailSubject.trim())) {
      window.dispatchEvent(new CustomEvent("email-override-recipients", {
        detail: {
          conversationId: conversation.id,
          to: allTo.length > 0 ? allTo.join(", ") : undefined,
          cc: allCc.length > 0 ? allCc.join(", ") : undefined,
          bcc: allBcc.length > 0 ? allBcc.join(", ") : undefined,
          subject: emailSubject.trim() || undefined,
        }
      }));
    }
    const lidJids = mentionedJidsRef.current;
    mentionedJidsRef.current = [];
    onSendMessage(conversation.id, inputText.trim(), "text", replyData, lidJids.length > 0 ? lidJids : undefined);
    setInputText("");
    setReplyTo(null);
    broadcastTyping(false);
  };

  const handleReply = (msg: Message) => {
    setReplyTo(msg);
    inputRef.current?.focus();
  };

  const handleStartEdit = (msg: Message) => {
    setEditingMsg(msg);
    setEditText(msg.text);
  };

  const handleConfirmEdit = () => {
    if (!editingMsg || !editText.trim() || !onEditMessage) return;
    onEditMessage(editingMsg.id, editingMsg.waMessageId || "", editText.trim(), conversation.customerPhone);
    setEditingMsg(null);
    setEditText("");
  };

  const handleDeleteMsg = (msg: Message) => {
    if (!onDeleteMessage || !msg.waMessageId) return;
    setConfirmAction({
      title: "حذف هذه الرسالة للجميع؟",
      action: () => onDeleteMessage(msg.id, msg.waMessageId!, conversation.customerPhone),
    });
  };

  const cancelReply = () => setReplyTo(null);

  const handleInputChange = (value: string) => {
    setInputText(value);

    // Broadcast typing presence
    if (value.trim() && !isNoteMode) {
      broadcastTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => broadcastTyping(false), 3000);
    } else {
      broadcastTyping(false);
    }

    // Check for / shortcut (saved replies)
    if (value.startsWith("/")) {
      const filter = value.slice(1).toLowerCase();
      setSavedReplyFilter(filter);
      setShowSavedReplies(true);
      setShowMentions(false);
      return;
    } else {
      setShowSavedReplies(false);
    }

    // Check for @ mentions - in groups (non-note mode): show group participants. Otherwise: auto-switch to note mode for team mentions
    const lastAtIndex = value.lastIndexOf("@");
    if (lastAtIndex !== -1) {
      const afterAt = value.slice(lastAtIndex + 1);
      if (!afterAt.includes(" ") && afterAt.length <= 20) {
        setShowMentions(true);
        setMentionFilter(afterAt);
        // Only auto-switch to note mode in private chats (not groups)
        if (!isNoteMode && !isGroup) {
          setIsNoteMode(true);
        }
        return;
      }
    }
    setShowMentions(false);
  };

  const insertSavedReply = (reply: { content: string }) => {
    const now = new Date();
    const dateStr = now.toLocaleDateString("ar-SA-u-ca-gregory", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const timeStr = now.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
    const text = reply.content
      .replace(/\{name\}/gi, conversation.customerName || "")
      .replace(/\{phone\}/gi, conversation.customerPhone || "")
      .replace(/\{agent\}/gi, profile?.full_name || "")
      .replace(/\{date\}/gi, dateStr)
      .replace(/\{time\}/gi, timeStr);
    setInputText(text);
    setShowSavedReplies(false);
    inputRef.current?.focus();
  };

  const filteredSavedReplies = savedReplies.filter((r) =>
    !savedReplyFilter || r.shortcut.toLowerCase().includes(savedReplyFilter) || r.title.toLowerCase().includes(savedReplyFilter)
  );

  const insertMention = (displayName: string, phone?: string, rawId?: string) => {
    const lastAtIndex = inputText.lastIndexOf("@");
    // For group participants, use @phone format so Evolution API can resolve mentions
    const mentionText = isGroupMentionMode && phone ? `@${phone}` : `@${displayName}`;
    const newText = inputText.slice(0, lastAtIndex) + `${mentionText} `;
    setInputText(newText);
    // Track @lid JIDs — these can't be extracted from text by phone regex
    if (isGroupMentionMode && !phone && rawId && rawId.includes("@lid")) {
      mentionedJidsRef.current = [...mentionedJidsRef.current, rawId];
    }
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const handleQuickReply = (text: string) => {
    if (windowExpired || (isMetaChannel && conversation.status === "closed")) {
      toast.error("انتهت نافذة الـ 24 ساعة - يرجى إرسال قالب معتمد أولاً");
      setShowQuickReplies(false);
      setShowTemplates(true);
      return;
    }
    onSendMessage(conversation.id, text);
    setShowQuickReplies(false);
  };

  const handleEmoji = (emoji: string) => setInputText((prev) => prev + emoji);

  const openTemplateFill = (t: WhatsAppTemplate) => {
    setSelectedTemplate(t);
    setTemplateVars(new Array(t.variableCount || 0).fill(""));
    setShowTemplates(false);
  };

  const handleSendTemplate = () => {
    if (!selectedTemplate) return;
    if (selectedTemplate.variableCount > 0 && templateVars.some((v) => !v.trim())) {
      toast.error("يرجى تعبئة جميع المتغيرات");
      return;
    }
    onSendTemplate(conversation.id, selectedTemplate, templateVars);
    setSelectedTemplate(null);
    setTemplateVars([]);
    toast.success("تم إرسال القالب بنجاح");
  };

  const fillTemplateBody = (t: WhatsAppTemplate, vars: string[]) => {
    let text = t.body;
    vars.forEach((v, i) => { text = text.replace(`{{${i + 1}}}`, v || `{{${i + 1}}}`); });
    let header = t.header || "";
    vars.forEach((v, i) => { header = header.replace(`{{${i + 1}}}`, v || `{{${i + 1}}}`); });
    return { header, text };
  };

  const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = () => reject(new Error("تعذر قراءة التسجيل"));
    reader.readAsDataURL(blob);
  });

  const handleVoiceSend = async (blob: Blob) => {
    setIsRecording(false);
    if (blob.size < 500) { toast.info("تسجيل قصير جداً"); return; }

    // ── Optimistic: show voice message immediately with local blob URL ──
    const localUrl = URL.createObjectURL(blob);
    const optimisticId = `optimistic-voice-${Date.now()}`;
    window.dispatchEvent(new CustomEvent("optimistic-message", {
      detail: {
        conversationId: conversation.id,
        message: {
          id: optimisticId,
          conversationId: conversation.id,
          text: "[audio]",
          sender: "agent",
          timestamp: new Date().toLocaleTimeString("ar-SA-u-ca-gregory", { hour: "2-digit", minute: "2-digit" }),
          status: "sent",
          type: "audio",
          mediaUrl: localUrl,
          createdAt: new Date().toISOString(),
        },
      },
    }));

    // ── Background: upload then send ──
    try {
      const base64 = await blobToBase64(blob);
      const { data: uploadData, error: uploadError } = await invokeCloud("upload-chat-media", {
        body: {
          conversation_id: conversation.id,
          file_name: `${Date.now()}.${blob.type.includes("ogg") ? "ogg" : blob.type.includes("aac") ? "aac" : blob.type.includes("mp4") ? "m4a" : "webm"}`,
          content_type: blob.type || "audio/mp4",
          base64,
        },
      });
      if (uploadError) throw uploadError;
      if (!uploadData?.storage_path) throw new Error("تعذر حفظ التسجيل");

      const storagePath = uploadData.storage_path as string;
      let effectiveChannelType = conversation.channelType;
      if (!effectiveChannelType && conversation.channelId) {
        const { data: chData } = await supabase.from("whatsapp_config_safe").select("channel_type").eq("id", conversation.channelId).maybeSingle();
        effectiveChannelType = chData?.channel_type as any;
      }
      const isEvolution = effectiveChannelType === "evolution";
      const isMetaSend = effectiveChannelType === "meta_api";
      if (!isEvolution && !isMetaSend) { toast.error("تعذر تحديد نوع القناة"); return; }
      const sendFn = isMetaSend ? "whatsapp-send" : "evolution-send";

      const sendBody: Record<string, any> = {
          to: conversation.customerPhone,
          message: "",
          conversation_id: conversation.id,
          media_url: storagePath,
          media_type: "audio",
        };
      if (!isEvolution) {
        sendBody.type = "media";
        sendBody.channel_id = conversation.channelId;
      }
      const { data, error } = await invokeCloud(sendFn, { body: sendBody });
      if (data?.safety_paused) {
        toast.warning("⛔ الإرسال متوقف مؤقتاً لحماية الرقم. الرسالة ستُعلّق ⏳ وترسل تلقائياً فور تجدد الحد.", { duration: 10000, icon: "🛡️" });
        window.dispatchEvent(new CustomEvent("optimistic-message-pending", { detail: { conversationId: conversation.id, messageId: optimisticId } }));
      } else if (error || data?.error) {
        throw new Error(data?.error || "فشل إرسال الرسالة الصوتية");
      }
    } catch (err: any) {
      toast.error("فشل إرسال الصوتية: " + (err?.message || err?.context?.error || ""));
      // Mark optimistic message as failed
      window.dispatchEvent(new CustomEvent("optimistic-message-failed", {
        detail: { conversationId: conversation.id, messageId: optimisticId },
      }));
    }
  };

  const handleVoiceCancel = () => {
    setIsRecording(false);
    toast.info("تم إلغاء التسجيل");
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const allowedFileTypes = "image/*,video/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  const getFileMediaType = (file: File): string => {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    return "document";
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const mediaType = getFileMediaType(file);
    const maxSize = mediaType === "video" ? 50 : 20; // MB
    if (file.size > maxSize * 1024 * 1024) {
      toast.error(`حجم الملف يجب أن يكون أقل من ${maxSize} ميغابايت`);
      return;
    }
    const url = URL.createObjectURL(file);
    setImagePreview({ file, url });
    e.target.value = "";
  };

  const handleSendImage = async () => {
    if (!imagePreview) return;

    // Email channels: send attachment via email-send edge function
    if (isEmailChannel) {
      setIsUploading(true);
      try {
        const base64 = await blobToBase64(imagePreview.file);
        const caption = inputText.trim();
        const attachment = {
          filename: imagePreview.file.name,
          content: base64,
          contentType: imagePreview.file.type || "application/octet-stream",
        };
        // Use onSendMessage but pass attachment info via custom event
        window.dispatchEvent(new CustomEvent("email-send-attachment", {
          detail: {
            conversationId: conversation.id,
            text: caption || `📎 ${imagePreview.file.name}`,
            attachment,
          },
        }));
        setImagePreview(null);
        setInputText("");
        URL.revokeObjectURL(imagePreview.url);
        toast.success("جاري إرسال المرفق...");
      } catch (err: any) {
        console.error("Email attachment error:", err);
        toast.error("فشل إرفاق الملف: " + (err.message || "خطأ غير معروف"));
      } finally {
        setIsUploading(false);
      }
      return;
    }

    if (windowExpired) {
      toast.error("انتهت نافذة الـ 24 ساعة - يرجى إرسال قالب معتمد أولاً");
      return;
    }
    setIsUploading(true);
    try {
      const mediaType = getFileMediaType(imagePreview.file);
      const base64 = await blobToBase64(imagePreview.file);
      const { data: uploadData, error: uploadError } = await invokeCloud("upload-chat-media", {
        body: {
          conversation_id: conversation.id,
          file_name: imagePreview.file.name,
          content_type: imagePreview.file.type || "application/octet-stream",
          base64,
        },
      });
      if (uploadError) throw uploadError;
      if (!uploadData?.storage_path) throw new Error("تعذر رفع الملف");
      const storagePath = uploadData.storage_path as string;
      const caption = inputText.trim();

      // Check if using Evolution based on conversation channel type
      let effectiveChType = conversation.channelType;
      if (!effectiveChType && conversation.channelId) {
        const { data: chData } = await supabase.from("whatsapp_config_safe").select("channel_type").eq("id", conversation.channelId).maybeSingle();
        effectiveChType = chData?.channel_type as any;
      }
      const isEvolution = effectiveChType === "evolution";

      if (isEvolution) {
        const { data, error } = await invokeCloud("evolution-send", {
          body: {
            to: conversation.customerPhone,
            message: caption || "",
            conversation_id: conversation.id,
            media_url: storagePath,
            media_type: mediaType,
          },
        });
        if (data?.safety_paused) {
          toast.warning("⛔ الإرسال متوقف مؤقتاً لحماية الرقم. الرسالة ستُعلّق ⏳ وترسل تلقائياً فور تجدد الحد.", { duration: 10000, icon: "🛡️" });
        } else if (error || data?.error) {
          throw new Error(data?.error || "فشل إرسال الوسائط");
        }
      } else {
        const { data, error } = await invokeCloud("whatsapp-send", {
          body: {
            to: conversation.customerPhone,
            type: "media",
            media_url: storagePath,
            media_type: mediaType,
            caption: caption || "",
            conversation_id: conversation.id,
            channel_id: conversation.channelId,
          },
        });
        if (error || data?.error) {
          throw new Error(data?.error || "فشل إرسال الوسائط");
        }
      }

      setImagePreview(null);
      setInputText("");
      URL.revokeObjectURL(imagePreview.url);
      toast.success(mediaType === "image" ? "تم إرسال الصورة" : mediaType === "video" ? "تم إرسال الفيديو" : "تم إرسال الملف");
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("فشل رفع الملف: " + (err.message || "خطأ غير معروف"));
    } finally {
      setIsUploading(false);
    }
  };

  const cancelImagePreview = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview.url);
      setImagePreview(null);
    }
  };

  const addTag = () => {
    if (!newTagText.trim() || !onTagsChange) return;
    const updated = [...conversation.tags, newTagText.trim()];
    onTagsChange(conversation.id, updated);
    setNewTagText("");
    setShowTagInput(false);
    toast.success("تم إضافة الوسم");
  };

  const removeTag = (tag: string) => {
    if (!onTagsChange) return;
    onTagsChange(conversation.id, conversation.tags.filter(t => t !== tag));
    toast.success("تم حذف الوسم");
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden bg-[#efeae2] dark:bg-[#0b141a]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'400\' height=\'400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3Cpattern id=\'p\' width=\'80\' height=\'80\' patternUnits=\'userSpaceOnUse\' patternTransform=\'rotate(15)\'%3E%3Cpath d=\'M20 10c2 0 3 1 3 3s-1 3-3 3-3-1-3-3 1-3 3-3zm30 25c1.5 0 2.5 1 2.5 2.5s-1 2.5-2.5 2.5-2.5-1-2.5-2.5 1-2.5 2.5-2.5zm-35 30c1 0 2 .8 2 2s-1 2-2 2-2-.8-2-2 1-2 2-2zm45 10c1.5 0 2.5 1 2.5 2.5s-1 2.5-2.5 2.5-2.5-1-2.5-2.5 1-2.5 2.5-2.5z\' fill=\'%23d6cfc4\' fill-opacity=\'0.3\'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width=\'400\' height=\'400\' fill=\'url(%23p)\'/%3E%3C/svg%3E")' }}>
      {/* Header */}
      <div className="shrink-0 bg-card border-b border-border">
        <div className="h-[56px] md:h-[60px] flex items-center justify-between px-3 md:px-5">
          <div className="flex items-center gap-2 min-w-0">
            <button className="w-8 h-8 rounded-full hover:bg-muted transition-all flex items-center justify-center shrink-0" onClick={onBack}>
              <ArrowRight className="w-4.5 h-4.5 text-foreground" />
            </button>
            <button
              className="flex items-center gap-2 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => onShowCustomerInfo?.()}
            >
            <div className="relative shrink-0">
              {groupPicture ? (
                <img src={groupPicture} alt={conversation.customerName} className="w-9 h-9 md:w-10 md:h-10 rounded-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }} />
              ) : null}
              <div className={cn("w-9 h-9 md:w-10 md:h-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground", groupPicture ? "hidden" : "")}>
                {conversation.customerName.charAt(0)}
              </div>
              {(conversation.lastSeen === "متصل الآن" || customerLastSeen === "متصل الآن") && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-card" />
              )}
            </div>
            <div className="min-w-0 overflow-hidden">
              <div className="flex items-center gap-1">
                <p className="font-semibold text-[14px] truncate max-w-[140px] md:max-w-[250px]">{conversation.customerName}</p>
                {isMetaChannel && (
                  <span className="inline-flex items-center text-[7px] px-1 py-px rounded bg-emerald-500/10 text-emerald-600 font-bold shrink-0">
                    <ShieldCheck className="w-2 h-2 ml-0.5" />رسمي
                  </span>
                )}
                {conversation.sentiment === "negative" && (
                  <span className="inline-flex items-center text-[7px] px-1.5 py-px rounded bg-destructive/10 text-destructive font-bold shrink-0 gap-0.5">
                    😠 غاضب
                  </span>
                )}
                {conversation.sentiment === "positive" && (
                  <span className="inline-flex items-center text-[7px] px-1.5 py-px rounded bg-emerald-500/10 text-emerald-600 font-bold shrink-0 gap-0.5">
                    😊 راضٍ
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground/60 truncate">
                {isEmailChannel ? `📧 ${conversation.customerPhone}` : (isMetaChannel || isEvolutionChannel) ? (
                  <>
                    {`عبر الواتساب${conversation.channelName ? ` • ${conversation.channelName}` : ""}`}
                    {customerLastSeen && !isGroup && (
                      <span className={cn("mr-1", customerLastSeen === "متصل الآن" ? "text-emerald-500 font-medium" : customerLastSeen === "يكتب..." ? "text-emerald-500" : "")}>
                        {` • ${customerLastSeen}`}
                      </span>
                    )}
                  </>
                ) : conversation.customerPhone}
              </p>
            </div>
            </button>
          </div>
          <div className="flex items-center gap-0.5">
            {isMetaChannel && (windowExpired ? (
              <div className="hidden sm:flex items-center gap-1 text-warning bg-warning/10 px-2 py-1 rounded-lg ml-2">
                <Clock className="w-3 h-3" />
                <span className="text-[10px] font-medium">نافذة 24س منتهية</span>
              </div>
            ) : windowInfo.hours < 24 && (
              <div className={cn(
                "hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg ml-2",
                windowInfo.hours < 2 ? "text-destructive bg-destructive/10" : windowInfo.hours < 6 ? "text-warning bg-warning/10" : "text-success bg-success/10"
              )}>
                <Timer className="w-3 h-3" />
                <span className="text-[10px] font-bold font-mono">{windowInfo.hours}:{String(windowInfo.minutes).padStart(2, "0")}</span>
                <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", windowInfo.hours < 2 ? "bg-destructive" : windowInfo.hours < 6 ? "bg-warning" : "bg-success")}
                    style={{ width: `${windowInfo.percentage}%` }}
                  />
                </div>
              </div>
            ))}
            {/* SLA countdown badge — shown for all channel types when customer is waiting */}
            {slaStatus && (
              <div className={cn(
                "hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg ml-1",
                slaStatus.level === "breached" ? "text-destructive bg-destructive/10" :
                slaStatus.level === "warning" ? "text-warning bg-warning/10" :
                "text-muted-foreground bg-muted/50"
              )}>
                <Clock className="w-3 h-3 shrink-0" />
                <span className="text-[10px] font-bold font-mono">
                  {slaStatus.level === "breached"
                    ? `تأخر ${Math.abs(slaStatus.remainingMin)}د`
                    : `${slaStatus.remainingMin}د`}
                </span>
              </div>
            )}
            {/* Snooze indicator */}
            {snoozedUntil && new Date(snoozedUntil) > new Date() && (
              <button
                onClick={() => setShowSnooze(true)}
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-warning/10 text-warning hover:bg-warning/20 transition-colors"
                title="محادثة مؤجلة"
              >
                <BellOff className="w-4 h-4" />
                <span className="text-[11px] font-medium">
                  مؤجلة حتى {new Date(snoozedUntil).toLocaleTimeString("ar-SA-u-ca-gregory", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </button>
            )}
            {/* Desktop: Transfer button directly visible */}
            {conversation.status !== "closed" && (
              <button
                onClick={() => setShowTransfer(true)}
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-primary/10 transition-colors text-primary"
                title="تحويل لموظف آخر"
              >
                <UserPlus className="w-4 h-4" />
                <span className="text-[11px] font-medium">تحويل</span>
              </button>
            )}
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
                <DropdownMenuItem onClick={() => setShowClosureReason(true)}>
                  <XCircle className="w-4 h-4 ml-2 text-destructive" /> إغلاق المحادثة
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowFollowUp(true)}>
                  <Clock className="w-4 h-4 ml-2 text-primary" /> جدولة متابعة
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowSnooze(true)}>
                  <BellOff className="w-4 h-4 ml-2 text-warning" />
                  {snoozedUntil ? "تعديل التأجيل" : "تأجيل المحادثة"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  setShowTicketDialog(true);
                  // Fetch agents for ticket dialog
                  if (orgId) supabase.from("profiles").select("id, full_name").eq("org_id", orgId).eq("is_active", true).then(({data}) => setTicketAgents(data || []));
                }}>
                  <Ticket className="w-4 h-4 ml-2 text-primary" /> إنشاء تذكرة
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  setSelectingMessages(!selectingMessages);
                  setSelectedMsgIds(new Set());
                }}>
                  <Square className="w-4 h-4 ml-2 text-primary" /> {selectingMessages ? "إلغاء تحديد الرسائل" : "تحديد رسائل لتذكرة"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowTransfer(true)} className="md:hidden">
                  <UserPlus className="w-4 h-4 ml-2 text-primary" /> تحويل لموظف آخر
                </DropdownMenuItem>
                {(userRole === "admin" || isSuperAdmin) && (
                <DropdownMenuItem
                  onClick={() => setConfirmAction({
                    title: "حذف هذه المحادثة؟",
                    description: "سيُحذف جميع الرسائل نهائياً ولا يمكن التراجع.",
                    action: () => onDeleteConversation?.(conversation.id),
                  })}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 ml-2" /> حذف المحادثة
                </DropdownMenuItem>
                )}
                {isEvolutionChannel && (
                  <DropdownMenuItem onClick={() => setShowDisappearingMenu(!showDisappearingMenu)}>
                    <Timer className="w-4 h-4 ml-2 text-primary" /> الرسائل المختفية
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={async () => {
                  const { data: bp } = await supabase.from("booking_pages" as any).select("slug").eq("profile_id", profile?.id).eq("is_active", true).maybeSingle();
                  if (!bp) { toast.error("لا توجد صفحة حجز مفعّلة، أنشئها من صفحة المواعيد أولاً"); return; }
                  const link = `${window.location.origin}/book/${(bp as any).slug}`;
                  onSendMessage(conversation.id, `📅 يمكنك حجز موعد معي مباشرةً عبر الرابط التالي:\n${link}`);
                  toast.success("تم إرسال رابط الحجز");
                }}>
                  <CalendarDays className="w-4 h-4 ml-2 text-emerald-500" /> إرسال رابط الحجز
                </DropdownMenuItem>
                <DropdownMenuItem onClick={copyConversationLink}>
                  <Link2 className="w-4 h-4 ml-2 text-primary" /> نسخ رابط المحادثة
                </DropdownMenuItem>
                <ExportConversation conversation={conversation} messages={messages} asMenuItem />
                {conversation.channelType === "evolution" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleToggleBlock}>
                      {isBlocked ? (
                        <><ShieldOff className="w-4 h-4 ml-2 text-success" /> إلغاء حظر الرقم</>
                      ) : (
                        <><Ban className="w-4 h-4 ml-2 text-destructive" /> حظر الرقم</>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={async () => {
                      try {
                        await invokeCloud("evolution-manage", {
                          body: { action: "archive_chat", phone: conversation.customerPhone },
                        });
                        toast.success("تم أرشفة المحادثة");
                      } catch { toast.error("فشل الأرشفة"); }
                    }}>
                      <FileText className="w-4 h-4 ml-2 text-muted-foreground" /> أرشفة في واتساب
                    </DropdownMenuItem>
                    {conversation.conversationType === "group" && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => groupPicInputRef.current?.click()}>
                          <ImageIcon className="w-4 h-4 ml-2 text-primary" /> تغيير صورة القروب
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowAddMembersDialog(true)}>
                          <UserPlus className="w-4 h-4 ml-2 text-primary" /> إضافة أعضاء
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleLeaveGroup} className="text-destructive">
                          <LogOut className="w-4 h-4 ml-2" /> الخروج من القروب
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Group members bar */}
        {isGroup && groupParticipants.length > 0 && (
          <div className="px-4 pb-2">
            <button
              onClick={() => setShowGroupMembersBar(v => !v)}
              className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <div className="flex -space-x-1 rtl:space-x-reverse">
                {groupParticipants.slice(0, 5).map((p, i) => (
                  <div key={p.id} className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white border border-background"
                    style={{ backgroundColor: getMemberColor(p.phone || p.rawDigits || p.id), zIndex: 5 - i }}>
                    {(p.name || p.phone).slice(0, 1)}
                  </div>
                ))}
                {groupParticipants.length > 5 && (
                  <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[8px] font-bold text-muted-foreground border border-background" style={{ zIndex: 0 }}>
                    +{groupParticipants.length - 5}
                  </div>
                )}
              </div>
              <span>{groupParticipants.length} عضو</span>
              {filterMemberPhone && <span className="text-primary font-semibold">• تصفية نشطة</span>}
              {showGroupMembersBar ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {showGroupMembersBar && (
              <div className="mt-2 flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {filterMemberPhone && (
                  <button onClick={() => setFilterMemberPhone(null)}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-primary text-primary-foreground font-bold">
                    <X className="w-2.5 h-2.5" /> إلغاء الفلتر
                  </button>
                )}
                {groupParticipants.map(p => {
                  const color = getMemberColor(p.phone || p.rawDigits || p.id);
                  const isFiltered = filterMemberPhone === (p.phone || p.rawDigits);
                  return (
                    <button key={p.id}
                      onClick={() => setFilterMemberPhone(isFiltered ? null : (p.phone || p.rawDigits || null))}
                      className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border transition-all"
                      style={isFiltered
                        ? { backgroundColor: color, borderColor: color, color: "#fff" }
                        : { borderColor: color + "60", color }}>
                      <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold text-white"
                        style={{ backgroundColor: color }}>
                        {(p.name || p.phone).slice(0, 1)}
                      </div>
                      <span className="font-medium">{p.name || `+${p.phone}`}</span>
                      {p.admin && <Crown className="w-2.5 h-2.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tags row */}
        {conversation.tags.length > 0 && (
        <div className="flex items-center gap-1.5 px-4 pb-2.5 overflow-x-auto scrollbar-none">
          {conversation.tags.map((tag) => {
            const def = orgTagDefs.find(d => d.name === tag);
            return (
              <Badge key={tag} variant="secondary" className="text-[10px] px-2 py-0.5 gap-1 shrink-0 group h-5 rounded-full font-normal border-0">
                {def && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: def.color }} />}
                {tag}
                <button onClick={() => removeTag(tag)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="w-2 h-2" />
                </button>
              </Badge>
            );
          })}
        </div>
        )}
      </div>

      {/* Mobile Quick Action Toolbar */}
      <div className="flex items-center overflow-x-auto scrollbar-none border-b border-border/20 bg-card/80 shrink-0">
        {conversation.status !== "closed" ? (
          <button
            onClick={() => setShowClosureReason(true)}
            className="flex items-center gap-1 px-3 py-2 text-[11px] font-medium text-destructive whitespace-nowrap hover:bg-destructive/5 transition-colors border-l border-border/20"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>إغلاق المحادثة</span>
          </button>
        ) : (
          <button
            onClick={() => { onStatusChange(conversation.id, "active"); toast.success("تم إعادة فتح المحادثة"); }}
            className="flex items-center gap-1 px-3 py-2 text-[11px] font-medium text-success whitespace-nowrap hover:bg-success/5 transition-colors border-l border-border/20"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>إعادة فتح</span>
          </button>
        )}
        {onShowCustomerInfo && (
          <button onClick={onShowCustomerInfo} className="px-3 py-2 text-muted-foreground hover:bg-secondary transition-colors">
            <Contact className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => setShowMessageSearch(!showMessageSearch)}
          className={cn("px-3 py-2 transition-colors", showMessageSearch ? "text-primary bg-primary/5" : "text-muted-foreground hover:bg-secondary")}
        >
          <SearchIcon className="w-3.5 h-3.5" />
        </button>
        <Popover open={showTagPopover} onOpenChange={setShowTagPopover}>
          <PopoverTrigger asChild>
            <button className={cn("px-3 py-2 transition-colors", showTagPopover ? "text-primary bg-primary/5" : "text-muted-foreground hover:bg-secondary")}>
              <Tag className="w-3.5 h-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-0 max-h-80 overflow-y-auto" dir="rtl">
            <div className="p-2 border-b border-border">
              <p className="text-xs font-semibold text-foreground">الوسوم</p>
            </div>
            <div className="p-1">
              {orgTagDefs.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">لا توجد وسوم معرّفة</p>
              )}
              {orgTagDefs.map((td) => {
                const isActive = conversation.tags.includes(td.name);
                return (
                  <button
                    key={td.id}
                    onClick={() => {
                      if (!onTagsChange) return;
                      if (isActive) {
                        onTagsChange(conversation.id, conversation.tags.filter(t => t !== td.name));
                        toast.success("تم حذف الوسم");
                      } else {
                        onTagsChange(conversation.id, [...conversation.tags, td.name]);
                        toast.success("تم إضافة الوسم");
                      }
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-xs rounded-md transition-colors",
                      isActive ? "bg-primary/10 text-primary" : "hover:bg-secondary text-foreground"
                    )}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: td.color }} />
                    <span className="flex-1 text-right truncate">{td.name}</span>
                    <span className="text-[10px] text-muted-foreground">{td.count}</span>
                    {isActive && <Check className="w-3 h-3 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
            {(userRole === "admin" || isSuperAdmin || profile?.is_supervisor) && (
              <div className="p-2 border-t border-border">
                <div className="flex items-center gap-1">
                  <input
                    value={newTagDefName}
                    onChange={(e) => setNewTagDefName(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter" && newTagDefName.trim() && orgId) {
                        const { data, error } = await supabase.from("customer_tag_definitions").insert({ name: newTagDefName.trim(), org_id: orgId }).select().single();
                        if (!error && data) {
                          setOrgTagDefs(prev => [...prev, { id: data.id, name: data.name, color: data.color || "#25D366", count: 0 }]);
                          setNewTagDefName("");
                          toast.success("تم إضافة الوسم الجديد");
                        } else {
                          toast.error("فشل إضافة الوسم");
                        }
                      }
                    }}
                    placeholder="إضافة وسم جديد..."
                    className="flex-1 text-xs bg-secondary rounded-md px-2 py-1.5 outline-none border-0"
                  />
                  <button
                    onClick={async () => {
                      if (!newTagDefName.trim() || !orgId) return;
                      const { data, error } = await supabase.from("customer_tag_definitions").insert({ name: newTagDefName.trim(), org_id: orgId }).select().single();
                      if (!error && data) {
                        setOrgTagDefs(prev => [...prev, { id: data.id, name: data.name, color: data.color || "#25D366", count: 0 }]);
                        setNewTagDefName("");
                        toast.success("تم إضافة الوسم الجديد");
                      } else {
                        toast.error("فشل إضافة الوسم");
                      }
                    }}
                    className="text-primary p-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </PopoverContent>
        </Popover>
        {conversation.status !== "closed" && (
          <>
            <button onClick={() => setShowTransfer(true)} className="px-3 py-2 text-muted-foreground hover:bg-secondary transition-colors">
              <UserPlus className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowFollowUp(true)} className="px-3 py-2 text-muted-foreground hover:bg-secondary transition-colors">
              <Clock className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Message Search Bar */}
      {showMessageSearch && (
        <MessageSearch
          messages={messages}
          onClose={() => setShowMessageSearch(false)}
          onNavigate={(msgId) => {
            const el = document.querySelector(`[data-message-id="${msgId}"]`);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              el.classList.add("ring-2", "ring-primary/60", "rounded-xl");
              setTimeout(() => el.classList.remove("ring-2", "ring-primary/60", "rounded-xl"), 2000);
            }
          }}
        />
      )}

      {/* 24h Window Warning */}
      {isMetaChannel && windowExpired && (
        <div className="shrink-0 bg-warning/10 border-b border-warning/20 px-4 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
          <p className="text-xs text-warning font-medium flex-1">انتهت نافذة الـ 24 ساعة. يمكنك فقط إرسال قوالب معتمدة من Meta.</p>
          <Button size="sm" variant="outline" className="text-xs h-7 border-warning/30 text-warning hover:bg-warning/10" onClick={() => setShowTemplates(true)}>
            <FileText className="w-3 h-3 ml-1" /> إرسال قالب
          </Button>
        </div>
      )}

      {/* Conversation Events Log (system events timeline) */}
      <ConversationEventsLog conversationId={conversation.id} />

      {/* Closed Conversation Banner */}
      {conversation.status === "closed" && (
        <div className="shrink-0 bg-muted border-b border-border px-4 py-3 flex items-center gap-2">
          <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground font-medium flex-1">تم إغلاق هذه المحادثة</p>
          <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => { onStatusChange(conversation.id, "active"); toast.success("تم إعادة فتح المحادثة"); }}>
            <CheckCircle2 className="w-3 h-3" /> إعادة فتح
          </Button>
        </div>
      )}

      {/* Note Mode Banner */}
      {isNoteMode && (
        <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-600 font-medium flex-1">وضع الملاحظات الداخلية - الرسالة لن تُرسل للعميل</p>
          <Button size="sm" variant="ghost" className="text-xs h-7 text-amber-600" onClick={() => setIsNoteMode(false)}>
            إلغاء
          </Button>
        </div>
      )}

      {/* Messages */}
      <div ref={messagesContainerRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 md:px-8 md:py-6 space-y-0.5 md:space-y-1 bg-background">
        {/* Load more older messages */}
        {hasMoreMessages && (
          <div className="flex justify-center py-2">
            <button
              onClick={() => onLoadMoreMessages?.(conversation.id)}
              disabled={loadingMoreMessages}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors px-3 py-1.5 rounded-full bg-muted/50 hover:bg-muted"
            >
              {loadingMoreMessages
                ? <><Loader2 className="w-3 h-3 animate-spin" /> جاري التحميل...</>
                : <><ChevronUp className="w-3 h-3" /> تحميل رسائل أقدم</>}
            </button>
          </div>
        )}
        {(filterMemberPhone
          ? messages.filter(msg => {
              if (msg.sender !== "customer") return false;
              const rawPhone = (msg as any).senderPhone || normalizeDigits((msg as any).senderJid || "");
              return rawPhone === filterMemberPhone || rawPhone.endsWith(filterMemberPhone) || filterMemberPhone.endsWith(rawPhone);
            })
          : messages
        ).map((msg, msgIdx) => {
          // In groups, distinguish senders by their JID/phone, not just "customer"
          const isGroup = conversation.conversationType === "group";
          const getMsgSenderKey = (m: Message) => {
            if (m.sender !== "customer" || !isGroup) return m.sender;
            return m.senderPhone || m.senderJid || m.senderName || m.sender;
          };
          const senderKey = getMsgSenderKey(msg);
          const GROUP_WINDOW_MS = 5 * 60 * 1000;
          const sameWindow = (a: Message, b: Message) =>
            !!a.createdAt && !!b.createdAt &&
            Math.abs(new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) < GROUP_WINDOW_MS;
          const nextMsg = messages[msgIdx + 1];
          const showAvatar = !nextMsg || getMsgSenderKey(nextMsg) !== senderKey || nextMsg.sender === "system" || !sameWindow(msg, nextMsg);
          const prevMsg = messages[msgIdx - 1];
          const isFirstInGroup = !prevMsg || getMsgSenderKey(prevMsg) !== senderKey || prevMsg.sender === "system" || !sameWindow(prevMsg, msg);
          return (
          <div key={msg.id} id={`msg-${msg.id}`} className={cn(
            "flex",
            msg.sender === "agent" ? "justify-end" : msg.sender === "system" ? "justify-center" : "justify-start",
            isFirstInGroup ? "mt-3" : "mt-0.5"
          )}>
            {/* Selection checkbox */}
            {selectingMessages && msg.sender !== "system" && (
              <button
                onClick={(e) => { e.stopPropagation(); setSelectedMsgIds(prev => { const n = new Set(prev); n.has(msg.id) ? n.delete(msg.id) : n.add(msg.id); return n; }); }}
                className={cn("shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center self-center mr-1 transition-colors",
                  selectedMsgIds.has(msg.id) ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30 hover:border-primary/50"
                )}
              >
                {selectedMsgIds.has(msg.id) && <Check className="w-3 h-3" />}
              </button>
            )}
            {msg.sender === "system" ? (
              <div className="flex items-center gap-2 max-w-[85%]">
                <div className="flex-1 h-px bg-border/40" />
                <div className={cn(
                  "text-[11px] px-3 py-1.5 rounded-xl font-medium text-center leading-relaxed whitespace-nowrap",
                  msg.text?.includes("انضم") || msg.text?.includes("joined") ? "bg-green-50 text-green-700 border border-green-100" :
                  msg.text?.includes("غادر") || msg.text?.includes("خرج") || msg.text?.includes("left") ? "bg-red-50 text-red-600 border border-red-100" :
                  msg.text?.includes("أُضيف") || msg.text?.includes("added") ? "bg-blue-50 text-blue-700 border border-blue-100" :
                  msg.text?.includes("أُزيل") || msg.text?.includes("removed") ? "bg-orange-50 text-orange-700 border border-orange-100" :
                  "bg-muted/60 text-muted-foreground border border-border/30"
                )}>
                  {msg.text}
                </div>
                <div className="flex-1 h-px bg-border/40" />
              </div>
            ) : (
              <div className={cn("flex items-end gap-2 max-w-full", msg.sender === "agent" ? "flex-row-reverse" : "flex-row")}>
                {/* Avatar */}
                {showAvatar ? (
                  msg.sender === "customer" ? (
                    <div className="shrink-0 mb-1">
                      {(() => {
                        // In groups, resolve per-sender avatar
                        if (isGroup) {
                          const jidIsLid = msg.senderJid?.includes("@lid") || false;
                          const rawPhone = msg.senderPhone || (!jidIsLid && msg.senderJid ? msg.senderJid.replace(/@.*/, "").replace(/\D/g, "") : "");
                          const participant = rawPhone ? groupParticipants.find(p => p.phone === rawPhone || p.rawDigits === rawPhone || (rawPhone.length >= 7 && (p.phone.endsWith(rawPhone) || rawPhone.endsWith(p.phone)))) : undefined;
                          const displayName = participant?.name || msg.senderName || rawPhone || "؟";
                          const initials = displayName.slice(0, 2);
                          const memberColor = getMemberColor(rawPhone || displayName);
                          const handleAvatarClick = async () => {
                            if (!rawPhone) return;
                            // 1. Look up customer by phone to get customer_id
                            const { data: customer } = await supabase
                              .from("customers")
                              .select("id, phone")
                              .eq("org_id", orgId)
                              .or(`phone.eq.${rawPhone},phone.like.%${rawPhone.slice(-9)}%`)
                              .limit(1)
                              .maybeSingle();

                            // 2. Search conversations by customer_id first (most reliable)
                            if (customer?.id) {
                              const { data: conv } = await supabase
                                .from("conversations")
                                .select("id")
                                .eq("org_id", orgId)
                                .eq("customer_id", customer.id)
                                .eq("conversation_type", "private")
                                .order("last_message_at", { ascending: false })
                                .limit(1)
                                .maybeSingle();
                              if (conv) {
                                window.dispatchEvent(new CustomEvent("navigate-conversation", { detail: { conversationId: conv.id } }));
                                return;
                              }
                            }

                            // 3. Fallback: search by phone directly or suffix
                            const { data: phoneConv } = await supabase
                              .from("conversations")
                              .select("id")
                              .eq("org_id", orgId)
                              .eq("conversation_type", "private")
                              .or(`customer_phone.eq.${rawPhone},customer_phone.like.%${rawPhone.slice(-9)}%`)
                              .order("last_message_at", { ascending: false })
                              .limit(1)
                              .maybeSingle();
                            if (phoneConv) {
                              window.dispatchEvent(new CustomEvent("navigate-conversation", { detail: { conversationId: phoneConv.id } }));
                            } else {
                              toast.info(`لا توجد محادثة خاصة مع ${displayName} (${rawPhone})`);
                            }
                          };
                          return (
                            <div
                              onClick={handleAvatarClick}
                              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white cursor-pointer hover:opacity-80 transition-opacity"
                              style={{ backgroundColor: memberColor }}
                              title={`${displayName}${rawPhone ? ` • +${rawPhone}` : ""}`}
                            >
                              {initials}
                            </div>
                          );
                        }
                        // Non-group: use conversation profile pic
                        return conversation.profilePic ? (
                          <img src={conversation.profilePic} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary">
                            {(conversation.customerName || "؟").slice(0, 1)}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="shrink-0 mb-1">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground" title={msg.senderName || "موظف"}>
                        {(msg.senderName || "م").slice(0, 1)}
                      </div>
                    </div>
                  )
                ) : (
                  <div className="w-8 shrink-0" />
                )}
                <div className={cn("flex flex-col min-w-0 max-w-full", msg.sender === "agent" ? "items-end" : "items-start")}>
                  <SwipeableMessageBubble
                    msg={msg}
                    conversation={conversation}
                    onReply={handleReply}
                    onEdit={onEditMessage ? handleStartEdit : undefined}
                    onDelete={onDeleteMessage ? handleDeleteMsg : undefined}
                    onImageClick={(src) => setLightboxSrc(src)}
                    hasAiConfig={hasAiConfig}
                    groupParticipants={isGroup ? groupParticipants : undefined}
                    onCopyLink={copyMessageLink}
                    onForward={(m) => setForwardMsg(m)}
                    onStar={(m) => {
                      const starred = !(m as any).isStarred;
                      onStarMessage?.(m.id, starred);
                      toast.success(starred ? "⭐ تم تمييز الرسالة" : "تم إلغاء التمييز");
                    }}
                    translationText={translations[msg.id]}
                    isFirstInGroup={isFirstInGroup}
                  />
                  {/* Agent name label below bubble — only for first in consecutive group */}
                  {msg.sender === "agent" && msg.senderName && isFirstInGroup && conversation.conversationType !== "group" && (
                    <span className="text-[10px] text-muted-foreground/60 mt-0.5 mr-1 font-medium">{msg.senderName}</span>
                  )}
                </div>
              </div>
            )}
          </div>
          );
        })}
        {/* Floating @ mention navigation button */}
        {isGroup && mentionMessageIds.length > 0 && (
          <div className="sticky bottom-2 flex justify-start px-2 z-20">
            <div className="flex items-center gap-1 bg-card border border-primary/30 rounded-full shadow-lg px-2 py-1">
              <button
                onClick={() => navigateToMention("up")}
                disabled={currentMentionIdx <= 0}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-secondary disabled:opacity-30 transition-colors"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigateToMention("down")}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold"
              >
                <AtSign className="w-3.5 h-3.5" />
                <span>{currentMentionIdx + 1}/{mentionMessageIds.length}</span>
              </button>
              <button
                onClick={() => navigateToMention("down")}
                disabled={currentMentionIdx >= mentionMessageIds.length - 1}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-secondary disabled:opacity-30 transition-colors"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        {/* Customer typing indicator */}
        {customerTyping && (
          <div className="flex justify-end">
            <div className="bg-card border border-border rounded-xl rounded-bl-sm px-4 py-2.5 text-sm">
              <div className="flex gap-1 items-center">
                <span className="text-xs text-muted-foreground">يكتب</span>
                <span className="flex gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          </div>
        )}
        {/* Other agents typing indicator */}
        {otherTypingAgents.length > 0 && (
           <div className="flex justify-start">
            <div className="bg-primary/10 text-primary text-[11px] px-3 py-1.5 rounded-xl rounded-bl-sm flex items-center gap-1.5">
              <span className="font-medium">{otherTypingAgents.join("، ")}</span>
              <span>يكتب الآن</span>
              <span className="flex gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies */}
      {showQuickReplies && !windowExpired && !isNoteMode && savedReplies.length > 0 && (
        <div className="shrink-0 border-t border-border bg-card px-3 py-2 flex gap-2 overflow-x-auto">
          {savedReplies.map((qr) => (
            <button key={qr.id} onClick={() => handleQuickReply(qr.content)} className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium">
              {qr.title}
            </button>
          ))}
        </div>
      )}

      {/* Saved Replies Popup (/ shortcut) */}
      {showSavedReplies && !windowExpired && !isNoteMode && (
        <div className="shrink-0 border-t border-primary/20 bg-card px-3 py-2 max-h-[200px] overflow-y-auto">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
              <Zap className="w-3 h-3 text-primary" /> ردود محفوظة
            </p>
            <button onClick={() => { setShowSavedReplies(false); setInputText(""); }} className="text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          </div>
          {filteredSavedReplies.length > 0 ? (
            <div className="space-y-1">
              {filteredSavedReplies.map((reply) => (
                <button
                  key={reply.id}
                  onClick={() => insertSavedReply(reply)}
                  className="w-full text-right px-3 py-2 rounded-lg hover:bg-secondary transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-mono shrink-0">/{reply.shortcut}</Badge>
                    <span className="text-xs font-medium truncate">{reply.title}</span>
                    {reply.category && <span className="text-[9px] text-muted-foreground mr-auto">{reply.category}</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5 group-hover:text-foreground transition-colors">{reply.content}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-3">
              {savedReplies.length === 0 ? "لا توجد ردود محفوظة — أضفها من الإعدادات" : "لا توجد نتائج لـ /" + savedReplyFilter}
            </p>
          )}
        </div>
      )}

      {showMentions && filteredMentionAgents.length > 0 && (
        <div className="border-t border-border bg-card px-3 py-2">
          <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">
            {isGroupMentionMode ? "اذكر عضو في القروب" : "اذكر موظف"}
          </p>
          <div className="flex flex-col gap-0.5 max-h-[220px] overflow-y-auto">
            {filteredMentionAgents.map((a: any) => {
              const displayName = a.full_name || a.name || a.phone || "";
              const initials = displayName.slice(0, 2);
              const memberColor = isGroupMentionMode ? getMemberColor(a.phone || a.rawDigits || a.id || displayName) : undefined;
              return (
                <button key={a.id} onClick={() => insertMention(displayName, a.phone, a.id)}
                  className="flex items-center gap-2.5 text-xs px-3 py-2.5 rounded-xl hover:bg-accent transition-colors text-right">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                    style={{ backgroundColor: memberColor || "hsl(var(--primary))" }}>
                    {initials}
                  </div>
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <span className="font-semibold text-[13px] truncate flex items-center gap-1"
                      style={{ color: memberColor }}>
                      {displayName}
                      {isGroupMentionMode && a.admin && <Crown className="w-3 h-3 shrink-0" />}
                    </span>
                    {isGroupMentionMode && a.phone && (
                      <span className="text-[10px] text-muted-foreground" dir="ltr">+{a.phone}</span>
                    )}
                    {isGroupMentionMode && !a.phone && a.id?.includes("@lid") && (
                      <span className="text-[10px] text-muted-foreground">بدون رقم (LID)</span>
                    )}
                  </div>
                  {isGroupMentionMode && a.admin && (
                    <Badge variant="secondary" className="text-[8px] px-1.5 py-0 h-4 shrink-0 bg-amber-100 text-amber-700 border-0">مشرف</Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Recording UI */}
      {isRecording && (
        <VoiceRecorder onSend={handleVoiceSend} onCancel={handleVoiceCancel} />
      )}

      {/* Blocked Warning Banner */}
      {isBlocked && !isRecording && conversation.status !== "closed" && (
        <div className="shrink-0 border-t border-destructive/20 bg-destructive/5 px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-destructive">
            <Ban className="w-4 h-4 shrink-0" />
            <span className="text-xs font-medium">هذا الرقم محظور — الرسائل لن تصل إليه</span>
          </div>
          <button
            onClick={handleToggleBlock}
            className="text-[11px] font-medium text-primary hover:underline shrink-0"
          >
            إلغاء الحظر
          </button>
        </div>
      )}

      {/* Input Area */}
      {!isRecording && (
        <InputAreaNew
          inputText={inputText}
          onInputChange={handleInputChange}
          onSend={handleSend}
          onRecord={() => setIsRecording(true)}
          onFileSelect={handleFileSelect}
          onToggleNote={() => setIsNoteMode(!isNoteMode)}
          onToggleMention={() => {
            setInputText(prev => prev + "@");
            setShowMentions(true);
            setMentionFilter("");
            if (!isGroup && !isNoteMode) setIsNoteMode(true);
            inputRef.current?.focus();
          }}
          onToggleSavedReplies={() => setShowQuickReplies(!showQuickReplies)}
          isNoteMode={isNoteMode}
          isBlocked={isBlocked}
          windowExpired={windowExpired}
          imagePreview={imagePreview}
          onCancelImagePreview={cancelImagePreview}
          onSendImage={handleSendImage}
          isUploading={isUploading}
          replyTo={replyTo ? {
            senderName: replyTo.sender === "agent" ? "أنت" : (replyTo.senderName || conversation.customerName),
            text: replyTo.text
          } : null}
          onCancelReply={cancelReply}
          isEmailChannel={isEmailChannel}
          enterToSend={enterToSend}
        />
      )}
      {false && (
        <div className={cn("shrink-0 bg-card border-t", isNoteMode ? "border-amber-500/30" : "border-border/40")} style={{ boxShadow: '0 -1px 3px rgba(0,0,0,0.04)' }}>
          {/* Reply Preview Bar */}
          {replyTo && (
            <div className="flex items-center gap-2 mx-3 mt-2.5 bg-secondary/60 rounded-lg p-2.5 border-r-4 border-primary animate-fade-in">
              <Reply className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-primary truncate">
                  {replyTo.sender === "agent" ? "أنت" : replyTo.senderName || conversation.customerName}
                </p>
                <p className="text-[12px] text-muted-foreground truncate">{replyTo.text}</p>
              </div>
              <button onClick={cancelReply} className="w-6 h-6 rounded-full hover:bg-muted flex items-center justify-center shrink-0">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          )}

          {/* Email To/CC/BCC Fields with Chips */}
          {isEmailChannel && !isNoteMode && (
            <div className="mx-3 mt-2 space-y-1">
              {/* Email Subject */}
              <div className="flex items-center gap-2 bg-secondary/40 rounded-lg px-2 py-1.5 border border-border/30">
                <span className="text-[11px] text-muted-foreground font-medium shrink-0">📧</span>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="الموضوع..."
                  className="flex-1 text-[13px] font-medium bg-transparent border-0 outline-none text-foreground placeholder:text-muted-foreground/50"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowEmailFields(!showEmailFields)}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 shrink-0"
                >
                  <Mail className="w-3 h-3" />
                  {showEmailFields ? "إخفاء" : "To / Cc / Bcc"}
                  <ChevronDown className={cn("w-3 h-3 transition-transform", showEmailFields && "rotate-180")} />
                </button>
                {!showEmailFields && (emailToChips.length > 0 || emailCcChips.length > 0 || emailBccChips.length > 0) && (
                  <span className="text-[10px] text-primary truncate">
                    {emailToChips.length > 0 && `إلى: ${emailToChips.join(", ")}`}
                    {emailToChips.length > 0 && emailCcChips.length > 0 && " | "}
                    {emailCcChips.length > 0 && `Cc: ${emailCcChips.join(", ")}`}
                    {emailBccChips.length > 0 && ` | Bcc: ${emailBccChips.join(", ")}`}
                  </span>
                )}
              </div>
              {showEmailFields && (
                <div className="space-y-1.5 bg-secondary/40 rounded-lg p-2 border border-border/30">
                  {/* To field */}
                  <div className="flex items-start gap-2">
                    <span className="text-[11px] text-muted-foreground font-medium w-8 shrink-0 text-left mt-1.5">To:</span>
                    <EmailRecipientAutocomplete
                      chips={emailToChips}
                      setChips={setEmailToChips}
                      inputValue={emailToInput}
                      setInputValue={setEmailToInput}
                      placeholder={!conversation.customerPhone ? "أضف إيميل..." : "أضف آخر..."}
                      chipClassName="bg-primary/10 text-primary"
                    />
                  </div>
                  {/* Cc field */}
                  <div className="flex items-start gap-2">
                    <span className="text-[11px] text-muted-foreground font-medium w-8 shrink-0 text-left mt-1.5">Cc:</span>
                    <EmailRecipientAutocomplete
                      chips={emailCcChips}
                      setChips={setEmailCcChips}
                      inputValue={emailCcInput}
                      setInputValue={setEmailCcInput}
                      placeholder="أضف Cc..."
                      chipClassName="bg-accent text-accent-foreground"
                    />
                  </div>
                  {/* Bcc field */}
                  <div className="flex items-start gap-2">
                    <span className="text-[11px] text-muted-foreground font-medium w-8 shrink-0 text-left mt-1.5">Bcc:</span>
                    <EmailRecipientAutocomplete
                      chips={emailBccChips}
                      setChips={setEmailBccChips}
                      inputValue={emailBccInput}
                      setInputValue={setEmailBccInput}
                      placeholder="أضف Bcc..."
                      chipClassName="bg-muted text-muted-foreground"
                    />
                  </div>
                </div>
              )}
              {/* Signature Preview */}
              {emailSignature && (
                <div className="bg-muted/30 rounded-lg px-2 py-1.5 border border-border/20">
                  <div className="flex items-center gap-1 mb-0.5">
                    <Pencil className="w-2.5 h-2.5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground font-medium">التوقيع</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/80 whitespace-pre-line line-clamp-3">{emailSignature}</p>
                </div>
              )}
            </div>
          )}

          {/* Send Quota Banner */}
          <SendQuotaBanner
            channelId={conversation.channelId}
            channelType={conversation.channelType}
          />

          {/* AI Suggestions Row */}
          {aiSuggestions.length > 0 && (
            <div className="flex gap-1.5 px-3 pt-2 overflow-x-auto pb-1">
              <span className="flex items-center gap-1 text-[10px] text-primary font-medium shrink-0 px-1">
                <Sparkles className="w-3 h-3" /> AI:
              </span>
              {aiSuggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { setInputText(s); setAiSuggestions([]); inputRef.current?.focus(); }}
                  className="shrink-0 text-[11px] px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors max-w-[200px] truncate"
                >
                  {s}
                </button>
              ))}
              <button onClick={() => setAiSuggestions([])} className="shrink-0 p-1 rounded-full hover:bg-muted">
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          )}

          {/* File Preview */}
          {imagePreview && (
            <div className="relative mx-3 mt-2 inline-block">
              {imagePreview.file.type.startsWith("image/") ? (
                <img src={imagePreview.url} alt="معاينة" className="max-h-28 rounded-lg border border-border object-cover" />
              ) : imagePreview.file.type.startsWith("video/") ? (
                <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2 border border-border">
                  <Video className="w-5 h-5 text-primary" />
                  <span className="text-xs font-medium truncate max-w-[200px]">{imagePreview.file.name}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2 border border-border">
                  <FileText className="w-5 h-5 text-primary" />
                  <span className="text-xs font-medium truncate max-w-[200px]">{imagePreview.file.name}</span>
                </div>
              )}
              <button onClick={cancelImagePreview} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Text Input Area */}
          <div className={cn("mx-3 mt-2.5 rounded-2xl border", isNoteMode ? "border-amber-500/20 bg-amber-500/3" : "border-border/40 bg-background")}>
            {windowExpired && !isNoteMode ? (
              <button onClick={() => setShowTemplates(true)} className="w-full text-right text-sm text-muted-foreground px-4 py-3 hover:bg-accent/50 transition-colors rounded-2xl">
                اختر قالباً لإرسال رسالة...
              </button>
            ) : (
              <textarea
                ref={inputRef as any}
                placeholder={imagePreview ? "أضف تعليقاً (اختياري)..." : isNoteMode ? "ملاحظة داخلية... @ لذكر موظف" : "أدخل الرسالة..."}
                value={inputText}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    // Email channels: Enter always = new line, send via button only
                    if (isEmailChannel) {
                      // Do nothing - let Enter create a new line naturally
                    } else if (enterToSend && !e.shiftKey) {
                      e.preventDefault();
                      imagePreview ? handleSendImage() : handleSend();
                    } else if (!enterToSend && e.shiftKey) {
                      e.preventDefault();
                      imagePreview ? handleSendImage() : handleSend();
                    }
                  }
                }}
                rows={1}
                className="border-0 bg-transparent min-h-[40px] max-h-[120px] text-base px-4 py-2.5 focus-visible:ring-0 focus-visible:ring-offset-0 w-full resize-none outline-none"
                style={{ height: "auto", overflow: "auto" }}
                onInput={(e) => {
                  const el = e.target as HTMLTextAreaElement;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 120) + "px";
                }}
              />
            )}

            {/* Tools Row inside input box */}
            {(!windowExpired || isNoteMode) && (
              <div className="flex items-center gap-0 px-2 pb-1.5 border-t border-border/10">
                {!isNoteMode && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0">
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
                )}
                {!isNoteMode && (
                  <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0" onClick={() => fileInputRef.current?.click()} title="إرفاق ملف">
                    <Paperclip className="w-4 h-4" />
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept={allowedFileTypes} className="hidden" onChange={handleFileSelect} />
                <input ref={groupPicInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleChangeGroupPicture(file); if (e.target) e.target.value = ""; }} />
                {!isNoteMode && (
                  <button onClick={() => setShowQuickReplies(!showQuickReplies)} className={cn("p-1.5 rounded-lg transition-colors shrink-0", showQuickReplies ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground")}>
                    <Zap className="w-4 h-4" />
                  </button>
                )}
                {!isNoteMode && isMetaChannel && (
                  <button onClick={() => setShowTemplates(true)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0" title="إرسال قالب">
                    <FileText className="w-4 h-4" />
                  </button>
                )}
                {!isNoteMode && !windowExpired && isMetaChannel && hasProducts && (
                  <button onClick={() => setShowProductPicker(true)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0" title="إرسال منتج">
                    <ShoppingBag className="w-4 h-4" />
                  </button>
                )}
                {!isNoteMode && !isMetaChannel && hasProducts && (
                  <button onClick={() => setShowInternalProductPicker(true)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0" title="إرسال منتج">
                    <ShoppingBag className="w-4 h-4" />
                  </button>
                )}
                {!isNoteMode && isEvolutionChannel && (
                  <button onClick={() => setShowPollCreator(true)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0" title="إرسال استطلاع">
                    <BarChart3 className="w-4 h-4" />
                  </button>
                )}
                {!isNoteMode && !isEmailChannel && (
                  <button onClick={() => setShowContactCard(true)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0" title="إرسال بطاقة اتصال">
                    <Contact className="w-4 h-4" />
                  </button>
                )}
                {!isNoteMode && isEmailChannel && (
                  <button onClick={() => setShowEmailTemplatePicker(true)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0" title="قوالب البريد">
                    <FileText className="w-4 h-4" />
                  </button>
                )}
                {!isNoteMode && !windowExpired && !isEmailChannel && (
                  <button onClick={() => setIsRecording(true)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0" title="تسجيل صوتي">
                    <Mic className="w-4 h-4" />
                  </button>
                )}
                {hasAiConfig && !isNoteMode && !windowExpired && (
                  <button
                    onClick={async () => {
                      setAiLoading(true);
                      setAiSuggestions([]);
                      try {
                        const { data, error } = await invokeCloud("ai-features", {
                          body: {
                            action: "suggest_replies",
                            conversation_messages: messages.slice(-5).map(m => ({ sender: m.sender, content: m.text })),
                            customer_name: conversation.customerName,
                          },
                        });
                        if (data?.suggestions?.length > 0) setAiSuggestions(data.suggestions);
                        else if (data?.error === "ai_not_configured") toast.error("لم يتم إعداد مزود AI — اذهب للإعدادات");
                      } catch { toast.error("فشل جلب الاقتراحات"); }
                      setAiLoading(false);
                    }}
                    disabled={aiLoading}
                    className={cn("p-1.5 rounded-lg transition-colors shrink-0", aiLoading ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground")}
                    title="اقتراحات AI"
                  >
                    {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  </button>
                )}
                {hasAiConfig && (
                  <button
                    onClick={async () => {
                      setAiLoading(true);
                      try {
                        const { data } = await invokeCloud("ai-features", { body: { action: "summarize", conversation_id: conversation.id } });
                        if (data?.summary) { setAiSummary(data.summary); setShowSummary(true); }
                        else if (data?.error === "ai_not_configured") toast.error("لم يتم إعداد مزود AI");
                      } catch { toast.error("فشل التلخيص"); }
                      setAiLoading(false);
                    }}
                    disabled={aiLoading}
                    className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0"
                    title="تلخيص المحادثة (AI)"
                  >
                    <Brain className="w-4 h-4" />
                  </button>
                )}
                {hasAiConfig && (
                  <button
                    onClick={() => setAutoTranslate(!autoTranslate)}
                    className={cn("p-1.5 rounded-lg transition-colors shrink-0", autoTranslate ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground")}
                    title={autoTranslate ? "إيقاف الترجمة التلقائية" : "تفعيل الترجمة التلقائية"}
                  >
                    <Languages className="w-4 h-4" />
                  </button>
                )}
                {/* Separator */}
                <div className="w-px h-5 bg-border/40 mx-0.5 shrink-0" />
                <button
                  onClick={() => { setIsNoteMode(!isNoteMode); inputRef.current?.focus(); }}
                  className={cn("p-1.5 rounded-lg transition-colors shrink-0", isNoteMode ? "bg-amber-500/10 text-amber-500" : "hover:bg-secondary text-muted-foreground")}
                  title="ملاحظة داخلية"
                >
                  <StickyNote className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setInputText((prev) => prev + "@");
                    setShowMentions(true);
                    setMentionFilter("");
                    if (!isGroup && !isNoteMode) setIsNoteMode(true);
                    inputRef.current?.focus();
                  }}
                  className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0"
                  title={isGroup && !isNoteMode ? "اذكر عضو @" : "اذكر موظف @"}
                >
                  <AtSign className="w-4 h-4" />
                </button>
              </div>
            )}
            {/* Always show note & mention buttons even when window expired */}
            {windowExpired && !isNoteMode && (
              <div className="flex items-center gap-0 px-2 pb-1.5 border-t border-border/10">
                <button
                  onClick={() => { setIsNoteMode(true); inputRef.current?.focus(); }}
                  className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0"
                  title="ملاحظة داخلية"
                >
                  <StickyNote className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setInputText((prev) => prev + "@");
                    setShowMentions(true);
                    setMentionFilter("");
                    setIsNoteMode(true);
                    inputRef.current?.focus();
                  }}
                  className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0"
                  title="اذكر موظف @"
                >
                  <AtSign className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Bottom Action Bar */}
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-1">
              {/* Note mode indicator */}
              <button
                onClick={() => { setIsNoteMode(!isNoteMode); inputRef.current?.focus(); }}
                className={cn("flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors", isNoteMode ? "text-red-600 bg-red-500/15 ring-1 ring-red-400/30" : "text-red-500 hover:text-red-600 hover:bg-red-500/10")}
              >
                رسالة داخلية
                <div className={cn("w-8 h-4.5 rounded-full relative transition-colors", isNoteMode ? "bg-red-500" : "bg-red-300/50")}>
                  <div className={cn("absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-all", isNoteMode ? "right-0.5" : "left-0.5")} />
                </div>
              </button>
              {/* Schedule */}
              {inputText.trim() && (isNoteMode || !windowExpired) && (
                <ScheduleMessagePopover
                  conversationId={conversation.id}
                  customerPhone={conversation.customerPhone}
                  messageText={inputText}
                  channelType={conversation.channelType}
                  lastCustomerMessageAt={conversation.lastCustomerMessageAt}
                  templates={templates}
                  onScheduled={() => {}}
                  onClearInput={() => setInputText("")}
                >
                  <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0" title="جدولة الإرسال">
                    <Clock className="w-4 h-4" />
                  </button>
                </ScheduleMessagePopover>
              )}
              {/* Link */}
              <button onClick={copyConversationLink} className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-red-500 shrink-0" title="نسخ رابط المحادثة">
                <Link2 className="w-4 h-4" />
              </button>
              {/* Enter mode toggle - hidden for email */}
              {!isEmailChannel && (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0" title={enterToSend ? "Enter = إرسال" : "Enter = سطر جديد"}>
                    {enterToSend ? <CornerDownLeft className="w-4 h-4" /> : <WrapText className="w-4 h-4" />}
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-48 p-1" dir="rtl">
                  <button
                    onClick={() => { setEnterToSend(true); localStorage.setItem("enterToSend", "true"); }}
                    className={cn("w-full flex items-center gap-2 px-3 py-2 text-xs rounded-md transition-colors", enterToSend ? "bg-primary/10 text-primary" : "hover:bg-secondary")}
                  >
                    <CornerDownLeft className="w-3.5 h-3.5" />
                    <span>Enter = إرسال</span>
                    {enterToSend && <Check className="w-3 h-3 mr-auto" />}
                  </button>
                  <button
                    onClick={() => { setEnterToSend(false); localStorage.setItem("enterToSend", "false"); }}
                    className={cn("w-full flex items-center gap-2 px-3 py-2 text-xs rounded-md transition-colors", !enterToSend ? "bg-primary/10 text-primary" : "hover:bg-secondary")}
                  >
                    <WrapText className="w-3.5 h-3.5" />
                    <span>Enter = سطر جديد</span>
                    {!enterToSend && <Check className="w-3 h-3 mr-auto" />}
                  </button>
                </PopoverContent>
              </Popover>
              )}
            </div>
            {/* Send Button */}
            {(isNoteMode || !windowExpired) && (
              imagePreview ? (
                <button onClick={handleSendImage} disabled={isUploading} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-primary hover:bg-primary/90 transition-all">
                  {isUploading ? <Loader2 className="w-4 h-4 text-primary-foreground animate-spin" /> : <Send className="w-4 h-4 text-primary-foreground" style={{ transform: "scaleX(-1)" }} />}
                </button>
              ) : inputText.trim() ? (
                <button onClick={handleSend} className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all", isNoteMode ? "bg-amber-500 hover:bg-amber-600" : "bg-primary hover:bg-primary/90")}>
                  <Send className="w-4 h-4 text-primary-foreground" style={{ transform: "scaleX(-1)" }} />
                </button>
              ) : !isNoteMode ? (
                isEmailChannel ? (
                  <button disabled className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-muted">
                    <Send className="w-4 h-4 text-muted-foreground" style={{ transform: "scaleX(-1)" }} />
                  </button>
                ) : (
                  <button onClick={() => setIsRecording(true)} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-primary hover:bg-primary/90 transition-all">
                    <Mic className="w-4 h-4 text-primary-foreground" />
                  </button>
                )
              ) : (
                <button disabled className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-muted">
                  <Send className="w-4 h-4 text-muted-foreground" style={{ transform: "scaleX(-1)" }} />
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* Template Picker Dialog */}
      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>اختر قالباً للإرسال</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            {approvedTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">لا توجد قوالب معتمدة</p>
            ) : (
              approvedTemplates.map((t) => (
                <button key={t.id} onClick={() => openTemplateFill(t)} className="w-full text-right bg-secondary/50 hover:bg-secondary rounded-xl p-3 transition-colors space-y-1.5">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-semibold text-sm">{t.name}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-0 bg-success/10 text-success mr-auto">معتمد</Badge>
                  </div>
                  {t.header && <p className="text-xs font-medium">{t.header}</p>}
                  <p className="text-xs text-muted-foreground line-clamp-2">{t.body}</p>
                  {t.variableCount > 0 && <p className="text-[10px] text-muted-foreground">{t.variableCount} متغير</p>}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Variable Fill Dialog - WhatsApp Style Preview */}
      <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>معاينة وإرسال القالب</DialogTitle></DialogHeader>
          {selectedTemplate && (
            <div className="space-y-4 mt-2">
              {/* WhatsApp-style preview card */}
              <div className="bg-[#e7fed6] dark:bg-[#025c4c] rounded-xl p-4 shadow-sm space-y-2 relative">
                <div className="absolute top-2 left-2">
                  <Badge variant="outline" className="text-[9px] border-0 bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60">معاينة</Badge>
                </div>
                {(() => { const { header, text } = fillTemplateBody(selectedTemplate, templateVars); return (
                  <>
                    {header && <p className="font-bold text-sm text-black dark:text-white">{header}</p>}
                    <p className="text-sm whitespace-pre-wrap text-black/90 dark:text-white/90 leading-relaxed">{text}</p>
                    {selectedTemplate.footer && <p className="text-[11px] text-black/50 dark:text-white/50">{selectedTemplate.footer}</p>}
                    {selectedTemplate.buttons && selectedTemplate.buttons.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-black/10 dark:border-white/10">
                        {selectedTemplate.buttons.map((btn, i) => (
                          <div key={i} className="text-center text-xs text-[#00a884] font-medium py-2 bg-white/60 dark:bg-white/10 rounded-lg cursor-default">{btn.text}</div>
                        ))}
                      </div>
                    )}
                  </>
                ); })()}
                <div className="flex items-center justify-end gap-1 pt-1">
                  <span className="text-[10px] text-black/40 dark:text-white/40">الآن</span>
                  <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                </div>
              </div>

              {/* Variables input */}
              {selectedTemplate.variableCount > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">المتغيرات:</p>
                  {Array.from({ length: selectedTemplate.variableCount }, (_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] shrink-0 w-12 justify-center">{`{{${i + 1}}}`}</Badge>
                      <Input
                        value={templateVars[i] || ""}
                        onChange={(e) => { const nv = [...templateVars]; nv[i] = e.target.value; setTemplateVars(nv); }}
                        placeholder={`متغير ${i + 1}`}
                        className="text-sm bg-secondary border-0 h-9"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Recipient info */}
              <div className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg text-xs text-muted-foreground">
                <Send className="w-3.5 h-3.5" style={{ transform: "scaleX(-1)" }} />
                <span>سيُرسل إلى: <strong className="text-foreground">{conversation.customerName || conversation.customerPhone}</strong></span>
              </div>

              <Button onClick={handleSendTemplate} className="w-full gradient-whatsapp text-whatsapp-foreground gap-2">
                <Send className="w-4 h-4" style={{ transform: "scaleX(-1)" }} /> إرسال القالب
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* AI Summary Dialog */}
      <Dialog open={showSummary} onOpenChange={setShowSummary}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Brain className="w-4 h-4 text-primary" /> ملخص المحادثة</DialogTitle></DialogHeader>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{aiSummary}</p>
        </DialogContent>
      </Dialog>

      {/* Edit Message Dialog */}
      <Dialog open={!!editingMsg} onOpenChange={() => setEditingMsg(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>تعديل الرسالة</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <Input
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConfirmEdit()}
              className="text-sm"
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 gap-1" onClick={handleConfirmEdit} disabled={!editText.trim()}>
                <Pencil className="w-3 h-3" /> حفظ التعديل
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingMsg(null)}>إلغاء</Button>
            </div>
            <p className="text-[10px] text-muted-foreground">{isEvolutionChannel ? "يمكن تعديل الرسالة خلال ساعة من الإرسال" : "يمكن تعديل الرسالة خلال 15 دقيقة من الإرسال فقط"}</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <TransferDialog
        open={showTransfer}
        onOpenChange={setShowTransfer}
        conversationId={conversation.id}
        currentAssigneeId={conversation.assignedToId}
        currentAssigneeName={conversation.assignedTo}
        onTransfer={onTransfer}
        currentDedicatedAgentId={conversation.dedicatedAgentId}
      />

      {/* Closure Reason Dialog */}
      <ClosureReasonDialog
        open={showClosureReason}
        onOpenChange={setShowClosureReason}
        conversationId={conversation.id}
        onClose={onStatusChange}
      />

      {/* Snooze Dialog */}
      <SnoozeDialog
        open={showSnooze}
        onOpenChange={setShowSnooze}
        conversationId={conversation.id}
        onSnoozed={(until) => setSnoozedUntil(until)}
      />

      {/* Follow-Up Dialog */}
      <FollowUpDialog
        open={showFollowUp}
        onOpenChange={setShowFollowUp}
        conversationId={conversation.id}
        customerPhone={conversation.customerPhone}
        customerName={conversation.customerName}
        channelType={conversation.channelType}
        templates={templates}
        lastCustomerMessageAt={conversation.lastCustomerMessageAt}
      />

      <ProductPicker
        open={showProductPicker}
        onOpenChange={setShowProductPicker}
        invokeCloud={invokeCloud}
        onSendProduct={async (payload) => {
          await invokeCloud("whatsapp-send", {
            body: {
              to: conversation.customerPhone,
              conversation_id: conversation.id,
              channel_id: conversation.channelId,
              ...payload,
            },
          });
          toast.success("تم إرسال المنتج بنجاح");
        }}
      />

      <InternalProductPicker
        open={showInternalProductPicker}
        onOpenChange={setShowInternalProductPicker}
        onSendProduct={async ({ sendMode, product }) => {
          const displayName = product.name_ar || product.name;
          const priceText = `${product.price.toFixed(2)} ${product.currency || "SAR"}`;
          const caption = `🛍️ *${displayName}*\n💰 ${priceText}${product.description ? `\n📝 ${product.description}` : ""}${product.sku ? `\n🔖 SKU: ${product.sku}` : ""}`;

          const sendFn = conversation.channelType === "meta_api" ? "whatsapp-send" : "evolution-send";
          if (sendMode === "image" && product.image_url) {
            await invokeCloud(sendFn, {
              body: conversation.channelType === "meta_api" ? {
                to: conversation.customerPhone,
                type: "media",
                media_url: product.image_url,
                media_type: "image",
                caption,
                conversation_id: conversation.id,
                channel_id: conversation.channelId,
              } : {
                to: conversation.customerPhone,
                conversation_id: conversation.id,
                message: caption,
                media_url: product.image_url,
                media_type: "image",
                channel_id: conversation.channelId,
              },
            });
          } else {
            await invokeCloud(sendFn, {
              body: conversation.channelType === "meta_api" ? {
                to: conversation.customerPhone,
                message: caption,
                conversation_id: conversation.id,
                channel_id: conversation.channelId,
              } : {
                to: conversation.customerPhone,
                conversation_id: conversation.id,
                message: caption,
                channel_id: conversation.channelId,
              },
            });
          }
          toast.success("تم إرسال المنتج بنجاح");
        }}
      />

      {/* Forward Message Dialog */}
      <ForwardMessageDialog
        open={!!forwardMsg}
        onOpenChange={(open) => !open && setForwardMsg(null)}
        message={forwardMsg}
        sourceConversation={{ channelType: conversation.channelType, channelId: conversation.channelId }}
      />

      {/* Poll Creator Dialog — Evolution only */}
      <PollCreatorDialog
        open={showPollCreator}
        onOpenChange={setShowPollCreator}
        customerPhone={conversation.customerPhone}
        conversationId={conversation.id}
        channelId={conversation.channelId}
      />

      {/* Contact Card Dialog */}
      <ContactCardDialog
        open={showContactCard}
        onOpenChange={setShowContactCard}
        customerPhone={conversation.customerPhone}
        conversationId={conversation.id}
        channelId={conversation.channelId}
        orgId={orgId}
      />

      {/* Disappearing Messages Submenu */}
      <Dialog open={showDisappearingMenu} onOpenChange={setShowDisappearingMenu}>
        <DialogContent className="max-w-xs" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Timer className="w-4 h-4 text-primary" /> الرسائل المختفية</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {[
              { label: "إيقاف", value: 0 },
              { label: "24 ساعة", value: 86400 },
              { label: "7 أيام", value: 604800 },
              { label: "90 يوم", value: 7776000 },
            ].map((opt) => (
              <Button
                key={opt.value}
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={async () => {
                  try {
                    await invokeCloud("evolution-manage", {
                      body: { action: "set_disappearing", phone: conversation.customerPhone, expiration: opt.value },
                    });
                    toast.success(opt.value === 0 ? "تم إيقاف الرسائل المختفية" : `تم تفعيل الرسائل المختفية: ${opt.label}`);
                    setShowDisappearingMenu(false);
                  } catch { toast.error("فشل تغيير الإعداد"); }
                }}
              >
                <Timer className="w-4 h-4" /> {opt.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      {/* Add Members Dialog */}
      <Dialog open={showAddMembersDialog} onOpenChange={setShowAddMembersDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إدارة أعضاء القروب</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Add new member */}
            <div className="flex gap-2">
              <Input
                placeholder="رقم الهاتف مع مفتاح الدولة (مثال: 966500000000)"
                value={addMemberPhone}
                onChange={(e) => setAddMemberPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
                dir="ltr"
                className="text-left"
              />
              <Button onClick={handleAddMember} disabled={addingMember || !addMemberPhone.trim()} size="sm">
                {addingMember ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              </Button>
            </div>
            {/* Current members list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground font-medium">{groupParticipants.length} عضو</p>
                <span className="text-[10px] text-muted-foreground">{groupParticipants.filter(p => p.admin).length} مشرف</span>
              </div>
              <input
                placeholder="بحث بالاسم أو الرقم..."
                className="w-full border border-border rounded-xl px-3 py-1.5 text-xs bg-background focus:outline-none"
                dir="rtl"
                onChange={e => {
                  const q = e.target.value.toLowerCase();
                  const els = document.querySelectorAll("[data-member-row]");
                  els.forEach((el) => {
                    const txt = (el as HTMLElement).dataset.memberRow || "";
                    (el as HTMLElement).style.display = txt.includes(q) ? "" : "none";
                  });
                }}
              />
              <div className="max-h-64 overflow-y-auto space-y-1 -mx-1 px-1">
                {groupParticipants.map((p) => {
                  const color = getMemberColor(p.phone || p.rawDigits || p.id);
                  return (
                    <div key={p.id} data-member-row={`${p.name} ${p.phone}`.toLowerCase()}
                      className="flex items-center justify-between py-2 px-2.5 rounded-xl hover:bg-secondary/50 transition-colors group">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ backgroundColor: color }}>
                          {(p.name || p.phone).slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold truncate flex items-center gap-1" style={{ color }}>
                            {p.name || `+${p.phone}`}
                            {p.admin && <Crown className="w-3 h-3 shrink-0 text-amber-500" />}
                            {p.isSaved && <span className="text-[9px] text-muted-foreground font-normal">جهة اتصال</span>}
                          </p>
                          {p.phone && (
                            <button
                              onClick={() => { navigator.clipboard.writeText(`+${p.phone}`); toast.success("تم نسخ الرقم"); }}
                              className="text-[10px] text-muted-foreground hover:text-primary transition-colors" dir="ltr">
                              +{p.phone}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setFilterMemberPhone(p.phone || p.rawDigits || null); setShowAddMembersDialog(false); }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          title="عرض رسائله فقط">
                          <SearchIcon className="w-3.5 h-3.5" />
                        </button>
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemoveMember(p.phone)}>
                          <UserMinus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reaction Details Sheet - WhatsApp style */}
      <Dialog open={!!reactionDetails} onOpenChange={(open) => !open && setReactionDetails(null)}>
        <DialogContent className="max-w-sm p-0 rounded-t-2xl" dir="rtl">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-sm text-center">
              {reactionDetails?.reactions?.length || 0} {(reactionDetails?.reactions?.length || 0) > 2 ? "تفاعلات" : (reactionDetails?.reactions?.length || 0) === 2 ? "تفاعلان" : "تفاعل"}
            </DialogTitle>
          </DialogHeader>
          {reactionDetails && (() => {
            const grouped = reactionDetails.reactions.reduce((acc, r) => {
              if (!acc[r.emoji]) acc[r.emoji] = [];
              acc[r.emoji].push(r);
              return acc;
            }, {} as Record<string, typeof reactionDetails.reactions>);
            const [activeTab, setActiveTab] = [Object.keys(grouped)[0], () => {}];
            return (
              <div>
                {/* Emoji tabs */}
                <div className="flex items-center justify-center gap-2 px-4 pb-3">
                  {Object.entries(grouped).map(([emoji, list]) => (
                    <span key={emoji} className="flex items-center gap-1 bg-secondary/60 rounded-full px-3 py-1.5 text-sm">
                      {emoji} <span className="text-xs text-muted-foreground font-medium">{list.length}</span>
                    </span>
                  ))}
                </div>
                {/* Participants list */}
                <div className="px-4 pb-4 space-y-1 max-h-[300px] overflow-y-auto">
                  {reactionDetails.reactions.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 py-2">
                      <span className="text-xl">{r.emoji}</span>
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                        {(r.participantName || r.participant || "أنت").slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {r.fromMe ? "أنت" : (r.participantName || r.participant || "غير معروف")}
                        </p>
                        {r.participant && !r.fromMe && (
                          <p className="text-[10px] text-muted-foreground" dir="ltr">+{r.participant}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
      {/* Message Selection Floating Bar */}
      {selectingMessages && selectedMsgIds.size > 0 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 bg-card border border-border shadow-lg rounded-xl px-4 py-2.5 flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">{selectedMsgIds.size} رسالة محددة</span>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => {
            if (orgId) supabase.from("profiles").select("id, full_name").eq("org_id", orgId).eq("is_active", true).then(({data}) => setTicketAgents(data || []));
            setShowTicketDialog(true);
          }}>
            <Ticket className="w-3 h-3" /> إنشاء تذكرة
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setSelectingMessages(false); setSelectedMsgIds(new Set()); }}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {/* Create Ticket Dialog */}
      <CreateTicketDialog
        open={showTicketDialog}
        onOpenChange={(open) => { setShowTicketDialog(open); if (!open) { setSelectingMessages(false); setSelectedMsgIds(new Set()); } }}
        onCreated={() => { toast.success("تم إنشاء التذكرة"); setSelectingMessages(false); setSelectedMsgIds(new Set()); }}
        agents={ticketAgents}
        conversationId={conversation.id}
        customerPhone={conversation.customerPhone}
        customerName={conversation.customerName}
        messageIds={Array.from(selectedMsgIds)}
        messagePreviews={messages.filter(m => selectedMsgIds.has(m.id)).map(m => ({ sender: m.sender, text: m.text, timestamp: m.timestamp }))}
        defaultDescription={selectedMsgIds.size > 0 ? `تذكرة من محادثة: ${conversation.customerName}` : undefined}
      />
      {/* Email Template Picker */}
      <EmailTemplatePicker
        open={showEmailTemplatePicker}
        onOpenChange={setShowEmailTemplatePicker}
        onSelect={(subject, body) => {
          setEmailSubject(subject);
          setInputText(body);
          inputRef.current?.focus();
        }}
      />

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title || ""}
        description={confirmAction?.description}
        confirmLabel="تأكيد"
        destructive
        onConfirm={() => { confirmAction?.action(); setConfirmAction(null); }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
};

export default ChatArea;
