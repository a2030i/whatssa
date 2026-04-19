import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BellOff, Clock, Sun, Calendar } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface SnoozeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  onSnoozed: (until: string) => void;
}

const PRESETS = [
  { label: "بعد ساعة",        hours: 1,    icon: Clock },
  { label: "بعد 4 ساعات",     hours: 4,    icon: Clock },
  { label: "غداً الصباح",     hours: null, key: "tomorrow", icon: Sun },
  { label: "بعد يومين",       hours: 48,   icon: Clock },
  { label: "الأسبوع القادم",  hours: 168,  icon: Calendar },
];

const SnoozeDialog = ({ open, onOpenChange, conversationId, onSnoozed }: SnoozeDialogProps) => {
  const [customDate, setCustomDate] = useState("");
  const [loading, setLoading] = useState(false);

  const getUntil = (preset: typeof PRESETS[number]): Date => {
    if (preset.key === "tomorrow") {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    }
    return new Date(Date.now() + (preset.hours! * 60 * 60 * 1000));
  };

  const doSnooze = async (until: Date) => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc("snooze_conversation", {
        p_conversation_id: conversationId,
        p_until: until.toISOString(),
      });
      if (error) throw error;
      onSnoozed(until.toISOString());
      onOpenChange(false);
      toast.success(`تم تأجيل المحادثة حتى ${until.toLocaleString("ar-SA-u-ca-gregory", { weekday: "short", hour: "2-digit", minute: "2-digit" })}`);
    } catch {
      toast.error("فشل تأجيل المحادثة");
    }
    setLoading(false);
  };

  const handleCustom = () => {
    if (!customDate) return;
    const d = new Date(customDate);
    if (isNaN(d.getTime()) || d <= new Date()) {
      toast.error("اختر تاريخاً مستقبلياً صحيحاً");
      return;
    }
    doSnooze(d);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellOff className="w-5 h-5 text-warning" />
            تأجيل المحادثة
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          ستختفي المحادثة من صندوق الوارد وتعود تلقائياً في الوقت المحدد.
        </p>

        <div className="space-y-2">
          {PRESETS.map((preset) => {
            const Icon = preset.icon;
            const until = getUntil(preset);
            return (
              <Button
                key={preset.label}
                variant="outline"
                className="w-full justify-between text-sm h-10"
                disabled={loading}
                onClick={() => doSnooze(until)}
              >
                <span className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  {preset.label}
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {until.toLocaleTimeString("ar-SA-u-ca-gregory", { hour: "2-digit", minute: "2-digit" })}
                  {preset.key === "tomorrow" || (preset.hours ?? 0) >= 48
                    ? " — " + until.toLocaleDateString("ar-SA-u-ca-gregory", { weekday: "short" })
                    : ""}
                </span>
              </Button>
            );
          })}
        </div>

        <div className="border-t border-border pt-3 space-y-2">
          <p className="text-xs text-muted-foreground">تاريخ مخصص</p>
          <div className="flex gap-2">
            <Input
              type="datetime-local"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="h-9 text-xs flex-1"
              min={new Date().toISOString().slice(0, 16)}
            />
            <Button size="sm" disabled={!customDate || loading} onClick={handleCustom}>
              تأجيل
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SnoozeDialog;
