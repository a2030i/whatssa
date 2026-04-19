import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Search, MessageSquare, Building2, User, Clock, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface GlobalConversation {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  status: string;
  last_message_at: string | null;
  unread_count: number;
  org_id: string;
  org_name: string | null;
  assigned_agent_name: string | null;
  channel_type: string | null;
}

const fetchGlobalConversations = async (search: string): Promise<GlobalConversation[]> => {
  let query = supabase
    .from("conversations")
    .select(`
      id, customer_name, customer_phone, status, last_message_at, unread_count, org_id, channel_type,
      organizations!inner(name),
      profiles!conversations_assigned_to_fkey(full_name)
    `)
    .order("last_message_at", { ascending: false })
    .limit(100);

  if (search.trim()) {
    query = query.or(`customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row: any) => ({
    id: row.id,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    status: row.status,
    last_message_at: row.last_message_at,
    unread_count: row.unread_count || 0,
    org_id: row.org_id,
    channel_type: row.channel_type,
    org_name: row.organizations?.name || null,
    assigned_agent_name: row.profiles?.full_name || null,
  }));
};

const statusColor: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  waiting: "bg-amber-100 text-amber-700",
  closed: "bg-gray-100 text-gray-500",
};

const statusLabel: Record<string, string> = {
  active: "نشط",
  waiting: "انتظار",
  closed: "مغلق",
};

const formatTime = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}د`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}س`;
  return `${Math.floor(diffHours / 24)}ي`;
};

const AdminConversations = () => {
  const { startImpersonation } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (debounceRef[0]) clearTimeout(debounceRef[0]);
    debounceRef[1](setTimeout(() => setDebouncedSearch(val), 400));
  };

  const { data: conversations = [], isLoading, error } = useQuery({
    queryKey: ["admin-conversations", debouncedSearch],
    queryFn: () => fetchGlobalConversations(debouncedSearch),
  });

  const handleOpen = async (conv: GlobalConversation) => {
    await startImpersonation(conv.org_id);
    navigate(`/?conv=${conv.id}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold">محادثات جميع المنظمات</h2>
          <p className="text-xs text-muted-foreground mt-0.5">عرض وبحث عبر كل محادثات المنصة</p>
        </div>
        {conversations.length > 0 && (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-lg">
            {conversations.length} محادثة
          </span>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder="ابحث باسم العميل أو رقم الهاتف..."
          className="w-full border border-border rounded-xl py-2.5 pr-9 pl-4 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
          dir="rtl"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
          جارٍ التحميل...
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-40 text-destructive text-sm">
          حدث خطأ في تحميل البيانات
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
          <MessageSquare className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm">لا توجد محادثات</p>
        </div>
      ) : (
        <div className="border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">العميل</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">المنظمة</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground hidden lg:table-cell">الوكيل</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">الحالة</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground hidden sm:table-cell">آخر رسالة</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {conversations.map(conv => (
                <tr key={conv.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-[13px] truncate max-w-[120px]">
                          {conv.customer_name || "بدون اسم"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{conv.customer_phone}</p>
                      </div>
                      {conv.unread_count > 0 && (
                        <span className="min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-[12px] text-muted-foreground truncate max-w-[120px]">
                        {conv.org_name || conv.org_id.slice(0, 8)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-[12px] text-muted-foreground">
                      {conv.assigned_agent_name || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-lg", statusColor[conv.status] || "bg-gray-100 text-gray-500")}>
                      {statusLabel[conv.status] || conv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span className="text-[11px]">{formatTime(conv.last_message_at)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleOpen(conv)}
                      className="flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
                    >
                      فتح
                      <ArrowLeft className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminConversations;
