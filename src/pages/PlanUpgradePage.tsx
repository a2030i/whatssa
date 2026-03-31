import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Check, Crown, Zap, Building2, Rocket, CreditCard, ShieldCheck, Wifi,
  MessageSquare, Users, ShoppingBag, Megaphone, Bot, Code2, Headphones,
  Star, ArrowLeft
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const planStyles = [
  { icon: Zap, gradient: "from-muted to-muted/50", accent: "text-muted-foreground", badge: "" },
  { icon: Crown, gradient: "from-primary/10 to-primary/5", accent: "text-primary", badge: "" },
  { icon: Rocket, gradient: "from-chart-1/10 to-chart-1/5", accent: "text-chart-1", badge: "الأكثر طلباً" },
  { icon: Building2, gradient: "from-chart-4/10 to-chart-4/5", accent: "text-chart-4", badge: "" },
];

const formatLimit = (val: number) => val >= 999999 ? "غير محدود" : val.toLocaleString("ar-SA");

interface LimitRow {
  icon: any;
  label: string;
  key: string;
}

const limitRows: LimitRow[] = [
  { icon: MessageSquare, label: "المحادثات", key: "max_conversations" },
  { icon: Users, label: "أعضاء الفريق", key: "max_team_members" },
  { icon: Users, label: "الفرق", key: "max_teams" },
  { icon: ShieldCheck, label: "أرقام رسمية (Meta)", key: "max_phone_numbers" },
  { icon: Wifi, label: "أرقام غير رسمية (QR)", key: "max_unofficial_phones" },
  { icon: ShoppingBag, label: "المتاجر", key: "max_stores" },
  { icon: Megaphone, label: "الحملات / شهر", key: "max_campaigns_per_month" },
  { icon: Code2, label: "مفاتيح API", key: "max_api_tokens" },
];

