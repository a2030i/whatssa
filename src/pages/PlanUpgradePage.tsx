import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, Crown, Zap, Building2, Rocket, QrCode, Plus, Minus, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

const planIcons = [Zap, Crown, Rocket, Building2];

const PlanUpgradePage = () => {
  const { orgId } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<any[]>([]);
  const [currentOrg, setCurrentOrg] = useState<any>(null);
  const [qrCount, setQrCount] = useState(1);
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

  const goToQrCheckout = () => {
    navigate(`/checkout?type=addon_qr&qty=${qrCount}&cycle=yearly`);
  };

  const currentPlanId = currentOrg?.plan_id;

  const getPrice = (plan: any) => {
    if (billingCycle === "yearly") return Math.round(plan.price * 12 * 0.8);
    return plan.price;
  };

  return (
    <div className="p-3 md:p-6 space-y-6 max-w-[1100px]" dir="rtl">
      <div>
        <h1 className="text-xl font-bold">الباقات والترقية</h1>
        <p className="text-sm text-muted-foreground mt-1">
          اختر الباقة المناسبة لعملك
          {currentOrg?.plans?.name_ar && (
            <span className="mr-2 font-medium text-primary">• باقتك الحالية: {currentOrg.plans.name_ar}</span>
          )}
        </p>
      </div>

      {/* Billing Toggle */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => setBillingCycle("monthly")}
          className={cn(
            "px-4 py-2 rounded-lg text-xs font-medium transition-all",
            billingCycle === "monthly" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          شهري
        </button>
        <button
          onClick={() => setBillingCycle("yearly")}
          className={cn(
            "px-4 py-2 rounded-lg text-xs font-medium transition-all relative",
            billingCycle === "yearly" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          سنوي
          <span className="absolute -top-2 -left-2 bg-emerald-500 text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold">
            -20%
          </span>
        </button>
      </div>

      {/* Main Plans + QR Standalone */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {plans.map((plan, i) => {
          const isCurrent = plan.id === currentPlanId;
          const Icon = planIcons[i % planIcons.length];
          const price = getPrice(plan);
          return (
            <div
              key={plan.id}
              className={cn(
                "bg-card rounded-xl shadow-card p-5 flex flex-col transition-all",
                isCurrent && "ring-2 ring-primary",
                !isCurrent && "hover:shadow-lg"
              )}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", isCurrent ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-sm">{plan.name_ar}</p>
                  {isCurrent && <span className="text-[9px] text-primary font-medium">الباقة الحالية</span>}
                </div>
              </div>

              <div className="mb-4">
                <span className="text-2xl font-bold">{price}</span>
                <span className="text-xs text-muted-foreground mr-1">
                  ر.س / {billingCycle === "yearly" ? "سنوياً" : "شهرياً"}
                </span>
                {billingCycle === "yearly" && plan.price > 0 && (
                  <p className="text-[10px] text-muted-foreground line-through">{plan.price * 12} ر.س</p>
                )}
              </div>

              <div className="space-y-2 flex-1 mb-4">
                <div className="flex items-center gap-2 text-xs">
                  <Check className="w-3 h-3 text-primary" />
                  <span>{plan.max_conversations} محادثة</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Check className="w-3 h-3 text-primary" />
                  <span>{plan.max_team_members} عضو فريق</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Check className="w-3 h-3 text-primary" />
                  <span>{plan.max_phone_numbers} رقم واتساب</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Check className="w-3 h-3" />
                  <span>رسائل غير محدودة (رسوم Meta على العميل)</span>
                </div>
              </div>

              <Button
                className="w-full gap-1.5"
                variant={isCurrent ? "outline" : "default"}
                disabled={isCurrent || price === 0}
                onClick={() => goToCheckout(plan.id)}
              >
                {isCurrent ? "باقتك الحالية" : price === 0 ? "مجاني" : (
                  <>
                    <CreditCard className="w-3.5 h-3.5" />
                    اشترك الآن
                  </>
                )}
              </Button>
            </div>
          );
        })}

        {/* QR Standalone Card */}
        <div className="bg-card rounded-xl shadow-card p-5 flex flex-col transition-all hover:shadow-lg border border-dashed border-primary/30 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 bg-gradient-to-l from-primary/10 to-primary/5 h-1" />
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-600">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm">ربط QR</p>
              <span className="text-[9px] text-emerald-600 font-medium">غير رسمي</span>
            </div>
          </div>

          <div className="mb-4">
            <span className="text-2xl font-bold">300</span>
            <span className="text-xs text-muted-foreground mr-1">ر.س / سنوياً لكل رقم</span>
          </div>

          <div className="space-y-2 flex-1 mb-4">
            <div className="flex items-center gap-2 text-xs">
              <Check className="w-3 h-3 text-emerald-500" />
              <span>ربط عبر مسح QR</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Check className="w-3 h-3 text-emerald-500" />
              <span>رسائل خاصة + مجموعات</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Check className="w-3 h-3 text-emerald-500" />
              <span>بدون حساب Meta Business</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Check className="w-3 h-3" />
              <span>يُضاف لأي باقة</span>
            </div>
          </div>

          <Button className="w-full bg-emerald-600 hover:bg-emerald-700 gap-1.5" onClick={goToQrCheckout}>
            <CreditCard className="w-3.5 h-3.5" />
            اشترك الآن
          </Button>
        </div>
      </div>

      {/* QR Add-on Section */}
      <div className="bg-card rounded-xl shadow-card p-5">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
              <QrCode className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-sm">إضافة أرقام ربط غير رسمي (QR)</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                أضف أرقام واتساب إضافية عبر مسح QR — يدعم الرسائل الخاصة والمجموعات
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-2 py-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setQrCount(Math.max(1, qrCount - 1))}>
                <Minus className="w-3.5 h-3.5" />
              </Button>
              <span className="font-bold text-lg min-w-[2ch] text-center">{qrCount}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setQrCount(qrCount + 1)}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="text-left min-w-[80px]">
              <p className="font-bold text-sm">{qrCount * 300} ر.س</p>
              <p className="text-[10px] text-muted-foreground">سنوياً</p>
            </div>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-xs px-4 gap-1.5" onClick={goToQrCheckout}>
              <CreditCard className="w-3.5 h-3.5" />
              ادفع الآن
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlanUpgradePage;
