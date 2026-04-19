import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { Bot, Search, RefreshCw, Plus, CheckCircle2, XCircle, ChevronDown, ChevronUp, Trash2, Save, Edit, X, ArrowRight, Zap, MessageSquare } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";

const generateId = () => crypto.randomUUID().slice(0, 8);

interface BotButton {
  id: string;
  label: string;
  next_node_id: string;
}

interface BotNode {
  id: string;
  name: string;
  type: string;
  content: string;
  buttons: BotButton[];
  action_type?: string;
  action_value?: string;
}

interface BotFlow {
  id: string;
  name: string;
  is_active: boolean;
  trigger_type: string;
  welcome_message: string | null;
  nodes: BotNode[];
  created_at: string;
}

interface OrgBotStatus {
  org_id: string;
  org_name: string;
  has_bot: boolean;
  bot_count: number;
  has_template: boolean;
  flows: BotFlow[];
}

const TEMPLATES = [
  { key: "customer_service", label: "🎯 خدمة عملاء" },
];

function buildCustomerServiceNodes(): BotNode[] {
  const inquiryId = generateId();
  const addressId = generateId();
  const complaintId = generateId();
  const agentId = generateId();
  const ticketInquiryId = generateId();
  const ticketAddressId = generateId();
  const ticketComplaintId = generateId();

  return [
    { id: generateId(), name: "القائمة الرئيسية", type: "message", content: "أهلاً وسهلاً! 👋\nكيف نقدر نساعدك؟", buttons: [
      { id: generateId(), label: "📦 استفسار عن طلب", next_node_id: inquiryId },
      { id: generateId(), label: "🔄 تعديل عنوان", next_node_id: addressId },
      { id: generateId(), label: "📝 شكوى", next_node_id: complaintId },
      { id: generateId(), label: "👤 تحدث مع موظف", next_node_id: agentId },
    ]},
    { id: inquiryId, name: "استفسار عن طلب", type: "message", content: "أرسل لنا رقم طلبك وسيتواصل معك الفريق قريباً 📋", buttons: [{ id: generateId(), label: "تم الإرسال ✅", next_node_id: ticketInquiryId }] },
    { id: ticketInquiryId, name: "تذكرة استفسار", type: "action", content: "استفسار عن طلب", buttons: [], action_type: "close_with_ticket", action_value: "استفسار" },
    { id: addressId, name: "تعديل عنوان", type: "message", content: "أرسل لنا رقم الطلب والعنوان الجديد وسنعدّله لك 🔄", buttons: [{ id: generateId(), label: "تم الإرسال ✅", next_node_id: ticketAddressId }] },
    { id: ticketAddressId, name: "تذكرة تعديل عنوان", type: "action", content: "تعديل عنوان شحنة", buttons: [], action_type: "close_with_ticket", action_value: "تعديل عنوان" },
    { id: complaintId, name: "شكوى", type: "message", content: "نأسف لأي إزعاج! اكتب تفاصيل شكواك وسنتابعها فوراً 🙏", buttons: [{ id: generateId(), label: "تم الإرسال ✅", next_node_id: ticketComplaintId }] },
    { id: ticketComplaintId, name: "تذكرة شكوى", type: "action", content: "شكوى عميل", buttons: [], action_type: "close_with_ticket", action_value: "شكوى" },
    { id: agentId, name: "تحويل لموظف", type: "action", content: "جاري تحويلك لأحد الموظفين...", buttons: [], action_type: "transfer_agent" },
  ];
}

const ACTION_LABELS: Record<string, string> = {
  transfer_agent: "تحويل لموظف",
  transfer_team: "تحويل لفريق",
  close: "إغلاق المحادثة",
  create_ticket: "إنشاء تذكرة",
  close_with_ticket: "تذكرة + إغلاق",
  go_to_flow: "انتقل لتدفق آخر",
};

