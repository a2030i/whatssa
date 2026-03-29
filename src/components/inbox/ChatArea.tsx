import { useState, useRef, useEffect, useCallback } from "react";
import { Send, MoreVertical, ArrowRight, Smile, Paperclip, Zap, Check, CheckCheck, StickyNote, UserPlus, XCircle, CheckCircle2, FileText, AlertTriangle, Clock, AtSign, Mic, Loader2, X, Play, Image as ImageIcon, Video, Reply } from "lucide-react";
import { useSwipeReply } from "@/hooks/useSwipeReply";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Conversation, Message, quickReplies, agents } from "@/data/mockData";
import type { WhatsAppTemplate } from "@/types/whatsapp";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import TransferDialog from "./TransferDialog";
import ClosureReasonDialog from "./ClosureReasonDialog";

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
}

const MessageStatus = ({ status }: { status?: string }) => {
  if (!status) return null;
  if (status === "sent") return <Check className="w-3 h-3 text-muted-foreground inline-block mr-1" />;
  if (status === "delivered") return <CheckCheck className="w-3 h-3 text-muted-foreground inline-block mr-1" />;
  if (status === "read") return <CheckCheck className="w-3 h-3 text-primary inline-block mr-1" />;
  return null;
};

const isWindowExpired = (lastCustomerMessageAt?: string): boolean => {
  if (!lastCustomerMessageAt) return true;
  const diff = Date.now() - new Date(lastCustomerMessageAt).getTime();
  return diff > 24 * 60 * 60 * 1000;
};

const isImageUrl = (url?: string | null) => !!url && /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url);

const getStorageUrlFromText = (text: string) => {
  const match = text.match(/\n(https:\/\/[^\s]+)/i);
  return match?.[1];
};

