import { useState } from "react";
import {
  MessageSquare, BarChart3, Megaphone, Bot, Settings, Users, Menu, X,
  FileText, Shield, LogOut, Wallet, UserCircle, CreditCard, Plug,
  ShoppingCart, ShoppingBag, ChevronDown, LayoutDashboard, Code2,
  Database, Mail,
  Zap, Bell, CircleDot, Headphones, TrendingUp, Clock, Lock, ClipboardList,
  Workflow, Send, Warehouse, DollarSign, Package, ClipboardCheck, Ticket
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useWhiteLabel } from "@/contexts/WhiteLabelContext";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItem {
  label: string;
  icon: any;
  path: string;
  emoji?: string;
  badge?: string;
  ecommerceOnly?: boolean;
  metaApiOnly?: boolean;
  lockedMessage?: string;
  minRole?: "admin" | "supervisor" | "member";
}

interface NavGroup {
  label: string;
  icon: any;
  items: NavItem[];
}

const buildGroups = (isEcommerce: boolean, hasMetaApi: boolean): { section: string; emoji: string; items: (NavItem | NavGroup)[] }[] => [
  {
    section: "الرئيسية",
    emoji: "🏠",
    items: [
      { label: "لوحة التحكم", icon: LayoutDashboard, path: "/", emoji: "📊", minRole: "admin" },
      { label: "صندوق الواتساب", icon: MessageSquare, path: "/inbox", emoji: "💬" },
      { label: "صندوق الإيميل", icon: Mail, path: "/email-inbox", emoji: "📧" },
      { label: "التذاكر", icon: Ticket, path: "/tickets", emoji: "🎫" },
      { label: "المهام", icon: ClipboardCheck, path: "/tasks", emoji: "✅" },
    ],
  },
  {
    section: "التسويق والأتمتة",
    emoji: "🚀",
    items: [
      { label: "الحملات", icon: Megaphone, path: "/campaigns", emoji: "📣", minRole: "admin" },
      { label: "الرسائل المجدولة", icon: Clock, path: "/scheduled-messages", emoji: "⏰", minRole: "admin" },
      { label: "القوالب", icon: FileText, path: "/templates", emoji: "📝", metaApiOnly: true, lockedMessage: "اربط رقم واتساب رسمي (Meta API) أولاً من صفحة الربط والتكامل لإدارة القوالب", minRole: "admin" },
      { label: "الأتمتة", icon: Workflow, path: "/automation", emoji: "⚡", minRole: "admin" },
      { label: "الشات بوت", icon: Bot, path: "/chatbot", emoji: "🤖", minRole: "admin" },
    ],
  },
  {
    section: "العملاء والمبيعات",
    emoji: "👥",
    items: [
      { label: "العملاء", icon: UserCircle, path: "/customers", emoji: "👥", minRole: "admin" },
      { label: "الطلبات", icon: ShoppingCart, path: "/orders", emoji: "🛒", ecommerceOnly: true, lockedMessage: "اربط متجرك الإلكتروني أولاً", minRole: "admin" },
      { label: "السلل المهجورة", icon: ShoppingBag, path: "/abandoned-carts", emoji: "🛒", ecommerceOnly: true, lockedMessage: "اربط متجرك الإلكتروني أولاً", minRole: "admin" },
      { label: "الكتالوج", icon: Package, path: "/catalog", emoji: "📦", minRole: "admin" },
    ],
  },
  {
    section: "التحليلات",
    emoji: "📈",
    items: [
      { label: "التقارير", icon: BarChart3, path: "/analytics", emoji: "📈", minRole: "supervisor" },
      { label: "تكاليف المحادثات", icon: DollarSign, path: "/conversation-analytics", emoji: "💰", metaApiOnly: true, minRole: "admin" },
      { label: "نماذج واتساب", icon: ClipboardList, path: "/wa-flows", emoji: "📋", minRole: "admin" },
      { label: "تقارير المتجر", icon: TrendingUp, path: "/store-analytics", emoji: "📊", ecommerceOnly: true, lockedMessage: "اربط متجرك الإلكتروني أولاً", minRole: "admin" },
    ],
  },
  {
    section: "الإعدادات",
    emoji: "⚙️",
    items: [
      { label: "التكاملات", icon: Plug, path: "/integrations", emoji: "🔗", minRole: "admin" },
      { label: "أدوات النمو", icon: Zap, path: "/growth-tools", emoji: "🚀", minRole: "admin" },
      { label: "الفريق والصلاحيات", icon: Users, path: "/team", emoji: "👤", minRole: "supervisor" },
      { label: "الإشعارات", icon: Bell, path: "/settings", emoji: "🔔", minRole: "admin" },
      { label: "الأمان", icon: Shield, path: "/conversation-settings", emoji: "🛡️", minRole: "admin" },
      { label: "الصلاحيات والنسخ الاحتياطي", icon: Database, path: "/permissions", emoji: "🔐", minRole: "admin" },
      { label: "مفاتيح API", icon: Code2, path: "/api-tokens", emoji: "🔑", minRole: "admin" },
      { label: "الباقة والفواتير", icon: CreditCard, path: "/plans", emoji: "💳", minRole: "admin" },
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
  member: "موظف",
};

const AppSidebar = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile, userRole, isSuperAdmin, isEcommerce, hasMetaApi, isImpersonating, signOut } = useAuth();
  const { brand, platformName } = useWhiteLabel();
  const [collapsed, setCollapsed] = useState(false);
  const displayRole = userRole === "super_admin"
    ? "super_admin"
    : userRole === "admin"
      ? "admin"
      : profile?.is_supervisor
        ? "supervisor"
        : "member";
  const isInsideInboxConversation = location.pathname === "/inbox" && new URLSearchParams(location.search).has("conversation");

  const navSections = buildGroups(isEcommerce, hasMetaApi);

  const effectiveRole = isSuperAdmin ? "admin" : userRole === "admin" ? "admin" : profile?.is_supervisor ? "supervisor" : "member";
  const roleHierarchy: Record<string, number> = { member: 0, supervisor: 1, admin: 2 };
  const userLevel = roleHierarchy[effectiveRole] ?? 0;

  const hasAccess = (item: NavItem): boolean => {
    if (isSuperAdmin) return true;
    if (!item.minRole) return true;
    return userLevel >= (roleHierarchy[item.minRole] ?? 0);
  };

  const isLocked = (item: NavItem): boolean => {
    if (isSuperAdmin) return false;
    if (item.metaApiOnly && !hasMetaApi) return true;
    if (item.ecommerceOnly && !isEcommerce) return true;
    return false;
  };

  const isActive = (path: string) => location.pathname === path;

  const renderItem = (item: NavItem | NavGroup) => {
    if (isGroup(item)) return null;
    if (!hasAccess(item)) return null;
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
            "group flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-200 w-full opacity-30 cursor-not-allowed px-3 py-2",
            "text-sidebar-foreground/40"
          )}
        >
          <item.icon className="shrink-0 w-[16px] h-[16px]" />
          {!collapsed && (
            <>
              <span className="flex-1 text-right">{item.label}</span>
              <Lock className="w-3 h-3 text-sidebar-foreground/20" />
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
          "group flex items-center gap-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 relative px-3 py-2",
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
            : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        )}
      >
        <item.icon className={cn("shrink-0 w-[16px] h-[16px]", collapsed && "mx-auto")} />
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
        <div className="px-4 pt-5 pb-3 text-center">
          {brand?.logo_url ? (
            <img src={brand.logo_url} alt={platformName} className="h-8 mx-auto object-contain" />
          ) : (
            <h2 className="text-2xl font-extrabold text-sidebar-accent-foreground tracking-tight">{platformName}</h2>
          )}
          <p className="text-[10px] text-sidebar-foreground/35 mt-0.5">نظام إدارة المحادثات</p>
        </div>
      )}
      {collapsed && <div className="pt-4" />}


      {/* Search */}
      {!collapsed && (
        <div className="mx-3 mb-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sidebar-accent/30 text-xs text-sidebar-foreground/40">
            <span>🔍</span>
            <span>بحث سريع...</span>
            <kbd className="mr-auto text-[9px] bg-sidebar-accent/60 px-1.5 py-0.5 rounded">K⌘</kbd>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin pb-2">
        {navSections.map((section) => (
          <div key={section.section}>
            <div className="px-4 pt-4 pb-1.5">
              {!collapsed ? (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/35">
                  {section.section}
                </span>
              ) : (
                <div className="border-t border-sidebar-border/15 mx-1" />
              )}
            </div>
            <div className={cn("space-y-0.5", collapsed ? "px-2" : "px-2.5")}>
              {section.items.map((item) => renderItem(item))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-sidebar-border/20 mt-auto">
        {/* Super Admin Link */}
        {isSuperAdmin && (
          <div className={cn(collapsed ? "px-2 pt-2" : "px-3 pt-2")}>
            <NavLink
              to="/admin"
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all",
                "bg-destructive/10 text-destructive hover:bg-destructive/20",
                isActive("/admin") && "bg-destructive/20"
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
              collapsed ? "justify-center" : "gap-3 px-3 py-2.5 bg-sidebar-accent/25 border border-sidebar-border/15"
            )}
          >
            <div className="relative">
              <div
                className={cn(
                  "rounded-full bg-sidebar-primary/20 flex items-center justify-center text-xs font-bold text-sidebar-primary border border-sidebar-primary/15",
                  "w-9 h-9"
                )}
              >
                {profile?.full_name?.slice(0, 2) || "؟"}
              </div>
              <span className="absolute -bottom-0.5 -left-0.5 w-2.5 h-2.5 rounded-full bg-success border-2 border-sidebar-background" />
            </div>
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-sidebar-accent-foreground truncate leading-tight">
                    {profile?.full_name || "مستخدم"}
                  </p>
                  <p className="text-[10px] text-sidebar-foreground/40 truncate">
                    {roleLabels[displayRole] || "موظف"}
                  </p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={signOut}
                      className="text-sidebar-foreground/30 hover:text-destructive transition-colors p-1.5 rounded-lg hover:bg-sidebar-accent/50"
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

        {/* Collapse Toggle */}
        <div className="hidden md:block px-3 pb-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center py-1.5 rounded-lg text-sidebar-foreground/25 hover:text-sidebar-foreground/50 hover:bg-sidebar-accent/40 transition-all"
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
      {/* Mobile toggle - show on inbox list page, hide only inside an opened conversation */}
      {!isInsideInboxConversation && (
        <button
          onClick={() => setMobileOpen(true)}
          className={cn(
            "md:hidden fixed left-3 z-[60] w-10 h-10 rounded-xl bg-card shadow-card flex items-center justify-center border border-border/50",
            isImpersonating ? "top-14" : "top-3"
          )}
        >
          <Menu className="w-5 h-5 text-foreground" />
        </button>
      )}

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50"
          onClick={() => setMobileOpen(false)}
        >
          <aside
            className="absolute right-0 top-0 h-full w-[270px] gradient-sidebar flex flex-col animate-slide-in-right shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute left-3 top-4 text-sidebar-foreground/40 hover:text-sidebar-accent-foreground transition-colors p-1 rounded-lg hover:bg-sidebar-accent"
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
          "hidden md:flex fixed right-0 top-0 h-screen gradient-sidebar flex-col z-40 border-l border-sidebar-border/15 transition-all duration-300",
          collapsed ? "w-[68px]" : "w-[250px]"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
};

export default AppSidebar;
