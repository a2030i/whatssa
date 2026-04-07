import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, MessageSquare, Users, Plug, ArrowLeft, Sparkles, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  title: string;
  description: string;
  icon: typeof Plug;
  completed: boolean;
  action: () => void;
  actionLabel: string;
}

const OnboardingWizard = () => {
  const { orgId, profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [hasChannel, setHasChannel] = useState(false);
  const [hasTeamMember, setHasTeamMember] = useState(false);
  const [hasConversation, setHasConversation] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;

    const checkProgress = async () => {
      setLoading(true);

      // Check if dismissed from localStorage
      const dismissedKey = `onboarding_dismissed_${orgId}`;
      if (localStorage.getItem(dismissedKey) === "true") {
        setDismissed(true);
        setLoading(false);
        return;
      }

      const [channelRes, teamRes, convRes] = await Promise.all([
        supabase.rpc("get_org_whatsapp_channels").then(r => r.data),
        supabase.from("profiles").select("id").eq("org_id", orgId).eq("is_active", true),
        supabase.from("conversations").select("id").eq("org_id", orgId).limit(1),
      ]);

      const channels = (channelRes || []).filter((c: any) => c.is_connected);
      setHasChannel(channels.length > 0);
      setHasTeamMember((teamRes.data?.length || 0) > 1);
      setHasConversation((convRes.data?.length || 0) > 0);

      // Auto-show if not all steps completed
      const allDone = channels.length > 0 && (teamRes.data?.length || 0) > 1 && (convRes.data?.length || 0) > 0;
      if (allDone) {
        localStorage.setItem(dismissedKey, "true");
        setDismissed(true);
      } else {
        setOpen(true);
      }

      setLoading(false);
    };

    checkProgress();
  }, [orgId]);

  if (loading || dismissed) return null;

  const steps: Step[] = [
    {
      id: "channel",
      title: "اربط رقم واتساب",
      description: "اربط رقمك الأول لبدء استقبال المحادثات",
      icon: Plug,
      completed: hasChannel,
      action: () => { setOpen(false); navigate("/integrations"); },
      actionLabel: "اربط الآن",
    },
    {
      id: "team",
      title: "أضف فريقك",
      description: "أضف موظف واحد على الأقل لتوزيع المحادثات",
      icon: Users,
      completed: hasTeamMember,
      action: () => { setOpen(false); navigate("/team"); },
      actionLabel: "أضف موظف",
    },
    {
      id: "conversation",
      title: "أرسل أول رسالة",
      description: "ابدأ محادثة مع عميل أو جرّب الإرسال لنفسك",
      icon: MessageSquare,
      completed: hasConversation,
      action: () => { setOpen(false); navigate("/inbox"); },
      actionLabel: "فتح صندوق الوارد",
    },
  ];

  const completedCount = steps.filter(s => s.completed).length;
  const progress = (completedCount / steps.length) * 100;
  const allDone = completedCount === steps.length;

  const handleDismiss = () => {
    if (orgId) localStorage.setItem(`onboarding_dismissed_${orgId}`, "true");
    setDismissed(true);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setOpen(false); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden" dir="rtl">
        {/* Header */}
        <div className="p-6 pb-4 bg-gradient-to-bl from-primary/10 via-background to-background">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Rocket className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold">مرحباً {profile?.full_name?.split(" ")[0] || ""} 👋</h2>
              <p className="text-xs text-muted-foreground">أكمل الخطوات التالية للبدء</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Progress value={progress} className="h-2 flex-1" />
            <span className="text-xs font-bold text-muted-foreground">{completedCount}/{steps.length}</span>
          </div>
        </div>

        {/* Steps */}
        <div className="px-6 pb-2 space-y-3">
          {steps.map((step) => (
            <div
              key={step.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border transition-all",
                step.completed
                  ? "bg-success/5 border-success/20"
                  : "bg-card border-border hover:border-primary/30"
              )}
            >
              <div className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                step.completed ? "bg-success/10" : "bg-secondary"
              )}>
                {step.completed ? (
                  <CheckCircle2 className="w-5 h-5 text-success" />
                ) : (
                  <step.icon className="w-4 h-4 text-muted-foreground" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-semibold", step.completed && "line-through text-muted-foreground")}>{step.title}</p>
                <p className="text-[11px] text-muted-foreground">{step.description}</p>
              </div>

              {!step.completed && (
                <Button size="sm" variant="outline" className="shrink-0 text-xs h-8" onClick={step.action}>
                  {step.actionLabel}
                  <ArrowLeft className="w-3 h-3 mr-1" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-2 space-y-2">
          {allDone ? (
            <Button className="w-full gap-2" onClick={handleDismiss}>
              <Sparkles className="w-4 h-4" /> ابدأ استخدام المنصة
            </Button>
          ) : (
            <>
              <button
                onClick={() => setOpen(false)}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-2 transition-colors"
              >
                تخطي — سأكمل لاحقاً
              </button>
              <button
                onClick={handleDismiss}
                className="w-full text-center text-[11px] text-destructive/60 hover:text-destructive py-1 transition-colors"
              >
                لا تظهر مرة أخرى
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingWizard;
