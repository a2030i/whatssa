import { useState, useRef, useEffect, useCallback } from "react";
import { Send, MoreVertical, ArrowRight, Smile, Paperclip, Zap, Check, CheckCheck, StickyNote, UserPlus, XCircle, CheckCircle2, FileText, AlertTriangle, Clock, AtSign, Mic, Loader2, X, Play, Image as ImageIcon, Video, Reply, Plus, Timer, ShieldCheck, Wifi, MapPin, Contact, Phone as PhoneIcon, Pencil, Trash2, Brain, Languages, Sparkles, Search as SearchIcon, Square, ShoppingBag, Ban, ShieldOff, LogOut, UserMinus, Crown, ChevronUp, ChevronDown, Link2, Forward, Star, BarChart3, Timer as TimerIcon } from "lucide-react";
import { useSwipeReply } from "@/hooks/useSwipeReply";
import ImageLightbox from "./ImageLightbox";
import MessageSearch from "./MessageSearch";
import ProductPicker from "./ProductPicker";
import InternalProductPicker from "./InternalProductPicker";
import { supabase, cloudSupabase, invokeCloud } from "@/lib/supabase";
import { cn } from "@/lib/utils";
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
import ExportConversation from "./ExportConversation";
import { useAuth } from "@/contexts/AuthContext";
import FollowUpDialog from "./FollowUpDialog";
import ScheduleMessagePopover from "./ScheduleMessagePopover";
import ForwardMessageDialog from "./ForwardMessageDialog";
import PollCreatorDialog from "./PollCreatorDialog";
import ContactCardDialog from "./ContactCardDialog";

const emojis = ["😊", "👍", "❤️", "🎉", "🙏", "👋", "✅", "⭐", "🔥", "💯", "😂", "🤝", "📦", "💳", "🚚", "⏰"];

