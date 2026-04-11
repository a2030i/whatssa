import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Users, ShieldCheck, Wifi, ShoppingBag, MessageSquare, Megaphone,
  Code2, CreditCard, ArrowRight, Sparkles, Users2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PlanItem {
  key: string;
  label: string;
  icon: any;
  min: number;
  max: number;
  step: number;
  default: number;
  pricePerUnit: number;
  unit: string;
  included: number;
}

const planItems: PlanItem[] = [
  { key: "team_members", label: "أعضاء الفريق", icon: Users, min: 1, max: 50, step: 1, default: 1, pricePerUnit: 25, unit: "عضو", included: 1 },
  { key: "teams", label: "الفرق", icon: Users2, min: 1, max: 20, step: 1, default: 1, pricePerUnit: 15, unit: "فريق", included: 1 },
  { key: "official_phones", label: "أرقام رسمية (Meta API)", icon: ShieldCheck, min: 0, max: 20, step: 1, default: 0, pricePerUnit: 40, unit: "رقم", included: 0 },
  { key: "unofficial_phones", label: "أرقام غير رسمية (QR)", icon: Wifi, min: 1, max: 10, step: 1, default: 1, pricePerUnit: 25, unit: "رقم", included: 1 },
  { key: "stores", label: "المتاجر الإلكترونية", icon: ShoppingBag, min: 0, max: 10, step: 1, default: 0, pricePerUnit: 30, unit: "متجر", included: 0 },
  { key: "conversations", label: "المحادثات / شهر", icon: MessageSquare, min: 100, max: 10000, step: 100, default: 500, pricePerUnit: 0.06, unit: "محادثة", included: 100 },
  { key: "campaigns", label: "الحملات / شهر", icon: Megaphone, min: 1, max: 100, step: 1, default: 5, pricePerUnit: 10, unit: "حملة", included: 1 },
  { key: "api_tokens", label: "مفاتيح API", icon: Code2, min: 1, max: 20, step: 1, default: 2, pricePerUnit: 10, unit: "مفتاح", included: 1 },
];

const BASE_PRICE = 49;

