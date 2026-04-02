import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase, invokeCloud } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CreditCard, Shield, Loader2, Check, Crown, Zap, Rocket, Building2 } from "lucide-react";

const CheckoutPage = () => {
  const { user, orgId } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const planId = searchParams.get("plan_id");
  const billingCycle = searchParams.get("cycle") || "monthly";
  const paymentType = searchParams.get("type") || "subscription";
  const addonQty = parseInt(searchParams.get("qty") || "1");

  const [plan, setPlan] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutData, setCheckoutData] = useState<any>(null);
  const [moyasarLoaded, setMoyasarLoaded] = useState(false);

  useEffect(() => {
    loadPlan();
    loadMoyasarScript();
  }, [planId]);

  const loadMoyasarScript = () => {
    // Load Moyasar CSS
    if (!document.querySelector('link[href*="moyasar"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://cdn.moyasar.com/mpf/1.14.0/moyasar.css";
      document.head.appendChild(link);
    }
    // Load Moyasar JS
    if (!document.querySelector('script[src*="moyasar"]')) {
      const script = document.createElement("script");
      script.src = "https://cdn.moyasar.com/mpf/1.14.0/moyasar.js";
      script.onload = () => setMoyasarLoaded(true);
      document.head.appendChild(script);
    } else {
      setMoyasarLoaded(true);
    }
  };

  const loadPlan = async () => {
    if (planId) {
      const { data } = await supabase.from("plans").select("*").eq("id", planId).maybeSingle();
      setPlan(data);
    }
    setIsLoading(false);
  };

  const getAmount = () => {
    if (paymentType === "addon_qr") return addonQty * 300;
    if (!plan) return 0;
    if (billingCycle === "yearly") return plan.price * 12 * 0.8; // 20% discount
    return plan.price;
  };

  const getDescription = () => {
    if (paymentType === "addon_qr") return `ربط غير رسمي (${addonQty} رقم)`;
    if (!plan) return "اشتراك";
    return `اشتراك باقة ${plan.name_ar}`;
  };

  const initCheckout = async () => {
    if (!orgId || !user) return;
    setIsProcessing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await invokeCloud("moyasar-checkout", {
        body: {
          org_id: orgId,
          plan_id: planId,
          payment_type: paymentType,
          amount: getAmount(),
          billing_cycle: billingCycle,
          addon_quantity: paymentType === "addon_qr" ? addonQty : 0,
          callback_url: `${window.location.origin}/payment-callback`,
        },
      });

      if (res.error) throw new Error(res.error.message);
      const data = res.data;
      setCheckoutData(data);

      // Initialize Moyasar payment form
      if (moyasarLoaded && (window as any).Moyasar) {
        setTimeout(() => {
          (window as any).Moyasar.init({
            element: ".moyasar-form",
            amount: data.amount,
            currency: data.currency,
            description: data.description,
            publishable_api_key: data.publishable_key,
            callback_url: data.callback_url,
            metadata: data.metadata,
            methods: ["creditcard", "applepay", "stcpay"],
            apple_pay: {
              country: "SA",
              label: "Respondly",
              validate_merchant_url: "https://api.moyasar.com/v1/applepay/initiate",
            },
            on_completed: () => {
              toast.success("تم الدفع بنجاح!");
            },
          });
        }, 200);
      }
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ أثناء تهيئة الدفع");
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 max-w-[600px] mx-auto space-y-6" dir="rtl">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary" />
          إتمام الدفع
        </h1>
        <p className="text-sm text-muted-foreground mt-1">أكمل عملية الدفع لتفعيل اشتراكك</p>
      </div>

      {/* Order Summary */}
      <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">ملخص الطلب</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div className="flex items-center gap-2">
              {paymentType === "addon_qr" ? (
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-emerald-600" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Crown className="w-4 h-4 text-primary" />
                </div>
              )}
              <div>
                <p className="text-sm font-medium">{getDescription()}</p>
                <p className="text-[10px] text-muted-foreground">
                  {paymentType === "addon_qr" ? "سنوياً" : billingCycle === "yearly" ? "سنوي (خصم 20%)" : "شهري"}
                </p>
              </div>
            </div>
            <p className="font-bold text-sm">{getAmount()} ر.س</p>
          </div>

          {billingCycle === "yearly" && plan && paymentType !== "addon_qr" && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>السعر الشهري الأصلي × 12</span>
              <span className="line-through">{plan.price * 12} ر.س</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <p className="font-bold text-sm">الإجمالي</p>
            <p className="font-bold text-lg text-primary">{getAmount()} ر.س</p>
          </div>
        </div>
      </div>

      {/* Payment Form */}
      {!checkoutData ? (
        <Button
          className="w-full h-12 text-sm font-semibold gap-2"
          onClick={initCheckout}
          disabled={isProcessing || !moyasarLoaded}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              جاري التحضير...
            </>
          ) : (
            <>
              <CreditCard className="w-4 h-4" />
              متابعة للدفع
            </>
          )}
        </Button>
      ) : (
        <div className="bg-card rounded-xl shadow-card p-5">
          <div className="moyasar-form" />
        </div>
      )}

      {/* Security Note */}
      <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
        <Shield className="w-3 h-3" />
        <span>جميع المعاملات مشفرة ومحمية بواسطة ميسّر</span>
      </div>
    </div>
  );
};

export default CheckoutPage;
