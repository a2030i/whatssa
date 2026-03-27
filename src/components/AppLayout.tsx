import { ReactNode } from "react";
import AppSidebar from "./AppSidebar";

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <AppSidebar />
      <main className="md:mr-[220px] min-h-screen">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
