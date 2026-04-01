import { useState, useEffect } from "react";
import { ShoppingBag, Loader2, RefreshCw, Eye, ShoppingCart, Package, ExternalLink, QrCode, Plus, Trash2, Copy, Link } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Catalog {
  id: string;
  name: string;
  product_count: number;
}

interface Product {
  id: string;
  name: string;
  description?: string;
  price?: string;
  currency?: string;
  image_url?: string;
  availability?: string;
  retailer_id?: string;
}

interface QRCode {
  code: string;
  prefilled_message: string;
  deep_link_url: string;
  qr_image_url?: string;
}

export const CatalogSection = () => {
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<Catalog | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showProducts, setShowProducts] = useState(false);
  const [commerceSettings, setCommerceSettings] = useState<any>(null);

  const loadCatalogs = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.functions.invoke("whatsapp-catalog", { body: { action: "list_catalogs" } });
    if (!error && data?.catalogs) setCatalogs(data.catalogs);
    else if (data?.error) toast.error(data.error);
    
    const { data: settings } = await supabase.functions.invoke("whatsapp-catalog", { body: { action: "get_commerce_settings" } });
    if (settings?.settings) setCommerceSettings(settings.settings);
    setIsLoading(false);
  };

  useEffect(() => { loadCatalogs(); }, []);

  const loadProducts = async (catalog: Catalog) => {
    setSelectedCatalog(catalog);
    setShowProducts(true);
    const { data, error } = await supabase.functions.invoke("whatsapp-catalog", { body: { action: "list_products", catalog_id: catalog.id } });
    if (!error && data?.products) setProducts(data.products);
    else toast.error(data?.error || "تعذر جلب المنتجات");
  };

  const enableCatalog = async (catalogId: string) => {
    const { data, error } = await supabase.functions.invoke("whatsapp-catalog", {
      body: { action: "update_commerce_settings", catalog_id: catalogId, is_cart_enabled: true, is_catalog_visible: true },
    });
    if (!error && data?.success) {
      toast.success("تم تفعيل الكتالوج على الرقم");
      loadCatalogs();
    } else toast.error(data?.error || "تعذر تفعيل الكتالوج");
  };

  if (isLoading) return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
      <Loader2 className="w-4 h-4 animate-spin" /> جاري جلب الكتالوجات...
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold flex items-center gap-1.5"><ShoppingBag className="w-4 h-4 text-primary" /> كتالوج المنتجات</h3>
        <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={loadCatalogs}><RefreshCw className="w-3 h-3" /> تحديث</Button>
      </div>

      {catalogs.length === 0 ? (
        <div className="bg-muted/30 rounded-lg border border-border p-4 text-center">
          <ShoppingBag className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-xs font-semibold">لا توجد كتالوجات</p>
          <p className="text-[10px] text-muted-foreground mt-1">أنشئ كتالوج من Meta Commerce Manager</p>
          <a href="https://business.facebook.com/commerce" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline mt-2">
            <ExternalLink className="w-3 h-3" /> فتح Commerce Manager
          </a>
        </div>
      ) : (
        <div className="space-y-2">
          {catalogs.map((catalog) => {
            const isActive = commerceSettings?.catalog_id === catalog.id;
            return (
              <div key={catalog.id} className="bg-muted/30 rounded-lg border border-border p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{catalog.name}</p>
                  <p className="text-[10px] text-muted-foreground">{catalog.product_count} منتج</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {isActive && <Badge className="bg-success/10 text-success border-0 text-[9px]">مفعّل</Badge>}
                  <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => loadProducts(catalog)}>
                    <Eye className="w-3 h-3" /> عرض
                  </Button>
                  {!isActive && (
                    <Button size="sm" className="h-7 text-[10px] gap-1" onClick={() => enableCatalog(catalog.id)}>
                      <ShoppingCart className="w-3 h-3" /> تفعيل
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showProducts} onOpenChange={setShowProducts}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>منتجات {selectedCatalog?.name}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {products.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">لا توجد منتجات</p>
            ) : products.map((product) => (
              <div key={product.id} className="flex items-center gap-3 bg-muted/30 rounded-lg p-2.5">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="w-12 h-12 rounded-lg object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center"><Package className="w-5 h-5 text-muted-foreground" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{product.name}</p>
                  {product.price && <p className="text-[10px] text-primary font-bold">{product.price} {product.currency || "SAR"}</p>}
                  {product.retailer_id && <p className="text-[10px] text-muted-foreground font-mono" dir="ltr">SKU: {product.retailer_id}</p>}
                </div>
                <Badge className={product.availability === "in stock" ? "bg-success/10 text-success border-0 text-[9px]" : "bg-muted text-muted-foreground border-0 text-[9px]"}>
                  {product.availability === "in stock" ? "متوفر" : "غير متوفر"}
                </Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export const QRCodeSection = () => {
  const [qrCodes, setQrCodes] = useState<QRCode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const loadQR = async () => {
    setIsLoading(true);
    const { data } = await supabase.functions.invoke("whatsapp-catalog", { body: { action: "list_qr" } });
    if (data?.qr_codes) setQrCodes(data.qr_codes);
    setIsLoading(false);
  };

  useEffect(() => { loadQR(); }, []);

  const createQR = async () => {
    setIsCreating(true);
    const { data, error } = await supabase.functions.invoke("whatsapp-catalog", {
      body: { action: "create_qr", prefill_message: newMessage },
    });
    if (!error && data?.qr) {
      toast.success("تم إنشاء رمز QR");
      setNewMessage("");
      loadQR();
    } else toast.error(data?.error || "تعذر إنشاء QR");
    setIsCreating(false);
  };

  const deleteQR = async (qrId: string) => {
    const { data } = await supabase.functions.invoke("whatsapp-catalog", { body: { action: "delete_qr", qr_id: qrId } });
    if (data?.success) { toast.success("تم حذف QR"); loadQR(); }
    else toast.error(data?.error || "تعذر الحذف");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold flex items-center gap-1.5"><QrCode className="w-4 h-4 text-primary" /> رموز QR</h3>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="رسالة تلقائية (اختياري)..."
          className="bg-secondary border-0 text-xs flex-1"
        />
        <Button size="sm" className="h-8 text-xs gap-1" onClick={createQR} disabled={isCreating}>
          {isCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} إنشاء
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2 justify-center">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> جاري التحميل...
        </div>
      ) : qrCodes.length === 0 ? (
        <p className="text-[10px] text-muted-foreground text-center py-2">لا توجد رموز QR. أنشئ واحداً للمشاركة.</p>
      ) : (
        <div className="space-y-2">
          {qrCodes.map((qr, i) => (
            <div key={i} className="bg-muted/30 rounded-lg border border-border p-3 flex items-center gap-3">
              <QrCode className="w-8 h-8 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground truncate">{qr.prefilled_message || "(بدون رسالة)"}</p>
                {qr.deep_link_url && (
                  <button
                    onClick={() => { navigator.clipboard.writeText(qr.deep_link_url); toast.success("تم نسخ الرابط"); }}
                    className="text-[10px] text-primary hover:underline flex items-center gap-1 mt-0.5"
                  >
                    <Link className="w-2.5 h-2.5" /> نسخ الرابط
                  </button>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteQR(qr.code)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
