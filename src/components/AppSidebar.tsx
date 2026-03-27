import { useState } from "react";
import { MessageSquare, BarChart3, Megaphone, Bot, Settings, Users, Menu, X } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "المحادثات", icon: MessageSquare, path: "/" },
  { label: "التحليلات", icon: BarChart3, path: "/analytics" },
  { label: "الحملات", icon: Megaphone, path: "/campaigns" },
  { label: "الأتمتة", icon: Bot, path: "/automation" },
  { label: "الفريق", icon: Users, path: "/team" },
  { label: "الإعدادات", icon: Settings, path: "/settings" },
];

const AppSidebar = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg gradient-whatsapp flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-whatsapp-foreground" />
          </div>
          <span className="text-lg font-bold text-sidebar-accent-foreground tracking-tight">واتس ديسك</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="w-[18px] h-[18px]" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-bold text-sidebar-primary">
            أح
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-sidebar-accent-foreground truncate">أحمد محمد</p>
            <p className="text-[10px] text-sidebar-foreground truncate">مدير النظام</p>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile trigger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 right-3 z-50 w-10 h-10 rounded-lg bg-card shadow-card flex items-center justify-center"
      >
        <Menu className="w-5 h-5 text-foreground" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-foreground/40 z-50" onClick={() => setMobileOpen(false)}>
          <aside
            className="absolute right-0 top-0 h-full w-[240px] gradient-sidebar flex flex-col animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute left-3 top-5 text-sidebar-foreground hover:text-sidebar-accent-foreground"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed right-0 top-0 h-screen w-[220px] gradient-sidebar flex-col z-40">
        {sidebarContent}
      </aside>
    </>
  );
};

export default AppSidebar;
