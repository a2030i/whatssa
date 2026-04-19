import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Shield, Clock, Building2, User, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceStrict } from "date-fns";
import { ar } from "date-fns/locale";

interface ImpersonationLog {
  id: string;
  super_admin_id: string | null;
  super_admin_name: string | null;
  target_org_id: string | null;
  target_org_name: string | null;
  started_at: string | null;
  ended_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

const fetchLogs = async (): Promise<ImpersonationLog[]> => {
  const { data, error } = await supabase
    .from("impersonation_logs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
};

const duration = (start: string | null, end: string | null) => {
  if (!start) return "—";
  const s = new Date(start);
  const e = end ? new Date(end) : new Date();
  return formatDistanceStrict(s, e, { locale: ar });
};

const AdminImpersonationLogs = () => {
  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ["impersonation-logs"],
    queryFn: fetchLogs,
    staleTime: 60_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <Shield className="w-4 h-4 text-destructive" />
            سجل Impersonation
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">كل جلسات دخول السوبر أدمن على حسابات المنظمات</p>
        </div>
        <button onClick={() => refetch()} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 border border-border rounded-lg px-3 py-1.5">
          تحديث
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">جارٍ التحميل...</div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
          <Shield className="w-10 h-10 mb-2 opacity-20" />
          <p className="text-sm">لا توجد سجلات بعد</p>
        </div>
      ) : (
        <div className="border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">الأدمن</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">المنظمة المستهدفة</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">وقت البدء</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground hidden sm:table-cell">المدة</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground hidden lg:table-cell">IP</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map(log => {
                const isActive = !log.ended_at;
                return (
                  <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                          <User className="w-3.5 h-3.5 text-destructive" />
                        </div>
                        <span className="text-[13px] font-medium">{log.super_admin_name || log.super_admin_id?.slice(0, 8) || "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-[13px]">{log.target_org_name || log.target_org_id?.slice(0, 8) || "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span className="text-[12px]">
                          {log.started_at ? format(new Date(log.started_at), "dd/MM/yyyy HH:mm", { locale: ar }) : "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-[12px] text-muted-foreground">{duration(log.started_at, log.ended_at)}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Monitor className="w-3 h-3" />
                        <span className="text-[11px] font-mono">{log.ip_address || "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-lg",
                        isActive ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500")}>
                        {isActive ? "🔴 نشط" : "منتهي"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminImpersonationLogs;
