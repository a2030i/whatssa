import { ReactNode, useEffect, useState } from "react";
import AppSidebar from "./AppSidebar";
import NotificationBell from "./NotificationBell";
import MobileBottomNav from "./MobileBottomNav";
import OnboardingWizard from "./onboarding/OnboardingWizard";
import GlobalSearch from "./GlobalSearch";
import ThemeToggle from "./ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useIsMobile } from "@/hooks/use-mobile";
import useNotificationSound from "@/hooks/useNotificationSound";
import useKeyboardShortcuts from "@/hooks/useKeyboardShortcuts";

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  const { isImpersonating, impersonatedOrgId, stopImpersonation, userRole, profile, isSuperAdmin } = useAuth();
  const effectiveRole = isSuperAdmin ? "admin" : userRole === "admin" ? "admin" : profile?.is_supervisor ? "supervisor" : "member";
  const isAdmin = effectiveRole === "admin";
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [orgName, setOrgName] = useState("");

  // Bottom nav is always visible — when inside a mobile chat, the fixed z-50 overlay covers it
  const hideBottomNav = false;

  // Global hooks
  useNotificationSound();
  useKeyboardShortcuts();

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
      {isAdmin && <AppSidebar />}

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

      {/* Top bar - clean */}
      <div className={`fixed ${isImpersonating ? "top-10" : "top-0"} left-0 right-0 md:right-[250px] h-12 bg-card/90 backdrop-blur-xl flex items-center justify-between px-4 z-30 transition-all`} style={{ boxShadow: 'var(--shadow-xs)' }}>
        <div className="flex items-center gap-2">
          <GlobalSearch />
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <NotificationBell />
        </div>
      </div>
      <main className={`md:mr-[250px] min-h-screen ${isImpersonating ? "pt-[82px]" : "pt-12"} ${isMobile && !hideBottomNav ? "pb-16" : ""} transition-all duration-300`}>
        {children}
      </main>

      {isMobile && !hideBottomNav && <MobileBottomNav />}
      <OnboardingWizard />
    </div>
  );
};

export default AppLayout;
