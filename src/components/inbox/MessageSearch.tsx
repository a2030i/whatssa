import { useState, useMemo } from "react";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Message } from "@/data/mockData";

interface MessageSearchProps {
  messages: Message[];
  onClose: () => void;
  onNavigate: (messageId: string) => void;
}

const MessageSearch = ({ messages, onClose, onNavigate }: MessageSearchProps) => {
  const [query, setQuery] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return messages.filter(
      (m) => m.text?.toLowerCase().includes(q) && m.type !== "note" && m.sender !== "system"
    );
  }, [query, messages]);

  const navigate = (index: number) => {
    if (results.length === 0) return;
    const safeIndex = ((index % results.length) + results.length) % results.length;
    setCurrentIndex(safeIndex);
    onNavigate(results[safeIndex].id);
  };

  return (
    <div className="shrink-0 border-b border-border bg-card/90 backdrop-blur-sm px-3 py-2 flex items-center gap-2 animate-fade-in">
      <Search className="w-4 h-4 text-muted-foreground shrink-0" />
      <Input
        autoFocus
        value={query}
        onChange={(e) => { setQuery(e.target.value); setCurrentIndex(0); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") navigate(currentIndex + (e.shiftKey ? -1 : 1));
          if (e.key === "Escape") onClose();
        }}
        placeholder="بحث في الرسائل..."
        className="flex-1 border-0 bg-secondary/60 h-8 text-sm rounded-lg"
      />
      {results.length > 0 && (
        <span className="text-[11px] text-muted-foreground shrink-0 font-medium tabular-nums">
          {currentIndex + 1}/{results.length}
        </span>
      )}
      {query && results.length === 0 && (
        <span className="text-[11px] text-muted-foreground shrink-0">لا نتائج</span>
      )}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={() => navigate(currentIndex - 1)}
          disabled={results.length === 0}
          className="w-7 h-7 rounded-md hover:bg-secondary flex items-center justify-center disabled:opacity-30"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={() => navigate(currentIndex + 1)}
          disabled={results.length === 0}
          className="w-7 h-7 rounded-md hover:bg-secondary flex items-center justify-center disabled:opacity-30"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
      <button onClick={onClose} className="w-7 h-7 rounded-md hover:bg-secondary flex items-center justify-center shrink-0">
        <X className="w-4 h-4 text-muted-foreground" />
      </button>
    </div>
  );
};

export default MessageSearch;

