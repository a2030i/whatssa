import { useEffect, useState } from "react";
import { MessageSquare, LayoutDashboard, Settings, UserCircle, LogOut, Menu, Megaphone, Bot, BarChart3, Plug, ShoppingCart, ClipboardCheck, Workflow, Clock, FileText, Users as UsersIcon, Wallet, CreditCard, Code2, Warehouse, Send, Shield, Lock, Mail, Ticket } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/lib/supabase";

const roleLabels: Record<string, string> = {
  admin: "مدير",
  super_admin: "مدير النظام",
  supervisor: "مشرف",
  member: "موظف",
};

const MobileBottomNav = () => {
  const location = useLocation();
  const { profile, userRole, isSuperAdmin, isEcommerce, hasMetaApi, signOut, orgId, teamId } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hasEmailAccess, setHasEmailAccess] = useState(false);
  const [openTicketCount, setOpenTicketCount] = useState(0);
  const displayRole = userRole === "super_admin"
    ? "super_admin"
    : userRole === "admin"
      ? "admin"
      : profile?.is_supervisor
        ? "supervisor"
        : "member";

  const effectiveRole = isSuperAdmin ? "admin" : userRole === "admin" ? "admin" : profile?.is_supervisor ? "supervisor" : "member";
  const roleHierarchy: Record<string, number> = { member: 0, supervisor: 1, admin: 2 };
  const userLevel = roleHierarchy[effectiveRole] ?? 0;

  const isActive = (path: string) => location.pathname === path;

  // Match desktop logic: hide email inbox if user has no email assignment (non-admin).
  useEffect(() => {
    if (!orgId || !profile?.id) return;
    if (effectiveRole === "admin" || isSuperAdmin) {
      setHasEmailAccess(true);
      return;
    }
    const conditions: string[] = [`dedicated_agent_id.eq.${profile.id}`];
    if (teamId) conditions.push(`dedicated_team_id.eq.${teamId}`);
    if (profile?.team_ids && Array.isArray(profile.team_ids)) {
      profile.team_ids.forEach((tid: string) => conditions.push(`dedicated_team_id.eq.${tid}`));
    }
    supabase
      .from("email_configs")
      .select("id")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .or(conditions.join(","))
      .limit(1)
      .then(({ data }) => {
        setHasEmailAccess(!!data && data.length > 0);
      });
  }, [orgId, profile?.id, teamId, effectiveRole, isSuperAdmin]);

  useEffect(() => {
    if (!orgId || !profile?.id) return;
    supabase.from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .in("status", ["open", "in_progress"])
      .eq("assigned_to", profile.id)
      .then(({ count }) => setOpenTicketCount(count || 0));
  }, [orgId, profile?.id]);

  const allMoreItems: { label: string; icon: any; path: string; emoji: string; minRole?: string }[] = [
    { label: "لوحة التحكم", icon: LayoutDashboard, path: "/", emoji: "📊", minRole: "admin" },
    { label: "التذاكر", icon: Ticket, path: "/tickets", emoji: "🎫" },
    { label: "المهام", icon: ClipboardCheck, path: "/tasks", emoji: "✅" },
    { label: "الحملات", icon: Megaphone, path: "/campaigns", emoji: "🚀", minRole: "admin" },
    { label: "الرسائل المجدولة", icon: Clock, path: "/scheduled-messages", emoji: "⏰", minRole: "admin" },
    ...(hasMetaApi || isSuperAdmin ? [{ label: "القوالب", icon: FileText, path: "/templates", emoji: "📝", minRole: "admin" }] : []),
    { label: "الأتمتة", icon: Workflow, path: "/automation", emoji: "⚡", minRole: "admin" },
    { label: "الشات بوت", icon: Bot, path: "/chatbot", emoji: "🤖", minRole: "admin" },
    { label: "الذكاء الاصطناعي", icon: Bot, path: "/ai-settings", emoji: "🧠", minRole: "admin" },
    { label: "العملاء", icon: UserCircle, path: "/customers", emoji: "👥", minRole: "admin" },
    ...(isEcommerce || isSuperAdmin ? [
      { label: "الطلبات", icon: ShoppingCart, path: "/orders", emoji: "🛒", minRole: "admin" },
      { label: "الكتالوج", icon: ShoppingCart, path: "/catalog", emoji: "🏪", minRole: "admin" },
      { label: "السلات المتروكة", icon: ShoppingCart, path: "/abandoned-carts", emoji: "🛒", minRole: "admin" },
    ] : []),
    { label: "التقارير", icon: BarChart3, path: "/analytics", emoji: "📈", minRole: "supervisor" },
    { label: "الربط والتكامل", icon: Plug, path: "/integrations", emoji: "🔌", minRole: "admin" },
    { label: "الفريق", icon: UsersIcon, path: "/team", emoji: "👨‍💼", minRole: "supervisor" },
    { label: "الإعدادات العامة", icon: Settings, path: "/settings", emoji: "⚙️", minRole: "admin" },
    { label: "إعدادات المحادثات", icon: MessageSquare, path: "/conversation-settings", emoji: "💬", minRole: "admin" },
    { label: "الاشتراك والفواتير", icon: CreditCard, path: "/billing", emoji: "💳", minRole: "admin" },
    { label: "المحفظة", icon: Wallet, path: "/wallet", emoji: "💰", minRole: "admin" },
  ];

  const moreItems = allMoreItems.filter((item) => {
    if (isSuperAdmin) return true;
    if (!item.minRole) return true;
    return userLevel >= (roleHierarchy[item.minRole] ?? 0);
  });

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border flex items-center justify-around h-14 px-1 safe-bottom" dir="rtl">
        <NavLink
          to="/inbox"
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-lg transition-colors",
            isActive("/inbox") ? "text-primary" : "text-muted-foreground"
          )}
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[10px] font-medium">واتساب</span>
        </NavLink>

        {hasEmailAccess && (
          <NavLink
            to="/email-inbox"
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-lg transition-colors",
              isActive("/email-inbox") ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Mail className="w-5 h-5" />
            <span className="text-[10px] font-medium">إيميل</span>
          </NavLink>
        )}

        {effectiveRole === "admin" && (
          <NavLink
            to="/"
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-lg transition-colors",
              isActive("/") ? "text-primary" : "text-muted-foreground"
            )}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[10px] font-medium">الرئيسية</span>
          </NavLink>
        )}

        {effectiveRole === "admin" && (
          <NavLink
            to="/customers"
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-lg transition-colors",
              isActive("/customers") ? "text-primary" : "text-muted-foreground"
            )}
          >
            <UserCircle className="w-5 h-5" />
            <span className="text-[10px] font-medium">العملاء</span>
          </NavLink>
        )}

        {/* More menu */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-lg text-muted-foreground relative">
              <div className="relative">
                <Menu className="w-5 h-5" />
                {openTicketCount > 0 && (
                  <span className="absolute -top-1 -left-1 min-w-[14px] h-[14px] bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                    {openTicketCount > 99 ? "99+" : openTicketCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">المزيد</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl px-3 pb-8 max-h-[75vh]" dir="rtl">
            {/* User info */}
            <div className="flex items-center gap-3 mb-4 mt-2 px-1">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-sm font-bold text-primary border-2 border-primary/20">
                  {profile?.full_name?.slice(0, 2) || "؟"}
                </div>
                <span className="absolute bottom-0 left-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-card" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{profile?.full_name || "مستخدم"}</p>
                <p className="text-xs text-muted-foreground">{roleLabels[displayRole]}</p>
              </div>
              <button
                onClick={() => { signOut(); setMenuOpen(false); }}
                className="p-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            <ScrollArea className="h-[calc(75vh-100px)]">
              <div className="grid grid-cols-3 gap-2 px-1">
                {moreItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-xl text-center transition-colors",
                      isActive(item.path)
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "bg-secondary/50 text-foreground hover:bg-secondary"
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="text-[11px] font-medium leading-tight">{item.label}</span>
                  </NavLink>
                ))}

                {isSuperAdmin && (
                  <NavLink
                    to="/admin"
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-xl text-center transition-colors",
                      isActive("/admin")
                        ? "bg-destructive/10 text-destructive border border-destructive/20"
                        : "bg-destructive/5 text-destructive hover:bg-destructive/10"
                    )}
                  >
                    <span className="text-lg">🛡️</span>
                    <span className="text-[11px] font-medium leading-tight">لوحة النظام</span>
                  </NavLink>
                )}
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </nav>
    </>
  );
};

export default MobileBottomNav;
