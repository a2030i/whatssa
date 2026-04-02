import { useState, useEffect } from "react";
import {
  ShoppingBag, Loader2, RefreshCw, Eye, ShoppingCart, Package, ExternalLink,
  Search, Grid3X3, List, Send, Image as ImageIcon, Tag, Check
} from "lucide-react";
import { invokeCloud } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  url?: string;
}

const CatalogPage = () => {
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<Catalog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [commerceSettings, setCommerceSettings] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const loadCatalogs = async () => {
    setIsLoading(true);
    const { data, error } = await invokeCloud("whatsapp-catalog", { body: { action: "list_catalogs" } });
    if (!error && data?.catalogs) {
      setCatalogs(data.catalogs);
      // Auto-select first catalog
      if (data.catalogs.length > 0 && !selectedCatalog) {
        loadProducts(data.catalogs[0]);
      }
    } else if (data?.error) {
      toast.error(data.error);
    }

    const { data: settings } = await invokeCloud("whatsapp-catalog", { body: { action: "get_commerce_settings" } });
    if (settings?.settings) setCommerceSettings(settings.settings);
    setIsLoading(false);
  };

  useEffect(() => { loadCatalogs(); }, []);

  const loadProducts = async (catalog: Catalog) => {
    setSelectedCatalog(catalog);
    setIsLoadingProducts(true);
    const { data, error } = await invokeCloud("whatsapp-catalog", {
      body: { action: "list_products", catalog_id: catalog.id, limit: 100 },
    });
    if (!error && data?.products) setProducts(data.products);
    else toast.error(data?.error || "تعذر جلب المنتجات");
    setIsLoadingProducts(false);
  };

  const enableCatalog = async (catalogId: string) => {
    const { data, error } = await invokeCloud("whatsapp-catalog", {
      body: { action: "update_commerce_settings", catalog_id: catalogId, is_cart_enabled: true, is_catalog_visible: true },
    });
    if (!error && data?.success) {
      toast.success("تم تفعيل الكتالوج على الرقم");
      loadCatalogs();
    } else toast.error(data?.error || "تعذر تفعيل الكتالوج");
  };

  const filteredProducts = products.filter((p) =>
    !searchQuery || p.name?.toLowerCase().includes(searchQuery.toLowerCase()) || p.retailer_id?.includes(searchQuery)
  );

  const activeCatalogId = commerceSettings?.catalog_id;

  if (isLoading) {
    return (
      <div className="p-3 md:p-6 flex items-center justify-center min-h-[50vh]" dir="rtl">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">جاري جلب الكتالوجات من Meta...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-primary" /> كتالوج المنتجات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة كتالوجات واتساب وعرض المنتجات المرتبطة</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={loadCatalogs}>
          <RefreshCw className="w-4 h-4" /> تحديث
        </Button>
      </div>

      {/* Catalogs list */}
      {catalogs.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-10 text-center">
          <ShoppingBag className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-base font-semibold">لا توجد كتالوجات</h3>
          <p className="text-sm text-muted-foreground mt-1">أنشئ كتالوج منتجات من Meta Commerce Manager لعرضه هنا</p>
          <a
            href="https://business.facebook.com/commerce"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-3"
          >
            <ExternalLink className="w-4 h-4" /> فتح Commerce Manager
          </a>
        </div>
      ) : (
        <>
          {/* Catalog selector */}
          <div className="flex flex-wrap gap-2">
            {catalogs.map((catalog) => {
              const isActive = activeCatalogId === catalog.id;
              const isSelected = selectedCatalog?.id === catalog.id;
              return (
                <button
                  key={catalog.id}
                  onClick={() => loadProducts(catalog)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-4 py-2.5 transition-all text-right",
                    isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/30"
                  )}
                >
                  <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", isActive ? "bg-success/10" : "bg-primary/10")}>
                    <Package className={cn("w-4 h-4", isActive ? "text-success" : "text-primary")} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{catalog.name}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">{catalog.product_count} منتج</span>
                      {isActive && <Badge className="bg-success/10 text-success border-0 text-[9px] h-4">مفعّل</Badge>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Activate button if not active */}
          {selectedCatalog && activeCatalogId !== selectedCatalog.id && (
            <div className="bg-warning/5 border border-warning/20 rounded-xl p-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">هذا الكتالوج غير مفعّل على رقم الواتساب بعد</p>
              <Button size="sm" className="gap-1.5 text-xs shrink-0" onClick={() => enableCatalog(selectedCatalog.id)}>
                <ShoppingCart className="w-3.5 h-3.5" /> تفعيل الكتالوج
              </Button>
            </div>
          )}

          {/* Products toolbar */}
          {selectedCatalog && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث في المنتجات..."
                  className="bg-secondary border-0 pr-9 text-sm"
                />
              </div>
              <div className="flex items-center border border-border rounded-lg">
                <button
                  onClick={() => setViewMode("grid")}
                  className={cn("p-2 rounded-r-lg transition-colors", viewMode === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}
                >
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={cn("p-2 rounded-l-lg transition-colors", viewMode === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
              <Badge variant="outline" className="text-xs shrink-0">{filteredProducts.length} منتج</Badge>
            </div>
          )}

          {/* Products */}
          {isLoadingProducts ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-8 text-center">
              <Package className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-semibold">لا توجد منتجات</p>
              <p className="text-xs text-muted-foreground mt-1">
                {searchQuery ? "جرّب كلمة بحث مختلفة" : "أضف منتجات من Commerce Manager"}
              </p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  className="bg-card rounded-xl border border-border overflow-hidden hover:border-primary/30 hover:shadow-sm transition-all text-right"
                >
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-full h-32 sm:h-36 object-cover" />
                  ) : (
                    <div className="w-full h-32 sm:h-36 bg-muted flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="p-2.5 space-y-1">
                    <p className="text-xs font-semibold line-clamp-2">{product.name}</p>
                    {product.price && (
                      <p className="text-sm font-bold text-primary">{product.price} <span className="text-[10px] font-normal text-muted-foreground">{product.currency || "SAR"}</span></p>
                    )}
                    <div className="flex items-center justify-between">
                      {product.retailer_id && (
                        <span className="text-[9px] text-muted-foreground font-mono" dir="ltr">SKU: {product.retailer_id}</span>
                      )}
                      <Badge className={cn(
                        "text-[8px] border-0 h-4",
                        product.availability === "in stock" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                      )}>
                        {product.availability === "in stock" ? "متوفر" : "غير متوفر"}
                      </Badge>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  className="w-full flex items-center gap-3 bg-card rounded-xl border border-border p-3 hover:border-primary/30 hover:shadow-sm transition-all text-right"
                >
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-14 h-14 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <ImageIcon className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{product.name}</p>
                    {product.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{product.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {product.price && (
                        <span className="text-xs font-bold text-primary">{product.price} {product.currency || "SAR"}</span>
                      )}
                      {product.retailer_id && (
                        <span className="text-[10px] text-muted-foreground font-mono" dir="ltr">SKU: {product.retailer_id}</span>
                      )}
                    </div>
                  </div>
                  <Badge className={cn(
                    "text-[9px] border-0 shrink-0",
                    product.availability === "in stock" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                  )}>
                    {product.availability === "in stock" ? "متوفر" : "غير متوفر"}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Product detail dialog */}
      <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base">تفاصيل المنتج</DialogTitle>
          </DialogHeader>
          {selectedProduct && (
            <div className="space-y-4">
              {selectedProduct.image_url ? (
                <img src={selectedProduct.image_url} alt={selectedProduct.name} className="w-full h-48 object-cover rounded-xl" />
              ) : (
                <div className="w-full h-48 bg-muted rounded-xl flex items-center justify-center">
                  <ImageIcon className="w-12 h-12 text-muted-foreground" />
                </div>
              )}
              <div className="space-y-2">
                <h3 className="text-lg font-bold">{selectedProduct.name}</h3>
                {selectedProduct.description && (
                  <p className="text-sm text-muted-foreground">{selectedProduct.description}</p>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  {selectedProduct.price && (
                    <div className="bg-primary/10 rounded-lg px-3 py-1.5">
                      <span className="text-lg font-bold text-primary">{selectedProduct.price}</span>
                      <span className="text-xs text-muted-foreground mr-1">{selectedProduct.currency || "SAR"}</span>
                    </div>
                  )}
                  <Badge className={cn(
                    "border-0",
                    selectedProduct.availability === "in stock" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                  )}>
                    {selectedProduct.availability === "in stock" ? "✓ متوفر" : "غير متوفر"}
                  </Badge>
                </div>
                {selectedProduct.retailer_id && (
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-mono" dir="ltr">SKU: {selectedProduct.retailer_id}</span>
                  </div>
                )}
              </div>
              {selectedProduct.url && (
                <a
                  href={selectedProduct.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> عرض في Commerce Manager
                </a>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CatalogPage;
