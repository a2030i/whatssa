import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase, invokeCloud } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, ArrowRight, Mail, KeyRound, MessageSquare, Shield, Zap } from "lucide-react";
import { MessageSquareText } from "lucide-react";

type Step = "email" | "password" | "set-password" | "signup";

const AuthPage = () => {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [userName, setUserName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "صباح الخير";
    if (hour >= 12 && hour < 17) return "مساء الخير";
    return "مساء الخير";
  };

  const handleEmailNext = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsLoading(true);
    try {
      const { data, error } = await invokeCloud("check-email-exists", {
        body: { email: email.trim() },
      });
      if (!data?.exists) {
        toast.error("هذا البريد غير مسجل في النظام — تواصل مع المدير لإضافتك");
        setIsLoading(false);
        return;
      }
      setUserName(data?.profile?.full_name?.split(" ")[0] || "");
      setStep("password");
    } catch {
      setStep("password");
    }
    setIsLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          toast.error("بيانات الدخول غير صحيحة — إذا كنت مستخدم جديد، اضغط 'تعيين كلمة مرور'");
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success("تم تسجيل الدخول بنجاح!");
      }
    } catch (error: any) {
      toast.error(error.message || "حدث خطأ");
    }
    setIsLoading(false);
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
      toast.success("تم إرسال رابط تعيين كلمة المرور إلى بريدك الإلكتروني");
    } catch (error: any) {
      toast.error(error.message || "حدث خطأ");
    }
    setIsLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("الرجاء إدخال الاسم الكامل");
      return;
    }
    if (password.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      toast.success("تم إنشاء الحساب! تحقق من بريدك الإلكتروني للتفعيل.");
    } catch (error: any) {
      toast.error(error.message || "حدث خطأ");
    }
    setIsLoading(false);
  };

  const goBack = () => {
    setStep("email");
    setPassword("");
    setConfirmPassword("");
    setResetSent(false);
  };

  const features = [
    { icon: MessageSquare, text: "إدارة محادثات الواتساب" },
    { icon: Zap, text: "أتمتة ذكية وشات بوت" },
    { icon: Shield, text: "حماية متقدمة وتحكم كامل" },
  ];

  return (
    <div className="min-h-screen flex" dir="rtl">
      {/* Left side - Branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-[55%] gradient-hero relative overflow-hidden items-center justify-center p-12">
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-20 right-20 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-20 left-20 w-96 h-96 bg-info/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/3 rounded-full blur-2xl animate-pulse-soft" />
        </div>

        <div className="relative z-10 max-w-lg text-center space-y-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/30">
            <MessageSquareText className="w-8 h-8 text-primary-glow" />
          </div>
          
          <div className="space-y-3">
            <h1 className="text-3xl font-black text-white/95 leading-tight">
              منصة واحدة لإدارة
              <br />
              <span className="text-primary-glow">تواصل العملاء</span>
            </h1>
            <p className="text-base text-white/50 max-w-sm mx-auto leading-relaxed">
              أدر محادثاتك، أتمت ردودك، وحلّل أداء فريقك من مكان واحد
            </p>
          </div>

          <div className="space-y-3 pt-4">
            {features.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-3 glass-dark rounded-xl px-5 py-3.5 mx-auto max-w-xs"
                style={{ animationDelay: `${i * 150}ms` }}
              >
                <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <f.icon className="w-4.5 h-4.5 text-primary-glow" />
                </div>
                <span className="text-sm font-medium text-white/80">{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background bg-mesh">
        <div className="w-full max-w-[420px] space-y-8 animate-fade-in">
          {/* Logo (mobile only) */}
          <div className="lg:hidden text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/15 flex items-center justify-center border border-primary/20">
              <MessageSquareText className="w-7 h-7 text-primary" />
            </div>
          </div>

          {/* Header */}
          <div className="text-center lg:text-right space-y-2">
            <h2 className="text-2xl font-bold text-foreground">
              {step === "email" && "مرحباً بك 👋"}
              {step === "password" && (
                <>
                  {getGreeting()} {userName ? `يا ${userName}` : ""} 👋
                </>
              )}
              {step === "set-password" && "تعيين كلمة المرور"}
              {step === "signup" && "إنشاء حساب جديد"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {step === "email" && "أدخل بريدك الإلكتروني للمتابعة"}
              {step === "password" && "أدخل كلمة المرور لتسجيل الدخول"}
              {step === "set-password" && "تعيين كلمة مرور جديدة لحسابك"}
              {step === "signup" && "أنشئ حسابك الآن وابدأ مجاناً"}
            </p>
          </div>

          {/* Form Card */}
          <div className="bg-card rounded-2xl shadow-elevated p-7 border border-border/50">

            {/* Step 1: Email */}
            {step === "email" && (
              <>
                <form onSubmit={handleEmailNext} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-semibold">البريد الإلكتروني</Label>
                    <div className="relative">
                      <Input
                        id="email"
                        type="email"
                        placeholder="example@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        dir="ltr"
                        className="pr-10 h-12 rounded-xl bg-secondary/50 border-border/50 focus:bg-card transition-colors"
                      />
                      <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-bold text-sm gap-2 shadow-glow hover:shadow-lg transition-all duration-300">
                    التالي
                    <ArrowRight className="w-4 h-4 rotate-180" />
                  </Button>
                </form>
                <div className="mt-5 text-center">
                  <button
                    type="button"
                    onClick={() => setStep("signup")}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    ليس لديك حساب؟ <span className="font-bold text-primary">أنشئ واحداً</span>
                  </button>
                </div>
              </>
            )}

            {/* Step 2: Password (Login) */}
            {step === "password" && (
              <>
                <div className="mb-5 flex items-center gap-2 bg-secondary/60 rounded-xl px-4 py-2.5 border border-border/30">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground flex-1" dir="ltr">{email}</span>
                  <button onClick={goBack} className="text-xs text-primary font-semibold hover:underline">تغيير</button>
                </div>
                <form onSubmit={handleLogin} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-semibold">كلمة المرور</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        dir="ltr"
                        autoFocus
                        className="h-12 rounded-xl bg-secondary/50 border-border/50 focus:bg-card transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" disabled={isLoading} className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-bold text-sm shadow-glow hover:shadow-lg transition-all duration-300">
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "تسجيل الدخول"}
                  </Button>
                </form>
                <div className="mt-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep("set-password")}
                    className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
                  >
                    <KeyRound className="w-3 h-3" />
                    تعيين / نسيت كلمة المرور
                  </button>
                  <button onClick={goBack} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    ← رجوع
                  </button>
                </div>
              </>
            )}

            {/* Step 3: Set Password */}
            {step === "set-password" && (
              <>
                <div className="mb-5 flex items-center gap-2 bg-secondary/60 rounded-xl px-4 py-2.5 border border-border/30">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground flex-1" dir="ltr">{email}</span>
                  <button onClick={goBack} className="text-xs text-primary font-semibold hover:underline">تغيير</button>
                </div>

                {resetSent ? (
                  <div className="text-center space-y-5 py-4">
                    <div className="w-16 h-16 rounded-2xl gradient-primary-soft flex items-center justify-center mx-auto">
                      <Mail className="w-7 h-7 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground text-lg">تم إرسال الرابط ✅</h3>
                      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                        تحقق من بريدك الإلكتروني واضغط على الرابط لتعيين كلمة المرور الجديدة
                      </p>
                    </div>
                    <Button variant="outline" onClick={goBack} className="w-full h-11 rounded-xl text-sm font-semibold">
                      رجوع لتسجيل الدخول
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSetPassword} className="space-y-5">
                    <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        💡 إذا تم إنشاء حسابك بواسطة المدير أو نسيت كلمة المرور، سنرسل لك رابط لتعيين كلمة مرور جديدة.
                      </p>
                    </div>
                    <Button type="submit" disabled={isLoading} className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-bold text-sm gap-2 shadow-glow hover:shadow-lg transition-all duration-300">
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                        <>
                          <Mail className="w-4 h-4" />
                          إرسال رابط تعيين كلمة المرور
                        </>
                      )}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setStep("password")}
                      className="text-xs text-muted-foreground hover:text-foreground w-full text-center transition-colors"
                    >
                      ← رجوع لتسجيل الدخول
                    </button>
                  </form>
                )}
              </>
            )}

            {/* Step 4: Signup */}
            {step === "signup" && (
              <>
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signupName" className="text-sm font-semibold">الاسم الكامل</Label>
                    <Input
                      id="signupName"
                      type="text"
                      placeholder="أحمد محمد"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      dir="rtl"
                      className="h-12 rounded-xl bg-secondary/50 border-border/50 focus:bg-card transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signupEmail" className="text-sm font-semibold">البريد الإلكتروني</Label>
                    <Input
                      id="signupEmail"
                      type="email"
                      placeholder="example@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      dir="ltr"
                      className="h-12 rounded-xl bg-secondary/50 border-border/50 focus:bg-card transition-colors"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signupPassword" className="text-sm font-semibold">كلمة المرور</Label>
                    <div className="relative">
                      <Input
                        id="signupPassword"
                        type={showPassword ? "text" : "password"}
                        placeholder="6 أحرف على الأقل"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        dir="ltr"
                        className="h-12 rounded-xl bg-secondary/50 border-border/50 focus:bg-card transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" disabled={isLoading} className="w-full h-12 rounded-xl gradient-primary text-primary-foreground font-bold text-sm shadow-glow hover:shadow-lg transition-all duration-300">
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "إنشاء حساب"}
                  </Button>
                </form>
                <div className="mt-5 text-center">
                  <button
                    type="button"
                    onClick={goBack}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    لديك حساب؟ <span className="font-bold text-primary">سجّل دخولك</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="text-center space-y-2">
            <Link to="/" className="text-xs text-primary hover:underline">
              ← العودة للصفحة الرئيسية
            </Link>
            <p className="text-[11px] text-muted-foreground/60">
              © {new Date().getFullYear()} Respondly — جميع الحقوق محفوظة
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;

