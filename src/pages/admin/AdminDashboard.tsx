import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Shield, LogOut, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import AdminOverview from "@/components/admin/AdminOverview";
import AdminAccounts from "@/components/admin/AdminAccounts";
import AdminFinance from "@/components/admin/AdminFinance";
import AdminPlans from "@/components/admin/AdminPlans";
import AdminCoupons from "@/components/admin/AdminCoupons";
import AdminUsage from "@/components/admin/AdminUsage";
import AdminSettings from "@/components/admin/AdminSettings";
import AdminMeta from "@/components/admin/AdminMeta";
import AdminBaileys from "@/components/admin/AdminBaileys";
import AdminLogs from "@/components/admin/AdminLogs";
import AdminEmergency from "@/components/admin/AdminEmergency";
import AdminAiManagement from "@/components/admin/AdminAiManagement";
import AdminPricingManager from "@/components/admin/AdminPricingManager";
import AdminBotTemplates from "@/components/admin/AdminBotTemplates";
import AdminWhatsAppMonitor from "@/components/admin/AdminWhatsAppMonitor";

const tabs = [
  { id: "overview", label: "نظرة عامة" },
  { id: "accounts", label: "الحسابات" },
  { id: "finance", label: "المالية" },
  { id: "plans", label: "الباقات" },
  { id: "pricing", label: "💎 التسعير" },
  { id: "coupons", label: "الكوبونات" },
  { id: "usage", label: "الاستخدام" },
  { id: "ai", label: "✨ AI" },
  { id: "meta", label: "ربط ميتا" },
  { id: "baileys", label: "سيرفر QR" },
  { id: "bot_templates", label: "🤖 قوالب البوت" },
  { id: "wa_monitor", label: "📡 مراقبة الأرقام" },
  { id: "logs", label: "السجلات" },
  { id: "settings", label: "إعدادات النظام" },
  { id: "emergency", label: "🚨 الطوارئ" },
];

const AdminDashboard = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");

  const renderTab = () => {
    switch (activeTab) {
      case "overview": return <AdminOverview />;
      case "accounts": return <AdminAccounts />;
      case "finance": return <AdminFinance />;
      case "plans": return <AdminPlans />;
      case "pricing": return <AdminPricingManager />;
      case "coupons": return <AdminCoupons />;
      case "usage": return <AdminUsage />;
      case "ai": return <AdminAiManagement />;
      case "meta": return <AdminMeta />;
      case "baileys": return <AdminBaileys />;
      case "bot_templates": return <AdminBotTemplates />;
      case "wa_monitor": return <AdminWhatsAppMonitor />;
      case "logs": return <AdminLogs />;
      case "settings": return <AdminSettings />;
      case "emergency": return <AdminEmergency />;
      default: return <AdminOverview />;
    }
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="bg-card border-b border-border px-3 md:px-6 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-destructive flex items-center justify-center">
            <Shield className="w-4 h-4 md:w-5 md:h-5 text-destructive-foreground" />
          </div>
          <div>
            <h1 className="text-sm md:text-lg font-bold">لوحة Super Admin</h1>
            <p className="text-[10px] md:text-[11px] text-muted-foreground hidden sm:block">إدارة المنصة الكاملة</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-xs gap-1 text-muted-foreground" onClick={() => navigate("/")}>
            <Home className="w-3 h-3" /> <span className="hidden sm:inline">التطبيق</span>
          </Button>
          <Button variant="ghost" size="sm" className="text-xs gap-1 text-destructive" onClick={signOut}>
            <LogOut className="w-3 h-3" /> <span className="hidden sm:inline">خروج</span>
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-card border-b border-border px-2 md:px-6 overflow-x-auto scrollbar-none">
        <div className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-3 md:px-4 py-2.5 md:py-3 text-[11px] md:text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 md:p-6 max-w-[1200px] mx-auto">
        {renderTab()}
      </div>
    </div>
  );
};

export default AdminDashboard;
