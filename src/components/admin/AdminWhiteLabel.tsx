import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Globe, Palette, Building2, Eye, Crown, CheckCircle2, AlertCircle, Clock, RefreshCw, Copy, ExternalLink } from "lucide-react";

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
  domain_status: string;
  domain_verify_token: string | null;
  domain_verified_at: string | null;
  domain_last_check_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  org_count?: number;
}

const emptyPartner = {
  name: "",
  slug: "",
  logo_url: null as string | null,
  favicon_url: null as string | null,
  primary_color: "#7c3aed",
  secondary_color: "#a78bfa",
  accent_color: "#f59e0b",
  background_color: "#ffffff",
  foreground_color: "#1a1a2e",
  custom_domain: null as string | null,
  support_email: null as string | null,
  support_phone: null as string | null,
  privacy_policy_url: null as string | null,
  terms_url: null as string | null,
  is_default: false,
  is_active: true,
  metadata: {},
};

const PLATFORM_IP = "185.158.133.1";

const DomainStatusBadge = ({ status }: { status: string }) => {
  switch (status) {
    case "verified":
      return <Badge variant="default" className="text-[10px] gap-0.5 bg-green-600"><CheckCircle2 className="w-2.5 h-2.5" /> متصل</Badge>;
    case "pending":
      return <Badge variant="secondary" className="text-[10px] gap-0.5 bg-amber-500 text-white"><Clock className="w-2.5 h-2.5" /> قيد التحقق</Badge>;
    case "failed":
      return <Badge variant="destructive" className="text-[10px] gap-0.5"><AlertCircle className="w-2.5 h-2.5" /> فشل</Badge>;
    default:
      return null;
  }
};

