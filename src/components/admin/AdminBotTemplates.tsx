import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Bot, Search, RefreshCw, Plus, CheckCircle2, XCircle, ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Trash2, Eye } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const generateId = () => crypto.randomUUID().slice(0, 8);

interface BotFlow {
  id: string;
  name: string;
  is_active: boolean;
  trigger_type: string;
  nodes: any[];
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
  {
    key: "customer_service",
    label: "🎯 خدمة عملاء",
    description: "استفسار، تعديل عنوان، شكوى، تحويل لموظف — مع تذاكر وإغلاق تلقائي",
  },
];

function buildCustomerServiceNodes() {
  const inquiryId = generateId();
  const addressId = generateId();
  const complaintId = generateId();
  const agentId = generateId();
  const ticketInquiryId = generateId();
  const ticketAddressId = generateId();
  const ticketComplaintId = generateId();

  return [
    {
      id: generateId(),
      name: "القائمة الرئيسية",
      type: "message",
      content: "أهلاً وسهلاً! 👋\nكيف نقدر نساعدك؟",
      buttons: [
        { id: generateId(), label: "📦 استفسار عن طلب", next_node_id: inquiryId },
        { id: generateId(), label: "🔄 تعديل عنوان", next_node_id: addressId },
        { id: generateId(), label: "📝 شكوى", next_node_id: complaintId },
        { id: generateId(), label: "👤 تحدث مع موظف", next_node_id: agentId },
      ],
    },
    { id: inquiryId, name: "استفسار عن طلب", type: "message", content: "أرسل لنا رقم طلبك وسيتواصل معك الفريق قريباً 📋", buttons: [{ id: generateId(), label: "تم الإرسال ✅", next_node_id: ticketInquiryId }] },
    { id: ticketInquiryId, name: "تذكرة استفسار", type: "action", content: "استفسار عن طلب", buttons: [], action_type: "close_with_ticket", action_value: "استفسار" },
    { id: addressId, name: "تعديل عنوان", type: "message", content: "أرسل لنا رقم الطلب والعنوان الجديد وسنعدّله لك 🔄", buttons: [{ id: generateId(), label: "تم الإرسال ✅", next_node_id: ticketAddressId }] },
    { id: ticketAddressId, name: "تذكرة تعديل عنوان", type: "action", content: "تعديل عنوان شحنة", buttons: [], action_type: "close_with_ticket", action_value: "تعديل عنوان" },
    { id: complaintId, name: "شكوى", type: "message", content: "نأسف لأي إزعاج! اكتب تفاصيل شكواك وسنتابعها فوراً 🙏", buttons: [{ id: generateId(), label: "تم الإرسال ✅", next_node_id: ticketComplaintId }] },
    { id: ticketComplaintId, name: "تذكرة شكوى", type: "action", content: "شكوى عميل", buttons: [], action_type: "close_with_ticket", action_value: "شكوى" },
    { id: agentId, name: "تحويل لموظف", type: "action", content: "جاري تحويلك لأحد الموظفين...", buttons: [], action_type: "transfer_agent" },
  ];
}

