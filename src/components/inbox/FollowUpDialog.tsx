import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Clock, Send, Bell, FileText } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { WhatsAppTemplate } from "@/types/whatsapp";

interface FollowUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  customerPhone: string;
  customerName?: string;
  channelType?: string;
  templates?: WhatsAppTemplate[];
}

const FollowUpDialog = ({ open, onOpenChange, conversationId, customerPhone, customerName, channelType, templates = [] }: FollowUpDialogProps) => {
  const { orgId, user } = useAuth();
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState("10:00");
  const [note, setNote] = useState("");
  const [autoSend, setAutoSend] = useState(false);
  const [autoMessage, setAutoMessage] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const isMetaChannel = channelType === "meta_api";
  const approvedTemplates = templates.filter((t) => t.status === "approved");
  const selectedTemplate = approvedTemplates.find((t) => `${t.name}__${t.language}` === selectedTemplateId);

  const handleSubmit = async () => {
    if (!date || !orgId || !user) {
      toast.error("يرجى تحديد التاريخ");
      return;
    }

    const [hours, minutes] = time.split(":").map(Number);
    const scheduledAt = new Date(date);
    scheduledAt.setHours(hours, minutes, 0, 0);

    if (scheduledAt <= new Date()) {
      toast.error("يجب أن يكون الموعد في المستقبل");
      return;
    }

    if (autoSend && isMetaChannel && !selectedTemplate) {
      toast.error("يرجى اختيار قالب للإرسال التلقائي");
      return;
    }

    if (autoSend && !isMetaChannel && !autoMessage) {
      toast.error("يرجى كتابة نص الرسالة التلقائية");
      return;
    }

    setLoading(true);
    try {
      const insertData: Record<string, unknown> = {
        org_id: orgId,
        conversation_id: conversationId,
        created_by: user.id,
        assigned_to: user.id,
        customer_phone: customerPhone,
        customer_name: customerName || customerPhone,
        scheduled_at: scheduledAt.toISOString(),
        reminder_note: note || null,
        auto_send_message: autoSend
          ? isMetaChannel
            ? `[قالب] ${selectedTemplate?.name}`
            : autoMessage
          : null,
        auto_send_template_name: autoSend && isMetaChannel && selectedTemplate ? selectedTemplate.name : null,
        auto_send_template_language: autoSend && isMetaChannel && selectedTemplate ? selectedTemplate.language : null,
      };

      const { error } = await supabase.from("follow_up_reminders").insert(insertData as any);

      if (error) throw error;

      const templateLabel = selectedTemplate
        ? `${selectedTemplate.name} (${selectedTemplate.language})`
        : "";

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        content: `📅 تم جدولة متابعة في ${format(scheduledAt, "dd/MM/yyyy HH:mm", { locale: ar })}${note ? ` — ${note}` : ""}${autoSend ? (isMetaChannel ? ` (قالب: ${templateLabel})` : " (مع رسالة تلقائية)") : ""}`,
        sender: "system",
        message_type: "text",
      });

      toast.success("تم جدولة المتابعة بنجاح");
      onOpenChange(false);
      setDate(undefined);
      setTime("10:00");
      setNote("");
      setAutoSend(false);
      setAutoMessage("");
      setSelectedTemplateId("");
    } catch (err: any) {
      toast.error(err.message || "فشل جدولة المتابعة");
    } finally {
      setLoading(false);
    }
  };

  const quickOptions = [
    { label: "بعد ساعة", hours: 1 },
    { label: "غداً صباحاً", hours: null, tomorrow: true },
    { label: "بعد 3 أيام", hours: 72 },
    { label: "بعد أسبوع", hours: 168 },
  ];

  const handleQuickOption = (opt: typeof quickOptions[0]) => {
    const now = new Date();
    if (opt.tomorrow) {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      setDate(d);
      setTime("09:00");
    } else if (opt.hours) {
      const d = new Date(now.getTime() + opt.hours * 60 * 60 * 1000);
      setDate(d);
      setTime(format(d, "HH:mm"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            جدولة متابعة
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Quick options */}
          <div className="flex flex-wrap gap-2">
            {quickOptions.map((opt) => (
              <Button
                key={opt.label}
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => handleQuickOption(opt)}
              >
                {opt.label}
              </Button>
            ))}
          </div>

          {/* Date picker */}
          <div className="space-y-2">
            <Label>التاريخ</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-right font-normal", !date && "text-muted-foreground")}
                >
                  <CalendarIcon className="ml-2 h-4 w-4" />
                  {date ? format(date, "dd/MM/yyyy", { locale: ar }) : "اختر التاريخ"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time */}
          <div className="space-y-2">
            <Label>الوقت</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label>ملاحظة (اختياري)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثال: متابعة الشحنة مع العميل"
            />
          </div>

          {/* Auto-send toggle */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" />
              <div>
                <p className="text-sm font-medium">إرسال رسالة تلقائية</p>
                <p className="text-xs text-muted-foreground">
                  {isMetaChannel
                    ? "إرسال قالب واتساب معتمد للعميل تلقائياً في الموعد"
                    : "إرسال رسالة واتساب للعميل تلقائياً في الموعد"}
                </p>
              </div>
            </div>
            <Switch checked={autoSend} onCheckedChange={setAutoSend} />
          </div>

          {autoSend && isMetaChannel && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <FileText className="w-4 h-4" />
                اختر القالب المعتمد
              </Label>
              {approvedTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3 rounded-lg border bg-muted/20 text-center">
                  لا توجد قوالب معتمدة — أضف قوالب من صفحة القوالب أولاً
                </p>
              ) : (
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر قالب..." />
                  </SelectTrigger>
                  <SelectContent>
                    {approvedTemplates.map((t) => (
                      <SelectItem key={`${t.name}__${t.language}`} value={`${t.name}__${t.language}`}>
                        <span className="flex items-center gap-2">
                          <span>{t.name}</span>
                          <span className="text-xs text-muted-foreground">({t.language})</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedTemplate && (
                <div className="p-3 rounded-lg border bg-muted/20 text-sm space-y-1">
                  <p className="font-medium text-xs text-muted-foreground">معاينة القالب:</p>
                  <p className="whitespace-pre-wrap">{selectedTemplate.body}</p>
                </div>
              )}
            </div>
          )}

          {autoSend && !isMetaChannel && (
            <div className="space-y-2">
              <Label>نص الرسالة التلقائية</Label>
              <Textarea
                value={autoMessage}
                onChange={(e) => setAutoMessage(e.target.value)}
                placeholder="مثال: مرحباً، نود متابعة طلبكم..."
                rows={3}
              />
            </div>
          )}

          {/* Summary */}
          {date && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm space-y-1">
              <div className="flex items-center gap-2 font-medium text-primary">
                <Bell className="w-4 h-4" />
                ملخص المتابعة
              </div>
              <p>📅 {format(date, "EEEE dd MMMM yyyy", { locale: ar })} — الساعة {time}</p>
              <p>👤 {customerName || customerPhone}</p>
              {autoSend && isMetaChannel && selectedTemplate && (
                <p>📋 قالب: {selectedTemplate.name} ({selectedTemplate.language})</p>
              )}
              {autoSend && !isMetaChannel && autoMessage && <p>✉️ سيتم إرسال رسالة تلقائية</p>}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={!date || loading}>
            {loading ? "جاري الحفظ..." : "جدولة المتابعة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FollowUpDialog;
