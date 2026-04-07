import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface HeatmapData {
  [key: string]: number; // "day-hour" -> count
}

const ActivityHeatmap = () => {
  const { orgId } = useAuth();
  const [data, setData] = useState<HeatmapData>({});
  const [maxVal, setMaxVal] = useState(1);
  const [loading, setLoading] = useState(true);
  const [weeks, setWeeks] = useState(4);

  useEffect(() => {
    if (!orgId) return;
    fetchData();
  }, [orgId, weeks]);

  const fetchData = async () => {
    setLoading(true);
    const start = new Date();
    start.setDate(start.getDate() - weeks * 7);

    const { data: convs } = await supabase
      .from("conversations")
      .select("created_at")
      .eq("org_id", orgId)
      .gte("created_at", start.toISOString())
      .limit(1000);

    const heatmap: HeatmapData = {};
    let max = 0;

    if (convs) {
      convs.forEach((c) => {
        const d = new Date(c.created_at!);
        const key = `${d.getDay()}-${d.getHours()}`;
        heatmap[key] = (heatmap[key] || 0) + 1;
        if (heatmap[key] > max) max = heatmap[key];
      });
    }

    setData(heatmap);
    setMaxVal(max || 1);
    setLoading(false);
  };

  const getColor = (count: number) => {
    if (count === 0) return "bg-secondary";
    const intensity = count / maxVal;
    if (intensity > 0.75) return "bg-primary";
    if (intensity > 0.5) return "bg-primary/70";
    if (intensity > 0.25) return "bg-primary/40";
    return "bg-primary/20";
  };

  const peakHour = () => {
    let maxKey = "";
    let maxCount = 0;
    Object.entries(data).forEach(([key, count]) => {
      if (count > maxCount) { maxCount = count; maxKey = key; }
    });
    if (!maxKey) return null;
    const [day, hour] = maxKey.split("-").map(Number);
    return { day: DAYS[day], hour: `${hour}:00`, count: maxCount };
  };

  const peak = peakHour();

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Flame className="w-4 h-4 text-primary" />
            خريطة النشاط الحرارية
          </CardTitle>
          <div className="flex gap-1">
            {[2, 4, 8].map((w) => (
              <button
                key={w}
                onClick={() => setWeeks(w)}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-md transition-colors",
                  weeks === w ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                )}
              >
                {w} أسابيع
              </button>
            ))}
          </div>
        </div>
        {peak && (
          <p className="text-xs text-muted-foreground mt-1">
            🔥 أعلى نشاط: <span className="font-semibold text-foreground">{peak.day} الساعة {peak.hour}</span> ({peak.count} محادثة)
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Hour labels */}
            <div className="flex gap-0.5 mb-1 mr-16">
              {HOURS.map((h) => (
                <div key={h} className="flex-1 text-center text-[9px] text-muted-foreground">
                  {h % 3 === 0 ? `${h}` : ""}
                </div>
              ))}
            </div>
            {/* Grid */}
            {DAYS.map((day, dayIdx) => (
              <div key={day} className="flex items-center gap-0.5 mb-0.5">
                <span className="text-[10px] text-muted-foreground w-16 text-left shrink-0">{day}</span>
                {HOURS.map((hour) => {
                  const count = data[`${dayIdx}-${hour}`] || 0;
                  return (
                    <Tooltip key={hour}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "flex-1 aspect-square rounded-sm transition-colors cursor-default min-w-[16px]",
                            getColor(count)
                          )}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <p>{day} - {hour}:00</p>
                        <p className="font-semibold">{count} محادثة</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
            {/* Legend */}
            <div className="flex items-center gap-2 mt-3 justify-end">
              <span className="text-[10px] text-muted-foreground">أقل</span>
              {["bg-secondary", "bg-primary/20", "bg-primary/40", "bg-primary/70", "bg-primary"].map((c) => (
                <div key={c} className={cn("w-3 h-3 rounded-sm", c)} />
              ))}
              <span className="text-[10px] text-muted-foreground">أكثر</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ActivityHeatmap;
