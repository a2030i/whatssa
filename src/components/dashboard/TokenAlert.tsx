import { AlertTriangle, RefreshCw, Clock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardData } from "@/hooks/useDashboardData";
import { useNavigate } from "react-router-dom";

interface TokenAlertProps {
  data: DashboardData;
}

const TokenAlert = ({ data }: TokenAlertProps) => {
  const { tokenExpiresAt, tokenRefreshError, waStatus, channelType } = data;
  const navigate = useNavigate();

  // Only show for official channels
  if (channelType !== "official") return null;
  if (!waStatus.isConnected) return null;

  // Check if token refresh failed
  if (tokenRefreshError) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 animate-fade-in">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-destructive">فشل تجديد التوكن</p>
            <p className="text-xs text-destructive/80 mt-1">
              تحتاج إعادة ربط واتساب لضمان استمرار الإرسال والاستقبال.
            </p>
            <p className="text-[10px] text-destructive/60 mt-1">{tokenRefreshError}</p>
            <Button
              size="sm"
              variant="destructive"
              className="mt-3 text-xs gap-1"
              onClick={() => navigate("/integrations")}
            >
              <RefreshCw className="w-3 h-3" /> إعادة الربط
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Check if token is expiring soon
  if (!tokenExpiresAt) return null;

  const expiresAt = new Date(tokenExpiresAt);
  const now = new Date();
  const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  // Already expired
  if (daysLeft <= 0) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 animate-fade-in">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-destructive">انتهت صلاحية التوكن</p>
            <p className="text-xs text-destructive/80 mt-1">
              لن تتمكن من إرسال أو استقبال الرسائل. أعد ربط واتساب الآن.
            </p>
            <Button
              size="sm"
              variant="destructive"
              className="mt-3 text-xs gap-1"
              onClick={() => navigate("/integrations")}
            >
              <RefreshCw className="w-3 h-3" /> إعادة الربط
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Expiring within 7 days — warning
  if (daysLeft <= 7) {
    return (
      <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 animate-fade-in">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-warning">التوكن ينتهي قريباً</p>
            <p className="text-xs text-warning/80 mt-1">
              يتبقى <strong>{daysLeft} {daysLeft === 1 ? "يوم" : "أيام"}</strong> على انتهاء صلاحية الربط. سيتم التجديد تلقائياً، لكن إذا فشل ستحتاج إعادة الربط.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default TokenAlert;
