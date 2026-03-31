import { useState, useEffect } from "react";
import { Store, Plus, Trash2, Copy, CheckCircle2, XCircle, RefreshCw, ExternalLink, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import StoreEventNotifications from "./StoreEventNotifications";

const WEBHOOK_BASE = `https://dgnqehcezvewkdodqpyh.supabase.co/functions/v1/salla-webhook`;

interface StoreIntegration {
  id: string;
  platform: string;
  store_name: string | null;
  store_url: string | null;
  webhook_secret: string;
  is_active: boolean;
  last_webhook_at: string | null;
  webhook_error: string | null;
  events_enabled: string[];
  created_at: string;
}

const SALLA_EVENTS = [
  { key: "order.created", label: "طلب جديد" },
  { key: "order.status.updated", label: "تحديث حالة طلب" },
  { key: "customer.created", label: "عميل جديد" },
  { key: "customer.updated", label: "تحديث عميل" },
  { key: "abandoned.cart", label: "سلة متروكة" },
  { key: "abandoned.cart.purchased", label: "سلة متروكة تم شراؤها" },
  { key: "product.created", label: "منتج جديد" },
  { key: "product.updated", label: "تحديث منتج" },
  { key: "product.deleted", label: "حذف منتج" },
];

const SallaIntegrationSection = () => {
  const { orgId, isEcommerce, refreshOrg } = useAuth();
  const [stores, setStores] = useState<StoreIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreUrl, setNewStoreUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (orgId) fetchStores();
  }, [orgId]);

  const fetchStores = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("store_integrations")
      .select("*")
      .eq("org_id", orgId!)
      .eq("platform", "salla")
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
    const { error } = await supabase.from("store_integrations").insert({
      org_id: orgId!,
      platform: "salla",
      store_name: newStoreName.trim(),
      store_url: newStoreUrl.trim() || null,
    } as any);

    if (error) {
      toast.error("فشل إضافة المتجر");
      console.error(error);
    } else {
      // Auto-enable e-commerce mode on first store integration
      if (!isEcommerce) {
        await supabase.from("organizations").update({ is_ecommerce: true, store_platform: "salla" } as any).eq("id", orgId!);
        refreshOrg();
      }
      toast.success("تم إضافة المتجر بنجاح — ظهرت أقسام الطلبات والسلات المتروكة");
      setShowAdd(false);
      setNewStoreName("");
      setNewStoreUrl("");
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

    // If no stores left, check if there are orders — only revert if empty
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

  const copyWebhookUrl = (id: string) => {
    navigator.clipboard.writeText(`${WEBHOOK_BASE}/${id}`);
    toast.success("تم نسخ رابط الـ Webhook");
  };

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">ربط سلة (Salla)</h3>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1 text-xs">
          <Plus className="w-3.5 h-3.5" /> إضافة متجر
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-6">جاري التحميل...</div>
      ) : stores.length === 0 ? (
        <div className="bg-secondary/50 rounded-lg p-6 text-center">
          <Store className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">لم تربط أي متجر بعد</p>
          <Button size="sm" variant="outline" className="mt-3 text-xs" onClick={() => setShowAdd(true)}>
            إضافة أول متجر
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {stores.map((store) => (
            <div key={store.id} className="bg-card border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Store className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{store.store_name || "متجر سلة"}</p>
                    {store.store_url && (
                      <a href={store.store_url} target="_blank" rel="noopener" className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1">
                        {store.store_url} <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={store.is_active} onCheckedChange={(v) => toggleStore(store.id, v)} />
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteStore(store.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Webhook URL */}
              <div className="bg-secondary/50 rounded-md p-3 space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">رابط الـ Webhook — انسخه وأضفه في لوحة سلة</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={`${WEBHOOK_BASE}/${store.id}`}
                    className="text-[11px] font-mono h-8 bg-card"
                    dir="ltr"
                  />
                  <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => copyWebhookUrl(store.id)}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  {store.webhook_error ? (
                    <Badge variant="destructive" className="text-[10px] gap-1">
                      <XCircle className="w-3 h-3" /> خطأ
                    </Badge>
                  ) : store.last_webhook_at ? (
                    <Badge variant="secondary" className="text-[10px] gap-1 bg-success/10 text-success border-0">
                      <CheckCircle2 className="w-3 h-3" /> متصل
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      في انتظار أول حدث
                    </Badge>
                  )}
                </div>
                <span className="text-muted-foreground text-[11px]">
                  {getTimeSince(store.last_webhook_at)}
                </span>
              </div>

              {store.webhook_error && (
                <p className="text-[11px] text-destructive bg-destructive/5 rounded p-2">{store.webhook_error}</p>
              )}

              {/* Event Notifications Config */}
              <StoreEventNotifications
                storeId={store.id}
                currentMetadata={(store as any).metadata || {}}
                onSaved={fetchStores}
              />

              {/* Events */}
              <div className="flex flex-wrap gap-1.5">
                {store.events_enabled.map((evt) => {
                  const label = SALLA_EVENTS.find((e) => e.key === evt)?.label || evt;
                  return (
                    <span key={evt} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Store Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base">إضافة متجر سلة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
                placeholder="https://store.salla.sa"
                className="mt-1 text-sm"
                dir="ltr"
              />
            </div>
            <div className="bg-secondary/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground">خطوات الربط:</p>
              <ol className="list-decimal mr-4 space-y-1">
                <li>أضف المتجر هنا واحفظ</li>
                <li>انسخ رابط الـ Webhook</li>
                <li>افتح لوحة تحكم سلة → الإعدادات → Webhooks</li>
                <li>الصق الرابط واختر الأحداث المطلوبة</li>
              </ol>
            </div>
            <Button onClick={addStore} disabled={saving} className="w-full">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : "إضافة المتجر"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SallaIntegrationSection;
