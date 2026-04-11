import { Shield, AlertTriangle, Clock, Users, MessageSquare, CheckCircle, XCircle, Zap, TrendingUp, Phone, RefreshCw, Ban } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const sections = [
  {
    title: "🚫 أسباب الحظر الشائعة",
    icon: Ban,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    items: [
      { text: "إرسال رسائل جماعية لأرقام غير محفوظة عندك أو لم تتواصل معك سابقاً", bad: true },
      { text: "إرسال عدد كبير من الرسائل دفعة واحدة بدون تأخير بين كل رسالة", bad: true },
      { text: "إرسال نفس النص المتطابق لعدد كبير من الأشخاص (سبام)", bad: true },
      { text: "فصل وإعادة ربط الواتساب بشكل متكرر خلال فترة قصيرة", bad: true },
      { text: "استخدام أرقام هاتف جديدة مباشرة في الإرسال الجماعي بدون تسخين", bad: true },
      { text: "إبلاغ عدد كبير من المستلمين عن رسائلك كسبام", bad: true },
    ],
  },
  {
    title: "✅ أفضل الممارسات",
    icon: CheckCircle,
    color: "text-success",
    bgColor: "bg-success/10",
    items: [
      { text: "ابدأ بـ 20-50 رسالة يومياً ثم زِد العدد تدريجياً على مدى أسبوعين", good: true },
      { text: "فعّل التأخير العشوائي بين الرسائل (8-15 ثانية) من إعدادات القناة", good: true },
      { text: "استخدم المتغيرات ({name}) لتخصيص كل رسالة وجعلها فريدة", good: true },
      { text: "تأكد أن المستلمين مهتمين فعلاً بمحتوى رسائلك", good: true },
      { text: "أرسل في أوقات مناسبة (9 صباحاً - 9 مساءً) وتجنب الإرسال المتأخر", good: true },
      { text: "راقب معدل الفشل — إذا تجاوز 5-10% توقف وراجع القائمة", good: true },
      { text: "نظّف قائمة الأرقام بشكل دوري واحذف الأرقام غير النشطة", good: true },
    ],
  },
  {
    title: "⚙️ إعدادات الحماية في المنصة",
    icon: Shield,
    color: "text-primary",
    bgColor: "bg-primary/10",
    items: [
      { text: "فعّل 'حدود الإرسال' من إعدادات القناة في صفحة التكاملات", setting: true },
      { text: "اضبط الحد اليومي على 200 رسالة كحد أقصى للأرقام الجديدة", setting: true },
      { text: "اضبط الحد الساعي على 50 رسالة للتوزيع المتساوي", setting: true },
      { text: "فعّل التأخير بين الرسائل: أقل 8 ثواني — أعلى 15 ثانية", setting: true },
      { text: "حجم الدفعة: 10 رسائل ثم توقف 30 ثانية قبل المتابعة", setting: true },
    ],
  },
  {
    title: "🔥 تسخين الرقم الجديد",
    icon: TrendingUp,
    color: "text-warning",
    bgColor: "bg-warning/10",
    items: [
      { text: "الأسبوع الأول: أرسل 10-20 رسالة يومياً فقط لعملاء تعرفهم", warmup: true },
      { text: "الأسبوع الثاني: زِد إلى 30-50 رسالة يومياً", warmup: true },
      { text: "الأسبوع الثالث: زِد إلى 80-100 رسالة يومياً", warmup: true },
      { text: "بعد شهر: يمكنك الوصول إلى 200+ رسالة يومياً بأمان", warmup: true },
      { text: "إذا تم تقييد الرقم خلال التسخين، توقف 24-48 ساعة ثم استأنف بعدد أقل", warmup: true },
    ],
  },
  {
    title: "🆘 ماذا تفعل عند الحظر؟",
    icon: RefreshCw,
    color: "text-info",
    bgColor: "bg-info/10",
    items: [
      { text: "اضغط 'تواصل معنا' في شاشة التقييد بالواتساب لتقديم طلب مراجعة", action: true },
      { text: "انتظر 24-48 ساعة — واتساب عادةً يرد خلال هذه الفترة", action: true },
      { text: "لا تحاول إنشاء حساب جديد على نفس الرقم — سيزيد مدة الحظر", action: true },
      { text: "بعد رفع الحظر، ابدأ بعدد أقل بكثير وزِد تدريجياً", action: true },
      { text: "راجع سبب الحظر وعدّل سلوكك — الحظر المتكرر قد يكون دائم", action: true },
    ],
  },
];

const SafetyGuidePage = () => {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[900px] mx-auto space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-4 animate-fade-in">
        <div className="w-12 h-12 rounded-2xl bg-warning/20 flex items-center justify-center shadow-glow shrink-0">
          <Shield className="w-6 h-6 text-warning" />
        </div>
        <div>
          <h1 className="text-xl font-black text-foreground tracking-tight">دليل حماية حساب واتساب</h1>
          <p className="text-sm text-muted-foreground">نصائح وإرشادات لتجنب الحظر والتقييد</p>
        </div>
      </div>

      {/* Summary Alert */}
      <div className="bg-warning/10 border border-warning/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-foreground mb-1">تنبيه مهم</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              واتساب يراقب سلوك الإرسال باستمرار. الإرسال المفرط أو المتكرر بدون تأخير قد يؤدي لتقييد أو حظر حسابك.
              اتبع النصائح التالية لحماية حسابك وضمان وصول رسائلك.
            </p>
          </div>
        </div>
      </div>

      {/* Sections */}
      {sections.map((section, idx) => (
        <Card key={idx} className="animate-fade-in" style={{ animationDelay: `${idx * 100}ms` }}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-3 text-base">
              <div className={`w-8 h-8 rounded-lg ${section.bgColor} flex items-center justify-center`}>
                <section.icon className={`w-4 h-4 ${section.color}`} />
              </div>
              {section.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {section.items.map((item: any, i) => (
              <div key={i} className="flex items-start gap-3 py-1.5 border-b border-border/50 last:border-0">
                {item.bad ? (
                  <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                ) : item.good ? (
                  <CheckCircle className="w-4 h-4 text-success mt-0.5 shrink-0" />
                ) : item.setting ? (
                  <Zap className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                ) : item.warmup ? (
                  <TrendingUp className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                ) : (
                  <Phone className="w-4 h-4 text-info mt-0.5 shrink-0" />
                )}
                <span className="text-sm text-foreground leading-relaxed">{item.text}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default SafetyGuidePage;

