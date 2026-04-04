import { cn } from "@/lib/utils";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  emoji?: string;
  trend?: { value: string; positive: boolean };
  colorIndex?: 1 | 2 | 3 | 4;
}

const colorMap = {
  1: { text: "text-kpi-1", bg: "bg-kpi-1/10", border: "border-kpi-1/20" },
  2: { text: "text-kpi-2", bg: "bg-kpi-2/10", border: "border-kpi-2/20" },
  3: { text: "text-kpi-3", bg: "bg-kpi-3/10", border: "border-kpi-3/20" },
  4: { text: "text-kpi-4", bg: "bg-kpi-4/10", border: "border-kpi-4/20" },
};

const KpiCard = ({ title, value, subtitle, icon: Icon, emoji, trend, colorIndex = 1 }: KpiCardProps) => {
  const colors = colorMap[colorIndex];

  return (
    <div className="bg-card rounded-lg border border-border p-4 hover:shadow-card-hover transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", colors.bg)}>
          <Icon className={cn("w-[18px] h-[18px]", colors.text)} />
        </div>
        {trend && (
          <span className={cn(
            "text-[11px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1",
            trend.positive 
              ? "bg-success/10 text-success" 
              : "bg-destructive/10 text-destructive"
          )}>
            {trend.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend.value}
          </span>
        )}
      </div>
      <p className={cn("text-2xl font-bold tracking-tight", colors.text)}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{title}</p>
      {subtitle && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{subtitle}</p>}
    </div>
  );
};

export default KpiCard;
