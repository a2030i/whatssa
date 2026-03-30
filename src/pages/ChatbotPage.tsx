import { useEffect, useState, useCallback } from "react";
import { Bot, Plus, Trash2, Edit, Save, Loader2, MessageSquare, ArrowRight, Copy, ToggleLeft, GitBranch, ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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

const ChatbotPage = () => {
  const { toast } = useToast();
  const { orgId, user } = useAuth();
  const [flows, setFlows] = useState<ChatbotFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFlow, setEditingFlow] = useState<ChatbotFlow | null>(null);
  const [expandedFlowId, setExpandedFlowId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formTriggerType, setFormTriggerType] = useState("keyword");
  const [formKeywords, setFormKeywords] = useState("");
  const [formWelcome, setFormWelcome] = useState("");
  const [formNodes, setFormNodes] = useState<ChatbotNode[]>([]);

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
        content: "مرحباً! كيف نقدر نساعدك؟",
        buttons: [
          { id: generateId(), label: "تتبع طلب", next_node_id: "" },
          { id: generateId(), label: "استفسار", next_node_id: "" },
          { id: generateId(), label: "تواصل مع موظف", next_node_id: "" },
        ],
      },
    ]);
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

    // Link buttons to nodes
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
        n.id === nodeId
          ? { ...n, buttons: [...n.buttons, { id: generateId(), label: "", next_node_id: "" }] }
          : n
      )
    );
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

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Bot className="w-6 h-6 text-primary" />
            الشات بوت
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            أنشئ تدفقات محادثة تلقائية بأزرار تفاعلية
          </p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />
          تدفق جديد
        </Button>
      </div>

      {flows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <GitBranch className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">لا توجد تدفقات بعد</p>
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
                    <div className="flex items-center gap-2 mb-1">
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
                      {flow.nodes.length} عقدة · {flow.nodes.reduce((acc, n) => acc + n.buttons.length, 0)} زر
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
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

                {/* Flow preview */}
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
                                      <span className="text-muted-foreground truncate max-w-[80px]">
                                        {targetNode.content.slice(0, 20)}...
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingFlow ? "تعديل التدفق" : "تدفق جديد"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Basic info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>اسم التدفق</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="مثال: ترحيب العملاء"
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
              </div>
            </div>

            {formTriggerType === "keyword" && (
              <div>
                <Label>الكلمات المفتاحية (مفصولة بفاصلة)</Label>
                <Input
                  value={formKeywords}
                  onChange={(e) => setFormKeywords(e.target.value)}
                  placeholder="مرحبا، هلا، السلام عليكم"
                />
              </div>
            )}

            <div>
              <Label>رسالة الترحيب (اختياري)</Label>
              <Textarea
                value={formWelcome}
                onChange={(e) => setFormWelcome(e.target.value)}
                placeholder="مرحباً بك في خدمة العملاء!"
                rows={2}
              />
            </div>

            {/* Nodes */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">العقد (الخطوات)</Label>
                <Button type="button" variant="outline" size="sm" onClick={addNode} className="gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  عقدة جديدة
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
                          <SelectTrigger className="w-32 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="message">رسالة</SelectItem>
                            <SelectItem value="action">إجراء</SelectItem>
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
                        <Textarea
                          value={node.content}
                          onChange={(e) => updateNode(node.id, { content: e.target.value })}
                          placeholder="نص الرسالة..."
                          rows={2}
                        />

                        {/* Buttons */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">الأزرار (حد أقصى 3)</Label>
                            {node.buttons.length < 3 && (
                              <Button type="button" variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => addButton(node.id)}>
                                <Plus className="w-3 h-3" />
                                زر
                              </Button>
                            )}
                          </div>
                          {node.buttons.map((btn) => (
                            <div key={btn.id} className="flex items-center gap-2">
                              <Input
                                value={btn.label}
                                onChange={(e) => updateButton(node.id, btn.id, { label: e.target.value })}
                                placeholder="نص الزر"
                                className="h-8 text-sm flex-1"
                              />
                              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                              <Select
                                value={btn.next_node_id || "none"}
                                onValueChange={(val) => updateButton(node.id, btn.id, { next_node_id: val === "none" ? "" : val })}
                              >
                                <SelectTrigger className="w-36 h-8 text-xs">
                                  <SelectValue placeholder="العقدة التالية" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">بدون</SelectItem>
                                  {formNodes
                                    .filter((n) => n.id !== node.id)
                                    .map((n, i) => (
                                      <SelectItem key={n.id} value={n.id}>
                                        عقدة {formNodes.indexOf(n) + 1}: {n.content.slice(0, 15) || "..."}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeButton(node.id, btn.id)}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
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
                          placeholder={node.action_type === "add_tag" ? "اسم الوسم" : "رسالة النظام (اختياري)"}
                          className="h-8 text-sm"
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

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
