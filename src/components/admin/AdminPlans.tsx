import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CreditCard, Plus, Pencil, Save, X } from "lucide-react";

const AdminPlans = () => {
  const [plans, setPlans] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [showNew, setShowNew] = useState(false);
  const [newPlan, setNewPlan] = useState({ name: "", name_ar: "", price: 0, max_conversations: 100, max_team_members: 1, max_phone_numbers: 1, max_messages_per_month: 999999 });

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data } = await supabase.from("plans").select("*").order("sort_order");
    setPlans(data || []);
  };

  const startEdit = (plan: any) => { setEditingId(plan.id); setEditData({ ...plan }); };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase.from("plans").update({
      name: editData.name, name_ar: editData.name_ar, price: editData.price,
      max_conversations: editData.max_conversations, max_messages_per_month: editData.max_messages_per_month,
      max_team_members: editData.max_team_members, max_phone_numbers: editData.max_phone_numbers,
      is_active: editData.is_active,
    }).eq("id", editingId);
    if (error) toast.error("فشل الحفظ"); else { toast.success("تم الحفظ"); setEditingId(null); load(); }
  };

  const createPlan = async () => {
    const { error } = await supabase.from("plans").insert({
      ...newPlan, sort_order: plans.length + 1, features: "[]",
    });
    if (error) toast.error("فشل الإنشاء"); else { toast.success("تم إنشاء الباقة"); setShowNew(false); load(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm flex items-center gap-2"><CreditCard className="w-4 h-4 text-primary" /> إدارة الباقات</h2>
        <Button size="sm" className="text-xs gap-1" onClick={() => setShowNew(!showNew)}><Plus className="w-3 h-3" /> باقة جديدة</Button>
      </div>

      {showNew && (
        <div className="bg-card rounded-xl shadow-card p-4 space-y-3">
          <p className="text-sm font-semibold">باقة جديدة</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><Label className="text-[10px]">الاسم (EN)</Label><Input value={newPlan.name} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })} className="h-8 text-sm" /></div>
            <div><Label className="text-[10px]">الاسم (AR)</Label><Input value={newPlan.name_ar} onChange={(e) => setNewPlan({ ...newPlan, name_ar: e.target.value })} className="h-8 text-sm" /></div>
            <div><Label className="text-[10px]">السعر (ر.س)</Label><Input type="number" value={newPlan.price} onChange={(e) => setNewPlan({ ...newPlan, price: +e.target.value })} className="h-8 text-sm" /></div>
            <div><Label className="text-[10px]">حد المحادثات</Label><Input type="number" value={newPlan.max_conversations} onChange={(e) => setNewPlan({ ...newPlan, max_conversations: +e.target.value })} className="h-8 text-sm" /></div>
            <div><Label className="text-[10px]">حد الأعضاء</Label><Input type="number" value={newPlan.max_team_members} onChange={(e) => setNewPlan({ ...newPlan, max_team_members: +e.target.value })} className="h-8 text-sm" /></div>
            <div><Label className="text-[10px]">حد الأرقام</Label><Input type="number" value={newPlan.max_phone_numbers} onChange={(e) => setNewPlan({ ...newPlan, max_phone_numbers: +e.target.value })} className="h-8 text-sm" /></div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="text-xs" onClick={createPlan}>إنشاء</Button>
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowNew(false)}>إلغاء</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plans.map((plan) => {
          const isEditing = editingId === plan.id;
          const d = isEditing ? editData : plan;
          return (
            <div key={plan.id} className="bg-card rounded-xl shadow-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-bold text-sm">{d.name_ar}</p>
                  <p className="text-xl font-bold text-primary">{d.price == 0 ? "مجاني" : `${d.price} ر.س/شهر`}</p>
                </div>
                {isEditing ? (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={saveEdit}><Save className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingId(null)}><X className="w-3.5 h-3.5" /></Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(plan)}><Pencil className="w-3.5 h-3.5" /></Button>
                )}
              </div>
              {isEditing ? (
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-[10px]">الاسم AR</Label><Input value={d.name_ar} onChange={(e) => setEditData({ ...d, name_ar: e.target.value })} className="h-7 text-[11px]" /></div>
                  <div><Label className="text-[10px]">السعر</Label><Input type="number" value={d.price} onChange={(e) => setEditData({ ...d, price: +e.target.value })} className="h-7 text-[11px]" /></div>
                  <div><Label className="text-[10px]">محادثات</Label><Input type="number" value={d.max_conversations} onChange={(e) => setEditData({ ...d, max_conversations: +e.target.value })} className="h-7 text-[11px]" /></div>
                  <div><Label className="text-[10px]">أعضاء</Label><Input type="number" value={d.max_team_members} onChange={(e) => setEditData({ ...d, max_team_members: +e.target.value })} className="h-7 text-[11px]" /></div>
                  <div><Label className="text-[10px]">أرقام</Label><Input type="number" value={d.max_phone_numbers} onChange={(e) => setEditData({ ...d, max_phone_numbers: +e.target.value })} className="h-7 text-[11px]" /></div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <p className="text-muted-foreground">محادثات: <span className="text-foreground font-medium">{d.max_conversations}</span></p>
                  <p className="text-muted-foreground">أعضاء: <span className="text-foreground font-medium">{d.max_team_members}</span></p>
                  <p className="text-muted-foreground">أرقام: <span className="text-foreground font-medium">{d.max_phone_numbers}</span></p>
                  <p className="text-muted-foreground text-[10px] col-span-2">الرسائل غير محدودة (رسوم Meta على العميل)</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminPlans;