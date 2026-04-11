import { useState, useEffect } from "react";
import {
  ShoppingBag, Loader2, RefreshCw, Eye, ShoppingCart, Package, ExternalLink,
  Search, Grid3X3, List, Send, Image as ImageIcon, Tag, Check, Plus, Pencil, Trash2, Save, X
} from "lucide-react";
import { supabase, invokeCloud } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Catalog {
  id: string;
  name: string;
  product_count: number;
}

interface MetaProduct {
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

interface InternalProduct {
  id: string;
  name: string;
  name_ar: string | null;
  description: string | null;
  price: number;
  currency: string | null;
  image_url: string | null;
  sku: string | null;
  category: string | null;
  is_active: boolean | null;
  stock_quantity: number | null;
}

const CatalogPage = () => {
  const { orgId } = useAuth();
  const [hasMetaChannel, setHasMetaChannel] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Meta state
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [metaProducts, setMetaProducts] = useState<MetaProduct[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<Catalog | null>(null);
  const [commerceSettings, setCommerceSettings] = useState<any>(null);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  // Internal state
  const [internalProducts, setInternalProducts] = useState<InternalProduct[]>([]);

  // Shared state
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedProduct, setSelectedProduct] = useState<MetaProduct | null>(null);
  const [selectedInternal, setSelectedInternal] = useState<InternalProduct | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editProduct, setEditProduct] = useState<InternalProduct | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state for add/edit
  const [form, setForm] = useState({ name: "", name_ar: "", description: "", price: "", currency: "SAR", image_url: "", sku: "", category: "", stock_quantity: "" });

  useEffect(() => {
    detectChannelType();
  }, [orgId]);

  const detectChannelType = async () => {
    if (!orgId) return;
    setIsLoading(true);
    const { data } = await supabase
      .from("whatsapp_config")
      .select("id, channel_type")
      .eq("org_id", orgId)
      .eq("is_connected", true);

    const hasMeta = (data || []).some((c: any) => c.channel_type === "meta_api");
    setHasMetaChannel(hasMeta);

    if (hasMeta) {
      await loadMetaCatalogs();
    } else {
      await loadInternalProducts();
    }
    setIsLoading(false);
  };

  // ── Meta Catalog ──
  const loadMetaCatalogs = async () => {
    const { data, error } = await invokeCloud("whatsapp-catalog", { body: { action: "list_catalogs" } });
    if (!error && data?.catalogs) {
      setCatalogs(data.catalogs);
      if (data.catalogs.length > 0 && !selectedCatalog) {
        loadMetaProducts(data.catalogs[0]);
      }
    } else if (data?.error) {
      toast.error(data.error);
    }
    const { data: settings } = await invokeCloud("whatsapp-catalog", { body: { action: "get_commerce_settings" } });
    if (settings?.settings) setCommerceSettings(settings.settings);
  };

  const loadMetaProducts = async (catalog: Catalog) => {
    setSelectedCatalog(catalog);
    setIsLoadingProducts(true);
    const { data, error } = await invokeCloud("whatsapp-catalog", {
      body: { action: "list_products", catalog_id: catalog.id, limit: 100 },
    });
    if (!error && data?.products) setMetaProducts(data.products);
    else toast.error(data?.error || "تعذر جلب المنتجات");
    setIsLoadingProducts(false);
  };

  const enableCatalog = async (catalogId: string) => {
    const { data, error } = await invokeCloud("whatsapp-catalog", {
      body: { action: "update_commerce_settings", catalog_id: catalogId, is_cart_enabled: true, is_catalog_visible: true },
    });
    if (!error && data?.success) {
      toast.success("تم تفعيل الكتالوج على الرقم");
      loadMetaCatalogs();
    } else toast.error(data?.error || "تعذر تفعيل الكتالوج");
  };

