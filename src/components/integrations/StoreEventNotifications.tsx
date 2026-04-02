import { useState, useEffect } from "react";
import {
  Bell, MessageSquare, Loader2, Save, ChevronDown, ChevronUp,
  Smartphone, FileText, Info, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase, invokeCloud } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Props {
  storeId: string;
  currentMetadata: any;
  onSaved: () => void;
}

interface EventNotifConfig {
  enabled: boolean;
  channel_id: string;
  template_name?: string;
  template_language?: string;
  message_text?: string;
}

interface MetaTemplate {
  name: string;
  language: string;
  status: string;
  category: string;
}

interface ChannelOption {
  id: string;
  label: string;
  type: "meta_api" | "evolution";
  is_connected: boolean;
}

// ── الأحداث المتاحة فعلياً في لوحة تاجر سلة ──
const STORE_EVENTS = [
  // ── السلات المتروكة ──
  {
    key: "abandoned.cart",
    label: "سلة متروكة",
    icon: "🛒",
    description: "تذكير العميل بإتمام الشراء",
    sallaLabel: "انشاء سلة مشتريات متروكة",
    benefit: "استرداد المبيعات المفقودة بإرسال تذكير تلقائي للعميل",
    category: "cart",
  },
  {
    key: "abandoned.cart.purchased",
    label: "شراء سلة متروكة",
    icon: "✅",
    description: "عند إتمام شراء سلة كانت متروكة",
    sallaLabel: "شراء سلة متروكة",
    benefit: "تتبع نجاح حملات استرداد السلات المتروكة",
    category: "cart",
  },

  // ── الشحنات ──
  {
    key: "shipment.creating",
    label: "طلب إنشاء شحنة",
    icon: "📋",
    description: "عند بدء إنشاء شحنة للطلب",
    sallaLabel: "طلب إنشاء شحنة",
    benefit: "إشعار العميل أن طلبه قيد التجهيز للشحن",
    category: "shipment",
  },
  {
    key: "shipment.created",
    label: "تم إنشاء شحنة",
    icon: "📦",
    description: "عند تأكيد إنشاء الشحنة مع رقم التتبع",
    sallaLabel: "تم إنشاء شحنة",
    benefit: "إرسال رقم التتبع للعميل تلقائياً عبر واتساب",
    category: "shipment",
  },
  {
    key: "shipment.updated",
    label: "تحديث شحنة",
    icon: "🔄",
    description: "عند تحديث حالة الشحنة",
    sallaLabel: "تم تحديث شحنة",
    benefit: "إبقاء العميل على اطلاع بآخر تحديثات شحنته",
    category: "shipment",
  },
  {
    key: "shipment.cancelled",
    label: "إلغاء شحنة",
    icon: "🚫",
    description: "عند إلغاء الشحنة",
    sallaLabel: "تم إلغاء شحنة",
    benefit: "إشعار العميل بإلغاء الشحنة وإعادة ترتيب الموقف",
    category: "shipment",
  },

  // ── الفاتورة (بديل عن أحداث الطلبات) ──
  {
    key: "invoice.created",
    label: "فاتورة طلب جديد",
    icon: "🧾",
    description: "عند إنشاء فاتورة لطلب (يعمل كبديل لحدث طلب جديد)",
    sallaLabel: "انشاء فاتورة طلب",
    benefit: "⭐ أفضل بديل لتتبع الطلبات الجديدة — أرسل تأكيد فوري للعميل",
    category: "order",
  },

  // ── العملاء ──
  {
    key: "customer.created",
    label: "عميل جديد",
    icon: "👤",
    description: "عند تسجيل عميل جديد في المتجر",
    sallaLabel: "تمت إضافة عميل",
    benefit: "إرسال رسالة ترحيب تلقائية لبناء علاقة مع العميل",
    category: "customer",
  },
  {
    key: "customer.updated",
    label: "تحديث بيانات عميل",
    icon: "📝",
    description: "عند تعديل بيانات العميل",
    sallaLabel: "تم تحديث بيانات عميل",
    benefit: "مزامنة بيانات العميل تلقائياً مع نظام CRM",
    category: "customer",
  },

  // ── المنتجات ──
  {
    key: "product.created",
    label: "منتج جديد",
    icon: "🆕",
    description: "عند إضافة منتج جديد للمتجر",
    sallaLabel: "تم إنشاء منتج",
    benefit: "مزامنة كتالوج المنتجات تلقائياً",
    category: "product",
  },
  {
    key: "product.updated",
    label: "تحديث منتج",
    icon: "✏️",
    description: "عند تعديل بيانات المنتج",
    sallaLabel: "تم تحديث بيانات منتج",
    benefit: "تحديث بيانات المنتج في النظام تلقائياً",
    category: "product",
  },
  {
    key: "product.deleted",
    label: "حذف منتج",
    icon: "🗑️",
    description: "عند حذف منتج من المتجر",
    sallaLabel: "تم حذف منتج",
    benefit: "إلغاء تفعيل المنتج تلقائياً في النظام",
    category: "product",
  },
  {
    key: "product.price.updated",
    label: "تحديث سعر منتج",
    icon: "💰",
    description: "عند تغيير سعر المنتج",
    sallaLabel: "تم تحديث سعر المنتج",
    benefit: "تحديث الأسعار تلقائياً في الكتالوج",
    category: "product",
  },
  {
    key: "product.quantity.low",
    label: "قرب نفاذ المخزون",
    icon: "⚠️",
    description: "عند قرب نفاذ كمية المنتج",
    sallaLabel: "قرب نفاذ كمية منتج",
    benefit: "تنبيه فريق العمل لإعادة تعبئة المخزون",
    category: "product",
  },
  {
    key: "product.available",
    label: "المنتج متاح",
    icon: "✅",
    description: "عند توفر المنتج مرة أخرى",
    sallaLabel: "المنتج متاح",
    benefit: "إشعار العملاء المهتمين بتوفر المنتج",
    category: "product",
  },

  // ── أحداث إضافية ──
  {
    key: "coupon.applied",
    label: "تطبيق كوبون",
    icon: "🏷️",
    description: "عند استخدام كوبون خصم",
    sallaLabel: "تطبيق كوبون خصم",
    benefit: "تتبع استخدام الكوبونات وقياس فعالية العروض",
    category: "other",
  },
  {
    key: "review.added",
    label: "تقييم جديد",
    icon: "⭐",
    description: "عند إضافة تقييم جديد لمنتج",
    sallaLabel: "إضافة تقييم جديد",
    benefit: "مراقبة تقييمات العملاء والرد السريع",
    category: "other",
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  order: "🧾 الطلبات والفواتير",
  cart: "🛒 السلات المتروكة",
  shipment: "🚚 الشحنات",
  customer: "👤 العملاء",
  product: "📦 المنتجات",
  other: "🏷️ أخرى",
};

const VARIABLE_HINTS: Record<string, string[]> = {
  "abandoned.cart": ["{{customer_name}}", "{{total}}", "{{currency}}", "{{checkout_url}}", "{{items_summary}}"],
  "abandoned.cart.purchased": ["{{customer_name}}", "{{total}}", "{{currency}}"],
  "shipment.creating": ["{{customer_name}}", "{{order_number}}"],
  "shipment.created": ["{{customer_name}}", "{{order_number}}", "{{tracking_number}}", "{{shipping_company}}"],
  "shipment.updated": ["{{customer_name}}", "{{order_number}}", "{{tracking_number}}", "{{status}}"],
  "shipment.cancelled": ["{{customer_name}}", "{{order_number}}"],
  "invoice.created": ["{{customer_name}}", "{{order_number}}", "{{total}}", "{{currency}}"],
  "customer.created": ["{{customer_name}}"],
  "customer.updated": ["{{customer_name}}"],
  "product.created": ["{{product_name}}", "{{price}}", "{{currency}}"],
  "product.updated": ["{{product_name}}", "{{price}}"],
  "product.deleted": ["{{product_name}}"],
  "product.price.updated": ["{{product_name}}", "{{price}}", "{{currency}}"],
  "product.quantity.low": ["{{product_name}}", "{{quantity}}"],
  "product.available": ["{{product_name}}", "{{price}}"],
  "coupon.applied": ["{{customer_name}}", "{{coupon_code}}"],
  "review.added": ["{{customer_name}}", "{{product_name}}", "{{rating}}"],
};

const StoreEventNotifications = ({ storeId, currentMetadata, onSaved }: Props) => {
  const { orgId, hasMetaApi } = useAuth();
  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [configs, setConfigs] = useState<Record<string, EventNotifConfig>>({});
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  useEffect(() => {
    if (open) {
      loadChannels();
      loadConfigs();
    }
  }, [open]);

  useEffect(() => {
    const hasMetaChannel = channels.some((c) => c.type === "meta_api");
    if (hasMetaChannel && templates.length === 0 && !loadingTemplates) {
      fetchTemplates();
    }
  }, [channels]);

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await invokeCloud("whatsapp-templates", {
        body: { action: "list" },
      });
      if (res.data?.templates) {
        setTemplates(
          (res.data.templates as any[])
            .filter((t: any) => t.status === "APPROVED")
            .map((t: any) => ({
              name: t.name,
              language: t.language,
              status: t.status,
              category: t.category,
            }))
        );
      }
    } catch {
      // silent
    } finally {
      setLoadingTemplates(false);
    }
  };

  const loadChannels = async () => {
    if (!orgId) return;
    const { data } = await supabase
      .from("whatsapp_config_safe")
      .select("id, display_phone, business_name, channel_type, is_connected, evolution_instance_name")
      .eq("org_id", orgId)
      .eq("is_connected", true);

    const opts: ChannelOption[] = (data || []).map((c: any) => ({
      id: c.id,
      label: c.display_phone || c.business_name || c.evolution_instance_name || "قناة",
      type: c.channel_type === "evolution" ? "evolution" : "meta_api",
      is_connected: !!c.is_connected,
    }));
    setChannels(opts);
  };

  const loadConfigs = () => {
    const notifs = currentMetadata?.event_notifications || {};
    setConfigs(notifs);
    setLoading(false);
  };

  const updateEventConfig = (eventKey: string, updates: Partial<EventNotifConfig>) => {
    setConfigs((prev) => ({
      ...prev,
      [eventKey]: { ...(prev[eventKey] || { enabled: false, channel_id: "" }), ...updates },
    }));
  };

  const getChannelType = (channelId: string): "meta_api" | "evolution" | null => {
    return channels.find((c) => c.id === channelId)?.type || null;
  };

  const handleSave = async () => {
    setSaving(true);
    const newMetadata = { ...currentMetadata, event_notifications: configs };
    const { error } = await supabase
      .from("store_integrations")
      .update({ metadata: newMetadata } as any)
      .eq("id", storeId);

    if (error) {
      toast.error("فشل حفظ الإعدادات");
    } else {
      toast.success("تم حفظ إعدادات الإشعارات");
      onSaved();
    }
    setSaving(false);
  };

  const enabledCount = Object.values(configs).filter((c) => c.enabled).length;

  // Group events by category
  const categories = ["order", "cart", "shipment", "customer", "product", "other"];
  const groupedEvents = categories.map((cat) => ({
    key: cat,
    label: CATEGORY_LABELS[cat],
    events: STORE_EVENTS.filter((e) => e.category === cat),
  })).filter((g) => g.events.length > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs h-7 gap-1.5">
          <Bell className="w-3 h-3" />
          إشعارات الأحداث
          {enabledCount > 0 && (
            <Badge className="bg-primary/10 text-primary border-0 text-[9px] px-1 h-4 mr-0.5">
              {enabledCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto p-0" dir="rtl">
        <DialogHeader className="p-4 pb-2 sticky top-0 bg-background z-10 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bell className="w-4 h-4 text-primary" />
            إشعارات أحداث المتجر
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            فعّل الأحداث وحدد القناة والقالب أو الرسالة لكل حدث
          </p>
        </DialogHeader>

        {/* Info Banner */}
        <div className="mx-4 mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-[10px] text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-bold">ملاحظة: لوحة تاجر سلة لا تدعم أحداث الطلبات مباشرة</p>
              <p>استخدم حدث <strong>"انشاء فاتورة طلب"</strong> كبديل لتتبع الطلبات الجديدة. لكل حدث ستجد اسمه في سلة لتسهيل التفعيل.</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : channels.length === 0 ? (
          <div className="p-6 text-center space-y-2">
            <Smartphone className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">لا توجد قنوات واتساب متصلة</p>
            <p className="text-xs text-muted-foreground">اربط رقم واتساب أولاً من صفحة التكاملات</p>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {groupedEvents.map((group) => (
              <div key={group.key} className="space-y-2">
                <h3 className="text-xs font-bold text-muted-foreground px-1">{group.label}</h3>
                {group.events.map((evt) => {
                  const cfg = configs[evt.key] || { enabled: false, channel_id: "" };
                  const isExpanded = expandedEvent === evt.key;
                  const channelType = cfg.channel_id ? getChannelType(cfg.channel_id) : null;
                  const variables = VARIABLE_HINTS[evt.key] || [];

                  return (
                    <div
                      key={evt.key}
                      className={`rounded-xl border transition-all ${
                        cfg.enabled ? "border-primary/30 bg-primary/[0.02]" : "border-border bg-card"
                      }`}
                    >
                      {/* Header Row */}
                      <div
                        className="flex items-center gap-3 p-3 cursor-pointer"
                        onClick={() => setExpandedEvent(isExpanded ? null : evt.key)}
                      >
                        <span className="text-lg">{evt.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold">{evt.label}</p>
                            {cfg.enabled && (
                              <Badge className="bg-success/10 text-success border-0 text-[9px] px-1.5 h-4">
                                مفعّل
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">{evt.description}</p>
                        </div>
                        <Switch
                          checked={cfg.enabled}
                          onCheckedChange={(v) => updateEventConfig(evt.key, { enabled: v })}
                          onClick={(e) => e.stopPropagation()}
                        />
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        )}
                      </div>

                      {/* Expanded Config */}
                      {isExpanded && (
                        <div className="px-3 pb-3 space-y-3 border-t border-border/50 pt-3 animate-fade-in">
                          {/* Salla Setup Guide */}
                          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-2.5 space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <p className="text-[10px] font-bold text-blue-700 dark:text-blue-400">إعداد في سلة</p>
                            </div>
                            <p className="text-[10px] text-blue-600 dark:text-blue-300">
                              اختر الحدث: <strong className="bg-blue-100 dark:bg-blue-900/40 px-1 py-0.5 rounded">{evt.sallaLabel}</strong>
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              💡 {evt.benefit}
                            </p>
                          </div>

                          {/* Channel Select */}
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">قناة الإرسال</Label>
                            <Select
                              value={cfg.channel_id || "none"}
                              onValueChange={(v) =>
                                updateEventConfig(evt.key, {
                                  channel_id: v === "none" ? "" : v,
                                  template_name: "",
                                  message_text: "",
                                })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="اختر القناة" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none" className="text-xs">
                                  بدون تحديد
                                </SelectItem>
                                {channels.map((ch) => (
                                  <SelectItem key={ch.id} value={ch.id} className="text-xs">
                                    {ch.label}{" "}
                                    <span className="text-muted-foreground">
                                      ({ch.type === "meta_api" ? "رسمي" : "غير رسمي"})
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Meta API: Template Select */}
                          {channelType === "meta_api" && (
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <FileText className="w-3 h-3" /> القالب
                              </Label>
                              {loadingTemplates ? (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  جاري تحميل القوالب...
                                </div>
                              ) : templates.length === 0 ? (
                                <p className="text-[10px] text-muted-foreground py-1">لا توجد قوالب معتمدة</p>
                              ) : (
                                <Select
                                  value={cfg.template_name && cfg.template_language ? `${cfg.template_name}::${cfg.template_language}` : "none"}
                                  onValueChange={(v) => {
                                    if (v === "none") {
                                      updateEventConfig(evt.key, { template_name: "", template_language: "" });
                                    } else {
                                      const [name, lang] = v.split("::");
                                      updateEventConfig(evt.key, { template_name: name, template_language: lang });
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="اختر القالب" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none" className="text-xs">بدون تحديد</SelectItem>
                                    {templates.map((t) => (
                                      <SelectItem key={`${t.name}::${t.language}`} value={`${t.name}::${t.language}`} className="text-xs">
                                        {t.name} ({t.language})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          )}

                          {/* Evolution: Free-text Message */}
                          {channelType === "evolution" && (
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" /> نص الرسالة
                              </Label>
                              <Textarea
                                value={cfg.message_text || ""}
                                onChange={(e) => updateEventConfig(evt.key, { message_text: e.target.value })}
                                placeholder="مثال: مرحباً {{customer_name}}، تم استلام طلبك ✅"
                                className="text-xs min-h-[70px]"
                              />
                            </div>
                          )}

                          {/* Variable Hints */}
                          {cfg.channel_id && variables.length > 0 && (
                            <div className="bg-muted/50 rounded-lg p-2">
                              <p className="text-[10px] text-muted-foreground font-medium mb-1">
                                المتغيرات المتاحة:
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {variables.map((v) => (
                                  <button
                                    key={v}
                                    type="button"
                                    className="text-[9px] px-1.5 py-0.5 rounded bg-background border border-border font-mono hover:bg-primary/5 hover:border-primary/30 transition-colors"
                                    onClick={() => {
                                      if (channelType === "evolution") {
                                        updateEventConfig(evt.key, {
                                          message_text: (cfg.message_text || "") + " " + v,
                                        });
                                      }
                                      navigator.clipboard.writeText(v);
                                      toast.success(`تم نسخ ${v}`);
                                    }}
                                    dir="ltr"
                                  >
                                    {v}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Save Button */}
            <div className="sticky bottom-0 pt-3 pb-1 bg-background border-t border-border -mx-4 px-4">
              <Button onClick={handleSave} disabled={saving} className="w-full h-9 text-xs gap-2">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                حفظ الإعدادات
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StoreEventNotifications;
