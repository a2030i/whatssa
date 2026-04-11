import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, RefreshCw, AlertTriangle, AlertCircle, Info, XCircle, Filter, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface SystemLog {
  id: string;
  level: string;
  source: string;
  function_name: string | null;
  message: string;
  metadata: any;
  org_id: string | null;
  user_id: string | null;
  request_id: string | null;
  stack_trace: string | null;
  created_at: string;
}

const levelConfig: Record<string, { icon: any; color: string; label: string }> = {
  info: { icon: Info, color: "text-blue-500 bg-blue-500/10", label: "معلومة" },
  warn: { icon: AlertTriangle, color: "text-yellow-500 bg-yellow-500/10", label: "تحذير" },
  error: { icon: AlertCircle, color: "text-destructive bg-destructive/10", label: "خطأ" },
  critical: { icon: XCircle, color: "text-red-600 bg-red-600/10", label: "حرج" },
};

const sourceLabels: Record<string, string> = {
  edge_function: "وظيفة خلفية",
  frontend: "واجهة",
  webhook: "Webhook",
  system: "نظام",
  payment: "دفع",
};

const AdminLogs = () => {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [orgFilter, setOrgFilter] = useState<string>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [logsLimit, setLogsLimit] = useState(200);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("organizations").select("id, name").order("name").then(({ data }) => setOrgs(data || []));
  }, []);

  const fetchLogs = async () => {
    setIsLoading(true);
    let query = supabase
      .from("system_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(logsLimit);

    if (levelFilter) query = query.eq("level", levelFilter);
    if (sourceFilter) query = query.eq("source", sourceFilter);
    if (search) query = query.ilike("message", `%${search}%`);
    if (orgFilter) query = query.eq("org_id", orgFilter);
    if (fromDate) query = query.gte("created_at", new Date(fromDate).toISOString());
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      query = query.lte("created_at", to.toISOString());
    }

    const { data } = await query;
    setLogs((data as SystemLog[]) || []);
    setIsLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [levelFilter, sourceFilter, logsLimit]);

  const handleSearch = () => fetchLogs();

  const clearFilters = () => {
    setLevelFilter(null);
    setSourceFilter(null);
    setOrgFilter("");
    setFromDate("");
    setToDate("");
    setSearch("");
    setLogsLimit(200);
  };

  const hasActiveFilters = levelFilter || sourceFilter || orgFilter || fromDate || toDate || search;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-primary" />
          سجلات النظام
        </h2>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={clearFilters}>
              مسح الفلاتر
            </Button>
          )}
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={fetchLogs} disabled={isLoading}>
            <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
            تحديث
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl shadow-card p-3 space-y-3">
        {/* Row 1: search + org + limit */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="بحث في السجلات..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="h-8 text-xs pr-9"
            />
          </div>
          <select
            value={orgFilter}
            onChange={e => setOrgFilter(e.target.value)}
            className="h-8 text-xs bg-secondary rounded-md px-2 border-0 min-w-[140px]"
          >
            <option value="">كل المنظمات</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select
            value={logsLimit}
            onChange={e => setLogsLimit(Number(e.target.value))}
            className="h-8 text-xs bg-secondary rounded-md px-2 border-0"
          >
            <option value={50}>50 سجل</option>
            <option value={100}>100 سجل</option>
            <option value={200}>200 سجل</option>
            <option value={500}>500 سجل</option>
          </select>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleSearch}>
            بحث
          </Button>
        </div>

        {/* Row 2: date range */}
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-[10px] text-muted-foreground">من:</span>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="h-7 text-xs bg-secondary rounded-md px-2 border-0 focus:outline-none focus:ring-1 focus:ring-primary" dir="ltr" />
          <span className="text-[10px] text-muted-foreground">إلى:</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="h-7 text-xs bg-secondary rounded-md px-2 border-0 focus:outline-none focus:ring-1 focus:ring-primary" dir="ltr" />
          {(fromDate || toDate) && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleSearch}>تطبيق</Button>
          )}
        </div>

        {/* Row 3: level + source chips */}
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Filter className="w-3 h-3" /> المستوى:
          </div>
          {["info", "warn", "error", "critical"].map((level) => {
            const cfg = levelConfig[level];
            return (
              <button
                key={level}
                onClick={() => setLevelFilter(levelFilter === level ? null : level)}
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-medium transition-all",
                  levelFilter === level ? cfg.color + " ring-1 ring-current" : "bg-muted text-muted-foreground"
                )}
              >
                {cfg.label}
              </button>
            );
          })}

          <div className="w-px bg-border mx-1" />
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">المصدر:</div>
          {Object.entries(sourceLabels).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSourceFilter(sourceFilter === key ? null : key)}
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-medium transition-all",
                sourceFilter === key ? "bg-primary/10 text-primary ring-1 ring-primary" : "bg-muted text-muted-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Logs List */}
      <div className="bg-card rounded-xl shadow-card overflow-hidden">
        <ScrollArea className="h-[500px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground text-xs">جاري التحميل...</div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Info className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">لا توجد سجلات</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {logs.map((log) => {
                const cfg = levelConfig[log.level] || levelConfig.info;
                const Icon = cfg.icon;
                const isExpanded = expandedLog === log.id;
                const orgName = orgs.find(o => o.id === log.org_id)?.name;

                return (
                  <div
                    key={log.id}
                    className={cn(
                      "px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors",
                      isExpanded && "bg-muted/30"
                    )}
                    onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                  >
                    <div className="flex items-start gap-2">
                      <div className={cn("mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0", cfg.color)}>
                        <Icon className="w-3 h-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-medium truncate flex-1">{log.message}</p>
                          <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                            {format(new Date(log.created_at), "HH:mm:ss dd/MM", { locale: ar })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                            {sourceLabels[log.source] || log.source}
                          </Badge>
                          {log.function_name && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1.5 font-mono">
                              {log.function_name}
                            </Badge>
                          )}
                          {log.org_id && (
                            <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                              <Building2 className="w-2.5 h-2.5" />
                              {orgName || log.org_id.slice(0, 8)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 mr-7 space-y-2">
                        {log.request_id && (
                          <div className="text-[10px]">
                            <span className="text-muted-foreground">Request ID: </span>
                            <span className="font-mono">{log.request_id}</span>
                          </div>
                        )}
                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-1">البيانات:</p>
                            <pre className="text-[10px] bg-muted rounded-lg p-2 overflow-x-auto font-mono leading-relaxed" dir="ltr">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                        {log.stack_trace && (
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-1">Stack Trace:</p>
                            <pre className="text-[10px] bg-destructive/5 text-destructive rounded-lg p-2 overflow-x-auto font-mono leading-relaxed" dir="ltr">
                              {log.stack_trace}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Stats */}
      {logs.length > 0 && (
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span>إجمالي: {logs.length}</span>
          <span className="text-red-500">أخطاء: {logs.filter(l => l.level === "error" || l.level === "critical").length}</span>
          <span className="text-yellow-500">تحذيرات: {logs.filter(l => l.level === "warn").length}</span>
          {hasActiveFilters && <span className="text-primary">• فلتر نشط</span>}
        </div>
      )}
    </div>
  );
};

export default AdminLogs;

