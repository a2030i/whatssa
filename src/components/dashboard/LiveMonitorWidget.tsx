import { useState, useEffect } from "react";
import { Activity, Users, MessageSquare, Clock, Zap, Wifi } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface LiveStats {
  activeConversations: number;
  waitingConversations: number;
  onlineAgents: number;
  totalAgents: number;
  avgWaitMinutes: number;
  messagesLastHour: number;
  unassigned: number;
}

const LiveMonitorWidget = () => {
  const { orgId } = useAuth();
  const [stats, setStats] = useState<LiveStats>({
    activeConversations: 0, waitingConversations: 0,
    onlineAgents: 0, totalAgents: 0,
    avgWaitMinutes: 0, messagesLastHour: 0, unassigned: 0,
  });
  const [pulse, setPulse] = useState(false);

  const fetchStats = async () => {
    if (!orgId) return;
    const hourAgo = new Date(Date.now() - 3600000).toISOString();

    const [convRes, agentsRes, msgRes, unassRes] = await Promise.all([
      supabase.from("conversations").select("status", { count: "exact", head: false })
        .eq("org_id", orgId).in("status", ["active", "waiting"]),
      supabase.from("profiles").select("id, is_online, last_seen_at")
        .eq("org_id", orgId).eq("is_active", true),
      supabase.from("messages").select("id", { count: "exact", head: true })
        .gte("created_at", hourAgo),
      supabase.from("conversations").select("id", { count: "exact", head: true })
        .eq("org_id", orgId).eq("status", "active").is("assigned_to_id", null),
    ]);

    const convs = convRes.data || [];
    const agents = agentsRes.data || [];
    const fiveMinAgo = new Date(Date.now() - 300000).toISOString();
    const online = agents.filter((a: any) => a.is_online || (a.last_seen_at && a.last_seen_at > fiveMinAgo));

    // Calculate avg wait for active conversations without first response
    const { data: waitingConvs } = await supabase
      .from("conversations")
      .select("created_at")
      .eq("org_id", orgId)
      .eq("status", "active")
      .is("first_response_at", null)
      .limit(50);

    let avgWait = 0;
    if (waitingConvs && waitingConvs.length > 0) {
      const totalMin = waitingConvs.reduce((sum: number, c: any) => {
        return sum + (Date.now() - new Date(c.created_at).getTime()) / 60000;
      }, 0);
      avgWait = Math.round(totalMin / waitingConvs.length);
    }

    setStats({
      activeConversations: convs.filter((c: any) => c.status === "active").length,
      waitingConversations: convs.filter((c: any) => c.status === "waiting").length,
      onlineAgents: online.length,
      totalAgents: agents.length,
      avgWaitMinutes: avgWait,
      messagesLastHour: msgRes.count || 0,
      unassigned: unassRes.count || 0,
    });
    setPulse(true);
    setTimeout(() => setPulse(false), 1000);
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [orgId]);

  const items = [
    { icon: MessageSquare, label: "محادثات نشطة", value: stats.activeConversations, color: "text-primary", bg: "bg-primary/10" },
    { icon: Clock, label: "بانتظار الرد", value: stats.unassigned, color: stats.unassigned > 5 ? "text-destructive" : "text-warning", bg: stats.unassigned > 5 ? "bg-destructive/10" : "bg-warning/10" },
    { icon: Users, label: "موظف متصل", value: `${stats.onlineAgents}/${stats.totalAgents}`, color: "text-success", bg: "bg-success/10" },
    { icon: Zap, label: "رسائل/ساعة", value: stats.messagesLastHour, color: "text-primary", bg: "bg-primary/10" },
    { icon: Activity, label: "متوسط الانتظار", value: stats.avgWaitMinutes > 0 ? `${stats.avgWaitMinutes} د` : "0 د", color: stats.avgWaitMinutes > 15 ? "text-destructive" : "text-success", bg: stats.avgWaitMinutes > 15 ? "bg-destructive/10" : "bg-success/10" },
  ];

  return (
    <div className="bg-card border rounded-2xl p-4 shadow-card animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full bg-success", pulse && "animate-ping")}>
          </div>
          <div className="w-2 h-2 rounded-full bg-success absolute"></div>
          <h3 className="text-sm font-bold flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5 text-success" />
            مراقبة مباشرة
          </h3>
        </div>
        <span className="text-[10px] text-muted-foreground">تحديث كل 30 ثانية</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} className="flex items-center gap-2 p-2.5 rounded-xl bg-secondary/50">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", item.bg)}>
                <Icon className={cn("w-4 h-4", item.color)} />
              </div>
              <div className="min-w-0">
                <p className={cn("text-base font-bold leading-none", item.color)}>{item.value}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5 truncate">{item.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LiveMonitorWidget;
