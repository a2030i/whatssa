import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, GitMerge, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface MergeConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceConversationId: string;
  sourceCustomerPhone: string;
  sourceCustomerName: string;
  onMerged?: (targetConversationId: string) => void;
}

const MergeConversationDialog = ({ open, onOpenChange, sourceConversationId, sourceCustomerPhone, sourceCustomerName, onMerged }: MergeConversationDialogProps) => {
  const { orgId, profile } = useAuth();
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<Array<{ id: string; customer_name: string; customer_phone: string; last_message: string; status: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    if (!open || !orgId) return;
    setSearch("");
    setLoading(true);
    
    const load = async () => {
      // First try: same phone number conversations (most common merge case)
      const { data: samePhone, error: err1 } = await supabase
        .from("conversations")
        .select("id, customer_name, customer_phone, last_message, status")
        .eq("org_id", orgId)
        .eq("customer_phone", sourceCustomerPhone)
        .neq("id", sourceConversationId)
        .order("last_message_at", { ascending: false });

      // Second: all other conversations for search
      const { data: others, error: err2 } = await supabase
        .from("conversations")
        .select("id, customer_name, customer_phone, last_message, status")
        .eq("org_id", orgId)
        .neq("id", sourceConversationId)
        .neq("customer_phone", sourceCustomerPhone)
        .neq("status", "closed")
        .order("last_message_at", { ascending: false })
        .limit(50);

      if (err1) console.error("Merge query error (same phone):", err1);
      if (err2) console.error("Merge query error (others):", err2);

      const all = [...(samePhone || []), ...(others || [])];
      setCandidates(all);
      setLoading(false);
    };
    
    load();
  }, [open, orgId, sourceConversationId, sourceCustomerPhone]);

  const filtered = candidates
    .filter(c => !search || (c.customer_name || "").includes(search) || c.customer_phone.includes(search));

  const handleMerge = async (target: typeof candidates[0]) => {
    const confirm = window.confirm(`سيتم نقل جميع رسائل "${sourceCustomerName}" إلى محادثة "${target.customer_name || target.customer_phone}" وإغلاق المحادثة الأصلية. متأكد؟`);
    if (!confirm) return;

    setMerging(true);
    try {
      const { error: moveError } = await supabase
        .from("messages")
        .update({ conversation_id: target.id })
        .eq("conversation_id", sourceConversationId);

      if (moveError) throw moveError;

      await supabase.from("conversations").update({
        status: "closed",
        is_archived: true,
        closed_at: new Date().toISOString(),
        last_message: `تم دمج المحادثة مع ${target.customer_name || target.customer_phone}`,
        unread_count: 0,
        unread_mention_count: 0,
      }).eq("id", sourceConversationId);

      await supabase.from("messages").insert({
        conversation_id: target.id,
        content: `تم دمج محادثة "${sourceCustomerName}" هنا بواسطة ${profile?.full_name || "النظام"}`,
        sender: "system",
        message_type: "text",
      });

      // If target was closed, reopen it
      if (target.status === "closed") {
        await supabase.from("conversations").update({
          status: "active",
          closed_at: null,
        }).eq("id", target.id);
      }

      toast.success("✅ تم دمج المحادثات بنجاح");
      onOpenChange(false);
      onMerged?.(target.id);
    } catch (e: any) {
      toast.error("فشل دمج المحادثات: " + (e.message || ""));
    }
    setMerging(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[70vh]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="w-4 h-4 text-primary" /> دمج المحادثة
          </DialogTitle>
        </DialogHeader>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            سيتم نقل جميع رسائل <strong>{sourceCustomerName}</strong> إلى المحادثة المختارة وإغلاق المحادثة الحالية. هذا الإجراء لا يمكن التراجع عنه.
          </p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="بحث عن محادثة للدمج معها..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 h-9 text-sm" />
        </div>
        <div className="space-y-1 max-h-[250px] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">لا توجد محادثات</p>
          ) : filtered.map(c => (
            <button
              key={c.id}
              onClick={() => handleMerge(c)}
              disabled={merging}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary transition-colors text-right"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                {(c.customer_name || c.customer_phone).slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {c.customer_name || c.customer_phone}
                  {c.customer_phone === sourceCustomerPhone && (
                    <span className="text-[10px] text-primary font-medium mr-1">(نفس الرقم)</span>
                  )}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{c.last_message}</p>
              </div>
              {c.status === "closed" && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">مغلقة</span>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MergeConversationDialog;
