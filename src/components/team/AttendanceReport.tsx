import { useState, useEffect } from "react";
import { Clock, TrendingUp, AlertTriangle, Award, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface AttendanceLog {
  id: string;
  event_type: string;
  event_at: string;
  classification: string | null;
  shift_id: string | null;
}

interface AttendanceReportProps {
  profileId?: string; // If provided, shows for specific employee
  compact?: boolean;
}

const CLASSIFICATION_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  on_time: { label: "في الوقت", color: "text-success", icon: Clock },
  late: { label: "متأخر", color: "text-warning", icon: AlertTriangle },
  early_leave: { label: "تقصير", color: "text-destructive", icon: AlertTriangle },
  overtime: { label: "جهد إضافي", color: "text-primary", icon: Award },
};

const AttendanceReport = ({ profileId, compact }: AttendanceReportProps) => {
  const { orgId, profile } = useAuth();
  const targetId = profileId || profile?.id;
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [stats, setStats] = useState({ onTime: 0, late: 0, earlyLeave: 0, overtime: 0, totalDays: 0 });

  useEffect(() => {
    if (orgId && targetId) loadLogs();
  }, [orgId, targetId]);

  const loadLogs = async () => {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from("attendance_logs" as any)
      .select("id, event_type, event_at, classification, shift_id")
      .eq("profile_id", targetId)
      .eq("org_id", orgId)
      .gte("event_at", startOfMonth.toISOString())
      .order("event_at", { ascending: false });

    const items = (data || []) as unknown as AttendanceLog[];
    setLogs(items);

    // Calculate stats
    const s = { onTime: 0, late: 0, earlyLeave: 0, overtime: 0, totalDays: 0 };
    const days = new Set<string>();
    items.forEach(log => {
      days.add(log.event_at.split("T")[0]);
      if (log.classification === "on_time") s.onTime++;
      if (log.classification === "late") s.late++;
      if (log.classification === "early_leave") s.earlyLeave++;
      if (log.classification === "overtime") s.overtime++;
    });
    s.totalDays = days.size;
    setStats(s);
  };

  if (compact) {
    return (
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-success/10 rounded-lg p-2 text-center">
          <p className="text-lg font-bold text-success">{stats.onTime}</p>
          <p className="text-[9px] text-muted-foreground">في الوقت</p>
        </div>
        <div className="bg-warning/10 rounded-lg p-2 text-center">
          <p className="text-lg font-bold text-warning">{stats.late}</p>
          <p className="text-[9px] text-muted-foreground">متأخر</p>
        </div>
        <div className="bg-destructive/10 rounded-lg p-2 text-center">
          <p className="text-lg font-bold text-destructive">{stats.earlyLeave}</p>
          <p className="text-[9px] text-muted-foreground">تقصير</p>
        </div>
        <div className="bg-primary/10 rounded-lg p-2 text-center">
          <p className="text-lg font-bold text-primary">{stats.overtime}</p>
          <p className="text-[9px] text-muted-foreground">جهد إضافي</p>
        </div>
      </div>
    );
  }

  // Group logs by date
  const grouped = logs.reduce<Record<string, AttendanceLog[]>>((acc, log) => {
    const date = log.event_at.split("T")[0];
    (acc[date] = acc[date] || []).push(log);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          سجل الحضور (الشهر الحالي)
        </h3>
        <Badge variant="secondary" className="text-[10px]">{stats.totalDays} يوم</Badge>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-success/10 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-success">{stats.onTime}</p>
          <p className="text-[10px] text-muted-foreground">في الوقت</p>
        </div>
        <div className="bg-warning/10 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-warning">{stats.late}</p>
          <p className="text-[10px] text-muted-foreground">تأخير</p>
        </div>
        <div className="bg-destructive/10 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-destructive">{stats.earlyLeave}</p>
          <p className="text-[10px] text-muted-foreground">تقصير</p>
        </div>
        <div className="bg-primary/10 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-primary">{stats.overtime}</p>
          <p className="text-[10px] text-muted-foreground">جهد إضافي</p>
        </div>
      </div>

      {/* Daily breakdown */}
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {Object.entries(grouped).map(([date, dayLogs]) => (
          <div key={date} className="bg-card rounded-xl border p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {new Date(date).toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "short" })}
            </p>
            <div className="space-y-1">
              {dayLogs.map(log => {
                const config = log.classification ? CLASSIFICATION_CONFIG[log.classification] : null;
                return (
                  <div key={log.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Badge variant={log.event_type === "clock_in" ? "default" : "secondary"} className="text-[9px] px-1.5">
                        {log.event_type === "clock_in" ? "حضور" : "انصراف"}
                      </Badge>
                      <span className="text-muted-foreground">
                        {new Date(log.event_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" })}
                      </span>
                    </div>
                    {config && (
                      <span className={cn("text-[10px] font-medium", config.color)}>
                        {config.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {Object.keys(grouped).length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">لا توجد سجلات حضور هذا الشهر</p>
        )}
      </div>
    </div>
  );
};

export default AttendanceReport;
