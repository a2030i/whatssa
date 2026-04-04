import { useState, useRef, useEffect, useCallback } from "react";
import { Send, MoreVertical, ArrowRight, Smile, Paperclip, Zap, Check, CheckCheck, StickyNote, UserPlus, XCircle, CheckCircle2, FileText, AlertTriangle, Clock, AtSign, Mic, Loader2, X, Play, Image as ImageIcon, Video, Reply, Plus, Timer, ShieldCheck, Wifi, MapPin, Contact, Phone as PhoneIcon, Pencil, Trash2, Brain, Languages, Sparkles, Search as SearchIcon, Square, ShoppingBag, Ban, ShieldOff, LogOut, UserMinus } from "lucide-react";
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

const getStorageUrlFromText = (text: string) => {
  const match = text.match(/\n(https:\/\/[^\s]+|storage:chat-media\/[^\s]+)/i);
  return match?.[1];
};

/** Resolve a media URL: if it's a storage path, create a signed URL; otherwise return as-is */
const resolveMediaUrl = async (url: string | null | undefined): Promise<string | null> => {
  if (!url) return null;
  // Blob URLs (optimistic) – pass through directly
  if (url.startsWith("blob:")) return url;
  if (url.startsWith("storage:chat-media/")) {
    const path = url.replace("storage:chat-media/", "");
    try {
      // Files are stored in the external Supabase storage, use the main client
      const { data, error } = await supabase.storage.from("chat-media").createSignedUrl(path, 3600);
      if (error) {
        console.error("[resolveMediaUrl] Signed URL error:", error.message, "path:", path);
        const { data: publicData } = supabase.storage.from("chat-media").getPublicUrl(path);
        return publicData?.publicUrl || null;
      }
      return data?.signedUrl || null;
    } catch (e) {
      console.error("[resolveMediaUrl] Exception:", e, "path:", path);
      return null;
    }
  }
  return url;
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
    return <img src={resolvedUrl} alt="صورة مرفقة" className="rounded-lg max-w-[240px] max-h-[200px] object-cover mb-1 cursor-pointer active:scale-95 transition-transform" onClick={() => onImageClick?.(resolvedUrl)} />;
  }
  if (type === "audio") {
    return <AudioPlayer src={resolvedUrl} isAgent={isAgent} className="mb-1" />;
  }
  if (type === "video") {
    return (
      <div className="mb-1 min-w-[220px] rounded-lg bg-background/40 p-2">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium"><Video className="h-3.5 w-3.5" /><span>مقطع فيديو</span></div>
        <video controls preload="metadata" className="max-h-[240px] w-full rounded-md"><source src={resolvedUrl} />متصفحك لا يدعم تشغيل الفيديو.</video>
      </div>
    );
  }
  if (type === "document") {
    return (
      <a href={resolvedUrl} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 rounded-lg bg-background/40 p-2 text-xs font-medium hover:bg-background/60">
        <FileText className="h-4 w-4" /><span>فتح الملف المرفق</span>
      </a>
    );
  }
  return null;
};

