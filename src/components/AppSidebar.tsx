import { useState, useEffect } from "react";
import {
  MessageSquare, BarChart3, Megaphone, Bot, Settings, Users, Menu, X,
  FileText, Shield, LogOut, Wallet, UserCircle, CreditCard, Plug,
  ShoppingCart, ShoppingBag, ChevronDown, LayoutDashboard, Code2,
  Zap, Bell, CircleDot, Headphones, TrendingUp, Clock, Lock, ClipboardList,
  Workflow, Send
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItem {
  label: string;
  icon: any;
  path: string;
  badge?: string;
  ecommerceOnly?: boolean;
  metaApiOnly?: boolean;
  lockedMessage?: string;
}

interface NavGroup {
  label: string;
  icon: any;
  items: NavItem[];
}

const buildGroups = (isEcommerce: boolean, hasMetaApi: boolean): { section: string; items: (NavItem | NavGroup)[] }[] => [
  {
    section: "الرئيسية",
    items: [
      { label: "لوحة التحكم", icon: LayoutDashboard, path: "/" },
      { label: "المحادثات", icon: MessageSquare, path: "/inbox", badge: "جديد" },
      { label: "العملاء", icon: UserCircle, path: "/customers" },
    ],
  },
  {
    section: "الأتمتة والذكاء",
    items: [
      { label: "الشات بوت", icon: Bot, path: "/chatbot" },
      { label: "قواعد الأتمتة", icon: Workflow, path: "/automation" },
      { label: "نماذج واتساب", icon: ClipboardList, path: "/wa-flows" },
    ],
  },
  {
    section: "التسويق والتواصل",
    items: [
      { label: "الحملات", icon: Megaphone, path: "/campaigns" },
      { label: "القوالب", icon: FileText, path: "/templates", metaApiOnly: true, lockedMessage: "اربط رقم واتساب رسمي (Meta API) أولاً من صفحة الربط والتكامل لإدارة القوالب" },
      { label: "الرسائل المجدولة", icon: Clock, path: "/scheduled-messages" },
    ],
  },
  {
    section: "المتجر",
    items: [
      { label: "الطلبات", icon: ShoppingCart, path: "/orders", ecommerceOnly: true, lockedMessage: "اربط متجرك الإلكتروني أولاً من صفحة الربط والتكامل لعرض الطلبات" },
      { label: "السلات المتروكة", icon: ShoppingBag, path: "/abandoned-carts", ecommerceOnly: true, lockedMessage: "اربط متجرك الإلكتروني أولاً من صفحة الربط والتكامل لاسترداد السلات المتروكة" },
    ],
  },
  {
    section: "التحليلات",
    items: [
      { label: "التقارير", icon: BarChart3, path: "/analytics" },
    ],
  },
  {
    section: "الإعدادات والإدارة",
    items: [
      { label: "الفريق", icon: Users, path: "/team" },
      { label: "الربط والتكامل", icon: Plug, path: "/integrations" },
      { label: "الباقات", icon: CreditCard, path: "/plans" },
      { label: "المحفظة", icon: Wallet, path: "/wallet" },
      { label: "الفواتير", icon: FileText, path: "/billing" },
      { label: "الإعدادات", icon: Settings, path: "/settings" },
      { label: "مستندات API", icon: Code2, path: "/api-docs" },
    ],
  },
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
  const { profile, userRole, isSuperAdmin, isEcommerce, hasMetaApi, isImpersonating, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const navSections = buildGroups(isEcommerce, hasMetaApi);

  const isLocked = (item: NavItem): boolean => {
    if (item.metaApiOnly && !hasMetaApi) return true;
    if (item.ecommerceOnly && !isEcommerce) return true;
    return false;
  };

  const isActive = (path: string) => location.pathname === path;

  const renderItem = (item: NavItem | NavGroup) => {
    if (isGroup(item)) return null; // No nested groups in new layout
    const active = isActive(item.path);
    const locked = isLocked(item);

    if (locked) {
      const lockedContent = (
        <button
          key={item.path}
          onClick={() => {
            toast.info(item.lockedMessage || "هذه الميزة غير متاحة حالياً", {
              action: {
                label: "الربط والتكامل",
                onClick: () => window.location.href = "/integrations",
              },
            });
          }}
          className={cn(
            "group flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-200 w-full opacity-40 cursor-not-allowed px-3 py-2",
            "text-sidebar-foreground/50"
          )}
        >
          <item.icon className="shrink-0 w-[18px] h-[18px]" />
          {!collapsed && (
            <>
              <span className="flex-1 text-right">{item.label}</span>
              <Lock className="w-3 h-3 text-sidebar-foreground/30" />
            </>
          )}
        </button>
      );

      if (collapsed) {
        return (
          <Tooltip key={item.path}>
            <TooltipTrigger asChild>{lockedContent}</TooltipTrigger>
            <TooltipContent side="left" className="text-xs">🔒 {item.label}</TooltipContent>
          </Tooltip>
        );
      }
      return lockedContent;
    }

    const content = (
      <NavLink
        key={item.path}
        to={item.path}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "group flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-200 relative px-3 py-2",
          active
            ? "bg-gradient-to-l from-sidebar-primary/15 to-sidebar-primary/5 text-sidebar-primary shadow-sm"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        )}
      >
        {active && (
          <span className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-l-full bg-sidebar-primary shadow-[0_0_8px_hsl(var(--sidebar-primary)/0.4)]" />
        )}
        <div className={cn(
          "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all",
          active ? "bg-sidebar-primary/15" : "bg-transparent group-hover:bg-sidebar-accent/50"
        )}>
          <item.icon className="w-[16px] h-[16px]" />
        </div>
        {!collapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <Badge
                variant="secondary"
                className="text-[9px] px-1.5 py-0 h-4 bg-sidebar-primary/15 text-sidebar-primary border-0 animate-pulse-soft"
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
          <TooltipContent side="left" className="text-xs">{item.label}</TooltipContent>
        </Tooltip>
      );
    }

    return content;
  };

  const sidebarContent = (
    <>
      {/* Logo Area */}
      {!collapsed && (
        <div className="px-4 pt-5 pb-4 text-center">
          <h2 className="text-2xl font-extrabold text-sidebar-accent-foreground tracking-tight">Respondly</h2>
          <p className="text-[11px] text-sidebar-foreground/40 mt-1">منصة إدارة المحادثات</p>
        </div>
      )}
      {collapsed && <div className="pt-4" />}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin pb-2">
        {navSections.map((section, sIdx) => (
          <div key={section.section}>
            {/* Section Label */}
            <div className="px-4 pt-4 pb-1.5">
              {!collapsed ? (
                <span className="text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/30">
                  {section.section}
                </span>
              ) : (
                <div className="border-t border-sidebar-border/20 mx-1" />
              )}
            </div>
            <div className={cn("space-y-0.5", collapsed ? "px-2" : "px-3")}>
              {section.items.map((item) => renderItem(item))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-sidebar-border/30 mt-auto">
        {/* Super Admin Link */}
        {isSuperAdmin && (
          <div className={cn(collapsed ? "px-2 pt-2" : "px-3 pt-2")}>
            <NavLink
              to="/admin"
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all",
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
              collapsed ? "justify-center" : "gap-3 px-3 py-2.5 bg-sidebar-accent/30 backdrop-blur-sm border border-sidebar-border/20"
            )}
          >
            <div className="relative">
              <div
                className={cn(
                  "rounded-xl bg-gradient-to-br from-sidebar-primary/30 to-sidebar-primary/10 flex items-center justify-center text-xs font-bold text-sidebar-primary border border-sidebar-primary/20",
                  "w-9 h-9"
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
                  <p className="text-[10px] text-sidebar-foreground/50 truncate">
                    {roleLabels[userRole || "member"] || "عضو"}
                  </p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={signOut}
                      className="text-sidebar-foreground/40 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-sidebar-accent"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">تسجيل الخروج</TooltipContent>
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
        className={cn(
          "md:hidden fixed left-3 z-[60] w-10 h-10 rounded-xl bg-card shadow-card flex items-center justify-center border border-border/50",
          isImpersonating ? "top-14" : "top-3"
        )}
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
            className="absolute right-0 top-0 h-full w-[270px] gradient-sidebar flex flex-col animate-slide-in-right shadow-2xl"
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
          "hidden md:flex fixed right-0 top-0 h-screen gradient-sidebar flex-col z-40 border-l border-sidebar-border/20 transition-all duration-300",
          collapsed ? "w-[68px]" : "w-[250px]"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
};

export default AppSidebar;
