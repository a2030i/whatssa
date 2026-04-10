import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Tag, Plus, Trash2, Copy, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const getCouponStatus = (c: any): { label: string; color: string; icon: any; warn: boolean } => {
  const isExpired = c.valid_until && new Date(c.valid_until) < new Date();
  const isExhausted = c.max_uses > 0 && c.used_count >= c.max_uses;
  if (isExpired) return { label: "منتهي الصلاحية", color: "bg-destructive/10 text-destructive", icon: Clock, warn: true };
  if (isExhausted) return { label: "استُنفد", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", icon: AlertTriangle, warn: true };
  if (!c.is_active) return { label: "معطل", color: "bg-muted text-muted-foreground", icon: null, warn: false };
  return { label: "فعال", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2, warn: false };
};

const AdminCoupons = () => {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [disablingStale, setDisablingStale] = useState(false);
  const [newCoupon, setNewCoupon] = useState({ code: "", description: "", discount_type: "percentage", discount_value: 10, max_uses: 0, valid_until: "" });

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });
    setCoupons(data || []);
  };

  const createCoupon = async () => {
    if (!newCoupon.code.trim()) { toast.error("أدخل كود الكوبون"); return; }
    const { error } = await supabase.from("coupons").insert({
      code: newCoupon.code.toUpperCase(),
      description: newCoupon.description,
      discount_type: newCoupon.discount_type,
      discount_value: newCoupon.discount_value,
      max_uses: newCoupon.max_uses,
      valid_until: newCoupon.valid_until || null,
    });
    if (error) {
      if (error.code === "23505") toast.error("الكود مستخدم مسبقاً");
      else toast.error("فشل الإنشاء");
    } else {
      toast.success("تم إنشاء الكوبون");
      setShowNew(false);
      setNewCoupon({ code: "", description: "", discount_type: "percentage", discount_value: 10, max_uses: 0, valid_until: "" });
      load();
    }
  };

  const toggleCoupon = async (id: string, active: boolean) => {
    await supabase.from("coupons").update({ is_active: !active }).eq("id", id);
    toast.success(!active ? "تم التفعيل" : "تم التعطيل");
    load();
  };

  const deleteCoupon = async (id: string) => {
    await supabase.from("coupons").delete().eq("id", id);
    toast.success("تم الحذف");
    load();
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("تم النسخ");
  };

  // Disable all expired + exhausted coupons
  const disableStale = async () => {
    const stale = coupons.filter(c => {
      const isExpired = c.valid_until && new Date(c.valid_until) < new Date();
      const isExhausted = c.max_uses > 0 && c.used_count >= c.max_uses;
      return c.is_active && (isExpired || isExhausted);
    });
    if (stale.length === 0) { toast.info("لا توجد كوبونات منتهية أو مستنفدة فعّالة"); return; }
    setDisablingStale(true);
    const ids = stale.map(c => c.id);
    await supabase.from("coupons").update({ is_active: false }).in("id", ids);
    toast.success(`تم تعطيل ${stale.length} كوبون`);
    setDisablingStale(false);
    load();
  };

  const staleCount = coupons.filter(c => {
    const isExpired = c.valid_until && new Date(c.valid_until) < new Date();
    const isExhausted = c.max_uses > 0 && c.used_count >= c.max_uses;
    return c.is_active && (isExpired || isExhausted);
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Tag className="w-4 h-4 text-primary" /> كوبونات الخصم
          {staleCount > 0 && (
            <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-full">
              {staleCount} منتهية/مستنفدة
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {staleCount > 0 && (
            <Button size="sm" variant="outline" className="text-xs gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={disableStale} disabled={disablingStale}>
              <AlertTriangle className="w-3 h-3" /> تعطيل المنتهية ({staleCount})
            </Button>
          )}
          <Button size="sm" className="text-xs gap-1" onClick={() => setShowNew(!showNew)}>
            <Plus className="w-3 h-3" /> كوبون جديد
          </Button>
        </div>
      </div>

      {showNew && (
        <div className="bg-card rounded-xl shadow-card p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-[10px]">الكود</Label>
              <Input value={newCoupon.code} onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value })} placeholder="WELCOME20" className="h-8 text-sm uppercase" dir="ltr" />
            </div>
            <div>
              <Label className="text-[10px]">الوصف</Label>
              <Input value={newCoupon.description} onChange={(e) => setNewCoupon({ ...newCoupon, description: e.target.value })} placeholder="خصم ترحيبي" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-[10px]">نوع الخصم</Label>
              <select value={newCoupon.discount_type} onChange={(e) => setNewCoupon({ ...newCoupon, discount_type: e.target.value })} className="w-full h-8 text-xs bg-secondary rounded-lg px-2">
                <option value="percentage">نسبة مئوية %</option>
                <option value="fixed">مبلغ ثابت</option>
              </select>
            </div>
            <div>
              <Label className="text-[10px]">القيمة</Label>
              <Input type="number" value={newCoupon.discount_value} onChange={(e) => setNewCoupon({ ...newCoupon, discount_value: +e.target.value })} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-[10px]">حد الاستخدام (0=لامحدود)</Label>
              <Input type="number" value={newCoupon.max_uses} onChange={(e) => setNewCoupon({ ...newCoupon, max_uses: +e.target.value })} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-[10px]">صلاحية حتى</Label>
              <Input type="date" value={newCoupon.valid_until} onChange={(e) => setNewCoupon({ ...newCoupon, valid_until: e.target.value })} className="h-8 text-sm" dir="ltr" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="text-xs" onClick={createCoupon}>إنشاء</Button>
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowNew(false)}>إلغاء</Button>
          </div>
        </div>
      )}

      <div className="bg-card rounded-xl shadow-card">
        <div className="divide-y divide-border">
          {coupons.map((c) => {
            const status = getCouponStatus(c);
            const StatusIcon = status.icon;
            const isExpired = c.valid_until && new Date(c.valid_until) < new Date();
            const isExhausted = c.max_uses > 0 && c.used_count >= c.max_uses;
            const usePct = c.max_uses > 0 ? Math.min(100, (c.used_count / c.max_uses) * 100) : 0;

            return (
              <div key={c.id} className={cn(
                "p-4 flex items-center justify-between",
                status.warn && "bg-destructive/5"
              )}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", status.warn ? "bg-destructive/10" : "bg-primary/10")}>
                    <Tag className={cn("w-5 h-5", status.warn ? "text-destructive" : "text-primary")} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-sm font-bold font-mono bg-secondary px-2 py-0.5 rounded">{c.code}</code>
                      <button onClick={() => copyCode(c.code)} className="text-muted-foreground hover:text-foreground transition-colors">
                        <Copy className="w-3 h-3" />
                      </button>
                      {/* Status badge */}
                      <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5", status.color)}>
                        {StatusIcon && <StatusIcon className="w-2.5 h-2.5" />}
                        {status.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {c.discount_type === "percentage" ? `${c.discount_value}%` : `${c.discount_value} ر.س`} خصم
                      {c.description && ` · ${c.description}`}
                    </p>
                    {/* Usage progress */}
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn("text-[10px]", isExhausted ? "text-destructive font-medium" : "text-muted-foreground")}>
                        {c.used_count} / {c.max_uses || "∞"} استخدام
                      </span>
                      {c.max_uses > 0 && (
                        <div className="flex-1 max-w-[80px] bg-secondary rounded-full h-1">
                          <div className={cn("h-1 rounded-full", isExhausted ? "bg-destructive" : usePct > 70 ? "bg-yellow-500" : "bg-primary")}
                            style={{ width: `${usePct}%` }} />
                        </div>
                      )}
                      {c.valid_until && (
                        <span className={cn("text-[10px]", isExpired ? "text-destructive font-medium" : "text-muted-foreground")}>
                          {isExpired ? "انتهى" : "حتى"} {new Date(c.valid_until).toLocaleDateString("ar-SA-u-ca-gregory")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 mr-2">
                  <Button size="sm" variant="ghost" className="text-xs h-7 px-2" onClick={() => toggleCoupon(c.id, c.is_active)}>
                    {c.is_active ? "تعطيل" : "تفعيل"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10" onClick={() => deleteCoupon(c.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
          {coupons.length === 0 && <p className="p-6 text-center text-muted-foreground text-sm">لا توجد كوبونات</p>}
        </div>
      </div>
    </div>
  );
};

export default AdminCoupons;
