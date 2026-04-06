import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { TICKET_CATEGORIES, TICKET_PRIORITIES } from "@/pages/TicketsPage";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  agents: { id: string; full_name: string }[];
  // Pre-filled from conversation
  conversationId?: string;
  customerPhone?: string;
  customerName?: string;
  messageIds?: string[];
  messagePreviews?: { sender: string; text: string; timestamp: string }[];
  defaultDescription?: string;
}

const CreateTicketDialog = ({
  open, onOpenChange, onCreated, agents,
  conversationId, customerPhone, customerName,
  messageIds, messagePreviews, defaultDescription,
}: Props) => {
  const { profile } = useAuth();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState(defaultDescription || "");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("medium");
  const [assignee, setAssignee] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return toast.error("أدخل عنوان التذكرة");
    setSaving(true);
    const { error } = await supabase.from("tickets").insert({
      org_id: profile!.org_id!,
      title: title.trim(),
      description: desc.trim() || null,
      category,
      priority,
      assigned_to: assignee || null,
      created_by: profile!.id,
      conversation_id: conversationId || null,
      customer_phone: customerPhone || null,
      customer_name: customerName || null,
      message_ids: messageIds || [],
      message_previews: messagePreviews || [],
    } as any);
    setSaving(false);
    if (error) {
      console.error("Ticket creation error:", error);
      return toast.error("فشل إنشاء التذكرة");
    }
    toast.success("تم إنشاء التذكرة بنجاح");
    onOpenChange(false);
    setTitle(""); setDesc(""); setCategory("general"); setPriority("medium"); setAssignee("");
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader><DialogTitle>تذكرة جديدة</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {customerName && (
            <div className="p-2 bg-muted/50 rounded text-xs text-muted-foreground">
              👤 {customerName} {customerPhone && `— ${customerPhone}`}
              {messageIds && messageIds.length > 0 && (
                <span className="block mt-1">💬 {messageIds.length} رسالة مرفقة</span>
              )}
            </div>
          )}
          <div>
            <Label>العنوان *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="مثال: مشكلة في الشحن" />
          </div>
          <div>
            <Label>الوصف</Label>
            <Textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="تفاصيل التذكرة..." rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>التصنيف</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.icon} {c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الأولوية</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>إسناد إلى</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger><SelectValue placeholder="اختر موظف" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">بدون إسناد</SelectItem>
                {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Message previews */}
          {messagePreviews && messagePreviews.length > 0 && (
            <div className="space-y-1 max-h-[150px] overflow-y-auto">
              <Label className="text-xs text-muted-foreground">الرسائل المرفقة</Label>
              {messagePreviews.map((mp, i) => (
                <div key={i} className="p-2 bg-muted/30 rounded text-xs">
                  <span className="font-medium">{mp.sender === "agent" ? "الموظف" : "العميل"}:</span> {mp.text.slice(0, 100)}{mp.text.length > 100 ? "..." : ""}
                </div>
              ))}
            </div>
          )}
          <Button onClick={handleCreate} disabled={saving} className="w-full">
            {saving ? "جاري الإنشاء..." : "إنشاء التذكرة"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateTicketDialog;
