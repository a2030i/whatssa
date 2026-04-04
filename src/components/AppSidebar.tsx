import { useState } from "react";
import {
  MessageSquare, BarChart3, Megaphone, Bot, Settings, Users, Menu, X,
  FileText, Shield, LogOut, Wallet, UserCircle, CreditCard, Plug,
  ShoppingCart, ShoppingBag, ChevronLeft, LayoutDashboard, Code2,
  Zap, Bell, CircleDot, Headphones, TrendingUp, Clock, Lock, ClipboardList,
  Workflow, Send, Warehouse, DollarSign, Package, ClipboardCheck
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

const buildSections = (): { section: string; items: NavItem[] }[] => [
  {
    section: "الرئيسية",
    items: [
      { label: "لوحة التحكم", icon: LayoutDashboard, path: "/" },
      { label: "صندوق الوارد", icon: MessageSquare, path: "/inbox" },
      { label: "المهام", icon: ClipboardCheck, path: "/tasks" },
    ],
  },
  {
    section: "التسويق",
    items: [
      { label: "الحملات", icon: Megaphone, path: "/campaigns" },
      { label: "الرسائل المجدولة", icon: Clock, path: "/scheduled-messages" },
      { label: "القوالب", icon: FileText, path: "/templates", metaApiOnly: true, lockedMessage: "اربط رقم واتساب رسمي (Meta API) أولاً من صفحة الربط والتكامل لإدارة القوالب" },
      { label: "الأتمتة", icon: Workflow, path: "/automation" },
    ],
  },
  {
    section: "المبيعات",
    items: [
      { label: "العملاء", icon: UserCircle, path: "/customers" },
      { label: "الطلبات", icon: ShoppingCart, path: "/orders", ecommerceOnly: true, lockedMessage: "اربط متجرك الإلكتروني أولاً" },
      { label: "السلل المهجورة", icon: ShoppingBag, path: "/abandoned-carts", ecommerceOnly: true, lockedMessage: "اربط متجرك الإلكتروني أولاً" },
      { label: "الكتالوج", icon: Package, path: "/catalog", metaApiOnly: true, lockedMessage: "اربط رقم واتساب رسمي أولاً لإدارة الكتالوج" },
    ],
  },
  {
    section: "الذكاء",
    items: [
      { label: "الشات بوت", icon: Bot, path: "/chatbot" },
      { label: "نماذج واتساب", icon: ClipboardList, path: "/wa-flows" },
      { label: "التحليلات", icon: BarChart3, path: "/analytics" },
      { label: "تكاليف المحادثات", icon: DollarSign, path: "/conversation-analytics", metaApiOnly: true },
      { label: "تقارير المتجر", icon: TrendingUp, path: "/store-analytics", ecommerceOnly: true, lockedMessage: "اربط متجرك الإلكتروني أولاً" },
    ],
  },
  {
    section: "الإعدادات",
    items: [
      { label: "التكاملات", icon: Plug, path: "/integrations" },
      { label: "الفريق والصلاحيات", icon: Users, path: "/team" },
      { label: "الإشعارات", icon: Bell, path: "/settings" },
      { label: "الأمان", icon: Shield, path: "/conversation-settings" },
      { label: "مفاتيح API", icon: Code2, path: "/api-tokens" },
      { label: "الباقة والفواتير", icon: CreditCard, path: "/plans" },
    ],
  },
];

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

  const navSections = buildSections();

  const isLocked = (item: NavItem): boolean => {
    if (isSuperAdmin) return false;
    if (item.metaApiOnly && !hasMetaApi) return true;
    if (item.ecommerceOnly && !isEcommerce) return true;
    return false;
  };

  const isActive = (path: string) => location.pathname === path;

  const renderItem = (item: NavItem) => {
    const active = isActive(item.path);
    const locked = isLocked(item);

    if (locked) {
      return (
        <button
          key={item.path}
          onClick={() => {
            toast.info(item.lockedMessage || "هذه الميزة غير متاحة حالياً", {
              action: { label: "الربط والتكامل", onClick: () => window.location.href = "/integrations" },
            });
          }}
          className="flex items-center gap-2.5 rounded-lg text-[13px] font-medium w-full px-3 py-2 opacity-30 cursor-not-allowed text-sidebar-foreground"
        >
          <item.icon className="shrink-0 w-4 h-4" />
          <span className="flex-1 text-right">{item.label}</span>
          <Lock className="w-3 h-3" />
        </button>
      );
    }

    return (
      <NavLink
        key={item.path}
        to={item.path}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-colors px-3 py-2",
          active
            ? "bg-primary text-primary-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <item.icon className="shrink-0 w-4 h-4" />
        <span className="flex-1">{item.label}</span>
        {item.badge && (
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 border-0">
            {item.badge}
          </Badge>
        )}
      </NavLink>
    );
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-4 pt-5 pb-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-base font-bold text-sidebar-accent-foreground leading-tight">Whatssa</h2>
            <p className="text-[10px] text-sidebar-foreground/50">نظام إدارة المحادثات</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2.5 pt-3 pb-2">
        {navSections.map((section) => (
          <div key={section.section} className="mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 px-3 mb-1.5">
              {section.section}
            </p>
            <div className="space-y-0.5">
              {section.items.map(renderItem)}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t border-sidebar-border mt-auto">
        {/* Super Admin Link */}
        {isSuperAdmin && (
          <div className="px-3 pt-2">
            <NavLink
              to="/admin"
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                "bg-destructive/10 text-destructive hover:bg-destructive/15",
                isActive("/admin") && "bg-destructive/15"
              )}
            >
              <Shield className="w-4 h-4" />
              <span>لوحة النظام</span>
            </NavLink>
          </div>
        )}

        {/* User Profile */}
        <div className="p-3">
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-sidebar-accent/50">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                {profile?.full_name?.slice(0, 2) || "؟"}
              </div>
              <span className="absolute -bottom-0.5 -left-0.5 w-2 h-2 rounded-full bg-success border-2 border-sidebar-background" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-sidebar-accent-foreground truncate">
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
                  className="text-sidebar-foreground/30 hover:text-destructive transition-colors p-1.5 rounded-md hover:bg-sidebar-accent"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">تسجيل الخروج</TooltipContent>
            </Tooltip>
          </div>
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
          "md:hidden fixed left-3 z-[60] w-10 h-10 rounded-lg bg-card shadow-card flex items-center justify-center border border-border",
          isImpersonating ? "top-14" : "top-3"
        )}
      >
        <Menu className="w-5 h-5 text-foreground" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50"
          onClick={() => setMobileOpen(false)}
        >
          <aside
            className="absolute right-0 top-0 h-full w-[260px] bg-sidebar flex flex-col shadow-xl animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute left-3 top-4 text-sidebar-foreground/40 hover:text-sidebar-accent-foreground transition-colors p-1 rounded-md"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed right-0 top-0 h-screen w-[240px] bg-sidebar flex-col z-40 border-l border-sidebar-border">
        {sidebarContent}
      </aside>
    </>
  );
};

export default AppSidebar;
