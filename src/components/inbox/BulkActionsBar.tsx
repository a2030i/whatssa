import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, XCircle, Tag, CheckCircle2, Loader2, Archive } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ConfirmDialog from "@/components/ui/confirm-dialog";

interface BulkActionsBarProps {
  selectedIds: string[];
  onClear: () => void;
  onDone: () => void;
}

const BulkActionsBar = ({ selectedIds, onClear, onDone }: BulkActionsBarProps) => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const count = selectedIds.length;

  const confirmBulkClose = async () => {
    setShowConfirm(false);
    setLoading(true);
    const agentName = profile?.full_name || "النظام";
    for (const id of selectedIds) {
      await supabase.from("conversations").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", id);
      await supabase.from("messages").insert({
        conversation_id: id,
        content: `تم إغلاق المحادثة بواسطة ${agentName} (إجراء جماعي)`,
        sender: "system",
        message_type: "text",
      });
    }
    toast.success(`✅ تم إغلاق ${count} محادثة`);
    setLoading(false);
    onDone();
  };

  const handleBulkArchive = async () => {
    setLoading(true);
    for (const id of selectedIds) {
      await supabase.from("conversations").update({ is_archived: true }).eq("id", id);
    }
    toast.success(`📁 تم أرشفة ${count} محادثة`);
    setLoading(false);
    onDone();
  };

  const handleBulkTag = async () => {
    const tag = tagInput.trim();
    if (!tag) return;
    setLoading(true);
    for (const id of selectedIds) {
      const { data } = await supabase.from("conversations").select("tags").eq("id", id).single();
      const currentTags = (data?.tags as string[]) || [];
      if (!currentTags.includes(tag)) {
        await supabase.from("conversations").update({ tags: [...currentTags, tag] }).eq("id", id);
      }
    }
    toast.success(`🏷️ تم إضافة الوسم "${tag}" لـ ${count} محادثة`);
    setTagInput("");
    setLoading(false);
    onDone();
  };

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border-b border-primary/20 animate-fade-in">
        <Badge variant="secondary" className="text-xs font-bold shrink-0">{count}</Badge>
        <span className="text-xs text-muted-foreground shrink-0">محادثة</span>
        <div className="flex items-center gap-1 flex-1 overflow-x-auto">
          <Button variant="ghost" size="sm" className="text-xs gap-1 shrink-0 h-7" onClick={() => setShowConfirm(true)} disabled={loading}>
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />} إغلاق
          </Button>
          <Button variant="ghost" size="sm" className="text-xs gap-1 shrink-0 h-7" onClick={handleBulkArchive} disabled={loading}>
            <Archive className="w-3 h-3" /> أرشفة
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="text-xs gap-1 shrink-0 h-7" disabled={loading}>
                <Tag className="w-3 h-3" /> وسم
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" side="bottom" align="start">
              <div className="flex gap-1">
                <Input placeholder="اسم الوسم" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleBulkTag()} className="text-xs h-7" />
                <Button size="sm" className="h-7 px-2" onClick={handleBulkTag} disabled={!tagInput.trim()}>
                  <CheckCircle2 className="w-3 h-3" />
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <button onClick={onClear} className="text-muted-foreground hover:text-foreground shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <ConfirmDialog
        open={showConfirm}
        title={`إغلاق ${count} محادثة؟`}
        confirmLabel="إغلاق الكل"
        destructive
        onConfirm={confirmBulkClose}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
};

export default BulkActionsBar;