const AdminWhiteLabel = () => {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [form, setForm] = useState(emptyPartner);
  const [saving, setSaving] = useState(false);
  const [previewPartner, setPreviewPartner] = useState<Partner | null>(null);
  const [domainDialogPartner, setDomainDialogPartner] = useState<Partner | null>(null);
  const [checkingDomain, setCheckingDomain] = useState(false);

  const fetchPartners = async () => {
    setLoading(true);
    const { data: partnersData } = await supabase
      .from("white_label_partners")
      .select("*")
      .order("created_at", { ascending: true });

    if (partnersData) {
      const { data: orgs } = await supabase.from("organizations").select("partner_id");
      const counts: Record<string, number> = {};
      orgs?.forEach((o: any) => {
        if (o.partner_id) counts[o.partner_id] = (counts[o.partner_id] || 0) + 1;
      });
      setPartners(partnersData.map((p: any) => ({ ...p, org_count: counts[p.id] || 0 })));
    }
    setLoading(false);
  };

  useEffect(() => { fetchPartners(); }, []);

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
      const payload: any = {
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

      // If domain changed, reset verification
      if (editing && form.custom_domain !== editing.custom_domain) {
        if (form.custom_domain) {
          payload.domain_status = "pending";
          payload.domain_verify_token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
          payload.domain_verified_at = null;
        } else {
          payload.domain_status = "not_configured";
          payload.domain_verify_token = null;
          payload.domain_verified_at = null;
        }
      }

      if (editing) {
        const { error } = await supabase.from("white_label_partners").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("تم تحديث الشريك بنجاح");
      } else {
        // For new partners with domain, set pending
        if (form.custom_domain) {
          payload.domain_status = "pending";
          payload.domain_verify_token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
        }
        const { error } = await supabase.from("white_label_partners").insert(payload);
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
    if (!confirm(`هل أنت متأكد من حذف "${partner.name}"؟`)) return;
    const { error } = await supabase.from("white_label_partners").delete().eq("id", partner.id);
    if (error) toast.error(error.message);
    else { toast.success("تم حذف الشريك"); fetchPartners(); }
  };

  const handleCheckDomain = async (partner: Partner) => {
    if (!partner.custom_domain || !partner.domain_verify_token) return;
    setCheckingDomain(true);
    try {
      // Use DNS-over-HTTPS to check TXT record
      const domain = partner.custom_domain;
      const res = await fetch(`https://dns.google/resolve?name=_respondly.${domain}&type=TXT`);
      const data = await res.json();
      
      let verified = false;
      if (data.Answer) {
        for (const ans of data.Answer) {
          const txt = (ans.data || "").replace(/"/g, "");
          if (txt.includes(partner.domain_verify_token)) {
            verified = true;
            break;
          }
        }
      }

      // Also check A record
      const aRes = await fetch(`https://dns.google/resolve?name=${domain}&type=A`);
      const aData = await aRes.json();
      let aPointsCorrectly = false;
      if (aData.Answer) {
        aPointsCorrectly = aData.Answer.some((a: any) => a.data === PLATFORM_IP);
      }

      const newStatus = verified && aPointsCorrectly ? "verified" : verified ? "pending" : "failed";
      
      await supabase.from("white_label_partners").update({
        domain_status: newStatus,
        domain_verified_at: newStatus === "verified" ? new Date().toISOString() : null,
        domain_last_check_at: new Date().toISOString(),
      }).eq("id", partner.id);

      if (newStatus === "verified") {
        toast.success("تم التحقق من الدومين بنجاح! ✅");
      } else if (verified && !aPointsCorrectly) {
        toast.warning("تم التحقق من TXT ولكن سجل A غير موجه بعد");
      } else {
        toast.error("لم يتم العثور على سجل التحقق في DNS");
      }
      
      fetchPartners();
      // Update dialog partner
      setDomainDialogPartner(prev => prev ? { ...prev, domain_status: newStatus, domain_last_check_at: new Date().toISOString() } : null);
    } catch {
      toast.error("خطأ في التحقق من DNS");
    } finally {
      setCheckingDomain(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("تم النسخ");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">شركاء الوايت ليبل</h2>
          <p className="text-xs text-muted-foreground">إدارة المنصات المبنية على Respondly بهوية مخصصة</p>
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
                  <div
                    className="w-10 h-10 rounded-lg border flex-shrink-0 flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: partner.primary_color }}
                  >
                    {partner.logo_url ? (
                      <img src={partner.logo_url} alt="" className="w-7 h-7 object-contain rounded" />
                    ) : partner.name.charAt(0)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-sm">{partner.name}</span>
                      {!partner.is_active && <Badge variant="destructive" className="text-[10px]">معطل</Badge>}
                      {partner.custom_domain && <DomainStatusBadge status={partner.domain_status} />}
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
                            <span key={i} className="w-3 h-3 rounded-full border border-border inline-block" style={{ backgroundColor: c }} />
                          ))}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {partner.custom_domain && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDomainDialogPartner(partner)} title="إعدادات الدومين">
                        <Globe className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewPartner(partner)}>
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(partner)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(partner)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Domain Setup Dialog */}
      <Dialog open={!!domainDialogPartner} onOpenChange={() => setDomainDialogPartner(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Globe className="w-4 h-4" /> إعداد الدومين — {domainDialogPartner?.name}
            </DialogTitle>
          </DialogHeader>
          {domainDialogPartner && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{domainDialogPartner.custom_domain}</span>
                <DomainStatusBadge status={domainDialogPartner.domain_status} />
              </div>

              {/* DNS Instructions */}
              <div className="space-y-3 bg-muted/50 rounded-lg p-3">
                <h4 className="text-xs font-semibold">سجلات DNS المطلوبة:</h4>
                
                {/* A Record */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium">سجل A (للدومين الرئيسي)</span>
                    <Button variant="ghost" size="sm" className="h-5 text-[10px] gap-0.5 px-1.5" onClick={() => copyToClipboard(PLATFORM_IP)}>
                      <Copy className="w-2.5 h-2.5" /> نسخ
                    </Button>
                  </div>
                  <div className="bg-card rounded border p-2 text-[11px] font-mono" dir="ltr">
                    <div>Type: <span className="text-primary font-semibold">A</span></div>
                    <div>Name: <span className="text-primary font-semibold">@</span></div>
                    <div>Value: <span className="text-primary font-semibold">{PLATFORM_IP}</span></div>
                  </div>
                </div>

                {/* TXT Record */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium">سجل TXT (للتحقق)</span>
                    <Button variant="ghost" size="sm" className="h-5 text-[10px] gap-0.5 px-1.5" onClick={() => copyToClipboard(domainDialogPartner.domain_verify_token || "")}>
                      <Copy className="w-2.5 h-2.5" /> نسخ
                    </Button>
                  </div>
                  <div className="bg-card rounded border p-2 text-[11px] font-mono" dir="ltr">
                    <div>Type: <span className="text-primary font-semibold">TXT</span></div>
                    <div>Name: <span className="text-primary font-semibold">_respondly</span></div>
                    <div>Value: <span className="text-primary font-semibold break-all">{domainDialogPartner.domain_verify_token}</span></div>
                  </div>
                </div>
              </div>

              {domainDialogPartner.domain_last_check_at && (
                <p className="text-[10px] text-muted-foreground">
                  آخر فحص: {new Date(domainDialogPartner.domain_last_check_at).toLocaleString("ar-SA")}
                </p>
              )}

              <Button 
                onClick={() => handleCheckDomain(domainDialogPartner)} 
                disabled={checkingDomain} 
                className="w-full gap-1"
                variant={domainDialogPartner.domain_status === "verified" ? "outline" : "default"}
              >
                <RefreshCw className={`w-3 h-3 ${checkingDomain ? "animate-spin" : ""}`} />
                {checkingDomain ? "جاري التحقق..." : "تحقق من DNS الآن"}
              </Button>

              {domainDialogPartner.domain_status === "verified" && (
                <div className="flex items-center gap-2 bg-green-50 dark:bg-green-950/30 rounded-lg p-3 text-green-700 dark:text-green-400">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs">الدومين متصل وجاهز للاستخدام</span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewPartner} onOpenChange={() => setPreviewPartner(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">معاينة البراند</DialogTitle>
          </DialogHeader>
          {previewPartner && (
            <div className="space-y-3">
              <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: previewPartner.background_color, color: previewPartner.foreground_color }}>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: previewPartner.primary_color }}>
                    {previewPartner.logo_url ? <img src={previewPartner.logo_url} alt="" className="w-6 h-6 object-contain" /> : previewPartner.name.charAt(0)}
                  </div>
                  <span className="font-bold">{previewPartner.name}</span>
                </div>
                <div className="space-y-2">
                  <button className="w-full rounded-lg py-2 text-sm font-medium text-white" style={{ backgroundColor: previewPartner.primary_color }}>تسجيل الدخول</button>
                  <button className="w-full rounded-lg py-2 text-sm font-medium border" style={{ borderColor: previewPartner.secondary_color, color: previewPartner.secondary_color }}>إنشاء حساب جديد</button>
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
            <DialogTitle className="text-sm">{editing ? `تعديل: ${editing.name}` : "إضافة شريك وايت ليبل جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground">المعلومات الأساسية</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">اسم المنصة *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: editing ? form.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-") })} placeholder="منصة التواصل" className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">المعرف (Slug) *</Label>
                  <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="my-platform" className="h-8 text-xs" dir="ltr" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">رابط الشعار (Logo URL)</Label>
                  <Input value={form.logo_url || ""} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://..." className="h-8 text-xs" dir="ltr" />
                </div>
                <div>
                  <Label className="text-xs">رابط الـ Favicon</Label>
                  <Input value={form.favicon_url || ""} onChange={(e) => setForm({ ...form, favicon_url: e.target.value })} placeholder="https://..." className="h-8 text-xs" dir="ltr" />
                </div>
              </div>
              <div>
                <Label className="text-xs">الدومين المخصص</Label>
                <Input value={form.custom_domain || ""} onChange={(e) => setForm({ ...form, custom_domain: e.target.value })} placeholder="app.myplatform.com" className="h-8 text-xs" dir="ltr" />
                <p className="text-[10px] text-muted-foreground mt-0.5">بعد الحفظ، ستحتاج لإعداد سجلات DNS</p>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><Palette className="w-3 h-3" /> الألوان</h3>
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
                      <input type="color" value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="w-full h-8 rounded border cursor-pointer" />
                    </label>
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground">بيانات الدعم</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">بريد الدعم</Label>
                  <Input value={form.support_email || ""} onChange={(e) => setForm({ ...form, support_email: e.target.value })} placeholder="support@..." className="h-8 text-xs" dir="ltr" />
                </div>
                <div>
                  <Label className="text-xs">هاتف الدعم</Label>
                  <Input value={form.support_phone || ""} onChange={(e) => setForm({ ...form, support_phone: e.target.value })} placeholder="+966..." className="h-8 text-xs" dir="ltr" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">سياسة الخصوصية</Label>
                  <Input value={form.privacy_policy_url || ""} onChange={(e) => setForm({ ...form, privacy_policy_url: e.target.value })} placeholder="https://..." className="h-8 text-xs" dir="ltr" />
                </div>
                <div>
                  <Label className="text-xs">الشروط والأحكام</Label>
                  <Input value={form.terms_url || ""} onChange={(e) => setForm({ ...form, terms_url: e.target.value })} placeholder="https://..." className="h-8 text-xs" dir="ltr" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <span className="text-xs font-medium">حالة الشريك</span>
                <p className="text-[10px] text-muted-foreground">تعطيل الشريك يمنع الوصول لمنصته</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
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
