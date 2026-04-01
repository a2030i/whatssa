import { useState, useEffect } from "react";
import { Tag, Clock, Mail, Phone, StickyNote, MessageSquare, User, Users, Building2, ChevronDown, ChevronUp, Edit3, Plus, X, ExternalLink, Copy } from "lucide-react";
import { Conversation } from "@/data/mockData";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import InternalNotes from "./InternalNotes";

interface CustomerInfoPanelProps {
  conversation: Conversation;
  onUpdateNotes: (convId: string, notes: string) => void;
  onAssignAgent?: (convId: string, agentId: string | null, agentName: string) => void;
  onAssignTeam?: (convId: string, teamId: string | null, teamName: string) => void;
}

const CustomerInfoPanel = ({ conversation, onUpdateNotes, onAssignAgent, onAssignTeam }: CustomerInfoPanelProps) => {
  const { orgId } = useAuth();
  const [notes, setNotes] = useState(conversation.notes || "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [customer, setCustomer] = useState<any>(null);
  const [newTag, setNewTag] = useState("");
  const [showAddTag, setShowAddTag] = useState(false);
  const [agents, setAgents] = useState<{ id: string; full_name: string; team_id: string | null }[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [sections, setSections] = useState({
    contact: true,
    assignment: true,
    tags: true,
    notes: true,
    stats: false,
  });

  useEffect(() => {
    setNotes(conversation.notes || "");
    loadCustomer();
  }, [conversation.id]);

  useEffect(() => {
    if (!orgId) return;
    const loadAgentsAndTeams = async () => {
      const [agentsRes, teamsRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, team_id").eq("org_id", orgId).eq("is_active", true),
        supabase.from("teams").select("id, name").eq("org_id", orgId),
      ]);
      setAgents(agentsRes.data || []);
      setTeams(teamsRes.data || []);
    };
    loadAgentsAndTeams();
  }, [orgId]);

  const loadCustomer = async () => {
    if (!orgId) return;
    const { data } = await supabase
      .from("customers")
      .select("*")
      .eq("org_id", orgId)
      .eq("phone", conversation.customerPhone)
      .maybeSingle();
    setCustomer(data);
  };

  const saveNotes = () => {
    onUpdateNotes(conversation.id, notes);
    setEditingNotes(false);
    toast.success("تم حفظ الملاحظات");
  };

  const toggleSection = (key: keyof typeof sections) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const addTag = async () => {
    if (!newTag.trim()) return;
    const updatedTags = [...conversation.tags, newTag.trim()];
    await supabase.from("conversations").update({ tags: updatedTags }).eq("id", conversation.id);
    setNewTag("");
    setShowAddTag(false);
    toast.success("تم إضافة الوسم");
  };

  const removeTag = async (tag: string) => {
    const updatedTags = conversation.tags.filter(t => t !== tag);
    await supabase.from("conversations").update({ tags: updatedTags }).eq("id", conversation.id);
    toast.success("تم حذف الوسم");
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`تم نسخ ${label}`);
  };

  const CopyField = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center justify-between">
      <button onClick={() => copyToClipboard(value, label)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors">
        <Copy className="w-3 h-3" />
        <span>نسخ</span>
      </button>
      <div className="text-left">
        <span className="text-[10px] text-muted-foreground block">{label}</span>
        <span className="text-xs font-medium" dir="ltr">{value}</span>
      </div>
    </div>
  );

  const SectionHeader = ({ title, icon: Icon, sectionKey }: { title: string; icon: any; sectionKey: keyof typeof sections }) => (
    <button onClick={() => toggleSection(sectionKey)} className="w-full flex items-center justify-between py-2 group">
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <Icon className="w-3 h-3" /> {title}
      </p>
      {sections[sectionKey] ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
    </button>
  );

  return (
    <div className="w-[280px] border-r border-border bg-card hidden xl:flex flex-col overflow-hidden">
      <Tabs defaultValue="info" className="flex flex-col h-full">
        <TabsList className="mx-2 mt-2 mb-0 grid grid-cols-2">
          <TabsTrigger value="info" className="text-xs">معلومات</TabsTrigger>
          <TabsTrigger value="notes" className="text-xs">ملاحظات</TabsTrigger>
        </TabsList>
        <TabsContent value="info" className="flex-1 flex flex-col overflow-hidden mt-0">
      <div className="p-4 border-b border-border text-center">
        <div className="relative inline-block">
          {conversation.profilePic ? (
            <img src={conversation.profilePic} alt={conversation.customerName} className="w-16 h-16 rounded-full object-cover mx-auto mb-2" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }} />
          ) : null}
          <div className={`w-16 h-16 rounded-full gradient-whatsapp flex items-center justify-center text-xl font-bold text-whatsapp-foreground mx-auto mb-2 ${conversation.profilePic ? "hidden" : ""}`}>
            {conversation.customerName.charAt(0)}
          </div>
          {conversation.lastSeen === "متصل الآن" && (
            <span className="absolute bottom-2 left-0 w-4 h-4 rounded-full bg-success border-2 border-card" />
          )}
        </div>
        <h3 className="font-bold text-sm">{conversation.customerName}</h3>
        <p className="text-[11px] text-muted-foreground">{conversation.lastSeen || "غير متصل"}</p>
        {customer && (
          <Badge variant="outline" className="text-[10px] mt-1.5 gap-1">
            <Building2 className="w-2.5 h-2.5" />
            عميل مسجل
          </Badge>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {/* Contact Info */}
        <SectionHeader title="معلومات التواصل" icon={Phone} sectionKey="contact" />
        {sections.contact && (
          <div className="space-y-3 pb-3 border-b border-border">
            <CopyField label="رقم الهاتف" value={conversation.customerPhone} />
            {conversation.customerName && (
              <CopyField label="اسم الواتساب" value={conversation.customerName} />
            )}
            {customer?.name && customer.name !== conversation.customerName && (
              <CopyField label="اسم الملف الشخصي" value={customer.name} />
            )}
            {(customer?.email || conversation.email) && (
              <CopyField label="عنوان الايميل" value={customer?.email || conversation.email || "N/A"} />
            )}
          </div>
        )}

        {/* Assignment */}
        <SectionHeader title="تعيين المحادثة" icon={User} sectionKey="assignment" />
        {sections.assignment && (
          <div className="space-y-3 pb-3 border-b border-border">
            {/* Team Assignment */}
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Users className="w-3 h-3" /> الفريق المسؤول
              </span>
              <Select
                value={conversation.assignedTeamId || "__none__"}
                onValueChange={(val) => {
                  const teamId = val === "__none__" ? null : val;
                  const teamName = teams.find(t => t.id === teamId)?.name || "غير معيّن";
                  onAssignTeam?.(conversation.id, teamId, teamName);
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="اختر الفريق" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">بدون فريق</SelectItem>
                  {teams.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Agent Assignment */}
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <User className="w-3 h-3" /> الموظف المسؤول
              </span>
              <Select
                value={conversation.assignedToId || "__none__"}
                onValueChange={(val) => {
                  const agentId = val === "__none__" ? null : val;
                  const agentName = agents.find(a => a.id === agentId)?.full_name || "غير معيّن";
                  onAssignAgent?.(conversation.id, agentId, agentName);
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="اختر الموظف" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">غير معيّن</SelectItem>
                  {agents.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.full_name || "بدون اسم"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">الحالة</span>
              <Badge variant="outline" className="text-[10px]">
                {conversation.status === "active" ? "نشط" : conversation.status === "waiting" ? "بانتظار" : "مغلق"}
              </Badge>
            </div>
          </div>
        )}

        {/* Tags */}
        <SectionHeader title="وسوم المحادثة" icon={Tag} sectionKey="tags" />
        {sections.tags && (
          <div className="pb-3 border-b border-border">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {conversation.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px] gap-1 pr-1">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="hover:text-destructive">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </Badge>
              ))}
              {conversation.tags.length === 0 && <span className="text-[11px] text-muted-foreground">لا يوجد وسوم</span>}
            </div>
            {showAddTag ? (
              <div className="flex gap-1.5">
                <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="اسم الوسم" className="h-7 text-xs bg-secondary border-0 flex-1" onKeyDown={(e) => e.key === "Enter" && addTag()} />
                <Button size="sm" className="h-7 text-[10px] px-2" onClick={addTag}>إضافة</Button>
                <Button size="sm" variant="ghost" className="h-7 text-[10px] px-1.5" onClick={() => setShowAddTag(false)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <button onClick={() => setShowAddTag(true)} className="text-[11px] text-primary hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> أضف وسم
              </button>
            )}
          </div>
        )}

        {/* Notes */}
        <SectionHeader title="ملاحظات" icon={StickyNote} sectionKey="notes" />
        {sections.notes && (
          <div className="pb-3 border-b border-border">
            {editingNotes ? (
              <div className="space-y-2">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="text-xs bg-secondary border-0 min-h-[70px] resize-none" placeholder="أضف ملاحظة..." />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveNotes} className="text-[10px] h-6 px-2">حفظ</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingNotes(false)} className="text-[10px] h-6 px-2">إلغاء</Button>
                </div>
              </div>
            ) : (
              <button onClick={() => setEditingNotes(true)} className="w-full text-right p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
                <p className="text-xs text-muted-foreground">{notes || "أضف ملاحظة..."}</p>
              </button>
            )}
          </div>
        )}

        {/* Stats */}
        <SectionHeader title="البيانات المتتبعة" icon={MessageSquare} sectionKey="stats" />
        {sections.stats && (
          <div className="space-y-2 pb-3">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">إجمالي المحادثات</span>
              <span className="font-medium">3</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">آخر تواصل</span>
              <span className="font-medium">{conversation.timestamp}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">الحالة</span>
              <Badge variant="outline" className="text-[10px]">
                {conversation.lastSeen === "متصل الآن" ? "متصل" : "غير متصل"}
              </Badge>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">متوسط الاستجابة</span>
              <span className="font-medium">1.5 دقيقة</span>
            </div>
          </div>
        )}
      </div>
        </TabsContent>
        <TabsContent value="notes" className="flex-1 flex flex-col overflow-hidden mt-0">
          <InternalNotes conversationId={conversation.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CustomerInfoPanel;
