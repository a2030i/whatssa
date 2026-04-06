import { useState, useEffect } from "react";
import { Mail, Save, Loader2, Trash2, Eye, EyeOff, CheckCircle2, AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface EmailConfig {
  id: string;
  email_address: string;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  encryption: string;
  imap_host: string | null;
  imap_port: number | null;
  is_active: boolean;
  is_verified: boolean;
}

const DEFAULT_CONFIG: Omit<EmailConfig, "id" | "is_verified"> = {
  email_address: "",
  smtp_host: "smtp.gmail.com",
  smtp_port: 465,
  smtp_username: "",
  smtp_password: "",
  encryption: "ssl",
  imap_host: "imap.gmail.com",
  imap_port: 993,
  is_active: true,
};

const EmailConfigSection = () => {
  const { profile } = useAuth();
  const orgId = profile?.org_id;
  const [configs, setConfigs] = useState<EmailConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState(DEFAULT_CONFIG);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    if (orgId) loadConfigs();
  }, [orgId]);

  const loadConfigs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("email_configs")
      .select("*")
      .eq("org_id", orgId!)
      .order("created_at", { ascending: false });
    setConfigs((data as any[]) || []);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!orgId) return;
    if (!form.email_address || !form.smtp_host || !form.smtp_username || !form.smtp_password) {
      toast.error("يرجى تعبئة جميع الحقول المطلوبة");
      return;
    }

    setSaving(true);
    try {
      if (editId) {
        const { error } = await supabase
          .from("email_configs")
          .update({
            email_address: form.email_address,
            smtp_host: form.smtp_host,
            smtp_port: form.smtp_port,
            smtp_username: form.smtp_username,
            smtp_password: form.smtp_password,
            encryption: form.encryption,
            imap_host: form.imap_host,
            imap_port: form.imap_port,
            is_active: form.is_active,
          })
          .eq("id", editId);
        if (error) throw error;
        toast.success("تم تحديث إعدادات البريد");
      } else {
        const { error } = await supabase
          .from("email_configs")
          .insert({
            org_id: orgId,
            email_address: form.email_address,
            smtp_host: form.smtp_host,
            smtp_port: form.smtp_port,
            smtp_username: form.smtp_username,
            smtp_password: form.smtp_password,
            encryption: form.encryption,
            imap_host: form.imap_host,
            imap_port: form.imap_port,
            is_active: form.is_active,
          });
        if (error) throw error;
        toast.success("تم حفظ إعدادات البريد بنجاح");
      }
      setShowForm(false);
      setEditId(null);
      setForm(DEFAULT_CONFIG);
      loadConfigs();
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ أثناء الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (config: EmailConfig) => {
    setForm({
      email_address: config.email_address,
      smtp_host: config.smtp_host,
      smtp_port: config.smtp_port,
      smtp_username: config.smtp_username,
      smtp_password: config.smtp_password,
      encryption: config.encryption,
      imap_host: config.imap_host,
      imap_port: config.imap_port,
      is_active: config.is_active,
    });
    setEditId(config.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الإيميل؟")) return;
    const { error } = await supabase.from("email_configs").delete().eq("id", id);
    if (error) {
      toast.error("خطأ في الحذف");
    } else {
      toast.success("تم الحذف");
      loadConfigs();
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    await supabase.from("email_configs").update({ is_active: active }).eq("id", id);
    loadConfigs();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">قناة البريد الإلكتروني</h3>
          <Badge variant="outline" className="text-[10px]">قريباً</Badge>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => { setForm(DEFAULT_CONFIG); setEditId(null); setShowForm(true); }} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            إضافة بريد
          </Button>
        )}
      </div>

      {configs.map((config) => (
        <Card key={config.id} className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{config.email_address}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {config.smtp_host}:{config.smtp_port} • {config.encryption.toUpperCase()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {config.is_verified ? (
                  <Badge variant="default" className="bg-success/10 text-success text-[10px] gap-1">
                    <CheckCircle2 className="w-3 h-3" /> متصل
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-warning text-[10px] gap-1">
                    <AlertTriangle className="w-3 h-3" /> غير مفعل
                  </Badge>
                )}
                <Switch
                  checked={config.is_active}
                  onCheckedChange={(v) => handleToggle(config.id, v)}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3 justify-end">
              <Button size="sm" variant="ghost" onClick={() => handleEdit(config)} className="text-xs h-7">
                تعديل
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(config.id)} className="text-xs h-7 text-destructive">
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {editId ? "تعديل إعدادات البريد" : "إعدادات البريد الإلكتروني"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">عنوان البريد الإلكتروني</Label>
              <Input
                placeholder="info@example.com"
                value={form.email_address}
                onChange={(e) => setForm({ ...form, email_address: e.target.value })}
                dir="ltr"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">مضيف SMTP</Label>
                <Input
                  placeholder="smtp.gmail.com"
                  value={form.smtp_host}
                  onChange={(e) => setForm({ ...form, smtp_host: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">المنفذ</Label>
                <Input
                  type="number"
                  placeholder="465"
                  value={form.smtp_port}
                  onChange={(e) => setForm({ ...form, smtp_port: parseInt(e.target.value) || 465 })}
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">اسم المستخدم</Label>
              <Input
                placeholder="info@example.com"
                value={form.smtp_username}
                onChange={(e) => setForm({ ...form, smtp_username: e.target.value })}
                dir="ltr"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">كلمة المرور</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={form.smtp_password}
                  onChange={(e) => setForm({ ...form, smtp_password: e.target.value })}
                  dir="ltr"
                  className="pe-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                لـ Gmail استخدم "كلمة مرور التطبيقات" (App Password) من إعدادات حساب Google
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">التشفير</Label>
              <Select value={form.encryption} onValueChange={(v) => setForm({ ...form, encryption: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ssl">SSL</SelectItem>
                  <SelectItem value="tls">TLS</SelectItem>
                  <SelectItem value="none">بدون تشفير</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border-t pt-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">إعدادات الاستقبال (IMAP) — اختياري</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">مضيف IMAP</Label>
                  <Input
                    placeholder="imap.gmail.com"
                    value={form.imap_host || ""}
                    onChange={(e) => setForm({ ...form, imap_host: e.target.value })}
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">منفذ IMAP</Label>
                  <Input
                    type="number"
                    placeholder="993"
                    value={form.imap_port || 993}
                    onChange={(e) => setForm({ ...form, imap_port: parseInt(e.target.value) || 993 })}
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
                <Label className="text-xs">تفعيل القناة</Label>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1 gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editId ? "تحديث" : "حفظ"}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setShowForm(false); setEditId(null); setForm(DEFAULT_CONFIG); }}
              >
                إلغاء
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {configs.length === 0 && !showForm && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <Mail className="w-10 h-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground mb-1">لم يتم ربط بريد إلكتروني</p>
            <p className="text-[11px] text-muted-foreground/70 mb-4">
              أضف بريدك الإلكتروني لاستقبال رسائل العملاء في صندوق الوارد
            </p>
            <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              إضافة بريد
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EmailConfigSection;
