import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Lock, CheckCircle2, Zap, Plug, ShoppingCart, ArrowLeft, Languages, Sparkles, Brain, FileText, BarChart3, MessageSquare, ShoppingBag, TrendingUp, Package, ClipboardList, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface LockedFeature {
  id: string;
  title: string;
  description: string;
  icon: any;
  requirement: string;
  requirementType: "ai" | "meta_api" | "ecommerce";
  actionLabel: string;
  actionPath: string;
}

const allFeatures: LockedFeature[] = [
  // AI features
  {
    id: "ai_translate",
    title: "ترجمة الرسائل",
    description: "ترجمة رسائل العملاء تلقائياً للعربية أو أي لغة أخرى مباشرة من المحادثة",
    icon: Languages,
    requirement: "ربط مزود ذكاء اصطناعي",
    requirementType: "ai",
    actionLabel: "ربط مزود AI",
    actionPath: "/ai-settings",
  },
  {
    id: "ai_suggest",
    title: "اقتراحات الرد الذكي",
    description: "يقترح AI ردوداً مناسبة بناءً على سياق المحادثة لتسريع الرد على العملاء",
    icon: Sparkles,
    requirement: "ربط مزود ذكاء اصطناعي",
    requirementType: "ai",
    actionLabel: "ربط مزود AI",
    actionPath: "/ai-settings",
  },
  {
    id: "ai_summarize",
    title: "تلخيص المحادثات",
    description: "ملخص آلي لكل محادثة يعرض أهم النقاط والطلبات بنقرة واحدة",
    icon: Brain,
    requirement: "ربط مزود ذكاء اصطناعي",
    requirementType: "ai",
    actionLabel: "ربط مزود AI",
    actionPath: "/ai-settings",
  },
  {
    id: "ai_analysis",
    title: "تحليل ذكي",
    description: "تحليل الطلبات والمبيعات والأداء باستخدام الذكاء الاصطناعي",
    icon: BarChart3,
    requirement: "ربط مزود ذكاء اصطناعي",
    requirementType: "ai",
    actionLabel: "ربط مزود AI",
    actionPath: "/ai-settings",
  },
  // Meta API features
  {
    id: "meta_templates",
    title: "إدارة القوالب",
    description: "إنشاء وإدارة قوالب الرسائل المعتمدة من Meta لإرسال رسائل تسويقية ومعاملات",
    icon: FileText,
    requirement: "ربط رقم واتساب رسمي (Meta API)",
    requirementType: "meta_api",
    actionLabel: "ربط واتساب رسمي",
    actionPath: "/integrations",
  },
  {
    id: "meta_catalog",
    title: "كتالوج المنتجات",
    description: "عرض وإدارة كتالوج المنتجات على واتساب مباشرة",
    icon: Package,
    requirement: "ربط رقم واتساب رسمي (Meta API)",
    requirementType: "meta_api",
    actionLabel: "ربط واتساب رسمي",
    actionPath: "/integrations",
  },
  {
    id: "meta_conv_analytics",
    title: "تكاليف المحادثات",
    description: "تتبع تكاليف محادثات واتساب الرسمية وتحليل الإنفاق",
    icon: DollarSign,
    requirement: "ربط رقم واتساب رسمي (Meta API)",
    requirementType: "meta_api",
    actionLabel: "ربط واتساب رسمي",
    actionPath: "/integrations",
  },
  // Ecommerce features
  {
    id: "ecom_orders",
    title: "إدارة الطلبات",
    description: "عرض وتتبع طلبات المتجر الإلكتروني مباشرة من المنصة",
    icon: ShoppingCart,
    requirement: "ربط متجر إلكتروني",
    requirementType: "ecommerce",
    actionLabel: "ربط متجر",
    actionPath: "/integrations",
  },
  {
    id: "ecom_abandoned",
    title: "السلات المتروكة",
    description: "استرداد السلات المتروكة وإرسال تذكيرات تلقائية للعملاء",
    icon: ShoppingBag,
    requirement: "ربط متجر إلكتروني",
    requirementType: "ecommerce",
    actionLabel: "ربط متجر",
    actionPath: "/integrations",
  },
  {
    id: "ecom_analytics",
    title: "تقارير المتجر",
    description: "تحليلات شاملة للمبيعات والأداء والمنتجات الأكثر مبيعاً",
    icon: TrendingUp,
    requirement: "ربط متجر إلكتروني",
    requirementType: "ecommerce",
    actionLabel: "ربط متجر",
    actionPath: "/integrations",
  },
];

const requirementTypeLabels: Record<string, { label: string; color: string }> = {
  ai: { label: "ذكاء اصطناعي", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  meta_api: { label: "واتساب رسمي", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  ecommerce: { label: "متجر إلكتروني", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
};

const LockedFeaturesPage = () => {
  const { orgId, hasMetaApi, isEcommerce } = useAuth();
  const navigate = useNavigate();
  const [hasAi, setHasAi] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("ai_provider_configs" as any)
      .select("id")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .limit(1)
      .then(({ data }) => {
        setHasAi(!!(data && data.length > 0));
        setLoading(false);
      });
  }, [orgId]);

  const lockedFeatures = allFeatures.filter((f) => {
    if (f.requirementType === "ai" && hasAi) return false;
    if (f.requirementType === "meta_api" && hasMetaApi) return false;
    if (f.requirementType === "ecommerce" && isEcommerce) return false;
    return true;
  });

  const unlockedFeatures = allFeatures.filter((f) => {
    if (f.requirementType === "ai" && hasAi) return true;
    if (f.requirementType === "meta_api" && hasMetaApi) return true;
    if (f.requirementType === "ecommerce" && isEcommerce) return true;
    return false;
  });

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">جاري التحميل...</div>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-6 max-w-[900px] mx-auto" dir="rtl">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Lock className="w-5 h-5 text-muted-foreground" />
          الخصائص والتكاملات
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          اكتشف جميع الخصائص المتاحة وما يلزم لتفعيلها
        </p>
      </div>

      {/* Unlocked features */}
      {unlockedFeatures.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-primary flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            خصائص مفعّلة ({unlockedFeatures.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {unlockedFeatures.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.id} className="bg-card border border-primary/20 rounded-xl p-4 opacity-80">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold">{f.title}</h3>
                        <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{f.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Locked features */}
      {lockedFeatures.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Lock className="w-4 h-4" />
            خصائص تحتاج تفعيل ({lockedFeatures.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {lockedFeatures.map((f) => {
              const Icon = f.icon;
              const typeInfo = requirementTypeLabels[f.requirementType];
              return (
                <div key={f.id} className="bg-card border rounded-xl p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold">{f.title}</h3>
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border-0", typeInfo.color)}>
                          {typeInfo.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{f.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] text-muted-foreground">المطلوب: {f.requirement}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 h-7 text-xs gap-1.5"
                        onClick={() => navigate(f.actionPath)}
                      >
                        {f.actionLabel}
                        <ArrowLeft className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-card border border-primary/20 rounded-xl p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-3" />
          <h3 className="font-bold text-lg">جميع الخصائص مفعّلة! 🎉</h3>
          <p className="text-sm text-muted-foreground mt-1">أنت تستخدم كل إمكانيات المنصة</p>
        </div>
      )}
    </div>
  );
};

export default LockedFeaturesPage;