  // ── Internal Products ──
  const loadInternalProducts = async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (!error) setInternalProducts(data || []);
  };

  const openAddForm = () => {
    setForm({ name: "", name_ar: "", description: "", price: "", currency: "SAR", image_url: "", sku: "", category: "", stock_quantity: "" });
    setEditProduct(null);
    setShowAddDialog(true);
  };

  const openEditForm = (p: InternalProduct) => {
    setForm({
      name: p.name,
      name_ar: p.name_ar || "",
      description: p.description || "",
      price: String(p.price),
      currency: p.currency || "SAR",
      image_url: p.image_url || "",
      sku: p.sku || "",
      category: p.category || "",
      stock_quantity: p.stock_quantity !== null ? String(p.stock_quantity) : "",
    });
    setEditProduct(p);
    setShowAddDialog(true);
  };

  const handleSaveProduct = async () => {
    if (!form.name.trim()) { toast.error("اسم المنتج مطلوب"); return; }
    if (!orgId) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        name_ar: form.name_ar.trim() || null,
        description: form.description.trim() || null,
        price: parseFloat(form.price) || 0,
        currency: form.currency || "SAR",
        image_url: form.image_url.trim() || null,
        sku: form.sku.trim() || null,
        category: form.category.trim() || null,
        stock_quantity: form.stock_quantity ? parseInt(form.stock_quantity) : null,
        org_id: orgId,
        is_active: true,
      };

      if (editProduct) {
        const { error } = await supabase.from("products").update(payload).eq("id", editProduct.id);
        if (error) throw error;
        toast.success("تم تحديث المنتج");
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
        toast.success("تم إضافة المنتج");
      }
      setShowAddDialog(false);
      await loadInternalProducts();
    } catch (err: any) {
      toast.error(err.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    const { error } = await supabase.from("products").update({ is_active: false }).eq("id", id);
    if (!error) {
      toast.success("تم حذف المنتج");
      setSelectedInternal(null);
      await loadInternalProducts();
    }
  };

  const activeCatalogId = commerceSettings?.catalog_id;

  // Filter
  const filteredMeta = metaProducts.filter((p) =>
    !searchQuery || p.name?.toLowerCase().includes(searchQuery.toLowerCase()) || p.retailer_id?.includes(searchQuery)
  );
  const filteredInternal = internalProducts.filter((p) =>
    p.is_active &&
    (!searchQuery || p.name?.toLowerCase().includes(searchQuery.toLowerCase()) || p.name_ar?.includes(searchQuery) || p.sku?.includes(searchQuery))
  );

  if (isLoading) {
    return (
      <div className="p-3 md:p-6 flex items-center justify-center min-h-[50vh]" dir="rtl">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">جاري تحميل الكتالوج...</p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════
  //  Internal Products Mode (Evolution channels)
  // ══════════════════════════════════════════
  if (!hasMetaChannel) {
    return (
      <div className="p-3 md:p-6 space-y-5" dir="rtl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-primary" /> كتالوج المنتجات
            </h1>
            <p className="text-sm text-muted-foreground mt-1">أضف وأدر منتجاتك لإرسالها للعملاء في المحادثات</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={loadInternalProducts}>
              <RefreshCw className="w-4 h-4" /> تحديث
            </Button>
            <Button size="sm" className="gap-2 shrink-0" onClick={openAddForm}>
              <Plus className="w-4 h-4" /> إضافة منتج
            </Button>
          </div>
        </div>

        {/* Search & view toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="بحث بالاسم أو SKU..." className="bg-secondary border-0 pr-9 text-sm" />
          </div>
          <div className="flex items-center border border-border rounded-lg">
            <button onClick={() => setViewMode("grid")} className={cn("p-2 rounded-r-lg transition-colors", viewMode === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode("list")} className={cn("p-2 rounded-l-lg transition-colors", viewMode === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
              <List className="w-4 h-4" />
            </button>
          </div>
          <Badge variant="outline" className="text-xs shrink-0">{filteredInternal.length} منتج</Badge>
        </div>

        {/* Products */}
        {filteredInternal.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-10 text-center">
            <ShoppingBag className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="text-base font-semibold">{searchQuery ? "لا نتائج مطابقة" : "لا توجد منتجات بعد"}</h3>
            <p className="text-sm text-muted-foreground mt-1">أضف منتجاتك هنا وستكون متاحة للإرسال من صندوق الوارد</p>
            {!searchQuery && (
              <Button size="sm" className="mt-4 gap-2" onClick={openAddForm}>
                <Plus className="w-4 h-4" /> إضافة أول منتج
              </Button>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filteredInternal.map((product) => (
              <button key={product.id} onClick={() => setSelectedInternal(product)} className="bg-card rounded-xl border border-border overflow-hidden hover:border-primary/30 hover:shadow-sm transition-all text-right">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="w-full h-32 sm:h-36 object-cover" />
                ) : (
                  <div className="w-full h-32 sm:h-36 bg-muted flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
                <div className="p-2.5 space-y-1">
                  <p className="text-xs font-semibold line-clamp-2">{product.name_ar || product.name}</p>
                  <p className="text-sm font-bold text-primary">{product.price.toFixed(2)} <span className="text-[10px] font-normal text-muted-foreground">{product.currency || "SAR"}</span></p>
                  <div className="flex items-center justify-between">
                    {product.sku && <span className="text-[9px] text-muted-foreground font-mono" dir="ltr">SKU: {product.sku}</span>}
                    {product.category && <Badge variant="outline" className="text-[8px] h-4">{product.category}</Badge>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredInternal.map((product) => (
              <button key={product.id} onClick={() => setSelectedInternal(product)} className="w-full flex items-center gap-3 bg-card rounded-xl border border-border p-3 hover:border-primary/30 hover:shadow-sm transition-all text-right">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="w-14 h-14 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <ImageIcon className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{product.name_ar || product.name}</p>
                  {product.description && <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{product.description}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-bold text-primary">{product.price.toFixed(2)} {product.currency || "SAR"}</span>
                    {product.sku && <span className="text-[10px] text-muted-foreground font-mono" dir="ltr">SKU: {product.sku}</span>}
                  </div>
                </div>
                {product.stock_quantity !== null && (
                  <Badge variant="outline" className="text-[9px] shrink-0">مخزون: {product.stock_quantity}</Badge>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Product detail dialog */}
        <Dialog open={!!selectedInternal} onOpenChange={() => setSelectedInternal(null)}>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-base">تفاصيل المنتج</DialogTitle>
            </DialogHeader>
            {selectedInternal && (
              <div className="space-y-4">
                {selectedInternal.image_url ? (
                  <img src={selectedInternal.image_url} alt={selectedInternal.name} className="w-full h-48 object-cover rounded-xl" />
                ) : (
                  <div className="w-full h-48 bg-muted rounded-xl flex items-center justify-center">
                    <ImageIcon className="w-12 h-12 text-muted-foreground" />
                  </div>
                )}
                <div className="space-y-2">
                  <h3 className="text-lg font-bold">{selectedInternal.name_ar || selectedInternal.name}</h3>
                  {selectedInternal.name_ar && selectedInternal.name !== selectedInternal.name_ar && (
                    <p className="text-sm text-muted-foreground">{selectedInternal.name}</p>
                  )}
                  {selectedInternal.description && <p className="text-sm text-muted-foreground">{selectedInternal.description}</p>}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="bg-primary/10 rounded-lg px-3 py-1.5">
                      <span className="text-lg font-bold text-primary">{selectedInternal.price.toFixed(2)}</span>
                      <span className="text-xs text-muted-foreground mr-1">{selectedInternal.currency || "SAR"}</span>
                    </div>
                    {selectedInternal.stock_quantity !== null && (
                      <Badge variant="outline">مخزون: {selectedInternal.stock_quantity}</Badge>
                    )}
                    {selectedInternal.category && <Badge variant="secondary">{selectedInternal.category}</Badge>}
                  </div>
                  {selectedInternal.sku && (
                    <div className="flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-mono" dir="ltr">SKU: {selectedInternal.sku}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Button variant="outline" size="sm" className="gap-1.5 flex-1" onClick={() => { setSelectedInternal(null); openEditForm(selectedInternal); }}>
                    <Pencil className="w-3.5 h-3.5" /> تعديل
                  </Button>
                  <Button variant="destructive" size="sm" className="gap-1.5 flex-1" onClick={() => handleDeleteProduct(selectedInternal.id)}>
                    <Trash2 className="w-3.5 h-3.5" /> حذف
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Add/Edit Product Dialog */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-base">{editProduct ? "تعديل منتج" : "إضافة منتج جديد"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1">الاسم (إنجليزي) *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Product Name" className="text-sm" />
                </div>
                <div>
                  <Label className="text-xs mb-1">الاسم (عربي)</Label>
                  <Input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} placeholder="اسم المنتج" className="text-sm" />
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1">الوصف</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="وصف المنتج..." className="text-sm min-h-[60px]" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs mb-1">السعر *</Label>
                  <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" className="text-sm" />
                </div>
                <div>
                  <Label className="text-xs mb-1">العملة</Label>
                  <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder="SAR" className="text-sm" />
                </div>
                <div>
                  <Label className="text-xs mb-1">المخزون</Label>
                  <Input type="number" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} placeholder="—" className="text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1">SKU</Label>
                  <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="SKU-001" className="text-sm" dir="ltr" />
                </div>
                <div>
                  <Label className="text-xs mb-1">التصنيف</Label>
                  <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="إلكترونيات" className="text-sm" />
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1">رابط الصورة</Label>
                <Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." className="text-sm" dir="ltr" />
                {form.image_url && (
                  <img src={form.image_url} alt="preview" className="mt-2 w-full h-24 object-cover rounded-lg" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                )}
              </div>
              <Button className="w-full gap-2" disabled={!form.name.trim() || saving} onClick={handleSaveProduct}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editProduct ? "حفظ التعديلات" : "إضافة المنتج"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ══════════════════════════════════════════
  //  Meta Catalog Mode (Official WhatsApp)
  // ══════════════════════════════════════════
  return (
    <div className="p-3 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-primary" /> كتالوج المنتجات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة كتالوجات واتساب وعرض المنتجات المرتبطة</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={loadMetaCatalogs}>
          <RefreshCw className="w-4 h-4" /> تحديث
        </Button>
      </div>

      {catalogs.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-10 text-center">
          <ShoppingBag className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-base font-semibold">لا توجد كتالوجات</h3>
          <p className="text-sm text-muted-foreground mt-1">أنشئ كتالوج منتجات من Meta Commerce Manager لعرضه هنا</p>
          <a href="https://business.facebook.com/commerce" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-3">
            <ExternalLink className="w-4 h-4" /> فتح Commerce Manager
          </a>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {catalogs.map((catalog) => {
              const isActive = activeCatalogId === catalog.id;
              const isSelected = selectedCatalog?.id === catalog.id;
              return (
                <button key={catalog.id} onClick={() => loadMetaProducts(catalog)} className={cn(
                  "flex items-center gap-2 rounded-xl border px-4 py-2.5 transition-all text-right",
                  isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/30"
                )}>
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

          {selectedCatalog && activeCatalogId !== selectedCatalog.id && (
            <div className="bg-warning/5 border border-warning/20 rounded-xl p-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">هذا الكتالوج غير مفعّل على رقم الواتساب بعد</p>
              <Button size="sm" className="gap-1.5 text-xs shrink-0" onClick={() => enableCatalog(selectedCatalog.id)}>
                <ShoppingCart className="w-3.5 h-3.5" /> تفعيل الكتالوج
              </Button>
            </div>
          )}

          {selectedCatalog && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="بحث في المنتجات..." className="bg-secondary border-0 pr-9 text-sm" />
              </div>
              <div className="flex items-center border border-border rounded-lg">
                <button onClick={() => setViewMode("grid")} className={cn("p-2 rounded-r-lg transition-colors", viewMode === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
                  <Grid3X3 className="w-4 h-4" />
                </button>
                <button onClick={() => setViewMode("list")} className={cn("p-2 rounded-l-lg transition-colors", viewMode === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
                  <List className="w-4 h-4" />
                </button>
              </div>
              <Badge variant="outline" className="text-xs shrink-0">{filteredMeta.length} منتج</Badge>
            </div>
          )}

          {isLoadingProducts ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : filteredMeta.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-8 text-center">
              <Package className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-semibold">لا توجد منتجات</p>
              <p className="text-xs text-muted-foreground mt-1">{searchQuery ? "جرّب كلمة بحث مختلفة" : "أضف منتجات من Commerce Manager"}</p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredMeta.map((product) => (
                <button key={product.id} onClick={() => setSelectedProduct(product)} className="bg-card rounded-xl border border-border overflow-hidden hover:border-primary/30 hover:shadow-sm transition-all text-right">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-full h-32 sm:h-36 object-cover" />
                  ) : (
                    <div className="w-full h-32 sm:h-36 bg-muted flex items-center justify-center"><ImageIcon className="w-8 h-8 text-muted-foreground" /></div>
                  )}
                  <div className="p-2.5 space-y-1">
                    <p className="text-xs font-semibold line-clamp-2">{product.name}</p>
                    {product.price && <p className="text-sm font-bold text-primary">{product.price} <span className="text-[10px] font-normal text-muted-foreground">{product.currency || "SAR"}</span></p>}
                    <div className="flex items-center justify-between">
                      {product.retailer_id && <span className="text-[9px] text-muted-foreground font-mono" dir="ltr">SKU: {product.retailer_id}</span>}
                      <Badge className={cn("text-[8px] border-0 h-4", product.availability === "in stock" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
                        {product.availability === "in stock" ? "متوفر" : "غير متوفر"}
                      </Badge>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMeta.map((product) => (
                <button key={product.id} onClick={() => setSelectedProduct(product)} className="w-full flex items-center gap-3 bg-card rounded-xl border border-border p-3 hover:border-primary/30 hover:shadow-sm transition-all text-right">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-14 h-14 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center shrink-0"><ImageIcon className="w-6 h-6 text-muted-foreground" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{product.name}</p>
                    {product.description && <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{product.description}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      {product.price && <span className="text-xs font-bold text-primary">{product.price} {product.currency || "SAR"}</span>}
                      {product.retailer_id && <span className="text-[10px] text-muted-foreground font-mono" dir="ltr">SKU: {product.retailer_id}</span>}
                    </div>
                  </div>
                  <Badge className={cn("text-[9px] border-0 shrink-0", product.availability === "in stock" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
                    {product.availability === "in stock" ? "متوفر" : "غير متوفر"}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="text-base">تفاصيل المنتج</DialogTitle></DialogHeader>
          {selectedProduct && (
            <div className="space-y-4">
              {selectedProduct.image_url ? (
                <img src={selectedProduct.image_url} alt={selectedProduct.name} className="w-full h-48 object-cover rounded-xl" />
              ) : (
                <div className="w-full h-48 bg-muted rounded-xl flex items-center justify-center"><ImageIcon className="w-12 h-12 text-muted-foreground" /></div>
              )}
              <div className="space-y-2">
                <h3 className="text-lg font-bold">{selectedProduct.name}</h3>
                {selectedProduct.description && <p className="text-sm text-muted-foreground">{selectedProduct.description}</p>}
                <div className="flex items-center gap-3 flex-wrap">
                  {selectedProduct.price && (
                    <div className="bg-primary/10 rounded-lg px-3 py-1.5">
                      <span className="text-lg font-bold text-primary">{selectedProduct.price}</span>
                      <span className="text-xs text-muted-foreground mr-1">{selectedProduct.currency || "SAR"}</span>
                    </div>
                  )}
                  <Badge className={cn("border-0", selectedProduct.availability === "in stock" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
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
                <a href={selectedProduct.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
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

