import { useState, useEffect } from "react";
import { Building2, Bell, CreditCard, Shield, ChevronLeft, Hand, RotateCcw, Scale, Target, Save, Zap, Code2, Clock, Star, Moon, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import ApiTokensSection from "@/components/settings/ApiTokensSection";
import usePushNotifications from "@/hooks/usePushNotifications";

const PushNotificationSettings = () => {
  const { isSupported, isSubscribed, subscribe, unsubscribe } = usePushNotifications();

  if (!isSupported) return null;

  return (
    <div className="bg-card rounded-lg shadow-card">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BellRing className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">إشعارات المتصفح</h3>
        </div>
        <Switch checked={isSubscribed} onCheckedChange={(v) => v ? subscribe() : unsubscribe()} />
      </div>
      <div className="p-5">
        <p className="text-xs text-muted-foreground">
          {isSubscribed
            ? "✅ الإشعارات مفعلة — ستصلك تنبيهات عند وصول رسائل جديدة حتى لو كانت الصفحة مغلقة"
            : "فعّل الإشعارات لتلقي تنبيهات فورية عند وصول رسائل جديدة من العملاء"}
        </p>
      </div>
    </div>
  );
};

const strategyOptions = [
  { key: "manual", label: "يدوي", icon: Hand, description: "المدير يسند المحادثات يدوياً لكل موظف", color: "text-muted-foreground" },
  { key: "round_robin", label: "بالدور (Round Robin)", icon: RotateCcw, description: "توزيع بالتناوب على الموظفين المتاحين", color: "text-primary" },
  { key: "least_busy", label: "الأقل ضغطاً (Load Balancing)", icon: Scale, description: "يُسند للموظف ذو أقل محادثات مفتوحة", color: "text-success" },
  { key: "skill_based", label: "حسب المهارة / الفريق", icon: Target, description: "توجيه بناءً على كلمات مفتاحية لكل فريق", color: "text-warning" },
];

const dayLabels = [
  { value: 0, label: "أحد" },
  { value: 1, label: "إثنين" },
  { value: 2, label: "ثلاثاء" },
  { value: 3, label: "أربعاء" },
  { value: 4, label: "خميس" },
  { value: 5, label: "جمعة" },
  { value: 6, label: "سبت" },
];

const SettingsPage = () => {
  const { orgId, profile } = useAuth();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState(profile?.full_name || "");
  const [companyPhone, setCompanyPhone] = useState(profile?.phone || "");

  // Assignment settings
  const [defaultStrategy, setDefaultStrategy] = useState("round_robin");
  const [defaultMaxConv, setDefaultMaxConv] = useState("");
  const [loadingAssign, setLoadingAssign] = useState(true);
  const [savingAssign, setSavingAssign] = useState(false);

  // Out-of-hours settings
  const [oohEnabled, setOohEnabled] = useState(false);
  const [oohMessage, setOohMessage] = useState("شكراً لتواصلك معنا 🙏\nنحن حالياً خارج أوقات العمل وسنرد عليك في أقرب وقت ممكن خلال ساعات الدوام.");
  const [oohWorkStart, setOohWorkStart] = useState("09:00");
  const [oohWorkEnd, setOohWorkEnd] = useState("17:00");
  const [oohWorkDays, setOohWorkDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [savingOoh, setSavingOoh] = useState(false);

  // Satisfaction survey settings
  const [satEnabled, setSatEnabled] = useState(false);
  const [satMessage, setSatMessage] = useState("شكراً لتواصلك معنا! 🌟\nنود معرفة رأيك في الخدمة:\n\n1. ممتاز ⭐⭐⭐⭐⭐\n2. جيد جداً ⭐⭐⭐⭐\n3. جيد ⭐⭐⭐\n4. مقبول ⭐⭐\n5. ضعيف ⭐");
  const [savingSat, setSavingSat] = useState(false);

  useEffect(() => {
    if (orgId) loadAllSettings();
  }, [orgId]);

  const loadAllSettings = async () => {
    setLoadingAssign(true);
    const { data } = await supabase
      .from("organizations")
      .select("default_assignment_strategy, default_max_conversations, settings")
      .eq("id", orgId)
      .single();
    if (data) {
      setDefaultStrategy(data.default_assignment_strategy || "round_robin");
      setDefaultMaxConv(data.default_max_conversations ? String(data.default_max_conversations) : "");
      
      const settings = (data.settings as Record<string, any>) || {};
      // Out-of-hours
      setOohEnabled(settings.out_of_hours_enabled || false);
      if (settings.out_of_hours_message) setOohMessage(settings.out_of_hours_message);
      if (settings.work_start) setOohWorkStart(settings.work_start);
      if (settings.work_end) setOohWorkEnd(settings.work_end);
      if (Array.isArray(settings.work_days)) setOohWorkDays(settings.work_days);
      // Satisfaction
      setSatEnabled(settings.satisfaction_enabled || false);
      if (settings.satisfaction_message) setSatMessage(settings.satisfaction_message);
    }
    setLoadingAssign(false);
  };

  const saveAssignSettings = async () => {
    setSavingAssign(true);
    await supabase.from("organizations").update({
      default_assignment_strategy: defaultStrategy,
      default_max_conversations: defaultMaxConv ? parseInt(defaultMaxConv) : null,
    }).eq("id", orgId);
    toast.success("تم حفظ إعدادات الإسناد الافتراضية");
    setSavingAssign(false);
  };

  const saveCompanyInfo = async () => {
    if (!orgId) return;
    await supabase.from("organizations").update({ name: companyName }).eq("id", orgId);
    toast.success("تم حفظ البيانات");
  };

  const saveOohSettings = async () => {
    setSavingOoh(true);
    const { data: org } = await supabase.from("organizations").select("settings").eq("id", orgId).single();
    const currentSettings = (org?.settings as Record<string, any>) || {};
    await supabase.from("organizations").update({
      settings: {
        ...currentSettings,
        out_of_hours_enabled: oohEnabled,
        out_of_hours_message: oohMessage,
        work_start: oohWorkStart,
        work_end: oohWorkEnd,
        work_days: oohWorkDays,
      },
    }).eq("id", orgId);
    toast.success("تم حفظ إعدادات الرسالة خارج الدوام");
    setSavingOoh(false);
  };

  const saveSatSettings = async () => {
    setSavingSat(true);
    const { data: org } = await supabase.from("organizations").select("settings").eq("id", orgId).single();
    const currentSettings = (org?.settings as Record<string, any>) || {};
    await supabase.from("organizations").update({
      settings: {
        ...currentSettings,
        satisfaction_enabled: satEnabled,
        satisfaction_message: satMessage,
      },
    }).eq("id", orgId);
    toast.success("تم حفظ إعدادات استبيان الرضا");
    setSavingSat(false);
  };

  const toggleOohDay = (day: number) => {
    setOohWorkDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort());
  };

  return (
    <div className="p-3 md:p-6 space-y-6 max-w-[800px]" dir="rtl">
      <div>
        <h1 className="text-xl font-bold">الإعدادات</h1>
        <p className="text-sm text-muted-foreground mt-1">إدارة إعدادات حسابك والنظام</p>
      </div>

      {/* Company Info */}
      <div className="bg-card rounded-lg shadow-card">
        <div className="p-5 border-b border-border flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">بيانات الشركة</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">اسم الشركة</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="bg-secondary border-0" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">رقم الهاتف</Label>
              <Input value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} className="bg-secondary border-0" dir="ltr" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveCompanyInfo}>حفظ</Button>
          </div>
        </div>
      </div>

      {/* Out-of-Hours Message */}
      <div className="bg-card rounded-lg shadow-card">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Moon className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">رسالة خارج أوقات العمل</h3>
          </div>
          <Switch checked={oohEnabled} onCheckedChange={setOohEnabled} />
        </div>
        {oohEnabled && (
          <div className="p-5 space-y-4">
            <p className="text-xs text-muted-foreground">
              عند تفعيل هذه الميزة، سيتم إرسال رسالة تلقائية للعملاء الذين يتواصلون خارج أوقات الدوام المحددة.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">بداية الدوام</Label>
                <Input type="time" value={oohWorkStart} onChange={(e) => setOohWorkStart(e.target.value)} className="bg-secondary border-0" dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">نهاية الدوام</Label>
                <Input type="time" value={oohWorkEnd} onChange={(e) => setOohWorkEnd(e.target.value)} className="bg-secondary border-0" dir="ltr" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">أيام العمل</Label>
              <div className="flex flex-wrap gap-2">
                {dayLabels.map(day => (
                  <button
                    key={day.value}
                    onClick={() => toggleOohDay(day.value)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                      oohWorkDays.includes(day.value)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-muted-foreground border-border hover:border-primary/30"
                    )}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">نص الرسالة</Label>
              <Textarea
                value={oohMessage}
                onChange={(e) => setOohMessage(e.target.value)}
                className="bg-secondary border-0 min-h-[80px] text-sm"
                placeholder="اكتب رسالة خارج الدوام..."
              />
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={saveOohSettings} disabled={savingOoh} className="gap-1.5">
                <Save className="w-3.5 h-3.5" />
                {savingOoh ? "جاري الحفظ..." : "حفظ"}
              </Button>
            </div>
          </div>
        )}
        {!oohEnabled && (
          <div className="p-5">
            <p className="text-xs text-muted-foreground">الميزة معطلة حالياً. فعّلها لإرسال رسالة تلقائية خارج الدوام.</p>
            <div className="flex justify-end mt-3">
              <Button size="sm" onClick={saveOohSettings} disabled={savingOoh} variant="outline" className="gap-1.5">
                <Save className="w-3.5 h-3.5" />
                حفظ
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Satisfaction Survey */}
      <div className="bg-card rounded-lg shadow-card">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">استبيان رضا العملاء</h3>
          </div>
          <Switch checked={satEnabled} onCheckedChange={setSatEnabled} />
        </div>
        {satEnabled && (
          <div className="p-5 space-y-4">
            <p className="text-xs text-muted-foreground">
              عند تفعيل هذه الميزة، سيتم إرسال رسالة تقييم للعميل تلقائياً بعد إغلاق المحادثة. يمكن للعميل الرد برقم من 1 إلى 5 ويتم تسجيل التقييم وربطه بالموظف المسؤول. النتائج تظهر في تقارير الأداء.
            </p>

            <div className="space-y-2">
              <Label className="text-xs">نص رسالة التقييم</Label>
              <Textarea
                value={satMessage}
                onChange={(e) => setSatMessage(e.target.value)}
                className="bg-secondary border-0 min-h-[120px] text-sm"
                placeholder="اكتب رسالة التقييم..."
              />
            </div>

            <div className="bg-primary/5 rounded-xl p-3 space-y-1.5">
              <p className="text-xs font-semibold text-primary">كيف يعمل؟</p>
              <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside">
                <li>بعد إغلاق المحادثة يُرسل الاستبيان تلقائياً للعميل</li>
                <li>العميل يرد برقم من 1 (ممتاز) إلى 5 (ضعيف)</li>
                <li>يتم ربط التقييم بالموظف الذي أغلق أو كان مسؤولاً عن المحادثة</li>
                <li>تظهر النتائج في صفحة التقارير → تبويب "التقييمات"</li>
              </ul>
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={saveSatSettings} disabled={savingSat} className="gap-1.5">
                <Save className="w-3.5 h-3.5" />
                {savingSat ? "جاري الحفظ..." : "حفظ"}
              </Button>
            </div>
          </div>
        )}
        {!satEnabled && (
          <div className="p-5">
            <p className="text-xs text-muted-foreground">الميزة معطلة حالياً. فعّلها لإرسال استبيان تقييم تلقائي بعد إغلاق المحادثة.</p>
            <div className="flex justify-end mt-3">
              <Button size="sm" onClick={saveSatSettings} disabled={savingSat} variant="outline" className="gap-1.5">
                <Save className="w-3.5 h-3.5" />
                حفظ
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Assignment Strategy */}
      <div className="bg-card rounded-lg shadow-card">
        <div className="p-5 border-b border-border flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">استراتيجية الإسناد الافتراضية</h3>
        </div>
        <div className="p-5 space-y-5">
          <p className="text-xs text-muted-foreground">
            تُطبق هذه الاستراتيجية على الفرق التي لم يتم تعيين إعداد خاص لها. يمكنك تخصيص كل فريق بشكل مستقل من صفحة الفريق.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {strategyOptions.map((opt) => {
              const Icon = opt.icon;
              const isSelected = defaultStrategy === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setDefaultStrategy(opt.key)}
                  className={cn(
                    "p-4 rounded-xl border text-right transition-all",
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                      : "border-border bg-secondary/30 hover:border-primary/30"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon className={cn("w-4 h-4", isSelected ? opt.color : "text-muted-foreground")} />
                    <span className={cn("text-sm font-semibold", isSelected ? "text-foreground" : "text-muted-foreground")}>
                      {opt.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{opt.description}</p>
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold">الحد الأقصى للمحادثات المفتوحة لكل موظف</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min="1"
                max="100"
                value={defaultMaxConv}
                onChange={(e) => setDefaultMaxConv(e.target.value)}
                placeholder="بدون حد"
                className="bg-secondary border-0 text-sm w-32"
              />
              <span className="text-[11px] text-muted-foreground">
                {defaultMaxConv ? `عند وصول الموظف لـ ${defaultMaxConv} محادثة لن يُسند له جديد` : "بدون حد أقصى — التوزيع مستمر"}
              </span>
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={saveAssignSettings} disabled={savingAssign || loadingAssign} className="gap-1.5">
              <Save className="w-3.5 h-3.5" />
              {savingAssign ? "جاري الحفظ..." : "حفظ الإعدادات"}
            </Button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-card rounded-lg shadow-card">
        <div className="p-5 border-b border-border flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">الإشعارات</h3>
        </div>
        <div className="p-5 space-y-4">
          {[
            { label: "محادثة جديدة", desc: "إشعار عند وصول محادثة جديدة" },
            { label: "محادثة متأخرة", desc: "تنبيه عند تأخر الرد" },
            { label: "تقرير يومي", desc: "ملخص يومي بالبريد" },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Switch defaultChecked={i < 2} />
            </div>
          ))}
        </div>
      </div>

      {/* API Tokens */}
      <div className="bg-card rounded-lg shadow-card p-5">
        <ApiTokensSection />
      </div>

      {/* Push Notifications */}
      <PushNotificationSettings />

      {/* Quick Links */}
      <div className="bg-card rounded-lg shadow-card">
        {[
          { id: "api-docs", icon: Code2, title: "توثيق API", description: "دليل شامل لجميع نقاط النهاية مع أمثلة كود", onClick: () => navigate("/api-docs") },
          { id: "integrations", icon: CreditCard, title: "الربط والتكامل", description: "إدارة قنوات التواصل وأرقام واتساب", onClick: () => navigate("/integrations") },
          { id: "billing", icon: CreditCard, title: "الاشتراك والفواتير", description: "إدارة الاشتراك والدفع", onClick: () => navigate("/wallet") },
          { id: "security", icon: Shield, title: "الأمان", description: "كلمة المرور والمصادقة", onClick: () => {} },
        ].map((section, i, arr) => (
          <button key={section.id} onClick={section.onClick} className={cn("w-full flex items-center justify-between p-5 hover:bg-secondary/30 transition-colors", i < arr.length - 1 && "border-b border-border")}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><section.icon className="w-4 h-4" /></div>
              <div className="text-right">
                <p className="text-sm font-medium">{section.title}</p>
                <p className="text-xs text-muted-foreground">{section.description}</p>
              </div>
            </div>
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default SettingsPage;
