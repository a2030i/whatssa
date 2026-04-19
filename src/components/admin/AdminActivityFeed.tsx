import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Activity, Search, ChevronDown, ChevronUp, Building2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface AuditLog {
  id: string;
  actor_id: string;
  org_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  old_value: any;
  new_value: any;
  ip_address: string | null;
  created_at: string;
  actor_name?: string | null;
  org_name?: string | null;
}

const fetchAuditLogs = async (search: string): Promise<AuditLog[]> => {
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;

  const logs: AuditLog[] = data || [];

  // Enrich with actor names
  const actorIds = [...new Set(logs.map(l => l.actor_id).filter(Boolean))];
  const orgIds   = [...new Set(logs.map(l => l.org_id).filter(Boolean))];

  const [profiles, orgs] = await Promise.all([
    actorIds.length ? supabase.from("profiles").select("id, full_name").in("id", actorIds) : { data: [] },
    orgIds.length   ? supabase.from("organizations").select("id, name").in("id", orgIds)    : { data: [] },
  ]);

  const profileMap: Record<string, string> = {};
  (profiles.data || []).forEach((p: any) => { profileMap[p.id] = p.full_name; });
  const orgMap: Record<string, string> = {};
  (orgs.data || []).forEach((o: any) => { orgMap[o.id] = o.name; });

  return logs.map(l => ({ ...l, actor_name: profileMap[l.actor_id] || null, org_name: l.org_id ? orgMap[l.org_id] || null : null }))
    .filter(l => !search || l.action.includes(search) || l.actor_name?.includes(search) || l.org_name?.includes(search));
};

const actionColor: Record<string, string> = {
  delete: "bg-red-100 text-red-700",
  suspend: "bg-orange-100 text-orange-700",
  create: "bg-green-100 text-green-700",
  update: "bg-blue-100 text-blue-700",
  impersonate: "bg-purple-100 text-purple-700",
};

const getActionColor = (action: string) => {
  for (const key of Object.keys(actionColor)) {
    if (action.toLowerCase().includes(key)) return actionColor[key];
  }
  return "bg-gray-100 text-gray-600";
};

const AdminActivityFeed = () => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const debounceRef = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (debounceRef[0]) clearTimeout(debounceRef[0]);
    debounceRef[1](setTimeout(() => setDebouncedSearch(val), 400));
  };

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ["admin-audit-log", debouncedSearch],
    queryFn: () => fetchAuditLogs(debouncedSearch),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            سجل نشاط الأدمن
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">كل العمليات التي نفّذها مديرو النظام</p>
        </div>
        <button onClick={() => refetch()} className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5">تحديث</button>
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={search} onChange={e => handleSearch(e.target.value)}
          placeholder="ابحث بالإجراء أو الأدمن أو المنظمة..."
          className="w-full border border-border rounded-xl py-2.5 pr-9 pl-4 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20" dir="rtl" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">جارٍ التحميل...</div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
          <Activity className="w-10 h-10 mb-2 opacity-20" />
          <p className="text-sm">لا توجد سجلات</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {logs.map(log => (
            <div key={log.id} className="border border-border rounded-xl overflow-hidden">
              <button onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-right">
                <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-lg shrink-0", getActionColor(log.action))}>
                  {log.action}
                </span>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {log.actor_name && (
                    <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                      <User className="w-3 h-3" />{log.actor_name}
                    </span>
                  )}
                  {log.org_name && (
                    <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                      <Building2 className="w-3 h-3" />{log.org_name}
                    </span>
                  )}
                  {log.target_type && (
                    <span className="text-[11px] text-muted-foreground/70 truncate">• {log.target_type}</span>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ar })}
                </span>
                {expanded === log.id ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              </button>

              {expanded === log.id && (
                <div className="border-t border-border px-4 py-3 bg-muted/20 space-y-2">
                  {log.ip_address && (
                    <p className="text-[11px] text-muted-foreground font-mono">IP: {log.ip_address}</p>
                  )}
                  {log.old_value && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground mb-1">قبل:</p>
                      <pre className="text-[10px] bg-red-50 border border-red-100 rounded-lg p-2 overflow-auto max-h-32 text-red-700 text-left ltr">
                        {JSON.stringify(log.old_value, null, 2)}
                      </pre>
                    </div>
                  )}
                  {log.new_value && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground mb-1">بعد:</p>
                      <pre className="text-[10px] bg-green-50 border border-green-100 rounded-lg p-2 overflow-auto max-h-32 text-green-700 text-left ltr">
                        {JSON.stringify(log.new_value, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminActivityFeed;
