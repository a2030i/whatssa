import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, CheckCircle2, KeyRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import respondlyLogo from "@/assets/respondly-logo.png";

const ResetPasswordPage = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event from the auth URL hash
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsValidSession(true);
        setChecking(false);
      }
    });

    // Also check if user already has a valid session (came from recovery link)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsValidSession(true);
      }
      setChecking(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("كلمات المرور غير متطابقة");
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setIsSuccess(true);
      toast.success("تم تعيين كلمة المرور بنجاح!");
      setTimeout(() => navigate("/"), 2000);
    } catch (error: any) {
      toast.error(error.message || "حدث خطأ أثناء تعيين كلمة المرور");
    }
    setIsLoading(false);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-[400px] space-y-6">
        <div className="text-center space-y-3">
          <img src={respondlyLogo} alt="Respondly" className="h-14 mx-auto object-contain" />
          <p className="text-sm text-muted-foreground">تعيين كلمة مرور جديدة</p>
        </div>

        <div className="bg-card rounded-xl shadow-card p-6">
          {isSuccess ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">تم تعيين كلمة المرور ✅</h3>
                <p className="text-xs text-muted-foreground mt-2">جاري تحويلك...</p>
              </div>
            </div>
          ) : !isValidSession ? (
            <div className="text-center space-y-4 py-4">
              <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                <KeyRound className="w-7 h-7 text-destructive" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">رابط غير صالح</h3>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  هذا الرابط منتهي الصلاحية أو غير صحيح. اطلب رابط جديد من صفحة تسجيل الدخول.
                </p>
              </div>
              <Button variant="outline" onClick={() => navigate("/auth")} className="w-full text-sm">
                رجوع لتسجيل الدخول
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-sm">كلمة المرور الجديدة</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="6 أحرف على الأقل"
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
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm">تأكيد كلمة المرور</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="أعد إدخال كلمة المرور"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  dir="ltr"
                />
              </div>
              <Button type="submit" disabled={isLoading} className="w-full gradient-whatsapp text-whatsapp-foreground py-5">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "تعيين كلمة المرور"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
