import { useState, useEffect } from "react";
import { Warehouse, Plus, Pencil, Trash2, Star, MapPin, Phone, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface WarehouseData {
  id?: string;
  name: string;
  phone: string;
  city: string;
  address_line1: string;
  address_line2: string;
  district: string;
  country: string;
  national_address: string;
  is_default: boolean;
  is_active: boolean;
}

const emptyWarehouse: WarehouseData = {
  name: "", phone: "", city: "", address_line1: "", address_line2: "",
  district: "", country: "SA", national_address: "", is_default: false, is_active: true,
};

const WarehousesPage = () => {
  const { orgId } = useAuth();
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseData>(emptyWarehouse);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { if (orgId) load(); }, [orgId]);

  const load = async () => {
    const { data } = await supabase
      .from("warehouses")
      .select("*")
      .eq("org_id", orgId!)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    setWarehouses(data || []);
    setLoading(false);
  };

  const openNew = () => { setEditing(emptyWarehouse); setDialogOpen(true); };
  const openEdit = (w: any) => {
    setEditing({
      id: w.id, name: w.name, phone: w.phone, city: w.city,
      address_line1: w.address_line1, address_line2: w.address_line2 || "",
      district: w.district || "", country: w.country || "SA",
      national_address: w.national_address || "",
      is_default: w.is_default, is_active: w.is_active,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!editing.name || !editing.phone || !editing.city || !editing.address_line1) {
      toast.error("يرجى تعبئة الحقول المطلوبة (الاسم، الجوال، المدينة، العنوان)");
      return;
    }
    setSaving(true);
    try {
      // If setting as default, unset others first
      if (editing.is_default) {
        await supabase.from("warehouses").update({ is_default: false } as any).eq("org_id", orgId!);
      }

      if (editing.id) {
        const { error } = await supabase.from("warehouses").update({
          name: editing.name, phone: editing.phone, city: editing.city,
          address_line1: editing.address_line1, address_line2: editing.address_line2 || null,
          district: editing.district || null, country: editing.country,
          national_address: editing.national_address || null,
          is_default: editing.is_default, is_active: editing.is_active,
          updated_at: new Date().toISOString(),
        } as any).eq("id", editing.id);
        if (error) throw error;
        toast.success("تم تحديث المستودع");
      } else {
        const { error } = await supabase.from("warehouses").insert({
          org_id: orgId!, name: editing.name, phone: editing.phone, city: editing.city,
          address_line1: editing.address_line1, address_line2: editing.address_line2 || null,
          district: editing.district || null, country: editing.country,
          national_address: editing.national_address || null,
          is_default: editing.is_default, is_active: editing.is_active,
        } as any);
        if (error) throw error;
        toast.success("تم إضافة المستودع");
      }
      setDialogOpen(false);
      load();
    } catch (err: any) {
      toast.error("حدث خطأ: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeleteId(id);
    const { error } = await supabase.from("warehouses").delete().eq("id", id);
    if (error) toast.error("فشل الحذف");
    else { toast.success("تم حذف المستودع"); load(); }
    setDeleteId(null);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Warehouse className="w-5 h-5 text-primary" />
            المستودعات والفروع
          </h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة مواقع الشحن والمستودعات — يتم استخدامها كبيانات مرسل عند إنشاء الشحنات</p>
        </div>
        <Button onClick={openNew} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />
          إضافة مستودع
        </Button>
      </div>

      {/* List */}
      {warehouses.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Warehouse className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">لا توجد مستودعات</p>
          <p className="text-sm mt-1">أضف مستودعاً أو فرعاً لاستخدامه كبيانات مرسل عند إنشاء الشحنات</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {warehouses.map(w => (
            <div key={w.id} className={cn(
              "rounded-xl border p-4 transition-all",
              w.is_default ? "border-primary/40 bg-primary/5" : "border-border bg-card",
              !w.is_active && "opacity-50"
            )}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm text-foreground truncate">{w.name}</h3>
                    {w.is_default && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-primary/15 text-primary border-0">
                        <Star className="w-2.5 h-2.5 ml-0.5" />
                        افتراضي
                      </Badge>
                    )}
                    {!w.is_active && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">معطل</Badge>
                    )}
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <p className="flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" />
                      {w.city} — {w.address_line1}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Phone className="w-3 h-3" />
                      {w.phone}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(w)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => remove(w.id)}
                    disabled={deleteId === w.id}
                  >
                    {deleteId === w.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing.id ? "تعديل المستودع" : "إضافة مستودع جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">اسم المستودع / الفرع *</Label>
              <Input value={editing.name} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} placeholder="المستودع الرئيسي" />
            </div>
            <div>
              <Label className="text-xs">رقم الجوال *</Label>
              <Input value={editing.phone} onChange={e => setEditing(p => ({ ...p, phone: e.target.value }))} placeholder="05xxxxxxxx" dir="ltr" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">المدينة *</Label>
                <Input value={editing.city} onChange={e => setEditing(p => ({ ...p, city: e.target.value }))} placeholder="الرياض" />
              </div>
              <div>
                <Label className="text-xs">الحي</Label>
                <Input value={editing.district} onChange={e => setEditing(p => ({ ...p, district: e.target.value }))} placeholder="حي النزهة" />
              </div>
            </div>
            <div>
              <Label className="text-xs">العنوان (سطر 1) *</Label>
              <Input value={editing.address_line1} onChange={e => setEditing(p => ({ ...p, address_line1: e.target.value }))} placeholder="شارع الملك فهد" />
            </div>
            <div>
              <Label className="text-xs">العنوان (سطر 2)</Label>
              <Input value={editing.address_line2} onChange={e => setEditing(p => ({ ...p, address_line2: e.target.value }))} placeholder="مبنى رقم 5" />
            </div>
            <div>
              <Label className="text-xs">العنوان الوطني</Label>
              <Input value={editing.national_address} onChange={e => setEditing(p => ({ ...p, national_address: e.target.value }))} placeholder="RNNN1234" dir="ltr" />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Label className="text-xs">مستودع افتراضي</Label>
              <Switch checked={editing.is_default} onCheckedChange={v => setEditing(p => ({ ...p, is_default: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">مفعّل</Label>
              <Switch checked={editing.is_active} onCheckedChange={v => setEditing(p => ({ ...p, is_active: v }))} />
            </div>
            <Button onClick={save} disabled={saving} className="w-full mt-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editing.id ? "حفظ التعديلات" : "إضافة المستودع")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WarehousesPage;
