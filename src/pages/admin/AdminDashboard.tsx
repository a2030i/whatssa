import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Shield, ChevronLeft, LogOut } from "lucide-react";
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

const tabs = [
  { id: "overview", label: "نظرة عامة" },
  { id: "accounts", label: "الحسابات" },
  { id: "finance", label: "المالية" },
  { id: "plans", label: "الباقات" },
  { id: "coupons", label: "الكوبونات" },
  { id: "usage", label: "الاستخدام" },
  { id: "meta", label: "ربط ميتا" },
  { id: "settings", label: "إعدادات النظام" },
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
      case "coupons": return <AdminCoupons />;
      case "usage": return <AdminUsage />;
      case "meta": return <AdminMeta />;
      case "settings": return <AdminSettings />;
      default: return <AdminOverview />;
    }
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="bg-card border-b border-border px-6 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-destructive flex items-center justify-center">
            <Shield className="w-5 h-5 text-destructive-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold">لوحة Super Admin</h1>
            <p className="text-[11px] text-muted-foreground">إدارة المنصة الكاملة</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => navigate("/")}>
            <ChevronLeft className="w-3 h-3" /> لوحة العميل
          </Button>
          <Button variant="ghost" size="sm" className="text-xs gap-1 text-destructive" onClick={signOut}>
            <LogOut className="w-3 h-3" /> خروج
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-card border-b border-border px-6 overflow-x-auto">
        <div className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
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

      <div className="p-6 max-w-[1200px] mx-auto">
        {renderTab()}
      </div>
    </div>
  );
};

export default AdminDashboard;