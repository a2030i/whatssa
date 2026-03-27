import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  colorIndex?: 1 | 2 | 3 | 4;
}

const colorMap = {
  1: "bg-kpi-1/10 text-kpi-1",
  2: "bg-kpi-2/10 text-kpi-2",
  3: "bg-kpi-3/10 text-kpi-3",
  4: "bg-kpi-4/10 text-kpi-4",
};

const KpiCard = ({ title, value, subtitle, icon: Icon, trend, colorIndex = 1 }: KpiCardProps) => {
  return (
    <div className="bg-card rounded-lg p-5 shadow-card hover:shadow-card-hover transition-shadow duration-200 animate-fade-in">
      <div className="flex items-start justify-between mb-3">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", colorMap[colorIndex])}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full",
            trend.positive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
          )}>
            {trend.value}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-sm text-muted-foreground mt-0.5">{title}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
};

export default KpiCard;
