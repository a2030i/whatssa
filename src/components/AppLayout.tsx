import { ReactNode, createContext, useContext, useState } from "react";
import AppSidebar from "./AppSidebar";

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <AppSidebar />
      <main className="md:mr-[240px] min-h-screen transition-all duration-300">
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
