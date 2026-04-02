import { useEffect, useState, useCallback, useMemo } from "react";
import { Bot, Plus, Trash2, Edit, Save, Loader2, MessageSquare, ArrowRight, Copy, ToggleLeft, GitBranch, ChevronDown, ChevronUp, HelpCircle, Eye, ListOrdered, Globe, Zap, ArrowLeft, Hash, Tag, RotateCcw, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ───
interface ChatbotButton {
  id: string;
  label: string;
  next_node_id: string;
}

interface ChatbotNode {
  id: string;
  name?: string;
  type: "message" | "action";
  content: string;
  buttons: ChatbotButton[];
  action_type?: "transfer_agent" | "close" | "add_tag";
  action_value?: string;
}

interface ChatbotFlow {
  id: string;
  name: string;
  is_active: boolean;
  trigger_type: string;
  trigger_keywords: string[];
  welcome_message: string | null;
  nodes: ChatbotNode[];
  channel_ids?: string[];
}

interface Channel {
  id: string;
  display_phone_number: string;
  channel_type: string;
  evolution_instance_name: string | null;
  business_name: string | null;
}

interface Team {
  id: string;
  name: string;
}

interface TeamMember {
  id: string;
  full_name: string | null;
  team_id: string | null;
}

const generateId = () => crypto.randomUUID().slice(0, 8);

// Dynamic limits based on channel type
const getMaxButtons = (channelType: "meta_api" | "evolution" | "mixed" | "none") => {
  if (channelType === "meta_api") return 10; // List message max
  if (channelType === "evolution") return 20; // Text-based, flexible
  if (channelType === "mixed") return 10; // Respect stricter limit
  return 20;
};

const getMetaButtonMode = (count: number): "reply_buttons" | "list" | "text" => {
  if (count <= 3) return "reply_buttons";
  if (count <= 10) return "list";
  return "text"; // fallback
};

const TRIGGER_LABELS: Record<string, string> = {
  keyword: "كلمات مفتاحية",
  first_message: "أول رسالة",
  always: "كل الرسائل",
};

const ACTION_LABELS: Record<string, string> = {
  transfer_agent: "تحويل لموظف",
  close: "إغلاق المحادثة",
  add_tag: "إضافة وسم",
};

// ─── Main Component ───
const ChatbotPage = () => {
  const { toast } = useToast();
  const { orgId } = useAuth();

  const [flows, setFlows] = useState<ChatbotFlow[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "edit">("list");
  const [editingFlow, setEditingFlow] = useState<ChatbotFlow | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("keyword");
  const [keywords, setKeywords] = useState("");
  const [welcome, setWelcome] = useState("");
  const [nodes, setNodes] = useState<ChatbotNode[]>([]);
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("basics");

  // Per-node quick add state

  // Computed channel type for the selected channels
  const selectedChannelType = useMemo((): "meta_api" | "evolution" | "mixed" | "none" => {
    if (channelIds.length === 0) return "none";
    const selected = channels.filter(c => channelIds.includes(c.id));
    const hasMeta = selected.some(c => c.channel_type === "meta_api");
    const hasEvolution = selected.some(c => c.channel_type !== "meta_api");
    if (hasMeta && hasEvolution) return "mixed";
    if (hasMeta) return "meta_api";
    if (hasEvolution) return "evolution";
    return "none";
  }, [channelIds, channels]);

  const MAX_BUTTONS = getMaxButtons(selectedChannelType);
  const metaMode = (count: number) => getMetaButtonMode(count);
  const [quickTexts, setQuickTexts] = useState<Record<string, string>>({});

  // ─── Fetch ───
  const fetchFlows = useCallback(async () => {
    const { data } = await supabase
      .from("chatbot_flows")
      .select("*")
      .order("created_at", { ascending: false });

    setFlows(
      (data || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        is_active: f.is_active,
        trigger_type: f.trigger_type,
        trigger_keywords: f.trigger_keywords || [],
        welcome_message: f.welcome_message,
        nodes: (f.nodes as ChatbotNode[]) || [],
        channel_ids: f.channel_ids || [],
      }))
    );
    setLoading(false);
  }, []);

  const fetchChannels = useCallback(async () => {
    if (!orgId) return;
    const { data } = await supabase
      .from("whatsapp_config" as any)
      .select("id, display_phone_number, channel_type, evolution_instance_name, business_name")
      .eq("org_id", orgId)
      .eq("is_connected", true)
      .order("created_at");
    setChannels((data || []) as unknown as Channel[]);
  }, [orgId]);

  const fetchTeamsAndMembers = useCallback(async () => {
    if (!orgId) return;
    const [teamsRes, membersRes] = await Promise.all([
      supabase.from("teams").select("id, name").eq("org_id", orgId).order("name"),
      supabase.from("profiles").select("id, full_name, team_id").eq("org_id", orgId).eq("is_active", true).order("full_name"),
    ]);
    setTeams((teamsRes.data || []) as Team[]);
    setMembers((membersRes.data || []) as TeamMember[]);
  }, [orgId]);

  useEffect(() => {
    fetchFlows();
    fetchChannels();
    fetchTeamsAndMembers();
  }, [fetchFlows, fetchChannels, fetchTeamsAndMembers]);

  // ─── Form Helpers ───
  const resetForm = () => {
    setName("");
    setTriggerType("keyword");
    setKeywords("");
    setWelcome("");
    setNodes([{ id: generateId(), name: "", type: "message", content: "", buttons: [] }]);
    setChannelIds([]);
    setQuickTexts({});
    setActiveTab("basics");
  };

  const openCreate = () => {
    setEditingFlow(null);
    resetForm();
    setView("edit");
  };

  const openEdit = (flow: ChatbotFlow) => {
    setEditingFlow(flow);
    setName(flow.name);
    setTriggerType(flow.trigger_type);
    setKeywords(flow.trigger_keywords.join("، "));
    setWelcome(flow.welcome_message || "");
    setNodes(flow.nodes.length > 0 ? flow.nodes : [{ id: generateId(), name: "", type: "message", content: "", buttons: [] }]);
    setChannelIds(flow.channel_ids || []);
    setQuickTexts({});
    setActiveTab("basics");
    setView("edit");
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "أدخل اسم التدفق", variant: "destructive" });
      return;
    }
    if (channelIds.length === 0 && channels.length > 0) {
      toast({ title: "اختر قناة واحدة على الأقل", variant: "destructive" });
      setActiveTab("basics");
      return;
    }
    if (!orgId) return;

    const kws = keywords.split(/[,،\n]/).map(k => k.trim()).filter(Boolean);
    const payload = {
      name: name.trim(),
      org_id: orgId,
      trigger_type: triggerType,
      trigger_keywords: kws,
      welcome_message: welcome.trim() || null,
      nodes: nodes as any,
      channel_ids: channelIds,
    } as any;

    if (editingFlow) {
      const { error } = await supabase.from("chatbot_flows").update(payload).eq("id", editingFlow.id);
      if (error) { toast({ title: "فشل التحديث", variant: "destructive" }); return; }
      toast({ title: "✅ تم حفظ التعديلات" });
    } else {
      const { error } = await supabase.from("chatbot_flows").insert(payload);
      if (error) { toast({ title: "فشل الإنشاء", variant: "destructive" }); return; }
      toast({ title: "✅ تم إنشاء التدفق" });
    }
    setView("list");
    fetchFlows();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("chatbot_flows").delete().eq("id", id);
    toast({ title: "تم الحذف" });
    fetchFlows();
  };

  const handleToggle = async (id: string, active: boolean) => {
    await supabase.from("chatbot_flows").update({ is_active: active }).eq("id", id);
    setFlows(prev => prev.map(f => f.id === id ? { ...f, is_active: active } : f));
  };

  // ─── Node / Button Management ───
  const addNode = () => {
    setNodes(prev => [...prev, { id: generateId(), name: "", type: "message", content: "", buttons: [] }]);
  };

  const updateNode = (nid: string, u: Partial<ChatbotNode>) => {
    setNodes(prev => prev.map(n => n.id === nid ? { ...n, ...u } : n));
  };

  const removeNode = (nid: string) => {
    setNodes(prev => prev.filter(n => n.id !== nid));
  };

  const addButton = (nid: string) => {
    setNodes(prev => prev.map(n =>
      n.id === nid && n.buttons.length < MAX_BUTTONS
        ? { ...n, buttons: [...n.buttons, { id: generateId(), label: "", next_node_id: "" }] }
        : n
    ));
  };

  const updateButton = (nid: string, bid: string, u: Partial<ChatbotButton>) => {
    setNodes(prev => prev.map(n =>
      n.id === nid
        ? { ...n, buttons: n.buttons.map(b => b.id === bid ? { ...b, ...u } : b) }
        : n
    ));
  };

  const removeButton = (nid: string, bid: string) => {
    setNodes(prev => prev.map(n =>
      n.id === nid ? { ...n, buttons: n.buttons.filter(b => b.id !== bid) } : n
    ));
  };

  const handleQuickAdd = (nid: string) => {
    const text = quickTexts[nid] || "";
    const labels = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (!labels.length) return;

    setNodes(prev => prev.map(n => {
      if (n.id !== nid) return n;
      const remaining = MAX_BUTTONS - n.buttons.length;
      const newBtns = labels.slice(0, remaining).map(label => ({ id: generateId(), label, next_node_id: "" }));
      return { ...n, buttons: [...n.buttons, ...newBtns] };
    }));
    setQuickTexts(prev => ({ ...prev, [nid]: "" }));
    toast({ title: `تم إضافة ${Math.min(labels.length, MAX_BUTTONS)} زر` });
  };

  const toggleChannel = (id: string) => {
    setChannelIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // ─── Chat Preview ───
  const ChatPreview = () => {
    const [curId, setCurId] = useState<string | null>(nodes[0]?.id || null);
    const [history, setHistory] = useState<{ sender: string; text: string }[]>([]);

    const resetPreview = useCallback(() => {
      const msgs: { sender: string; text: string }[] = [];
      if (welcome) msgs.push({ sender: "bot", text: welcome });
      if (nodes[0]?.content) msgs.push({ sender: "bot", text: nodes[0].content });
      setHistory(msgs);
      setCurId(nodes[0]?.id || null);
    }, []);

    useEffect(() => {
      resetPreview();
    }, [resetPreview]);

    const curNode = nodes.find(n => n.id === curId);
    const ended = !curNode || (curNode.buttons.filter(b => b.label).length === 0 && history.length > 0);

    const clickBtn = (btn: ChatbotButton) => {
      const h = [...history, { sender: "user", text: btn.label }];
      const next = nodes.find(n => n.id === btn.next_node_id);
      if (next) {
        h.push({ sender: "bot", text: next.type === "action" ? `⚡ ${ACTION_LABELS[next.action_type || ""]}: ${next.content}` : next.content });
        setHistory(h);
        setCurId(next.id);
      } else {
        h.push({ sender: "bot", text: "— انتهى التدفق —" });
        setHistory(h);
        setCurId(null);
      }
    };

    const visibleBtns = curNode?.buttons.filter(b => b.label) || [];
    const isMeta = selectedChannelType === "meta_api" || selectedChannelType === "mixed";
    const btnMode = isMeta ? metaMode(visibleBtns.length) : "text";

    return (
      <div className="bg-muted/30 rounded-xl border max-w-sm mx-auto overflow-hidden">
        <div className="bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4" />
            معاينة المحادثة
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[9px] bg-primary-foreground/20">
              {isMeta ? (btnMode === "reply_buttons" ? "أزرار تفاعلية" : btnMode === "list" ? "قائمة تفاعلية" : "نص") : "نص مرقّم"}
            </Badge>
            <button onClick={resetPreview} className="hover:bg-primary-foreground/20 rounded-full p-1 transition-colors" title="إعادة المعاينة">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="p-3 space-y-2 min-h-[200px] max-h-[300px] overflow-y-auto">
          {history.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">أضف نص رسالة في الخطوات لتظهر المعاينة</p>
          )}
          {history.map((msg, i) => (
            <div key={i} className={cn("flex", msg.sender === "user" ? "justify-start" : "justify-end")}>
              <div className={cn(
                "rounded-xl px-3 py-1.5 text-sm max-w-[80%] whitespace-pre-wrap",
                msg.sender === "user" ? "bg-primary text-primary-foreground" : "bg-card border"
              )}>
                {msg.text}
              </div>
            </div>
          ))}
          {ended && history.length > 0 && (
            <p className="text-[10px] text-muted-foreground text-center pt-2">— انتهى التدفق — اضغط ↻ للإعادة</p>
          )}
        </div>
        
        {/* Buttons rendering based on channel type */}
        {curNode && visibleBtns.length > 0 && (
          <>
            {/* Meta Reply Buttons (≤3) */}
            {isMeta && btnMode === "reply_buttons" && (
              <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                {visibleBtns.map(btn => (
                  <button
                    key={btn.id}
                    onClick={() => clickBtn(btn)}
                    className="text-xs border border-primary text-primary rounded-full px-3 py-1.5 hover:bg-primary hover:text-primary-foreground transition-colors font-medium"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            )}

            {/* Meta List (4-10) */}
            {isMeta && btnMode === "list" && (
              <div className="border-t">
                <button
                  onClick={() => {
                    const listEl = document.getElementById("preview-list");
                    if (listEl) listEl.classList.toggle("hidden");
                  }}
                  className="w-full py-2.5 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors"
                >
                  📋 عرض القائمة ({visibleBtns.length} خيار)
                </button>
                <div id="preview-list" className="hidden border-t max-h-[200px] overflow-y-auto">
                  {visibleBtns.map(btn => (
                    <button
                      key={btn.id}
                      onClick={() => {
                        clickBtn(btn);
                        document.getElementById("preview-list")?.classList.add("hidden");
                      }}
                      className="w-full text-right px-4 py-3 text-sm hover:bg-accent/50 transition-colors border-b last:border-b-0"
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Text-based (Evolution / fallback) */}
            {!isMeta && (
              <div className="px-3 pb-3">
                <div className="bg-card border rounded-lg p-2.5 space-y-1">
                  {visibleBtns.map((btn, i) => (
                    <button
                      key={btn.id}
                      onClick={() => clickBtn(btn)}
                      className="w-full text-right text-xs hover:bg-accent/50 rounded px-2 py-1.5 transition-colors"
                    >
                      {i + 1}. {btn.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 text-center">العميل يكتب رقم الخيار</p>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // ─── Flow Map (Visual Tree) ───
  const FlowMap = () => {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Network className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold">خريطة التدفق</p>
        </div>
        {welcome && (
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
            <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-1.5 text-xs">
              🎉 ترحيب: {welcome.slice(0, 30)}{welcome.length > 30 ? "…" : ""}
            </div>
          </div>
        )}
        {nodes.map((node, idx) => {
          const linkedFrom = nodes.flatMap(n => n.buttons.filter(b => b.next_node_id === node.id).map(b => ({
            fromStep: nodes.indexOf(n) + 1,
            btnLabel: b.label,
          })));
          return (
            <div key={node.id} className="relative">
              <div className={cn(
                "border-2 rounded-xl p-3 transition-all",
                node.buttons.some(b => b.next_node_id) ? "border-primary/30 bg-primary/5" : "border-border/60 bg-card"
              )}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <span className="text-xs font-medium flex-1 truncate">
                    {node.name?.trim() ? `${node.name}` : (node.type === "action" ? `⚡ ${ACTION_LABELS[node.action_type || ""]}` : (node.content?.slice(0, 25) || "رسالة فارغة"))}{!node.name?.trim() && node.content && node.content.length > 25 ? "…" : ""}
                  </span>
                </div>
                {linkedFrom.length > 0 && (
                  <p className="text-[10px] text-muted-foreground mb-2">
                    ← يصل إليها من: {linkedFrom.map(l => `خطوة ${l.fromStep} (${l.btnLabel})`).join("، ")}
                  </p>
                )}
                {node.buttons.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {node.buttons.map(btn => {
                      const targetIdx = nodes.findIndex(n => n.id === btn.next_node_id);
                      const linked = targetIdx >= 0;
                      const nid = btn.next_node_id || "";
                      const actionLabel = nid === "action:transfer_agent" ? "👤 تحويل لموظف"
                        : nid === "action:close" ? "🔒 إغلاق"
                        : nid.startsWith("team:") ? `👥 ${teams.find(t => t.id === nid.replace("team:", ""))?.name || "فريق"}`
                        : nid.startsWith("agent:") ? `👤 ${members.find(m => m.id === nid.replace("agent:", ""))?.full_name || "موظف"}`
                        : nid.startsWith("flow:") ? `↗ ${flows.find(f => f.id === nid.replace("flow:", ""))?.name || "تدفق"}`
                        : null;
                      const isAction = !!actionLabel;
                      return (
                        <span
                          key={btn.id}
                          className={cn(
                            "text-[10px] rounded-full px-2 py-0.5 border",
                            linked || isAction
                              ? "bg-primary/10 border-primary/30 text-primary" 
                              : "bg-muted border-border text-muted-foreground"
                          )}
                        >
                          {btn.label || "—"} {linked ? `→ خطوة ${targetIdx + 1}${nodes[targetIdx]?.name?.trim() ? ` (${nodes[targetIdx].name})` : ""}` : isAction ? actionLabel : "(⏹)"}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              {idx < nodes.length - 1 && (
                <div className="flex justify-center py-1">
                  <div className="w-px h-4 bg-border" />
                </div>
              )}
            </div>
          );
        })}
        {nodes.length <= 1 && (
          <p className="text-[11px] text-muted-foreground text-center py-2">
            أضف خطوات أكثر لرؤية الترابط بين الأزرار والخطوات
          </p>
        )}
      </div>
    );
  };

  // ─── Loading ───
  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // ═══════════════════════════════════════
  //  EDIT VIEW (full-page, not dialog)
  // ═══════════════════════════════════════
  if (view === "edit") {
    return (
      <div className="p-3 md:p-6 max-w-3xl mx-auto space-y-4" dir="rtl">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setView("list")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-lg font-bold">{editingFlow ? "تعديل التدفق" : "تدفق جديد"}</h1>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="basics" className="text-xs gap-1">
              <MessageSquare className="w-3.5 h-3.5" /> الأساسيات
            </TabsTrigger>
            <TabsTrigger value="steps" className="text-xs gap-1">
              <ListOrdered className="w-3.5 h-3.5" /> الخطوات
            </TabsTrigger>
            <TabsTrigger value="map" className="text-xs gap-1">
              <Network className="w-3.5 h-3.5" /> الخريطة
            </TabsTrigger>
            <TabsTrigger value="preview" className="text-xs gap-1">
              <Eye className="w-3.5 h-3.5" /> معاينة
            </TabsTrigger>
          </TabsList>

          {/* ── Tab: Basics ── */}
          <TabsContent value="basics" className="space-y-4 mt-4">
            <Card>
              <CardContent className="p-4 space-y-4">
                <div>
                  <Label className="text-sm font-medium">اسم التدفق *</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: ترحيب العملاء" className="mt-1" />
                </div>

                <div>
                  <Label className="text-sm font-medium">متى يشتغل البوت؟</Label>
                  <Select value={triggerType} onValueChange={setTriggerType}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keyword">عند إرسال كلمة معينة</SelectItem>
                      <SelectItem value="first_message">أول رسالة من العميل</SelectItem>
                      <SelectItem value="always">كل رسالة (تنبيه: قد يتكرر)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {triggerType === "keyword" && (
                  <div>
                    <Label className="text-sm font-medium">الكلمات التي تفعّل البوت</Label>
                    <Input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="مرحبا، هلا، السلام عليكم" className="mt-1" />
                    <p className="text-[11px] text-muted-foreground mt-1">افصل بين الكلمات بفاصلة — العميل يكتب أي وحدة منها والبوت يرد</p>
                  </div>
                )}

                <div>
                  <Label className="text-sm font-medium">رسالة الترحيب (اختياري)</Label>
                  <Textarea value={welcome} onChange={e => setWelcome(e.target.value)} placeholder="مرحباً بك! 👋 كيف أقدر أساعدك؟" rows={2} className="mt-1" />
                  <p className="text-[11px] text-muted-foreground mt-1">تُرسل قبل أول خطوة — مثل رسالة افتتاحية</p>
                </div>

                {/* Channel Selection - MANDATORY */}
                <div className="border-t pt-4">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Globe className="w-4 h-4" />
                    على أي قناة يشتغل البوت؟ *
                  </Label>
                  {channels.length === 0 ? (
                    <Card className="mt-2 bg-destructive/10 border-destructive/30">
                      <CardContent className="p-3">
                        <p className="text-xs text-destructive">لا توجد قنوات مربوطة — اربط رقم واتساب أولاً من صفحة التكامل</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      <p className="text-[11px] text-muted-foreground mt-1 mb-3">
                        اختر قناة واحدة على الأقل — نوع القناة يحدد شكل الأزرار وحدودها
                      </p>
                      <div className="grid gap-2">
                        {channels.map(ch => {
                          const selected = channelIds.includes(ch.id);
                          const isMeta = ch.channel_type === "meta_api";
                          return (
                            <label
                              key={ch.id}
                              className={cn(
                                "flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all",
                                selected ? "border-primary/40 bg-primary/5" : "border-border/40 hover:border-border"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleChannel(ch.id)}
                                className="accent-primary w-4 h-4"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {ch.business_name || ch.display_phone_number || ch.evolution_instance_name || "قناة"}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {ch.display_phone_number || ch.evolution_instance_name}
                                </p>
                              </div>
                              <Badge variant={isMeta ? "default" : "secondary"} className="text-[10px] shrink-0">
                                {isMeta ? "رسمي" : "ويب"}
                              </Badge>
                            </label>
                          );
                        })}
                      </div>

                      {/* Channel type info */}
                      {channelIds.length > 0 && (
                        <Card className={cn("mt-3", selectedChannelType === "meta_api" ? "bg-primary/5 border-primary/20" : selectedChannelType === "mixed" ? "bg-warning/10 border-warning/30" : "bg-secondary/50")}>
                          <CardContent className="p-3">
                            {selectedChannelType === "meta_api" && (
                              <div className="text-xs space-y-1">
                                <p className="font-semibold text-primary">✅ واتساب رسمي — أزرار تفاعلية مدعومة</p>
                                <p className="text-muted-foreground">• 1-3 أزرار → أزرار Reply تفاعلية</p>
                                <p className="text-muted-foreground">• 4-10 أزرار → قائمة تفاعلية (List)</p>
                              </div>
                            )}
                            {selectedChannelType === "evolution" && (
                              <div className="text-xs space-y-1">
                                <p className="font-semibold">📱 واتساب ويب — نص مرقّم</p>
                                <p className="text-muted-foreground">الأزرار تُرسل كنص مرقّم (1، 2، 3...) والعميل يكتب رقم الخيار</p>
                              </div>
                            )}
                            {selectedChannelType === "mixed" && (
                              <div className="text-xs space-y-1">
                                <p className="font-semibold text-warning-foreground">⚠️ قنوات مختلطة</p>
                                <p className="text-muted-foreground">سيتم إرسال أزرار تفاعلية للرسمي ونص مرقّم للويب — الحد الأقصى 10 أزرار</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  if (channelIds.length === 0 && channels.length > 0) {
                    toast({ title: "اختر قناة واحدة على الأقل أولاً", variant: "destructive" });
                    return;
                  }
                  setActiveTab("steps");
                }} 
                className="gap-1"
              >
                التالي: الخطوات والأزرار
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </TabsContent>

          {/* ── Tab: Steps & Buttons ── */}
          <TabsContent value="steps" className="space-y-4 mt-4">
            {/* Explanation */}
            {nodes.length <= 1 && (
              <Card className="bg-warning/10 border-warning/30">
                <CardContent className="p-3">
                  <p className="text-xs text-warning-foreground leading-relaxed">
                    ⚠️ <strong>لربط الأزرار بخطوات:</strong> أضف أكثر من خطوة واحدة أولاً باستخدام زر "خطوة جديدة"، ثم اربط كل زر بالخطوة المناسبة من القائمة المنسدلة.
                  </p>
                </CardContent>
              </Card>
            )}
            {/* Channel-specific info banner */}
            {channelIds.length > 0 && (
              <Card className={cn(
                selectedChannelType === "meta_api" ? "bg-primary/5 border-primary/20" : "bg-secondary/50 border-border/40"
              )}>
                <CardContent className="p-2.5">
                  <p className="text-[11px] font-medium">
                    {selectedChannelType === "meta_api" 
                      ? `✅ رسمي — ${MAX_BUTTONS} أزرار كحد أقصى (1-3: أزرار تفاعلية، 4-10: قائمة)`
                      : selectedChannelType === "evolution"
                      ? `📱 ويب — حتى ${MAX_BUTTONS} زر (ترسل كنص مرقّم)`
                      : `⚠️ مختلط — حتى ${MAX_BUTTONS} أزرار (تفاعلية للرسمي، نص للويب)`
                    }
                  </p>
                </CardContent>
              </Card>
            )}

            <Card className="bg-accent/30 border-accent/50">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">كل خطوة = رسالة يرسلها البوت + أزرار للعميل.</strong>
                  <br />
                  الزر ممكن يوصل لخطوة ثانية، تدفق آخر، تحويل لفريق/موظف، أو "بدون" = البوت يتوقف.
                </p>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">الخطوات</p>
              <Button type="button" variant="outline" size="sm" onClick={addNode} className="gap-1 text-xs">
                <Plus className="w-3.5 h-3.5" />
                خطوة جديدة
              </Button>
            </div>

            {nodes.map((node, idx) => (
              <Card key={node.id} className="border-2 border-dashed border-border/60">
                <CardContent className="p-4 space-y-3">
                  {/* Node header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <Select value={node.type} onValueChange={val => updateNode(node.id, { type: val as any })}>
                        <SelectTrigger className="w-36 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="message">رسالة + أزرار</SelectItem>
                          <SelectItem value="action">إجراء (تحويل/إغلاق)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {nodes.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeNode(node.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Step name */}
                  <div>
                    <Label className="text-xs font-medium">اسم الخطوة (للتنظيم)</Label>
                    <Input
                      value={node.name || ""}
                      onChange={e => updateNode(node.id, { name: e.target.value })}
                      placeholder={`مثال: القائمة الرئيسية، الفروع، الأسعار...`}
                      className="h-8 text-xs mt-1"
                    />
                  </div>

                  {node.type === "message" ? (
                    <>
                      {/* Message text */}
                      <div>
                        <Label className="text-xs font-medium">نص الرسالة</Label>
                        <Textarea
                          value={node.content}
                          onChange={e => updateNode(node.id, { content: e.target.value })}
                          placeholder="اكتب الرسالة التي يرسلها البوت للعميل..."
                          rows={3}
                          className="mt-1"
                        />
                      </div>

                      {/* Buttons list */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">
                              الأزرار ({node.buttons.length}/{MAX_BUTTONS})
                            </Label>
                            {selectedChannelType === "meta_api" && node.buttons.length > 0 && (
                              <Badge variant="outline" className="text-[9px]">
                                {node.buttons.length <= 3 ? "أزرار تفاعلية" : "قائمة تفاعلية"}
                              </Badge>
                            )}
                          </div>
                          {node.buttons.length < MAX_BUTTONS && (
                            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => addButton(node.id)}>
                              <Plus className="w-3 h-3" /> زر جديد
                            </Button>
                          )}
                        </div>

                        <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
                          {node.buttons.map((btn, bi) => (
                            <div key={btn.id} className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground w-4 text-center shrink-0">{bi + 1}</span>
                              <Input
                                value={btn.label}
                                onChange={e => updateButton(node.id, btn.id, { label: e.target.value })}
                                placeholder="نص الزر"
                                className="h-8 text-xs flex-1"
                              />
                              <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                              <Select
                                value={btn.next_node_id || "none"}
                                onValueChange={val => updateButton(node.id, btn.id, { next_node_id: val === "none" ? "" : val })}
                              >
                                <SelectTrigger className={cn("w-32 h-8 text-[11px]", nodes.length <= 1 && "opacity-50")}>
                                  <SelectValue placeholder="بدون" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">⏹ بدون (يتوقف)</SelectItem>
                                  
                                  {/* Actions */}
                                  <div className="px-2 py-1.5 text-[10px] text-muted-foreground font-semibold border-t mt-1 pt-1.5">
                                    ⚡ إجراءات
                                  </div>
                                  <SelectItem value="action:transfer_agent">👤 تحويل لأي موظف متاح</SelectItem>
                                  <SelectItem value="action:close">🔒 إغلاق المحادثة</SelectItem>
                                  
                                  {/* Teams */}
                                  {teams.length > 0 && (
                                    <>
                                      <div className="px-2 py-1.5 text-[10px] text-muted-foreground font-semibold border-t mt-1 pt-1.5">
                                        👥 تحويل لفريق
                                      </div>
                                      {teams.map(t => (
                                        <SelectItem key={`team:${t.id}`} value={`team:${t.id}`}>
                                          👥 {t.name}
                                        </SelectItem>
                                      ))}
                                    </>
                                  )}

                                  {/* Individual agents */}
                                  {members.length > 0 && (
                                    <>
                                      <div className="px-2 py-1.5 text-[10px] text-muted-foreground font-semibold border-t mt-1 pt-1.5">
                                        👤 تحويل لموظف محدد
                                      </div>
                                      {members.map(m => (
                                        <SelectItem key={`agent:${m.id}`} value={`agent:${m.id}`}>
                                          👤 {m.full_name || "بدون اسم"}
                                        </SelectItem>
                                      ))}
                                    </>
                                  )}

                                  {/* Steps in this flow */}
                                  {nodes.filter(n => n.id !== node.id).length > 0 && (
                                    <>
                                      <div className="px-2 py-1.5 text-[10px] text-muted-foreground font-semibold border-t mt-1 pt-1.5">
                                        📋 خطوات التدفق
                                      </div>
                                      {nodes.filter(n => n.id !== node.id).map((n) => {
                                        const stepNum = nodes.indexOf(n) + 1;
                                        const label = n.name?.trim() 
                                          ? n.name 
                                          : n.type === "action" 
                                            ? (ACTION_LABELS[n.action_type || ""] || "إجراء")
                                            : (n.content?.slice(0, 15) || "رسالة فارغة");
                                        return (
                                          <SelectItem key={n.id} value={n.id}>
                                            خطوة {stepNum}: {label}{!n.name?.trim() && n.content && n.content.length > 15 ? "…" : ""}
                                          </SelectItem>
                                        );
                                      })}
                                    </>
                                  )}

                                  {/* Cross-flow linking */}
                                  {flows.filter(f => f.id !== editingFlow?.id).length > 0 && (
                                    <>
                                      <div className="px-2 py-1.5 text-[10px] text-muted-foreground font-semibold border-t mt-1 pt-1.5">
                                        ↗ تدفقات أخرى
                                      </div>
                                      {flows.filter(f => f.id !== editingFlow?.id).map(f => (
                                        <SelectItem key={`flow:${f.id}`} value={`flow:${f.id}`}>
                                          ↗ {f.name}
                                        </SelectItem>
                                      ))}
                                    </>
                                  )}
                                </SelectContent>
                              </Select>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeButton(node.id, btn.id)}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                        </div>

                        {/* Quick add - per node */}
                        {node.buttons.length < MAX_BUTTONS && (
                          <div className="border-t border-dashed pt-3 mt-2">
                            <Label className="text-[11px] text-muted-foreground">إضافة سريعة (كل سطر = زر جديد)</Label>
                            <Textarea
                              value={quickTexts[node.id] || ""}
                              onChange={e => setQuickTexts(prev => ({ ...prev, [node.id]: e.target.value }))}
                              placeholder={"مواقع الفروع\nسياسة إيقاف الاشتراك\nتتبع طلب\nتواصل مع موظف"}
                              rows={3}
                              className="text-xs mt-1"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="mt-1.5 text-xs gap-1"
                              onClick={() => handleQuickAdd(node.id)}
                              disabled={!(quickTexts[node.id] || "").trim()}
                            >
                              <Plus className="w-3 h-3" />
                              إضافة الأزرار
                            </Button>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    /* Action node */
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs font-medium">نوع الإجراء</Label>
                        <Select
                          value={node.action_type || "transfer_agent"}
                          onValueChange={val => updateNode(node.id, { action_type: val as any })}
                        >
                          <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="transfer_agent">تحويل المحادثة لموظف</SelectItem>
                            <SelectItem value="close">إغلاق المحادثة تلقائياً</SelectItem>
                            <SelectItem value="add_tag">إضافة وسم للمحادثة</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Input
                        value={node.content}
                        onChange={e => updateNode(node.id, { content: e.target.value })}
                        placeholder={node.action_type === "add_tag" ? "اسم الوسم" : "رسالة للعميل (اختياري)"}
                        className="h-8 text-sm"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {/* Navigation */}
            <div className="flex justify-between">
              <Button variant="outline" size="sm" onClick={() => setActiveTab("basics")} className="gap-1 text-xs">
                <ArrowLeft className="w-3.5 h-3.5" /> الأساسيات
              </Button>
              <Button variant="outline" size="sm" onClick={() => setActiveTab("map")} className="gap-1 text-xs">
                الخريطة <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </TabsContent>

          {/* ── Tab: Flow Map ── */}
          <TabsContent value="map" className="space-y-4 mt-4">
            <FlowMap />
            <div className="flex justify-between">
              <Button variant="outline" size="sm" onClick={() => setActiveTab("steps")} className="gap-1 text-xs">
                <ArrowLeft className="w-3.5 h-3.5" /> الخطوات
              </Button>
              <Button variant="outline" size="sm" onClick={() => setActiveTab("preview")} className="gap-1 text-xs">
                معاينة <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </TabsContent>

          {/* ── Tab: Preview ── */}
          <TabsContent value="preview" className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground text-center">اضغط على الأزرار لتجربة التدفق كما سيراه العميل في واتساب</p>
            <ChatPreview />
            <div className="flex justify-start">
              <Button variant="outline" size="sm" onClick={() => setActiveTab("map")} className="gap-1 text-xs">
                <ArrowLeft className="w-3.5 h-3.5" /> الخريطة
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* Action buttons - always visible */}
        <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t pt-3 pb-4 -mx-3 px-3 md:-mx-6 md:px-6 flex gap-2">
          <Button onClick={handleSave} className="flex-1 gap-1.5">
            <Save className="w-4 h-4" />
            {editingFlow ? "حفظ التعديلات" : "إنشاء التدفق"}
          </Button>
          <Button variant="outline" onClick={() => setView("list")}>
            إلغاء
          </Button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  //  LIST VIEW
  // ═══════════════════════════════════════
  return (
    <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Bot className="w-6 h-6 text-primary" />
            الشات بوت
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ردود تلقائية بأزرار تفاعلية — العميل يضغط والبوت يرد
          </p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />
          تدفق جديد
        </Button>
      </div>

      {/* How it works - concise */}
      <Card className="bg-accent/20 border-accent/40">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <HelpCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="text-xs space-y-1 text-muted-foreground">
              <p className="font-semibold text-foreground text-sm">كيف يعمل؟</p>
              <p>١. أنشئ تدفق وحدد <strong>الكلمة</strong> اللي تفعّله (مثل: مرحبا)</p>
              <p>٢. أضف <strong>خطوات</strong> — كل خطوة فيها رسالة + أزرار</p>
              <p>٣. اربط كل زر بـ<strong>خطوة ثانية</strong> أو خلّه "بدون" يتوقف البوت</p>
              <p>٤. <strong>الإضافة السريعة</strong>: الصق قائمة الأزرار (كل سطر = زر)</p>
              <p>٥. اختر <strong>القناة</strong> (رسمي/ويب) أو خلّه يعمل على الكل</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Flow list */}
      {flows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <GitBranch className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">لا توجد تدفقات بعد</p>
            <Button onClick={openCreate} variant="outline" size="sm" className="mt-4 gap-1.5">
              <Plus className="w-4 h-4" /> أنشئ أول تدفق
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {flows.map(flow => (
            <Card key={flow.id} className={cn(!flow.is_active && "opacity-60")}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-sm">{flow.name}</h3>
                      <Badge variant="outline" className="text-[10px]">
                        {TRIGGER_LABELS[flow.trigger_type] || flow.trigger_type}
                      </Badge>
                      <Badge variant={flow.is_active ? "default" : "secondary"} className="text-[10px]">
                        {flow.is_active ? "مفعّل" : "معطّل"}
                      </Badge>
                    </div>
                    {flow.trigger_keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {flow.trigger_keywords.map((kw, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] bg-accent/50">{kw}</Badge>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {flow.nodes.length} خطوة · {flow.nodes.reduce((a, n) => a + n.buttons.length, 0)} زر
                      {flow.channel_ids && flow.channel_ids.length > 0 && ` · ${flow.channel_ids.length} قناة`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch checked={flow.is_active} onCheckedChange={v => handleToggle(flow.id, v)} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(flow)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(flow.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpandedId(expandedId === flow.id ? null : flow.id)}>
                      {expandedId === flow.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {expandedId === flow.id && (
                  <div className="mt-4 border-t pt-4 space-y-3">
                    {flow.welcome_message && (
                      <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
                        <p className="text-xs font-medium text-primary mb-1">رسالة الترحيب</p>
                        <p className="text-sm">{flow.welcome_message}</p>
                      </div>
                    )}
                    {flow.nodes.map((node, idx) => (
                      <div key={node.id} className="bg-secondary/30 rounded-lg p-3 border">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-medium">
                            {node.name?.trim() ? node.name : (node.type === "action" ? ACTION_LABELS[node.action_type || ""] || "إجراء" : "رسالة")}
                          </span>
                          <Badge variant="outline" className="text-[9px] mr-auto">{node.buttons.length} زر</Badge>
                        </div>
                        <p className="text-sm mb-2 whitespace-pre-wrap">{node.content}</p>
                        {node.buttons.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {node.buttons.map(btn => {
                              const target = flow.nodes.find(n => n.id === btn.next_node_id);
                              return (
                                <div key={btn.id} className="flex items-center gap-1 bg-background rounded-md px-2 py-1 border text-xs">
                                  <span>{btn.label}</span>
                                  {target && (
                                    <>
                                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                      <span className="text-muted-foreground">خطوة {flow.nodes.indexOf(target) + 1}</span>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChatbotPage;
