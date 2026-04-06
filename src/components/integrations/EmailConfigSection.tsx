import { useState, useEffect } from "react";
import { Mail, Save, Loader2, Trash2, Eye, EyeOff, CheckCircle2, Plus, Send, Settings, ExternalLink, Info, Users, User, Zap, XCircle, Clock, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase, invokeCloud } from "@/lib/supabase";
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
  label: string | null;
  dedicated_agent_id: string | null;
  dedicated_team_id: string | null;
  sync_mode: string;
}

interface TeamOption { id: string; name: string; }
interface AgentOption { id: string; full_name: string; }

type ProviderKey = "gmail" | "outlook" | "yahoo" | "zoho" | "custom";

interface ProviderInfo {
  label: string;
  smtp_host: string;
  smtp_port: number;
  imap_host: string;
  imap_port: number;
  encryption: string;
  guide: {
    title: string;
    steps: string[];
    link?: { url: string; label: string };
    note?: string;
  };
}

const PROVIDERS: Record<ProviderKey, ProviderInfo> = {
  gmail: {
    label: "Gmail",
    smtp_host: "smtp.gmail.com",
    smtp_port: 465,
    imap_host: "imap.gmail.com",
    imap_port: 993,
    encryption: "ssl",
    guide: {
      title: "كيف تحصل على كلمة مرور التطبيقات من Gmail؟",
      steps: [
        "افتح حساب Google الخاص بك → الأمان (Security)",
        "فعّل المصادقة الثنائية (2-Step Verification) إذا لم تكن مفعّلة",
        "ارجع لصفحة الأمان → ابحث عن \"كلمات مرور التطبيقات\" (App Passwords)",
        "اختر \"بريد\" (Mail) كتطبيق و \"أخرى\" (Other) كجهاز واكتب \"Respondly\"",
        "اضغط \"إنشاء\" (Generate) — ستظهر لك كلمة مرور من 16 حرف",
        "انسخ كلمة المرور والصقها هنا في حقل كلمة المرور"
      ],
      link: { url: "https://myaccount.google.com/apppasswords", label: "فتح إعدادات كلمات مرور التطبيقات" },
      note: "لا تستخدم كلمة مرور حسابك العادية — استخدم كلمة مرور التطبيقات فقط"
    }
  },
  outlook: {
    label: "Outlook / Hotmail",
    smtp_host: "smtp-mail.outlook.com",
    smtp_port: 587,
    imap_host: "outlook.office365.com",
    imap_port: 993,
    encryption: "tls",
    guide: {
      title: "إعداد Outlook للربط",
      steps: [
        "سجّل دخولك في حساب Microsoft → الأمان (Security)",
        "فعّل المصادقة الثنائية (2FA)",
        "اذهب إلى \"كلمات مرور التطبيقات\" (App Passwords)",
        "أنشئ كلمة مرور جديدة وانسخها هنا",
        "اسم المستخدم هو بريدك الكامل (example@outlook.com)"
      ],
      link: { url: "https://account.microsoft.com/security", label: "فتح إعدادات الأمان" },
    }
  },
  yahoo: {
    label: "Yahoo Mail",
    smtp_host: "smtp.mail.yahoo.com",
    smtp_port: 465,
    imap_host: "imap.mail.yahoo.com",
    imap_port: 993,
    encryption: "ssl",
    guide: {
      title: "إعداد Yahoo Mail للربط",
      steps: [
        "سجّل دخولك في Yahoo → معلومات الحساب → أمان الحساب",
        "فعّل المصادقة الثنائية",
        "اضغط \"إنشاء كلمة مرور تطبيق\" (Generate App Password)",
        "اختر \"بريد\" واكتب \"Respondly\"",
        "انسخ كلمة المرور والصقها هنا"
      ],
      link: { url: "https://login.yahoo.com/account/security", label: "فتح إعدادات الأمان" },
    }
  },
  zoho: {
    label: "Zoho Mail",
    smtp_host: "smtp.zoho.com",
    smtp_port: 465,
    imap_host: "imap.zoho.com",
    imap_port: 993,
    encryption: "ssl",
    guide: {
      title: "إعداد Zoho Mail للربط",
      steps: [
        "سجّل دخولك في Zoho → الإعدادات → البريد → IMAP Access",
        "فعّل الوصول عبر IMAP",
        "أنشئ كلمة مرور تطبيق من إعدادات الأمان",
        "انسخ كلمة المرور والصقها هنا"
      ],
      link: { url: "https://accounts.zoho.com/home#security/security_pwd", label: "فتح إعدادات الأمان" },
    }
  },
  custom: {
    label: "مخصص",
    smtp_host: "",
    smtp_port: 465,
    imap_host: "",
    imap_port: 993,
    encryption: "ssl",
    guide: {
      title: "إعداد مزود مخصص",
      steps: [
        "احصل على بيانات SMTP من مزود البريد الخاص بك",
        "أدخل المضيف (Host) والمنفذ (Port) والتشفير",
        "استخدم بريدك الإلكتروني كاسم مستخدم في الغالب",
        "قد تحتاج لكلمة مرور تطبيق بدلاً من كلمة المرور العادية"
      ],
    }
  },
};

