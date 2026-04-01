import { useState, useEffect } from "react";
import { Store, Plus, Trash2, Copy, CheckCircle2, XCircle, RefreshCw, ExternalLink, ShoppingBag, Globe, Code2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import StoreEventNotifications from "./StoreEventNotifications";

const SALLA_WEBHOOK_BASE = `https://dgnqehcezvewkdodqpyh.supabase.co/functions/v1/salla-webhook`;
const STORE_WEBHOOK_BASE = `https://dgnqehcezvewkdodqpyh.supabase.co/functions/v1/store-webhook`;
const LAMHA_WEBHOOK_BASE = ""; // Lamha uses API polling, not webhooks

interface StoreIntegration {
  id: string;
  org_id: string;
  platform: string;
  store_name: string | null;
  store_url: string | null;
  webhook_secret: string;
  is_active: boolean;
  last_webhook_at: string | null;
  webhook_error: string | null;
  events_enabled: string[];
  created_at: string;
  metadata?: any;
}

const PLATFORMS = [
  {
    id: "salla",
    name: "سلة (Salla)",
    icon: "🟣",
    color: "bg-purple-500/10 text-purple-600",
    webhookBase: SALLA_WEBHOOK_BASE,
    description: "منصة التجارة الإلكترونية السعودية",
    instructions: [
      "أضف المتجر هنا واحفظ",
      "انسخ رابط الـ Webhook",
      "افتح لوحة تحكم سلة → الإعدادات → Webhooks",
      "الصق الرابط واختر الأحداث المطلوبة",
    ],
    events: [
      { key: "order.created", label: "طلب جديد" },
      { key: "order.status.updated", label: "تحديث حالة طلب" },
      { key: "customer.created", label: "عميل جديد" },
      { key: "customer.updated", label: "تحديث عميل" },
      { key: "abandoned.cart", label: "سلة متروكة" },
      { key: "product.created", label: "منتج جديد" },
      { key: "product.updated", label: "تحديث منتج" },
    ],
  },
  {
    id: "zid",
    name: "زد (Zid)",
    icon: "🔵",
    color: "bg-blue-500/10 text-blue-600",
    webhookBase: STORE_WEBHOOK_BASE,
    description: "منصة التجارة الإلكترونية السعودية",
    instructions: [
      "أضف المتجر هنا واحفظ",
      "انسخ رابط الـ Webhook",
      "افتح لوحة تحكم زد → الإعدادات → Webhooks",
      "الصق الرابط واختر الأحداث المطلوبة",
    ],
    events: [
      { key: "order.create", label: "طلب جديد" },
      { key: "order.update", label: "تحديث طلب" },
      { key: "order.status.update", label: "تغيير حالة طلب" },
      { key: "customer.create", label: "عميل جديد" },
      { key: "abandoned_cart.create", label: "سلة متروكة" },
      { key: "product.create", label: "منتج جديد" },
      { key: "product.update", label: "تحديث منتج" },
    ],
  },
  {
    id: "shopify",
    name: "Shopify",
    icon: "🟢",
    color: "bg-green-500/10 text-green-600",
    webhookBase: STORE_WEBHOOK_BASE,
    description: "أكبر منصة تجارة إلكترونية عالمياً",
    instructions: [
      "أضف المتجر هنا واحفظ",
      "انسخ رابط الـ Webhook",
      "افتح Shopify Admin → Settings → Notifications → Webhooks",
      "أضف Webhook جديد لكل حدث والصق الرابط",
    ],
    events: [
      { key: "orders/create", label: "طلب جديد" },
      { key: "orders/updated", label: "تحديث طلب" },
      { key: "orders/fulfilled", label: "تنفيذ طلب" },
      { key: "orders/cancelled", label: "إلغاء طلب" },
      { key: "customers/create", label: "عميل جديد" },
      { key: "checkouts/create", label: "سلة متروكة" },
      { key: "products/create", label: "منتج جديد" },
      { key: "products/update", label: "تحديث منتج" },
    ],
  },
  {
    id: "woocommerce",
    name: "WooCommerce",
    icon: "🟤",
    color: "bg-violet-500/10 text-violet-600",
    webhookBase: STORE_WEBHOOK_BASE,
    description: "إضافة ووردبريس للتجارة الإلكترونية",
    instructions: [
      "أضف المتجر هنا واحفظ",
      "انسخ رابط الـ Webhook + الـ Secret",
      "افتح WooCommerce → Settings → Advanced → Webhooks",
      "أضف Webhook جديد: الصق الرابط، اختر الحدث، وأضف الـ Secret",
    ],
    events: [
      { key: "order.created", label: "طلب جديد" },
      { key: "order.updated", label: "تحديث طلب" },
      { key: "customer.created", label: "عميل جديد" },
      { key: "customer.updated", label: "تحديث عميل" },
      { key: "product.created", label: "منتج جديد" },
      { key: "product.updated", label: "تحديث منتج" },
    ],
  },
  {
    id: "lamha",
    name: "لمحة (Lamha)",
    icon: "🚚",
    color: "bg-orange-500/10 text-orange-600",
    webhookBase: LAMHA_WEBHOOK_BASE,
    description: "منصة إدارة الشحن — إنشاء شحنات تلقائياً + تتبع الحالة + إشعارات واتساب",
    instructions: [
      "أضف ربط لمحة هنا واحفظ",
      "أدخل توكن API الخاص بحسابك في لمحة",
      "سيتم إنشاء الشحنات تلقائياً لما يوصلنا طلب من المتجر",
      "حالة الشحن تتحدث دورياً من API لمحة + إرسال إشعار واتساب للعميل",
    ],
    events: [
      { key: "auto_create_shipment", label: "إنشاء شحنة تلقائي" },
      { key: "auto_sync_status", label: "تحديث حالة تلقائي" },
      { key: "notify_customer", label: "إشعار العميل" },
    ],
    usesApiToken: true,
  },
  {
    id: "generic",
    name: "ربط مخصص (Generic)",
    icon: "⚙️",
    color: "bg-muted text-foreground",
    webhookBase: STORE_WEBHOOK_BASE,
    description: "أي منصة تدعم الويب هوك — أرسل البيانات بصيغة JSON موحدة",
    instructions: [
      "أضف الربط هنا واحفظ",
      "انسخ رابط الـ Webhook",
      "أرسل POST request بصيغة JSON",
      "راجع التوثيق أدناه لمعرفة الصيغة المطلوبة",
    ],
    events: [
      { key: "order.created", label: "طلب جديد" },
      { key: "customer.created", label: "عميل جديد" },
      { key: "cart.abandoned", label: "سلة متروكة" },
      { key: "product.created", label: "منتج جديد" },
    ],
  },
];

// Fallback Arabic labels for event keys not defined in platform configs
const EVENT_LABELS_AR: Record<string, string> = {
  "order.created": "طلب جديد",
  "order.create": "طلب جديد",
  "order.updated": "تحديث طلب",
  "order.update": "تحديث طلب",
  "order.status.updated": "تحديث حالة طلب",
  "order.status.update": "تغيير حالة طلب",
  "order.shipped": "تم الشحن",
  "order.delivered": "تم التوصيل",
  "order.cancelled": "طلب ملغي",
  "order.refunded": "تم الاسترجاع",
  "orders/create": "طلب جديد",
  "orders/updated": "تحديث طلب",
  "orders/fulfilled": "تنفيذ طلب",
  "orders/cancelled": "إلغاء طلب",
  "customer.created": "عميل جديد",
  "customer.create": "عميل جديد",
  "customer.updated": "تحديث عميل",
  "customers/create": "عميل جديد",
  "abandoned.cart": "سلة متروكة",
  "abandoned.cart.purchased": "شراء سلة متروكة",
  "abandoned_cart.create": "سلة متروكة",
  "cart.abandoned": "سلة متروكة",
  "checkouts/create": "سلة متروكة",
  "product.created": "منتج جديد",
  "product.create": "منتج جديد",
  "product.updated": "تحديث منتج",
  "product.update": "تحديث منتج",
  "products/create": "منتج جديد",
  "products/update": "تحديث منتج",
  "shipment.picked_up": "تم الالتقاط",
  "shipment.shipping": "جاري الشحن",
  "shipment.delivered": "تم التوصيل",
  "shipment.delivery_failed": "فشل التوصيل",
  "shipment.returned": "مرتجع",
  "shipment.cancelled": "شحنة ملغية",
};

const SallaIntegrationSection = () => {
  const { orgId, isEcommerce, refreshOrg } = useAuth();
  const [stores, setStores] = useState<StoreIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState("salla");
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreUrl, setNewStoreUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [showApiDocs, setShowApiDocs] = useState(false);
  const [newApiToken, setNewApiToken] = useState("");

  useEffect(() => {
    if (orgId) fetchStores();
  }, [orgId]);

  const fetchStores = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("store_integrations")
      .select("*")
      .eq("org_id", orgId!)
      .order("created_at", { ascending: true });
    setStores((data as any[]) || []);
    setLoading(false);
  };

  const addStore = async () => {
    if (!newStoreName.trim()) {
      toast.error("أدخل اسم المتجر");
      return;
    }
    setSaving(true);
    const platformConfig = getPlatformConfig(selectedPlatform);
    const insertData: any = {
      org_id: orgId!,
      platform: selectedPlatform,
      store_name: newStoreName.trim(),
      store_url: newStoreUrl.trim() || null,
    };
    // Save API token in metadata for Lamha
    if ((platformConfig as any)?.usesApiToken && newApiToken.trim()) {
      insertData.metadata = { api_token: newApiToken.trim() };
    }
    const { error } = await supabase.from("store_integrations").insert(insertData);

    if (error) {
      toast.error("فشل إضافة المتجر");
      console.error(error);
    } else {
      if (!isEcommerce) {
        await supabase.from("organizations").update({ is_ecommerce: true, store_platform: selectedPlatform } as any).eq("id", orgId!);
        refreshOrg();
      }
      toast.success("تم إضافة المتجر بنجاح");
      setShowAdd(false);
      setNewStoreName("");
      setNewStoreUrl("");
      setNewApiToken("");
      fetchStores();
    }
    setSaving(false);
  };

  const toggleStore = async (id: string, active: boolean) => {
    await supabase.from("store_integrations").update({ is_active: active } as any).eq("id", id);
    fetchStores();
  };

  const deleteStore = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الربط؟")) return;
    await supabase.from("store_integrations").delete().eq("id", id);
    toast.success("تم حذف الربط");

    const { count: storeCount } = await supabase.from("store_integrations").select("id", { count: "exact", head: true }).eq("org_id", orgId!);
    if (storeCount === 0) {
      const { count: orderCount } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("org_id", orgId!);
      const { count: cartCount } = await supabase.from("abandoned_carts").select("id", { count: "exact", head: true }).eq("org_id", orgId!);
      if (!orderCount && !cartCount) {
        await supabase.from("organizations").update({ is_ecommerce: false, store_platform: null } as any).eq("id", orgId!);
        refreshOrg();
      }
    }
    fetchStores();
  };

  const getWebhookUrl = (store: StoreIntegration) => {
    const platformConfig = PLATFORMS.find(p => p.id === store.platform);
    const base = platformConfig?.webhookBase || STORE_WEBHOOK_BASE;
    return `${base}/${store.id}`;
  };

  const copyWebhookUrl = (store: StoreIntegration) => {
    navigator.clipboard.writeText(getWebhookUrl(store));
    toast.success("تم نسخ رابط الـ Webhook");
  };

  const copySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
    toast.success("تم نسخ الـ Secret");
  };

  const getPlatformConfig = (platformId: string) => PLATFORMS.find(p => p.id === platformId);

  const getTimeSince = (date: string | null) => {
    if (!date) return "لم يستلم أي حدث";
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "الآن";
    if (mins < 60) return `منذ ${mins} دقيقة`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    return `منذ ${Math.floor(hours / 24)} يوم`;
  };

  // Group stores by platform
  const storesByPlatform = PLATFORMS.reduce((acc, p) => {
    acc[p.id] = stores.filter(s => s.platform === p.id);
    return acc;
  }, {} as Record<string, StoreIntegration[]>);

  const hasAnyStores = stores.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">ربط المتاجر الإلكترونية</h3>
          {hasAnyStores && (
            <Badge variant="secondary" className="text-[10px]">{stores.length} متجر</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowApiDocs(true)} className="gap-1 text-xs">
            <Code2 className="w-3.5 h-3.5" /> التوثيق
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1 text-xs">
            <Plus className="w-3.5 h-3.5" /> إضافة متجر
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-6">جاري التحميل...</div>
      ) : !hasAnyStores ? (
        <div className="bg-secondary/50 rounded-lg p-6 text-center">
          <Store className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-1">لم تربط أي متجر بعد</p>
          <p className="text-[11px] text-muted-foreground/70 mb-3">يدعم سلة، زد، Shopify، WooCommerce وأي منصة أخرى</p>
          <div className="flex flex-wrap justify-center gap-2">
            {PLATFORMS.map(p => (
              <Button key={p.id} size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => { setSelectedPlatform(p.id); setShowAdd(true); }}>
                <span>{p.icon}</span> {p.name}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <Tabs defaultValue={stores[0]?.platform || "salla"} className="w-full">
          <TabsList className="w-full flex-wrap h-auto gap-1 bg-secondary/50 p-1">
            {PLATFORMS.filter(p => storesByPlatform[p.id]?.length > 0).map(p => (
              <TabsTrigger key={p.id} value={p.id} className="text-xs gap-1.5 data-[state=active]:bg-card">
                <span>{p.icon}</span>
                {p.name}
                <Badge variant="secondary" className="text-[9px] px-1 h-4 min-w-4">{storesByPlatform[p.id].length}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          {PLATFORMS.filter(p => storesByPlatform[p.id]?.length > 0).map(p => (
            <TabsContent key={p.id} value={p.id} className="space-y-3 mt-3">
              {storesByPlatform[p.id].map(store => (
                <StoreCard
                  key={store.id}
                  store={store}
                  platform={p}
                  onToggle={toggleStore}
                  onDelete={deleteStore}
                  onCopyUrl={() => copyWebhookUrl(store)}
                  onCopySecret={() => copySecret(store.webhook_secret)}
                  webhookUrl={getWebhookUrl(store)}
                  timeSince={getTimeSince(store.last_webhook_at)}
                  onRefetch={fetchStores}
                />
              ))}
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* Add Store Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base">إضافة متجر جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">المنصة</Label>
              <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <span>{p.icon}</span> {p.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                {getPlatformConfig(selectedPlatform)?.description}
              </p>
            </div>
            <div>
              <Label className="text-xs">اسم المتجر</Label>
              <Input
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                placeholder="مثال: متجر الأناقة"
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">رابط المتجر (اختياري)</Label>
              <Input
                value={newStoreUrl}
                onChange={(e) => setNewStoreUrl(e.target.value)}
                placeholder="https://store.example.com"
                className="mt-1 text-sm"
                dir="ltr"
              />
            </div>
            {(getPlatformConfig(selectedPlatform) as any)?.usesApiToken && (
              <div>
                <Label className="text-xs">توكن API لمحة</Label>
                <Input
                  value={newApiToken}
                  onChange={(e) => setNewApiToken(e.target.value)}
                  placeholder="أدخل التوكن من لوحة تحكم لمحة"
                  className="mt-1 text-sm font-mono"
                  dir="ltr"
                  type="password"
                />
                <p className="text-[10px] text-muted-foreground mt-1">تجده في لوحة تحكم لمحة → الإعدادات → API</p>
              </div>
            )}
            <div className="bg-secondary/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground">خطوات الربط:</p>
              <ol className="list-decimal mr-4 space-y-1">
                {getPlatformConfig(selectedPlatform)?.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
            <Button onClick={addStore} disabled={saving} className="w-full">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : "إضافة المتجر"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* API Documentation Dialog */}
      <Dialog open={showApiDocs} onOpenChange={setShowApiDocs}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Code2 className="w-4 h-4" /> توثيق الويب هوك (Generic)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground text-xs">
              استخدم الصيغة التالية لإرسال بيانات من أي منصة مخصصة
            </p>
            <div className="bg-sidebar text-sidebar-foreground rounded-lg p-4 font-mono text-xs space-y-3" dir="ltr">
              <p className="text-sidebar-primary">POST {STORE_WEBHOOK_BASE}/{"<integration_id>"}</p>
              <p className="text-muted-foreground">Content-Type: application/json</p>
              <div className="border-t border-sidebar-border pt-2">
                <p className="text-muted-foreground mb-1">// Order example:</p>
                <pre className="whitespace-pre-wrap text-[11px]">{`{
  "event": "order.created",
  "data": {
    "id": "ORD-001",
    "order_number": "1001",
    "customer_name": "أحمد",
    "customer_phone": "966501234567",
    "customer_email": "ahmed@example.com",
    "status": "pending",
    "total": 150.00,
    "currency": "SAR",
    "items": [
      { "name": "منتج 1", "quantity": 2, "price": 75 }
    ]
  }
}`}</pre>
              </div>
              <div className="border-t border-sidebar-border pt-2">
                <p className="text-muted-foreground mb-1">// Customer example:</p>
                <pre className="whitespace-pre-wrap text-[11px]">{`{
  "event": "customer.created",
  "data": {
    "name": "محمد",
    "phone": "966509876543",
    "email": "mohammed@example.com"
  }
}`}</pre>
              </div>
              <div className="border-t border-sidebar-border pt-2">
                <p className="text-muted-foreground mb-1">// Supported events:</p>
                <pre className="text-[11px]">{`order.created, order.updated
customer.created, customer.updated
cart.abandoned
product.created, product.updated, product.deleted`}</pre>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Store Card Component ───
function StoreCard({ store, platform, onToggle, onDelete, onCopyUrl, onCopySecret, webhookUrl, timeSince, onRefetch }: {
  store: StoreIntegration;
  platform: typeof PLATFORMS[0];
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
  onCopyUrl: () => void;
  onCopySecret: () => void;
  webhookUrl: string;
  timeSince: string;
  onRefetch: () => void;
}) {
  const [apiToken, setApiToken] = useState((store.metadata as any)?.api_token || "");
  const [savingToken, setSavingToken] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const isLamha = store.platform === "lamha";

  const saveApiToken = async () => {
    setSavingToken(true);
    const currentMeta = (store.metadata || {}) as any;
    await supabase.from("store_integrations").update({
      metadata: { ...currentMeta, api_token: apiToken.trim() },
    } as any).eq("id", store.id);
    toast.success("تم حفظ التوكن");
    setSavingToken(false);
    onRefetch();
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("lamha-sync-status", {
        body: { org_id: store.org_id },
      });
      if (error) throw error;
      toast.success(`تم المزامنة: ${data?.updated || 0} تحديث`);
      onRefetch();
    } catch (err) {
      toast.error("فشلت المزامنة");
      console.error(err);
    }
    setSyncing(false);
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base ${platform.color}`}>
            {platform.icon}
          </div>
          <div>
            <p className="font-medium text-sm">{store.store_name || platform.name}</p>
            {store.store_url && (
              <a href={store.store_url} target="_blank" rel="noopener" className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1">
                {store.store_url} <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLamha && (
            <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={syncNow} disabled={syncing}>
              <RefreshCw className={cn("w-3 h-3", syncing && "animate-spin")} />
              مزامنة
            </Button>
          )}
          <Switch checked={store.is_active} onCheckedChange={(v) => onToggle(store.id, v)} />
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(store.id)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Lamha API Token */}
      {isLamha ? (
        <div className="bg-secondary/50 rounded-md p-3 space-y-2">
          <Label className="text-[11px] text-muted-foreground">توكن API لمحة</Label>
          <div className="flex gap-2">
            <Input
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              className="text-[11px] font-mono h-8 bg-card"
              dir="ltr"
              type="password"
              placeholder="أدخل التوكن"
            />
            <Button size="sm" variant="outline" className="h-8 shrink-0 text-[10px]" onClick={saveApiToken} disabled={savingToken}>
              {savingToken ? <RefreshCw className="w-3 h-3 animate-spin" /> : "حفظ"}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            📌 رابط تتبع الشحنات للعملاء: <code className="bg-secondary px-1 rounded" dir="ltr">{window.location.origin}/tracking</code>
          </p>
        </div>
      ) : (
        <div className="bg-secondary/50 rounded-md p-3 space-y-2">
          <Label className="text-[11px] text-muted-foreground">رابط الـ Webhook</Label>
          <div className="flex gap-2">
            <Input readOnly value={webhookUrl} className="text-[11px] font-mono h-8 bg-card" dir="ltr" />
            <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={onCopyUrl}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
          {(store.platform === "woocommerce" || store.platform === "shopify") && (
            <div className="pt-1">
              <Label className="text-[11px] text-muted-foreground">Webhook Secret</Label>
              <div className="flex gap-2 mt-1">
                <Input readOnly value={store.webhook_secret} className="text-[11px] font-mono h-8 bg-card" dir="ltr" />
                <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={onCopySecret}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          {store.webhook_error ? (
            <Badge variant="destructive" className="text-[10px] gap-1">
              <XCircle className="w-3 h-3" /> خطأ
            </Badge>
          ) : store.last_webhook_at ? (
            <Badge variant="secondary" className="text-[10px] gap-1 bg-success/10 text-success border-0">
              <CheckCircle2 className="w-3 h-3" /> {isLamha ? "آخر مزامنة" : "متصل"}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] gap-1">
              {isLamha ? "لم تتم مزامنة بعد" : "في انتظار أول حدث"}
            </Badge>
          )}
        </div>
        <span className="text-muted-foreground text-[11px]">{timeSince}</span>
      </div>

      {store.webhook_error && (
        <p className="text-[11px] text-destructive bg-destructive/5 rounded p-2">{store.webhook_error}</p>
      )}

      {/* Event Notifications */}
      <StoreEventNotifications
        storeId={store.id}
        currentMetadata={store.metadata || {}}
        onSaved={onRefetch}
      />

      {/* Events/Features */}
      <div className="flex flex-wrap gap-1.5">
        {isLamha ? (
          platform.events.map((evt) => (
            <span key={evt.key} className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600">
              {evt.label}
            </span>
          ))
        ) : (
          store.events_enabled.map((evt) => {
            const label = platform.events.find(e => e.key === evt)?.label || EVENT_LABELS_AR[evt] || evt;
            return (
              <span key={evt} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                {label}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}

export default SallaIntegrationSection;
