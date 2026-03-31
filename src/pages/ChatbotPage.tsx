import { useEffect, useState, useCallback } from "react";
import { Bot, Plus, Trash2, Edit, Save, Loader2, MessageSquare, ArrowRight, Copy, ToggleLeft, GitBranch, ChevronDown, ChevronUp, GripVertical, HelpCircle, Eye, ListOrdered, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import ChannelSelector from "@/components/ChannelSelector";

interface ChatbotNode {
  id: string;
  type: "message" | "action";
  content: string;
  buttons: ChatbotButton[];
  action_type?: "transfer_agent" | "close" | "add_tag";
  action_value?: string;
}

interface ChatbotButton {
  id: string;
  label: string;
  next_node_id: string;
}

interface ChatbotFlow {
  id: string;
  name: string;
  is_active: boolean;
  trigger_type: string;
  trigger_keywords: string[];
  welcome_message: string | null;
  nodes: ChatbotNode[];
}

const generateId = () => crypto.randomUUID().slice(0, 8);

const MAX_BUTTONS_PER_NODE = 20;

const ChatbotPage = () => {
  const { toast } = useToast();
  const { orgId } = useAuth();
  const [flows, setFlows] = useState<ChatbotFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFlow, setEditingFlow] = useState<ChatbotFlow | null>(null);
  const [expandedFlowId, setExpandedFlowId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("basics");

  // Form state
  const [formName, setFormName] = useState("");
  const [formTriggerType, setFormTriggerType] = useState("keyword");
  const [formKeywords, setFormKeywords] = useState("");
  const [formWelcome, setFormWelcome] = useState("");
  const [formNodes, setFormNodes] = useState<ChatbotNode[]>([]);

  // Quick add buttons
  const [quickButtonsText, setQuickButtonsText] = useState("");

  const fetchFlows = useCallback(async () => {
    const { data, error } = await supabase
      .from("chatbot_flows")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching flows:", error);
      setLoading(false);
      return;
    }

    setFlows(
      (data || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        is_active: f.is_active,
        trigger_type: f.trigger_type,
        trigger_keywords: f.trigger_keywords || [],
        welcome_message: f.welcome_message,
        nodes: (f.nodes as ChatbotNode[]) || [],
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  const resetForm = () => {
    setFormName("");
    setFormTriggerType("keyword");
    setFormKeywords("");
    setFormWelcome("");
    setFormNodes([
      {
        id: generateId(),
        type: "message",
        content: "",
        buttons: [],
      },
    ]);
    setQuickButtonsText("");
    setActiveTab("basics");
  };

  const openCreate = () => {
    setEditingFlow(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (flow: ChatbotFlow) => {
    setEditingFlow(flow);
    setFormName(flow.name);
    setFormTriggerType(flow.trigger_type);
    setFormKeywords(flow.trigger_keywords.join("، "));
    setFormWelcome(flow.welcome_message || "");
    setFormNodes(flow.nodes.length > 0 ? flow.nodes : [
      { id: generateId(), type: "message", content: "", buttons: [] },
    ]);
    setActiveTab("basics");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال اسم التدفق", variant: "destructive" });
      return;
    }
    if (!orgId) return;

    const keywords = formKeywords
      .split(/[,،\n]/)
      .map((k) => k.trim())
      .filter(Boolean);

    const linkedNodes = formNodes.map((node) => ({
      ...node,
      buttons: node.buttons.map((btn) => ({
        ...btn,
        next_node_id: btn.next_node_id || "",
      })),
    }));

    const payload = {
      name: formName.trim(),
      org_id: orgId,
      trigger_type: formTriggerType,
      trigger_keywords: keywords,
      welcome_message: formWelcome.trim() || null,
      nodes: linkedNodes as any,
    };

    if (editingFlow) {
      const { error } = await supabase
        .from("chatbot_flows")
        .update(payload)
        .eq("id", editingFlow.id);

      if (error) {
        toast({ title: "خطأ", description: "فشل تحديث التدفق", variant: "destructive" });
        return;
      }
      toast({ title: "تم التحديث" });
    } else {
      const { error } = await supabase
        .from("chatbot_flows")
        .insert(payload);

      if (error) {
        toast({ title: "خطأ", description: "فشل إنشاء التدفق", variant: "destructive" });
        return;
      }
      toast({ title: "تم الإنشاء" });
    }

    setDialogOpen(false);
    fetchFlows();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("chatbot_flows").delete().eq("id", id);
    if (error) {
      toast({ title: "خطأ", description: "فشل حذف التدفق", variant: "destructive" });
      return;
    }
    toast({ title: "تم الحذف" });
    fetchFlows();
  };

  const handleToggle = async (id: string, active: boolean) => {
    await supabase.from("chatbot_flows").update({ is_active: active }).eq("id", id);
    setFlows((prev) => prev.map((f) => (f.id === id ? { ...f, is_active: active } : f)));
  };

  // Node management
  const addNode = () => {
    setFormNodes((prev) => [
      ...prev,
      { id: generateId(), type: "message", content: "", buttons: [] },
    ]);
  };

  const updateNode = (nodeId: string, updates: Partial<ChatbotNode>) => {
    setFormNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, ...updates } : n))
    );
  };

  const removeNode = (nodeId: string) => {
    setFormNodes((prev) => prev.filter((n) => n.id !== nodeId));
  };

  const addButton = (nodeId: string) => {
    setFormNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId && n.buttons.length < MAX_BUTTONS_PER_NODE
          ? { ...n, buttons: [...n.buttons, { id: generateId(), label: "", next_node_id: "" }] }
          : n
      )
    );
  };

  // Quick add multiple buttons from text (one per line)
  const handleQuickAddButtons = (nodeId: string) => {
    const labels = quickButtonsText.split("\n").map(l => l.trim()).filter(Boolean);
    if (labels.length === 0) return;

    setFormNodes((prev) =>
      prev.map((n) => {
        if (n.id !== nodeId) return n;
        const remaining = MAX_BUTTONS_PER_NODE - n.buttons.length;
        const newButtons = labels.slice(0, remaining).map(label => ({
          id: generateId(),
          label,
          next_node_id: "",
        }));
        return { ...n, buttons: [...n.buttons, ...newButtons] };
      })
    );
    setQuickButtonsText("");
    toast({ title: `تم إضافة ${Math.min(labels.length, MAX_BUTTONS_PER_NODE)} زر` });
  };

  const updateButton = (nodeId: string, btnId: string, updates: Partial<ChatbotButton>) => {
    setFormNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? { ...n, buttons: n.buttons.map((b) => (b.id === btnId ? { ...b, ...updates } : b)) }
          : n
      )
    );
  };

  const removeButton = (nodeId: string, btnId: string) => {
    setFormNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? { ...n, buttons: n.buttons.filter((b) => b.id !== btnId) }
          : n
      )
    );
  };

  const TRIGGER_LABELS: Record<string, string> = {
    keyword: "كلمات مفتاحية",
    first_message: "أول رسالة",
    always: "كل الرسائل",
  };

  const NODE_ACTION_LABELS: Record<string, string> = {
    transfer_agent: "تحويل لموظف",
    close: "إغلاق المحادثة",
    add_tag: "إضافة وسم",
  };

  // Chat preview simulator
  const ChatPreview = () => {
    const [currentNodeId, setCurrentNodeId] = useState<string | null>(formNodes[0]?.id || null);
    const [chatHistory, setChatHistory] = useState<{ sender: string; text: string }[]>([]);

    useEffect(() => {
      const msgs: { sender: string; text: string }[] = [];
      if (formWelcome) msgs.push({ sender: "bot", text: formWelcome });
      const firstNode = formNodes[0];
      if (firstNode?.content) msgs.push({ sender: "bot", text: firstNode.content });
      setChatHistory(msgs);
      setCurrentNodeId(firstNode?.id || null);
    }, []);

    const currentNode = formNodes.find(n => n.id === currentNodeId);

    const handleButtonClick = (btn: ChatbotButton) => {
      const newHistory = [...chatHistory, { sender: "user", text: btn.label }];
      const nextNode = formNodes.find(n => n.id === btn.next_node_id);
      if (nextNode) {
        if (nextNode.type === "action") {
          newHistory.push({ sender: "bot", text: `⚡ ${NODE_ACTION_LABELS[nextNode.action_type || ""] || "إجراء"}: ${nextNode.content}` });
        } else {
          newHistory.push({ sender: "bot", text: nextNode.content });
        }
        setChatHistory(newHistory);
        setCurrentNodeId(nextNode.id);
      } else {
        setChatHistory(newHistory);
        setCurrentNodeId(null);
      }
    };

    return (
      <div className="bg-muted/30 rounded-xl border max-w-sm mx-auto overflow-hidden">
        <div className="bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold flex items-center gap-2">
          <Bot className="w-4 h-4" />
          معاينة المحادثة
        </div>
        <div className="p-3 space-y-2 min-h-[200px] max-h-[300px] overflow-y-auto">
          {chatHistory.map((msg, i) => (
            <div key={i} className={cn("flex", msg.sender === "user" ? "justify-start" : "justify-end")}>
              <div className={cn(
                "rounded-xl px-3 py-1.5 text-sm max-w-[80%]",
                msg.sender === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border text-foreground"
              )}>
                {msg.text}
              </div>
            </div>
          ))}
        </div>
        {currentNode && currentNode.buttons.length > 0 && (
          <div className="px-3 pb-3">
            <div className="flex flex-wrap gap-1.5">
              {currentNode.buttons.filter(b => b.label).map(btn => (
                <button
                  key={btn.id}
                  onClick={() => handleButtonClick(btn)}
                  className="text-xs border border-primary text-primary rounded-full px-3 py-1 hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Bot className="w-6 h-6 text-primary" />
            الشات بوت
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            أنشئ ردود تلقائية بأزرار تفاعلية (حتى {MAX_BUTTONS_PER_NODE} زر لكل خطوة)
          </p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />
          تدفق جديد
        </Button>
      </div>

      {/* Help card */}
      <Card className="bg-accent/30 border-accent">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <HelpCircle className="w-5 h-5 text-accent-foreground shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-semibold text-accent-foreground">كيف يعمل الشات بوت؟</p>
              <ol className="list-decimal list-inside text-muted-foreground space-y-0.5 text-xs">
                <li>أنشئ تدفق جديد وحدد <strong>الكلمات المفتاحية</strong> التي تفعّله (مثل: مرحبا، هلا)</li>
                <li>أضف <strong>خطوات</strong> — كل خطوة فيها رسالة نصية + أزرار (حتى {MAX_BUTTONS_PER_NODE} زر)</li>
                <li>اربط كل زر بـ<strong>خطوة تالية</strong> — مثلاً: زر "تتبع طلب" → خطوة تعرض تفاصيل</li>
                <li>استخدم <strong>الإضافة السريعة</strong> لإضافة عدة أزرار دفعة واحدة (كل سطر = زر)</li>
                <li>شاهد <strong>المعاينة الحية</strong> قبل الحفظ للتأكد من التدفق</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {flows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <GitBranch className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">لا توجد تدفقات بعد</p>
            <p className="text-xs text-muted-foreground mt-1">أنشئ أول تدفق وحدد الأزرار التفاعلية</p>
            <Button onClick={openCreate} variant="outline" size="sm" className="mt-4 gap-1.5">
              <Plus className="w-4 h-4" />
              أنشئ أول تدفق
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {flows.map((flow) => (
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
                          <Badge key={i} variant="outline" className="text-[10px] bg-accent/50">
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {flow.nodes.length} خطوة · {flow.nodes.reduce((acc, n) => acc + n.buttons.length, 0)} زر
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 flex-wrap">
                    <Switch
                      checked={flow.is_active}
                      onCheckedChange={(val) => handleToggle(flow.id, val)}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(flow)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(flow.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setExpandedFlowId(expandedFlowId === flow.id ? null : flow.id)}
                    >
                      {expandedFlowId === flow.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {expandedFlowId === flow.id && (
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
                            {node.type === "action" ? NODE_ACTION_LABELS[node.action_type || ""] || "إجراء" : "رسالة"}
                          </span>
                          <Badge variant="outline" className="text-[9px] mr-auto">{node.buttons.length} زر</Badge>
                        </div>
                        <p className="text-sm mb-2">{node.content}</p>
                        {node.buttons.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {node.buttons.map((btn) => {
                              const targetNode = flow.nodes.find((n) => n.id === btn.next_node_id);
                              return (
                                <div key={btn.id} className="flex items-center gap-1 bg-background rounded-md px-2 py-1 border text-xs">
                                  <span>{btn.label}</span>
                                  {targetNode && (
                                    <>
                                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                      <span className="text-muted-foreground truncate max-w-[60px]">
                                        خطوة {flow.nodes.indexOf(targetNode) + 1}
                                      </span>
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

      {/* Create/Edit Dialog - Tabbed for simplicity */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingFlow ? "تعديل التدفق" : "تدفق جديد"}</DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="basics" className="text-xs gap-1">
                <MessageSquare className="w-3 h-3" /> الأساسيات
              </TabsTrigger>
              <TabsTrigger value="steps" className="text-xs gap-1">
                <ListOrdered className="w-3 h-3" /> الخطوات والأزرار
              </TabsTrigger>
              <TabsTrigger value="preview" className="text-xs gap-1">
                <Eye className="w-3 h-3" /> معاينة
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Basics */}
            <TabsContent value="basics" className="space-y-4">
              <div className="space-y-3">
                <div>
                  <Label>اسم التدفق *</Label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="مثال: ترحيب العملاء، قائمة الخدمات..."
                  />
                </div>
                <div>
                  <Label>نوع التفعيل</Label>
                  <Select value={formTriggerType} onValueChange={setFormTriggerType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keyword">كلمات مفتاحية</SelectItem>
                      <SelectItem value="first_message">أول رسالة من العميل</SelectItem>
                      <SelectItem value="always">كل الرسائل</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {formTriggerType === "keyword" && "البوت يرد عندما العميل يرسل أي من الكلمات المفتاحية"}
                    {formTriggerType === "first_message" && "البوت يرد فقط على أول رسالة من العميل"}
                    {formTriggerType === "always" && "البوت يرد على كل رسالة (انتبه: ممكن يتكرر)"}
                  </p>
                </div>

                {formTriggerType === "keyword" && (
                  <div>
                    <Label>الكلمات المفتاحية</Label>
                    <Input
                      value={formKeywords}
                      onChange={(e) => setFormKeywords(e.target.value)}
                      placeholder="مرحبا، هلا، السلام عليكم"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">افصل بين الكلمات بفاصلة</p>
                  </div>
                )}

                <div>
                  <Label>رسالة ترحيب (اختياري)</Label>
                  <Textarea
                    value={formWelcome}
                    onChange={(e) => setFormWelcome(e.target.value)}
                    placeholder="مرحباً بك! 👋 اختر من القائمة التالية:"
                    rows={2}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setActiveTab("steps")}>
                  التالي: الخطوات والأزرار ←
                </Button>
              </div>
            </TabsContent>

            {/* Tab 2: Steps & Buttons */}
            <TabsContent value="steps" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-semibold">الخطوات</Label>
                  <p className="text-[11px] text-muted-foreground">كل خطوة = رسالة يرسلها البوت + أزرار للعميل</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addNode} className="gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  خطوة جديدة
                </Button>
              </div>

              {formNodes.map((node, nodeIdx) => (
                <Card key={node.id} className="border-2 border-dashed">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                          {nodeIdx + 1}
                        </span>
                        <Select
                          value={node.type}
                          onValueChange={(val) => updateNode(node.id, { type: val as any })}
                        >
                          <SelectTrigger className="w-28 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="message">رسالة + أزرار</SelectItem>
                            <SelectItem value="action">إجراء (تحويل/إغلاق)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {formNodes.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeNode(node.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>

                    {node.type === "message" ? (
                      <>
                        <div>
                          <Label className="text-xs">نص الرسالة</Label>
                          <Textarea
                            value={node.content}
                            onChange={(e) => updateNode(node.id, { content: e.target.value })}
                            placeholder="اكتب الرسالة التي يرسلها البوت للعميل..."
                            rows={2}
                          />
                        </div>

                        {/* Buttons section */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">
                              الأزرار ({node.buttons.length}/{MAX_BUTTONS_PER_NODE})
                            </Label>
                            <div className="flex gap-1">
                              {node.buttons.length < MAX_BUTTONS_PER_NODE && (
                                <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px] gap-1" onClick={() => addButton(node.id)}>
                                  <Plus className="w-3 h-3" />
                                  زر
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Existing buttons */}
                          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                            {node.buttons.map((btn, btnIdx) => (
                              <div key={btn.id} className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground w-4 text-center shrink-0">{btnIdx + 1}</span>
                                <Input
                                  value={btn.label}
                                  onChange={(e) => updateButton(node.id, btn.id, { label: e.target.value })}
                                  placeholder="نص الزر"
                                  className="h-7 text-xs flex-1"
                                />
                                <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                                <Select
                                  value={btn.next_node_id || "none"}
                                  onValueChange={(val) => updateButton(node.id, btn.id, { next_node_id: val === "none" ? "" : val })}
                                >
                                  <SelectTrigger className="w-28 h-7 text-[11px]">
                                    <SelectValue placeholder="الخطوة التالية" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">بدون</SelectItem>
                                    {formNodes
                                      .filter((n) => n.id !== node.id)
                                      .map((n) => (
                                        <SelectItem key={n.id} value={n.id}>
                                          خطوة {formNodes.indexOf(n) + 1}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive shrink-0" onClick={() => removeButton(node.id, btn.id)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            ))}
                          </div>

                          {/* Quick add buttons */}
                          {node.buttons.length < MAX_BUTTONS_PER_NODE && (
                            <div className="mt-2 border-t pt-2">
                              <Label className="text-[11px] text-muted-foreground">إضافة سريعة (كل سطر = زر جديد)</Label>
                              <Textarea
                                value={quickButtonsText}
                                onChange={(e) => setQuickButtonsText(e.target.value)}
                                placeholder={"تتبع طلب\nاستفسار\nتواصل مع موظف\nالأسعار\nالفروع"}
                                rows={3}
                                className="text-xs mt-1"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-1.5 text-xs gap-1"
                                onClick={() => handleQuickAddButtons(node.id)}
                                disabled={!quickButtonsText.trim()}
                              >
                                <Plus className="w-3 h-3" />
                                إضافة الأزرار
                              </Button>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <Select
                          value={node.action_type || "transfer_agent"}
                          onValueChange={(val) => updateNode(node.id, { action_type: val as any })}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="transfer_agent">تحويل لموظف</SelectItem>
                            <SelectItem value="close">إغلاق المحادثة</SelectItem>
                            <SelectItem value="add_tag">إضافة وسم</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={node.content}
                          onChange={(e) => updateNode(node.id, { content: e.target.value })}
                          placeholder={node.action_type === "add_tag" ? "اسم الوسم" : "رسالة تظهر للعميل (اختياري)"}
                          className="h-8 text-sm"
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              <div className="flex justify-between">
                <Button variant="outline" size="sm" onClick={() => setActiveTab("basics")}>
                  ← الأساسيات
                </Button>
                <Button variant="outline" size="sm" onClick={() => setActiveTab("preview")}>
                  معاينة ←
                </Button>
              </div>
            </TabsContent>

            {/* Tab 3: Preview */}
            <TabsContent value="preview" className="space-y-4">
              <p className="text-xs text-muted-foreground text-center">اضغط على الأزرار لتجربة التدفق كما سيراه العميل</p>
              <ChatPreview />
              <div className="flex justify-between">
                <Button variant="outline" size="sm" onClick={() => setActiveTab("steps")}>
                  ← الخطوات
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSave} className="gap-1.5">
              <Save className="w-4 h-4" />
              {editingFlow ? "حفظ التعديلات" : "إنشاء التدفق"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatbotPage;
