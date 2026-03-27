import { useState, useMemo } from "react";
import { Search, Filter, X, User, CheckCircle, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Conversation } from "@/data/mockData";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statusColors: Record<string, string> = {
  active: "bg-success/10 text-success",
  waiting: "bg-warning/10 text-warning",
  closed: "bg-muted text-muted-foreground",
};
const statusLabels: Record<string, string> = { active: "نشط", waiting: "بانتظار", closed: "مغلق" };

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  hasSelection: boolean;
}

const ConversationList = ({ conversations, selectedId, onSelect, hasSelection }: ConversationListProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const allAgents = useMemo(() => [...new Set(conversations.map((c) => c.assignedTo))], [conversations]);
  const allTags = useMemo(() => [...new Set(conversations.flatMap((c) => c.tags))], [conversations]);

  const filtered = useMemo(() => {
    return conversations.filter((conv) => {
      if (searchQuery && !conv.customerName.includes(searchQuery) && !conv.lastMessage.includes(searchQuery) && !conv.customerPhone.includes(searchQuery)) return false;
      if (statusFilter !== "all" && conv.status !== statusFilter) return false;
      if (agentFilter !== "all" && conv.assignedTo !== agentFilter) return false;
      if (selectedTags.length > 0 && !selectedTags.some((t) => conv.tags.includes(t))) return false;
      return true;
    });
  }, [conversations, searchQuery, statusFilter, agentFilter, selectedTags]);

  const hasActiveFilters = statusFilter !== "all" || agentFilter !== "all" || selectedTags.length > 0;

  const clearFilters = () => { setStatusFilter("all"); setAgentFilter("all"); setSelectedTags([]); };
  const toggleTag = (tag: string) => setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);

  return (
    <div className={cn(
      "border-l border-border flex flex-col bg-card",
      hasSelection ? "hidden md:flex md:w-[320px] lg:w-[340px]" : "w-full md:w-[320px] lg:w-[340px]"
    )}>
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">المحادثات</h1>
          <div className="flex items-center gap-1">
            {hasActiveFilters && (
              <button onClick={clearFilters} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" title="مسح الفلاتر">
                <X className="w-4 h-4 text-destructive" />
              </button>
            )}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn("p-1.5 rounded-lg transition-colors relative", showFilters || hasActiveFilters ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground")}
            >
              <Filter className="w-4 h-4" />
              {hasActiveFilters && <span className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-primary" />}
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="بحث بالاسم أو الرسالة..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pr-9 bg-secondary border-0 text-sm" />
        </div>

        {showFilters && (
          <div className="space-y-2.5 animate-fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs bg-secondary border-0"><SelectValue placeholder="الحالة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="waiting">بانتظار</SelectItem>
                  <SelectItem value="closed">مغلق</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger className="h-8 text-xs bg-secondary border-0"><SelectValue placeholder="الموظف" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الموظفين</SelectItem>
                  {allAgents.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground font-medium">التصنيفات</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allTags.map((tag) => (
                  <button key={tag} onClick={() => toggleTag(tag)} className={cn("text-[10px] px-2 py-0.5 rounded-full transition-colors font-medium", selectedTags.includes(tag) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-accent")}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {hasActiveFilters && (
        <div className="px-4 py-2 bg-accent/50 text-xs text-accent-foreground">{filtered.length} محادثة</div>
      )}

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">لا توجد محادثات مطابقة</p>
          </div>
        ) : (
          filtered.map((conv) => (
            <button key={conv.id} onClick={() => onSelect(conv.id)} className={cn("w-full text-right p-4 border-b border-border transition-colors hover:bg-secondary/50", selectedId === conv.id && "bg-accent")}>
              <div className="flex items-start gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full gradient-whatsapp flex items-center justify-center text-sm font-bold text-whatsapp-foreground shrink-0">
                    {conv.customerName.charAt(0)}
                  </div>
                  {conv.lastSeen === "متصل الآن" && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-success border-2 border-card" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">{conv.customerName}</span>
                    <span className="text-[10px] text-muted-foreground">{conv.timestamp}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{conv.lastMessage}</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border-0", statusColors[conv.status])}>
                      {statusLabels[conv.status]}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{conv.assignedTo}</span>
                    {conv.unread > 0 && (
                      <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center mr-auto">
                        {conv.unread}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default ConversationList;