const DEFAULT_PROVIDER: ProviderKey = "gmail";

const EmailConfigSection = () => {
  const { profile, orgId } = useAuth();
  const [configs, setConfigs] = useState<EmailConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderKey>(DEFAULT_PROVIDER);
  const [showGuide, setShowGuide] = useState(true);
  const [form, setForm] = useState({
    email_address: "",
    smtp_host: PROVIDERS.gmail.smtp_host,
    smtp_port: PROVIDERS.gmail.smtp_port,
    smtp_username: "",
    smtp_password: "",
    encryption: PROVIDERS.gmail.encryption,
    imap_host: PROVIDERS.gmail.imap_host,
    imap_port: PROVIDERS.gmail.imap_port,
    is_active: true,
    sync_mode: "new_only" as string,
    label: "" as string,
    dedicated_agent_id: "" as string,
    dedicated_team_id: "" as string,
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string; latency_ms?: number } | null>>({});

  useEffect(() => {
    if (orgId) {
      loadConfigs();
      loadTeamsAndAgents();
    }
  }, [orgId]);

  const loadTeamsAndAgents = async () => {
    const [{ data: t }, { data: a }] = await Promise.all([
      supabase.from("teams").select("id, name").eq("org_id", orgId!),
      supabase.from("profiles").select("id, full_name").eq("org_id", orgId!).eq("is_active", true),
    ]);
    setTeams((t as TeamOption[]) || []);
    setAgents((a as AgentOption[]) || []);
  };

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await invokeCloud("email-config-manage", {
        body: { action: "list", org_id: orgId },
      });
      if (error) throw error;
      setConfigs(res?.data || []);
    } catch (e) {
      console.error("Failed to load email configs:", e);
    }
    setLoading(false);
  };

  const selectProvider = (key: ProviderKey) => {
    setSelectedProvider(key);
    const p = PROVIDERS[key];
    setForm(prev => ({
      ...prev,
      smtp_host: p.smtp_host,
      smtp_port: p.smtp_port,
      imap_host: p.imap_host,
      imap_port: p.imap_port,
      encryption: p.encryption,
    }));
    setShowGuide(true);
  };

  const handleSave = async () => {
    if (!orgId) return;
    if (!form.email_address || !form.smtp_host || !form.smtp_username || !form.smtp_password) {
      toast.error("يرجى تعبئة جميع الحقول المطلوبة");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        email_address: form.email_address,
        smtp_host: form.smtp_host,
        smtp_port: form.smtp_port,
        smtp_username: form.smtp_username,
        smtp_password: form.smtp_password,
        encryption: form.encryption,
        imap_host: form.imap_host,
        imap_port: form.imap_port,
        is_active: form.is_active,
        sync_mode: form.sync_mode,
        label: form.label || null,
        dedicated_agent_id: form.dedicated_agent_id || null,
        dedicated_team_id: form.dedicated_team_id || null,
      };

      if (editId) {
        const { error } = await invokeCloud("email-config-manage", {
          body: { action: "update", id: editId, payload, org_id: orgId },
        });
        if (error) throw error;
        toast.success("تم تحديث إعدادات البريد");
      } else {
        const { data: res, error } = await invokeCloud("email-config-manage", {
          body: { action: "create", payload },
        });
        if (error) throw error;
        if (res?.error) throw new Error(res.error + (res.details ? ` — ${res.details}` : ""));
        toast.success("تم حفظ إعدادات البريد بنجاح");
      }
      closeForm();
      loadConfigs();
    } catch (err: any) {
      console.error("Email config save error:", err);
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
      sync_mode: config.sync_mode || "new_only",
      label: config.label || "",
      dedicated_agent_id: config.dedicated_agent_id || "",
      dedicated_team_id: config.dedicated_team_id || "",
    });
    const detected = (Object.entries(PROVIDERS) as [ProviderKey, ProviderInfo][]).find(
      ([, p]) => p.smtp_host === config.smtp_host
    );
    setSelectedProvider(detected ? detected[0] : "custom");
    setEditId(config.id);
    setShowGuide(false);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا البريد؟")) return;
    const { error } = await invokeCloud("email-config-manage", {
      body: { action: "delete", id },
    });
    if (error) {
      toast.error("خطأ في الحذف");
    } else {
      toast.success("تم الحذف");
      loadConfigs();
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    await invokeCloud("email-config-manage", {
      body: { action: "update", id, payload: { is_active: active } },
    });
    loadConfigs();
  };

  const handleTestConnection = async (configId: string) => {
    setTestingId(configId);
    setTestResult(prev => ({ ...prev, [configId]: null }));
    try {
      const { data, error } = await invokeCloud("email-test-connection", {
        body: { config_id: configId },
      });
      if (error) throw error;
      setTestResult(prev => ({ ...prev, [configId]: data }));
      if (data?.ok) {
        toast.success("✅ الاتصال ناجح!");
        loadConfigs(); // reload to get updated is_verified
      } else {
        toast.error(data?.message || "فشل الاتصال");
      }
    } catch (e: any) {
      setTestResult(prev => ({ ...prev, [configId]: { ok: false, message: e.message || "خطأ غير متوقع" } }));
      toast.error("فشل اختبار الاتصال");
    } finally {
      setTestingId(null);
    }
  };

  const handleFetchEmails = async (configId: string) => {
    setFetchingId(configId);
    try {
      const { data, error } = await invokeCloud("email-fetch-imap", {
        body: { config_id: configId },
      });
      if (error) throw error;
      if (data?.total_fetched > 0) {
        toast.success(`📬 تم جلب ${data.total_fetched} رسالة جديدة`);
      } else {
        toast.info("لا توجد رسائل جديدة");
      }
      if (data?.total_errors > 0) {
        console.warn("[email-fetch] Errors:", data.results);
      }
    } catch (e: any) {
      toast.error(e.message || "فشل جلب الرسائل");
    } finally {
      setFetchingId(null);
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
    setSelectedProvider(DEFAULT_PROVIDER);
    setShowGuide(true);
    const p = PROVIDERS[DEFAULT_PROVIDER];
    setForm({
      email_address: "", smtp_host: p.smtp_host, smtp_port: p.smtp_port,
      smtp_username: "", smtp_password: "", encryption: p.encryption,
      imap_host: p.imap_host, imap_port: p.imap_port, is_active: true, sync_mode: "new_only",
      label: "", dedicated_agent_id: "", dedicated_team_id: "",
    });
  };

  const openNewForm = () => {
    closeForm();
    setShowForm(true);
  };

  const getAgentName = (id: string | null) => {
    if (!id) return null;
    return agents.find(a => a.id === id)?.full_name || null;
  };
  const getTeamName = (id: string | null) => {
    if (!id) return null;
    return teams.find(t => t.id === id)?.name || null;
  };

  const guide = PROVIDERS[selectedProvider].guide;

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

      <div className="bg-card rounded-xl border border-border p-4 flex flex-col items-center text-center gap-2">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Mail className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-bold text-xs">البريد الإلكتروني</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">إرسال واستقبال عبر SMTP / IMAP</p>
        </div>

        {/* Connected emails summary */}
        {configs.length > 0 && (
          <Badge className="text-[10px] gap-1 px-2.5 py-0.5 border-0 bg-primary/10 text-primary">
            <Mail className="w-2.5 h-2.5" />
            بريد متصل ({configs.length})
          </Badge>
        )}

        <div className="flex flex-col items-center gap-1.5 w-full">
          {configs.map((config) => {
            const result = testResult[config.id];
            const agentName = getAgentName(config.dedicated_agent_id);
            const teamName = getTeamName(config.dedicated_team_id);

            return (
              <div key={config.id} className="w-full">
                <button
                  onClick={() => setExpandedId(expandedId === config.id ? null : config.id)}
                  className="w-full flex items-center justify-center gap-1.5"
                >
                  <Badge
                    className={`text-[10px] gap-1 px-2 py-0.5 border-0 cursor-pointer ${
                      config.is_verified
                        ? "bg-success/10 text-success"
                        : config.is_active
                        ? "bg-warning/10 text-warning"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {config.is_verified ? (
                      <CheckCircle2 className="w-2.5 h-2.5" />
                    ) : config.is_active ? (
                      <Clock className="w-2.5 h-2.5" />
                    ) : (
                      <XCircle className="w-2.5 h-2.5" />
                    )}
                    {config.label || config.email_address}
                  </Badge>
                </button>

                {expandedId === config.id && (
                  <div className="mt-2 p-3 bg-muted/50 rounded-lg text-right space-y-2.5">
                    {/* Connection info */}
                    <div className="text-[11px] space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Switch checked={config.is_active} onCheckedChange={(v) => handleToggle(config.id, v)} />
                          <span className="text-muted-foreground">{config.is_active ? "مفعّل" : "معطّل"}</span>
                        </div>
                        <span className="text-muted-foreground" dir="ltr">
                          {config.smtp_host}:{config.smtp_port}
                        </span>
                      </div>

                      {/* Status */}
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">الحالة:</span>
                        <span className={config.is_verified ? "text-success font-medium" : "text-warning font-medium"}>
                          {config.is_verified ? "✅ متصل ومتحقق" : "⏳ بانتظار التحقق"}
                        </span>
                      </div>

                      {/* Sync mode */}
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">المزامنة:</span>
                        <span className="text-foreground">
                          {config.sync_mode === "fetch_recent" ? "قديمة + جديدة" : "الجديدة فقط"}
                        </span>
                      </div>

                      {/* Dedicated agent */}
                      {agentName && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">موظف مخصص:</span>
                          <span className="text-foreground flex items-center gap-1">
                            <User className="w-2.5 h-2.5" /> {agentName}
                          </span>
                        </div>
                      )}

                      {/* Dedicated team */}
                      {teamName && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">فريق مخصص:</span>
                          <span className="text-foreground flex items-center gap-1">
                            <Users className="w-2.5 h-2.5" /> {teamName}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Test result */}
                    {result && (
                      <div className={`rounded-md p-2 text-[10px] ${result.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                        {result.ok ? "✅" : "❌"} {result.message}
                        {result.latency_ms != null && result.ok && (
                          <span className="text-muted-foreground mr-1">({result.latency_ms}ms)</span>
                        )}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2 justify-end flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTestConnection(config.id)}
                        disabled={testingId === config.id}
                        className="text-[10px] h-7 px-2.5 gap-1"
                      >
                        {testingId === config.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Zap className="w-3 h-3" />
                        )}
                        اختبار الاتصال
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleFetchEmails(config.id)}
                        disabled={fetchingId === config.id || !config.imap_host}
                        className="text-[10px] h-7 px-2.5 gap-1"
                        title={!config.imap_host ? "IMAP غير مهيأ" : "جلب الرسائل الواردة"}
                      >
                        {fetchingId === config.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3" />
                        )}
                        جلب الوارد
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(config)} className="text-[10px] h-7 px-2 gap-1">
                        <Settings className="w-3 h-3" /> إعدادات
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(config.id)} className="text-[10px] h-7 px-2 text-destructive gap-1">
                        <Trash2 className="w-3 h-3" /> حذف
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <Button size="sm" className="text-[10px] h-8 gap-1 rounded-lg px-4 w-full" onClick={openNewForm}>
            <Plus className="w-3 h-3" /> إضافة بريد
          </Button>
        </div>
      </div>

      {/* Add/Edit Email Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) closeForm(); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" />
              {editId ? "تعديل إعدادات البريد" : "إضافة بريد إلكتروني"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Provider Selector */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">اختر مزود الخدمة</Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.entries(PROVIDERS) as [ProviderKey, ProviderInfo][]).map(([key, provider]) => (
                  <button
                    key={key}
                    onClick={() => selectProvider(key)}
                    className={`rounded-lg border-2 p-2.5 text-center transition-all text-[11px] font-medium ${
                      selectedProvider === key
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:border-primary/40 text-foreground"
                    }`}
                  >
                    {provider.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Setup Guide */}
            {showGuide && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-xs font-semibold text-primary">{guide.title}</p>
                </div>
                <ol className="text-[11px] text-foreground/80 space-y-1.5 list-decimal list-inside pr-1">
                  {guide.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                {guide.note && (
                  <p className="text-[10px] text-destructive font-medium mt-1">⚠️ {guide.note}</p>
                )}
                {guide.link && (
                  <a
                    href={guide.link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {guide.link.label}
                  </a>
                )}
                <button onClick={() => setShowGuide(false)} className="block text-[10px] text-muted-foreground hover:text-foreground mt-1">
                  إخفاء الدليل ▲
                </button>
              </div>
            )}
            {!showGuide && (
              <button onClick={() => setShowGuide(true)} className="text-[10px] text-primary hover:underline flex items-center gap-1">
                <Info className="w-3 h-3" /> عرض دليل الإعداد
              </button>
            )}

            {/* Email Address */}
            <div className="space-y-2">
              <Label className="text-xs">عنوان البريد الإلكتروني *</Label>
              <Input
                placeholder="info@example.com"
                value={form.email_address}
                onChange={(e) => setForm({ ...form, email_address: e.target.value })}
                dir="ltr"
              />
            </div>

            {/* SMTP Settings */}
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
                    readOnly={selectedProvider !== "custom"}
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
                    readOnly={selectedProvider !== "custom"}
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
                <Label className="text-[11px]">كلمة المرور (App Password)</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="كلمة مرور التطبيقات"
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

            {/* IMAP Settings */}
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
                    readOnly={selectedProvider !== "custom"}
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
                    readOnly={selectedProvider !== "custom"}
                  />
                </div>
              </div>
            </div>

            {/* Sync Mode */}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-xs font-semibold">عند الربط، استقبال الرسائل:</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setForm({ ...form, sync_mode: "new_only" })}
                  className={`rounded-lg border-2 p-2.5 text-center transition-all ${
                    form.sync_mode === "new_only"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <p className="text-[11px] font-semibold">الجديدة فقط</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">بعد الربط فقط</p>
                </button>
                <button
                  onClick={() => setForm({ ...form, sync_mode: "fetch_recent" })}
                  className={`rounded-lg border-2 p-2.5 text-center transition-all ${
                    form.sync_mode === "fetch_recent"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <p className="text-[11px] font-semibold">قديمة + جديدة</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">آخر 100 رسالة + الجديدة</p>
                </button>
              </div>
            </div>

            {/* Channel Settings (Label + Routing) */}
            <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5 text-primary" /> إعدادات القناة
              </p>
              <div className="space-y-1.5">
                <Label className="text-[11px]">اسم القناة (اختياري)</Label>
                <Input
                  placeholder="مثلاً: بريد المبيعات"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] flex items-center gap-1"><User className="w-3 h-3" /> موظف مخصص</Label>
                <Select value={form.dedicated_agent_id} onValueChange={(v) => setForm({ ...form, dedicated_agent_id: v === "_none" ? "" : v })}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="بدون — توزيع تلقائي" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">بدون — توزيع تلقائي</SelectItem>
                    {agents.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.full_name || "بدون اسم"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] flex items-center gap-1"><Users className="w-3 h-3" /> فريق مخصص</Label>
                <Select value={form.dedicated_team_id} onValueChange={(v) => setForm({ ...form, dedicated_team_id: v === "_none" ? "" : v })}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="بدون — كل الفرق" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">بدون — كل الفرق</SelectItem>
                    {teams.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-2 pt-1">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label className="text-xs">تفعيل القناة</Label>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1 gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editId ? "تحديث" : "حفظ"}
              </Button>
              <Button variant="outline" onClick={closeForm}>
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
