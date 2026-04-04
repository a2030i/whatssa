import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Circle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Agent {
  id: string;
  full_name: string;
  is_online: boolean;
  last_seen_at: string | null;
  team_id: string | null;
  assigned_count: number;
}

interface TransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  onTransfer: (convId: string, agentName: string) => void;
}

const TransferDialog = ({ open, onOpenChange, conversationId, onTransfer }: TransferDialogProps) => {
  const { orgId, user } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !orgId) return;
    const load = async () => {
      setLoading(true);
      const [{ data: profilesData }, { data: countsData }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, is_online, last_seen_at, team_id")
          .eq("org_id", orgId)
          .eq("is_active", true)
          .neq("id", user?.id || ""),
        supabase
          .from("conversations")
          .select("assigned_to_id")
          .eq("org_id", orgId)
          .eq("status", "open"),
      ]);
      const countMap: Record<string, number> = {};
      (countsData || []).forEach((c: any) => {
        if (c.assigned_to_id) {
          countMap[c.assigned_to_id] = (countMap[c.assigned_to_id] || 0) + 1;
        }
      });
      setAgents(
        (profilesData || []).map((p: any) => ({
          ...p,
          assigned_count: countMap[p.id] || 0,
        }))
      );
      setLoading(false);
    };
    load();
  }, [open, orgId]);

  const handleTransfer = (agent: Agent) => {
    onTransfer(conversationId, agent.full_name || "غير معروف");
    onOpenChange(false);
    toast.success(`تم تحويل المحادثة إلى ${agent.full_name}`);
  };

  const formatLastSeen = (dt: string | null) => {
    if (!dt) return "غير معروف";
    const diff = Date.now() - new Date(dt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "الآن";
    if (mins < 60) return `منذ ${mins} دقيقة`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    return `منذ ${Math.floor(hours / 24)} يوم`;
  };

  const onlineAgents = agents.filter(a => a.is_online);
  const offlineAgents = agents.filter(a => !a.is_online);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            تحويل المحادثة
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">جاري التحميل...</div>
        ) : agents.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">لا يوجد موظفين آخرين</div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {onlineAgents.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Circle className="w-2 h-2 fill-success text-success" />
                  متصلون ({onlineAgents.length})
                </p>
                <div className="space-y-1.5">
                  {onlineAgents.map(agent => (
                    <button
                      key={agent.id}
                      onClick={() => handleTransfer(agent)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-secondary transition-colors text-right"
                    >
                      <div className="relative">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                          {(agent.full_name || "?").charAt(0)}
                        </div>
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-success border-2 border-background" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{agent.full_name}</p>
                        <p className="text-[10px] text-success">متصل الآن</p>
                      </div>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 shrink-0">
                        مُسند إليه {agent.assigned_count}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {offlineAgents.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Circle className="w-2 h-2 fill-muted-foreground text-muted-foreground" />
                  غير متصلين ({offlineAgents.length})
                </p>
                <div className="space-y-1.5">
                  {offlineAgents.map(agent => (
                    <button
                      key={agent.id}
                      onClick={() => handleTransfer(agent)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-secondary transition-colors text-right opacity-70"
                    >
                      <div className="relative">
                        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                          {(agent.full_name || "?").charAt(0)}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{agent.full_name}</p>
                        <p className="text-[10px] text-muted-foreground">آخر ظهور: {formatLastSeen(agent.last_seen_at)}</p>
                      </div>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 shrink-0">
                        مُسند إليه {agent.assigned_count}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TransferDialog;
