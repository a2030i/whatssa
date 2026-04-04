import { useState, useEffect } from "react";
import { ShoppingBag, Search, Loader2, Send, Check, Package, Grid3X3, ImageIcon, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

interface Product {
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
}

interface InternalProductPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendProduct: (payload: {
    sendMode: "image" | "text";
    product: Product;
  }) => Promise<void>;
}

const InternalProductPicker = ({ open, onOpenChange, onSendProduct }: InternalProductPickerProps) => {
  const isMobile = useIsMobile();
  const { orgId } = useAuth();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [sendMode, setSendMode] = useState<"image" | "text">("image");

  useEffect(() => {
    if (open && products.length === 0 && !loading && orgId) {
      loadProducts();
    }
  }, [open, orgId]);

  const loadProducts = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, name_ar, description, price, currency, image_url, sku, category, is_active")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("name")
        .limit(200);
      if (error) throw error;
      setProducts(data || []);
    } catch {
      toast.error("فشل تحميل المنتجات");
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (product: Product) => {
    setSending(product.id);
    try {
      await onSendProduct({ sendMode, product });
      onOpenChange(false);
    } catch {
      toast.error("فشل إرسال المنتج");
    } finally {
      setSending(null);
    }
  };

  const formatPrice = (price: number, currency: string | null) => {
    return `${price.toFixed(2)} ${currency || "SAR"}`;
  };

  const filtered = products.filter(
    (p) =>
      !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.name_ar?.toLowerCase().includes(search.toLowerCase()) ||
      p.sku?.toLowerCase().includes(search.toLowerCase()) ||
      p.category?.toLowerCase().includes(search.toLowerCase())
  );

  const content = (
    <div className="flex flex-col gap-3 h-full max-h-[70vh] md:max-h-[60vh]" dir="rtl">
      {/* Send mode toggle */}
      <Tabs value={sendMode} onValueChange={(v) => setSendMode(v as "image" | "text")}>
        <TabsList className="w-full grid grid-cols-2 h-9">
          <TabsTrigger value="image" className="text-xs gap-1.5">
            <ImageIcon className="w-3.5 h-3.5" /> صورة + تعليق
          </TabsTrigger>
          <TabsTrigger value="text" className="text-xs gap-1.5">
            <FileText className="w-3.5 h-3.5" /> نص منسق فقط
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو SKU أو التصنيف..."
          className="pr-9 bg-secondary/60 border-0 text-sm h-9 rounded-lg"
        />
      </div>

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
            <span className="text-sm text-muted-foreground">
              {search ? "لا نتائج مطابقة" : "لا توجد منتجات — أضف منتجات من صفحة الكتالوج"}
            </span>
          </div>
        ) : (
          filtered.map((product) => (
            <button
              key={product.id}
              onClick={() => handleSend(product)}
              disabled={sending === product.id}
              className={cn(
                "w-full flex items-center gap-3 rounded-xl p-2.5 transition-all text-right",
                "hover:bg-secondary/80 active:scale-[0.98]",
                "bg-secondary/40"
              )}
            >
              {/* Image */}
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-14 h-14 rounded-lg object-cover shrink-0 bg-muted"
                />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <ShoppingBag className="w-5 h-5 text-muted-foreground/50" />
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate leading-tight">
                  {product.name_ar || product.name}
                </p>
                {product.description && (
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5 leading-tight">
                    {product.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-bold text-primary">
                    {formatPrice(product.price, product.currency)}
                  </span>
                  {product.sku && (
                    <span className="text-[10px] text-muted-foreground/70 font-mono" dir="ltr">
                      {product.sku}
                    </span>
                  )}
                  {product.category && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1">
                      {product.category}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Send icon */}
              {sending === product.id ? (
                <Loader2 className="w-4 h-4 text-primary shrink-0 animate-spin" />
              ) : (
                <Send className="w-4 h-4 text-primary shrink-0 opacity-50" style={{ transform: "scaleX(-1)" }} />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="px-4 pb-6">
          <DrawerHeader className="px-0 pb-2">
            <DrawerTitle className="flex items-center gap-2 text-base">
              <ShoppingBag className="w-4.5 h-4.5 text-primary" /> إرسال منتج
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
            <ShoppingBag className="w-4.5 h-4.5 text-primary" /> إرسال منتج
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
};

export default InternalProductPicker;
