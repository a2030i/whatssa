import { Link } from "react-router-dom";
import { useState } from "react";
import {
  MessageSquare, Bot, BarChart3, Users, Zap, Shield, Globe, ArrowLeft,
  CheckCircle2, Star, ClipboardCheck, FileText, Workflow,
  ShoppingCart, Headphones, Send, Play, ChevronLeft, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
const features = [
  { icon: MessageSquare, title: "صندوق وارد موحد", desc: "إدارة جميع محادثات واتساب من مكان واحد مع دعم أرقام متعددة وقنوات رسمية وغير رسمية" },
  { icon: Bot, title: "ذكاء اصطناعي متقدم", desc: "رد تلقائي ذكي من قاعدة معرفة مؤسستك مع تصحيح مستمر من الفريق" },
  { icon: Users, title: "إدارة الفريق", desc: "توزيع تلقائي للمحادثات مع تتبع الأداء وجدولة الشفتات والصلاحيات" },
  { icon: Workflow, title: "أتمتة ذكية", desc: "قواعد تصنيف وتوجيه تلقائي بالكلمات المفتاحية مع شات بوت تفاعلي متعدد المستويات" },
  { icon: ShoppingCart, title: "ربط المتاجر", desc: "سلة، زد، Shopify، WooCommerce — إشعارات الطلبات والسلات المتروكة تلقائياً" },
  { icon: Send, title: "حملات تسويقية", desc: "حملات جماعية مع جدولة وتكرار وتتبع التسليم والقراءة لكل مستلم" },
  { icon: ClipboardCheck, title: "نظام المهام", desc: "مهام داخلية من الشات بوت أو يدوية مع إسناد وتتبع الحالة والأولوية" },
  { icon: FileText, title: "نماذج واتساب", desc: "فورمات تفاعلية داخل واتساب لجمع البيانات بدون روابط خارجية" },
  { icon: BarChart3, title: "تحليلات شاملة", desc: "تقارير أداء الفريق والمحادثات والمبيعات مع مقارنة الفترات الزمنية" },
  { icon: Headphones, title: "رضا العملاء", desc: "استبيانات CSAT تلقائية بعد إغلاق المحادثات مع تقارير تفصيلية" },
];

const showcaseSlides = [
  { img: inboxImg, title: "صندوق الوارد الذكي", desc: "واجهة احترافية لإدارة كل محادثاتك مع عرض معلومات العميل والطلبات" },
  { img: analyticsImg, title: "تحليلات وتقارير", desc: "لوحة تحكم شاملة مع رسوم بيانية ومؤشرات أداء لحظية" },
  { img: chatbotImg, title: "الشات بوت والأتمتة", desc: "محرر بصري لبناء تدفقات الشات بوت مع معاينة حية" },
];

const plans = [
  { name: "أساسي", price: "199", period: "/شهر", features: ["رقم واحد", "عضو واحد", "1,000 رسالة", "شات بوت أساسي", "نظام المهام"] },
  { name: "احترافي", price: "499", period: "/شهر", popular: true, features: ["3 أرقام", "5 أعضاء", "10,000 رسالة", "AI ذكي + قاعدة معرفة", "حملات + أتمتة", "ربط متجر", "CSAT + تقارير"] },
  { name: "مؤسسي", price: "999", period: "/شهر", features: ["أرقام لا محدودة", "أعضاء لا محدود", "رسائل لا محدودة", "API كامل", "نماذج واتساب", "دعم مخصص"] },
];

const stats = [
  { value: "+500", label: "مؤسسة فعّالة" },
  { value: "+2M", label: "رسالة شهرياً" },
  { value: "99.9%", label: "وقت تشغيل" },
  { value: "4.8★", label: "تقييم العملاء" },
];

const LandingPage = () => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = () => setCurrentSlide((p) => (p + 1) % showcaseSlides.length);
  const prevSlide = () => setCurrentSlide((p) => (p - 1 + showcaseSlides.length) % showcaseSlides.length);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg shadow-primary/20">
              <MessageSquare className="w-4.5 h-4.5 text-primary-foreground" />
            </div>
            <span className="text-lg font-extrabold tracking-tight">Respondly</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">المميزات</a>
            <a href="#showcase" className="text-muted-foreground hover:text-foreground transition-colors">المنصة</a>
            <a href="#use-cases" className="text-muted-foreground hover:text-foreground transition-colors">حالات الاستخدام</a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">الأسعار</a>
          </div>
          <Link to="/auth">
            <Button size="sm" className="gap-2 rounded-xl shadow-md shadow-primary/20">
              <ArrowLeft className="w-4 h-4" />
              ابدأ مجاناً
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] bg-primary/3 rounded-full blur-3xl" />
        </div>

        <div className="py-20 md:py-28 px-4">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-5 py-2 text-sm font-semibold border border-primary/20">
              <Zap className="w-4 h-4" />
              منصة إدارة واتساب الأعمال #1 في العالم العربي
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black leading-[1.1] tracking-tight">
              حوّل واتساب إلى
              <br />
              <span className="bg-gradient-to-l from-primary to-primary/60 bg-clip-text text-transparent">محرك نمو لعملك</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              صندوق وارد موحد، ذكاء اصطناعي يتعلم من مؤسستك، أتمتة ذكية، وتحليلات متقدمة — كل ما تحتاجه في منصة واحدة
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link to="/auth">
                <Button size="lg" className="gap-2 text-base px-8 h-13 rounded-xl shadow-xl shadow-primary/25 hover:shadow-primary/40 transition-shadow">
                  ابدأ تجربة مجانية
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <a href="#showcase">
                <Button variant="outline" size="lg" className="gap-2 text-base px-8 h-13 rounded-xl">
                  <Play className="w-4 h-4" />
                  شاهد المنصة
                </Button>
              </a>
            </div>
            <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground pt-2">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-primary" /> 7 أيام مجاناً</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-primary" /> بدون بطاقة</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-primary" /> إعداد في 5 دقائق</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-6 border-y border-border/50 bg-muted/20">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((s, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl md:text-3xl font-black text-primary">{s.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Showcase / Screenshots */}
      <section id="showcase" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold">شاهد المنصة من الداخل</h2>
            <p className="text-muted-foreground mt-3">واجهة احترافية مصممة لفرق العمل العربية</p>
          </div>

          <div className="relative">
            {/* Screenshot */}
            <div className="rounded-2xl overflow-hidden border-2 border-border/50 shadow-2xl bg-card">
              <img
                src={showcaseSlides[currentSlide].img}
                alt={showcaseSlides[currentSlide].title}
                className="w-full aspect-video object-cover"
                loading="lazy"
                width={1280}
                height={720}
              />
            </div>

            {/* Caption */}
            <div className="text-center mt-6">
              <h3 className="text-xl font-bold">{showcaseSlides[currentSlide].title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{showcaseSlides[currentSlide].desc}</p>
            </div>

            {/* Nav */}
            <div className="flex items-center justify-center gap-4 mt-5">
              <Button variant="outline" size="icon" className="rounded-full h-10 w-10" onClick={prevSlide}>
                <ChevronRight className="w-5 h-5" />
              </Button>
              <div className="flex gap-2">
                {showcaseSlides.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentSlide(i)}
                    className={`w-2.5 h-2.5 rounded-full transition-all ${i === currentSlide ? "bg-primary w-7" : "bg-muted-foreground/30"}`}
                  />
                ))}
              </div>
              <Button variant="outline" size="icon" className="rounded-full h-10 w-10" onClick={nextSlide}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 bg-muted/20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-xs font-semibold mb-4">
              المميزات
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">كل ما تحتاجه في منصة واحدة</h2>
            <p className="text-muted-foreground mt-3 max-w-lg mx-auto">أدوات احترافية متكاملة لإدارة تواصلك مع العملاء عبر واتساب</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={i} className="bg-card rounded-2xl p-5 border border-border/50 hover:border-primary/30 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center mb-4 group-hover:from-primary/25 group-hover:to-primary/10 transition-colors">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-bold mb-1.5">{f.title}</h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section id="use-cases" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-accent text-accent-foreground rounded-full px-4 py-1.5 text-xs font-semibold mb-4">
              حالات الاستخدام
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">كيف يخدم Respondly أعمالك</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            {[
              {
                emoji: "🚚",
                title: "شركات الشحن والتوصيل",
                desc: "استقبل ملاحظات العملاء وأنشئ مهام للموظفين تلقائياً. التعديلات البسيطة تُجمع عبر فورم واتساب وتوزّع كتاسكات.",
                tags: ["المهام", "فورم واتساب", "شات بوت"],
              },
              {
                emoji: "🛍️",
                title: "المتاجر الإلكترونية",
                desc: "ربط مع سلة وزد وShopify. إشعارات فورية للطلبات والسلات المتروكة وتتبع الشحنات.",
                tags: ["سلة", "زد", "Shopify", "أتمتة"],
              },
              {
                emoji: "🏢",
                title: "خدمة العملاء",
                desc: "شات بوت ذكي يرد من قاعدة معرفتك. الاستفسارات المعقدة تُحوّل لموظف. تقييم رضا بعد كل محادثة.",
                tags: ["AI", "قاعدة معرفة", "CSAT"],
              },
              {
                emoji: "📢",
                title: "الحملات التسويقية",
                desc: "حملات جماعية مع تخصيص لكل عميل. جدولة وتكرار تلقائي مع تتبع التسليم والقراءة.",
                tags: ["حملات", "تكرار", "تقارير"],
              },
            ].map((uc, i) => (
              <div key={i} className="bg-card rounded-2xl p-6 border border-border/50 hover:shadow-lg transition-shadow">
                <div className="text-3xl mb-3">{uc.emoji}</div>
                <h3 className="text-lg font-bold mb-2">{uc.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">{uc.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {uc.tags.map((tag, ti) => (
                    <span key={ti} className="bg-primary/10 text-primary text-[10px] font-medium px-2.5 py-1 rounded-full">{tag}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Section */}
      <section className="py-20 px-4 bg-muted/20 relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-10 left-1/3 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
        </div>
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-5 py-2 text-sm font-semibold border border-primary/20">
            <Bot className="w-4 h-4" />
            ذكاء اصطناعي متقدم
          </div>
          <h2 className="text-3xl md:text-4xl font-bold">رد تلقائي ذكي يتعلم من مؤسستك</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            أنشئ قاعدة معرفة خاصة بمؤسستك ودع الذكاء الاصطناعي يرد على عملائك بدقة. فريقك يصحح ويحسّن الردود باستمرار
          </p>
          <div className="grid md:grid-cols-3 gap-5 pt-8">
            {[
              { icon: Globe, title: "قاعدة معرفة مخصصة", desc: "أضف معلومات مؤسستك ومنتجاتك وسياساتك والـ AI يرد منها فقط" },
              { icon: Bot, title: "رد ذكي سياقي", desc: "يفهم سياق المحادثة ويرد بناءً على التاريخ والمعلومات المتاحة" },
              { icon: Star, title: "تعلّم مستمر", desc: "الفريق يصحح الردود الخاطئة والنظام يتعلم ويتحسن تلقائياً" },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="bg-card rounded-2xl p-6 border border-border/50 text-right hover:shadow-lg transition-shadow">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <h4 className="font-bold mb-2">{item.title}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-xs font-semibold mb-4">
              الأسعار
            </div>
            <h2 className="text-3xl md:text-4xl font-bold">خطط تناسب عملك</h2>
            <p className="text-muted-foreground mt-3">ابدأ مجاناً وارتقِ حسب احتياجك</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan, i) => (
              <div key={i} className={`bg-card rounded-2xl p-7 border-2 transition-all relative ${plan.popular ? "border-primary shadow-2xl shadow-primary/10 scale-[1.03]" : "border-border/50"}`}>
                {plan.popular && (
                  <div className="absolute -top-3 right-6 bg-gradient-to-l from-primary to-primary/80 text-primary-foreground text-xs font-bold rounded-full px-4 py-1.5 shadow-lg">
                    الأكثر طلباً ⭐
                  </div>
                )}
                <h3 className="text-xl font-bold mt-2">{plan.name}</h3>
                <div className="mt-4 mb-6">
                  <span className="text-4xl font-black">{plan.price}</span>
                  <span className="text-muted-foreground text-sm"> ر.س{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f, fi) => (
                    <li key={fi} className="flex items-center gap-2.5 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to="/auth">
                  <Button className={`w-full rounded-xl h-11 ${plan.popular ? "shadow-lg shadow-primary/20" : ""}`} variant={plan.popular ? "default" : "outline"}>
                    ابدأ الآن
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-3xl p-10 md:p-14 border border-primary/20">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">جاهز تبدأ؟</h2>
          <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
            انضم لأكثر من 500 مؤسسة تستخدم Respondly لإدارة تواصلها مع العملاء
          </p>
          <Link to="/auth">
            <Button size="lg" className="gap-2 text-base px-10 h-13 rounded-xl shadow-xl shadow-primary/25">
              ابدأ تجربتك المجانية الآن
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border/50">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
              <MessageSquare className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold">Respondly</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">المميزات</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">الأسعار</a>
            <Link to="/auth" className="hover:text-foreground transition-colors">تسجيل الدخول</Link>
          </div>
          <p className="text-xs text-muted-foreground">© 2025 Respondly. جميع الحقوق محفوظة.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
