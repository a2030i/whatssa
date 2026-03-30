import { ReactNode } from "react";
import AppSidebar from "./AppSidebar";
import NotificationBell from "./NotificationBell";

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <AppSidebar />
      {/* Top notification bar */}
      <div className="fixed top-0 left-0 right-0 md:right-[240px] h-12 bg-card border-b border-border flex items-center justify-end px-4 z-30">
        <NotificationBell />
      </div>
      <main className="md:mr-[240px] min-h-screen pt-12 transition-all duration-300">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
