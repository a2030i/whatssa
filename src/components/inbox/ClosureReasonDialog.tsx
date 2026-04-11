import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { XCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface ClosureReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  onClose: (convId: string, status: "closed", reasonId?: string) => void;
}

interface ClosureReason {
  id: string;
  label: string;
}

const ClosureReasonDialog = ({ open, onOpenChange, conversationId, onClose }: ClosureReasonDialogProps) => {
  const { orgId } = useAuth();
  const [reasons, setReasons] = useState<ClosureReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !orgId) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("closure_reasons")
        .select("id, label")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("sort_order");
      setReasons(data || []);
      setLoading(false);
    };
    load();
  }, [open, orgId]);

  const handleClose = async () => {
    // Update conversation with closure reason
    const updateData: any = {
      status: "closed",
      closed_at: new Date().toISOString(),
    };
    if (selectedReason) {
      updateData.closure_reason_id = selectedReason;
    }
    await supabase.from("conversations").update(updateData).eq("id", conversationId);

    const reasonLabel = reasons.find(r => r.id === selectedReason)?.label || "بدون سبب";
    
    // Insert system message
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      content: `تم إغلاق المحادثة — السبب: ${reasonLabel}`,
      sender: "system",
      message_type: "text",
    });

    onClose(conversationId, "closed", selectedReason || undefined);
    onOpenChange(false);
    setSelectedReason(null);
    toast.success("تم إغلاق المحادثة");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-destructive" />
            إغلاق المحادثة
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">اختر سبب الإغلاق للمساعدة في التقارير:</p>

        {loading ? (
          <div className="py-4 text-center text-sm text-muted-foreground">جاري التحميل...</div>
        ) : reasons.length === 0 ? (
          <div className="py-4 text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">لم يتم تعيين أسباب إغلاق بعد</p>
            <p className="text-[11px] text-muted-foreground">يمكن للمدير إضافتها من الإعدادات</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
            {reasons.map(reason => (
              <button
                key={reason.id}
                onClick={() => setSelectedReason(reason.id === selectedReason ? null : reason.id)}
                className={`w-full text-right p-3 rounded-xl transition-colors text-sm ${
                  selectedReason === reason.id
                    ? "bg-destructive/10 border border-destructive/30 text-destructive font-medium"
                    : "bg-secondary hover:bg-accent"
                }`}
              >
                {reason.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button onClick={handleClose} variant="destructive" className="flex-1 gap-2">
            <XCircle className="w-4 h-4" />
            {selectedReason ? "إغلاق بهذا السبب" : "إغلاق بدون سبب"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ClosureReasonDialog;

