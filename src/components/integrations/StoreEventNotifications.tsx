import { useState, useEffect } from "react";
import {
  Bell, MessageSquare, Loader2, Save, ChevronDown, ChevronUp,
  Smartphone, FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase, cloudSupabase } from "@/lib/supabase";
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
  // For meta_api
  template_name?: string;
  template_language?: string;
  // For evolution
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

const STORE_EVENTS = [
  { key: "order.created", label: "طلب جديد", icon: "🛒", description: "عند إنشاء طلب جديد في المتجر" },
  { key: "order.created_unpaid", label: "طلب جديد (غير مدفوع)", icon: "💳", description: "تذكير بالسداد للطلبات غير المدفوعة" },
  { key: "order.shipped", label: "تم الشحن", icon: "📦", description: "عند شحن الطلب" },
  { key: "order.delivered", label: "تم التوصيل", icon: "✅", description: "عند توصيل الطلب للعميل" },
  { key: "order.cancelled", label: "طلب ملغي", icon: "❌", description: "عند إلغاء الطلب" },
  { key: "order.refunded", label: "تم الاسترجاع", icon: "💰", description: "عند استرجاع المبلغ" },
  { key: "abandoned.cart", label: "سلة متروكة", icon: "🛒", description: "تذكير العميل بالسلة المتروكة" },
  { key: "customer.created", label: "عميل جديد", icon: "👤", description: "رسالة ترحيب لعميل جديد سجّل بالمتجر" },
];

const VARIABLE_HINTS: Record<string, string[]> = {
  "order.created": ["{{customer_name}}", "{{order_number}}", "{{total}}", "{{currency}}", "{{payment_method}}", "{{items_summary}}"],
  "order.created_unpaid": ["{{customer_name}}", "{{order_number}}", "{{total}}", "{{currency}}"],
  "order.shipped": ["{{customer_name}}", "{{order_number}}", "{{total}}", "{{status}}"],
  "order.delivered": ["{{customer_name}}", "{{order_number}}"],
  "order.cancelled": ["{{customer_name}}", "{{order_number}}", "{{total}}"],
  "order.refunded": ["{{customer_name}}", "{{order_number}}", "{{total}}"],
  "abandoned.cart": ["{{customer_name}}", "{{total}}", "{{currency}}", "{{checkout_url}}", "{{items_summary}}"],
  "customer.created": ["{{customer_name}}"],
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

  // Fetch templates when a meta_api channel exists
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
          <div className="p-4 space-y-2">
            {STORE_EVENTS.map((evt) => {
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
                            placeholder="مثال: مرحباً {{customer_name}}، تم استلام طلبك رقم {{order_number}} بقيمة {{total}} {{currency}} ✅"
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

            {/* Save Button */}
            <Button className="w-full gap-2 text-sm mt-4" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ الإعدادات
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StoreEventNotifications;
