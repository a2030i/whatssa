import { useState } from "react";
import { Tag, Clock, Mail, Phone, StickyNote, Eye, MessageSquare } from "lucide-react";
import { Conversation } from "@/data/mockData";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface CustomerInfoPanelProps {
  conversation: Conversation;
  onUpdateNotes: (convId: string, notes: string) => void;
}

const CustomerInfoPanel = ({ conversation, onUpdateNotes }: CustomerInfoPanelProps) => {
  const [notes, setNotes] = useState(conversation.notes || "");
  const [editingNotes, setEditingNotes] = useState(false);

  const saveNotes = () => {
    onUpdateNotes(conversation.id, notes);
    setEditingNotes(false);
    toast.success("تم حفظ الملاحظات");
  };

  return (
    <div className="w-[260px] border-r border-border bg-card p-5 hidden xl:block overflow-y-auto">
      {/* Avatar & Name */}
      <div className="text-center mb-5">
        <div className="relative inline-block">
          <div className="w-16 h-16 rounded-full gradient-whatsapp flex items-center justify-center text-xl font-bold text-whatsapp-foreground mx-auto mb-3">
            {conversation.customerName.charAt(0)}
          </div>
          {conversation.lastSeen === "متصل الآن" && (
            <span className="absolute bottom-3 left-0 w-4 h-4 rounded-full bg-success border-2 border-card" />
          )}
        </div>
        <h3 className="font-bold">{conversation.customerName}</h3>
        <p className="text-xs text-muted-foreground">{conversation.lastSeen}</p>
      </div>

      <div className="space-y-4">
        {/* Contact Info */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Phone className="w-3 h-3" /> معلومات التواصل
          </p>
          <p className="text-sm" dir="ltr">{conversation.customerPhone}</p>
          {conversation.email && (
            <p className="text-sm text-muted-foreground truncate">{conversation.email}</p>
          )}
        </div>

        {/* Tags */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <Tag className="w-3 h-3" /> التصنيفات
          </p>
          <div className="flex flex-wrap gap-1.5">
            {conversation.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
            ))}
          </div>
        </div>

        {/* Assigned Agent */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <Clock className="w-3 h-3" /> المسؤول
          </p>
          <p className="text-sm">{conversation.assignedTo}</p>
        </div>

        {/* Notes */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <StickyNote className="w-3 h-3" /> ملاحظات
          </p>
          {editingNotes ? (
            <div className="space-y-2">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="text-sm bg-secondary border-0 min-h-[80px] resize-none" placeholder="أضف ملاحظة..." />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveNotes} className="text-xs h-7">حفظ</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingNotes(false)} className="text-xs h-7">إلغاء</Button>
              </div>
            </div>
          ) : (
            <button onClick={() => setEditingNotes(true)} className="w-full text-right p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
              <p className="text-sm text-muted-foreground">
                {notes || "أضف ملاحظة..."}
              </p>
            </button>
          )}
        </div>

        {/* Stats placeholder */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <MessageSquare className="w-3 h-3" /> إحصائيات
          </p>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">إجمالي المحادثات</span>
              <span className="font-medium">3</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">آخر تواصل</span>
              <span className="font-medium">{conversation.timestamp}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">متوسط الاستجابة</span>
              <span className="font-medium">1.5 دقيقة</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerInfoPanel;
