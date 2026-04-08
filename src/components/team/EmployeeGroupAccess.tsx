import { useState, useEffect } from "react";
import { Users, Plus, X, Search, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface GroupConversation {
  id: string;
  customer_name: string;
  customer_phone: string;
  channel_id: string;
}

interface EmployeeGroupAccessProps {
  profileId: string;
  profileName: string;
}

const getGroupIdentityKey = (group: Pick<GroupConversation, "channel_id" | "customer_phone">) =>
  `${group.channel_id || "no-channel"}:${group.customer_phone || "no-phone"}`;

const dedupeGroups = (groups: GroupConversation[]) => {
  const unique = new Map<string, GroupConversation>();

  groups.forEach((group) => {
    const key = getGroupIdentityKey(group);
    if (!unique.has(key)) unique.set(key, group);
  });

  return Array.from(unique.values());
};

const EmployeeGroupAccess = ({ profileId, profileName }: EmployeeGroupAccessProps) => {
  const { orgId, profile: currentUser } = useAuth();
  const [assignedGroups, setAssignedGroups] = useState<GroupConversation[]>([]);
  const [assignedGroupKeys, setAssignedGroupKeys] = useState<Set<string>>(new Set());
  const [availableGroups, setAvailableGroups] = useState<GroupConversation[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (orgId && profileId) loadAccess();
  }, [orgId, profileId]);

  const loadAccess = async () => {
    const { data: access, error } = await supabase
      .from("employee_group_access" as any)
      .select("conversation_id")
      .eq("profile_id", profileId)
      .eq("org_id", orgId);

    if (error) {
      console.error("Error loading group access:", error);
      return;
    }

    const ids = ((access || []) as any[]).map(a => a.conversation_id);

    if (ids.length > 0) {
      const { data: convs } = await supabase
        .from("conversations")
        .select("id, customer_name, customer_phone, channel_id")
        .in("id", ids);

      const normalizedGroups = (convs || []) as unknown as GroupConversation[];
      setAssignedGroups(dedupeGroups(normalizedGroups));
      setAssignedGroupKeys(new Set(normalizedGroups.map(getGroupIdentityKey)));
    } else {
      setAssignedGroups([]);
      setAssignedGroupKeys(new Set());
    }
  };

  const loadAvailable = async () => {
    const { data } = await supabase
      .from("conversations")
      .select("id, customer_name, customer_phone, channel_id")
      .eq("org_id", orgId)
      .eq("conversation_type", "group")
      .neq("status", "closed")
      .order("last_message_at", { ascending: false });

    setAvailableGroups(dedupeGroups((data || []) as unknown as GroupConversation[]));
  };

  const openDialog = () => {
    loadAvailable();
    setSearchQuery("");
    setDialogOpen(true);
  };

  const addGroup = async (conversationId: string) => {
    const { error } = await supabase.from("employee_group_access" as any).insert({
      org_id: orgId,
      profile_id: profileId,
      conversation_id: conversationId,
      granted_by: currentUser?.id,
    } as any);

    if (error) {
      console.error("Error adding group:", error);
      toast.error("فشل إضافة القروب: " + error.message);
      return;
    }

    toast.success("تمت إضافة القروب");
    await loadAccess();
  };

  const removeGroup = async (conversationId: string) => {
    const { error } = await supabase
      .from("employee_group_access" as any)
      .delete()
      .eq("profile_id", profileId)
      .eq("conversation_id", conversationId);

    if (error) {
      toast.error("فشل إزالة القروب");
      return;
    }

    toast.success("تم إزالة القروب");
    await loadAccess();
  };

  const filtered = availableGroups.filter(g =>
    !searchQuery || (g.customer_name || g.customer_phone || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-primary" />
          القروبات المخصصة
        </Label>
        <Button size="sm" variant="outline" onClick={openDialog} className="gap-1 text-[10px] h-7 px-2">
          <Plus className="w-3 h-3" /> إضافة
        </Button>
      </div>

      {assignedGroups.length === 0 ? (
        <p className="text-[10px] text-muted-foreground bg-muted/30 rounded-lg p-3 text-center">
          لم يتم تخصيص قروبات — الموظف يشوف فقط قروبات قنواته
        </p>
      ) : (
        <div className="space-y-1.5">
          {assignedGroups.map(g => (
            <div key={g.id} className="flex items-center gap-2 bg-muted/30 rounded-lg p-2">
              <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs flex-1 truncate">{g.customer_name || g.customer_phone || "قروب"}</span>
              <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive shrink-0" onClick={() => removeGroup(g.id)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              إضافة قروبات لـ {profileName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="ابحث عن قروب..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="text-xs pr-9"
              />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1.5">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">لا توجد قروبات متاحة</p>
              ) : filtered.map(g => {
                const isAdded = assignedGroupKeys.has(getGroupIdentityKey(g));
                return (
                  <button
                    key={g.id}
                    onClick={() => !isAdded && addGroup(g.id)}
                    disabled={isAdded}
                    className={`w-full flex items-center gap-2 p-2.5 rounded-lg border transition-all text-right ${
                      isAdded
                        ? "border-success/30 bg-success/5 opacity-70"
                        : "border-transparent hover:border-primary/20 hover:bg-primary/5"
                    }`}
                  >
                    <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{g.customer_name || "مجموعة واتساب"}</p>
                      <p className="text-[10px] text-muted-foreground">{g.customer_phone}</p>
                    </div>
                    {isAdded ? (
                      <Check className="w-3.5 h-3.5 text-success shrink-0" />
                    ) : (
                      <Plus className="w-3.5 h-3.5 text-primary shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmployeeGroupAccess;
