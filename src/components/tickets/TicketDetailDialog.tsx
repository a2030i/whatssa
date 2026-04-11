import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUS_CONFIG, type TicketRow } from "@/components/tickets/ticketConstants";
import { Clock, User, MessageSquare, Link2 } from "lucide-react";

interface Props {
  ticket: TicketRow;
  agents: { id: string; full_name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

const TicketDetailDialog = ({ ticket, agents, open, onOpenChange, onUpdated }: Props) => {
  const { profile } = useAuth();
  const [status, setStatus] = useState(ticket.status);
  const [assignee, setAssignee] = useState(ticket.assigned_to || "");
  const [note, setNote] = useState("");

  const handleUpdate = async () => {
    const updates: any = { status, assigned_to: assignee || null };
    if ((status === "closed" || status === "resolved") && ticket.status !== status) {
      updates.closed_at = new Date().toISOString();
      updates.closed_by = profile!.id;
    }
    const { error } = await supabase.from("tickets").update(updates).eq("id", ticket.id);
    if (error) return toast.error("فشل التحديث");
    toast.success("تم تحديث التذكرة");
    onUpdated();
    onOpenChange(false);
  };

  const statusCfg = TICKET_STATUS_CONFIG[ticket.status] || TICKET_STATUS_CONFIG.open;
  const catInfo = TICKET_CATEGORIES.find(c => c.value === ticket.category);
  const priorityInfo = TICKET_PRIORITIES.find(p => p.value === ticket.priority);
  const creator = agents.find(a => a.id === ticket.created_by);
  const assignedAgent = agents.find(a => a.id === ticket.assigned_to);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{catInfo?.icon}</span>
            {ticket.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status & Priority badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={statusCfg.color}>{statusCfg.label}</Badge>
            <Badge className={priorityInfo?.color || ""}>{priorityInfo?.label}</Badge>
            <Badge variant="outline">{catInfo?.label}</Badge>
          </div>

          {/* Meta info */}
          <div className="text-xs text-muted-foreground space-y-1">
            {ticket.customer_name && <div>👤 العميل: {ticket.customer_name} {ticket.customer_phone && `(${ticket.customer_phone})`}</div>}
            {creator && <div>📝 أنشأها: {creator.full_name}</div>}
            {assignedAgent && <div>👷 مُسند إلى: {assignedAgent.full_name}</div>}
            <div>📅 {format(new Date(ticket.created_at), "d MMMM yyyy - HH:mm", { locale: ar })}</div>
            {ticket.closed_at && <div>✅ أُغلقت: {format(new Date(ticket.closed_at), "d MMMM yyyy - HH:mm", { locale: ar })}</div>}
          </div>

          {/* Description */}
          {ticket.description && (
            <div>
              <Label className="text-xs text-muted-foreground">الوصف</Label>
              <p className="text-sm mt-1 whitespace-pre-wrap bg-muted/30 p-3 rounded-lg">{ticket.description}</p>
            </div>
          )}

          {/* Attached messages */}
          {ticket.message_previews && (ticket.message_previews as any[]).length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> الرسائل المرفقة ({(ticket.message_previews as any[]).length})
              </Label>
              <div className="mt-1 space-y-1 max-h-[200px] overflow-y-auto">
                {(ticket.message_previews as any[]).map((mp: any, i: number) => (
                  <div key={i} className={`p-2 rounded text-xs ${mp.sender === "agent" ? "bg-primary/5 border-r-2 border-primary" : "bg-muted/50 border-r-2 border-muted-foreground"}`}>
                    <span className="font-medium">{mp.sender === "agent" ? "الموظف" : "العميل"}</span>
                    {mp.timestamp && <span className="text-muted-foreground mr-2">{format(new Date(mp.timestamp), "HH:mm")}</span>}
                    <p className="mt-0.5">{mp.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Update form */}
          <div className="border-t border-border pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>الحالة</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TICKET_STATUS_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>إسناد إلى</Label>
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">بدون إسناد</SelectItem>
                    {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleUpdate} className="w-full">حفظ التغييرات</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TicketDetailDialog;

