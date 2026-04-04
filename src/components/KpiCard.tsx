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
  1: "text-kpi-1",
  2: "text-kpi-2",
  3: "text-kpi-3",
  4: "text-kpi-4",
};

const KpiCard = ({ title, value, subtitle, icon: Icon, emoji, trend, colorIndex = 1 }: KpiCardProps) => {
  return (
    <div className="group bg-card rounded-2xl p-5 border border-border/50 hover:border-border transition-all duration-300 hover:shadow-card-hover animate-fade-in">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {trend && (
          <span className={cn(
            "text-[11px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1",
            trend.positive 
              ? "bg-success/10 text-success" 
              : "bg-destructive/10 text-destructive"
          )}>
            {trend.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend.value}
          </span>
        )}
      </div>
      <p className={cn("text-3xl font-black tracking-tight", colorMap[colorIndex])}>{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
};

export default KpiCard;
