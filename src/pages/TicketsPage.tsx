import { useState, useEffect } from "react";
import {
  Ticket, Plus, Filter, Clock, CheckCircle2, AlertCircle,
  User, MoreHorizontal, Loader2, MessageSquare, Eye,
  RefreshCw, XCircle, ArrowUpCircle, Phone, UserCircle, Link2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import CreateTicketDialog from "@/components/tickets/CreateTicketDialog";
import TicketDetailDialog from "@/components/tickets/TicketDetailDialog";

import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUS_CONFIG, TicketRow } from "@/components/tickets/ticketConstants";
export { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUS_CONFIG };
export type { TicketRow };

const TicketsPage = () => {
  const { profile, userRole, isSuperAdmin } = useAuth();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null);

  useEffect(() => {
    if (profile?.org_id) {
      fetchTickets();
      fetchAgents();
    }
  }, [profile?.org_id]);

  const fetchTickets = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tickets")
      .select("*")
      .eq("org_id", profile!.org_id!)
      .order("created_at", { ascending: false })
      .limit(200);
    setTickets((data as unknown as TicketRow[]) || []);
    setLoading(false);
  };

  const fetchAgents = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("org_id", profile!.org_id!)
      .eq("is_active", true);
    setAgents(data || []);
  };

  const updateTicketStatus = async (ticketId: string, status: string) => {
    const updates: any = { status };
    if (status === "closed" || status === "resolved") {
      updates.closed_at = new Date().toISOString();
      updates.closed_by = profile!.id;
    }
    const { error } = await supabase.from("tickets").update(updates).eq("id", ticketId);
    if (error) return toast.error("فشل التحديث");
    toast.success("تم تحديث الحالة");
    fetchTickets();
  };

  const filteredTickets = tickets.filter(t => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    return true;
  });

  const stats = {
    total: tickets.length,
    open: tickets.filter(t => t.status === "open").length,
    in_progress: tickets.filter(t => t.status === "in_progress").length,
    resolved: tickets.filter(t => t.status === "resolved" || t.status === "closed").length,
  };

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">التذاكر</h1>
          <p className="text-sm text-muted-foreground">نظام إدارة تذاكر الدعم الفني</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 ml-2" /> تذكرة جديدة
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-foreground">{stats.total}</div>
          <div className="text-xs text-muted-foreground">إجمالي التذاكر</div>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-yellow-600">{stats.open}</div>
          <div className="text-xs text-muted-foreground">مفتوحة</div>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.in_progress}</div>
          <div className="text-xs text-muted-foreground">قيد المعالجة</div>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{stats.resolved}</div>
          <div className="text-xs text-muted-foreground">تم الحل</div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {Object.entries(TICKET_STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="التصنيف" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل التصنيفات</SelectItem>
            {TICKET_CATEGORIES.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.icon} {c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tickets List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : filteredTickets.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Ticket className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>لا توجد تذاكر</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filteredTickets.map(ticket => {
            const statusCfg = TICKET_STATUS_CONFIG[ticket.status] || TICKET_STATUS_CONFIG.open;
            const StatusIcon = statusCfg.icon;
            const catInfo = TICKET_CATEGORIES.find(c => c.value === ticket.category);
            const priorityInfo = TICKET_PRIORITIES.find(p => p.value === ticket.priority);
            const agent = agents.find(a => a.id === ticket.assigned_to);
            const creator = agents.find(a => a.id === ticket.created_by);

            return (
              <Card key={ticket.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedTicket(ticket)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-base">{catInfo?.icon || "📋"}</span>
                        <h3 className="font-semibold text-foreground truncate">{ticket.title}</h3>
                        {ticket.conversation_id && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Link2 className="w-3 h-3" /> من محادثة
                          </Badge>
                        )}
                        {ticket.message_ids && ticket.message_ids.length > 0 && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <MessageSquare className="w-3 h-3" /> {ticket.message_ids.length} رسالة
                          </Badge>
                        )}
                      </div>
                      {ticket.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{ticket.description}</p>
                      )}
                      <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                        {ticket.customer_name && (
                          <span className="flex items-center gap-1">
                            <UserCircle className="w-3 h-3" /> {ticket.customer_name}
                          </span>
                        )}
                        {ticket.customer_phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {ticket.customer_phone}
                          </span>
                        )}
                        {agent && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" /> مُسند: {agent.full_name}
                          </span>
                        )}
                        {creator && (
                          <span className="flex items-center gap-1">
                            أنشأها: {creator.full_name}
                          </span>
                        )}
                        <span>{format(new Date(ticket.created_at), "d MMM HH:mm", { locale: ar })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                      <Badge className={priorityInfo?.color || ""}>{priorityInfo?.label}</Badge>
                      <Badge className={statusCfg.color}>
                        <StatusIcon className="w-3 h-3 ml-1" /> {statusCfg.label}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {ticket.status !== "in_progress" && (
                            <DropdownMenuItem onClick={() => updateTicketStatus(ticket.id, "in_progress")}>
                              <RefreshCw className="w-4 h-4 ml-2" /> بدء المعالجة
                            </DropdownMenuItem>
                          )}
                          {ticket.status !== "waiting_customer" && (
                            <DropdownMenuItem onClick={() => updateTicketStatus(ticket.id, "waiting_customer")}>
                              <Clock className="w-4 h-4 ml-2" /> بانتظار العميل
                            </DropdownMenuItem>
                          )}
                          {ticket.status !== "resolved" && (
                            <DropdownMenuItem onClick={() => updateTicketStatus(ticket.id, "resolved")}>
                              <CheckCircle2 className="w-4 h-4 ml-2" /> تم الحل
                            </DropdownMenuItem>
                          )}
                          {ticket.status !== "closed" && (
                            <DropdownMenuItem onClick={() => updateTicketStatus(ticket.id, "closed")}>
                              <XCircle className="w-4 h-4 ml-2" /> إغلاق
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateTicketDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={fetchTickets}
        agents={agents}
      />

      {selectedTicket && (
        <TicketDetailDialog
          ticket={selectedTicket}
          agents={agents}
          open={!!selectedTicket}
          onOpenChange={(open) => !open && setSelectedTicket(null)}
          onUpdated={fetchTickets}
        />
      )}
    </div>
  );
};

export default TicketsPage;
