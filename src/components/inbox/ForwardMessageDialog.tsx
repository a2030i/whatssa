import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Send, Loader2, MessageSquare } from "lucide-react";
import { supabase, invokeCloud } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Message } from "@/data/mockData";

interface ForwardMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: Message | null;
  sourceConversation: { channelType?: string; channelId?: string };
}

const ForwardMessageDialog = ({ open, onOpenChange, message, sourceConversation }: ForwardMessageDialogProps) => {
  const { orgId, profile } = useAuth();
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState<Array<{ id: string; customer_name: string; customer_phone: string; channel_id: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !orgId) return;
    setLoading(true);
    supabase
      .from("conversations")
      .select("id, customer_name, customer_phone, channel_id")
      .eq("org_id", orgId)
      .neq("status", "closed")
      .order("last_message_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setConversations(data || []);
        setLoading(false);
      });
  }, [open, orgId]);

  const filtered = conversations.filter(c =>
    !search || (c.customer_name || "").includes(search) || c.customer_phone.includes(search)
  );

  const handleForward = async (target: typeof conversations[0]) => {
    if (!message) return;
    setSending(true);
    try {
      // Determine send function based on source channel
      const sendFunc = sourceConversation.channelType === "meta_api" ? "whatsapp-send" : "evolution-send";
      const body: Record<string, any> = {
        to: target.customer_phone,
        conversation_id: target.id,
        message: message.text,
        sender_name: profile?.full_name || "النظام",
      };
      if (message.mediaUrl) {
        body.media_url = message.mediaUrl;
        body.media_type = message.type;
      }
      if (sourceConversation.channelType !== "meta_api") {
        body.channel_id = target.channel_id || sourceConversation.channelId;
      }
      await invokeCloud(sendFunc, { body });
      toast.success("✅ تم إعادة توجيه الرسالة");
      onOpenChange(false);
    } catch {
      toast.error("فشل إعادة التوجيه");
    }
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[70vh]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-4 h-4" style={{ transform: "scaleX(-1)" }} /> إعادة توجيه الرسالة
          </DialogTitle>
        </DialogHeader>
        {message && (
          <div className="bg-secondary/50 rounded-lg p-2.5 text-xs text-muted-foreground border-r-4 border-primary mb-2 line-clamp-3">
            {message.text}
          </div>
        )}
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="بحث عن محادثة..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 h-9 text-sm" />
        </div>
        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-6">لا توجد محادثات</p>
          ) : filtered.map(c => (
            <button
              key={c.id}
              onClick={() => handleForward(c)}
              disabled={sending}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary transition-colors text-right"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                {(c.customer_name || c.customer_phone).slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{c.customer_name || c.customer_phone}</p>
                <p className="text-[10px] text-muted-foreground" dir="ltr">+{c.customer_phone}</p>
              </div>
              {sending && <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ForwardMessageDialog;

