import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Search, Plus, Upload, Download, UserPlus, X, Tag, Edit2, Trash2, Filter, User, UserCheck, UserX, Users } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import CustomerProfile from "@/components/customers/CustomerProfile";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const LIFECYCLE_STAGES = [
  { value: "lead", label: "عميل محتمل", icon: User, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { value: "qualified", label: "مؤهل", icon: UserCheck, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  { value: "customer", label: "عميل فعلي", icon: Users, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  { value: "lost", label: "خسرناه", icon: UserX, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
];

const CustomersPage = () => {
  const { orgId } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [tagDefs, setTagDefs] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editCustomer, setEditCustomer] = useState<any>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "", tags: [] as string[], lifecycle_stage: "lead", company: "", source: "whatsapp" });
  const [customFields, setCustomFields] = useState<Record<string, string>>({});
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
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
    const payload: any = {
      name: form.name || null, phone: form.phone, email: form.email || null,
      notes: form.notes || null, tags: form.tags,
      lifecycle_stage: form.lifecycle_stage, company: form.company || null,
      source: form.source || "whatsapp",
      custom_fields: Object.keys(customFields).length > 0 ? customFields : {},
    };

    if (editCustomer) {
      await supabase.from("customers").update(payload).eq("id", editCustomer.id);
      toast.success("تم تحديث العميل");
    } else {
      const { error } = await supabase.from("customers").insert({ ...payload, org_id: orgId });
      if (error?.code === "23505") { toast.error("هذا الرقم موجود مسبقاً"); return; }
      if (error) { toast.error("حدث خطأ"); return; }
      toast.success("تم إضافة العميل");
    }
    setShowAdd(false);
    setEditCustomer(null);
    resetForm();
    load();
  };

  const resetForm = () => {
    setForm({ name: "", phone: "", email: "", notes: "", tags: [], lifecycle_stage: "lead", company: "", source: "whatsapp" });
    setCustomFields({});
  };

  const handleDelete = async (id: string) => {
    await supabase.from("customers").delete().eq("id", id);
    toast.success("تم حذف العميل");
    load();
  };

  const openEdit = (c: any) => {
    setEditCustomer(c);
    setForm({
      name: c.name || "", phone: c.phone, email: c.email || "", notes: c.notes || "",
      tags: c.tags || [], lifecycle_stage: c.lifecycle_stage || "lead",
      company: c.company || "", source: c.source || "whatsapp",
    });
    setCustomFields(c.custom_fields || {});
    setShowAdd(true);
  };

  const handleExport = () => {
    const csv = [
      "الاسم,الجوال,الإيميل,التصنيفات,المرحلة,الشركة,المصدر,ملاحظات",
      ...customers.map((c) => `"${c.name || ""}","${c.phone}","${c.email || ""}","${(c.tags || []).join(";")}","${c.lifecycle_stage || "lead"}","${c.company || ""}","${c.source || ""}","${c.notes || ""}"`),
    ].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success("تم تصدير العملاء");
  };

  /** Parse a CSV line respecting quoted fields */
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } // escaped quote
        else { inQuotes = !inQuotes; }
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  /** Validate phone: must start with + and have 10-15 digits */
  const isValidPhone = (phone: string): boolean => {
    const cleaned = phone.replace(/[\s\-()]/g, "");
    return /^\+?\d{10,15}$/.test(cleaned);
  };

  /** Validate email loosely */
  const isValidEmail = (email: string): boolean => !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);

    if (lines.length < 2) { toast.error("الملف فارغ أو بدون بيانات"); return; }

    const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
    const dataLines = lines.slice(1).filter((l) => l.trim());

    // Detect columns by header names (supports Arabic + English)
    const colMap = {
      name: header.findIndex((h) => ["name", "الاسم", "اسم"].includes(h)),
      phone: header.findIndex((h) => ["phone", "الجوال", "جوال", "رقم", "mobile"].includes(h)),
      email: header.findIndex((h) => ["email", "الإيميل", "ايميل", "بريد"].includes(h)),
      tags: header.findIndex((h) => ["tags", "التصنيفات", "تصنيف", "وسم"].includes(h)),
      notes: header.findIndex((h) => ["notes", "ملاحظات", "ملاحظة"].includes(h)),
      company: header.findIndex((h) => ["company", "شركة", "الشركة"].includes(h)),
      stage: header.findIndex((h) => ["stage", "المرحلة", "مرحلة", "lifecycle_stage"].includes(h)),
    };

    if (colMap.phone === -1) {
      toast.error("لم يتم العثور على عمود الجوال في الملف. تأكد من وجود عمود بعنوان 'الجوال' أو 'phone'");
      return;
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Batch insert for performance
    const validRows: any[] = [];

    for (let i = 0; i < dataLines.length; i++) {
      const parts = parseCSVLine(dataLines[i]);
      const phone = (parts[colMap.phone] || "").replace(/[\s\-()]/g, "");
      const email = colMap.email >= 0 ? parts[colMap.email] || "" : "";
      const name = colMap.name >= 0 ? parts[colMap.name] || "" : "";

      if (!phone) { skipped++; continue; }

      if (!isValidPhone(phone)) {
        errors.push(`سطر ${i + 2}: رقم غير صالح "${phone}"`);
        skipped++;
        continue;
      }

      if (email && !isValidEmail(email)) {
        errors.push(`سطر ${i + 2}: إيميل غير صالح "${email}"`);
        skipped++;
        continue;
      }

      const tags = colMap.tags >= 0 ? (parts[colMap.tags] || "").split(";").filter(Boolean) : [];
      const validStages = ["lead", "qualified", "customer", "lost"];
      const rawStage = colMap.stage >= 0 ? parts[colMap.stage] || "" : "";
      const stage = validStages.includes(rawStage) ? rawStage : "lead";

      validRows.push({
        org_id: orgId,
        name: name || null,
        phone,
        email: email || null,
        tags,
        notes: colMap.notes >= 0 ? parts[colMap.notes] || null : null,
        company: colMap.company >= 0 ? parts[colMap.company] || null : null,
        lifecycle_stage: stage,
      });
    }

    // Insert in batches of 50
    for (let i = 0; i < validRows.length; i += 50) {
      const batch = validRows.slice(i, i + 50);
      const { data, error } = await supabase.from("customers").insert(batch).select("id");
      if (!error && data) imported += data.length;
      else if (error) {
        // Fallback: insert one by one for duplicates
        for (const row of batch) {
          const { error: singleErr } = await supabase.from("customers").insert(row);
          if (!singleErr) imported++;
          else skipped++;
        }
      }
    }

    const msg = `تم استيراد ${imported} عميل` + (skipped > 0 ? ` (تم تخطي ${skipped})` : "");
    if (errors.length > 0) {
      toast.warning(msg, { description: errors.slice(0, 3).join("\n") + (errors.length > 3 ? `\n... و${errors.length - 3} أخطاء أخرى` : "") });
    } else {
      toast.success(msg);
    }
    load();
    if (fileRef.current) fileRef.current.value = "";
  };

  const toggleTag = (tag: string) => {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
    }));
  };

  const updateLifecycleStage = async (customerId: string, stage: string) => {
    await supabase.from("customers").update({ lifecycle_stage: stage }).eq("id", customerId);
    toast.success("تم تحديث المرحلة");
    load();
  };

  const filtered = customers.filter((c) => {
    const matchesSearch = (c.name || "").includes(search) || c.phone.includes(search) || (c.email || "").includes(search);
    const matchesStage = stageFilter === "all" || (c.lifecycle_stage || "lead") === stageFilter;
    return matchesSearch && matchesStage;
  });

  // Stage summary counts
  const stageCounts = LIFECYCLE_STAGES.map((s) => ({
    ...s,
    count: customers.filter((c) => (c.lifecycle_stage || "lead") === s.value).length,
  }));

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
          <Button size="sm" className="text-xs gap-1" onClick={() => { setEditCustomer(null); resetForm(); setShowAdd(true); }}>
            <UserPlus className="w-3 h-3" /> إضافة عميل
          </Button>
        </div>
      </div>

      {/* Stage summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {stageCounts.map((s) => (
          <button
            key={s.value}
            onClick={() => setStageFilter(stageFilter === s.value ? "all" : s.value)}
            className={`rounded-lg p-3 text-right transition-all border ${
              stageFilter === s.value ? "ring-2 ring-primary border-primary" : "border-border hover:border-primary/50"
            } bg-card`}
          >
            <div className="flex items-center justify-between">
              <s.icon className="w-4 h-4 text-muted-foreground" />
              <span className="text-lg font-bold">{s.count}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">{s.label}</p>
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="بحث بالاسم أو الرقم..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 text-sm" />
      </div>

      <div className="bg-card rounded-xl shadow-card overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="border-b border-border text-muted-foreground text-[11px]">
              <th className="text-right p-3">الاسم</th>
              <th className="text-right p-3">الجوال</th>
              <th className="text-right p-3">المرحلة</th>
              <th className="text-right p-3 hidden md:table-cell">الإيميل</th>
              <th className="text-right p-3">التصنيفات</th>
              <th className="text-right p-3 w-20">إجراء</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const stage = LIFECYCLE_STAGES.find((s) => s.value === (c.lifecycle_stage || "lead")) || LIFECYCLE_STAGES[0];
              return (
                <tr key={c.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="p-3">
                    <p className="font-medium">{c.name || "بدون اسم"}</p>
                    {c.company && <p className="text-[10px] text-muted-foreground">{c.company}</p>}
                  </td>
                  <td className="p-3 font-mono text-xs" dir="ltr">{c.phone}</td>
                  <td className="p-3">
                    <Select value={c.lifecycle_stage || "lead"} onValueChange={(v) => updateLifecycleStage(c.id, v)}>
                      <SelectTrigger className="h-7 text-[10px] w-24 border-0 p-1">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${stage.color}`}>{stage.label}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {LIFECYCLE_STAGES.map((s) => (
                          <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
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
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-xs">لا يوجد عملاء</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editCustomer ? "تعديل عميل" : "إضافة عميل جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">الاسم</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">رقم الجوال *</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" dir="ltr" placeholder="+966..." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">الإيميل</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" dir="ltr" />
              </div>
              <div>
                <Label className="text-xs">الشركة</Label>
                <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">المرحلة</Label>
                <Select value={form.lifecycle_stage} onValueChange={(v) => setForm({ ...form, lifecycle_stage: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LIFECYCLE_STAGES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">المصدر</Label>
                <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">واتساب</SelectItem>
                    <SelectItem value="website">الموقع</SelectItem>
                    <SelectItem value="referral">إحالة</SelectItem>
                    <SelectItem value="social">سوشيال ميديا</SelectItem>
                    <SelectItem value="manual">يدوي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">ملاحظات</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1 min-h-[60px]" />
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
                {tagDefs.length === 0 && <span className="text-[10px] text-muted-foreground">لم تُنشأ تصنيفات بعد</span>}
              </div>
            </div>

            {/* Custom Fields */}
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">حقول مخصصة</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[10px] h-6 px-2"
                  onClick={() => {
                    const key = prompt("اسم الحقل:");
                    if (key) setCustomFields({ ...customFields, [key]: "" });
                  }}
                >
                  <Plus className="w-3 h-3 ml-1" /> إضافة حقل
                </Button>
              </div>
              {Object.entries(customFields).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-muted-foreground min-w-[60px]">{key}</span>
                  <Input
                    value={value}
                    onChange={(e) => setCustomFields({ ...customFields, [key]: e.target.value })}
                    className="h-7 text-xs flex-1"
                  />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                    const { [key]: _, ...rest } = customFields;
                    setCustomFields(rest);
                  }}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>

            <Button className="w-full" onClick={handleSave}>{editCustomer ? "تحديث" : "إضافة"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomersPage;
