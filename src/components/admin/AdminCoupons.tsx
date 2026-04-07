import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Tag, Plus, Trash2, Copy } from "lucide-react";

const AdminCoupons = () => {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
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

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("تم النسخ");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm flex items-center gap-2"><Tag className="w-4 h-4 text-primary" /> كوبونات الخصم</h2>
        <Button size="sm" className="text-xs gap-1" onClick={() => setShowNew(!showNew)}><Plus className="w-3 h-3" /> كوبون جديد</Button>
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
          {coupons.map((c) => (
            <div key={c.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Tag className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-bold font-mono bg-secondary px-2 py-0.5 rounded">{c.code}</code>
                    <button onClick={() => copyCode(c.code)}><Copy className="w-3 h-3 text-muted-foreground" /></button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {c.discount_type === "percentage" ? `${c.discount_value}%` : `${c.discount_value} ر.س`} خصم
                    · {c.used_count}/{c.max_uses || "∞"} استخدام
                    {c.valid_until && ` · حتى ${new Date(c.valid_until).toLocaleDateString("ar-SA-u-ca-gregory")}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.is_active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                  {c.is_active ? "فعال" : "معطل"}
                </span>
                <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => toggleCoupon(c.id, c.is_active)}>
                  {c.is_active ? "تعطيل" : "تفعيل"}
                </Button>
              </div>
            </div>
          ))}
          {coupons.length === 0 && <p className="p-6 text-center text-muted-foreground text-sm">لا توجد كوبونات</p>}
        </div>
      </div>
    </div>
  );
};

export default AdminCoupons;