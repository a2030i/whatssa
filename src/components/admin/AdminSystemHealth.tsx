import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Activity, AlertCircle, AlertTriangle, Info, XCircle, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface SystemLog {
  id: string;
  level: string;
  source: string;
  function_name: string | null;
  message: string;
  metadata: any;
  org_id: string | null;
  created_at: string;
  stack_trace: string | null;
}

interface HealthSummary {
  errors_1h: number;
  errors_24h: number;
  warnings_24h: number;
  top_functions: { name: string; count: number }[];
}

const LEVEL_CONFIG: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  critical: { icon: XCircle,       color: "text-red-600",    bg: "bg-red-50 border-red-200",    label: "حرج" },
  error:    { icon: AlertCircle,   color: "text-red-500",    bg: "bg-red-50/70 border-red-100", label: "خطأ" },
  warn:     { icon: AlertTriangle, color: "text-amber-500",  bg: "bg-amber-50 border-amber-200",label: "تحذير" },
  info:     { icon: Info,          color: "text-blue-500",   bg: "bg-blue-50 border-blue-200",  label: "معلومة" },
};

const fetchLogs = async (level: string, fnFilter: string): Promise<{ logs: SystemLog[]; summary: HealthSummary }> => {
  const now = new Date();
  const h1  = new Date(now.getTime() - 3600_000).toISOString();
  const h24 = new Date(now.getTime() - 86400_000).toISOString();

  let q = supabase
    .from("system_logs")
    .select("id, level, source, function_name, message, metadata, org_id, created_at, stack_trace")
    .order("created_at", { ascending: false })
    .limit(300);

  if (level !== "all") q = q.eq("level", level);
  if (fnFilter) q = q.ilike("function_name", `%${fnFilter}%`);

  const [logsRes, err1h, err24h, warn24h] = await Promise.all([
    q,
    supabase.from("system_logs").select("id", { count: "exact", head: true }).in("level", ["error", "critical"]).gte("created_at", h1),
    supabase.from("system_logs").select("id", { count: "exact", head: true }).in("level", ["error", "critical"]).gte("created_at", h24),
    supabase.from("system_logs").select("id", { count: "exact", head: true }).eq("level", "warn").gte("created_at", h24),
  ]);

  const logs: SystemLog[] = logsRes.data || [];

  const fnCount: Record<string, number> = {};
  logs.forEach(l => { if (l.function_name) fnCount[l.function_name] = (fnCount[l.function_name] || 0) + 1; });
  const top_functions = Object.entries(fnCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return {
    logs,
    summary: {
      errors_1h: err1h.count || 0,
      errors_24h: err24h.count || 0,
      warnings_24h: warn24h.count || 0,
      top_functions,
    },
  };
};

const AdminSystemHealth = () => {
  const [levelFilter, setLevelFilter] = useState("error");
  const [fnFilter, setFnFilter] = useState("");
  const [debouncedFn, setDebouncedFn] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const debounceRef = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleFnFilter = (val: string) => {
    setFnFilter(val);
    if (debounceRef[0]) clearTimeout(debounceRef[0]);
    debounceRef[1](setTimeout(() => setDebouncedFn(val), 400));
  };

  const { data, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["system-health", levelFilter, debouncedFn],
    queryFn: () => fetchLogs(levelFilter, debouncedFn),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { logs = [], summary } = data || { logs: [], summary: null };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            صحة النظام
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            مراقبة أخطاء Edge Functions — يتحدث كل 60 ثانية
            {dataUpdatedAt > 0 && (
              <span className="mr-2 opacity-60">
                آخر تحديث: {formatDistanceToNow(new Date(dataUpdatedAt), { locale: ar, addSuffix: true })}
              </span>
            )}
          </p>
        </div>
        <button onClick={() => refetch()}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> تحديث
        </button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <div className={cn("border rounded-2xl p-3 text-center", summary.errors_1h > 0 ? "border-red-200 bg-red-50" : "border-border")}>
            <p className={cn("text-2xl font-bold", summary.errors_1h > 0 ? "text-red-600" : "text-foreground")}>
              {summary.errors_1h}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">أخطاء آخر ساعة</p>
          </div>
          <div className={cn("border rounded-2xl p-3 text-center", summary.errors_24h > 10 ? "border-red-100 bg-red-50/50" : "border-border")}>
            <p className="text-2xl font-bold">{summary.errors_24h}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">أخطاء آخر 24 ساعة</p>
          </div>
          <div className="border border-border rounded-2xl p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{summary.warnings_24h}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">تحذيرات آخر 24 ساعة</p>
          </div>
        </div>
      )}

      {/* Top functions with errors */}
      {summary && summary.top_functions.length > 0 && (
        <div className="border border-border rounded-2xl p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-3">الوظائف الأكثر أخطاءً</p>
          <div className="space-y-2">
            {summary.top_functions.map(fn => (
              <div key={fn.name} className="flex items-center gap-3">
                <span className="text-[12px] font-mono flex-1 truncate">{fn.name}</span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 bg-red-200 rounded-full" style={{ width: `${Math.min(fn.count * 8, 120)}px` }} />
                  <span className="text-[11px] font-bold text-red-600 w-8 text-right">{fn.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {["all", "critical", "error", "warn", "info"].map(l => {
          const lc = LEVEL_CONFIG[l];
          return (
            <button key={l} onClick={() => setLevelFilter(l)}
              className={cn("text-xs px-3 py-1.5 rounded-xl border font-medium transition-colors",
                levelFilter === l ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
              {l === "all" ? "الكل" : lc?.label || l}
            </button>
          );
        })}
        <input value={fnFilter} onChange={e => handleFnFilter(e.target.value)}
          placeholder="فلتر بالوظيفة..." dir="ltr"
          className="border border-border rounded-xl py-1.5 px-3 text-xs bg-background focus:outline-none min-w-[150px]" />
      </div>

      {/* Logs */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">جارٍ التحميل...</div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
          <Activity className="w-10 h-10 mb-2 opacity-20" />
          <p className="text-sm">لا توجد سجلات</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {logs.map(log => {
            const lc = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.info;
            const Icon = lc.icon;
            return (
              <div key={log.id} className={cn("border rounded-xl overflow-hidden", lc.bg)}>
                <button onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-right hover:opacity-90 transition-opacity">
                  <Icon className={cn("w-4 h-4 shrink-0 mt-0.5", lc.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      {log.function_name && (
                        <span className="text-[11px] font-mono bg-white/70 px-1.5 py-0.5 rounded text-gray-700">{log.function_name}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground">{log.source}</span>
                    </div>
                    <p className="text-[12px] text-gray-800 truncate">{log.message}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {format(new Date(log.created_at), "dd/MM HH:mm:ss", { locale: ar })}
                  </span>
                  {expanded === log.id ? <ChevronUp className="w-3.5 h-3.5 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
                </button>
                {expanded === log.id && (
                  <div className="border-t border-white/50 px-4 py-3 space-y-2 bg-white/40">
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <pre className="text-[10px] bg-white/80 rounded-lg p-2 overflow-auto max-h-40 text-gray-700 text-left ltr">
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    )}
                    {log.stack_trace && (
                      <pre className="text-[10px] bg-red-900/10 rounded-lg p-2 overflow-auto max-h-40 text-red-800 text-left ltr font-mono">
                        {log.stack_trace}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminSystemHealth;