const AdminBotTemplates = () => {
  const [orgs, setOrgs] = useState<OrgBotStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedOrg, setSelectedOrg] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("customer_service");
  const [deploying, setDeploying] = useState(false);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [togglingFlow, setTogglingFlow] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [orgRes, flowsRes] = await Promise.all([
      supabase.from("organizations").select("id, name").eq("is_active", true).order("name"),
      supabase.from("chatbot_flows").select("id, org_id, name, is_active, trigger_type, nodes, created_at").order("created_at", { ascending: false }),
    ]);

    const flowsByOrg: Record<string, BotFlow[]> = {};
    (flowsRes.data || []).forEach((f: any) => {
      if (!flowsByOrg[f.org_id]) flowsByOrg[f.org_id] = [];
      flowsByOrg[f.org_id].push({
        id: f.id,
        name: f.name,
        is_active: f.is_active,
        trigger_type: f.trigger_type,
        nodes: (f.nodes as any[]) || [],
        created_at: f.created_at,
      });
    });

    setOrgs((orgRes.data || []).map((o: any) => {
      const flows = flowsByOrg[o.id] || [];
      return {
        org_id: o.id,
        org_name: o.name,
        has_bot: flows.length > 0,
        bot_count: flows.length,
        has_template: flows.some(f => f.name?.includes("قالب جاهز")),
        flows,
      };
    }));
    setLoading(false);
  };

  const deployTemplate = async () => {
    if (!selectedOrg) { toast.error("اختر منظمة"); return; }
    setDeploying(true);

    let nodes: any[] = [];
    if (selectedTemplate === "customer_service") {
      nodes = buildCustomerServiceNodes();
    }

    const { error } = await supabase.from("chatbot_flows").insert({
      name: "🎯 خدمة عملاء (قالب جاهز)",
      org_id: selectedOrg,
      trigger_type: "first_message",
      trigger_keywords: [],
      welcome_message: null,
      nodes,
      channel_ids: [],
      is_active: false,
    } as any);

    if (error) {
      toast.error("فشل إنشاء البوت: " + error.message);
    } else {
      toast.success("✅ تم إنشاء البوت للمنظمة");
      loadData();
    }
    setDeploying(false);
  };

  const toggleFlow = async (flowId: string, currentState: boolean) => {
    setTogglingFlow(flowId);
    const { error } = await supabase
      .from("chatbot_flows")
      .update({ is_active: !currentState } as any)
      .eq("id", flowId);
    if (error) {
      toast.error("فشل التحديث");
    } else {
      setOrgs(prev => prev.map(o => ({
        ...o,
        flows: o.flows.map(f => f.id === flowId ? { ...f, is_active: !currentState } : f),
      })));
    }
    setTogglingFlow(null);
  };

  const deleteFlow = async (flowId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا البوت؟")) return;
    const { error } = await supabase.from("chatbot_flows").delete().eq("id", flowId);
    if (error) {
      toast.error("فشل الحذف");
    } else {
      toast.success("تم الحذف");
      loadData();
    }
  };

  const getNodesSummary = (nodes: any[]) => {
    const messageNodes = nodes.filter(n => n.type === "message");
    const actionNodes = nodes.filter(n => n.type === "action");
    const totalButtons = nodes.reduce((sum, n) => sum + (n.buttons?.length || 0), 0);
    return `${messageNodes.length} رسالة · ${actionNodes.length} إجراء · ${totalButtons} زر`;
  };

  const filtered = orgs.filter(o => o.org_name.toLowerCase().includes(search.toLowerCase()));
  const withBot = orgs.filter(o => o.has_bot).length;

  return (
    <div className="space-y-6">
      <h2 className="font-semibold text-sm flex items-center gap-2">
        <Bot className="w-4 h-4 text-primary" /> قوالب البوت
      </h2>

      {/* Deploy Section */}
      <div className="bg-card rounded-xl shadow-card p-4 space-y-4 border">
        <h3 className="text-sm font-semibold">إنشاء بوت لمنظمة محددة</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">المنظمة</label>
            <Select value={selectedOrg} onValueChange={setSelectedOrg}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر منظمة" /></SelectTrigger>
              <SelectContent>
                {orgs.map(o => (
                  <SelectItem key={o.org_id} value={o.org_id}>
                    {o.org_name} {o.has_template && "✅"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">القالب</label>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TEMPLATES.map(t => (
                  <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={deployTemplate} disabled={!selectedOrg || deploying} className="gap-1.5 w-full">
              <Plus className="w-4 h-4" /> {deploying ? "جاري الإنشاء..." : "إنشاء البوت"}
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">⚠️ البوت يُنشأ معطّل — المنظمة تحتاج تفعّله من صفحة الشات بوت</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-xl shadow-card p-4 text-center">
          <p className="text-lg font-bold">{orgs.length}</p>
          <p className="text-[10px] text-muted-foreground">إجمالي المنظمات</p>
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

      {/* Search & List */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث عن منظمة..." className="h-9 pr-9 text-sm" />
        </div>
        <Button size="sm" variant="outline" onClick={loadData} className="gap-1">
          <RefreshCw className="w-3 h-3" /> تحديث
        </Button>
      </div>

      <div className="bg-card rounded-xl shadow-card divide-y divide-border">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">لا توجد منظمات</div>
        ) : (
          filtered.map(org => (
            <Collapsible
              key={org.org_id}
              open={expandedOrg === org.org_id}
              onOpenChange={(open) => setExpandedOrg(open ? org.org_id : null)}
            >
              <div className="p-3 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{org.org_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {org.has_bot ? (
                      <Badge variant="default" className="text-[10px] gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {org.bot_count} بوت
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <XCircle className="w-3 h-3" /> بدون بوت
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!org.has_template && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedOrg(org.org_id);
                      }}
                    >
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
                  <div className="px-3 pb-3 space-y-2">
                    {org.flows.map(flow => (
                      <div key={flow.id} className="bg-muted/50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">{flow.name}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {getNodesSummary(flow.nodes)} · {flow.trigger_type === "first_message" ? "أول رسالة" : flow.trigger_type === "keyword" ? "كلمة مفتاحية" : flow.trigger_type}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-muted-foreground">{flow.is_active ? "مفعّل" : "معطّل"}</span>
                              <Switch
                                checked={flow.is_active}
                                onCheckedChange={() => toggleFlow(flow.id, flow.is_active)}
                                disabled={togglingFlow === flow.id}
                                className="scale-75"
                              />
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => deleteFlow(flow.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                        {/* Node preview */}
                        <div className="flex flex-wrap gap-1">
                          {flow.nodes.slice(0, 6).map((node: any, i: number) => (
                            <Badge key={i} variant="outline" className="text-[9px] font-normal">
                              {node.type === "action" ? "⚡" : "💬"} {node.name || node.content?.slice(0, 15) || "عقدة"}
                            </Badge>
                          ))}
                          {flow.nodes.length > 6 && (
                            <Badge variant="outline" className="text-[9px] font-normal">+{flow.nodes.length - 6}</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              )}
            </Collapsible>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminBotTemplates;
