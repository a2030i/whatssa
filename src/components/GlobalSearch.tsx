import { useState, useEffect, useCallback } from "react";
import { Search, MessageSquare, User, Loader2, Mail } from "lucide-react";
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

interface SearchResult {
  type: "conversation" | "customer" | "email";
  id: string;
  title: string;
  subtitle: string;
  phone?: string;
}

const GlobalSearch = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const { orgId } = useAuth();
  const navigate = useNavigate();

  // Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q.trim() || !orgId) { setResults([]); return; }
    setLoading(true);
    try {
      const searchTerm = `%${q}%`;
      const [convRes, custRes, msgRes, emailDetailRes] = await Promise.all([
        supabase
          .from("conversations")
          .select("id, customer_name, customer_phone, last_message, status, conversation_type")
          .eq("org_id", orgId)
          .or(`customer_name.ilike.${searchTerm},customer_phone.ilike.${searchTerm},last_message.ilike.${searchTerm}`)
          .limit(8),
        supabase
          .from("customers")
          .select("id, name, phone, email")
          .eq("org_id", orgId)
          .or(`name.ilike.${searchTerm},phone.ilike.${searchTerm},email.ilike.${searchTerm}`)
          .limit(5),
        supabase
          .from("messages")
          .select("id, content, conversation_id, sender, created_at")
          .ilike("content", searchTerm)
          .limit(8),
        // Search email details (subject, from, to)
        supabase
          .from("email_message_details")
          .select("id, message_id, conversation_id, email_subject, email_from, email_from_name, email_to")
          .or(`email_subject.ilike.${searchTerm},email_from.ilike.${searchTerm},email_from_name.ilike.${searchTerm},email_to.ilike.${searchTerm}`)
          .limit(8),
      ]);

      const items: SearchResult[] = [];
      (convRes.data || []).forEach((c) => {
        items.push({
          type: "conversation",
          id: c.id,
          title: c.customer_name || c.customer_phone,
          subtitle: c.last_message?.slice(0, 60) || "محادثة",
          phone: c.customer_phone,
        });
      });

      // Messages → link to their conversation
      const msgConvIds = new Set(items.map(i => i.id));
      (msgRes.data || []).forEach((m) => {
        if (!msgConvIds.has(m.conversation_id)) {
          msgConvIds.add(m.conversation_id);
          items.push({
            type: "conversation",
            id: m.conversation_id,
            title: m.sender === "agent" ? "أنت" : "العميل",
            subtitle: m.content?.slice(0, 60) || "",
          });
        }
      });

      (custRes.data || []).forEach((c) => {
        items.push({
          type: "customer",
          id: c.id,
          title: c.name || c.phone,
          subtitle: c.email || c.phone,
          phone: c.phone,
        });
      });

      setResults(items);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  const handleSelect = (item: SearchResult) => {
    setOpen(false);
    setQuery("");
    if (item.type === "conversation") {
      navigate(`/inbox?conv=${item.id}`);
    } else {
      navigate(`/customers?q=${encodeURIComponent(item.phone || item.title)}`);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-secondary/60 hover:bg-secondary text-muted-foreground text-xs transition-colors"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">بحث شامل...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border/50 bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="ابحث في المحادثات، العملاء، الرسائل..."
          value={query}
          onValueChange={setQuery}
          dir="rtl"
        />
        <CommandList>
          {loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && query && results.length === 0 && (
            <CommandEmpty>لا توجد نتائج لـ "{query}"</CommandEmpty>
          )}
          {!loading && results.filter(r => r.type === "conversation").length > 0 && (
            <CommandGroup heading="المحادثات">
              {results.filter(r => r.type === "conversation").map((item) => (
                <CommandItem key={`conv-${item.id}`} onSelect={() => handleSelect(item)} className="gap-3 cursor-pointer">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                  </div>
                  {item.phone && <Badge variant="outline" className="text-[10px] shrink-0">{item.phone}</Badge>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!loading && results.filter(r => r.type === "customer").length > 0 && (
            <CommandGroup heading="العملاء">
              {results.filter(r => r.type === "customer").map((item) => (
                <CommandItem key={`cust-${item.id}`} onSelect={() => handleSelect(item)} className="gap-3 cursor-pointer">
                  <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-accent-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
};

export default GlobalSearch;
