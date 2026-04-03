import { Link } from "react-router-dom";
import {
  MessageSquare, Bot, BarChart3, Users, Zap, Shield, Globe, ArrowLeft,
  CheckCircle2, Star, ClipboardCheck, Mail, Truck, FileText, Workflow,
  ShoppingCart, Package, Headphones, Clock, Send
} from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  { icon: MessageSquare, title: "صندوق وارد موحد", desc: "إدارة جميع محادثات واتساب من مكان واحد مع دعم متعدد الأرقام والقنوات" },
  { icon: Bot, title: "شات بوت ذكي", desc: "ردود تلقائية بالذكاء الاصطناعي مع قاعدة معرفة خاصة بمؤسستك وتصحيح الردود من الفريق" },
  { icon: Users, title: "إدارة الفريق", desc: "توزيع المحادثات تلقائياً بين أعضاء الفريق مع تتبع الأداء والشفتات" },
  { icon: BarChart3, title: "تحليلات متقدمة", desc: "تقارير مفصلة عن الأداء والمبيعات ورضا العملاء مع مقارنة الفترات" },
  { icon: Workflow, title: "أتمتة كاملة", desc: "قواعد ذكية لتصنيف وتوجيه المحادثات والردود التلقائية والكلمات المفتاحية" },
  { icon: Shield, title: "أمان عالي", desc: "تشفير كامل للبيانات مع صلاحيات متعددة المستويات وسجل تدقيق" },
  { icon: ClipboardCheck, title: "نظام المهام", desc: "إدارة المهام الداخلية وتوجيه الملاحظات لشركات الشحن تلقائياً عبر واتساب أو إيميل" },
  { icon: Truck, title: "ربط شركات الشحن", desc: "توجيه تلقائي للملاحظات والطلبات لقروبات واتساب أو إيميل شركات الشحن" },
  { icon: ShoppingCart, title: "ربط المتاجر", desc: "دعم سلة، زد، Shopify، WooCommerce مع إشعارات الطلبات والسلات المتروكة" },
  { icon: FileText, title: "نماذج واتساب", desc: "فورمات تفاعلية داخل واتساب لجمع البيانات والتعديلات بدون روابط خارجية" },
  { icon: Send, title: "حملات تسويقية", desc: "حملات جماعية مع دعم التكرار وتتبع التسليم والقراءة والاستجابة" },
  { icon: Headphones, title: "رضا العملاء (CSAT)", desc: "استبيانات رضا تلقائية بعد إغلاق المحادثات مع تقارير مفصلة" },
];