const AdminBotTemplates = () => {
  const [orgs, setOrgs] = useState<OrgBotStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedOrg, setSelectedOrg] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("customer_service");
  const [deploying, setDeploying] = useState(false);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [togglingFlow, setTogglingFlow] = useState<string | null>(null);

  // Editing state
  const [editingFlow, setEditingFlow] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editWelcome, setEditWelcome] = useState("");
  const [editNodes, setEditNodes] = useState<BotNode[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteBotId, setDeleteBotId] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [orgRes, flowsRes] = await Promise.all([
      supabase.from("organizations").select("id, name").eq("is_active", true).order("name"),
      supabase.from("chatbot_flows").select("id, org_id, name, is_active, trigger_type, welcome_message, nodes, created_at").order("created_at", { ascending: false }),
    ]);

    const flowsByOrg: Record<string, BotFlow[]> = {};
    (flowsRes.data || []).forEach((f: any) => {
      if (!flowsByOrg[f.org_id]) flowsByOrg[f.org_id] = [];
      flowsByOrg[f.org_id].push({
        id: f.id, name: f.name, is_active: f.is_active,
        trigger_type: f.trigger_type, welcome_message: f.welcome_message,
        nodes: (f.nodes as BotNode[]) || [], created_at: f.created_at,
      });
    });

    setOrgs((orgRes.data || []).map((o: any) => {
      const flows = flowsByOrg[o.id] || [];
      return {
        org_id: o.id, org_name: o.name,
        has_bot: flows.length > 0, bot_count: flows.length,
        has_template: flows.some(f => f.name?.includes("قالب جاهز")),
        flows,
      };
    }));
    setLoading(false);
  }, []);

  const deployTemplate = async () => {
    if (!selectedOrg) { toast.error("اختر منظمة"); return; }
    setDeploying(true);
    const nodes = selectedTemplate === "customer_service" ? buildCustomerServiceNodes() : [];
    const { error } = await supabase.from("chatbot_flows").insert({
      name: "🎯 خدمة عملاء (قالب جاهز)", org_id: selectedOrg,
      trigger_type: "first_message", trigger_keywords: [], welcome_message: null,
      nodes, channel_ids: [], is_active: false,
    } as any);
    if (error) toast.error("فشل: " + error.message);
    else { toast.success("✅ تم إنشاء البوت"); loadData(); }
    setDeploying(false);
  };

  const toggleFlow = async (flowId: string, currentState: boolean) => {
    setTogglingFlow(flowId);
    const { error } = await supabase.from("chatbot_flows").update({ is_active: !currentState } as any).eq("id", flowId);
    if (error) toast.error("فشل التحديث");
    else setOrgs(prev => prev.map(o => ({ ...o, flows: o.flows.map(f => f.id === flowId ? { ...f, is_active: !currentState } : f) })));
    setTogglingFlow(null);
  };

  const deleteFlow = (flowId: string) => { setDeleteBotId(flowId); };

  const confirmDeleteFlow = async () => {
    const flowId = deleteBotId;
    if (!flowId) return;
    setDeleteBotId(null);
    const { error } = await supabase.from("chatbot_flows").delete().eq("id", flowId);
    if (error) toast.error("فشل الحذف");
    else { toast.success("تم الحذف"); if (editingFlow === flowId) setEditingFlow(null); loadData(); }
  };

  // ── Edit functions ──
  const startEdit = (flow: BotFlow) => {
    setEditingFlow(flow.id);
    setEditName(flow.name);
    setEditWelcome(flow.welcome_message || "");
    setEditNodes(JSON.parse(JSON.stringify(flow.nodes)));
  };

  const cancelEdit = () => { setEditingFlow(null); };

  const saveEdit = async () => {
    if (!editingFlow) return;
    setSavingEdit(true);
    const { error } = await supabase.from("chatbot_flows").update({
      name: editName, welcome_message: editWelcome.trim() || null, nodes: editNodes as any,
    } as any).eq("id", editingFlow);
    if (error) toast.error("فشل الحفظ: " + error.message);
    else { toast.success("✅ تم حفظ التعديلات"); setEditingFlow(null); loadData(); }
    setSavingEdit(false);
  };

  const updateNode = (nid: string, updates: Partial<BotNode>) => {
    setEditNodes(prev => prev.map(n => n.id === nid ? { ...n, ...updates } : n));
  };

  const updateButton = (nid: string, bid: string, updates: Partial<BotButton>) => {
    setEditNodes(prev => prev.map(n => n.id === nid ? {
      ...n, buttons: n.buttons.map(b => b.id === bid ? { ...b, ...updates } : b)
    } : n));
  };

  const addButton = (nid: string) => {
    setEditNodes(prev => prev.map(n => n.id === nid ? {
      ...n, buttons: [...n.buttons, { id: generateId(), label: "", next_node_id: "" }]
    } : n));
  };

  const removeButton = (nid: string, bid: string) => {
    setEditNodes(prev => prev.map(n => n.id === nid ? {
      ...n, buttons: n.buttons.filter(b => b.id !== bid)
    } : n));
  };

  const addNode = () => {
    setEditNodes(prev => [...prev, { id: generateId(), name: "", type: "message", content: "", buttons: [] }]);
  };

  const removeNode = (nid: string) => {
    setEditNodes(prev => prev.filter(n => n.id !== nid));
  };

  const getNodesSummary = (nodes: BotNode[]) => {
    const msg = nodes.filter(n => n.type === "message").length;
    const act = nodes.filter(n => n.type === "action").length;
    const btns = nodes.reduce((s, n) => s + (n.buttons?.length || 0), 0);
    return `${msg} رسالة · ${act} إجراء · ${btns} زر`;
  };

  const filtered = orgs.filter(o => o.org_name.toLowerCase().includes(search.toLowerCase()));
  const withBot = orgs.filter(o => o.has_bot).length;

  return (
    <div className="space-y-6">
      <h2 className="font-semibold text-sm flex items-center gap-2">
        <Bot className="w-4 h-4 text-primary" /> قوالب البوت
      </h2>

      {/* Deploy */}
      <div className="bg-card rounded-xl shadow-card p-4 space-y-4 border">
        <h3 className="text-sm font-semibold">إنشاء بوت لمنظمة محددة</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">المنظمة</label>
            <Select value={selectedOrg} onValueChange={setSelectedOrg}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر منظمة" /></SelectTrigger>
              <SelectContent>
                {orgs.map(o => (
                  <SelectItem key={o.org_id} value={o.org_id}>{o.org_name} {o.has_template && "✅"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">القالب</label>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TEMPLATES.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={deployTemplate} disabled={!selectedOrg || deploying} className="gap-1.5 w-full">
              <Plus className="w-4 h-4" /> {deploying ? "جاري..." : "إنشاء البوت"}
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-xl shadow-card p-4 text-center">
          <p className="text-lg font-bold">{orgs.length}</p>
          <p className="text-[10px] text-muted-foreground">إجمالي</p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-4 text-center">
          <p className="text-lg font-bold text-primary">{withBot}</p>
          <p className="text-[10px] text-muted-foreground">لديها بوت</p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-4 text-center">
          <p className="text-lg font-bold text-muted-foreground">{orgs.length - withBot}</p>
          <p className="text-[10px] text-muted-foreground">بدون بوت</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." className="h-9 pr-9 text-sm" />
        </div>
        <Button size="sm" variant="outline" onClick={loadData} className="gap-1">
          <RefreshCw className="w-3 h-3" /> تحديث
        </Button>
      </div>

      {/* Org list */}
      <div className="bg-card rounded-xl shadow-card divide-y divide-border">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">لا توجد منظمات</div>
        ) : (
          filtered.map(org => (
            <Collapsible key={org.org_id} open={expandedOrg === org.org_id} onOpenChange={o => setExpandedOrg(o ? org.org_id : null)}>
              <div className="p-3 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{org.org_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {org.has_bot ? (
                      <Badge variant="default" className="text-[10px] gap-1"><CheckCircle2 className="w-3 h-3" /> {org.bot_count} بوت</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] gap-1"><XCircle className="w-3 h-3" /> بدون بوت</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!org.has_template && (
                    <Button size="sm" variant="outline" className="text-xs gap-1" onClick={e => { e.stopPropagation(); setSelectedOrg(org.org_id); }}>
                      <Plus className="w-3 h-3" /> إنشاء قالب
                    </Button>
                  )}
                  {org.has_bot && (
                    <CollapsibleTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                        {expandedOrg === org.org_id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </CollapsibleTrigger>
                  )}
                </div>
              </div>

              {org.has_bot && (
                <CollapsibleContent>
                  <div className="px-3 pb-3 space-y-3">
                    {org.flows.map(flow => {
                      const isEditing = editingFlow === flow.id;

                      return (
                        <div key={flow.id} className="bg-muted/50 rounded-lg p-3 space-y-3">
                          {/* Header */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{flow.name}</p>
                              <p className="text-[10px] text-muted-foreground">{getNodesSummary(flow.nodes)}</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Switch checked={flow.is_active} onCheckedChange={() => toggleFlow(flow.id, flow.is_active)} disabled={togglingFlow === flow.id} className="scale-75" />
                              {!isEditing && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(flow)}>
                                  <Edit className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteFlow(flow.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>

                          {/* Edit mode */}
                          {isEditing ? (
                            <div className="space-y-4 border-t pt-3">
                              {/* Flow name */}
                              <div className="space-y-1">
                                <Label className="text-[10px]">اسم التدفق</Label>
                                <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 text-xs" />
                              </div>

                              {/* Welcome */}
                              <div className="space-y-1">
                                <Label className="text-[10px]">رسالة الترحيب</Label>
                                <Textarea value={editWelcome} onChange={e => setEditWelcome(e.target.value)} className="text-xs min-h-[60px]" placeholder="اختياري..." />
                              </div>

                              {/* Nodes */}
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <Label className="text-[10px] font-semibold">العقد ({editNodes.length})</Label>
                                  <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={addNode}>
                                    <Plus className="w-3 h-3" /> عقدة
                                  </Button>
                                </div>

                                {editNodes.map((node, ni) => (
                                  <div key={node.id} className="bg-background rounded-lg border p-2.5 space-y-2">
                                    <div className="flex items-center gap-2">
                                      <Badge variant={node.type === "action" ? "destructive" : "default"} className="text-[9px]">
                                        {node.type === "action" ? <Zap className="w-2.5 h-2.5 ml-0.5" /> : <MessageSquare className="w-2.5 h-2.5 ml-0.5" />}
                                        {node.type === "action" ? "إجراء" : "رسالة"}
                                      </Badge>
                                      <Input value={node.name} onChange={e => updateNode(node.id, { name: e.target.value })} placeholder="اسم العقدة" className="h-6 text-[10px] flex-1" />
                                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => removeNode(node.id)}>
                                        <X className="w-3 h-3" />
                                      </Button>
                                    </div>

                                    {/* Type select */}
                                    <Select value={node.type} onValueChange={v => updateNode(node.id, { type: v })}>
                                      <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="message">💬 رسالة</SelectItem>
                                        <SelectItem value="action">⚡ إجراء</SelectItem>
                                      </SelectContent>
                                    </Select>

                                    {node.type === "message" ? (
                                      <Textarea value={node.content} onChange={e => updateNode(node.id, { content: e.target.value })} className="text-[10px] min-h-[50px]" placeholder="نص الرسالة..." />
                                    ) : (
                                      <div className="grid grid-cols-2 gap-2">
                                        <Select value={node.action_type || ""} onValueChange={v => updateNode(node.id, { action_type: v })}>
                                          <SelectTrigger className="h-7 text-[10px]"><SelectValue placeholder="نوع الإجراء" /></SelectTrigger>
                                          <SelectContent>
                                            {Object.entries(ACTION_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                                          </SelectContent>
                                        </Select>
                                        <Input value={node.action_value || ""} onChange={e => updateNode(node.id, { action_value: e.target.value })} placeholder="قيمة (اختياري)" className="h-7 text-[10px]" />
                                      </div>
                                    )}

                                    {/* Buttons */}
                                    {node.buttons.length > 0 && (
                                      <div className="space-y-1.5">
                                        {node.buttons.map(btn => (
                                          <div key={btn.id} className="flex items-center gap-1.5">
                                            <Input value={btn.label} onChange={e => updateButton(node.id, btn.id, { label: e.target.value })} placeholder="نص الزر" className="h-6 text-[10px] flex-1" />
                                            <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                                            <Select value={btn.next_node_id} onValueChange={v => updateButton(node.id, btn.id, { next_node_id: v })}>
                                              <SelectTrigger className="h-6 text-[10px] w-28"><SelectValue placeholder="يؤدي إلى..." /></SelectTrigger>
                                              <SelectContent>
                                                {editNodes.filter(n => n.id !== node.id).map(n => (
                                                  <SelectItem key={n.id} value={n.id}>{n.name || n.content?.slice(0, 15) || n.id}</SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => removeButton(node.id, btn.id)}>
                                              <X className="w-3 h-3" />
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {node.type === "message" && (
                                      <Button size="sm" variant="ghost" className="h-5 text-[9px] gap-0.5" onClick={() => addButton(node.id)}>
                                        <Plus className="w-2.5 h-2.5" /> زر
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>

                              {/* Save/Cancel */}
                              <div className="flex items-center gap-2 pt-2 border-t">
                                <Button size="sm" onClick={saveEdit} disabled={savingEdit} className="gap-1 flex-1">
                                  <Save className="w-3.5 h-3.5" /> {savingEdit ? "جاري الحفظ..." : "حفظ التعديلات"}
                                </Button>
                                <Button size="sm" variant="outline" onClick={cancelEdit}>إلغاء</Button>
                              </div>
                            </div>
                          ) : (
                            /* Preview mode */
                            <div className="flex flex-wrap gap-1">
                              {flow.nodes.slice(0, 6).map((node, i) => (
                                <Badge key={i} variant="outline" className="text-[9px] font-normal">
                                  {node.type === "action" ? "⚡" : "💬"} {node.name || (node.content as string)?.slice(0, 15) || "عقدة"}
                                </Badge>
                              ))}
                              {flow.nodes.length > 6 && <Badge variant="outline" className="text-[9px]">+{flow.nodes.length - 6}</Badge>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              )}
            </Collapsible>
          ))
        )}
      </div>

      <ConfirmDialog
        open={!!deleteBotId}
        title="حذف هذا البوت؟"
        confirmLabel="حذف"
        destructive
        onConfirm={confirmDeleteFlow}
        onCancel={() => setDeleteBotId(null)}
      />
    </div>
  );
};

export default AdminBotTemplates;

