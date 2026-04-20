import { useState, useRef, useEffect } from "react";
import { Send, Paperclip, Smile, Mic, StickyNote, AtSign, Zap, X, FileText, Video, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface InputAreaNewProps {
  inputText: string;
  onInputChange: (val: string) => void;
  onSend: () => void;
  onRecord?: () => void;
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleNote?: () => void;
  onToggleMention?: () => void;
  onToggleSavedReplies?: () => void;
  onEmojiClick?: (emoji: string) => void;
  isNoteMode?: boolean;
  isBlocked?: boolean;
  windowExpired?: boolean;
  imagePreview?: { file: File; url: string } | null;
  onCancelImagePreview?: () => void;
  onSendImage?: () => void;
  isUploading?: boolean;
  replyTo?: { senderName: string; text: string } | null;
  onCancelReply?: () => void;
  isEmailChannel?: boolean;
  enterToSend?: boolean;
  placeholder?: string;
}

const emojis = ["😊","👍","❤️","🎉","🙏","👋","✅","⭐","🔥","💯","😂","🤝"];

export const InputAreaNew = ({
  inputText, onInputChange, onSend, onRecord, onFileSelect,
  onToggleNote, onToggleMention, onToggleSavedReplies,
  isNoteMode = false, isBlocked = false, windowExpired = false,
  imagePreview, onCancelImagePreview, onSendImage, isUploading = false,
  replyTo, onCancelReply, isEmailChannel = false, enterToSend = true,
  placeholder,
}: InputAreaNewProps) => {
  const [showEmoji, setShowEmoji] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand tools when special modes are active
  useEffect(() => {
    if (isNoteMode || replyTo || imagePreview) setToolsOpen(true);
  }, [isNoteMode, replyTo, imagePreview]);

  const canSend = inputText.trim().length > 0 || !!imagePreview;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isEmailChannel) return;
    if (enterToSend && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      imagePreview ? onSendImage?.() : onSend();
    }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.target as HTMLTextAreaElement;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
    onInputChange(el.value);
  };

  return (
    <div className={cn(
      "shrink-0 border-t transition-all",
      isNoteMode ? "border-amber-200 bg-amber-50/30" : "border-gray-100 bg-white"
    )}>

      {/* Reply Preview */}
      {replyTo && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
          <div className="w-0.5 h-8 bg-[#25D366] rounded-full shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-[#25D366] truncate">{replyTo.senderName}</p>
            <p className="text-[12px] text-gray-400 truncate">{replyTo.text}</p>
          </div>
          <button onClick={onCancelReply} className="w-6 h-6 rounded-lg hover:bg-gray-100 flex items-center justify-center shrink-0">
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      )}

      {/* Image Preview */}
      {imagePreview && (
        <div className="mx-4 mt-3 relative inline-block">
          {imagePreview.file.type.startsWith("image/") ? (
            <img src={imagePreview.url} alt="معاينة" className="max-h-28 rounded-xl border border-gray-100 object-cover shadow-sm" />
          ) : imagePreview.file.type.startsWith("video/") ? (
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
              <Video className="w-5 h-5 text-[#25D366]" />
              <span className="text-xs font-medium text-gray-600 truncate max-w-[200px]">{imagePreview.file.name}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
              <FileText className="w-5 h-5 text-[#25D366]" />
              <span className="text-xs font-medium text-gray-600 truncate max-w-[200px]">{imagePreview.file.name}</span>
            </div>
          )}
          <button onClick={onCancelImagePreview}
            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Note Mode Banner */}
      {isNoteMode && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-1.5">
          <StickyNote className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <p className="text-[11px] text-amber-600 font-medium flex-1">ملاحظة داخلية — لن تُرسل للعميل</p>
          <button onClick={onToggleNote} className="text-[11px] text-amber-500 hover:text-amber-700 font-semibold">إلغاء</button>
        </div>
      )}

      {/* Main Input */}
      <div className="px-4 pt-3 pb-2">
        <div className={cn(
          "flex items-end gap-2 rounded-2xl border px-3 py-2 transition-all",
          isNoteMode
            ? "border-amber-200 bg-amber-50/50 focus-within:border-amber-300"
            : "border-gray-200 bg-gray-50 focus-within:border-[#25D366]/40 focus-within:bg-white focus-within:shadow-sm"
        )}>

          {/* Tools toggle button */}
          <button
            onClick={() => setToolsOpen(p => !p)}
            className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mb-0.5 transition-all border",
              toolsOpen
                ? isNoteMode
                  ? "bg-amber-100 text-amber-600 border-amber-200"
                  : "bg-[#25D366]/15 text-[#25D366] border-[#25D366]/30"
                : isNoteMode
                  ? "bg-amber-50 text-amber-400 border-amber-200"
                  : "bg-primary/8 text-primary border-primary/20 hover:bg-primary/15"
            )}
            title={toolsOpen ? "إخفاء الأدوات" : "إظهار الأدوات"}
            tabIndex={-1}
          >
            {toolsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={inputText}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder={
              windowExpired ? "انتهت نافذة 24 ساعة — أرسل قالباً أولاً" :
              isBlocked ? "هذا الرقم محظور..." :
              isNoteMode ? "ملاحظة داخلية... (@ لذكر موظف)" :
              placeholder || "اكتب رسالة..."
            }
            disabled={windowExpired && !isNoteMode}
            rows={1}
            className={cn(
              "flex-1 bg-transparent border-0 outline-none resize-none text-[16px] leading-relaxed min-h-[36px] max-h-[140px] placeholder:text-gray-300",
              isNoteMode ? "text-amber-900 placeholder:text-amber-300" : "text-gray-800",
              (windowExpired && !isNoteMode) && "opacity-40 cursor-not-allowed"
            )}
            style={{ height: "36px" }}
          />

          {/* Send Button */}
          <button
            onClick={() => imagePreview ? onSendImage?.() : onSend()}
            disabled={!canSend || isUploading}
            className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all mb-0.5",
              canSend && !isUploading
                ? isNoteMode
                  ? "bg-amber-500 hover:bg-amber-600 text-white shadow-sm"
                  : "bg-[#25D366] hover:bg-[#20c05a] text-white shadow-sm"
                : "bg-gray-100 text-gray-300 cursor-not-allowed"
            )}
          >
            <Send className="w-3.5 h-3.5" style={{ transform: "scaleX(-1)" }} />
          </button>
        </div>
      </div>

      {/* Tools Bar — collapsible */}
      {toolsOpen && <div className="flex items-center gap-0.5 px-4 pb-3 animate-in fade-in slide-in-from-top-1 duration-150">

        {/* Left tools */}
        <div className="flex items-center gap-0.5 flex-1">

          {/* Emoji */}
          <div className="relative">
            <button onClick={() => setShowEmoji(!showEmoji)}
              className={cn("w-8 h-8 rounded-xl flex items-center justify-center transition-all",
                showEmoji ? "bg-[#25D366]/10 text-[#25D366]" : "hover:bg-gray-100 text-gray-400")}>
              <Smile className="w-4 h-4" />
            </button>
            {showEmoji && (
              <div className="absolute bottom-10 left-0 bg-white border border-gray-100 rounded-2xl shadow-xl p-2 z-50">
                <div className="grid grid-cols-6 gap-1">
                  {emojis.map(e => (
                    <button key={e} onClick={() => { onInputChange(inputText + e); setShowEmoji(false); }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-50 text-lg transition-all">
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Attach */}
          {!isNoteMode && (
            <>
              <button onClick={() => fileInputRef.current?.click()}
                className="w-8 h-8 rounded-xl hover:bg-gray-100 text-gray-400 flex items-center justify-center transition-all"
                title="إرفاق ملف">
                <Paperclip className="w-4 h-4" />
              </button>
              <input ref={fileInputRef} type="file"
                accept="image/*,video/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={onFileSelect}
              />
            </>
          )}

          {/* Saved Replies */}
          {!isNoteMode && (
            <button onClick={onToggleSavedReplies}
              className="w-8 h-8 rounded-xl hover:bg-gray-100 text-gray-400 flex items-center justify-center transition-all"
              title="ردود محفوظة (/)">
              <Zap className="w-4 h-4" />
            </button>
          )}

          {/* Voice */}
          {!isNoteMode && !isEmailChannel && (
            <button onClick={onRecord}
              className="w-8 h-8 rounded-xl hover:bg-gray-100 text-gray-400 flex items-center justify-center transition-all"
              title="تسجيل صوتي">
              <Mic className="w-4 h-4" />
            </button>
          )}

          {/* Divider */}
          <div className="w-px h-4 bg-gray-100 mx-1 shrink-0" />

          {/* Note Mode */}
          <button onClick={onToggleNote}
            className={cn("w-8 h-8 rounded-xl flex items-center justify-center transition-all",
              isNoteMode ? "bg-amber-100 text-amber-500" : "hover:bg-gray-100 text-gray-400")}
            title="ملاحظة داخلية">
            <StickyNote className="w-4 h-4" />
          </button>

          {/* Mention */}
          <button onClick={onToggleMention}
            className="w-8 h-8 rounded-xl hover:bg-gray-100 text-gray-400 flex items-center justify-center transition-all"
            title="ذكر موظف">
            <AtSign className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Enter hint */}
        {!isEmailChannel && (
          <p className="text-[10px] text-gray-300 shrink-0">
            {enterToSend ? "Enter للإرسال" : "Shift+Enter للإرسال"}
          </p>
        )}
      </div>}

      {/* Minimal padding when toolbar is hidden */}
      {!toolsOpen && <div className="pb-2" />}
    </div>
  );
};

export default InputAreaNew;