import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X, BarChart3, Loader2 } from "lucide-react";
import { invokeCloud } from "@/lib/supabase";
import { toast } from "sonner";

interface PollCreatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  customerPhone: string;
  channelId?: string;
}

const PollCreatorDialog = ({ open, onOpenChange, conversationId, customerPhone, channelId }: PollCreatorDialogProps) => {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [sending, setSending] = useState(false);

  const addOption = () => {
    if (options.length < 12) setOptions([...options, ""]);
  };

  const removeOption = (idx: number) => {
    if (options.length > 2) setOptions(options.filter((_, i) => i !== idx));
  };

  const updateOption = (idx: number, val: string) => {
    setOptions(options.map((o, i) => i === idx ? val : o));
  };

  const handleSend = async () => {
    const trimmedQ = question.trim();
    const trimmedOpts = options.map(o => o.trim()).filter(Boolean);
    if (!trimmedQ || trimmedOpts.length < 2) {
      toast.error("أدخل السؤال وخيارين على الأقل");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await invokeCloud("evolution-send", {
        body: {
          to: customerPhone,
          conversation_id: conversationId,
          type: "poll",
          poll_name: trimmedQ,
          poll_options: trimmedOpts,
          channel_id: channelId,
        },
      });
      if (error || data?.error) throw new Error(data?.error || "فشل");
      toast.success("📊 تم إرسال الاستطلاع");
      onOpenChange(false);
      setQuestion("");
      setOptions(["", ""]);
    } catch (e: any) {
      toast.error(e.message || "فشل إرسال الاستطلاع");
    }
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" /> إنشاء استطلاع
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <Input
            placeholder="السؤال..."
            value={question}
            onChange={e => setQuestion(e.target.value)}
            className="text-sm"
            autoFocus
          />
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">الخيارات:</p>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}.</span>
                <Input
                  placeholder={`خيار ${i + 1}`}
                  value={opt}
                  onChange={e => updateOption(i, e.target.value)}
                  className="text-sm h-9 flex-1"
                />
                {options.length > 2 && (
                  <button onClick={() => removeOption(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {options.length < 12 && (
              <Button variant="ghost" size="sm" className="text-xs gap-1 w-full" onClick={addOption}>
                <Plus className="w-3 h-3" /> إضافة خيار
              </Button>
            )}
          </div>
          <Button onClick={handleSend} disabled={sending} className="w-full gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
            إرسال الاستطلاع
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PollCreatorDialog;
