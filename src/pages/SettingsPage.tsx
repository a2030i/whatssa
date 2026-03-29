import { useState, useEffect } from "react";
import { Building2, Bell, CreditCard, Shield, ChevronLeft, Hand, RotateCcw, Scale, Target, Save, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const strategyOptions = [
  { key: "manual", label: "يدوي", icon: Hand, description: "المدير يسند المحادثات يدوياً لكل موظف", color: "text-muted-foreground" },
  { key: "round_robin", label: "بالدور (Round Robin)", icon: RotateCcw, description: "توزيع بالتناوب على الموظفين المتاحين", color: "text-primary" },
  { key: "least_busy", label: "الأقل ضغطاً (Load Balancing)", icon: Scale, description: "يُسند للموظف ذو أقل محادثات مفتوحة", color: "text-success" },
  { key: "skill_based", label: "حسب المهارة / الفريق", icon: Target, description: "توجيه بناءً على كلمات مفتاحية لكل فريق", color: "text-warning" },
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

  useEffect(() => {
    if (orgId) loadAssignSettings();
  }, [orgId]);

  const loadAssignSettings = async () => {
    setLoadingAssign(true);
    const { data } = await supabase
      .from("organizations")
      .select("default_assignment_strategy, default_max_conversations")
      .eq("id", orgId)
      .single();
    if (data) {
      setDefaultStrategy(data.default_assignment_strategy || "round_robin");
      setDefaultMaxConv(data.default_max_conversations ? String(data.default_max_conversations) : "");
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

      {/* Quick Links */}
      <div className="bg-card rounded-lg shadow-card">
        {[
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
