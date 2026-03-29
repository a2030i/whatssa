import { useDashboardData } from "@/hooks/useDashboardData";
import StatusBar from "@/components/dashboard/StatusBar";
import SmartAlerts from "@/components/dashboard/SmartAlerts";
import OperationalMetrics from "@/components/dashboard/OperationalMetrics";
import AccountHealth from "@/components/dashboard/AccountHealth";
import SmartInsight from "@/components/dashboard/SmartInsight";
import { Loader2 } from "lucide-react";

const DashboardPage = () => {
  const data = useDashboardData();

  if (data.isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">لوحة التحكم</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {data.orgName && `${data.orgName} • `}
          {data.planName} • {data.subscriptionStatus === "trial" ? "فترة تجريبية" : data.subscriptionStatus === "active" ? "فعّال" : data.subscriptionStatus}
        </p>
      </div>

      {/* 1. Status Bar */}
      <StatusBar data={data} />

      {/* 2. Smart Alerts */}
      <SmartAlerts data={data} />

      {/* 3. Smart Insight */}
      <SmartInsight data={data} />

      {/* 4. Operational Metrics */}
      <OperationalMetrics data={data} />

      {/* 5. Account Health */}
      <AccountHealth data={data} />
    </div>
  );
};

export default DashboardPage;
