import { useCallback } from "react";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator,
} from "@/components/ui/command";
import { MessageSquare, Plus, Clock, CheckCircle2, PauseCircle, Users } from "lucide-react";
import { Conversation } from "@/data/mockData";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
}

const STATUS_ICON: Record<string, React.ElementType> = {
  active: CheckCircle2,
  waiting: Clock,
  closed: PauseCircle,
};
const STATUS_COLOR: Record<string, string> = {
  active: "text-green-500",
  waiting: "text-amber-500",
  closed: "text-gray-400",
};

const InboxCommandBar = ({ open, onClose, conversations, onSelectConversation, onNewConversation }: Props) => {
  const handleSelect = useCallback((id: string) => {
    onSelectConversation(id);
    onClose();
  }, [onSelectConversation, onClose]);

  const unread = conversations.filter(c => c.unread > 0);
  const waiting = conversations.filter(c => c.status === "waiting");
  const groups = conversations.filter(c => c.conversationType === "group");

  return (
    <CommandDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <CommandInput placeholder="ابحث في المحادثات أو اكتب أمراً..." dir="rtl" className="text-right" />
      <CommandList dir="rtl" className="max-h-[440px]">
        <CommandEmpty>
          <div className="py-8 text-center">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm text-muted-foreground">لا توجد نتائج</p>
          </div>
        </CommandEmpty>

        <CommandGroup heading="إجراءات سريعة">
          <CommandItem onSelect={() => { onNewConversation(); onClose(); }} className="gap-2 cursor-pointer">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Plus className="w-4 h-4 text-primary" />
            </div>
            <span className="font-medium">محادثة جديدة</span>
            <span className="mr-auto text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">N</span>
          </CommandItem>
          {unread.length > 0 && (
            <CommandItem onSelect={() => { handleSelect(unread[0].id); }} className="gap-2 cursor-pointer">
              <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                <MessageSquare className="w-4 h-4 text-red-500" />
              </div>
              <span>الانتقال لأول غير مقروء</span>
              <span className="mr-auto text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold">{unread.reduce((s, c) => s + c.unread, 0)}</span>
            </CommandItem>
          )}
          {waiting.length > 0 && (
            <CommandItem onSelect={() => { handleSelect(waiting[0].id); }} className="gap-2 cursor-pointer">
              <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <span>بانتظار الرد ({waiting.length})</span>
            </CommandItem>
          )}
          {groups.length > 0 && (
            <CommandItem onSelect={() => { handleSelect(groups[0].id); }} className="gap-2 cursor-pointer">
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-blue-500" />
              </div>
              <span>القروبات ({groups.length})</span>
            </CommandItem>
          )}
        </CommandGroup>

        {conversations.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="المحادثات">
              {conversations.slice(0, 40).map(conv => {
                const StatusIcon = STATUS_ICON[conv.status] || MessageSquare;
                const initials = (conv.customerName || "؟").slice(0, 2);
                return (
                  <CommandItem
                    key={conv.id}
                    value={`${conv.customerName} ${conv.customerPhone} ${conv.lastMessage} ${conv.assignedTo}`}
                    onSelect={() => handleSelect(conv.id)}
                    className="gap-3 py-2 cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                      {conv.conversationType === "group" ? <Users className="w-4 h-4" /> : initials}
                    </div>
                    <div className="flex-1 min-w-0 text-right">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[13px] font-medium truncate flex-1">{conv.customerName}</p>
                        {conv.unread > 0 && (
                          <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                            {conv.unread}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">{conv.lastMessage}</p>
                    </div>
                    <StatusIcon className={cn("w-3.5 h-3.5 shrink-0", STATUS_COLOR[conv.status] || "text-gray-400")} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>

      <div className="border-t px-3 py-2 flex items-center justify-between" dir="rtl">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span><kbd className="bg-muted px-1 rounded">↑↓</kbd> للتنقل</span>
          <span><kbd className="bg-muted px-1 rounded">Enter</kbd> للفتح</span>
          <span><kbd className="bg-muted px-1 rounded">Esc</kbd> للإغلاق</span>
        </div>
        <span className="text-[10px] text-muted-foreground">{conversations.length} محادثة</span>
      </div>
    </CommandDialog>
  );
};

export default InboxCommandBar;
