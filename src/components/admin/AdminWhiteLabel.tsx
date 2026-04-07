import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Globe, Palette, Building2, Users, ExternalLink, Crown, Eye } from "lucide-react";

interface Partner {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  foreground_color: string;
  custom_domain: string | null;
  support_email: string | null;
  support_phone: string | null;
  privacy_policy_url: string | null;
  terms_url: string | null;
  is_default: boolean;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  org_count?: number;
}

const emptyPartner: Omit<Partner, "id" | "created_at" | "org_count"> = {
  name: "",
  slug: "",
  logo_url: null,
  favicon_url: null,
  primary_color: "#7c3aed",
  secondary_color: "#a78bfa",
  accent_color: "#f59e0b",
  background_color: "#ffffff",
  foreground_color: "#1a1a2e",
  custom_domain: null,
  support_email: null,
  support_phone: null,
  privacy_policy_url: null,
  terms_url: null,
  is_default: false,
  is_active: true,
  metadata: {},
};

const AdminWhiteLabel = () => {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [form, setForm] = useState(emptyPartner);
  const [saving, setSaving] = useState(false);
  const [previewPartner, setPreviewPartner] = useState<Partner | null>(null);

  const fetchPartners = async () => {
    setLoading(true);
    const { data: partnersData } = await supabase
      .from("white_label_partners")
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });

    if (partnersData) {
      // Get org counts per partner
      const { data: orgs } = await supabase
        .from("organizations")
        .select("partner_id");

      const counts: Record<string, number> = {};
      orgs?.forEach((o: any) => {
        if (o.partner_id) counts[o.partner_id] = (counts[o.partner_id] || 0) + 1;
      });

      setPartners(
        partnersData.map((p: any) => ({ ...p, org_count: counts[p.id] || 0 }))
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPartners();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyPartner);
    setDialogOpen(true);
  };

  const openEdit = (partner: Partner) => {
    setEditing(partner);
    setForm({
      name: partner.name,
      slug: partner.slug,
      logo_url: partner.logo_url,
      favicon_url: partner.favicon_url,
      primary_color: partner.primary_color,
      secondary_color: partner.secondary_color,
      accent_color: partner.accent_color,
      background_color: partner.background_color,
      foreground_color: partner.foreground_color,
      custom_domain: partner.custom_domain,
      support_email: partner.support_email,
      support_phone: partner.support_phone,
      privacy_policy_url: partner.privacy_policy_url,
      terms_url: partner.terms_url,
      is_default: partner.is_default,
      is_active: partner.is_active,
      metadata: partner.metadata,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.slug) {
      toast.error("الاسم والمعرف (slug) مطلوبان");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        slug: form.slug.toLowerCase().replace(/[^a-z0-9-]/g, ""),
        logo_url: form.logo_url || null,
        favicon_url: form.favicon_url || null,
        primary_color: form.primary_color,
        secondary_color: form.secondary_color,
        accent_color: form.accent_color,
        background_color: form.background_color,
        foreground_color: form.foreground_color,
        custom_domain: form.custom_domain || null,
        support_email: form.support_email || null,
        support_phone: form.support_phone || null,
        privacy_policy_url: form.privacy_policy_url || null,
        terms_url: form.terms_url || null,
        is_active: form.is_active,
      };

      if (editing) {
        const { error } = await supabase
          .from("white_label_partners")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("تم تحديث الشريك بنجاح");
      } else {
        const { error } = await supabase
          .from("white_label_partners")
          .insert(payload);
        if (error) throw error;
        toast.success("تم إضافة الشريك بنجاح");
      }

      setDialogOpen(false);
      fetchPartners();
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (partner: Partner) => {
    if (partner.is_default) {
      toast.error("لا يمكن حذف الشريك الافتراضي");
      return;
    }
    if (!confirm(`هل أنت متأكد من حذف "${partner.name}"؟ سيتم نقل منظماته إلى Respondly.`)) return;

    // Move orgs to default partner first
    const defaultPartner = partners.find((p) => p.is_default);
    if (defaultPartner) {
      await supabase
        .from("organizations")
        .update({ partner_id: defaultPartner.id })
        .eq("partner_id", partner.id);
    }

    const { error } = await supabase
      .from("white_label_partners")
      .delete()
      .eq("id", partner.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("تم حذف الشريك");
      fetchPartners();
    }
  };

  const handleToggleActive = async (partner: Partner) => {
    const { error } = await supabase
      .from("white_label_partners")
      .update({ is_active: !partner.is_active })
      .eq("id", partner.id);
    if (error) {
      toast.error(error.message);
    } else {
      fetchPartners();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">شركاء الوايت ليبل</h2>
          <p className="text-xs text-muted-foreground">
            إدارة المنصات المبنية على Respondly بهوية مخصصة
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1">
          <Plus className="w-3 h-3" /> إضافة شريك
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">جاري التحميل...</div>
      ) : (
        <div className="grid gap-3">
          {partners.map((partner) => (
            <Card key={partner.id} className={!partner.is_active ? "opacity-60" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Color preview */}
                  <div
                    className="w-10 h-10 rounded-lg border flex-shrink-0 flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: partner.primary_color }}
                  >
                    {partner.name.charAt(0)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{partner.name}</span>
                      {partner.is_default && (
                        <Badge variant="secondary" className="text-[10px] gap-0.5">
                          <Crown className="w-2.5 h-2.5" /> افتراضي
                        </Badge>
                      )}
                      {!partner.is_active && (
                        <Badge variant="destructive" className="text-[10px]">معطل</Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-0.5">
                        <Building2 className="w-3 h-3" /> {partner.org_count} منظمة
                      </span>
                      {partner.custom_domain && (
                        <span className="flex items-center gap-0.5">
                          <Globe className="w-3 h-3" /> {partner.custom_domain}
                        </span>
                      )}
                      <span className="flex items-center gap-0.5">
                        <Palette className="w-3 h-3" />
                        <span className="flex gap-0.5">
                          {[partner.primary_color, partner.secondary_color, partner.accent_color].map((c, i) => (
                            <span
                              key={i}
                              className="w-3 h-3 rounded-full border border-border inline-block"
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewPartner(partner)}>
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(partner)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    {!partner.is_default && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(partner)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewPartner} onOpenChange={() => setPreviewPartner(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">معاينة البراند</DialogTitle>
          </DialogHeader>
          {previewPartner && (
            <div className="space-y-3">
              <div
                className="rounded-xl p-4 space-y-3"
                style={{ backgroundColor: previewPartner.background_color, color: previewPartner.foreground_color }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: previewPartner.primary_color }}
                  >
                    {previewPartner.logo_url ? (
                      <img src={previewPartner.logo_url} alt="" className="w-6 h-6 object-contain" />
                    ) : (
                      previewPartner.name.charAt(0)
                    )}
                  </div>
                  <span className="font-bold">{previewPartner.name}</span>
                </div>

                <div className="space-y-2">
                  <button
                    className="w-full rounded-lg py-2 text-sm font-medium text-white"
                    style={{ backgroundColor: previewPartner.primary_color }}
                  >
                    تسجيل الدخول
                  </button>
                  <button
                    className="w-full rounded-lg py-2 text-sm font-medium border"
                    style={{
                      borderColor: previewPartner.secondary_color,
                      color: previewPartner.secondary_color,
                    }}
                  >
                    إنشاء حساب جديد
                  </button>
                </div>

                <div className="flex gap-2 mt-2">
                  {[previewPartner.primary_color, previewPartner.secondary_color, previewPartner.accent_color].map((c, i) => (
                    <div key={i} className="flex-1 text-center">
                      <div className="w-full h-6 rounded" style={{ backgroundColor: c }} />
                      <span className="text-[10px] mt-0.5 block opacity-70">{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {editing ? `تعديل: ${editing.name}` : "إضافة شريك وايت ليبل جديد"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Basic Info */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground">المعلومات الأساسية</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">اسم المنصة *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => {
                      setForm({
                        ...form,
                        name: e.target.value,
                        slug: editing ? form.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-"),
                      });
                    }}
                    placeholder="منصة التواصل"
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">المعرف (Slug) *</Label>
                  <Input
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    placeholder="my-platform"
                    className="h-8 text-xs"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">رابط الشعار (Logo URL)</Label>
                  <Input
                    value={form.logo_url || ""}
                    onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                    placeholder="https://..."
                    className="h-8 text-xs"
                    dir="ltr"
                  />
                </div>
                <div>
                  <Label className="text-xs">رابط الـ Favicon</Label>
                  <Input
                    value={form.favicon_url || ""}
                    onChange={(e) => setForm({ ...form, favicon_url: e.target.value })}
                    placeholder="https://..."
                    className="h-8 text-xs"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">الدومين المخصص</Label>
                <Input
                  value={form.custom_domain || ""}
                  onChange={(e) => setForm({ ...form, custom_domain: e.target.value })}
                  placeholder="app.myplatform.com"
                  className="h-8 text-xs"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Colors */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Palette className="w-3 h-3" /> الألوان
              </h3>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { key: "primary_color", label: "رئيسي" },
                  { key: "secondary_color", label: "ثانوي" },
                  { key: "accent_color", label: "تمييز" },
                  { key: "background_color", label: "خلفية" },
                  { key: "foreground_color", label: "نص" },
                ].map(({ key, label }) => (
                  <div key={key} className="text-center">
                    <label className="cursor-pointer">
                      <input
                        type="color"
                        value={(form as any)[key]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        className="w-full h-8 rounded border cursor-pointer"
                      />
                    </label>
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Support Info */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground">بيانات الدعم</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">بريد الدعم</Label>
                  <Input
                    value={form.support_email || ""}
                    onChange={(e) => setForm({ ...form, support_email: e.target.value })}
                    placeholder="support@..."
                    className="h-8 text-xs"
                    dir="ltr"
                  />
                </div>
                <div>
                  <Label className="text-xs">هاتف الدعم</Label>
                  <Input
                    value={form.support_phone || ""}
                    onChange={(e) => setForm({ ...form, support_phone: e.target.value })}
                    placeholder="+966..."
                    className="h-8 text-xs"
                    dir="ltr"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">سياسة الخصوصية</Label>
                  <Input
                    value={form.privacy_policy_url || ""}
                    onChange={(e) => setForm({ ...form, privacy_policy_url: e.target.value })}
                    placeholder="https://..."
                    className="h-8 text-xs"
                    dir="ltr"
                  />
                </div>
                <div>
                  <Label className="text-xs">الشروط والأحكام</Label>
                  <Input
                    value={form.terms_url || ""}
                    onChange={(e) => setForm({ ...form, terms_url: e.target.value })}
                    placeholder="https://..."
                    className="h-8 text-xs"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <span className="text-xs font-medium">حالة الشريك</span>
                <p className="text-[10px] text-muted-foreground">تعطيل الشريك يمنع الوصول لمنصته</p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? "جاري الحفظ..." : editing ? "حفظ التعديلات" : "إضافة الشريك"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminWhiteLabel;
