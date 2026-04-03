import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, CalendarIcon, Send, Trash2, Pencil, X, AlertTriangle, FileText, Loader2 } from "lucide-react";
import TemplateVariableInputs from "./TemplateVariableInputs";
import { buildTemplateComponents } from "@/types/whatsapp";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { WhatsAppTemplate } from "@/types/whatsapp";

interface ScheduledMessage {
  id: string;
  to_phone: string;
  message_type: string;
  content: string | null;
  template_name: string | null;
  template_language: string | null;
  scheduled_at: string;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  conversation_id: string | null;
}

interface ScheduleMessagePopoverProps {
  conversationId: string;
  customerPhone: string;
  messageText: string;
  channelType?: string;
  lastCustomerMessageAt?: string;
  templates?: WhatsAppTemplate[];
  onScheduled: () => void;
  onClearInput: () => void;
  children: React.ReactNode;
}

const ScheduleMessagePopover = ({
  conversationId, customerPhone, messageText, channelType, lastCustomerMessageAt,
  templates = [], onScheduled, onClearInput, children,
}: ScheduleMessagePopoverProps) => {
  const { orgId, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState("10:00");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editDate, setEditDate] = useState("");
  const [useTemplate, setUseTemplate] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateVariables, setTemplateVariables] = useState<string[]>([]);

  const isMetaChannel = channelType === "meta_api";
  const approvedTemplates = templates.filter((t) => t.status === "approved");

  // Check if scheduled time is within 24h window
  const isWithinWindow = (scheduledTime: Date): boolean => {
    if (!isMetaChannel || !lastCustomerMessageAt) return true;
    const windowEnd = new Date(lastCustomerMessageAt).getTime() + 24 * 60 * 60 * 1000;
    return scheduledTime.getTime() < windowEnd;
  };

  useEffect(() => {
    if (open && orgId) loadScheduledMessages();
  }, [open, orgId]);

  const loadScheduledMessages = async () => {
    setLoadingMessages(true);
    const { data } = await supabase
      .from("scheduled_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .in("status", ["pending", "failed"])
      .order("scheduled_at", { ascending: true });
    setScheduledMessages((data as ScheduledMessage[]) || []);
    setLoadingMessages(false);
  };

  const getScheduledDate = (): Date | null => {
    if (!date) return null;
    const [h, m] = time.split(":").map(Number);
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    return d;
  };

  const handleSchedule = async () => {
    const scheduledAt = getScheduledDate();
    if (!scheduledAt || !orgId || !user) {
      toast.error("يرجى تحديد التاريخ والوقت");
      return;
    }
    if (scheduledAt <= new Date()) {
      toast.error("يجب أن يكون الموعد في المستقبل");
      return;
    }

    const withinWindow = isWithinWindow(scheduledAt);
    
    if (isMetaChannel && !withinWindow && !useTemplate) {
      toast.error("وقت الجدولة خارج نافذة 24 ساعة — يجب استخدام قالب");
      return;
    }

    const selectedTpl = approvedTemplates.find((t) => `${t.name}__${t.language}` === selectedTemplateId);

    if (!messageText.trim() && !selectedTpl) {
      toast.error("اكتب رسالة أو اختر قالب أولاً");
      return;
    }

    setLoading(true);
    try {
      const insertData: Record<string, unknown> = {
        org_id: orgId,
        conversation_id: conversationId,
        to_phone: customerPhone,
        message_type: selectedTpl ? "template" : "text",
        content: selectedTpl ? null : messageText.trim(),
        template_name: selectedTpl?.name || null,
        template_language: selectedTpl?.language || null,
        scheduled_at: scheduledAt.toISOString(),
        created_by: user.id,
      };

      const { error } = await supabase.from("scheduled_messages").insert(insertData as any);
      if (error) throw error;

      toast.success(`تمت جدولة الرسالة — ${format(scheduledAt, "dd/MM HH:mm", { locale: ar })}`);
      onClearInput();
      loadScheduledMessages();
      setDate(undefined);
      setTime("10:00");
      setUseTemplate(false);
      setSelectedTemplateId("");
      onScheduled();
    } catch (err: any) {
      toast.error(err.message || "فشل جدولة الرسالة");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("scheduled_messages").delete().eq("id", id);
    if (error) {
      toast.error("فشل حذف الرسالة المجدولة");
    } else {
      toast.success("تم حذف الرسالة المجدولة");
      setScheduledMessages((prev) => prev.filter((m) => m.id !== id));
    }
  };

  const handleEdit = async (id: string) => {
    if (!editContent.trim() && !editDate) return;
    const updates: Record<string, unknown> = {};
    if (editContent.trim()) updates.content = editContent.trim();
    if (editDate) updates.scheduled_at = new Date(editDate).toISOString();

    const { error } = await supabase.from("scheduled_messages").update(updates).eq("id", id);
    if (error) {
      toast.error("فشل تعديل الرسالة");
    } else {
      toast.success("تم تعديل الرسالة المجدولة");
      setEditingId(null);
      loadScheduledMessages();
    }
  };

  const quickOptions = [
    { label: "بعد ساعة", getDate: () => new Date(Date.now() + 3600000) },
    { label: "بعد 3 ساعات", getDate: () => new Date(Date.now() + 3 * 3600000) },
    { label: "غداً 9 صباحاً", getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
    { label: "غداً 2 ظهراً", getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(14, 0, 0, 0); return d; } },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-0" dir="rtl" align="end" side="top">
        <div className="p-3 border-b border-border">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            جدولة رسالة
          </h4>
        </div>

        <div className="p-3 space-y-3 max-h-[400px] overflow-y-auto">
          {/* Message preview */}
          {messageText.trim() && !useTemplate && (
            <div className="p-2 bg-muted/30 rounded-lg text-xs text-muted-foreground truncate">
              ✉️ {messageText.substring(0, 80)}{messageText.length > 80 ? "..." : ""}
            </div>
          )}

          {/* Meta channel: template toggle if needed */}
          {isMetaChannel && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setUseTemplate(false); setSelectedTemplateId(""); }}
                className={cn("text-xs px-3 py-1.5 rounded-full transition-colors", !useTemplate ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}
              >
                رسالة حرة
              </button>
              <button
                onClick={() => setUseTemplate(true)}
                className={cn("text-xs px-3 py-1.5 rounded-full transition-colors", useTemplate ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}
              >
                قالب معتمد
              </button>
            </div>
          )}

          {useTemplate && (
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger className="text-xs h-8">
                <SelectValue placeholder="اختر قالب..." />
              </SelectTrigger>
              <SelectContent>
                {approvedTemplates.map((t) => (
                  <SelectItem key={`${t.name}__${t.language}`} value={`${t.name}__${t.language}`}>
                    {t.name} ({t.language})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Quick options */}
          <div className="flex flex-wrap gap-1.5">
            {quickOptions.map((opt) => {
              const d = opt.getDate();
              const within = isWithinWindow(d);
              return (
                <button
                  key={opt.label}
                  onClick={() => { setDate(d); setTime(format(d, "HH:mm")); }}
                  className={cn(
                    "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                    date && format(d, "HH:mm dd/MM") === format(date, "HH:mm dd/MM")
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/50 hover:bg-muted border-border"
                  )}
                >
                  {opt.label}
                  {isMetaChannel && !within && <AlertTriangle className="w-3 h-3 inline mr-1 text-warning" />}
                </button>
              );
            })}
          </div>

          {/* Custom date/time */}
          <div className="flex items-center gap-2">
            <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("flex-1 text-xs h-8 justify-start", !date && "text-muted-foreground")}>
                  <CalendarIcon className="w-3 h-3 ml-1" />
                  {date ? format(date, "dd/MM/yyyy") : "تاريخ مخصص"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={(d) => { setDate(d); setShowDatePicker(false); }} disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))} className="pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-24 text-xs h-8" />
          </div>

          {/* Window warning */}
          {isMetaChannel && date && !isWithinWindow(getScheduledDate()!) && !useTemplate && (
            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-warning/10 border border-warning/20 text-[11px] text-warning">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>خارج نافذة 24 ساعة — يجب اختيار <button onClick={() => setUseTemplate(true)} className="underline font-medium">قالب معتمد</button></span>
            </div>
          )}

          {/* Schedule button */}
          <Button onClick={handleSchedule} disabled={loading || !date || (!messageText.trim() && !selectedTemplateId)} size="sm" className="w-full gap-2">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clock className="w-3.5 h-3.5" />}
            جدولة الإرسال
          </Button>
        </div>

        {/* Scheduled messages list */}
        {(scheduledMessages.length > 0 || loadingMessages) && (
          <div className="border-t border-border">
            <div className="p-2 px-3 flex items-center justify-between">
              <h5 className="text-[11px] font-medium text-muted-foreground">الرسائل المجدولة ({scheduledMessages.length})</h5>
            </div>
            <div className="max-h-[200px] overflow-y-auto px-3 pb-3 space-y-2">
              {loadingMessages ? (
                <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
              ) : scheduledMessages.map((msg) => (
                <div key={msg.id} className="p-2 rounded-lg bg-muted/30 border border-border/50 text-xs space-y-1.5">
                  {editingId === msg.id ? (
                    <div className="space-y-2">
                      <Input value={editContent} onChange={(e) => setEditContent(e.target.value)} className="text-xs h-7" placeholder="نص الرسالة" />
                      <Input type="datetime-local" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="text-xs h-7" />
                      <div className="flex gap-1.5">
                        <Button size="sm" className="h-6 text-[10px] flex-1" onClick={() => handleEdit(msg.id)}>حفظ</Button>
                        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setEditingId(null)}>إلغاء</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {msg.template_name ? (
                            <div className="flex items-center gap-1">
                              <FileText className="w-3 h-3 text-primary shrink-0" />
                              <span className="font-medium truncate">{msg.template_name}</span>
                            </div>
                          ) : (
                            <p className="truncate">{msg.content}</p>
                          )}
                        </div>
                        <Badge variant={msg.status === "failed" ? "destructive" : "secondary"} className="text-[9px] px-1.5 py-0 shrink-0">
                          {msg.status === "pending" ? "قيد الانتظار" : msg.status === "failed" ? "فشل" : msg.status}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          📅 {format(new Date(msg.scheduled_at), "dd/MM HH:mm", { locale: ar })}
                        </span>
                        <div className="flex items-center gap-1">
                          {msg.status === "pending" && !msg.template_name && (
                            <button
                              onClick={() => { setEditingId(msg.id); setEditContent(msg.content || ""); setEditDate(msg.scheduled_at.slice(0, 16)); }}
                              className="p-1 rounded hover:bg-secondary transition-colors"
                              title="تعديل"
                            >
                              <Pencil className="w-3 h-3 text-muted-foreground" />
                            </button>
                          )}
                          <button onClick={() => handleDelete(msg.id)} className="p-1 rounded hover:bg-destructive/10 transition-colors" title="حذف">
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </button>
                        </div>
                      </div>
                      {msg.error_message && (
                        <p className="text-destructive text-[10px]">❌ {msg.error_message}</p>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default ScheduleMessagePopover;