const SwipeableMessageBubble = ({ msg, conversation, onReply, onEdit, onDelete, onImageClick, hasAiConfig, groupParticipants }: { msg: Message; conversation: Conversation; onReply: (msg: Message) => void; onEdit?: (msg: Message) => void; onDelete?: (msg: Message) => void; onImageClick?: (src: string) => void; hasAiConfig?: boolean; groupParticipants?: Array<{ id: string; name: string; phone: string }> }) => {
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
  const canDelete = msg.sender === "agent" && msg.waMessageId && !msg.isDeleted;

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);

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
      className="group relative max-w-[85%] md:max-w-[65%]"
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
        "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
        msg.sender === "agent" && !msg.isDeleted && msg.type !== "note" && "pb-3",
        msg.isDeleted
          ? "bg-muted/50 border border-border/30 text-muted-foreground italic"
          : msg.type === "note"
            ? "bg-amber-500/10 border border-amber-500/20 text-foreground rounded-bl-sm"
            : msg.sender === "agent"
              ? "bg-card border border-border/10 shadow-[0_1px_4px_rgba(0,0,0,0.06)] text-foreground rounded-bl-sm"
              : "bg-gradient-to-br from-primary/90 to-primary text-primary-foreground rounded-br-sm shadow-[0_2px_8px_rgba(0,0,0,0.1)]"
      )}>
        {msg.isDeleted ? (
          <div className="flex items-center gap-1.5 text-xs">
            <XCircle className="w-3.5 h-3.5" />
            <span>تم حذف هذه الرسالة</span>
          </div>
        ) : (
          <>
            {msg.senderName && conversation.conversationType === "group" && (
              <div className={cn(
                "text-[11px] font-bold mb-1",
                msg.sender === "agent" ? "text-primary" : ""
              )} style={msg.sender === "customer" ? { color: "#a8f0c8" } : undefined}>
                {msg.senderName}
              </div>
            )}
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
                      {textWithoutUrl.split(/(@[\u0600-\u06FF\w\d+]+)/g).map((part, i) => {
                        if (!part.startsWith("@")) return <span key={i}>{part}</span>;
                        // Try to resolve phone-based mentions to display names
                        const mentionValue = part.slice(1);
                        const isPhone = /^\d+$/.test(mentionValue);
                        let displayLabel = part;
                        if (isPhone && conversation.conversationType === "group" && groupParticipants?.length) {
                          const participant = groupParticipants.find(p => p.phone === mentionValue);
                          if (participant && participant.name !== participant.phone) {
                            displayLabel = `@${participant.name}`;
                          }
                        }
                        return (
                          <span key={i} className="bg-primary/10 text-primary font-semibold px-0.5 rounded">{displayLabel}</span>
                        );
                      })}
                    </p>
                  )}
                </>
              );
            })()}
            {/* Timestamp + status */}
            <div className={cn("flex items-center gap-1 mt-1.5", msg.type === "note" ? "text-amber-500/60" : msg.sender === "agent" ? "text-muted-foreground/70" : "text-white/55")}>
              <span className="text-[10px] font-medium">{msg.timestamp}</span>
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

