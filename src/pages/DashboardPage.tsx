import { useDashboardData } from "@/hooks/useDashboardData";
import StatusBar from "@/components/dashboard/StatusBar";
import SmartAlerts from "@/components/dashboard/SmartAlerts";
import OperationalMetrics from "@/components/dashboard/OperationalMetrics";
import AccountHealth from "@/components/dashboard/AccountHealth";
import SmartInsight from "@/components/dashboard/SmartInsight";
import VerificationCard from "@/components/dashboard/VerificationCard";
import TokenAlert from "@/components/dashboard/TokenAlert";
import { Loader2 } from "lucide-react";

const DashboardPage = () => {
  const data = useDashboardData();

  if (data.isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">جاري التحميل...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <div className="animate-fade-in">
        <h1 className="text-lg font-bold text-foreground">لوحة التحكم</h1>
        <p className="text-sm text-muted-foreground">
          {data.orgName && `${data.orgName} · `}
          <span className="font-medium">{data.planName}</span>
          {" · "}
          <span className={data.subscriptionStatus === "trial" ? "text-warning font-medium" : "text-success font-medium"}>
            {data.subscriptionStatus === "trial" ? "فترة تجريبية" : data.subscriptionStatus === "active" ? "فعّال" : data.subscriptionStatus}
          </span>
        </p>
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