const CustomPlanPage = () => {
  const navigate = useNavigate();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(planItems.map((item) => [item.key, item.default]))
  );

  const updateValue = (key: string, val: number) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const calculatePrice = () => {
    let total = BASE_PRICE;
    for (const item of planItems) {
      const extra = Math.max(0, values[item.key] - item.included);
      total += extra * item.pricePerUnit;
    }
    return Math.round(total);
  };

  const monthlyPrice = calculatePrice();
  const displayPrice = billingCycle === "yearly" ? Math.round(monthlyPrice * 0.8) : monthlyPrice;
  const yearlyTotal = Math.round(monthlyPrice * 12 * 0.8);
  const savings = billingCycle === "yearly" ? Math.round(monthlyPrice * 12 - yearlyTotal) : 0;

  const goToCheckout = () => {
    const params = new URLSearchParams({
      type: "custom_plan",
      cycle: billingCycle,
      config: JSON.stringify(values),
      price: String(billingCycle === "yearly" ? yearlyTotal : monthlyPrice),
    });
    navigate(`/checkout?${params.toString()}`);
  };

  return (
    <div className="p-3 md:p-6 max-w-[900px] mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold">صمّم باقتك الخاصة</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            حدد احتياجاتك بدقة وادفع فقط مقابل ما تستخدمه
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/plans")} className="gap-1 text-xs">
          <ArrowRight className="w-3.5 h-3.5" />
          الباقات الجاهزة
        </Button>
      </div>

      {/* Billing Toggle */}
      <div className="flex items-center justify-center">
        <div className="bg-muted rounded-xl p-1 flex gap-1">
          <button
            onClick={() => setBillingCycle("monthly")}
            className={cn(
              "px-5 py-2 rounded-lg text-sm font-medium transition-all",
              billingCycle === "monthly" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            شهري
          </button>
          <button
            onClick={() => setBillingCycle("yearly")}
            className={cn(
              "px-5 py-2 rounded-lg text-sm font-medium transition-all relative",
              billingCycle === "yearly" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            سنوي
            <Badge className="absolute -top-2.5 -left-3 bg-success text-success-foreground text-[9px] px-1.5 py-0 border-0">
              وفّر 20%
            </Badge>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Sliders */}
        <div className="lg:col-span-2 space-y-1">
          {planItems.map((item) => {
            const val = values[item.key];
            const extra = Math.max(0, val - item.included);
            const itemCost = Math.round(extra * item.pricePerUnit);

            return (
              <div key={item.key} className="bg-card rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <item.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {item.pricePerUnit < 1
                          ? `${item.pricePerUnit * 100} هللة / ${item.unit}`
                          : `${item.pricePerUnit} ر.س / ${item.unit}`}
                        {item.included > 0 && ` • أول ${item.included} مجاناً`}
                      </p>
                    </div>
                  </div>
                  <div className="text-left">
                    <span className="text-lg font-bold text-primary">{val.toLocaleString("ar-SA-u-ca-gregory")}</span>
                    {itemCost > 0 && (
                      <p className="text-[10px] text-muted-foreground">+{itemCost} ر.س</p>
                    )}
                  </div>
                </div>
                <Slider
                  value={[val]}
                  min={item.min}
                  max={item.max}
                  step={item.step}
                  onValueChange={([v]) => updateValue(item.key, v)}
                  className="w-full"
                  dir="ltr"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground" dir="ltr">
                  <span>{item.min}</span>
                  <span>{item.max.toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Price Summary - Sticky */}
        <div className="lg:col-span-1">
          <div className="bg-card rounded-2xl border border-primary/20 p-5 space-y-4 lg:sticky lg:top-6">
            <div className="text-center">
              <Sparkles className="w-6 h-6 text-primary mx-auto mb-2" />
              <h2 className="font-bold text-sm">ملخص باقتك المخصصة</h2>
            </div>

            <div className="space-y-2 text-xs">
              {planItems.map((item) => {
                const val = values[item.key];
                if (val <= 0 && item.min === 0) return null;
                return (
                  <div key={item.key} className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
                    <div className="flex items-center gap-1.5">
                      <item.icon className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">{item.label}</span>
                    </div>
                    <span className="font-bold">{val.toLocaleString("ar-SA-u-ca-gregory")}</span>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">السعر الأساسي</span>
                <span className="text-xs">{BASE_PRICE} ر.س</span>
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">الإضافات</span>
                <span className="text-xs">{monthlyPrice - BASE_PRICE} ر.س</span>
              </div>
              {billingCycle === "yearly" && (
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-success">خصم سنوي (20%)</span>
                  <span className="text-xs text-success">-{savings} ر.س</span>
                </div>
              )}
            </div>

            <div className="bg-primary/5 rounded-xl p-4 text-center">
              <p className="text-[11px] text-muted-foreground mb-1">
                {billingCycle === "yearly" ? "السعر السنوي" : "السعر الشهري"}
              </p>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-3xl font-bold text-primary">
                  {billingCycle === "yearly" ? yearlyTotal : displayPrice}
                </span>
                <span className="text-sm text-muted-foreground">
                  ر.س / {billingCycle === "yearly" ? "سنة" : "شهر"}
                </span>
              </div>
              {billingCycle === "yearly" && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  ≈ {displayPrice} ر.س / شهر
                </p>
              )}
            </div>

            <Button className="w-full gap-2" size="lg" onClick={goToCheckout}>
              <CreditCard className="w-4 h-4" />
              اشترك الآن
            </Button>

            <p className="text-[10px] text-center text-muted-foreground">
              فترة تجربة مجانية 7 أيام • إلغاء في أي وقت
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomPlanPage;

