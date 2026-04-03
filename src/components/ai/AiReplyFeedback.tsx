import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ThumbsUp, ThumbsDown, Pencil, Send, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface AiReplyFeedbackProps {
  messageId: string;
  conversationId: string;
  aiResponse: string;
}

const AiReplyFeedback = ({ messageId, conversationId, aiResponse }: AiReplyFeedbackProps) => {
  const { orgId, user } = useAuth();
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctedText, setCorrectedText] = useState("");
  const [saving, setSaving] = useState(false);

  const submitFeedback = async (type: "approved" | "rejected" | "correction", corrected?: string) => {
    if (!orgId) return;
    setSaving(true);
    const { error } = await supabase.from("ai_reply_feedback" as any).insert({
      org_id: orgId,
      conversation_id: conversationId,
      message_id: messageId,
      ai_response: aiResponse,
      corrected_response: corrected || null,
      feedback_type: type,
      feedback_by: user?.id,
    } as any);
    setSaving(false);
    if (error) { toast.error("فشل حفظ التقييم"); return; }
    toast.success(type === "approved" ? "تم الموافقة ✓" : type === "rejected" ? "تم الرفض" : "تم حفظ التصحيح ✓");
    setShowCorrection(false);
    setCorrectedText("");
  };

  return (
    <div className="flex items-center gap-1 mt-1">
      <Button
        size="icon"
        variant="ghost"
        className="h-5 w-5 text-muted-foreground hover:text-primary"
        onClick={() => submitFeedback("approved")}
        title="رد صحيح"
      >
        <ThumbsUp className="w-3 h-3" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-5 w-5 text-muted-foreground hover:text-destructive"
        onClick={() => submitFeedback("rejected")}
        title="رد خاطئ"
      >
        <ThumbsDown className="w-3 h-3" />
      </Button>
      <Popover open={showCorrection} onOpenChange={setShowCorrection}>
        <PopoverTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 text-muted-foreground hover:text-amber-500"
            title="تصحيح الرد"
          >
            <Pencil className="w-3 h-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" dir="rtl" align="start">
          <p className="text-xs font-medium mb-2">اكتب الرد الصحيح:</p>
          <Textarea
            value={correctedText}
            onChange={e => setCorrectedText(e.target.value)}
            placeholder="الرد المناسب كان..."
            rows={3}
            className="text-xs"
          />
          <div className="flex gap-1 mt-2">
            <Button
              size="sm"
              className="flex-1 h-7 text-xs gap-1"
              disabled={!correctedText.trim() || saving}
              onClick={() => submitFeedback("correction", correctedText)}
            >
              <Send className="w-3 h-3" /> حفظ التصحيح
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setShowCorrection(false)}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default AiReplyFeedback;