interface ChatAreaProps {
  conversation: Conversation;
  messages: Message[];
  templates: WhatsAppTemplate[];
  onBack: () => void;
  onSendMessage: (convId: string, text: string, type?: "text" | "note", replyTo?: { id: string; waMessageId?: string; senderName?: string; text: string }) => void;
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
    return <img src={resolvedUrl} alt="صورة مرفقة" className="rounded-xl max-w-[260px] max-h-[220px] object-cover mb-1.5 cursor-pointer active:scale-[0.98] transition-transform shadow-sm" onClick={() => onImageClick?.(resolvedUrl)} />;
  }
  if (type === "audio") {
    return <AudioPlayer src={resolvedUrl} isAgent={isAgent} className="mb-1" />;
  }
  if (type === "video") {
    return (
      <div className="mb-1.5 min-w-[240px] rounded-xl bg-background/50 p-2.5 border border-border/10">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold"><Video className="h-4 w-4 text-primary" /><span>مقطع فيديو</span></div>
        <video controls preload="metadata" className="max-h-[260px] w-full rounded-lg"><source src={resolvedUrl} />متصفحك لا يدعم تشغيل الفيديو.</video>
      </div>
    );
  }
  if (type === "document") {
    const pdfFile = isPdfUrl(resolvedUrl) || isPdfUrl(url);
    return (
      <div className="mb-1.5 min-w-[240px] max-w-[min(82vw,480px)] rounded-2xl border border-border/15 bg-background/60 p-2.5 shadow-sm">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{pdfFile ? "ملف PDF" : "ملف مرفق"}</p>
            <p className="text-[10px] text-muted-foreground">يمكنك المعاينة أو الفتح في تبويب جديد</p>
          </div>
          <a
            href={resolvedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center rounded-xl bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            فتح
          </a>
        </div>
        {pdfFile ? (
          <iframe
            src={resolvedUrl}
            title="معاينة PDF"
            className="h-[320px] w-full rounded-xl border border-border/10 bg-background"
          />
        ) : (
          <a
            href={resolvedUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center rounded-xl border border-dashed border-border/40 px-3 py-6 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/40"
          >
            فتح الملف المرفق
          </a>
        )}
      </div>
    );
  }
  return null;
};

const SwipeableMessageBubble = ({ msg, conversation, onReply, onEdit, onDelete, onImageClick, hasAiConfig, groupParticipants, onCopyLink, onForward, onStar, translationText }: { msg: Message; conversation: Conversation; onReply: (msg: Message) => void; onEdit?: (msg: Message) => void; onDelete?: (msg: Message) => void; onImageClick?: (src: string) => void; hasAiConfig?: boolean; groupParticipants?: Array<{ id: string; name: string; phone: string; rawDigits?: string }>; onCopyLink?: (msgId: string) => void; onForward?: (msg: Message) => void; onStar?: (msg: Message) => void; translationText?: string }) => {
  const swipeDirection = msg.sender === "agent" ? "left" : "right";
  const canReply = msg.type !== "note" && !msg.isDeleted;
  const swipe = useSwipeReply({
    onSwipe: () => canReply && onReply(msg),
    direction: swipeDirection,
    threshold: 60,
  });

  // Can edit agent text messages within 15 minutes
  const canEdit = msg.sender === "agent" && msg.type === "text" && msg.waMessageId && !msg.isDeleted && msg.createdAt &&
    (Date.now() - new Date(msg.createdAt).getTime()) < 15 * 60 * 1000;
  const canDelete = msg.sender === "agent" && msg.waMessageId && !msg.isDeleted && msg.createdAt &&
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
      // Optimistic update: show reaction immediately
      const msgEl = document.querySelector(`[data-message-id="${msg.id}"]`);
      if (msgEl) {
        // We can't directly update state here since msg comes from props,
        // but we dispatch a custom event that InboxPage listens to
        window.dispatchEvent(new CustomEvent("optimistic-reaction", {
          detail: { messageId: msg.id, waMessageId: msg.waMessageId, emoji },
        }));
      }

      const { error } = await invokeCloud("evolution-manage", {
        body: {
          action: "send_reaction",
          phone: conversation.customerPhone,
          channel_id: conversation.channelId,
          message_id: msg.waMessageId,
          emoji,
          is_group: conversation.conversationType === "group",
        },
      });

      if (error) throw error;
      setReactionPickerOpen(false);
      toast.success("تم إرسال التفاعل");
    } catch {
      toast.error("فشل إرسال التفاعل");
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

  const hasAnyAction = !msg.isDeleted && (canReply || canEdit || canDelete || (msg.sender === "customer" && msg.type === "text") || (msg.waMessageId && conversation.channelType === "evolution"));

  return (
    <div
      ref={canReply ? swipe.ref : undefined}
      onTouchStart={canReply ? swipe.onTouchStart : undefined}
      onTouchMove={canReply ? swipe.onTouchMove : undefined}
      onTouchEnd={canReply ? swipe.onTouchEnd : undefined}
      className="group relative max-w-[85%] md:max-w-[60%]"
      data-message-id={msg.id}
      data-wa-message-id={msg.waMessageId || undefined}
    >
      {/* Desktop action buttons */}
      {!msg.isDeleted && (
        <div className={cn(
          "absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity z-10 hidden md:flex items-center gap-0.5",
          msg.sender === "agent" ? "right-full mr-2" : "left-full ml-2"
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
          {msg.waMessageId && conversation.channelType === "evolution" && (
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
          {/* Forward button */}
          {onForward && msg.type === "text" && !msg.isDeleted && (
            <button onClick={() => onForward(msg)} className="w-7 h-7 rounded-full bg-secondary shadow-md flex items-center justify-center hover:bg-accent" title="إعادة توجيه">
              <Forward className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
          {/* Star button */}
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
          "absolute top-2 z-10 md:hidden",
          msg.sender === "agent" ? "right-full mr-1" : "left-full ml-1"
        )}>
          <DropdownMenu open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button className="w-6 h-6 rounded-full bg-secondary/80 shadow-sm flex items-center justify-center opacity-60 active:opacity-100">
                <MoreVertical className="w-3 h-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={msg.sender === "agent" ? "start" : "end"} className="min-w-[140px]">
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
              {msg.waMessageId && conversation.channelType === "evolution" && (
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
      <div className={cn(
        "rounded-2xl px-4 py-3 text-[14px] leading-relaxed max-w-full",
        msg.sender === "agent" && !msg.isDeleted && msg.type !== "note" && "pb-3.5",
        msg.isDeleted
          ? "bg-muted/30 border border-dashed border-border/20 text-muted-foreground italic"
          : msg.type === "note"
            ? "bg-amber-50 dark:bg-amber-500/10 border border-amber-200/40 dark:border-amber-500/15 text-foreground rounded-bl-sm"
            : msg.sender === "agent"
              ? "bg-card text-foreground rounded-bl-sm"
              : msg.mentioned && msg.mentioned.length > 0
                ? "bg-primary/90 text-primary-foreground rounded-br-sm"
                : "bg-primary/90 text-primary-foreground rounded-br-sm"
      )} style={msg.sender === "agent" && !msg.isDeleted && msg.type !== "note" ? { boxShadow: 'var(--shadow-xs)' } : undefined}>
        {msg.isDeleted ? (
          <div className="flex items-center gap-1.5 text-xs opacity-70">
            <XCircle className="w-3.5 h-3.5" />
            <span>تم حذف هذه الرسالة</span>
          </div>
        ) : (
          <>
            {conversation.conversationType === "group" && msg.sender === "customer" && (() => {
              // Resolve display name: try groupParticipants first, then fallback to senderName/phone
              const rawJid = msg.senderJid || "";
              const jidIsLidBubble = rawJid.includes("@lid");
              const rawPhone = msg.senderPhone || (!jidIsLidBubble ? normalizeDigits(rawJid) : "");
              let resolvedName = msg.senderName || "";
              if (rawPhone && groupParticipants?.length) {
                const found = groupParticipants.find(p => p.phone === rawPhone || p.rawDigits === rawPhone || (rawPhone.length >= 7 && (p.phone.endsWith(rawPhone) || rawPhone.endsWith(p.phone))));
                if (found?.name && found.name !== found.phone && found.name !== found.rawDigits && !found.name.startsWith("عضو")) {
                  resolvedName = found.name;
                }
              }
              if (!resolvedName && rawPhone) resolvedName = `+${rawPhone}`;
              return resolvedName ? (
                <div className={cn(
                  "text-[10px] font-semibold mb-0.5 opacity-80",
                  "text-primary-foreground/70"
                )}>
                  {resolvedName}
                </div>
              ) : null;
            })()}
            {msg.quoted && msg.quoted.text && (
              <div
                onClick={() => scrollToMessage(msg.quoted?.message_id || msg.quoted?.stanza_id)}
                className={cn(
                  "rounded-xl px-3 py-2 mb-2 border-r-4 text-[12px] leading-relaxed cursor-pointer hover:opacity-80 transition-opacity",
                  msg.sender === "customer"
                    ? "bg-white/15 border-white/50"
                    : "bg-secondary/80 border-primary/40"
                )}>
                {msg.quoted.sender_name && (
                  <p className={cn(
                    "text-[11px] font-bold mb-0.5",
                    msg.sender === "customer" ? "text-white/90" : "text-primary"
                  )}>
                    {msg.quoted.sender_name}
                  </p>
                )}
                <p className={cn(
                  "line-clamp-2",
                  msg.sender === "customer" ? "text-white/70" : "text-muted-foreground"
                )}>
                  {msg.quoted.text}
                </p>
              </div>
            )}
            {msg.type === "template" && (
              <div className="flex items-center gap-1 mb-1 text-primary">
                <FileText className="w-3 h-3" />
                <span className="text-[10px] font-semibold">قالب</span>
              </div>
            )}
            {msg.type === "note" && (
              <div className="flex items-center gap-1 mb-1 text-amber-500">
                <StickyNote className="w-3 h-3" />
                <span className="text-[10px] font-semibold">ملاحظة داخلية</span>
              </div>
            )}
            {/* Location message */}
            {msg.type === "location" && msg.location && (
              <a
                href={`https://www.google.com/maps?q=${msg.location.latitude},${msg.location.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="block mb-1 rounded-lg overflow-hidden border border-border/50 hover:opacity-90 transition-opacity"
              >
                <img
                  src={`https://maps.googleapis.com/maps/api/staticmap?center=${msg.location.latitude},${msg.location.longitude}&zoom=15&size=280x150&markers=color:red|${msg.location.latitude},${msg.location.longitude}&key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8`}
                  alt="موقع"
                  className="w-[280px] h-[150px] object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://staticmap.openstreetmap.de/staticmap.php?center=${msg.location!.latitude},${msg.location!.longitude}&zoom=15&size=280x150&markers=${msg.location!.latitude},${msg.location!.longitude},red-pushpin`;
                  }}
                />
                <div className="px-2.5 py-1.5 flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-destructive shrink-0" />
                  <div>
                    {msg.location.name && <p className="text-[11px] font-semibold">{msg.location.name}</p>}
                    {msg.location.address && <p className="text-[10px] text-muted-foreground">{msg.location.address}</p>}
                    {!msg.location.name && !msg.location.address && <p className="text-[10px]">📍 عرض الموقع</p>}
                  </div>
                </div>
              </a>
            )}
            {/* Contacts message */}
            {msg.type === "contacts" && msg.contacts && msg.contacts.length > 0 && (
              <div className="space-y-1.5 mb-1">
                {msg.contacts.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 bg-background/30 rounded-lg px-2.5 py-1.5">
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
            )}
            {/* Poll message */}
            {msg.type === "poll" && msg.poll && (
              <div className="mb-1 space-y-1.5">
                <p className="text-xs font-bold flex items-center gap-1">📊 {msg.poll.question}</p>
                {msg.poll.options.map((opt) => {
                  const votes = msg.poll.votes?.[opt.id]?.length || 0;
                  return (
                    <div key={opt.id} className="flex items-center gap-2 bg-background/30 rounded-lg px-2.5 py-1.5">
                      <span className="text-xs flex-1">{opt.title}</span>
                      {votes > 0 && <Badge variant="secondary" className="text-[9px] px-1.5">{votes}</Badge>}
                    </div>
                  );
                })}
              </div>
            )}
            {/* Regular content rendering */}
            {msg.type !== "location" && msg.type !== "contacts" && msg.type !== "sticker" && msg.type !== "poll" && (() => {
              const textMediaUrl = getStorageUrlFromText(msg.text);
              const mediaUrl = msg.mediaUrl || textMediaUrl;
              let textWithoutUrl = textMediaUrl ? msg.text.replace(`\n${textMediaUrl}`, "").trim() : msg.text;
              // Hide placeholder content like [audio], [image], [video], [document]
              const isPlaceholder = /^\[(audio|image|video|document|sticker)\]$/i.test(textWithoutUrl);
              if (isPlaceholder) textWithoutUrl = "";
              return (
                <>
                  {mediaUrl && <ResolvedMedia url={mediaUrl} type={msg.type} isAgent={msg.sender === "agent"} onImageClick={onImageClick} />}
                  {!mediaUrl && msg.type === "audio" && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                      <Mic className="w-3.5 h-3.5" />
                      <span>رسالة صوتية</span>
                    </div>
                  )}
                  {(!mediaUrl || (msg.type !== "audio" && msg.type !== "video" && msg.type !== "document" && !isImageUrl(mediaUrl) && !mediaUrl.startsWith("storage:")) || textWithoutUrl) && textWithoutUrl && (
                    <p className="whitespace-pre-wrap leading-[1.65]">
                      {textWithoutUrl.split(/(@\+?[\u0600-\u06FF\w\d]+)/g).map((part, i) => {
                        if (!part.startsWith("@")) return <span key={i}>{part}</span>;
                        // Strip @ and optional + to get the raw value
                        const mentionRaw = part.slice(1).replace(/^\+/, "");
                        const isPhone = /^\d{6,}$/.test(mentionRaw);
                        let displayLabel = part;
                        if (isPhone) {
                          // Try to resolve from group participants
                          if (conversation.conversationType === "group" && groupParticipants?.length) {
                            const participant = groupParticipants.find(p => p.phone === mentionRaw || p.rawDigits === mentionRaw);
                            if (participant?.name && participant.name !== participant.phone && participant.name !== participant.rawDigits) {
                              displayLabel = `@${participant.name}`;
                            } else {
                              // Show as formatted phone
                              displayLabel = `@+${mentionRaw}`;
                            }
                          } else {
                            displayLabel = `@+${mentionRaw}`;
                          }
                        }
                        return (
                          <span key={i} className={cn(
                            "font-semibold px-1 rounded",
                            msg.sender === "customer"
                              ? "bg-white/20 text-white underline underline-offset-2"
                              : "bg-primary/10 text-primary"
                          )}>{displayLabel}</span>
                        );
                      })}
                    </p>
                  )}
                </>
              );
            })()}
            {/* Inline auto-translation */}
            {translationText && msg.sender === "customer" && (
              <div className="mt-1 pt-1 border-t border-border/30">
                <p className="text-[11px] text-primary/80 whitespace-pre-wrap leading-relaxed">
                  <Languages className="w-3 h-3 inline-block ml-1 opacity-60" />
                  {translationText}
                </p>
              </div>
            )}
            {/* Timestamp + status */}
            <div className={cn("flex items-center gap-1.5 mt-2", msg.type === "note" ? "text-amber-500/50" : msg.sender === "agent" ? "text-muted-foreground/50" : "text-white/45")}>
              <span className="text-[10px] font-medium tracking-tight">{msg.timestamp}</span>
              {msg.editedAt && <span className="text-[9px] italic mx-0.5">معدّلة</span>}
              {msg.sender === "agent" && msg.type !== "note" && <MessageStatus status={msg.status} isGroup={conversation.conversationType === "group"} readBy={msg.readBy} groupSize={msg.groupSize} />}
            </div>
          </>
        )}
      </div>
      {/* Reactions badge - WhatsApp style floating below bubble */}
      {msg.reactions && msg.reactions.length > 0 && (() => {
        // Group reactions by emoji with count
        const grouped = msg.reactions.reduce((acc, r) => {
          if (!acc[r.emoji]) acc[r.emoji] = [];
          acc[r.emoji].push(r);
          return acc;
        }, {} as Record<string, typeof msg.reactions>);
        return (
          <div className={cn("flex -mt-2 mb-1", msg.sender === "agent" ? "justify-end mr-2" : "justify-start ml-2")}>
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

const ChatArea = ({ conversation, messages, templates, onBack, onSendMessage, onSendTemplate, onStatusChange, onTransfer, onTagsChange, onEditMessage, onDeleteMessage, onShowCustomerInfo, scrollToMessageId, onScrollToMessageDone, onStarMessage, onForwardMessage, onConversationMerged, onDeleteConversation }: ChatAreaProps) => {
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
  const [imagePreview, setImagePreview] = useState<{ file: File; url: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [editText, setEditText] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTagText, setNewTagText] = useState("");
  const [allOrgTags, setAllOrgTags] = useState<string[]>([]);
  const [savedReplies, setSavedReplies] = useState<Array<{ id: string; shortcut: string; title: string; content: string; category: string }>>([]);
  const [showSavedReplies, setShowSavedReplies] = useState(false);
  const [savedReplyFilter, setSavedReplyFilter] = useState("");
  const [windowInfo, setWindowInfo] = useState(() => getWindowRemaining(conversation.lastCustomerMessageAt));
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [groupParticipants, setGroupParticipants] = useState<Array<{ id: string; name: string; phone: string; rawDigits: string; admin?: boolean; isSaved?: boolean }>>([]);
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const groupPicInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isGroup = conversation.conversationType === "group";
  const isEvolutionChannel = conversation.channelType === "evolution";
  const isMetaChannel = conversation.channelType === "meta_api";

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
  }, [conversation.id, conversation.isBlocked, conversation.profilePic]);

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

  const handleLeaveGroup = async () => {
    if (!confirm("هل أنت متأكد من الخروج من هذا القروب؟")) return;
    try {
      const { error } = await invokeCloud("evolution-manage", {
        body: { action: "leave_group", group_jid: conversation.customerPhone, channel_id: conversation.channelId },
      });
      if (error) throw error;
      toast.success("✅ تم الخروج من القروب");
    } catch (err: any) {
      toast.error("فشل الخروج: " + (err.message || ""));
    }
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

  const handleRemoveMember = async (phone: string) => {
    if (!confirm(`هل تريد إزالة ${phone} من القروب؟`)) return;
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
        if (error) return;
        const info = data?.data?.data || data?.data || {};
        setGroupPicture(info?.pictureUrl || info?.picture || info?.profilePictureUrl || conversation.profilePic || null);
        const participants = info?.participants || [];
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

  // 24h window countdown - update every minute
  useEffect(() => {
    setWindowInfo(getWindowRemaining(conversation.lastCustomerMessageAt));
    const interval = setInterval(() => {
      setWindowInfo(getWindowRemaining(conversation.lastCustomerMessageAt));
    }, 60000);
    return () => clearInterval(interval);
  }, [conversation.lastCustomerMessageAt]);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    loadOrgTags();
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
    if (windowExpired) {
      toast.error("انتهت نافذة الـ 24 ساعة - يرجى إرسال قالب معتمد أولاً");
      setShowTemplates(true);
      return;
    }
    const replyData = replyTo ? { id: replyTo.id, waMessageId: replyTo.waMessageId, senderName: replyTo.sender === "agent" ? "أنت" : (replyTo.senderName || conversation.customerName), text: replyTo.text } : undefined;
    onSendMessage(conversation.id, inputText.trim(), "text", replyData);
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
    if (confirm("هل تريد حذف هذه الرسالة للجميع؟")) {
      onDeleteMessage(msg.id, msg.waMessageId, conversation.customerPhone);
    }
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
    // Replace customer name placeholder
    const text = reply.content.replace(/\{name\}/gi, conversation.customerName || "");
    setInputText(text);
    setShowSavedReplies(false);
    inputRef.current?.focus();
  };

  const filteredSavedReplies = savedReplies.filter((r) =>
    !savedReplyFilter || r.shortcut.toLowerCase().includes(savedReplyFilter) || r.title.toLowerCase().includes(savedReplyFilter)
  );

  const insertMention = (displayName: string, phone?: string) => {
    const lastAtIndex = inputText.lastIndexOf("@");
    // For group participants, use @phone format so Evolution API can resolve mentions
    const mentionText = isGroupMentionMode && phone ? `@${phone}` : `@${displayName}`;
    const newText = inputText.slice(0, lastAtIndex) + `${mentionText} `;
    setInputText(newText);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const handleQuickReply = (text: string) => {
    if (windowExpired) {
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
          timestamp: new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }),
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
          file_name: `${Date.now()}.webm`,
          content_type: blob.type || "audio/webm",
          base64,
        },
      });
      if (uploadError) throw uploadError;
      if (!uploadData?.storage_path) throw new Error("تعذر حفظ التسجيل");

      const storagePath = uploadData.storage_path as string;
      const isEvolution = conversation.channelType === "evolution" || !conversation.channelType;
      const sendFn = isEvolution ? "evolution-send" : "whatsapp-send";

      const { data, error } = await invokeCloud(sendFn, {
        body: {
          to: conversation.customerPhone,
          message: "",
          conversation_id: conversation.id,
          media_url: storagePath,
          media_type: "audio",
        },
      });
      if (error || data?.error) {
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
      const isEvolution = conversation.channelType === "evolution" || !conversation.channelType;

      if (isEvolution) {
        // Send via evolution-send with media support
        const { data, error } = await invokeCloud("evolution-send", {
          body: {
            to: conversation.customerPhone,
            message: caption || "",
            conversation_id: conversation.id,
            media_url: storagePath,
            media_type: mediaType,
          },
        });
        if (error || data?.error) {
          throw new Error(data?.error || "فشل إرسال الوسائط");
        }
      } else {
        // Send via Meta API with media upload
        const { data, error } = await invokeCloud("whatsapp-send", {
          body: {
            to: conversation.customerPhone,
            type: "media",
            media_url: storagePath,
            media_type: mediaType,
            caption: caption || "",
            conversation_id: conversation.id,
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
    <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden bg-background">
      {/* Header */}
      <div className="shrink-0 bg-card/90 backdrop-blur-xl" style={{ boxShadow: 'var(--shadow-xs)' }}>
        <div className="h-[56px] md:h-[60px] flex items-center justify-between px-4 md:px-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <button className="w-8 h-8 md:w-9 md:h-9 rounded-full hover:bg-muted transition-all flex items-center justify-center shrink-0" onClick={onBack}>
              <ArrowRight className="w-4.5 h-4.5 text-foreground" />
            </button>
            <button
              className="flex items-center gap-2.5 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => onShowCustomerInfo?.()}
            >
            <div className="relative shrink-0">
              {groupPicture ? (
                <img src={groupPicture} alt={conversation.customerName} className="w-10 h-10 rounded-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }} />
              ) : null}
              <div className={cn("w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground", groupPicture ? "hidden" : "")}>
                {conversation.customerName.charAt(0)}
              </div>
              {conversation.lastSeen === "متصل الآن" && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-card" />
              )}
            </div>
            <div className="min-w-0 overflow-hidden">
              <div className="flex items-center gap-1.5">
                <p className="font-medium text-[15px] truncate max-w-[120px] md:max-w-[250px] tracking-tight">{conversation.customerName}</p>
                {isMetaChannel ? (
                  <span className="inline-flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 font-medium shrink-0">
                    <ShieldCheck className="w-2.5 h-2.5" />
                    رسمي
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground font-medium shrink-0">
                    <Wifi className="w-2.5 h-2.5" />
                    غير رسمي
                  </span>
                )}
                {isBlocked && (
                  <span className="inline-flex items-center gap-0.5 text-[8px] px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive font-medium shrink-0">
                    <Ban className="w-2.5 h-2.5" />
                    محظور
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/50 truncate mt-0.5 font-light">{conversation.lastSeen || conversation.customerPhone}</p>
            </div>
            </button>
          </div>
          <div className="flex items-center gap-1">
            {/* 24h Window Timer - Meta API only */}
            {/* Mobile quick actions */}
            <div className="flex md:hidden items-center gap-0.5">
              {onShowCustomerInfo && (
                <button
                  onClick={onShowCustomerInfo}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary active:bg-primary/10 transition-colors"
                  title="معلومات العميل"
                >
                  <Contact className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
              {conversation.status !== "closed" && (
                <>
                  <button
                    onClick={() => setShowTransfer(true)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary active:bg-secondary/80 transition-colors"
                    title="تحويل"
                  >
                    <UserPlus className="w-4 h-4 text-primary" />
                  </button>
                  <button
                    onClick={() => setShowClosureReason(true)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary active:bg-destructive/10 transition-colors"
                    title="إغلاق"
                  >
                    <XCircle className="w-4 h-4 text-destructive" />
                  </button>
                </>
              )}
            </div>
            {conversation.status === "closed" && (
              <button
                onClick={() => { onStatusChange(conversation.id, "active"); toast.success("تم إعادة فتح المحادثة"); }}
                className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary active:bg-success/10 transition-colors"
                title="إعادة فتح"
              >
                <CheckCircle2 className="w-4 h-4 text-success" />
              </button>
            )}
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
            <button onClick={() => setShowMessageSearch(!showMessageSearch)} className={cn("p-2 rounded-lg hover:bg-secondary transition-colors", showMessageSearch ? "bg-primary/10 text-primary" : "")} title="بحث في الرسائل">
              <SearchIcon className="w-4 h-4 text-muted-foreground" />
            </button>
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
                <DropdownMenuItem onClick={() => setShowTransfer(true)} className="md:hidden">
                  <UserPlus className="w-4 h-4 ml-2 text-primary" /> تحويل لموظف آخر
                </DropdownMenuItem>
                {(userRole === "admin" || isSuperAdmin) && (
                <DropdownMenuItem
                  onClick={() => {
                    const confirm = window.confirm("هل أنت متأكد من حذف هذه المحادثة وجميع رسائلها؟ هذا الإجراء لا يمكن التراجع عنه.");
                    if (confirm) onDeleteConversation?.(conversation.id);
                  }}
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

        {/* Tags row */}
        {(conversation.tags.length > 0 || true) && (
        <div className="flex items-center gap-1.5 px-4 pb-2.5 overflow-x-auto scrollbar-none">
          {conversation.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px] px-2 py-0.5 gap-0.5 shrink-0 group h-5 rounded-full font-normal border-0">
              {tag}
              <button onClick={() => removeTag(tag)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="w-2 h-2" />
              </button>
            </Badge>
          ))}
          {showTagInput ? (
            <div className="relative flex items-center gap-1 shrink-0">
              <input
                ref={tagInputRef}
                value={newTagText}
                onChange={(e) => setNewTagText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addTag(); if (e.key === "Escape") { setShowTagInput(false); setNewTagText(""); } }}
                placeholder="وسم جديد..."
                className="w-24 text-[10px] bg-secondary rounded-md px-2 py-0.5 outline-none border-0"
                autoFocus
              />
              <button onClick={addTag} className="text-primary"><Check className="w-3 h-3" /></button>
              <button onClick={() => { setShowTagInput(false); setNewTagText(""); }} className="text-muted-foreground"><X className="w-3 h-3" /></button>
              {(() => {
                const suggestions = allOrgTags.filter(
                  (t) => !conversation.tags.includes(t) && (newTagText === "" || t.includes(newTagText))
                );
                if (suggestions.length === 0) return null;
                return (
                  <div className="absolute top-full right-0 mt-1 z-50 bg-card border border-border rounded-lg shadow-lg max-h-32 overflow-y-auto min-w-[120px]">
                    {suggestions.slice(0, 8).map((tag) => (
                      <button
                        key={tag}
                        onClick={() => {
                          if (onTagsChange) {
                            onTagsChange(conversation.id, [...conversation.tags, tag]);
                            toast.success("تم إضافة الوسم");
                          }
                          setNewTagText("");
                          setShowTagInput(false);
                        }}
                        className="w-full text-right px-3 py-1.5 text-[10px] hover:bg-secondary transition-colors truncate"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : (
            <button onClick={() => setShowTagInput(true)} className="shrink-0 flex items-center gap-0.5 text-[9px] text-muted-foreground/50 hover:text-primary transition-colors px-1 py-0.5 rounded">
              <Plus className="w-2.5 h-2.5" /> وسم
            </button>
          )}
        </div>
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
      {isNoteMode && conversation.status !== "closed" && (
        <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-600 font-medium flex-1">وضع الملاحظات الداخلية - الرسالة لن تُرسل للعميل</p>
          <Button size="sm" variant="ghost" className="text-xs h-7 text-amber-600" onClick={() => setIsNoteMode(false)}>
            إلغاء
          </Button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-1 md:space-y-1.5 bg-background">
        {messages.map((msg, msgIdx) => {
          // In groups, distinguish senders by their JID/phone, not just "customer"
          const isGroup = conversation.conversationType === "group";
          const getMsgSenderKey = (m: Message) => {
            if (m.sender !== "customer" || !isGroup) return m.sender;
            return m.senderPhone || m.senderJid || m.senderName || m.sender;
          };
          const senderKey = getMsgSenderKey(msg);
          const nextMsg = messages[msgIdx + 1];
          const showAvatar = !nextMsg || getMsgSenderKey(nextMsg) !== senderKey || nextMsg.sender === "system";
          const prevMsg = messages[msgIdx - 1];
          const isFirstInGroup = !prevMsg || getMsgSenderKey(prevMsg) !== senderKey || prevMsg.sender === "system";
          return (
          <div key={msg.id} id={`msg-${msg.id}`} className={cn(
            "flex",
            msg.sender === "agent" ? "justify-start" : msg.sender === "system" ? "justify-center" : "justify-end",
            !isFirstInGroup && "mt-0.5"
          )}>
            {msg.sender === "system" ? (
              <div className="bg-secondary/80 text-muted-foreground text-[11px] px-4 py-1.5 rounded-full font-medium shadow-sm backdrop-blur-sm">
                {msg.text}
              </div>
            ) : (
              <div className={cn("flex items-end gap-2", msg.sender === "agent" ? "flex-row" : "flex-row-reverse")}>
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
                          const hash = (rawPhone || displayName).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
                          const hue = hash % 360;
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
                                window.location.href = `/inbox?conversation=${conv.id}`;
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
                              window.location.href = `/inbox?conversation=${phoneConv.id}`;
                            } else {
                              toast.info(`لا توجد محادثة خاصة مع ${displayName} (${rawPhone})`);
                            }
                          };
                          return (
                            <div
                              onClick={handleAvatarClick}
                              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white cursor-pointer hover:opacity-80 transition-opacity"
                              style={{ backgroundColor: `hsl(${hue}, 50%, 45%)` }}
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
                <div className="flex flex-col">
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
                  />
                  {/* Agent name label below bubble */}
                  {msg.sender === "agent" && msg.senderName && showAvatar && conversation.conversationType !== "group" && (
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
          <div className="flex justify-start">
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
          <div className="flex justify-end">
            <div className="bg-primary/10 text-primary text-[11px] px-3 py-1.5 rounded-xl rounded-br-sm flex items-center gap-1.5">
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
          <div className="flex flex-col gap-1 max-h-[180px] overflow-y-auto">
            {filteredMentionAgents.map((a: any) => {
              const displayName = a.full_name || a.name || a.phone || "";
              const isPhoneOnly = !a.full_name && (!a.name || a.name === a.phone);
              const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2);
              return (
                <button key={a.id} onClick={() => insertMention(displayName, a.phone)} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-secondary hover:bg-accent transition-colors text-right">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">{initials}</div>
                  <div className="flex flex-col items-start min-w-0">
                    <span className="font-medium truncate flex items-center gap-1">{displayName}{isGroupMentionMode && a.admin && <Crown className="w-3 h-3 shrink-0 text-primary" />}</span>
                    {isGroupMentionMode && a.phone && (
                      <span className="text-[10px] text-muted-foreground" dir="ltr">+{a.phone}</span>
                    )}
                  </div>
                  {!isPhoneOnly && isGroupMentionMode && (
                    <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 mr-auto shrink-0">جهة اتصال</Badge>
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
      {!isRecording && conversation.status !== "closed" && (
        <div className={cn("shrink-0 bg-card/90 backdrop-blur-xl p-3 md:p-4", isNoteMode ? "border-t border-amber-500/20" : isBlocked ? "opacity-60" : "")} style={{ boxShadow: '0 -1px 2px rgba(0,0,0,0.03)' }}>
          {/* Reply Preview Bar */}
          {replyTo && (
            <div className="flex items-center gap-2 mb-2 bg-secondary/60 rounded-lg p-2.5 border-r-4 border-primary animate-fade-in">
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
          {/* Tool buttons row */}
          <div className="flex items-center gap-px md:gap-0.5 mb-1.5 md:mb-2 overflow-x-auto pb-0.5 scrollbar-hide">
            {(!windowExpired || isNoteMode) && (
              <>
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
                {!isNoteMode && (
                  <button className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0" onClick={() => fileInputRef.current?.click()}>
                    <Paperclip className="w-4 h-4" />
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={allowedFileTypes}
                  className="hidden"
                  onChange={handleFileSelect}
                />
                {/* Hidden input for group picture change */}
                <input
                  ref={groupPicInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleChangeGroupPicture(file);
                    if (e.target) e.target.value = "";
                  }}
                />
                {!isNoteMode && (
                  <button onClick={() => setShowQuickReplies(!showQuickReplies)} className={cn("p-1.5 rounded-lg transition-colors shrink-0", showQuickReplies ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground")}>
                    <Zap className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
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
                // In private chats, auto-switch to note mode. In groups, keep current mode
                if (!isGroup && !isNoteMode) setIsNoteMode(true);
                inputRef.current?.focus();
              }}
              className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0"
              title={isGroup && !isNoteMode ? "اذكر عضو @" : "اذكر موظف @"}
            >
              <AtSign className="w-4 h-4" />
            </button>
            {!isNoteMode && isMetaChannel && (
              <button onClick={() => setShowTemplates(true)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0" title="إرسال قالب">
                <FileText className="w-4 h-4" />
              </button>
            )}
            {/* Send Product from Catalog — Meta */}
            {!isNoteMode && !windowExpired && isMetaChannel && hasProducts && (
              <button
                onClick={() => setShowProductPicker(true)}
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0"
                title="إرسال منتج من الكتالوج"
              >
                <ShoppingBag className="w-4 h-4" />
              </button>
            )}
            {/* Send Product — Evolution (internal products) */}
            {!isNoteMode && !isMetaChannel && hasProducts && (
              <button
                onClick={() => setShowInternalProductPicker(true)}
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0"
                title="إرسال منتج"
              >
                <ShoppingBag className="w-4 h-4" />
              </button>
            )}
            {/* Send Poll — Evolution only */}
            {!isNoteMode && isEvolutionChannel && (
              <button onClick={() => setShowPollCreator(true)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0" title="إرسال استطلاع">
                <BarChart3 className="w-4 h-4" />
              </button>
            )}
            {/* Send Contact Card */}
            {!isNoteMode && (
              <button onClick={() => setShowContactCard(true)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0" title="إرسال بطاقة اتصال">
                <Contact className="w-4 h-4" />
              </button>
            )}
            {/* AI Suggest Replies */}
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
                    if (data?.suggestions?.length > 0) {
                      setAiSuggestions(data.suggestions);
                    } else if (data?.error === "ai_not_configured") {
                      toast.error("لم يتم إعداد مزود AI — اذهب للإعدادات");
                    }
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
            {/* AI Summarize */}
            {hasAiConfig && (
            <button
              onClick={async () => {
                setAiLoading(true);
                try {
                  const { data } = await invokeCloud("ai-features", {
                    body: { action: "summarize", conversation_id: conversation.id },
                  });
                  if (data?.summary) {
                    setAiSummary(data.summary);
                    setShowSummary(true);
                  } else if (data?.error === "ai_not_configured") {
                    toast.error("لم يتم إعداد مزود AI — فعّل ميزة التلخيص من الإعدادات");
                  }
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
            {/* Auto-Translate Toggle */}
            {hasAiConfig && (
              <button
                onClick={() => setAutoTranslate(!autoTranslate)}
                className={cn("p-1.5 rounded-lg transition-colors shrink-0", autoTranslate ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground")}
                title={autoTranslate ? "إيقاف الترجمة التلقائية" : "تفعيل الترجمة التلقائية"}
              >
                <Languages className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* AI Suggestions Row */}
          {aiSuggestions.length > 0 && (
            <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1">
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
            <div className="relative mb-2 inline-block">
              {imagePreview.file.type.startsWith("image/") ? (
                <img src={imagePreview.url} alt="معاينة" className="max-h-32 rounded-lg border border-border object-cover" />
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
              <button
                onClick={cancelImagePreview}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Input + send row */}
          <div className="flex items-center gap-2">
            {windowExpired && !isNoteMode ? (
              <button onClick={() => setShowTemplates(true)} className="flex-1 text-right text-sm text-muted-foreground bg-secondary rounded-lg px-4 py-2.5 hover:bg-accent transition-colors">
                اختر قالباً لإرسال رسالة...
              </button>
            ) : (
              <Input
                ref={inputRef}
                placeholder={imagePreview ? "أضف تعليقاً (اختياري)..." : isNoteMode ? "ملاحظة داخلية... @ لذكر موظف" : "اكتب رسالة..."}
                value={inputText}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (imagePreview ? handleSendImage() : handleSend())}
                className={cn("flex-1 border-0 rounded-full h-11 md:h-12 text-sm px-5", isNoteMode ? "bg-amber-500/5 ring-1 ring-amber-500/15" : "bg-muted/60 focus:bg-muted focus:ring-1 focus:ring-border transition-all")}
              />
            )}
            {(isNoteMode || !windowExpired) && (
              imagePreview ? (
                <button onClick={handleSendImage} disabled={isUploading} className="w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center shrink-0 bg-primary hover:bg-primary/90 transition-all">
                  {isUploading ? <Loader2 className="w-4 h-4 text-primary-foreground animate-spin" /> : <Send className="w-4 h-4 text-primary-foreground" style={{ transform: "scaleX(-1)" }} />}
                </button>
              ) : inputText.trim() ? (
                <div className="flex items-center gap-1">
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
                    <button className="w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center shrink-0 bg-muted hover:bg-muted/80 transition-all" title="جدولة الإرسال">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </ScheduleMessagePopover>
                  <button onClick={handleSend} className={cn("w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center shrink-0 transition-all", isNoteMode ? "bg-amber-500 hover:bg-amber-600" : "bg-primary hover:bg-primary/90")}>
                    <Send className="w-4 h-4 text-primary-foreground" style={{ transform: "scaleX(-1)" }} />
                  </button>
                </div>
              ) : !isNoteMode ? (
                <button onClick={() => setIsRecording(true)} className="w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center shrink-0 bg-primary hover:bg-primary/90 transition-all">
                  <Mic className="w-4 h-4 text-primary-foreground" />
                </button>
              ) : (
                <button disabled className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-muted">
                  <Send className="w-4 h-4 text-whatsapp-foreground" style={{ transform: "scaleX(-1)" }} />
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
            <p className="text-[10px] text-muted-foreground">يمكن تعديل الرسالة خلال 15 دقيقة من الإرسال فقط</p>
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

          if (sendMode === "image" && product.image_url) {
            await invokeCloud("evolution-send", {
              body: {
                to: conversation.customerPhone,
                conversation_id: conversation.id,
                message: caption,
                media_url: product.image_url,
                media_type: "image",
                channel_id: conversation.channelId,
              },
            });
          } else {
            await invokeCloud("evolution-send", {
              body: {
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
            <div className="max-h-60 overflow-y-auto space-y-1">
              <p className="text-xs text-muted-foreground font-medium mb-2">الأعضاء الحاليون ({groupParticipants.length})</p>
              {groupParticipants.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-secondary/50 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {(p.name || p.phone).slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground" dir="ltr">+{p.phone}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:text-destructive" onClick={() => handleRemoveMember(p.phone)}>
                    <UserMinus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
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
    </div>
  );
};

export default ChatArea;