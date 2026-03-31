import { useDashboardData } from "@/hooks/useDashboardData";
import StatusBar from "@/components/dashboard/StatusBar";
import SmartAlerts from "@/components/dashboard/SmartAlerts";
import OperationalMetrics from "@/components/dashboard/OperationalMetrics";
import AccountHealth from "@/components/dashboard/AccountHealth";
import SmartInsight from "@/components/dashboard/SmartInsight";
import VerificationCard from "@/components/dashboard/VerificationCard";
import TokenAlert from "@/components/dashboard/TokenAlert";
import { Loader2, LayoutDashboard } from "lucide-react";

const DashboardPage = () => {
  const data = useDashboardData();

  if (data.isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">جاري التحميل...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1280px] mx-auto space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-4 animate-fade-in">
        <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center shadow-glow shrink-0">
          <LayoutDashboard className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-black text-foreground tracking-tight">لوحة التحكم</h1>
          <p className="text-sm text-muted-foreground">
            {data.orgName && `${data.orgName} • `}
            <span className="font-semibold">{data.planName}</span>
            {" • "}
            <span className={data.subscriptionStatus === "trial" ? "text-warning font-semibold" : "text-success font-semibold"}>
              {data.subscriptionStatus === "trial" ? "فترة تجريبية" : data.subscriptionStatus === "active" ? "فعّال" : data.subscriptionStatus}
            </span>
          </p>
        </div>
      </div>

      <StatusBar data={data} />
      <TokenAlert data={data} />
      <VerificationCard data={data} />
      <SmartAlerts data={data} />
      <SmartInsight data={data} />
      <OperationalMetrics data={data} />
      <AccountHealth data={data} />
    </div>
  );
};

export default DashboardPage;
