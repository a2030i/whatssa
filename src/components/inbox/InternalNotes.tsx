import { useState, useEffect, useRef } from "react";
import { StickyNote, Send, AtSign, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface TeamMember {
  id: string;
  full_name: string | null;
}

interface Note {
  id: string;
  content: string;
  author_id: string;
  author_name?: string;
  mentioned_user_ids: string[];
  created_at: string;
}

interface InternalNotesProps {
  conversationId: string;
}

const InternalNotes = ({ conversationId }: InternalNotesProps) => {
  const { user, orgId, profile } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!orgId) return;
    const load = async () => {
      const [notesRes, membersRes] = await Promise.all([
        supabase
          .from("internal_notes")
          .select("*")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true }),
        supabase.from("profiles").select("id, full_name").eq("org_id", orgId),
      ]);

      if (membersRes.data) setTeamMembers(membersRes.data);

      if (notesRes.data) {
        const mapped = notesRes.data.map((n: any) => {
          const author = membersRes.data?.find((m) => m.id === n.author_id);
          return {
            ...n,
            author_name: author?.full_name || "مجهول",
            mentioned_user_ids: n.mentioned_user_ids || [],
          };
        });
        setNotes(mapped);
      }
    };
    load();
  }, [conversationId, orgId]);

  const handleInputChange = (value: string) => {
    setText(value);
    const lastAt = value.lastIndexOf("@");
    if (lastAt !== -1) {
      const after = value.slice(lastAt + 1);
      if (!after.includes(" ") && after.length <= 20) {
        setShowMentions(true);
        setMentionFilter(after.toLowerCase());
        return;
      }
    }
    setShowMentions(false);
  };

  const insertMention = (member: TeamMember) => {
    const lastAt = text.lastIndexOf("@");
    const newText = text.slice(0, lastAt) + `@${member.full_name || "user"} `;
    setText(newText);
    setShowMentions(false);
    inputRef.current?.focus();
  };

  const handleSend = async () => {
    if (!text.trim() || !user || !orgId) return;

    // Parse mentions to find user IDs
    const mentionedIds: string[] = [];
    teamMembers.forEach((m) => {
      if (m.full_name && text.includes(`@${m.full_name}`)) {
        mentionedIds.push(m.id);
      }
    });

    const { data, error } = await supabase.from("internal_notes").insert({
      org_id: orgId,
      conversation_id: conversationId,
      author_id: user.id,
      content: text.trim(),
      mentioned_user_ids: mentionedIds,
    }).select().single();

    if (error) {
      toast.error("فشل حفظ الملاحظة");
      return;
    }

    // Create notifications for mentioned users
    if (mentionedIds.length > 0) {
      const notifs = mentionedIds
        .filter((id) => id !== user.id)
        .map((uid) => ({
          org_id: orgId,
          user_id: uid,
          type: "mention",
          title: `أشار إليك ${profile?.full_name || "زميل"} في ملاحظة`,
          body: text.trim().slice(0, 100),
          reference_type: "conversation",
          reference_id: conversationId,
          created_by: user.id,
        }));

      if (notifs.length > 0) {
        await supabase.from("notifications").insert(notifs);
      }
    }

    setNotes((prev) => [...prev, {
      id: data.id,
      content: data.content,
      author_id: data.author_id,
      author_name: profile?.full_name || "أنت",
      mentioned_user_ids: mentionedIds,
      created_at: data.created_at,
    }]);
    setText("");
    toast.success("تم إضافة الملاحظة");
  };

  const filteredMembers = teamMembers.filter(
    (m) => m.full_name?.toLowerCase().includes(mentionFilter) && m.id !== user?.id
  );

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("ar-SA-u-ca-gregory", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <StickyNote className="w-4 h-4 text-amber-500" />
        <h4 className="text-xs font-bold">ملاحظات داخلية</h4>
        <span className="text-[10px] text-muted-foreground mr-auto">{notes.length}</span>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3">
          {notes.length === 0 && (
            <p className="text-[11px] text-muted-foreground text-center py-4">لا توجد ملاحظات بعد</p>
          )}
          {notes.map((note) => (
            <div key={note.id} className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px] font-bold text-amber-600">
                  {(note.author_name || "?").charAt(0)}
                </div>
                <span className="text-[11px] font-semibold">{note.author_name}</span>
                <span className="text-[10px] text-muted-foreground mr-auto">{formatTime(note.created_at)}</span>
              </div>
              <p className="text-xs leading-relaxed whitespace-pre-wrap">
                {note.content.split(/(@[\u0600-\u06FFa-zA-Z\s]+)/g).map((part, i) =>
                  part.startsWith("@") ? (
                    <span key={i} className="bg-primary/10 text-primary font-semibold px-0.5 rounded text-[11px]">{part.trim()}</span>
                  ) : (
                    <span key={i}>{part}</span>
                  )
                )}
              </p>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Mention suggestions */}
      {showMentions && filteredMembers.length > 0 && (
        <div className="border-t border-border px-3 py-2 bg-card">
          <p className="text-[10px] text-muted-foreground mb-1">اذكر زميل</p>
          <div className="flex flex-wrap gap-1.5">
            {filteredMembers.map((m) => (
              <button
                key={m.id}
                onClick={() => insertMention(m)}
                className="text-[11px] px-2 py-1 rounded-full bg-secondary hover:bg-accent transition-colors"
              >
                @{m.full_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setText((p) => p + "@"); setShowMentions(true); setMentionFilter(""); inputRef.current?.focus(); }}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground shrink-0"
          >
            <AtSign className="w-4 h-4" />
          </button>
          <Input
            ref={inputRef}
            value={text}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="اكتب ملاحظة... @ لذكر زميل"
            className="flex-1 border-0 bg-secondary text-xs h-8"
          />
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-opacity",
              text.trim() ? "bg-amber-500 hover:opacity-90" : "bg-muted"
            )}
          >
            <Send className="w-3.5 h-3.5 text-white" style={{ transform: "scaleX(-1)" }} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default InternalNotes;

