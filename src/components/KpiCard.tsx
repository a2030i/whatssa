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
  1: "from-kpi-1/10 to-transparent",
  2: "from-kpi-2/10 to-transparent",
  3: "from-kpi-3/10 to-transparent",
  4: "from-kpi-4/10 to-transparent",
};

const iconBgMap = {
  1: "bg-kpi-1/10 text-kpi-1 ring-1 ring-kpi-1/15",
  2: "bg-kpi-2/10 text-kpi-2 ring-1 ring-kpi-2/15",
  3: "bg-kpi-3/10 text-kpi-3 ring-1 ring-kpi-3/15",
  4: "bg-kpi-4/10 text-kpi-4 ring-1 ring-kpi-4/15",
};

const KpiCard = ({ title, value, subtitle, icon: Icon, trend, colorIndex = 1 }: KpiCardProps) => {
  return (
    <div className={cn(
      "group relative bg-card/70 backdrop-blur-sm rounded-2xl p-5 border border-border/40 hover:border-border/80 transition-all duration-300 hover:shadow-card-hover animate-fade-in overflow-hidden"
    )}>
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-50 rounded-2xl pointer-events-none", gradientMap[colorIndex])} />
      
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className={cn(
            "w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110",
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
