import { useState, useEffect } from "react";
import { ScrollText, Filter, RefreshCw, Bot, Zap, MessageCircle, Tag, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface AutomationLog {
  id: string;
  rule_name: string | null;
  customer_phone: string | null;
  action_type: string;
  action_result: string | null;
  metadata: any;
  created_at: string;
}

const ACTION_ICONS: Record<string, typeof Zap> = {
  reply: MessageCircle,
  add_tag: Tag,
  assign_team: Users,
  reply_and_tag: MessageCircle,
  chatbot: Bot,
};

const ACTION_COLORS: Record<string, string> = {
  reply: "bg-primary/10 text-primary",
  add_tag: "bg-success/10 text-success",
  assign_team: "bg-info/10 text-info",
  reply_and_tag: "bg-warning/10 text-warning",
  chatbot: "bg-accent/20 text-accent-foreground",
};

const AutomationLogsPanel = () => {
  const { orgId } = useAuth();
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    if (orgId) fetchLogs();
  }, [orgId, filter, limit]);

  const fetchLogs = async () => {
    setLoading(true);
    let query = supabase
      .from("automation_logs")
      .select("*")
      .eq("org_id", orgId!)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (filter !== "all") {
      query = query.eq("action_type", filter);
    }

    const { data } = await query;
    setLogs((data as any[]) || []);
    setLoading(false);
  };

  const getTimeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "الآن";
    if (mins < 60) return `منذ ${mins} د`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `منذ ${hours} س`;
    return `منذ ${Math.floor(hours / 24)} يوم`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-primary" />
          <h4 className="font-semibold text-sm">سجل التنفيذ</h4>
          <Badge variant="secondary" className="text-[10px]">{logs.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue placeholder="الكل" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="reply">رد تلقائي</SelectItem>
              <SelectItem value="add_tag">وسم</SelectItem>
              <SelectItem value="assign_team">إسناد</SelectItem>
              <SelectItem value="chatbot">بوت</SelectItem>
            </SelectContent>
          </Select>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={fetchLogs}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-8">جاري التحميل...</div>
      ) : logs.length === 0 ? (
        <div className="bg-secondary/50 rounded-lg p-8 text-center">
          <ScrollText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">لا توجد سجلات تنفيذ بعد</p>
          <p className="text-[11px] text-muted-foreground/70 mt-1">ستظهر هنا سجلات قواعد الأتمتة والشات بوت عند تنفيذها</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
          {logs.map(log => {
            const Icon = ACTION_ICONS[log.action_type] || Zap;
            const color = ACTION_COLORS[log.action_type] || "bg-secondary text-muted-foreground";
            const isSuccess = log.action_result === "success";

            return (
              <div key={log.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-secondary/30 transition-colors">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium truncate">{log.rule_name || "قاعدة محذوفة"}</p>
                    <Badge variant={isSuccess ? "secondary" : "destructive"} className="text-[9px] px-1.5 h-4">
                      {isSuccess ? "نجاح" : "فشل"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {log.customer_phone && (
                      <span className="text-[10px] text-muted-foreground font-mono" dir="ltr">
                        {log.customer_phone}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {getTimeAgo(log.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {logs.length >= limit && (
        <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setLimit(l => l + 50)}>
          عرض المزيد
        </Button>
      )}
    </div>
  );
};

export default AutomationLogsPanel;
