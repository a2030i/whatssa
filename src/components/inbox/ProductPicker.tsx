import { useState, useEffect } from "react";
import { ShoppingBag, Search, Loader2, Send, Check, Package, Grid3X3, X, ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CatalogProduct {
  id: string;
  name: string;
  description?: string;
  price?: string;
  currency?: string;
  image_url?: string;
  retailer_id?: string;
  availability?: string;
}

interface ProductPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendProduct: (payload: {
    type: "product" | "product_list";
    catalog_id: string;
    product_retailer_id?: string;
    sections?: Array<{ title: string; products: Array<{ product_retailer_id: string }> }>;
    message?: string;
    header_text?: string;
  }) => Promise<void>;
  invokeCloud: (fn: string, opts: { body: Record<string, unknown> }) => Promise<{ data?: any; error?: any }>;
}

const ProductPicker = ({ open, onOpenChange, onSendProduct, invokeCloud }: ProductPickerProps) => {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [catalogId, setCatalogId] = useState<string | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"single" | "multi">("single");

  useEffect(() => {
    if (open && products.length === 0 && !loading) {
      loadProducts();
    }
  }, [open]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const { data: catData } = await invokeCloud("whatsapp-catalog", { body: { action: "list_catalogs" } });
      const catalog = catData?.catalogs?.[0];
      if (!catalog) {
        toast.error("لا يوجد كتالوج مرتبط — فعّله من صفحة الكتالوج");
        return;
      }
      setCatalogId(catalog.id);
      const { data: prodData } = await invokeCloud("whatsapp-catalog", {
        body: { action: "list_products", catalog_id: catalog.id, limit: 100 },
      });
      if (prodData?.products) setProducts(prodData.products);
    } catch {
      toast.error("فشل تحميل المنتجات");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (retailerId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(retailerId)) next.delete(retailerId);
      else next.add(retailerId);
      return next;
    });
  };

  const handleSendSingle = async (product: CatalogProduct) => {
    if (!catalogId || !product.retailer_id) {
      toast.error("المنتج لا يحتوي على retailer_id");
      return;
    }
    setSending(true);
    try {
      await onSendProduct({
        type: "product",
        catalog_id: catalogId,
        product_retailer_id: product.retailer_id,
        message: product.name,
      });
      onOpenChange(false);
    } catch {
      toast.error("فشل إرسال المنتج");
    } finally {
      setSending(false);
    }
  };

  const handleSendMulti = async () => {
    if (!catalogId || selectedIds.size === 0) return;
    setSending(true);
    try {
      const selectedProducts = products.filter((p) => p.retailer_id && selectedIds.has(p.retailer_id));
      await onSendProduct({
        type: "product_list",
        catalog_id: catalogId,
        header_text: "منتجاتنا المختارة",
        message: `اختر من ${selectedProducts.length} منتجات:`,
        sections: [
          {
            title: "المنتجات",
            products: selectedProducts.map((p) => ({ product_retailer_id: p.retailer_id! })),
          },
        ],
      });
      setSelectedIds(new Set());
      onOpenChange(false);
    } catch {
      toast.error("فشل إرسال قائمة المنتجات");
    } finally {
      setSending(false);
    }
  };

  const filtered = products.filter(
    (p) => !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.retailer_id?.toLowerCase().includes(search.toLowerCase())
  );

  const content = (
    <div className="flex flex-col gap-3 h-full max-h-[70vh] md:max-h-[60vh]" dir="rtl">
      {/* Tabs */}
      <Tabs value={mode} onValueChange={(v) => { setMode(v as "single" | "multi"); setSelectedIds(new Set()); }}>
        <TabsList className="w-full grid grid-cols-2 h-9">
          <TabsTrigger value="single" className="text-xs gap-1.5">
            <Package className="w-3.5 h-3.5" /> منتج واحد
          </TabsTrigger>
          <TabsTrigger value="multi" className="text-xs gap-1.5">
            <Grid3X3 className="w-3.5 h-3.5" /> قائمة منتجات
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو SKU..."
          className="pr-9 bg-secondary/60 border-0 text-sm h-9 rounded-lg"
        />
      </div>

      {/* Multi-select send bar */}
      {mode === "multi" && selectedIds.size > 0 && (
        <div className="flex items-center gap-2 bg-primary/10 rounded-lg px-3 py-2 animate-fade-in">
          <Badge variant="secondary" className="text-xs font-bold bg-primary text-primary-foreground">
            {selectedIds.size}
          </Badge>
          <span className="text-xs text-foreground flex-1">منتج محدد</span>
          <Button size="sm" className="h-7 text-xs gap-1 rounded-lg" onClick={handleSendMulti} disabled={sending}>
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" style={{ transform: "scaleX(-1)" }} />}
            إرسال الكل
          </Button>
        </div>
      )}

      {/* Products list */}
      <div className="flex-1 overflow-y-auto space-y-1.5 pb-2 min-h-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">جاري تحميل المنتجات...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <ShoppingBag className="w-8 h-8 text-muted-foreground/40" />
            <span className="text-sm text-muted-foreground">{search ? "لا نتائج مطابقة" : "لا توجد منتجات"}</span>
          </div>
        ) : (
          filtered.map((product) => {
            const isSelected = product.retailer_id ? selectedIds.has(product.retailer_id) : false;
            return (
              <button
                key={product.id}
                onClick={() => {
                  if (mode === "multi" && product.retailer_id) {
                    toggleSelect(product.retailer_id);
                  } else {
                    handleSendSingle(product);
                  }
                }}
                disabled={sending}
                className={cn(
                  "w-full flex items-center gap-3 rounded-xl p-2.5 transition-all text-right",
                  "hover:bg-secondary/80 active:scale-[0.98]",
                  isSelected ? "bg-primary/10 ring-1 ring-primary/30" : "bg-secondary/40"
                )}
              >
                {/* Checkbox for multi */}
                {mode === "multi" && (
                  <div className={cn(
                    "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors",
                    isSelected ? "bg-primary border-primary" : "border-muted-foreground/30"
                  )}>
                    {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>
                )}

                {/* Image */}
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="w-14 h-14 rounded-lg object-cover shrink-0 bg-muted" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-5 h-5 text-muted-foreground/50" />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate leading-tight">{product.name}</p>
                  {product.description && (
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5 leading-tight">{product.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {product.price && (
                      <span className="text-xs font-bold text-primary">{product.price} {product.currency || "SAR"}</span>
                    )}
                    {product.retailer_id && (
                      <span className="text-[10px] text-muted-foreground/70 font-mono" dir="ltr">{product.retailer_id}</span>
                    )}
                    {product.availability && product.availability !== "in stock" && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1 border-destructive/30 text-destructive">
                        غير متوفر
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Send icon for single mode */}
                {mode === "single" && (
                  <Send className="w-4 h-4 text-primary shrink-0 opacity-50 group-hover:opacity-100" style={{ transform: "scaleX(-1)" }} />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  // Use Drawer on mobile, Dialog on desktop
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="px-4 pb-6">
          <DrawerHeader className="px-0 pb-2">
            <DrawerTitle className="flex items-center gap-2 text-base">
              <ShoppingBag className="w-4.5 h-4.5 text-primary" /> إرسال منتج من الكتالوج
            </DrawerTitle>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col p-5" dir="rtl">
        <DialogHeader className="pb-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShoppingBag className="w-4.5 h-4.5 text-primary" /> إرسال منتج من الكتالوج
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
};

export default ProductPicker;
