import { useState } from "react";
import {
  MessageSquare, BarChart3, Megaphone, Bot, Users, Menu, X,
  FileText, Shield, LogOut, UserCircle, CreditCard, Plug,
  ShoppingCart, ShoppingBag, LayoutDashboard, Code2,
  Bell, TrendingUp, Clock, Lock, ClipboardList,
  Workflow, DollarSign, Package, ClipboardCheck
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
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

const buildSections = (): { section: string; items: NavItem[] }[] => [
  {
    section: "الرئيسية",
    items: [
      { label: "لوحة التحكم", icon: LayoutDashboard, path: "/" },
      { label: "صندوق الوارد", icon: MessageSquare, path: "/inbox" },
      { label: "المهام", icon: ClipboardCheck, path: "/tasks" },
      { label: "العملاء", icon: UserCircle, path: "/customers" },
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
      { label: "الفريق", icon: Users, path: "/team" },
      { label: "الإشعارات", icon: Bell, path: "/settings" },
      { label: "الأمان", icon: Shield, path: "/conversation-settings" },
      { label: "مفاتيح API", icon: Code2, path: "/api-tokens" },
      { label: "الباقة", icon: CreditCard, path: "/plans" },
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
          className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-[13px] text-muted-foreground/40 cursor-not-allowed"
        >
          <item.icon className="shrink-0 w-[18px] h-[18px]" />
          <span className="flex-1 text-right">{item.label}</span>
          <Lock className="w-3.5 h-3.5" />
        </button>
      );
    }

    return (
      <NavLink
        key={item.path}
        to={item.path}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-colors",
          active
            ? "bg-primary/10 text-primary font-semibold"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <item.icon className={cn("shrink-0 w-[18px] h-[18px]", active && "text-primary")} />
        <span className="flex-1">{item.label}</span>
      </NavLink>
    );
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-primary-foreground" />
          </div>
          <h2 className="text-base font-bold text-foreground tracking-tight">Whatssa</h2>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-2">
        {navSections.map((section, idx) => (
          <div key={section.section} className={cn("pb-3", idx > 0 && "pt-3 border-t border-sidebar-border")}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-3 mb-2">
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
        {isSuperAdmin && (
          <div className="px-3 pt-3">
            <NavLink
              to="/admin"
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors",
                "text-destructive hover:bg-destructive/5",
                isActive("/admin") && "bg-destructive/5"
              )}
            >
              <Shield className="w-4 h-4" />
              <span>لوحة النظام</span>
            </NavLink>
          </div>
        )}

        {/* User */}
        <div className="p-3">
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-md bg-secondary/60">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                {profile?.full_name?.slice(0, 2) || "؟"}
              </div>
              <span className="absolute -bottom-0.5 -left-0.5 w-2.5 h-2.5 rounded-full bg-success border-2 border-card" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">
                {profile?.full_name || "مستخدم"}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {roleLabels[userRole || "member"] || "عضو"}
              </p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={signOut}
                  className="text-muted-foreground/40 hover:text-destructive transition-colors p-1.5 rounded-md hover:bg-secondary"
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
          "md:hidden fixed left-3 z-[60] w-10 h-10 rounded-lg bg-card shadow-sm flex items-center justify-center border border-border",
          isImpersonating ? "top-14" : "top-3"
        )}
      >
        <Menu className="w-5 h-5 text-foreground" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-foreground/20 z-50"
          onClick={() => setMobileOpen(false)}
        >
          <aside
            className="absolute right-0 top-0 h-full w-[260px] bg-card flex flex-col shadow-elevated animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute left-3 top-4 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed right-0 top-0 h-screen w-[240px] bg-card flex-col z-40 border-l border-border">
        {sidebarContent}
      </aside>
    </>
  );
};

export default AppSidebar;
