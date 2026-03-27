import { useState } from "react";
import { MessageSquare, BarChart3, Megaphone, Bot, Settings, Users, Menu, X, FileText, Shield, LogOut, Wallet, UserCircle, CreditCard, Plug, ShoppingCart, ShoppingBag, ChevronDown } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

interface NavItem {
  label: string;
  icon: any;
  path: string;
  ecommerceOnly?: boolean;
}

interface NavGroup {
  label: string;
  icon: any;
  items: NavItem[];
}

const buildGroups = (isEcommerce: boolean): (NavItem | NavGroup)[] => [
  { label: "المحادثات", icon: MessageSquare, path: "/" },
  { label: "العملاء", icon: UserCircle, path: "/customers" },
  // E-commerce group
  ...(isEcommerce ? [{
    label: "المتجر",
    icon: ShoppingBag,
    items: [
      { label: "الطلبات", icon: ShoppingCart, path: "/orders" },
      { label: "السلات المتروكة", icon: ShoppingBag, path: "/abandoned-carts" },
    ],
  } as NavGroup] : []),
  // Marketing group
  {
    label: "التسويق",
    icon: Megaphone,
    items: [
      { label: "الحملات", icon: Megaphone, path: "/campaigns" },
      { label: "القوالب", icon: FileText, path: "/templates" },
      { label: "الأتمتة", icon: Bot, path: "/automation" },
    ],
  },
  { label: "التحليلات", icon: BarChart3, path: "/analytics" },
  // Management group
  {
    label: "الإدارة",
    icon: Settings,
    items: [
      { label: "الفريق", icon: Users, path: "/team" },
      { label: "الباقات", icon: CreditCard, path: "/plans" },
      { label: "المحفظة", icon: Wallet, path: "/wallet" },
      { label: "الربط والتكامل", icon: Plug, path: "/integrations" },
      { label: "الإعدادات", icon: Settings, path: "/settings" },
    ],
  },
];

function isGroup(item: NavItem | NavGroup): item is NavGroup {
  return "items" in item;
}

const AppSidebar = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile, userRole, isSuperAdmin, isEcommerce, signOut } = useAuth();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const navStructure = buildGroups(isEcommerce);

  // Auto-open group containing active route
  const isActive = (path: string) => location.pathname === path;

  const isGroupActive = (group: NavGroup) => group.items.some(i => isActive(i.path));

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const isGroupOpen = (group: NavGroup) => {
    if (openGroups[group.label] !== undefined) return openGroups[group.label];
    return isGroupActive(group); // auto-open if active
  };

  const renderItem = (item: NavItem) => {
    const active = isActive(item.path);
    return (
      <NavLink
        key={item.path}
        to={item.path}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
          active
            ? "bg-sidebar-accent text-sidebar-primary"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <item.icon className="w-[18px] h-[18px]" />
        <span>{item.label}</span>
      </NavLink>
    );
  };

  const renderGroup = (group: NavGroup) => {
    const open = isGroupOpen(group);
    const active = isGroupActive(group);
    return (
      <div key={group.label}>
        <button
          onClick={() => toggleGroup(group.label)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
            active
              ? "text-sidebar-primary"
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
        >
          <group.icon className="w-[18px] h-[18px]" />
          <span className="flex-1 text-right">{group.label}</span>
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", open && "rotate-180")} />
        </button>
        {open && (
          <div className="mr-4 pr-3 border-r border-sidebar-border space-y-0.5 mt-0.5">
            {group.items.map(renderItem)}
          </div>
        )}
      </div>
    );
  };

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
      <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
        {navStructure.map((item) =>
          isGroup(item) ? renderGroup(item) : renderItem(item)
        )}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-sidebar-border">
        {isSuperAdmin && (
          <NavLink
            to="/admin"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-sidebar-accent transition-all mb-1"
          >
            <Shield className="w-[18px] h-[18px]" />
            <span>Super Admin</span>
          </NavLink>
        )}
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-bold text-sidebar-primary">
            {profile?.full_name?.slice(0, 2) || "؟"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-sidebar-accent-foreground truncate">{profile?.full_name || "مستخدم"}</p>
            <p className="text-[10px] text-sidebar-foreground truncate">
              {userRole === "admin" ? "مدير" : userRole === "super_admin" ? "مدير النظام" : userRole === "supervisor" ? "مشرف" : "عضو"}
              {isEcommerce && " • متجر"}
            </p>
          </div>
          <button onClick={signOut} className="text-sidebar-foreground hover:text-red-400 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 left-3 z-50 w-10 h-10 rounded-lg bg-card shadow-card flex items-center justify-center"
      >
        <Menu className="w-5 h-5 text-foreground" />
      </button>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-foreground/40 z-50" onClick={() => setMobileOpen(false)}>
          <aside className="absolute right-0 top-0 h-full w-[240px] gradient-sidebar flex flex-col animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setMobileOpen(false)} className="absolute left-3 top-5 text-sidebar-foreground hover:text-sidebar-accent-foreground">
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      <aside className="hidden md:flex fixed right-0 top-0 h-screen w-[220px] gradient-sidebar flex-col z-40">
        {sidebarContent}
      </aside>
    </>
  );
};

export default AppSidebar;
