import { useState, useEffect } from "react";
import { Tag, Clock, Mail, Phone, StickyNote, MessageSquare, User, Users, Building2, ChevronDown, ChevronUp, Edit3, Plus, X, ExternalLink, Copy, Package, CreditCard, MapPin, Truck, ShoppingBag } from "lucide-react";
import { Conversation } from "@/data/mockData";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import InternalNotes from "./InternalNotes";

interface CustomerInfoPanelProps {
  conversation: Conversation;
  onUpdateNotes: (convId: string, notes: string) => void;
  onAssignAgent?: (convId: string, agentId: string | null, agentName: string) => void;
  onAssignTeam?: (convId: string, teamId: string | null, teamName: string) => void;
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

const CustomerInfoPanel = ({ conversation, onUpdateNotes, onAssignAgent, onAssignTeam }: CustomerInfoPanelProps) => {
  const { orgId } = useAuth();
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

  useEffect(() => {
    setNotes(conversation.notes || "");
    loadCustomer();
    loadOrders();
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
    <div className="w-[280px] border-r border-border bg-card hidden xl:flex flex-col overflow-hidden max-h-full">
      <Tabs defaultValue="info" className="flex flex-col h-full">
        <TabsList className="mx-2 mt-2 mb-0 grid grid-cols-3">
          <TabsTrigger value="info" className="text-xs">معلومات</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs gap-1">
            طلبات
            {orders.length > 0 && (
              <span className="bg-primary/15 text-primary text-[9px] px-1 rounded-full font-bold">{orders.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="notes" className="text-xs">ملاحظات</TabsTrigger>
        </TabsList>

        {/* Info Tab */}
        <TabsContent value="info" className="flex-1 flex flex-col overflow-hidden mt-0 min-h-0">
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

      <div className="overflow-y-auto p-4 space-y-1">
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
        <TabsContent value="orders" className="flex-1 flex flex-col overflow-hidden mt-0">
          <div className="flex-1 overflow-y-auto">
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
        <TabsContent value="notes" className="flex-1 flex flex-col overflow-hidden mt-0">
          <InternalNotes conversationId={conversation.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CustomerInfoPanel;
