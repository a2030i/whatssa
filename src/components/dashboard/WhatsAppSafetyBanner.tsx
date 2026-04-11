import { useState, useEffect } from "react";
import { Shield, X, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const tips = [
  "تجنب إرسال رسائل جماعية لأرقام غير محفوظة — هذا أكثر سبب للحظر",
  "لا تفصل وتعيد ربط الواتساب بشكل متكرر — واتساب يعتبره سلوك مشبوه",
  "استخدم التأخير بين الرسائل (8-15 ثانية) لتقليل احتمال الحظر",
  "ابدأ بعدد قليل من الرسائل يومياً وزِد تدريجياً — لا ترسل 500 رسالة دفعة واحدة",
  "تأكد أن محتوى رسائلك ذو قيمة وليس سبام — العملاء يمكنهم الإبلاغ عنك",
  "فعّل حدود الإرسال اليومية والساعية لحماية حسابك تلقائياً",
  "لا ترسل نفس النص لكل العملاء — خصص الرسائل باستخدام المتغيرات",
  "راقب معدل الفشل — إذا تجاوز 10% توقف وراجع أرقام المستلمين",
];

const WhatsAppSafetyBanner = () => {
  const [dismissed, setDismissed] = useState(false);
  const [currentTip, setCurrentTip] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem("wa-safety-banner-dismissed");
    if (saved) {
      const dismissedAt = new Date(saved);
      const hoursSince = (Date.now() - dismissedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) setDismissed(true);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTip((prev) => (prev + 1) % tips.length);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  if (dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("wa-safety-banner-dismissed", new Date().toISOString());
  };

  return (
    <div className="relative bg-warning/10 border border-warning/30 rounded-xl p-4 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-warning/20 flex items-center justify-center shrink-0">
          <Shield className="w-5 h-5 text-warning" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-bold text-foreground">نصيحة لحماية حسابك</h3>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setCurrentTip((p) => (p - 1 + tips.length) % tips.length)}>
                <ChevronRight className="w-3 h-3" />
              </Button>
              <span className="text-[10px] text-muted-foreground">{currentTip + 1}/{tips.length}</span>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setCurrentTip((p) => (p + 1) % tips.length)}>
                <ChevronLeft className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{tips[currentTip]}</p>
          <Link to="/safety-guide" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2">
            <ExternalLink className="w-3 h-3" />
            عرض دليل الحماية الكامل
          </Link>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleDismiss}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default WhatsAppSafetyBanner;

