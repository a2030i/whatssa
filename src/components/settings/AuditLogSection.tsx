import { useState, useEffect } from "react";
import { FileText, Clock, User, Search, Filter, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

interface ActivityLog {
  id: string;
  action: string;
  actor_type: string;
  actor_id: string | null;
  target_type: string | null;
  target_id: string | null;
  metadata: any;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  login: "تسجيل دخول",
  logout: "تسجيل خروج",
  create_conversation: "إنشاء محادثة",
  close_conversation: "إغلاق محادثة",
  reopen_conversation: "إعادة فتح محادثة",
  assign_conversation: "إسناد محادثة",
  transfer_conversation: "تحويل محادثة",
  send_message: "إرسال رسالة",
  send_template: "إرسال قالب",
  send_campaign: "إرسال حملة",
  create_automation: "إنشاء قاعدة أتمتة",
  update_automation: "تعديل قاعدة أتمتة",
  delete_automation: "حذف قاعدة أتمتة",
  create_chatbot: "إنشاء شات بوت",
  update_chatbot: "تعديل شات بوت",
  delete_chatbot: "حذف شات بوت",
  create_api_token: "إنشاء توكن API",
  delete_api_token: "حذف توكن API",
  update_settings: "تعديل الإعدادات",
  connect_whatsapp: "ربط رقم واتساب",
  disconnect_whatsapp: "فصل رقم واتساب",
  add_team_member: "إضافة عضو فريق",
  remove_team_member: "إزالة عضو فريق",
  create_store: "إضافة متجر",
  delete_store: "حذف متجر",
  block_number: "حظر رقم",
  unblock_number: "إلغاء حظر رقم",
  evolution_disconnected: "انقطاع اتصال Evolution",
  webhook_dispatched: "إرسال ويب هوك",
};

const ACTOR_LABELS: Record<string, string> = {
  user: "مستخدم",
  system: "النظام",
  webhook: "ويب هوك",
  api: "API",
  cron: "مهمة مجدولة",
};

const AuditLogSection = () => {
  const { orgId } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actorFilter, setActorFilter] = useState("all");
  const [limit, setLimit] = useState(50);
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  useEffect(() => {
    if (orgId) {
      fetchLogs();
      fetchProfiles();
    }
  }, [orgId, actorFilter, limit]);

  const fetchProfiles = async () => {
    const { data } = await supabase.from("profiles").select("id, full_name").eq("org_id", orgId!);
    if (data) {
      const map: Record<string, string> = {};
      data.forEach(p => { map[p.id] = p.full_name || "مستخدم"; });
      setProfiles(map);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    let query = supabase
      .from("activity_logs")
      .select("*")
      .eq("org_id", orgId!)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (actorFilter !== "all") {
      query = query.eq("actor_type", actorFilter);
    }

    const { data } = await query;
    setLogs((data as any[]) || []);
    setLoading(false);
  };

  const getTimeAgo = (date: string) => {
    const d = new Date(date);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "الآن";
    if (mins < 60) return `منذ ${mins} دقيقة`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `منذ ${days} يوم`;
    return d.toLocaleDateString("ar-SA");
  };

  const filtered = logs.filter(log => {
    if (!search) return true;
    const label = ACTION_LABELS[log.action] || log.action;
    const actor = log.actor_id ? profiles[log.actor_id] || "" : "";
    return label.includes(search) || actor.includes(search) || log.action.includes(search);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">سجل النشاط</h3>
          <Badge variant="secondary" className="text-[10px]">{filtered.length}</Badge>
        </div>
        <Select value={actorFilter} onValueChange={setActorFilter}>
          <SelectTrigger className="h-8 w-28 text-xs">
            <SelectValue placeholder="الكل" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="user">مستخدم</SelectItem>
            <SelectItem value="system">النظام</SelectItem>
            <SelectItem value="api">API</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {logs.length > 5 && (
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث في السجل..." className="pr-9 text-sm" />
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-8">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-secondary/50 rounded-lg p-8 text-center">
          <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">لا توجد سجلات بعد</p>
        </div>
      ) : (
        <div className="space-y-1 max-h-[600px] overflow-y-auto">
          {filtered.map(log => (
            <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-secondary/30 transition-colors border-b border-border/50 last:border-0">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                {log.actor_type === "system" ? (
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-medium">
                    {ACTION_LABELS[log.action] || log.action}
                  </p>
                  <Badge variant="outline" className="text-[9px] px-1.5 h-4">
                    {ACTOR_LABELS[log.actor_type] || log.actor_type}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {log.actor_id && profiles[log.actor_id] && (
                    <span className="text-[10px] text-muted-foreground">{profiles[log.actor_id]}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground">{getTimeAgo(log.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length >= limit && (
        <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setLimit(l => l + 50)}>
          عرض المزيد
        </Button>
      )}
    </div>
  );
};

export default AuditLogSection;
