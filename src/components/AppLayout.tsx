import { ReactNode, useEffect, useState } from "react";
import AppSidebar from "./AppSidebar";
import NotificationBell from "./NotificationBell";
import MobileBottomNav from "./MobileBottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  const { isImpersonating, impersonatedOrgId, stopImpersonation } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [orgName, setOrgName] = useState("");

  // Hide bottom nav on inbox page (it has its own full-screen mobile layout)
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
        <div className="fixed top-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground px-4 py-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span>أنت تعرض المنصة كعميل: <strong>{orgName}</strong></span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 text-destructive-foreground hover:bg-destructive-foreground/20"
            onClick={handleStopImpersonation}
          >
            <X className="w-3 h-3" /> العودة للسوبر أدمن
          </Button>
        </div>
      )}

      {/* Top notification bar */}
      <div className={`fixed ${isImpersonating ? "top-9" : "top-0"} left-0 right-0 md:right-[240px] h-12 bg-card border-b border-border flex items-center justify-end px-4 z-30 transition-all`}>
        <NotificationBell />
      </div>
      <main className={`md:mr-[240px] min-h-screen ${isImpersonating ? "pt-[84px]" : "pt-12"} ${isMobile && !hideBottomNav ? "pb-14" : ""} transition-all duration-300`}>
        {children}
      </main>

      {/* Mobile bottom navigation */}
      {isMobile && !hideBottomNav && <MobileBottomNav />}
    </div>
  );
};

export default AppLayout;
