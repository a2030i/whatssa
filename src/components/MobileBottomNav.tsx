import { useState } from "react";
import { MessageSquare, Search, Bell, Settings, UserCircle, LogOut, ChevronDown } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const roleLabels: Record<string, string> = {
  admin: "مدير",
  super_admin: "مدير النظام",
  supervisor: "مشرف",
  member: "عضو",
};

const MobileBottomNav = () => {
  const location = useLocation();
  const { profile, userRole, signOut } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  const navItems = [
    { path: "/inbox", icon: MessageSquare, label: "المحادثات" },
    { path: "/customers", icon: UserCircle, label: "العملاء" },
    { path: "/settings", icon: Settings, label: "الإعدادات" },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border flex items-center justify-around h-14 px-1 safe-bottom" dir="rtl">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-lg transition-colors",
              isActive(item.path)
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            <item.icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </NavLink>
        ))}

        {/* Profile button */}
        <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
          <SheetTrigger asChild>
            <button className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-lg text-muted-foreground">
              <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-bold text-primary border border-primary/20">
                {profile?.full_name?.slice(0, 1) || "؟"}
              </div>
              <span className="text-[10px] font-medium">الملف</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8" dir="rtl">
            <div className="flex items-center gap-3 mb-6 mt-2">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center text-lg font-bold text-primary border-2 border-primary/20">
                  {profile?.full_name?.slice(0, 2) || "؟"}
                </div>
                <span className="absolute bottom-0 left-0 w-3 h-3 rounded-full bg-success border-2 border-card" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">{profile?.full_name || "مستخدم"}</p>
                <p className="text-xs text-muted-foreground">
                  {roleLabels[userRole || "member"]} • <span className="text-success">نشط</span>
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <NavLink
                to="/"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-secondary transition-colors"
              >
                <UserCircle className="w-5 h-5 text-muted-foreground" />
                <span>الملف الشخصي</span>
              </NavLink>
              <button
                onClick={() => { signOut(); setProfileOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span>تسجيل خروج</span>
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </>
  );
};

export default MobileBottomNav;
