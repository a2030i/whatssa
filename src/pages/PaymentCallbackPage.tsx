import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const PaymentCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const paymentId = searchParams.get("payment_id");
  const moyasarId = searchParams.get("id");
  const moyasarStatus = searchParams.get("status");

  const [status, setStatus] = useState<"loading" | "success" | "failed">("loading");
  const [payment, setPayment] = useState<any>(null);

  useEffect(() => {
    if (paymentId) {
      checkPayment();
    } else {
      setStatus("failed");
    }
  }, [paymentId]);

  const checkPayment = async () => {
    // Poll for payment status update (webhook may take a moment)
    for (let i = 0; i < 10; i++) {
      const { data } = await supabase
        .from("payments")
        .select("*")
        .eq("id", paymentId!)
        .maybeSingle();

      if (data) {
        setPayment(data);
        if (data.status === "paid") {
          setStatus("success");
          return;
        } else if (data.status === "failed") {
          setStatus("failed");
          return;
        }
      }
      // Wait 2 seconds before retrying
      await new Promise((r) => setTimeout(r, 2000));
    }

    // After polling, check final status
    const { data } = await supabase
      .from("payments")
      .select("*")
      .eq("id", paymentId!)
      .maybeSingle();

    if (data) {
      setPayment(data);
      setStatus(data.status === "paid" ? "success" : "failed");
    } else {
      setStatus("failed");
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-6" dir="rtl">
      <div className="bg-card rounded-2xl shadow-card p-8 max-w-md w-full text-center space-y-6">
        {status === "loading" && (
          <>
            <Loader2 className="w-16 h-16 animate-spin text-primary mx-auto" />
            <div>
              <h2 className="text-lg font-bold">جاري التحقق من الدفع...</h2>
              <p className="text-sm text-muted-foreground mt-2">يرجى الانتظار بينما نتحقق من عملية الدفع</p>
            </div>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-primary">تم الدفع بنجاح! 🎉</h2>
              <p className="text-sm text-muted-foreground mt-2">
                تم تفعيل اشتراكك بنجاح. يمكنك الآن الاستمتاع بجميع مزايا باقتك.
              </p>
            </div>
            {payment && (
              <div className="bg-muted/50 rounded-xl p-4 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المبلغ</span>
                  <span className="font-bold">{payment.amount} ر.س</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">رقم العملية</span>
                  <span className="font-mono text-[10px]">{payment.moyasar_payment_id || payment.id.slice(0, 12)}</span>
                </div>
              </div>
            )}
            <Button className="w-full gap-2" onClick={() => navigate("/")}>
              <ArrowRight className="w-4 h-4" />
              العودة للوحة التحكم
            </Button>
          </>
        )}

        {status === "failed" && (
          <>
            <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <XCircle className="w-10 h-10 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-destructive">فشلت عملية الدفع</h2>
              <p className="text-sm text-muted-foreground mt-2">
                لم تتم عملية الدفع. يرجى المحاولة مرة أخرى أو التواصل مع الدعم.
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => navigate("/plans")}>
                العودة للباقات
              </Button>
              <Button className="flex-1" onClick={() => navigate("/plans")}>
                إعادة المحاولة
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PaymentCallbackPage;