const PlanUpgradePage = () => {
  const { orgId } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<any[]>([]);
  const [currentOrg, setCurrentOrg] = useState<any>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  useEffect(() => { load(); }, [orgId]);

  const load = async () => {
    const [p, o] = await Promise.all([
      supabase.from("plans").select("*").eq("is_active", true).order("sort_order"),
      orgId ? supabase.from("organizations").select("*, plans(*)").eq("id", orgId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setPlans(p.data || []);
    if (o.data) setCurrentOrg(o.data);
  };

  const goToCheckout = (planId: string) => {
    navigate(`/checkout?plan_id=${planId}&cycle=${billingCycle}&type=subscription`);
  };

  const currentPlanId = currentOrg?.plan_id;

  const getPrice = (plan: any) => {
    if (billingCycle === "yearly") return Math.round(plan.price * 12 * 0.8);
    return plan.price;
  };

  const getMonthlyEquivalent = (plan: any) => {
    if (billingCycle === "yearly") return Math.round(plan.price * 0.8);
    return plan.price;
  };

  return (
    <div className="p-3 md:p-6 space-y-8 max-w-[1200px] mx-auto" dir="rtl">
      {/* Header */}
      <div className="text-center space-y-3">
        <h1 className="text-2xl md:text-3xl font-bold">اختر الباقة المناسبة لعملك</h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          جميع الباقات تتضمن فترة تجربة مجانية لمدة 7 أيام — بدون بطاقة ائتمان
          {currentOrg?.plans?.name_ar && (
            <span className="block mt-1 font-medium text-primary">باقتك الحالية: {currentOrg.plans.name_ar}</span>
          )}
        </p>
      </div>

      {/* Billing Toggle */}
      <div className="flex items-center justify-center">
        <div className="bg-muted rounded-xl p-1 flex gap-1">
          <button
            onClick={() => setBillingCycle("monthly")}
            className={cn(
              "px-5 py-2.5 rounded-lg text-sm font-medium transition-all",
              billingCycle === "monthly"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            شهري
          </button>
          <button
            onClick={() => setBillingCycle("yearly")}
            className={cn(
              "px-5 py-2.5 rounded-lg text-sm font-medium transition-all relative",
              billingCycle === "yearly"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            سنوي
            <Badge className="absolute -top-2.5 -left-3 bg-success text-success-foreground text-[9px] px-1.5 py-0 border-0">
              وفّر 20%
            </Badge>
          </button>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((plan, i) => {
          const isCurrent = plan.id === currentPlanId;
          const style = planStyles[i % planStyles.length];
          const Icon = style.icon;
          const price = getPrice(plan);
          const monthlyEq = getMonthlyEquivalent(plan);
          const isPopular = i === 2;

          return (
            <div
              key={plan.id}
              className={cn(
                "bg-card rounded-2xl border flex flex-col transition-all relative overflow-hidden",
                isCurrent && "ring-2 ring-primary border-primary",
                isPopular && !isCurrent && "ring-2 ring-chart-1 border-chart-1",
                !isCurrent && !isPopular && "border-border hover:border-primary/30 hover:shadow-lg"
              )}
            >
              {/* Popular Badge */}
              {isPopular && (
                <div className="bg-chart-1 text-white text-[10px] font-bold text-center py-1.5 flex items-center justify-center gap-1">
                  <Star className="w-3 h-3" />
                  {style.badge}
                </div>
              )}

              <div className="p-5 flex flex-col flex-1">
                {/* Plan Header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br", style.gradient)}>
                    <Icon className={cn("w-5 h-5", style.accent)} />
                  </div>
                  <div>
                    <p className="font-bold text-base">{plan.name_ar}</p>
                    <p className="text-[11px] text-muted-foreground">{plan.description}</p>
                  </div>
                </div>

                {/* Price */}
                <div className="mb-5 pb-5 border-b border-border">
                  {plan.price === 0 ? (
                    <div>
                      <span className="text-3xl font-bold">مجاناً</span>
                      <p className="text-[11px] text-muted-foreground mt-1">للبدء والتجربة</p>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold">{monthlyEq}</span>
                        <span className="text-sm text-muted-foreground">ر.س / شهر</span>
                      </div>
                      {billingCycle === "yearly" && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] text-muted-foreground line-through">{plan.price * 12} ر.س</span>
                          <span className="text-[11px] font-medium text-success">{price} ر.س سنوياً</span>
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        تجربة مجانية {plan.trial_days} أيام
                      </p>
                    </div>
                  )}
                </div>

                {/* Limits */}
                <div className="space-y-2.5 flex-1 mb-5">
                  {limitRows.map((row) => {
                    const val = plan[row.key] ?? 0;
                    const isUnlimited = val >= 999999;
                    const isZero = val === 0;

                    return (
                      <div key={row.key} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <row.icon className={cn("w-3.5 h-3.5", isZero ? "text-muted-foreground/40" : style.accent)} />
                          <span className={cn("text-xs", isZero && "text-muted-foreground/60")}>{row.label}</span>
                        </div>
                        <span className={cn(
                          "text-xs font-bold",
                          isZero ? "text-muted-foreground/40" : isUnlimited ? "text-success" : "text-foreground"
                        )}>
                          {isZero ? "—" : formatLimit(val)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Features */}
                {plan.features && Array.isArray(plan.features) && plan.features.length > 0 && (
                  <div className="space-y-1.5 mb-5 pt-4 border-t border-border">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">المميزات</p>
                    {(plan.features as string[]).map((f: string, fi: number) => (
                      <div key={fi} className="flex items-start gap-2 text-xs">
                        <Check className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", style.accent)} />
                        <span className="text-muted-foreground">{f}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* CTA */}
                <Button
                  className={cn("w-full gap-1.5 mt-auto", isPopular && !isCurrent && "bg-chart-1 hover:bg-chart-1/90")}
                  variant={isCurrent ? "outline" : "default"}
                  disabled={isCurrent}
                  onClick={() => goToCheckout(plan.id)}
                >
                  {isCurrent ? "باقتك الحالية" : plan.price === 0 ? "ابدأ مجاناً" : (
                    <>
                      <CreditCard className="w-3.5 h-3.5" />
                      ابدأ التجربة المجانية
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparison Table - Desktop */}
      <div className="hidden md:block bg-card rounded-2xl border border-border overflow-hidden">
        <div className="p-5 border-b border-border">
          <h2 className="text-lg font-bold">مقارنة تفصيلية بين الباقات</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-right p-3 font-medium text-muted-foreground w-[200px]">الميزة</th>
                {plans.map((p, i) => (
                  <th key={p.id} className={cn("p-3 text-center font-bold", p.id === currentPlanId && "bg-primary/5")}>
                    {p.name_ar}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {limitRows.map((row) => (
                <tr key={row.key} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="p-3 text-muted-foreground flex items-center gap-2">
                    <row.icon className="w-4 h-4" />
                    {row.label}
                  </td>
                  {plans.map((p) => {
                    const val = p[row.key] ?? 0;
                    return (
                      <td key={p.id} className={cn("p-3 text-center font-medium", p.id === currentPlanId && "bg-primary/5")}>
                        {val === 0 ? (
                          <span className="text-muted-foreground/40">—</span>
                        ) : val >= 999999 ? (
                          <span className="text-success font-bold">∞</span>
                        ) : (
                          val
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="p-3 text-muted-foreground flex items-center gap-2">
                  <Headphones className="w-4 h-4" />
                  الدعم
                </td>
                {plans.map((p, i) => (
                  <td key={p.id} className={cn("p-3 text-center text-xs", p.id === currentPlanId && "bg-primary/5")}>
                    {i === 0 ? "مجتمعي" : i === 1 ? "بريد إلكتروني" : i === 2 ? "أولوية" : "مخصص 24/7"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ / Notes */}
      <div className="text-center space-y-2 pb-6">
        <p className="text-xs text-muted-foreground">
          جميع الباقات تشمل: صندوق وارد موحد • إسناد تلقائي • شات بوت • تقارير • تخزين ملفات
        </p>
        <p className="text-xs text-muted-foreground">
          رسوم المحادثات على واتساب الرسمي (Meta) تُخصم مباشرة من حسابك في Meta — المنصة لا تفرض رسوماً إضافية على الرسائل
        </p>
      </div>
    </div>
  );
};

export default PlanUpgradePage;
