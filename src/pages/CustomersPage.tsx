import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Search, Plus, Upload, Download, UserPlus, X, Tag, Edit2, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const CustomersPage = () => {
  const { orgId } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [tagDefs, setTagDefs] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editCustomer, setEditCustomer] = useState<any>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "", tags: [] as string[] });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (orgId) load();
  }, [orgId]);

  const load = async () => {
    const [c, t] = await Promise.all([
      supabase.from("customers").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
      supabase.from("customer_tag_definitions").select("*").eq("org_id", orgId),
    ]);
    setCustomers(c.data || []);
    setTagDefs(t.data || []);
  };

  const handleSave = async () => {
    if (!form.phone.trim()) { toast.error("رقم الجوال مطلوب"); return; }
    if (editCustomer) {
      await supabase.from("customers").update({
        name: form.name || null, phone: form.phone, email: form.email || null,
        notes: form.notes || null, tags: form.tags,
      }).eq("id", editCustomer.id);
      toast.success("تم تحديث العميل");
    } else {
      const { error } = await supabase.from("customers").insert({
        org_id: orgId, name: form.name || null, phone: form.phone,
        email: form.email || null, notes: form.notes || null, tags: form.tags,
      });
      if (error?.code === "23505") { toast.error("هذا الرقم موجود مسبقاً"); return; }
      if (error) { toast.error("حدث خطأ"); return; }
      toast.success("تم إضافة العميل");
    }
    setShowAdd(false);
    setEditCustomer(null);
    setForm({ name: "", phone: "", email: "", notes: "", tags: [] });
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("customers").delete().eq("id", id);
    toast.success("تم حذف العميل");
    load();
  };

  const openEdit = (c: any) => {
    setEditCustomer(c);
    setForm({ name: c.name || "", phone: c.phone, email: c.email || "", notes: c.notes || "", tags: c.tags || [] });
    setShowAdd(true);
  };

  const handleExport = () => {
    const csv = [
      "الاسم,الجوال,الإيميل,التصنيفات,ملاحظات",
      ...customers.map((c) => `"${c.name || ""}","${c.phone}","${c.email || ""}","${(c.tags || []).join(";")}","${c.notes || ""}"`),
    ].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success("تم تصدير العملاء");
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split("\n").slice(1).filter(Boolean);
    let count = 0;
    for (const line of lines) {
      const parts = line.split(",").map((s) => s.replace(/"/g, "").trim());
      const [name, phone, email, tags, notes] = parts;
      if (!phone) continue;
      const { error } = await supabase.from("customers").insert({
        org_id: orgId, name: name || null, phone, email: email || null,
        tags: tags ? tags.split(";").filter(Boolean) : [], notes: notes || null,
      });
      if (!error) count++;
    }
    toast.success(`تم استيراد ${count} عميل`);
    load();
    if (fileRef.current) fileRef.current.value = "";
  };

  const toggleTag = (tag: string) => {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
    }));
  };

  const filtered = customers.filter((c) =>
    (c.name || "").includes(search) || c.phone.includes(search) || (c.email || "").includes(search)
  );

  return (
    <div className="p-3 md:p-6 space-y-4 max-w-[1000px]" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">العملاء</h1>
          <p className="text-sm text-muted-foreground">{customers.length} عميل</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="text-xs gap-1" onClick={handleExport}>
            <Download className="w-3 h-3" /> تصدير
          </Button>
          <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => fileRef.current?.click()}>
            <Upload className="w-3 h-3" /> استيراد
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
          <Button size="sm" className="text-xs gap-1" onClick={() => { setEditCustomer(null); setForm({ name: "", phone: "", email: "", notes: "", tags: [] }); setShowAdd(true); }}>
            <UserPlus className="w-3 h-3" /> إضافة عميل
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="بحث بالاسم أو الرقم..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 text-sm" />
      </div>

      <div className="bg-card rounded-xl shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-[11px]">
              <th className="text-right p-3">الاسم</th>
              <th className="text-right p-3">الجوال</th>
              <th className="text-right p-3 hidden md:table-cell">الإيميل</th>
              <th className="text-right p-3">التصنيفات</th>
              <th className="text-right p-3 w-20">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                <td className="p-3 font-medium">{c.name || "بدون اسم"}</td>
                <td className="p-3 font-mono text-xs" dir="ltr">{c.phone}</td>
                <td className="p-3 text-xs hidden md:table-cell">{c.email || "-"}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {(c.tags || []).map((t: string) => (
                      <Badge key={t} variant="secondary" className="text-[9px] px-1.5 py-0">{t}</Badge>
                    ))}
                  </div>
                </td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(c)}>
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-xs">لا يوجد عملاء</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editCustomer ? "تعديل عميل" : "إضافة عميل جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">الاسم</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">رقم الجوال *</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" dir="ltr" placeholder="+966..." />
            </div>
            <div>
              <Label className="text-xs">الإيميل</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" dir="ltr" />
            </div>
            <div>
              <Label className="text-xs">ملاحظات</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">التصنيفات</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {tagDefs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => toggleTag(t.name)}
                    className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                      form.tags.includes(t.name)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary border-border hover:border-primary"
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
                {tagDefs.length === 0 && <span className="text-[10px] text-muted-foreground">لم تُنشأ تصنيفات بعد (أضفها من الإعدادات)</span>}
              </div>
            </div>
            <Button className="w-full" onClick={handleSave}>{editCustomer ? "تحديث" : "إضافة"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomersPage;
