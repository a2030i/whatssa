import { cn } from "@/lib/utils";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  colorIndex?: 1 | 2 | 3 | 4;
}

const gradientMap = {
  1: "from-kpi-1/15 to-kpi-1/5",
  2: "from-kpi-2/15 to-kpi-2/5",
  3: "from-kpi-3/15 to-kpi-3/5",
  4: "from-kpi-4/15 to-kpi-4/5",
};

const iconBgMap = {
  1: "bg-kpi-1/12 text-kpi-1 ring-kpi-1/20",
  2: "bg-kpi-2/12 text-kpi-2 ring-kpi-2/20",
  3: "bg-kpi-3/12 text-kpi-3 ring-kpi-3/20",
  4: "bg-kpi-4/12 text-kpi-4 ring-kpi-4/20",
};

const KpiCard = ({ title, value, subtitle, icon: Icon, trend, colorIndex = 1 }: KpiCardProps) => {
  return (
    <div className={cn(
      "relative bg-card rounded-xl p-5 border border-border/50 hover:border-border transition-all duration-300 hover:shadow-card-hover group animate-fade-in overflow-hidden"
    )}>
      {/* Subtle gradient overlay */}
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-40 rounded-xl pointer-events-none", gradientMap[colorIndex])} />
      
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className={cn(
            "w-11 h-11 rounded-xl flex items-center justify-center ring-1 transition-transform duration-300 group-hover:scale-110",
            iconBgMap[colorIndex]
          )}>
            <Icon className="w-5 h-5" />
          </div>
          {trend && (
            <span className={cn(
              "text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1",
              trend.positive 
                ? "bg-success/10 text-success" 
                : "bg-destructive/10 text-destructive"
            )}>
              {trend.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {trend.value}
            </span>
          )}
        </div>
        <p className="text-2xl font-black text-foreground tracking-tight">{value}</p>
        <p className="text-sm font-medium text-muted-foreground mt-1">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground/70 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
};

export default KpiCard;