const plans = [
  { name: "أساسي", price: "199", period: "/شهر", features: ["رقم واحد", "عضو واحد", "1,000 رسالة", "شات بوت أساسي", "نظام المهام"] },
  { name: "احترافي", price: "499", period: "/شهر", popular: true, features: ["3 أرقام", "5 أعضاء", "10,000 رسالة", "AI ذكي + قاعدة معرفة", "حملات + أتمتة", "ربط متجر + شحن", "توجيه تلقائي", "CSAT"] },
  { name: "مؤسسي", price: "999", period: "/شهر", features: ["أرقام لا محدودة", "أعضاء لا محدود", "رسائل لا محدودة", "API كامل", "نماذج واتساب", "ربط إيميل", "دعم مخصص"] },
];

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold">Respondly</span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">المميزات</a>
            <a href="#use-cases" className="text-muted-foreground hover:text-foreground transition-colors">حالات الاستخدام</a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">الأسعار</a>
          </div>
          <Link to="/auth">
            <Button size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              ابدأ مجاناً
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="py-20 md:py-32 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium">
            <Zap className="w-4 h-4" />
            منصة إدارة واتساب الأعمال الأذكى
          </div>
          <h1 className="text-4xl md:text-6xl font-bold leading-tight">
            حوّل واتساب إلى{" "}
            <span className="text-primary">محرك نمو</span>{" "}
            لعملك
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            صندوق وارد موحد، شات بوت ذكي بالذكاء الاصطناعي، نظام مهام متكامل، توجيه تلقائي لشركات الشحن — كل ما تحتاجه لإدارة تواصلك مع العملاء باحترافية
          </p>
          <div className="flex items-center justify-center gap-3 pt-4">
            <Link to="/auth">
              <Button size="lg" className="gap-2 text-base px-8 h-12">
                ابدأ تجربة مجانية
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
          </div>
          <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground pt-2">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-primary" /> 7 أيام مجاناً</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-primary" /> بدون بطاقة</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-primary" /> إعداد في 5 دقائق</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">كل ما تحتاجه في منصة واحدة</h2>
            <p className="text-muted-foreground mt-2">أدوات احترافية لإدارة تواصلك مع العملاء عبر واتساب</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={i} className="bg-card rounded-2xl p-5 border border-border hover:border-primary/30 hover:shadow-lg transition-all duration-300 group">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-base font-bold mb-1.5">{f.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section id="use-cases" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">حالات استخدام حقيقية</h2>
            <p className="text-muted-foreground mt-2">كيف يخدم Respondly أعمالك</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                title: "🚚 شركات الشحن والتوصيل",
                desc: "استقبل ملاحظات العملاء تلقائياً، وجّهها لقروب شركة الشحن أو إيميلها مباشرة، وأغلق المحادثة — بدون تدخل بشري. التعديلات البسيطة (تغيير جوال أو عنوان) تُجمع عبر فورم واتساب وتنزل كتاسك للموظف.",
              },
              {
                title: "🛍️ المتاجر الإلكترونية",
                desc: "ربط مباشر مع سلة وزد وShopify. إشعارات فورية للطلبات الجديدة والسلات المتروكة. تتبع الشحنات وإرسال التحديثات للعملاء تلقائياً عبر واتساب.",
              },
              {
                title: "🏢 خدمة العملاء",
                desc: "شات بوت ذكي يرد من قاعدة معرفة مؤسستك. الاستفسارات المعقدة تُحوّل تلقائياً لموظف بشري. تقييم رضا العملاء بعد كل محادثة.",
              },
              {
                title: "📢 الحملات التسويقية",
                desc: "حملات جماعية مع تخصيص المتغيرات لكل عميل. جدولة وتكرار تلقائي. تتبع معدلات التسليم والقراءة والردود مع تقارير تفصيلية.",
              },
            ].map((uc, i) => (
              <div key={i} className="bg-card rounded-2xl p-6 border border-border">
                <h3 className="text-lg font-bold mb-3">{uc.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{uc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Section */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-accent text-accent-foreground rounded-full px-4 py-1.5 text-sm font-medium">
            <Bot className="w-4 h-4" />
            ذكاء اصطناعي متقدم
          </div>
          <h2 className="text-3xl font-bold">رد تلقائي ذكي يتعلم من مؤسستك</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            أنشئ قاعدة معرفة خاصة بمؤسستك ودع الذكاء الاصطناعي يرد على عملائك بدقة. فريقك يقدر يصحح ويحسّن الردود باستمرار
          </p>
          <div className="grid md:grid-cols-3 gap-4 pt-6">
            {[
              { icon: Globe, title: "قاعدة معرفة مخصصة", desc: "أضف معلومات مؤسستك ومنتجاتك وسياساتك" },
              { icon: Bot, title: "رد ذكي تلقائي", desc: "AI يرد بناءً على معرفة مؤسستك فقط" },
              { icon: Star, title: "تحسين مستمر", desc: "الفريق يصحح الردود والـ AI يتعلم" },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="bg-card rounded-xl p-5 border border-border text-right">
                  <Icon className="w-8 h-8 text-primary mb-3" />
                  <h4 className="font-bold mb-1">{item.title}</h4>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">خطط تناسب عملك</h2>
            <p className="text-muted-foreground mt-2">ابدأ مجاناً وارتقِ حسب احتياجك</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan, i) => (
              <div key={i} className={`bg-card rounded-2xl p-6 border-2 transition-all ${plan.popular ? "border-primary shadow-xl scale-105" : "border-border"}`}>
                {plan.popular && (
                  <div className="bg-primary text-primary-foreground text-xs font-bold rounded-full px-3 py-1 inline-block mb-3">
                    الأكثر طلباً
                  </div>
                )}
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <div className="mt-3 mb-5">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground text-sm"> ر.س{plan.period}</span>
                </div>
                <ul className="space-y-2 mb-6">
                  {plan.features.map((f, fi) => (
                    <li key={fi} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to="/auth">
                  <Button className="w-full" variant={plan.popular ? "default" : "outline"}>
                    ابدأ الآن
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-4 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <MessageSquare className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="font-bold">Respondly</span>
          </div>
          <p className="text-sm text-muted-foreground">© 2025 Respondly. جميع الحقوق محفوظة.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
