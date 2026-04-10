import { useState, useEffect, useRef, useCallback } from "react";
import { X, User, Users, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Suggestion {
  email: string;
  name: string | null;
  avatar?: string | null;
  source: "crm" | "history" | "team";
  frequency?: number;
}

interface Props {
  chips: string[];
  setChips: React.Dispatch<React.SetStateAction<string[]>>;
  inputValue: string;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  placeholder?: string;
  chipClassName?: string;
}

export default function EmailRecipientAutocomplete({
  chips,
  setChips,
  inputValue,
  setInputValue,
  placeholder = "أضف إيميل...",
  chipClassName = "bg-primary/10 text-primary",
}: Props) {
  const { orgId } = useAuth();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const addChip = useCallback((val: string) => {
    const clean = val.trim().replace(/,+$/, "");
    if (clean && !chips.includes(clean)) {
      setChips(prev => [...prev, clean]);
    }
    setInputValue("");
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedIdx(-1);
  }, [chips, setChips, setInputValue]);

  // Fetch suggestions when input changes
  useEffect(() => {
    if (!inputValue.trim() || inputValue.trim().length < 2 || !orgId) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const q = inputValue.trim().toLowerCase();
      const allSuggestions: Suggestion[] = [];

      // 1. CRM customers with email
      const { data: customers } = await supabase
        .from("customers")
        .select("name, email")
        .eq("org_id", orgId)
        .not("email", "is", null)
        .or(`email.ilike.%${q}%,name.ilike.%${q}%`)
        .limit(5);

      if (customers) {
        for (const c of customers) {
          if (c.email && !chips.includes(c.email)) {
            allSuggestions.push({
              email: c.email,
              name: c.name,
              source: "crm",
            });
          }
        }
      }

      // 2. Previous email recipients (from email_message_details)
      const { data: history } = await supabase
        .from("email_message_details")
        .select("email_to, email_from, email_from_name")
        .eq("org_id", orgId)
        .or(`email_to.ilike.%${q}%,email_from.ilike.%${q}%,email_from_name.ilike.%${q}%`)
        .order("created_at", { ascending: false })
        .limit(20);

      if (history) {
        const emailFreq = new Map<string, { name: string | null; count: number }>();
        for (const h of history) {
          // Extract emails from to/from fields
          const emails = [
            ...(h.email_to || "").split(",").map((s: string) => s.trim()),
            h.email_from,
          ].filter(Boolean);

          for (const em of emails) {
            if (!em || !em.toLowerCase().includes(q) || chips.includes(em)) continue;
            const existing = emailFreq.get(em);
            emailFreq.set(em, {
              name: existing?.name || h.email_from_name,
              count: (existing?.count || 0) + 1,
            });
          }
        }

        // Sort by frequency
        const sorted = [...emailFreq.entries()]
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 5);

        for (const [email, { name, count }] of sorted) {
          if (!allSuggestions.find(s => s.email === email)) {
            allSuggestions.push({
              email,
              name,
              source: "history",
              frequency: count,
            });
          }
        }
      }

      // 3. Team members
      const { data: team } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, id")
        .eq("org_id", orgId)
        .ilike("full_name", `%${q}%`)
        .limit(5);

      if (team) {
        for (const t of team) {
          allSuggestions.push({
            email: `${t.full_name}`, // placeholder — will be filtered
            name: t.full_name,
            avatar: t.avatar_url,
            source: "team",
          });
        }
      }

      // Remove suggestions that don't look like emails for non-team sources
      const filtered = allSuggestions.filter(s =>
        s.source === "team" || s.email.includes("@")
      );

      // Deduplicate
      const seen = new Set<string>();
      const deduped = filtered.filter(s => {
        const key = s.email.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setSuggestions(deduped);
      setShowSuggestions(deduped.length > 0);
      setSelectedIdx(-1);
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue, orgId, chips]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const sourceIcon = (source: string) => {
    switch (source) {
      case "crm": return <User className="w-3 h-3 text-emerald-500" />;
      case "history": return <Mail className="w-3 h-3 text-blue-500" />;
      case "team": return <Users className="w-3 h-3 text-purple-500" />;
      default: return null;
    }
  };

  const sourceLabel = (source: string) => {
    switch (source) {
      case "crm": return "جهة اتصال";
      case "history": return "سابق";
      case "team": return "فريق";
      default: return "";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx(prev => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" && selectedIdx >= 0) {
        e.preventDefault();
        const s = suggestions[selectedIdx];
        if (s.email.includes("@")) {
          addChip(s.email);
        }
        return;
      }
    }

    if ((e.key === "Enter" || e.key === ",") && inputValue.trim()) {
      e.preventDefault();
      addChip(inputValue);
    } else if (e.key === "Backspace" && !inputValue && chips.length > 0) {
      setChips(prev => prev.slice(0, -1));
    }
  };

  return (
    <div ref={containerRef} className="flex-1 relative">
      <div className="flex flex-wrap items-center gap-1 bg-background border border-border/40 rounded-md px-1.5 py-1 min-h-[28px] focus-within:ring-1 focus-within:ring-primary/30">
        {chips.map((chip, i) => (
          <span key={i} className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] ${chipClassName}`}>
            {chip}
            <button onClick={() => setChips(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-destructive ml-0.5">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setShowSuggestions(true);
          }}
          onBlur={() => {
            setTimeout(() => {
              const val = inputValue.trim().replace(/,+$/, "");
              if (val && val.includes("@") && !chips.includes(val)) {
                setChips(prev => [...prev, val]);
              }
              setInputValue("");
              setShowSuggestions(false);
            }, 200);
          }}
          placeholder={chips.length === 0 ? placeholder : "أضف آخر..."}
          className="flex-1 min-w-[80px] text-[12px] bg-transparent border-0 outline-none px-1 py-0.5"
        />
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden max-h-[200px] overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={s.email + i}
              onMouseDown={(e) => {
                e.preventDefault();
                if (s.email.includes("@")) {
                  addChip(s.email);
                }
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-right hover:bg-accent transition-colors ${
                i === selectedIdx ? "bg-accent" : ""
              }`}
            >
              <Avatar className="w-6 h-6 shrink-0">
                {s.avatar && <AvatarImage src={s.avatar} />}
                <AvatarFallback className="text-[9px] bg-muted">
                  {(s.name || s.email).charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                {s.name && (
                  <p className="text-[11px] font-medium truncate text-foreground">{s.name}</p>
                )}
                {s.email.includes("@") && (
                  <p className="text-[10px] text-muted-foreground truncate">{s.email}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {s.frequency && s.frequency > 1 && (
                  <span className="text-[9px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                    ×{s.frequency}
                  </span>
                )}
                {sourceIcon(s.source)}
                <span className="text-[9px] text-muted-foreground">{sourceLabel(s.source)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
