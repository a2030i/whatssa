import { useState, useEffect } from "react";
import { Ban, Plus, Trash2, Search, Phone, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface BlacklistedNumber {
  id: string;
  phone: string;
  reason: string | null;
  created_at: string;
}

const BlacklistSection = () => {
  const { orgId } = useAuth();
  const [numbers, setNumbers] = useState<BlacklistedNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newReason, setNewReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (orgId) fetchNumbers();
  }, [orgId]);

  const fetchNumbers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("blacklisted_numbers")
      .select("*")
      .eq("org_id", orgId!)
      .order("created_at", { ascending: false });
    setNumbers((data as any[]) || []);
    setLoading(false);
  };

  const addNumber = async () => {
    if (!newPhone.trim()) {
      toast.error("أدخل رقم الهاتف");
      return;
    }
    setSaving(true);
    const phone = newPhone.trim().replace(/\s/g, "");
    const { error } = await supabase.from("blacklisted_numbers").insert({
      org_id: orgId!,
      phone,
      reason: newReason.trim() || null,
      blocked_by: (await supabase.auth.getUser()).data.user?.id,
    } as any);

    if (error) {
      if (error.code === "23505") {
        toast.error("هذا الرقم محظور بالفعل");
      } else {
        toast.error("فشل إضافة الرقم");
      }
    } else {
      toast.success("تم حظر الرقم");
      setShowAdd(false);
      setNewPhone("");
      setNewReason("");
      fetchNumbers();
    }
    setSaving(false);
  };

  const removeNumber = async (id: string) => {
    if (!confirm("هل تريد إزالة الحظر عن هذا الرقم؟")) return;
    await supabase.from("blacklisted_numbers").delete().eq("id", id);
    toast.success("تم إزالة الحظر");
    fetchNumbers();
  };

  const filtered = numbers.filter(n =>
    !search || n.phone.includes(search) || n.reason?.includes(search)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ban className="w-5 h-5 text-destructive" />
          <h3 className="font-semibold">الأرقام المحظورة</h3>
          {numbers.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">{numbers.length}</Badge>
          )}
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1 text-xs">
          <Plus className="w-3.5 h-3.5" /> حظر رقم
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        الأرقام المحظورة لن تستطيع التواصل مع المنصة — لن يتم استقبال رسائلهم ولن تُنشأ لهم محادثات جديدة
      </p>

      {numbers.length > 5 && (
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالرقم أو السبب..."
            className="pr-9 text-sm"
          />
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-6">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-secondary/50 rounded-lg p-6 text-center">
          <Ban className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {search ? "لا توجد نتائج" : "لم تحظر أي رقم بعد"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(num => (
            <div key={num.id} className="flex items-center justify-between bg-card border border-border rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
                  <Phone className="w-3.5 h-3.5" />
                </div>
                <div>
                  <p className="text-sm font-mono font-medium" dir="ltr">{num.phone}</p>
                  {num.reason && <p className="text-[11px] text-muted-foreground">{num.reason}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {new Date(num.created_at).toLocaleDateString("ar-SA")}
                </span>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeNumber(num.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" /> حظر رقم
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">رقم الهاتف</Label>
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="966501234567"
                className="mt-1 text-sm font-mono"
                dir="ltr"
              />
            </div>
            <div>
              <Label className="text-xs">سبب الحظر (اختياري)</Label>
              <Input
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="مثال: رسائل مزعجة"
                className="mt-1 text-sm"
              />
            </div>
            <Button onClick={addNumber} disabled={saving} className="w-full" variant="destructive">
              {saving ? "جاري الحظر..." : "حظر الرقم"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BlacklistSection;
