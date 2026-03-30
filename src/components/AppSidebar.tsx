import { useState, useEffect } from "react";
import {
  MessageSquare, BarChart3, Megaphone, Bot, Settings, Users, Menu, X,
  FileText, Shield, LogOut, Wallet, UserCircle, CreditCard, Plug,
  ShoppingCart, ShoppingBag, ChevronDown, LayoutDashboard, Code2,
  Zap, Bell, CircleDot, Headphones, TrendingUp, Clock
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItem {
  label: string;
  icon: any;
  path: string;
  badge?: string;
  ecommerceOnly?: boolean;
  metaApiOnly?: boolean;
}

interface NavGroup {
  label: string;
  icon: any;
  items: NavItem[];
}

const buildGroups = (isEcommerce: boolean): (NavItem | NavGroup)[] => [
  { label: "لوحة التحكم", icon: LayoutDashboard, path: "/" },
  { label: "المحادثات", icon: MessageSquare, path: "/inbox" },
  { label: "العملاء", icon: UserCircle, path: "/customers" },
  // E-commerce group
  ...(isEcommerce
    ? [
        {
          label: "المتجر",
          icon: ShoppingBag,
          items: [
            { label: "الطلبات", icon: ShoppingCart, path: "/orders" },
            { label: "السلات المتروكة", icon: ShoppingBag, path: "/abandoned-carts" },
          ],
        } as NavGroup,
      ]
    : []),
  // Marketing group
  {
    label: "التسويق",
    icon: Megaphone,
    items: [
      { label: "الحملات", icon: Megaphone, path: "/campaigns" },
      { label: "القوالب", icon: FileText, path: "/templates", metaApiOnly: true },
      { label: "الأتمتة", icon: Bot, path: "/automation" },
      { label: "الشات بوت", icon: Zap, path: "/chatbot" },
      { label: "الرسائل المجدولة", icon: Clock, path: "/scheduled-messages" },
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
      { label: "الفواتير", icon: FileText, path: "/billing" },
      { label: "الربط والتكامل", icon: Plug, path: "/integrations" },
      { label: "الإعدادات", icon: Settings, path: "/settings" },
    ],
  },
  // Developer
  { label: "مستندات API", icon: Code2, path: "/api-docs" },
];

function isGroup(item: NavItem | NavGroup): item is NavGroup {
  return "items" in item;
}

const roleLabels: Record<string, string> = {
  admin: "مدير",
  super_admin: "مدير النظام",
  supervisor: "مشرف",
  member: "عضو",
};

const AppSidebar = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile, userRole, isSuperAdmin, isEcommerce, hasMetaApi, signOut } = useAuth();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);

  const navStructure = buildGroups(isEcommerce)
    .map((item) => {
      if (isGroup(item)) {
        return {
          ...item,
          items: item.items.filter((i) => !i.metaApiOnly || hasMetaApi),
        };
      }
      return !item.metaApiOnly || hasMetaApi ? item : null;
    })
    .filter(Boolean) as (NavItem | NavGroup)[];

  const isActive = (path: string) => location.pathname === path;
  const isGroupActive = (group: NavGroup) => group.items.some((i) => isActive(i.path));

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isGroupOpen = (group: NavGroup) => {
    if (openGroups[group.label] !== undefined) return openGroups[group.label];
    return isGroupActive(group);
  };

  const renderItem = (item: NavItem, nested = false) => {
    const active = isActive(item.path);

    const content = (
      <NavLink
        key={item.path}
        to={item.path}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "group flex items-center gap-3 rounded-lg text-[13px] font-medium transition-all duration-200 relative",
          nested ? "px-3 py-[7px]" : "px-3 py-2",
          active
            ? "bg-sidebar-primary/10 text-sidebar-primary"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        {active && (
          <span className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-l-full bg-sidebar-primary" />
        )}
        <item.icon className={cn("shrink-0", nested ? "w-4 h-4" : "w-[18px] h-[18px]")} />
        {!collapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-4 bg-sidebar-primary/15 text-sidebar-primary border-0"
              >
                {item.badge}
              </Badge>
            )}
          </>
        )}
      </NavLink>
    );

    if (collapsed) {
      return (
        <Tooltip key={item.path}>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="left" className="text-xs">
            {item.label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return content;
  };

  const renderGroup = (group: NavGroup) => {
    const open = isGroupOpen(group);
    const active = isGroupActive(group);

    if (collapsed) {
      return (
        <div key={group.label} className="space-y-0.5">
          {group.items.map((item) => renderItem(item))}
        </div>
      );
    }

    return (
      <div key={group.label}>
        <button
          onClick={() => toggleGroup(group.label)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-200",
            active
              ? "text-sidebar-primary"
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
        >
          <group.icon className="w-[18px] h-[18px] shrink-0" />
          <span className="flex-1 text-right">{group.label}</span>
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 transition-transform duration-200 text-sidebar-foreground/50",
              open && "rotate-180"
            )}
          />
        </button>
        <div
          className={cn(
            "overflow-hidden transition-all duration-200",
            open ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <div className="mr-5 pr-3 border-r border-sidebar-border/50 space-y-0.5 mt-0.5 pb-1">
            {group.items.map((item) => renderItem(item, true))}
          </div>
        </div>
      </div>
    );
  };

  // Divider component
  const Divider = ({ label }: { label?: string }) => (
    <div className="px-3 pt-4 pb-1">
      {label && !collapsed ? (
        <span className="text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/40">
          {label}
        </span>
      ) : (
        <div className="border-t border-sidebar-border/30" />
      )}
    </div>
  );

  // Split nav structure into sections
  const mainItems = navStructure.filter(
    (i) =>
      !isGroup(i) &&
      ["/", "/inbox", "/customers"].includes((i as NavItem).path)
  );
  const groups = navStructure.filter(
    (i) =>
      isGroup(i) ||
      (!isGroup(i) && ["/analytics", "/api-docs"].includes((i as NavItem).path))
  );

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className={cn("border-b border-sidebar-border/50 flex items-center", collapsed ? "p-3 justify-center" : "p-4 gap-3")}>
        <div className="w-9 h-9 rounded-xl gradient-whatsapp flex items-center justify-center shadow-lg shadow-primary/20">
          <MessageSquare className="w-[18px] h-[18px] text-white" />
        </div>
        {!collapsed && (
          <div>
            <span className="text-base font-bold text-sidebar-accent-foreground tracking-tight block leading-tight">
              Respondly
            </span>
            <span className="text-[10px] text-sidebar-foreground/60">منصة إدارة المحادثات</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-none py-2">
        {/* Main Section */}
        <div className={cn("space-y-0.5", collapsed ? "px-2" : "px-3")}>
          {mainItems.map((item) => renderItem(item as NavItem))}
        </div>

        <Divider label="الأدوات" />

        <div className={cn("space-y-0.5", collapsed ? "px-2" : "px-3")}>
          {groups.map((item) =>
            isGroup(item) ? renderGroup(item) : renderItem(item as NavItem)
          )}
        </div>
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-sidebar-border/50">
        {/* Super Admin Link */}
        {isSuperAdmin && (
          <div className={cn(collapsed ? "px-2 pt-2" : "px-3 pt-2")}>
            <NavLink
              to="/admin"
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-semibold transition-all",
                "bg-red-500/10 text-red-400 hover:bg-red-500/20",
                isActive("/admin") && "bg-red-500/20"
              )}
            >
              <Shield className="w-4 h-4" />
              {!collapsed && <span>لوحة النظام</span>}
            </NavLink>
          </div>
        )}

        {/* User Profile */}
        <div className={cn("p-3", collapsed ? "flex justify-center" : "")}>
          <div
            className={cn(
              "flex items-center rounded-xl transition-all",
              collapsed ? "justify-center" : "gap-3 px-3 py-2.5 bg-sidebar-accent/50"
            )}
          >
            <div className="relative">
              <div
                className={cn(
                  "rounded-full bg-gradient-to-br from-sidebar-primary/30 to-sidebar-primary/10 flex items-center justify-center text-xs font-bold text-sidebar-primary border border-sidebar-primary/20",
                  collapsed ? "w-9 h-9" : "w-9 h-9"
                )}
              >
                {profile?.full_name?.slice(0, 2) || "؟"}
              </div>
              <span className="absolute -bottom-0.5 -left-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-sidebar-accent" />
            </div>
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-sidebar-accent-foreground truncate leading-tight">
                    {profile?.full_name || "مستخدم"}
                  </p>
                  <p className="text-[10px] text-sidebar-foreground/60 truncate">
                    {roleLabels[userRole || "member"] || "عضو"}
                  </p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={signOut}
                      className="text-sidebar-foreground/40 hover:text-red-400 transition-colors p-1 rounded-md hover:bg-sidebar-accent"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    تسجيل الخروج
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </div>

        {/* Collapse Toggle - Desktop only */}
        <div className="hidden md:block px-3 pb-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center py-1.5 rounded-lg text-sidebar-foreground/30 hover:text-sidebar-foreground/60 hover:bg-sidebar-accent/50 transition-all"
          >
            <ChevronDown
              className={cn(
                "w-4 h-4 transition-transform duration-200",
                collapsed ? "-rotate-90" : "rotate-90"
              )}
            />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 left-3 z-50 w-10 h-10 rounded-xl bg-card shadow-card flex items-center justify-center border border-border/50"
      >
        <Menu className="w-5 h-5 text-foreground" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-foreground/50 backdrop-blur-sm z-50"
          onClick={() => setMobileOpen(false)}
        >
          <aside
            className="absolute right-0 top-0 h-full w-[260px] gradient-sidebar flex flex-col animate-slide-in-right shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute left-3 top-4 text-sidebar-foreground/50 hover:text-sidebar-accent-foreground transition-colors p-1 rounded-lg hover:bg-sidebar-accent"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex fixed right-0 top-0 h-screen gradient-sidebar flex-col z-40 border-l border-sidebar-border/30 transition-all duration-300",
          collapsed ? "w-[68px]" : "w-[240px]"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
};

export default AppSidebar;
