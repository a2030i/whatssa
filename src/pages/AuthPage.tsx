import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, ArrowRight, Mail, KeyRound } from "lucide-react";
import respondlyLogo from "@/assets/respondly-logo.png";

type Step = "email" | "password" | "set-password" | "signup";

const AuthPage = () => {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleEmailNext = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStep("password");
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


  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-[400px] space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl gradient-whatsapp flex items-center justify-center mx-auto shadow-lg">
            <MessageSquare className="w-8 h-8 text-whatsapp-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Respondly</h1>
          <p className="text-sm text-muted-foreground">
            {step === "email" && "أدخل بريدك الإلكتروني للمتابعة"}
            {step === "password" && "أدخل كلمة المرور لتسجيل الدخول"}
            {step === "set-password" && "تعيين كلمة مرور جديدة لحسابك"}
            {step === "signup" && "أنشئ حسابك الآن وابدأ مجاناً"}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-card rounded-xl shadow-card p-6">

          {/* Step 1: Email */}
          {step === "email" && (
            <>
              <form onSubmit={handleEmailNext} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm">البريد الإلكتروني</Label>
                  <div className="relative">
                    <Input
                      id="email"
                      type="email"
                      placeholder="example@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      dir="ltr"
                      className="pr-10"
                    />
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
                <Button type="submit" className="w-full gradient-whatsapp text-whatsapp-foreground py-5 gap-2">
                  التالي
                  <ArrowRight className="w-4 h-4 rotate-180" />
                </Button>
              </form>
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setStep("signup")}
                  className="text-sm text-primary hover:underline"
                >
                  ليس لديك حساب؟ أنشئ واحداً
                </button>
              </div>
            </>
          )}

          {/* Step 2: Password (Login) */}
          {step === "password" && (
            <>
              <div className="mb-4 flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2">
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground flex-1" dir="ltr">{email}</span>
                <button onClick={goBack} className="text-xs text-primary hover:underline">تغيير</button>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm">كلمة المرور</Label>
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
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" disabled={isLoading} className="w-full gradient-whatsapp text-whatsapp-foreground py-5">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "تسجيل الدخول"}
                </Button>
              </form>
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep("set-password")}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <KeyRound className="w-3 h-3" />
                  تعيين / نسيت كلمة المرور
                </button>
                <button onClick={goBack} className="text-xs text-muted-foreground hover:text-foreground">
                  ← رجوع
                </button>
              </div>
            </>
          )}

          {/* Step 3: Set Password (for new admin-created users or forgot) */}
          {step === "set-password" && (
            <>
              <div className="mb-4 flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2">
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground flex-1" dir="ltr">{email}</span>
                <button onClick={goBack} className="text-xs text-primary hover:underline">تغيير</button>
              </div>

              {resetSent ? (
                <div className="text-center space-y-4 py-4">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <Mail className="w-7 h-7 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">تم إرسال الرابط ✅</h3>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                      تحقق من بريدك الإلكتروني واضغط على الرابط لتعيين كلمة المرور الجديدة
                    </p>
                  </div>
                  <Button variant="outline" onClick={goBack} className="w-full text-sm">
                    رجوع لتسجيل الدخول
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSetPassword} className="space-y-4">
                  <div className="bg-primary/5 rounded-lg p-3">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      💡 إذا تم إنشاء حسابك بواسطة المدير أو نسيت كلمة المرور، سنرسل لك رابط لتعيين كلمة مرور جديدة.
                    </p>
                  </div>
                  <Button type="submit" disabled={isLoading} className="w-full gradient-whatsapp text-whatsapp-foreground py-5 gap-2">
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
                    className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
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
                  <Label htmlFor="signupName" className="text-sm">الاسم الكامل</Label>
                  <Input
                    id="signupName"
                    type="text"
                    placeholder="أحمد محمد"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    dir="rtl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signupEmail" className="text-sm">البريد الإلكتروني</Label>
                  <Input
                    id="signupEmail"
                    type="email"
                    placeholder="example@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signupPassword" className="text-sm">كلمة المرور</Label>
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
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" disabled={isLoading} className="w-full gradient-whatsapp text-whatsapp-foreground py-5">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "إنشاء حساب"}
                </Button>
              </form>
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={goBack}
                  className="text-sm text-primary hover:underline"
                >
                  لديك حساب؟ سجّل دخولك
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
