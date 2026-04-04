import { useState, useEffect } from "react";
import { Tag, Clock, Mail, Phone, StickyNote, MessageSquare, User, Users, Building2, ChevronDown, ChevronUp, Edit3, Plus, X, ExternalLink, Copy, Package, CreditCard, MapPin, Truck, ShoppingBag, UserPlus, UserMinus, LogOut, Link2, Crown, Shield } from "lucide-react";
import { Conversation } from "@/data/mockData";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase, invokeCloud } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import InternalNotes from "./InternalNotes";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface CustomerInfoPanelProps {
  conversation: Conversation;
  onUpdateNotes: (convId: string, notes: string) => void;
  onAssignAgent?: (convId: string, agentId: string | null, agentName: string) => void;
  onAssignTeam?: (convId: string, teamId: string | null, teamName: string) => void;
  isMobileSheet?: boolean;
}

const ORDER_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "قيد الانتظار", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  processing: { label: "قيد التجهيز", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  shipped: { label: "تم الشحن", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  delivered: { label: "تم التوصيل", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  cancelled: { label: "ملغي", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  refunded: { label: "مسترجع", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400" },
};

const SHIPMENT_STATUS_MAP: Record<string, string> = {
  pending: "بانتظار الشحن",
  picked_up: "تم الاستلام",
  in_transit: "في الطريق",
  out_for_delivery: "جاري التوصيل",
  delivered: "تم التسليم",
  returned: "مرتجع",
};

const normalizeDigits = (value: unknown) =>
  typeof value === "string" ? value.replace(/@.*/, "").replace(/\D/g, "") : "";

const extractParticipantPhone = (participant: any) => {
  const rawId = participant?.id || participant?.jid || "";
  const candidates = [participant?.phone, participant?.number, participant?.senderPn, participant?.participantPn]
    .map(normalizeDigits)
    .filter(Boolean);

  if (candidates.length > 0) return candidates[0];
  if (rawId.includes("@s.whatsapp.net")) return normalizeDigits(rawId);
  if (rawId.includes("@g.us")) return normalizeDigits(rawId);
  if (rawId.includes("@lid")) return normalizeDigits(rawId);
  return "";
};

const extractParticipantName = (participant: any, phone: string) => {
  const candidate = [participant?.pushName, participant?.name, participant?.notify, participant?.verifiedName, participant?.shortName]
    .find((value) => typeof value === "string" && value.trim());

  if (candidate) return candidate.trim();
  if (phone) return `+${phone}`;
  const rawId = participant?.id || participant?.jid || "";
  if (rawId.includes("@lid")) {
    const lidShort = rawId.replace(/@.*/, "").slice(-6);
    return `عضو #${lidShort}`;
  }
  return "عضو بالقروب";
};

const CustomerInfoPanel = ({ conversation, onUpdateNotes, onAssignAgent, onAssignTeam, isMobileSheet }: CustomerInfoPanelProps) => {
  const { orgId, isEcommerce } = useAuth();
  const [notes, setNotes] = useState(conversation.notes || "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [customer, setCustomer] = useState<any>(null);
  const [newTag, setNewTag] = useState("");
  const [showAddTag, setShowAddTag] = useState(false);
  const [agents, setAgents] = useState<{ id: string; full_name: string; team_id: string | null }[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<Record<string, any[]>>({});
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [sections, setSections] = useState({
    contact: true,
    assignment: true,
    tags: true,
    notes: true,
    stats: false,
  });
  const [groupInfo, setGroupInfo] = useState<any>(null);
  const [groupParticipants, setGroupParticipants] = useState<Array<{ id: string; name: string; phone: string; rawDigits: string; admin?: boolean; isSaved?: boolean; isLid?: boolean }>>([]);
  const [groupPicture, setGroupPicture] = useState<string | null>(conversation.profilePic || null);
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
  const [addMemberPhone, setAddMemberPhone] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [isGroupAdmin, setIsGroupAdmin] = useState(false);
  const isGroup = conversation.conversationType === "group";

  const loadGroupInfo = async () => {
    try {
      const { data, error } = await invokeCloud("evolution-manage", {
        body: { action: "group_info", group_jid: conversation.customerPhone, channel_id: conversation.channelId },
      });
      if (error) return;
      const info = data?.data?.data || data?.data || {};
      setGroupInfo(info);
      setGroupPicture(info?.pictureUrl || info?.picture || info?.profilePictureUrl || conversation.profilePic || null);
      const participants = info?.participants || [];
      const mapped = participants.map((p: any) => {
        const rawId = p.id || p.jid || "";
        const phone = extractParticipantPhone(p);
        const isLid = rawId.includes("@lid");
        return {
          id: rawId,
          name: extractParticipantName(p, phone),
          phone,
          rawDigits: normalizeDigits(rawId),
          admin: p.admin === "admin" || p.admin === "superadmin" || p.isAdmin || p.isSuperAdmin,
          isLid,
        };
      });

      // For @lid participants, resolve names & phones from message history
      const lidParticipants = mapped.filter((m: any) => m.isLid);
      if (lidParticipants.length > 0) {
        const { data: msgRows } = await supabase
          .from("messages")
          .select("metadata")
          .eq("conversation_id", conversation.id)
          .not("metadata", "is", null)
          .limit(500);
        
        // Build lid → name & lid → real phone mapping from messages
        const lidNameMap = new Map<string, string>();
        const lidPhoneMap = new Map<string, string>();
        (msgRows || []).forEach((row: any) => {
          const meta = row.metadata;
          if (meta?.participant && typeof meta.participant === "string" && meta.participant.includes("@lid")) {
            const lid = meta.participant;
            const name = meta.sender_name || meta.senderName || meta.pushName;
            if (name && !lidNameMap.has(lid)) lidNameMap.set(lid, name);
            // sender_pn contains the real phone number
            const realPhone = meta.sender_pn;
            if (realPhone && !lidPhoneMap.has(lid)) lidPhoneMap.set(lid, String(realPhone));
          }
        });

        lidParticipants.forEach((m: any) => {
          const resolvedName = lidNameMap.get(m.id);
          if (resolvedName) m.name = resolvedName;
          const resolvedPhone = lidPhoneMap.get(m.id);
          if (resolvedPhone) {
            m.phone = resolvedPhone;
          }
        });
      }

      // Enrich names from customers table & resolve real phones for @lid by name match
      const phones = mapped.map((m: any) => m.phone).filter(Boolean);
      const rawDigits = mapped.map((m: any) => m.rawDigits).filter(Boolean);
      const allLookups = [...new Set([...phones, ...rawDigits])];
      if (orgId) {
        // Get all org customers for name-based matching too
        const { data: customers } = await supabase
          .from("customers")
          .select("phone, name")
          .eq("org_id", orgId)
          .limit(1000);
        
        const phoneToName = new Map<string, string>();
        const nameToPhone = new Map<string, string>();
        (customers || []).forEach((c: any) => {
          if (c.name) phoneToName.set(c.phone, c.name);
          if (c.name && c.phone) {
            const normalName = c.name.trim().toLowerCase();
            if (!nameToPhone.has(normalName)) nameToPhone.set(normalName, c.phone);
          }
        });

        mapped.forEach((m: any) => {
          // Exact phone match
          const savedName = phoneToName.get(m.phone) || phoneToName.get(m.rawDigits);
          if (savedName) {
            m.name = savedName;
            m.isSaved = true;
            return;
          }
          // Suffix match on phone
          for (const [cPhone, cName] of phoneToName) {
            if (cPhone && m.phone && (cPhone.endsWith(m.phone) || m.phone.endsWith(cPhone)) && cPhone.length >= 7) {
              m.name = cName;
              m.isSaved = true;
              return;
            }
          }
          // For @lid: match by name to find real phone
          if (m.isLid && m.name) {
            const normalName = m.name.trim().toLowerCase();
            const realPhone = nameToPhone.get(normalName);
            if (realPhone) {
              m.phone = realPhone.replace(/\D/g, "");
              m.isSaved = true;
            }
          }
        });
      }

      // Check if our channel phone is admin in this group
      if (conversation.channelId && orgId) {
        const { data: channelData } = await supabase
          .from("whatsapp_config_safe")
          .select("display_phone")
          .eq("id", conversation.channelId)
          .maybeSingle();
        if (channelData?.display_phone) {
          const ourPhone = channelData.display_phone.replace(/\D/g, "");
          const ourEntry = mapped.find((m: any) => m.phone === ourPhone);
          setIsGroupAdmin(ourEntry?.admin === true);
        }
      }

      // Sort: admins first → saved contacts → others, then alphabetically
      mapped.sort((a: any, b: any) => {
        if (a.admin && !b.admin) return -1;
        if (!a.admin && b.admin) return 1;
        if (!a.admin && !b.admin) {
          if (a.isSaved && !b.isSaved) return -1;
          if (!a.isSaved && b.isSaved) return 1;
        }
        return (a.name || "").localeCompare(b.name || "");
      });

      setGroupParticipants(mapped);
    } catch {}
  };

  const handleAddGroupMember = async () => {
    const phone = addMemberPhone.replace(/\D/g, "");
    if (!phone) return;
    setAddingMember(true);
    try {
      const { error } = await invokeCloud("evolution-manage", {
        body: { action: "group_add", group_jid: conversation.customerPhone, participants: [phone], channel_id: conversation.channelId },
      });
      if (error) throw error;
      toast.success("✅ تمت إضافة العضو");
      setAddMemberPhone("");
      setShowAddMemberDialog(false);
      loadGroupInfo();
    } catch (err: any) {
      toast.error("فشل إضافة العضو: " + (err.message || ""));
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveGroupMember = async (phone: string) => {
    if (!confirm(`هل تريد إزالة ${phone} من القروب؟`)) return;
    try {
      const { error } = await invokeCloud("evolution-manage", {
        body: { action: "group_remove", group_jid: conversation.customerPhone, participants: [phone], channel_id: conversation.channelId },
      });
      if (error) throw error;
      toast.success("✅ تمت إزالة العضو");
      setGroupParticipants(prev => prev.filter(p => p.phone !== phone));
    } catch (err: any) {
      toast.error("فشل إزالة العضو: " + (err.message || ""));
    }
  };

  const handleLeaveGroup = async () => {
    if (!confirm("هل أنت متأكد من الخروج من هذا القروب؟")) return;
    try {
      const { error } = await invokeCloud("evolution-manage", {
        body: { action: "leave_group", group_jid: conversation.customerPhone, channel_id: conversation.channelId },
      });
      if (error) throw error;
      toast.success("✅ تم الخروج من القروب");
    } catch (err: any) {
      toast.error("فشل الخروج: " + (err.message || ""));
    }
  };

  useEffect(() => {
    setNotes(conversation.notes || "");
    setGroupPicture(conversation.profilePic || null);
    loadCustomer();
    loadOrders();
    if (isGroup && conversation.channelType === "evolution") {
      loadGroupInfo();
    }
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

  const loadOrders = async () => {
    if (!orgId) return;
    setOrdersLoading(true);
    // Find orders by customer phone
    const { data: ordersData } = await supabase
      .from("orders")
      .select("*")
      .eq("org_id", orgId)
      .eq("customer_phone", conversation.customerPhone)
      .order("created_at", { ascending: false })
      .limit(20);

    const fetchedOrders = ordersData || [];
    setOrders(fetchedOrders);

    if (fetchedOrders.length > 0) {
      const orderIds = fetchedOrders.map((o: any) => o.id);
      const { data: items } = await supabase
        .from("order_items")
        .select("*")
        .in("order_id", orderIds);

      const grouped: Record<string, any[]> = {};
      (items || []).forEach((item: any) => {
        if (!grouped[item.order_id]) grouped[item.order_id] = [];
        grouped[item.order_id].push(item);
      });
      setOrderItems(grouped);
    }
    setOrdersLoading(false);
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

  const formatDate = (d: string) => new Date(d).toLocaleDateString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const formatCurrency = (v: number, cur: string = "SAR") => `${Number(v || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;

  const totalSpent = orders
    .filter(o => !["cancelled", "refunded"].includes(o.status))
    .reduce((sum, o) => sum + (Number(o.total) || 0), 0);

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
    <div className={isMobileSheet ? "flex flex-col overflow-y-auto bg-card" : "w-[280px] border-r border-border bg-card hidden xl:flex flex-col overflow-y-auto"}>
      <Tabs defaultValue={isGroup ? "members" : "info"} className="flex flex-col">
        <TabsList className={`mx-2 mt-2 mb-0 grid shrink-0 ${isGroup ? (isEcommerce ? "grid-cols-4" : "grid-cols-3") : (isEcommerce ? "grid-cols-3" : "grid-cols-2")}`}>
          <TabsTrigger value="info" className="text-xs">معلومات</TabsTrigger>
          {isGroup && (
            <TabsTrigger value="members" className="text-xs gap-1">
              أعضاء
              {groupParticipants.length > 0 && (
                <span className="bg-primary/15 text-primary text-[9px] px-1 rounded-full font-bold">{groupParticipants.length}</span>
              )}
            </TabsTrigger>
          )}
          {isEcommerce && (
            <TabsTrigger value="orders" className="text-xs gap-1">
              طلبات
              {orders.length > 0 && (
                <span className="bg-primary/15 text-primary text-[9px] px-1 rounded-full font-bold">{orders.length}</span>
              )}
            </TabsTrigger>
          )}
          <TabsTrigger value="notes" className="text-xs">ملاحظات</TabsTrigger>
        </TabsList>

        {/* Members Tab - Groups only */}
        {isGroup && (
          <TabsContent value="members" className="mt-0">
            <div className="p-4 border-b border-border text-center">
              <div className="relative inline-block">
                {groupPicture ? (
                  <img src={groupPicture} alt={conversation.customerName} className="w-16 h-16 rounded-full object-cover mx-auto mb-2" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }} />
                ) : null}
                <div className={`w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary mx-auto mb-2 ${groupPicture ? "hidden" : ""}`}>
                  <Users className="w-7 h-7" />
                </div>
              </div>
              <h3 className="font-bold text-sm">{conversation.customerName}</h3>
              {groupInfo?.description && (
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed max-w-full">{groupInfo.description}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                {groupInfo?.creation ? `أُنشئ ${new Date(groupInfo.creation * 1000).toLocaleDateString("ar-SA")}` : ""}
                {groupParticipants.length > 0 && ` · ${groupParticipants.length} عضو`}
              </p>
            </div>

            <div className="p-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-muted-foreground">الأعضاء ({groupParticipants.length})</span>
                {isGroupAdmin && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAddMemberDialog(true)}>
                    <UserPlus className="w-3.5 h-3.5" /> إضافة
                  </Button>
                )}
              </div>
              <div className="space-y-0.5 max-h-[350px] overflow-y-auto">
                {groupParticipants.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-secondary/50 transition-colors group">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {(p.name || p.phone || "ع").slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate flex items-center gap-1">
                          {p.name}
                          {p.admin && <Crown className="w-3 h-3 text-amber-500 shrink-0" />}
                          {p.isSaved && !p.admin && <User className="w-3 h-3 text-primary shrink-0" />}
                        </p>
                        {p.phone && !(p.isLid && !p.isSaved) && <p className="text-[10px] text-muted-foreground" dir="ltr">+{p.phone}</p>}
                      </div>
                    </div>
                    {isGroupAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={!p.phone}
                        className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                        onClick={() => handleRemoveGroupMember(p.phone)}
                      >
                        <UserMinus className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-3 border-t border-border">
                <Button variant="destructive" size="sm" className="w-full text-xs gap-1.5" onClick={handleLeaveGroup}>
                  <LogOut className="w-3.5 h-3.5" /> الخروج من القروب
                </Button>
              </div>
            </div>

            {/* Add Member Dialog */}
            <Dialog open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
              <DialogContent className="max-w-sm" dir="rtl">
                <DialogHeader>
                  <DialogTitle className="text-sm">إضافة عضو جديد</DialogTitle>
                </DialogHeader>
                <div className="flex gap-2">
                  <Input
                    placeholder="رقم الهاتف (مثال: 966500000000)"
                    value={addMemberPhone}
                    onChange={(e) => setAddMemberPhone(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddGroupMember()}
                    dir="ltr"
                    className="text-left text-sm"
                  />
                  <Button onClick={handleAddGroupMember} disabled={addingMember || !addMemberPhone.trim()} size="sm">
                    {addingMember ? "..." : "إضافة"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>
        )}

        {/* Info Tab */}
        <TabsContent value="info" className="mt-0">
      <div className="p-4 border-b border-border text-center">
        <div className="relative inline-block">
          {groupPicture ? (
            <img src={groupPicture} alt={conversation.customerName} className="w-16 h-16 rounded-full object-cover mx-auto mb-2" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }} />
          ) : null}
          <div className={`w-16 h-16 rounded-full gradient-whatsapp flex items-center justify-center text-xl font-bold text-whatsapp-foreground mx-auto mb-2 ${groupPicture ? "hidden" : ""}`}>
            {conversation.customerName.charAt(0)}
          </div>
          {conversation.lastSeen === "متصل الآن" && (
            <span className="absolute bottom-2 left-0 w-4 h-4 rounded-full bg-success border-2 border-card" />
          )}
        </div>
        <h3 className="font-bold text-sm">{conversation.customerName}</h3>
        <p className="text-[11px] text-muted-foreground">{isGroup ? `${groupParticipants.length} عضو` : (conversation.lastSeen || "غير متصل")}</p>
        {customer && !isGroup && (
          <Badge variant="outline" className="text-[10px] mt-1.5 gap-1">
            <Building2 className="w-2.5 h-2.5" />
            عميل مسجل
          </Badge>
        )}
      </div>

      <div className="p-4 space-y-1">
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

        {/* Orders Tab */}
        <TabsContent value="orders" className="mt-0">
          <div>
            {/* Orders Summary Header */}
            {orders.length > 0 && (
              <div className="p-3 border-b border-border bg-secondary/30">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-card rounded-lg p-2 border border-border text-center">
                    <ShoppingBag className="w-3.5 h-3.5 text-primary mx-auto mb-0.5" />
                    <p className="text-[10px] text-muted-foreground">الطلبات</p>
                    <p className="text-sm font-bold">{orders.length}</p>
                  </div>
                  <div className="bg-card rounded-lg p-2 border border-border text-center">
                    <CreditCard className="w-3.5 h-3.5 text-primary mx-auto mb-0.5" />
                    <p className="text-[10px] text-muted-foreground">إجمالي المصروف</p>
                    <p className="text-[11px] font-bold">{formatCurrency(totalSpent, orders[0]?.currency)}</p>
                  </div>
                </div>
              </div>
            )}

            {ordersLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <Package className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">لا توجد طلبات لهذا العميل</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {orders.map((order) => {
                  const status = ORDER_STATUS_MAP[order.status] || { label: order.status, color: "bg-gray-100 text-gray-700" };
                  const items = orderItems[order.id] || [];
                  const isExpanded = expandedOrder === order.id;
                  const shipStatus = order.shipment_status ? (SHIPMENT_STATUS_MAP[order.shipment_status] || order.shipment_status) : null;

                  return (
                    <div key={order.id}>
                      <button
                        onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                        className="w-full text-right p-3 hover:bg-secondary/30 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-mono text-muted-foreground">#{order.order_number || order.external_id || "—"}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${status.color}`}>{status.label}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">{formatCurrency(Number(order.total) || 0, order.currency)}</span>
                          <span className="text-[10px] text-muted-foreground">{formatDate(order.created_at)}</span>
                        </div>
                        {/* Shipping & payment quick info */}
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {order.payment_method && (
                            <span className="text-[9px] bg-secondary px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <CreditCard className="w-2.5 h-2.5" /> {order.payment_method}
                            </span>
                          )}
                          {shipStatus && (
                            <span className="text-[9px] bg-secondary px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <Truck className="w-2.5 h-2.5" /> {shipStatus}
                            </span>
                          )}
                          {order.source && order.source !== "manual" && (
                            <span className="text-[9px] bg-secondary px-1.5 py-0.5 rounded">
                              {order.source}
                            </span>
                          )}
                        </div>
                      </button>

                      {/* Expanded order details */}
                      {isExpanded && (
                        <div className="px-3 pb-3 space-y-2 bg-secondary/10">
                          {/* Financial breakdown */}
                          <div className="space-y-1 text-[11px]">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">المبلغ الفرعي</span>
                              <span>{formatCurrency(Number(order.subtotal) || 0)}</span>
                            </div>
                            {Number(order.discount_amount) > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">الخصم</span>
                                <span className="text-emerald-600">-{formatCurrency(Number(order.discount_amount))}</span>
                              </div>
                            )}
                            {Number(order.shipping_amount) > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">الشحن</span>
                                <span>{formatCurrency(Number(order.shipping_amount))}</span>
                              </div>
                            )}
                            {Number(order.tax_amount) > 0 && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">الضريبة</span>
                                <span>{formatCurrency(Number(order.tax_amount))}</span>
                              </div>
                            )}
                            <div className="flex justify-between font-bold border-t border-border/50 pt-1">
                              <span>الإجمالي</span>
                              <span>{formatCurrency(Number(order.total) || 0, order.currency)}</span>
                            </div>
                          </div>

                          {/* Shipping info */}
                          {order.shipment_tracking_number && (
                            <div className="flex items-center gap-1.5 text-[10px] bg-card p-2 rounded border border-border">
                              <Truck className="w-3 h-3 text-primary" />
                              <div>
                                <span className="text-muted-foreground">رقم التتبع: </span>
                                <span className="font-mono font-medium" dir="ltr">{order.shipment_tracking_number}</span>
                                {order.shipment_carrier && <span className="text-muted-foreground"> ({order.shipment_carrier})</span>}
                              </div>
                            </div>
                          )}

                          {/* Delivery address */}
                          {(order.customer_city || order.customer_address) && (
                            <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                              <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                              <span>{[order.customer_city, order.customer_region, order.customer_address].filter(Boolean).join(" - ")}</span>
                            </div>
                          )}

                          {/* Order items */}
                          {items.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-[10px] font-semibold text-muted-foreground">المنتجات ({items.length})</p>
                              {items.map((item: any) => (
                                <div key={item.id} className="flex justify-between text-[11px] bg-card rounded p-2 border border-border/30">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {item.metadata?.thumbnail && (
                                      <img src={item.metadata.thumbnail} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                                    )}
                                    <div className="min-w-0">
                                      <p className="font-medium truncate">{item.product_name}</p>
                                      {item.product_sku && <p className="text-[9px] text-muted-foreground">SKU: {item.product_sku}</p>}
                                    </div>
                                  </div>
                                  <div className="text-left shrink-0 mr-2">
                                    <p className="text-[10px]">{item.quantity}×</p>
                                    <p className="font-medium">{formatCurrency(Number(item.total_price))}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes" className="mt-0">
          <InternalNotes conversationId={conversation.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CustomerInfoPanel;