const SwipeableMessageBubble = ({ msg, conversation, onReply }: { msg: Message; conversation: Conversation; onReply: (msg: Message) => void }) => {
  const swipeDirection = msg.sender === "agent" ? "left" : "right";
  const canReply = msg.type !== "note";
  const swipe = useSwipeReply({
    onSwipe: () => canReply && onReply(msg),
    direction: swipeDirection,
    threshold: 60,
  });

  return (
    <div
      ref={canReply ? swipe.ref : undefined}
      onTouchStart={canReply ? swipe.onTouchStart : undefined}
      onTouchMove={canReply ? swipe.onTouchMove : undefined}
      onTouchEnd={canReply ? swipe.onTouchEnd : undefined}
      className="group relative max-w-[85%] md:max-w-[70%]"
    >
      {/* Desktop click reply button */}
      {canReply && (
        <button
          onClick={() => onReply(msg)}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10 w-7 h-7 rounded-full bg-secondary shadow-md items-center justify-center hover:bg-accent hidden md:flex",
            msg.sender === "agent" ? "-left-9" : "-right-9"
          )}
          title="رد"
        >
          <Reply className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      )}
      <div className={cn(
        "rounded-xl px-4 py-2.5 text-sm",
        msg.type === "note"
          ? "bg-amber-500/10 border border-amber-500/20 text-foreground rounded-bl-sm"
          : msg.sender === "agent"
            ? "bg-card shadow-card text-foreground rounded-bl-sm"
            : "gradient-whatsapp text-white rounded-br-sm shadow-md"
      )}>
        {msg.senderName && msg.sender === "customer" && conversation.conversationType === "group" && (
          <div className="text-[11px] font-bold mb-1" style={{ color: "#a8f0c8" }}>{msg.senderName}</div>
        )}
        {msg.quoted && msg.quoted.text && (
          <div className={cn(
            "rounded-lg px-3 py-2 mb-2 border-r-4 text-[12px] leading-relaxed cursor-pointer",
            msg.sender === "customer"
              ? "bg-white/15 border-white/50"
              : "bg-secondary border-primary/40"
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
        {(() => {
          const textMediaUrl = getStorageUrlFromText(msg.text);
          const mediaUrl = msg.mediaUrl || textMediaUrl;
          const isImage = msg.type === "image" || isImageUrl(mediaUrl);
          const textWithoutUrl = textMediaUrl ? msg.text.replace(`\n${textMediaUrl}`, "").trim() : msg.text;
          return (
            <>
              {isImage && mediaUrl && (
                <img src={mediaUrl} alt="صورة مرفقة" className="rounded-lg max-w-[240px] max-h-[200px] object-cover mb-1 cursor-pointer" onClick={() => window.open(mediaUrl, "_blank")} />
              )}
              {msg.type === "audio" && mediaUrl && (
                <div className="mb-1 min-w-[220px] rounded-lg bg-background/40 p-2">
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium">
                    <Play className="h-3.5 w-3.5" />
                    <span>مقطع صوتي</span>
                  </div>
                  <audio controls preload="none" className="w-full">
                    <source src={mediaUrl} />
                    متصفحك لا يدعم تشغيل الصوت.
                  </audio>
                </div>
              )}
              {msg.type === "video" && mediaUrl && (
                <div className="mb-1 min-w-[220px] rounded-lg bg-background/40 p-2">
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium">
                    <Video className="h-3.5 w-3.5" />
                    <span>مقطع فيديو</span>
                  </div>
                  <video controls preload="metadata" className="max-h-[240px] w-full rounded-md">
                    <source src={mediaUrl} />
                    متصفحك لا يدعم تشغيل الفيديو.
                  </video>
                </div>
              )}
              {msg.type === "document" && mediaUrl && (
                <a href={mediaUrl} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 rounded-lg bg-background/40 p-2 text-xs font-medium hover:bg-background/60">
                  <FileText className="h-4 w-4" />
                  <span>فتح الملف المرفق</span>
                </a>
              )}
              {(!mediaUrl || (msg.type !== "audio" && msg.type !== "video" && msg.type !== "document" && !isImage) || textWithoutUrl) && textWithoutUrl && (
                <p className="whitespace-pre-wrap">
                  {textWithoutUrl.split(/(@[\u0600-\u06FFa-zA-Z]+)/g).map((part, i) =>
                    part.startsWith("@") ? (
                      <span key={i} className="bg-primary/10 text-primary font-semibold px-0.5 rounded">{part}</span>
                    ) : (
                      <span key={i}>{part}</span>
                    )
                  )}
                </p>
              )}
            </>
          );
        })()}
        <div className={cn("flex items-center gap-0.5 mt-1", msg.type === "note" ? "text-amber-500/60" : msg.sender === "agent" ? "text-muted-foreground" : "text-white/60")}>
          <span className="text-[10px]">{msg.timestamp}</span>
          {msg.sender === "agent" && msg.type !== "note" && <MessageStatus status={msg.status} />}
        </div>
      </div>
    </div>
  );
};

const ChatArea = ({ conversation, messages, templates, onBack, onSendMessage, onSendTemplate, onStatusChange, onTransfer }: ChatAreaProps) => {
  const [inputText, setInputText] = useState("");
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [templateVars, setTemplateVars] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isNoteMode, setIsNoteMode] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showClosureReason, setShowClosureReason] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ file: File; url: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const windowExpired = isWindowExpired(conversation.lastCustomerMessageAt);
  const approvedTemplates = templates.filter((template) => template.status === "approved");
  const filteredMentionAgents = agents.filter((agent) => agent.name.includes(mentionFilter));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => { if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current); };
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
    if (windowExpired) {
      toast.error("انتهت نافذة الـ 24 ساعة - يرجى إرسال قالب معتمد أولاً");
      setShowTemplates(true);
      return;
    }
    const replyData = replyTo ? { id: replyTo.id, waMessageId: replyTo.waMessageId, senderName: replyTo.sender === "agent" ? "أنت" : (replyTo.senderName || conversation.customerName), text: replyTo.text } : undefined;
    onSendMessage(conversation.id, inputText.trim(), "text", replyData);
    setInputText("");
    setReplyTo(null);
    setIsTyping(true);
    setTimeout(() => setIsTyping(false), 2000);
  };

  const handleReply = (msg: Message) => {
    setReplyTo(msg);
    setIsNoteMode(false);
    inputRef.current?.focus();
  };

  const cancelReply = () => setReplyTo(null);

  const handleInputChange = (value: string) => {
    setInputText(value);
    const lastAtIndex = value.lastIndexOf("@");
    if (lastAtIndex !== -1) {
      const afterAt = value.slice(lastAtIndex + 1);
      if (!afterAt.includes(" ") && afterAt.length <= 20) {
        setShowMentions(true);
        setMentionFilter(afterAt);
        return;
      }
    }
    setShowMentions(false);
  };

  const insertMention = (agentName: string) => {
    const lastAtIndex = inputText.lastIndexOf("@");
    const newText = inputText.slice(0, lastAtIndex) + `@${agentName} `;
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
    setIsTyping(true);
    setTimeout(() => setIsTyping(false), 2000);
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

  const startRecording = () => {
    setIsRecording(true);
    setRecordingTime(0);
    recordingIntervalRef.current = setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);
    toast.info("جاري التسجيل...");
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    // Mock: send voice message
    onSendMessage(conversation.id, `🎤 رسالة صوتية (${formatTime(recordingTime)})`);
    setRecordingTime(0);
    toast.success("تم إرسال الرسالة الصوتية");
  };

  const cancelRecording = () => {
    setIsRecording(false);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setRecordingTime(0);
    toast.info("تم إلغاء التسجيل");
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("يُسمح فقط برفع الصور حالياً");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن يكون أقل من 10 ميغابايت");
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
      const ext = imagePreview.file.name.split(".").pop() || "jpg";
      const path = `${conversation.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(path, imagePreview.file, { contentType: imagePreview.file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(path);
      const caption = inputText.trim();
      onSendMessage(conversation.id, caption ? `📷 ${caption}\n${urlData.publicUrl}` : `📷 صورة\n${urlData.publicUrl}`);
      setImagePreview(null);
      setInputText("");
      URL.revokeObjectURL(imagePreview.url);
      toast.success("تم إرسال الصورة");
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("فشل رفع الصورة: " + (err.message || "خطأ غير معروف"));
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

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="h-14 md:h-16 border-b border-border bg-card flex items-center justify-between px-2 md:px-5">
        <div className="flex items-center gap-2">
          <button className="w-9 h-9 rounded-lg hover:bg-secondary transition-colors flex items-center justify-center shrink-0" onClick={onBack}>
            <ArrowRight className="w-5 h-5 text-foreground" />
          </button>
          <div className="relative">
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-full gradient-whatsapp flex items-center justify-center text-sm font-bold text-whatsapp-foreground">
              {conversation.customerName.charAt(0)}
            </div>
            {conversation.lastSeen === "متصل الآن" && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-success border-2 border-card" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{conversation.customerName}</p>
            <p className="text-[10px] text-muted-foreground truncate">{conversation.lastSeen || conversation.customerPhone}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {windowExpired && (
            <div className="hidden sm:flex items-center gap-1 text-warning bg-warning/10 px-2 py-1 rounded-lg ml-2">
              <Clock className="w-3 h-3" />
              <span className="text-[10px] font-medium">نافذة 24س منتهية</span>
            </div>
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
              <DropdownMenuItem onClick={() => setShowTransfer(true)}>
                <UserPlus className="w-4 h-4 ml-2 text-primary" /> تحويل لموظف آخر
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 24h Window Warning */}
      {windowExpired && (
        <div className="bg-warning/10 border-b border-warning/20 px-4 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
          <p className="text-xs text-warning font-medium flex-1">انتهت نافذة الـ 24 ساعة. يمكنك فقط إرسال قوالب معتمدة من Meta.</p>
          <Button size="sm" variant="outline" className="text-xs h-7 border-warning/30 text-warning hover:bg-warning/10" onClick={() => setShowTemplates(true)}>
            <FileText className="w-3 h-3 ml-1" /> إرسال قالب
          </Button>
        </div>
      )}

      {/* Note Mode Banner */}
      {isNoteMode && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-600 font-medium flex-1">وضع الملاحظات الداخلية - الرسالة لن تُرسل للعميل</p>
          <Button size="sm" variant="ghost" className="text-xs h-7 text-amber-600" onClick={() => setIsNoteMode(false)}>
            إلغاء
          </Button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-3 bg-secondary/30">
        {messages.map((msg) => (
          <div key={msg.id} className={cn(
            "flex",
            msg.sender === "agent" ? "justify-start" : msg.sender === "system" ? "justify-center" : "justify-end"
          )}>
            {msg.sender === "system" ? (
              <div className="bg-muted/50 text-muted-foreground text-[11px] px-3 py-1 rounded-full">
                {msg.text}
              </div>
            ) : (
              <SwipeableMessageBubble
                msg={msg}
                conversation={conversation}
                onReply={handleReply}
              />
            )}
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-end">
            <div className="gradient-whatsapp text-whatsapp-foreground rounded-xl rounded-br-sm px-4 py-2.5 text-sm">
              <div className="flex gap-1 items-center">
                <span className="text-xs opacity-70">يكتب</span>
                <span className="flex gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-whatsapp-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-whatsapp-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-whatsapp-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies */}
      {showQuickReplies && !windowExpired && !isNoteMode && (
        <div className="border-t border-border bg-card px-3 py-2 flex gap-2 overflow-x-auto">
          {quickReplies.map((qr) => (
            <button key={qr.id} onClick={() => handleQuickReply(qr.text)} className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium">
              {qr.label}
            </button>
          ))}
        </div>
      )}

      {/* Mentions Popup */}
      {showMentions && filteredMentionAgents.length > 0 && (
        <div className="border-t border-border bg-card px-3 py-2">
          <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">اذكر موظف</p>
          <div className="flex gap-2 overflow-x-auto">
            {filteredMentionAgents.map((a) => (
              <button key={a.id} onClick={() => insertMention(a.name)} className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-secondary hover:bg-accent transition-colors">
                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">{a.initials}</div>
                {a.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recording UI */}
      {isRecording && (
        <div className="border-t border-destructive/30 bg-destructive/5 p-3 flex items-center gap-3">
          <button onClick={cancelRecording} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-secondary transition-colors" title="إلغاء">
            <XCircle className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex-1 flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-mono font-medium text-destructive">{formatTime(recordingTime)}</span>
            <div className="flex-1 h-1 bg-destructive/20 rounded-full overflow-hidden">
              <div className="h-full bg-destructive rounded-full animate-pulse" style={{ width: `${Math.min(recordingTime * 2, 100)}%` }} />
            </div>
          </div>
          <button onClick={stopRecording} className="w-10 h-10 rounded-full gradient-whatsapp flex items-center justify-center hover:opacity-90 transition-opacity" title="إرسال">
            <Send className="w-4 h-4 text-whatsapp-foreground" style={{ transform: "scaleX(-1)" }} />
          </button>
        </div>
      )}

      {/* Input Area */}
      {!isRecording && (
        <div className={cn("border-t bg-card p-2 md:p-3", isNoteMode ? "border-amber-500/30" : "border-border")}>
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
          <div className="flex items-center gap-0.5 mb-2 overflow-x-auto pb-1">
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
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
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
              onClick={() => { setInputText((prev) => prev + "@"); setShowMentions(true); setMentionFilter(""); inputRef.current?.focus(); }}
              className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0"
              title="اذكر موظف @"
            >
              <AtSign className="w-4 h-4" />
            </button>
            {!isNoteMode && (
              <button onClick={() => setShowTemplates(true)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground shrink-0" title="إرسال قالب">
                <FileText className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Image Preview */}
          {imagePreview && (
            <div className="relative mb-2 inline-block">
              <img src={imagePreview.url} alt="معاينة" className="max-h-32 rounded-lg border border-border object-cover" />
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
                className={cn("flex-1 border-0", isNoteMode ? "bg-amber-500/5" : "bg-secondary")}
              />
            )}
            {(isNoteMode || !windowExpired) && (
              imagePreview ? (
                <button onClick={handleSendImage} disabled={isUploading} className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 gradient-whatsapp hover:opacity-90 transition-opacity">
                  {isUploading ? <Loader2 className="w-4 h-4 text-whatsapp-foreground animate-spin" /> : <Send className="w-4 h-4 text-whatsapp-foreground" style={{ transform: "scaleX(-1)" }} />}
                </button>
              ) : inputText.trim() ? (
                <button onClick={handleSend} className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-opacity", isNoteMode ? "bg-amber-500 hover:opacity-90" : "gradient-whatsapp hover:opacity-90")}>
                  <Send className="w-4 h-4 text-whatsapp-foreground" style={{ transform: "scaleX(-1)" }} />
                </button>
              ) : !isNoteMode ? (
                <button onClick={startRecording} className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 gradient-whatsapp hover:opacity-90 transition-opacity">
                  <Mic className="w-4 h-4 text-whatsapp-foreground" />
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

      {/* Template Variable Fill Dialog */}
      <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>تعبئة بيانات القالب</DialogTitle></DialogHeader>
          {selectedTemplate && (
            <div className="space-y-4 mt-2">
              <div className="bg-secondary rounded-xl p-4 space-y-2">
                {(() => { const { header, text } = fillTemplateBody(selectedTemplate, templateVars); return (
                  <>
                    {header && <p className="font-bold text-sm">{header}</p>}
                    <p className="text-sm whitespace-pre-wrap">{text}</p>
                    {selectedTemplate.footer && <p className="text-[11px] text-muted-foreground">{selectedTemplate.footer}</p>}
                    {selectedTemplate.buttons && selectedTemplate.buttons.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-border">
                        {selectedTemplate.buttons.map((btn, i) => (
                          <div key={i} className="text-center text-xs text-primary font-medium py-1.5 bg-card rounded-lg">{btn.text}</div>
                        ))}
                      </div>
                    )}
                  </>
                ); })()}
              </div>
              {selectedTemplate.variableCount > 0 && Array.from({ length: selectedTemplate.variableCount }, (_, i) => (
                <div key={i} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{`{{${i + 1}}}`}</label>
                  <Input
                    value={templateVars[i] || ""}
                    onChange={(e) => { const nv = [...templateVars]; nv[i] = e.target.value; setTemplateVars(nv); }}
                    placeholder={`متغير ${i + 1}`}
                    className="text-sm bg-secondary border-0"
                  />
                </div>
              ))}
              <Button onClick={handleSendTemplate} className="w-full gradient-whatsapp text-whatsapp-foreground gap-2">
                <Send className="w-4 h-4" style={{ transform: "scaleX(-1)" }} /> إرسال القالب
              </Button>
            </div>
          )}
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
    </div>
  );
};

export default ChatArea;