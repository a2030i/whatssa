import { useState, useEffect } from "react";
import { Mail, Save, Loader2, Trash2, Eye, EyeOff, CheckCircle2, AlertTriangle, Plus, Send, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    if (!confirm("هل أنت متأكد من حذف هذا البريد؟")) return;
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

  const openNewForm = () => {
    setForm(DEFAULT_CONFIG);
    setEditId(null);
    setShowForm(true);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-bold text-foreground">البريد الإلكتروني</h2>
        <div className="bg-card rounded-xl border border-border p-6 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-base font-bold text-foreground">البريد الإلكتروني</h2>

      {/* Main email card — same style as WhatsApp card */}
      <div className="bg-card rounded-xl border border-border p-4 flex flex-col items-center text-center gap-2">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Mail className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-bold text-xs">البريد الإلكتروني</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">إرسال واستقبال عبر SMTP / IMAP</p>
        </div>

        {/* Connected email badges */}
        <div className="flex flex-col items-center gap-1.5 w-full">
          {configs.map((config) => (
            <div key={config.id} className="w-full">
              <button
                onClick={() => setExpandedId(expandedId === config.id ? null : config.id)}
                className="w-full flex items-center justify-center gap-1.5"
              >
                <Badge
                  className={`text-[10px] gap-1 px-2 py-0.5 border-0 cursor-pointer ${
                    config.is_active
                      ? "bg-success/10 text-success"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  {config.email_address}
                </Badge>
              </button>

              {/* Expanded details */}
              {expandedId === config.id && (
                <div className="mt-2 p-3 bg-muted/50 rounded-lg text-right space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={config.is_active}
                        onCheckedChange={(v) => handleToggle(config.id, v)}
                      />
                      <span className="text-muted-foreground">{config.is_active ? "مفعّل" : "معطّل"}</span>
                    </div>
                    <span className="text-muted-foreground" dir="ltr">
                      {config.smtp_host}:{config.smtp_port} • {config.encryption.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(config)} className="text-[10px] h-6 px-2 gap-1">
                      <Settings className="w-3 h-3" /> إعدادات
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(config.id)} className="text-[10px] h-6 px-2 text-destructive gap-1">
                      <Trash2 className="w-3 h-3" /> حذف
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}

          <Button size="sm" className="text-[10px] h-8 gap-1 rounded-lg px-4 w-full" onClick={openNewForm}>
            <Plus className="w-3 h-3" /> إضافة بريد
          </Button>
        </div>
      </div>

      {/* Add/Edit Email Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); setEditId(null); setForm(DEFAULT_CONFIG); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" />
              {editId ? "تعديل إعدادات البريد" : "إضافة بريد إلكتروني"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs">عنوان البريد الإلكتروني *</Label>
              <Input
                placeholder="info@example.com"
                value={form.email_address}
                onChange={(e) => setForm({ ...form, email_address: e.target.value })}
                dir="ltr"
              />
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-primary" /> إعدادات الإرسال (SMTP)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px]">المضيف (Host)</Label>
                  <Input
                    placeholder="smtp.gmail.com"
                    value={form.smtp_host}
                    onChange={(e) => setForm({ ...form, smtp_host: e.target.value })}
                    dir="ltr"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]">المنفذ (Port)</Label>
                  <Input
                    type="number"
                    placeholder="465"
                    value={form.smtp_port}
                    onChange={(e) => setForm({ ...form, smtp_port: parseInt(e.target.value) || 465 })}
                    dir="ltr"
                    className="h-9 text-xs"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">اسم المستخدم (Username)</Label>
                <Input
                  placeholder="info@example.com"
                  value={form.smtp_username}
                  onChange={(e) => setForm({ ...form, smtp_username: e.target.value })}
                  dir="ltr"
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">كلمة المرور (Password)</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={form.smtp_password}
                    onChange={(e) => setForm({ ...form, smtp_password: e.target.value })}
                    dir="ltr"
                    className="h-9 text-xs pe-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[9px] text-muted-foreground">
                  لـ Gmail استخدم "كلمة مرور التطبيقات" من إعدادات حساب Google
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">التشفير (Encryption)</Label>
                <Select value={form.encryption} onValueChange={(v) => setForm({ ...form, encryption: v })}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ssl">SSL (منفذ 465)</SelectItem>
                    <SelectItem value="tls">TLS (منفذ 587)</SelectItem>
                    <SelectItem value="none">بدون تشفير</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-primary" /> إعدادات الاستقبال (IMAP) — اختياري
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px]">مضيف IMAP</Label>
                  <Input
                    placeholder="imap.gmail.com"
                    value={form.imap_host || ""}
                    onChange={(e) => setForm({ ...form, imap_host: e.target.value })}
                    dir="ltr"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]">منفذ IMAP</Label>
                  <Input
                    type="number"
                    placeholder="993"
                    value={form.imap_port || 993}
                    onChange={(e) => setForm({ ...form, imap_port: parseInt(e.target.value) || 993 })}
                    dir="ltr"
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              <Label className="text-xs">تفعيل القناة</Label>
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmailConfigSection;