const ChatArea = ({ conversation, messages, templates, onBack, onSendMessage, onSendTemplate, onStatusChange, onTransfer, onTagsChange, onEditMessage, onDeleteMessage, onShowCustomerInfo }: ChatAreaProps) => {
  const { orgId, user, profile } = useAuth();
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
  const [groupParticipants, setGroupParticipants] = useState<Array<{ id: string; name: string; phone: string }>>([]);
  const [otherTypingAgents, setOtherTypingAgents] = useState<string[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [translatingMsgId, setTranslatingMsgId] = useState<string | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [hasAiConfig, setHasAiConfig] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showInternalProductPicker, setShowInternalProductPicker] = useState(false);
  const [isBlocked, setIsBlocked] = useState(conversation.isBlocked || false);
  const [showAddMembersDialog, setShowAddMembersDialog] = useState(false);
  const [reactionDetails, setReactionDetails] = useState<{ reactions: Array<{ emoji: string; fromMe: boolean; participant?: string; participantName?: string }>; messageId: string } | null>(null);
  const [addMemberPhone, setAddMemberPhone] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const groupPicInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync blocked state when conversation changes
  useEffect(() => {
    setIsBlocked(conversation.isBlocked || false);
  }, [conversation.id, conversation.isBlocked]);

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
      const participants = data?.data?.participants || data?.data?.data?.participants || [];
      setGroupParticipants(participants.map((p: any) => {
        const ph = (p.id || p.jid || "").replace(/@.*/, "");
        return { id: p.id || p.jid || ph, name: p.pushName || p.name || ph, phone: ph };
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
  const isGroup = conversation.conversationType === "group";
  const isEvolutionChannel = conversation.channelType === "evolution";
  useEffect(() => {
    if (!isGroup || !isEvolutionChannel || !conversation.customerPhone) return;
    const fetchGroupMembers = async () => {
      try {
        const { data, error } = await invokeCloud("evolution-manage", {
          body: { action: "group_info", group_jid: conversation.customerPhone, channel_id: conversation.channelId },
        });
        if (error) return;
        const participants = data?.data?.participants || data?.data?.data?.participants || [];
        const mapped = participants.map((p: any) => {
          const phone = (p.id || p.jid || "").replace(/@.*/, "");
          return { id: p.id || p.jid || phone, name: p.pushName || p.name || phone, phone };
        });

        // Enrich with saved customer names from DB
        if (mapped.length > 0 && orgId) {
          const phones = mapped.map((m: any) => m.phone).filter(Boolean);
          const { data: savedCustomers } = await supabase
            .from("customers")
            .select("phone, name")
            .eq("org_id", orgId)
            .in("phone", phones);

          if (savedCustomers && savedCustomers.length > 0) {
            const customerMap = new Map(savedCustomers.map(c => [c.phone, c.name]));
            mapped.forEach((p: any) => {
              const savedName = customerMap.get(p.phone);
              if (savedName && savedName !== p.phone) {
                p.name = savedName;
              }
            });
          }
        }

        setGroupParticipants(mapped);
      } catch (e) {
        console.error("Failed to fetch group participants:", e);
      }
    };
    fetchGroupMembers();
  }, [conversation.id, isGroup, isEvolutionChannel]);

  const isMetaChannel = conversation.channelType === "meta_api";
  const windowExpired = isMetaChannel ? windowInfo.expired : false;
  const approvedTemplates = templates.filter((template) => template.status === "approved");
  // In note mode: show team members. In group non-note mode: show group participants
  const isGroupMentionMode = isGroup && !isNoteMode;
  const filteredMentionAgents = isGroupMentionMode
    ? groupParticipants
        .filter((p) => (p.name || p.phone || "").toLowerCase().includes(mentionFilter.toLowerCase()))
        .sort((a, b) => {
          // Contacts with saved names first, then those with phone-only names
          const aHasName = a.name && a.name !== a.phone;
          const bHasName = b.name && b.name !== b.phone;
          if (aHasName && !bHasName) return -1;
          if (!aHasName && bHasName) return 1;
          return (a.name || a.phone).localeCompare(b.name || b.phone);
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
      onSendMessage(conversation.id, inputText.trim(), "note");
      setInputText("");
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
    setIsNoteMode(false);
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
      const ext = imagePreview.file.name.split(".").pop() || "bin";
      const mediaType = getFileMediaType(imagePreview.file);
      const path = `${conversation.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(path, imagePreview.file, { contentType: imagePreview.file.type });
      if (uploadError) throw uploadError;
      const storagePath = `storage:chat-media/${path}`;
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
    <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden">
      {/* Header - modern glass */}
      <div className="shrink-0 border-b border-border/30 bg-card/80 backdrop-blur-xl">
        <div className="h-14 md:h-[68px] flex items-center justify-between px-2.5 md:px-5">
          <div className="flex items-center gap-3">
            <button className="w-8 h-8 md:w-9 md:h-9 rounded-xl hover:bg-secondary/80 transition-all flex items-center justify-center shrink-0" onClick={onBack}>
              <ArrowRight className="w-5 h-5 text-foreground" />
            </button>
            <div className="relative">
              {conversation.profilePic ? (
                <img src={conversation.profilePic} alt={conversation.customerName} className="w-10 h-10 md:w-11 md:h-11 rounded-2xl object-cover shadow-sm" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }} />
              ) : null}
              <div className={cn("w-10 h-10 md:w-11 md:h-11 rounded-2xl bg-gradient-to-br from-primary/25 to-primary/10 flex items-center justify-center text-sm font-bold text-primary shadow-sm", conversation.profilePic ? "hidden" : "")}>
                {conversation.customerName.charAt(0)}
              </div>
              {conversation.lastSeen === "متصل الآن" && (
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-card shadow-sm" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-bold text-sm truncate">{conversation.customerName}</p>
                {isMetaChannel ? (
                  <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 font-semibold shrink-0">
                    <ShieldCheck className="w-2.5 h-2.5" />
                    رسمي
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground font-semibold shrink-0">
                    <Wifi className="w-2.5 h-2.5" />
                    غير رسمي
                  </span>
                )}
                {isBlocked && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive font-semibold shrink-0">
                    <Ban className="w-2.5 h-2.5" />
                    محظور
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">{conversation.lastSeen || conversation.customerPhone}</p>
            </div>
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
                <DropdownMenuSeparator />
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

        {/* Tags row - always visible */}
        <div className="flex items-center gap-1.5 px-3 pb-2 overflow-x-auto">
          {conversation.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px] px-2 py-0.5 gap-1 shrink-0 group">
              {tag}
              <button onClick={() => removeTag(tag)} className="opacity-0 group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                <X className="w-2.5 h-2.5" />
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
                className="w-24 text-[11px] bg-secondary rounded px-2 py-0.5 outline-none border-0"
                autoFocus
              />
              <button onClick={addTag} className="text-primary"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => { setShowTagInput(false); setNewTagText(""); }} className="text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
              {/* Tag suggestions dropdown */}
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
                        className="w-full text-right px-3 py-1.5 text-[11px] hover:bg-secondary transition-colors truncate"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          ) : (
            <button onClick={() => setShowTagInput(true)} className="shrink-0 flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-primary transition-colors px-1.5 py-0.5 rounded hover:bg-secondary">
              <Plus className="w-3 h-3" /> وسم
            </button>
          )}
        </div>
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
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 md:space-y-4 bg-gradient-to-b from-secondary/15 to-secondary/30">
        {messages.map((msg) => (
          <div key={msg.id} className={cn(
            "flex",
            msg.sender === "agent" ? "justify-start" : msg.sender === "system" ? "justify-center" : "justify-end"
          )}>
            {msg.sender === "system" ? (
              <div className="bg-muted/60 text-muted-foreground text-[11px] px-4 py-1.5 rounded-full font-medium shadow-sm">
                {msg.text}
              </div>
            ) : (
              <SwipeableMessageBubble
                msg={msg}
                conversation={conversation}
                onReply={handleReply}
                onEdit={onEditMessage ? handleStartEdit : undefined}
                onDelete={onDeleteMessage ? handleDeleteMsg : undefined}
                onImageClick={(src) => setLightboxSrc(src)}
                hasAiConfig={hasAiConfig}
                groupParticipants={isGroup ? groupParticipants : undefined}
              />
            )}
          </div>
        ))}
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
                    <span className="font-medium truncate">{displayName}</span>
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
        <div className={cn("shrink-0 border-t bg-card/80 backdrop-blur-sm p-2 md:p-3", isNoteMode ? "border-amber-500/30" : isBlocked ? "border-destructive/30 opacity-60" : "border-border/30")}>
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
            {!isNoteMode && (
              <button onClick={() => setShowTemplates(true)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0" title="إرسال قالب">
                <FileText className="w-4 h-4" />
              </button>
            )}
            {/* Send Product from Catalog — Meta */}
            {!isNoteMode && !windowExpired && isMetaChannel && (
              <button
                onClick={() => setShowProductPicker(true)}
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0"
                title="إرسال منتج من الكتالوج"
              >
                <ShoppingBag className="w-4 h-4" />
              </button>
            )}
            {/* Send Product — Evolution (internal products) */}
            {!isNoteMode && !isMetaChannel && (
              <button
                onClick={() => setShowInternalProductPicker(true)}
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0"
                title="إرسال منتج"
              >
                <ShoppingBag className="w-4 h-4" />
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
                className={cn("flex-1 border-0 rounded-xl h-10 md:h-11 text-sm", isNoteMode ? "bg-amber-500/5" : "bg-secondary/60 focus:bg-secondary")}
              />
            )}
            {(isNoteMode || !windowExpired) && (
              imagePreview ? (
                <button onClick={handleSendImage} disabled={isUploading} className="w-10 h-10 md:w-11 md:h-11 rounded-xl flex items-center justify-center shrink-0 bg-primary hover:bg-primary/90 transition-all shadow-md">
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
                    <button className="w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center shrink-0 bg-muted hover:bg-muted/80 transition-all" title="جدولة الإرسال">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </ScheduleMessagePopover>
                  <button onClick={handleSend} className={cn("w-10 h-10 md:w-11 md:h-11 rounded-xl flex items-center justify-center shrink-0 transition-all shadow-md", isNoteMode ? "bg-amber-500 hover:bg-amber-600" : "bg-primary hover:bg-primary/90")}>
                    <Send className="w-4 h-4 text-primary-foreground" style={{ transform: "scaleX(-1)" }} />
                  </button>
                </div>
              ) : !isNoteMode ? (
                <button onClick={() => setIsRecording(true)} className="w-10 h-10 md:w-11 md:h-11 rounded-xl flex items-center justify-center shrink-0 bg-primary hover:bg-primary/90 transition-all shadow-md">
                  <Mic className="w-4 h-4 text-primary-foreground" />
                </button>
              ) : (
                <button disabled className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-muted">
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
        onTransfer={onTransfer}
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