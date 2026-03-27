import { useState, useEffect } from "react";
import { ShoppingBag, Clock, Send, CheckCircle2, XCircle, Search, AlertTriangle, DollarSign, TrendingUp, Loader2, MessageSquare, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const recoveryConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "لم يُرسل تذكير", color: "bg-warning/10 text-warning" },
  reminded: { label: "تم التذكير", color: "bg-info/10 text-info" },
  recovered: { label: "تم الاسترداد", color: "bg-success/10 text-success" },
  lost: { label: "فُقدت", color: "bg-muted text-muted-foreground" },
};

const AbandonedCartsPage = () => {
  const { orgId } = useAuth();
  const [carts, setCarts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedCart, setSelectedCart] = useState<any>(null);

  useEffect(() => { if (orgId) loadCarts(); }, [orgId]);

  const loadCarts = async () => {
    const { data } = await supabase.from("abandoned_carts").select("*").eq("org_id", orgId!).order("abandoned_at", { ascending: false });
    setCarts(data || []);
    setLoading(false);
  };

  const sendReminder = async (cart: any) => {
    if (!cart.customer_phone) { toast.error("لا يوجد رقم هاتف"); return; }
    
    // Send WhatsApp reminder
    const message = `مرحباً ${cart.customer_name || ""}! 🛒\n\nلاحظنا أنك تركت منتجات في سلة التسوق بقيمة ${Number(cart.total).toFixed(2)} ر.س\n\nأكمل طلبك الآن${cart.checkout_url ? `: ${cart.checkout_url}` : ""}`;
    
    await supabase.functions.invoke("whatsapp-send", {
      body: { to: cart.customer_phone, message }
    }).catch(() => {});

    await supabase.from("abandoned_carts").update({
      recovery_status: "reminded",
      reminder_sent_at: new Date().toISOString(),
      reminder_count: (cart.reminder_count || 0) + 1,
    }).eq("id", cart.id);

    toast.success("تم إرسال التذكير عبر واتساب");
    loadCarts();
  };

  const markAsRecovered = async (cartId: string) => {
    await supabase.from("abandoned_carts").update({
      recovery_status: "recovered",
      recovered_at: new Date().toISOString(),
    }).eq("id", cartId);
    toast.success("تم تحديث الحالة");
    loadCarts();
  };

  const markAsLost = async (cartId: string) => {
    await supabase.from("abandoned_carts").update({ recovery_status: "lost" }).eq("id", cartId);
    toast.success("تم تحديث الحالة");
    loadCarts();
  };

  const filteredCarts = carts.filter(c => {
    if (searchQuery && !c.customer_name?.includes(searchQuery) && !c.customer_phone?.includes(searchQuery)) return false;
    if (statusFilter !== "all" && c.recovery_status !== statusFilter) return false;
    return true;
  });

  const totalValue = carts.reduce((s, c) => s + Number(c.total || 0), 0);
  const recoveredValue = carts.filter(c => c.recovery_status === "recovered").reduce((s, c) => s + Number(c.total || 0), 0);
  const pendingCount = carts.filter(c => c.recovery_status === "pending").length;
  const recoveryRate = carts.length > 0 ? ((carts.filter(c => c.recovery_status === "recovered").length / carts.length) * 100).toFixed(0) : "0";

  const timeSince = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "أقل من ساعة";
    if (hours < 24) return `${hours} ساعة`;
    return `${Math.floor(hours / 24)} يوم`;
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><ShoppingBag className="w-5 h-5 text-warning" /> السلات المتروكة</h1>
        <p className="text-sm text-muted-foreground mt-0.5">استرد المبيعات المفقودة بإرسال تذكيرات عبر واتساب</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl shadow-card p-4">
          <div className="flex items-center justify-between mb-2"><span className="text-xs text-muted-foreground">إجمالي السلات</span><ShoppingBag className="w-4 h-4 text-warning" /></div>
          <p className="text-xl font-bold">{carts.length}</p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-4">
          <div className="flex items-center justify-between mb-2"><span className="text-xs text-muted-foreground">القيمة المتروكة</span><DollarSign className="w-4 h-4 text-destructive" /></div>
          <p className="text-xl font-bold">{totalValue.toFixed(0)} <span className="text-sm font-normal">ر.س</span></p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-4">
          <div className="flex items-center justify-between mb-2"><span className="text-xs text-muted-foreground">تم الاسترداد</span><CheckCircle2 className="w-4 h-4 text-success" /></div>
          <p className="text-xl font-bold">{recoveredValue.toFixed(0)} <span className="text-sm font-normal">ر.س</span></p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-4">
          <div className="flex items-center justify-between mb-2"><span className="text-xs text-muted-foreground">نسبة الاسترداد</span><TrendingUp className="w-4 h-4 text-primary" /></div>
          <p className="text-xl font-bold">{recoveryRate}%</p>
        </div>
      </div>

      {/* Pending alert */}
      {pendingCount > 0 && (
        <div className="bg-warning/5 border border-warning/20 rounded-xl p-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">{pendingCount} سلة بانتظار التذكير</p>
            <p className="text-xs text-muted-foreground">أرسل تذكيرات لاسترداد المبيعات</p>
          </div>
          <Button size="sm" className="text-xs gap-1" onClick={() => {
            carts.filter(c => c.recovery_status === "pending").forEach(c => sendReminder(c));
          }}>
            <Send className="w-3 h-3" /> تذكير الكل
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="بحث..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pr-9 bg-card border-0 shadow-card text-sm" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-card border-0 shadow-card text-xs"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {Object.entries(recoveryConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Carts List */}
      <div className="space-y-3">
        {filteredCarts.length === 0 ? (
          <div className="bg-card rounded-xl shadow-card p-12 text-center">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">لا توجد سلات متروكة</p>
          </div>
        ) : (
          filteredCarts.map((cart) => {
            const rc = recoveryConfig[cart.recovery_status] || recoveryConfig.pending;
            const items = Array.isArray(cart.items) ? cart.items : [];
            return (
              <div key={cart.id} className="bg-card rounded-xl shadow-card p-4 hover:shadow-card-hover transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
                      <ShoppingBag className="w-5 h-5 text-warning" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{cart.customer_name || cart.customer_phone || "عميل مجهول"}</p>
                      <p className="text-[11px] text-muted-foreground">تُركت منذ {timeSince(cart.abandoned_at || cart.created_at)}</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm">{Number(cart.total).toFixed(2)} ر.س</p>
                    <Badge className={cn("text-[10px] border-0", rc.color)}>{rc.label}</Badge>
                  </div>
                </div>

                {/* Items preview */}
                {items.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {items.slice(0, 3).map((item: any, i: number) => (
                      <span key={i} className="text-[10px] bg-secondary px-2 py-1 rounded-full">{item.name || item.product_name} × {item.quantity || 1}</span>
                    ))}
                    {items.length > 3 && <span className="text-[10px] text-muted-foreground px-2 py-1">+{items.length - 3} أخرى</span>}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-3 flex items-center gap-2">
                  {cart.recovery_status === "pending" && (
                    <Button size="sm" className="text-xs gap-1 h-7" onClick={() => sendReminder(cart)}>
                      <MessageSquare className="w-3 h-3" /> إرسال تذكير
                    </Button>
                  )}
                  {cart.recovery_status === "reminded" && (
                    <>
                      <Button size="sm" variant="outline" className="text-xs gap-1 h-7" onClick={() => sendReminder(cart)}>
                        <Send className="w-3 h-3" /> تذكير مرة أخرى ({cart.reminder_count})
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs gap-1 h-7 text-success" onClick={() => markAsRecovered(cart.id)}>
                        <CheckCircle2 className="w-3 h-3" /> تم الشراء
                      </Button>
                      <Button size="sm" variant="ghost" className="text-xs gap-1 h-7 text-muted-foreground" onClick={() => markAsLost(cart.id)}>
                        <XCircle className="w-3 h-3" /> فقدت
                      </Button>
                    </>
                  )}
                  {cart.checkout_url && (
                    <a href={cart.checkout_url} target="_blank" className="text-[10px] text-primary flex items-center gap-0.5 hover:underline mr-auto">
                      <ExternalLink className="w-3 h-3" /> رابط السلة
                    </a>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AbandonedCartsPage;
