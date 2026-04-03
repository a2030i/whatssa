import { ReactNode, useEffect, useState } from "react";
import AppSidebar from "./AppSidebar";
import NotificationBell from "./NotificationBell";
import MobileBottomNav from "./MobileBottomNav";
import OnboardingWizard from "./onboarding/OnboardingWizard";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useIsMobile } from "@/hooks/use-mobile";
import useNotificationSound from "@/hooks/useNotificationSound";

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  const { isImpersonating, impersonatedOrgId, stopImpersonation } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [orgName, setOrgName] = useState("");

  const hideBottomNav = location.pathname === "/inbox";

  useEffect(() => {
    if (impersonatedOrgId) {
      supabase.from("organizations").select("name").eq("id", impersonatedOrgId).maybeSingle().then(({ data }) => {
        setOrgName(data?.name || "");
      });
    }
  }, [impersonatedOrgId]);

  const handleStopImpersonation = () => {
    stopImpersonation();
    navigate("/admin");
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <AppSidebar />

      {/* Impersonation Banner */}
      {isImpersonating && (
        <div className="fixed top-0 left-0 right-0 z-50 h-10 bg-destructive text-destructive-foreground px-3 md:px-4 flex items-center justify-between gap-2 text-xs">
          <div className="flex min-w-0 items-center gap-2 overflow-hidden">
            <Shield className="w-4 h-4 shrink-0" />
            <span className="truncate">أنت تعرض المنصة كعميل: <strong>{orgName}</strong></span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 text-xs gap-1 text-destructive-foreground hover:bg-destructive-foreground/20"
            onClick={handleStopImpersonation}
          >
            <X className="w-3 h-3" />
            <span className="hidden sm:inline">العودة للسوبر أدمن</span>
          </Button>
        </div>
      )}

      {/* Top bar - glass effect */}
      <div className={`fixed ${isImpersonating ? "top-10" : "top-0"} left-0 right-0 md:right-[250px] h-14 bg-card/60 backdrop-blur-xl border-b border-border/30 flex items-center justify-end px-4 z-30 transition-all`}>
        <NotificationBell />
      </div>
      <main className={`md:mr-[250px] min-h-screen ${isImpersonating ? "pt-[92px]" : "pt-14"} ${isMobile && !hideBottomNav ? "pb-16" : ""} transition-all duration-300`}>
        {children}
      </main>

      {isMobile && !hideBottomNav && <MobileBottomNav />}
    </div>
  );
};

export default AppLayout;
