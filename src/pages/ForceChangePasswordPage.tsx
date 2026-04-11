import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuthReady, waitForAuthSession } from "@/hooks/useAuthReady";

const ForceChangePasswordPage = () => {
  const { user } = useAuth();
  const { isReady, session, user: readyUser } = useAuthReady();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const currentUser = readyUser ?? user;

  useEffect(() => {
    if (isReady && !currentUser) {
      window.location.href = "/auth";
    }
  }, [isReady, currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (password !== confirm) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }
    setLoading(true);
    try {
      const activeSession = session ?? (await waitForAuthSession());
      if (!activeSession || !currentUser) {
        throw new Error("جلسة الدخول لم تكتمل بعد، أعد المحاولة الآن");
      }

      // Update password and clear must_change_password in a single call
      const { error } = await supabase.auth.updateUser({
        password,
        data: { must_change_password: false },
      });
      if (error) throw error;

      toast.success("تم تغيير كلمة المرور بنجاح — سجّل دخولك بالكلمة الجديدة");
      await supabase.auth.signOut();
      window.location.href = "/auth";
    } catch (err: any) {
      console.error("Password change error:", err);
      toast.error(err.message || "حدث خطأ");
    }
    setLoading(false);
  };

  if (!isReady || !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span>جاري تجهيز جلسة الدخول...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">تغيير كلمة المرور</h1>
          <p className="text-muted-foreground text-sm">
            يجب تعيين كلمة مرور جديدة قبل المتابعة
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-card border rounded-xl p-6">
          <div className="space-y-2">
            <Label>كلمة المرور الجديدة</Label>
            <div className="relative">
              <Input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور الجديدة"
                className="pl-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>تأكيد كلمة المرور</Label>
            <Input
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="أعد إدخال كلمة المرور"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "جاري التحديث..." : "تحديث كلمة المرور"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ForceChangePasswordPage;

