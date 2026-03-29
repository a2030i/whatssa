import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Wallet, ArrowUpCircle, ArrowDownCircle, CreditCard, BarChart3, MessageSquare, Users, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const WalletPage = () => {
  const { orgId } = useAuth();
  const [wallet, setWallet] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);
  const [couponCode, setCouponCode] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);

  useEffect(() => { if (orgId) load(); }, [orgId]);

  const load = async () => {
    const period = new Date().toISOString().slice(0, 7);
    const [w, t, u, org] = await Promise.all([
      supabase.from("wallets").select("*").eq("org_id", orgId!).maybeSingle(),
      supabase.from("wallet_transactions").select("*").eq("org_id", orgId!).order("created_at", { ascending: false }).limit(20),
      supabase.from("usage_tracking").select("*").eq("org_id", orgId!).eq("period", period).maybeSingle(),
      supabase.from("organizations").select("*, plans(*)").eq("id", orgId!).maybeSingle(),
    ]);
    setWallet(w.data);
    setTransactions(t.data || []);
    setUsage(u.data);
    if (org.data) setPlan((org.data as any).plans);
  };

  const redeemCoupon = async () => {
    if (!couponCode.trim()) return;
    setIsRedeeming(true);
    const { data: coupon } = await supabase.from("coupons").select("*").eq("code", couponCode.toUpperCase()).eq("is_active", true).maybeSingle();
    if (!coupon) { toast.error("كوبون غير صالح"); setIsRedeeming(false); return; }
    if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) { toast.error("الكوبون منتهي الاستخدام"); setIsRedeeming(false); return; }

    const { data: existing } = await supabase.from("coupon_redemptions").select("id").eq("coupon_id", coupon.id).eq("org_id", orgId!).maybeSingle();
    if (existing) { toast.error("تم استخدام هذا الكوبون مسبقاً"); setIsRedeeming(false); return; }

    const discountAmount = coupon.discount_type === "percentage"
      ? (plan?.price || 0) * (coupon.discount_value / 100)
      : coupon.discount_value;

    if (wallet) {
      const newBalance = Number(wallet.balance) + discountAmount;
      await supabase.from("wallets").update({ balance: newBalance }).eq("id", wallet.id);
      await supabase.from("wallet_transactions").insert({
        wallet_id: wallet.id, org_id: orgId!, type: "credit", amount: discountAmount,
        balance_after: newBalance, description: `كوبون خصم: ${coupon.code}`, reference_type: "coupon", reference_id: coupon.id,
      });
    }
    await supabase.from("coupon_redemptions").insert({ coupon_id: coupon.id, org_id: orgId!, discount_amount: discountAmount });
    await supabase.from("coupons").update({ used_count: coupon.used_count + 1 }).eq("id", coupon.id);

    toast.success(`تم تطبيق الكوبون! +${discountAmount.toFixed(2)} ر.س`);
    setCouponCode("");
    setIsRedeeming(false);
    load();
  };

  const getUsagePercent = (used: number, limit: number) => limit >= 999999 ? 0 : Math.min((used / limit) * 100, 100);

  const [teamCount, setTeamCount] = useState(0);
  const [phoneCount, setPhoneCount] = useState(0);

  useEffect(() => {
    if (!orgId) return;
    const loadCounts = async () => {
      const [team, phones] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("is_active", true),
        supabase.from("whatsapp_config").select("id", { count: "exact", head: true }).eq("org_id", orgId),
      ]);
      setTeamCount(team.count || 0);
      setPhoneCount(phones.count || 0);
    };
    loadCounts();
  }, [orgId]);

  const usageItems = [
    { label: "المحادثات", value: usage?.conversations_count || 0, limit: plan?.max_conversations || 0, icon: BarChart3 },
    { label: "أعضاء الفريق", value: teamCount, limit: plan?.max_team_members || 1, icon: Users },
    { label: "أرقام واتساب", value: phoneCount, limit: plan?.max_phone_numbers || 1, icon: Phone },
  ];

  return (
    <div className="p-3 md:p-6 space-y-6 max-w-[800px]" dir="rtl">
      <div>
        <h1 className="text-xl font-bold">المحفظة والاستخدام</h1>
        <p className="text-sm text-muted-foreground mt-1">رصيدك وحدود استخدامك الحالية</p>
      </div>

      {/* Wallet Balance */}
      <div className="bg-card rounded-xl shadow-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">الرصيد الحالي</p>
            <p className="text-3xl font-bold text-primary mt-1">{Number(wallet?.balance || 0).toFixed(2)} <span className="text-lg">ر.س</span></p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Wallet className="w-7 h-7 text-primary" />
          </div>
        </div>

        {/* Plan info */}
        {plan && (
          <div className="mt-4 bg-secondary/50 rounded-lg p-3 flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs font-semibold">باقة {plan.name_ar}</p>
              <p className="text-[10px] text-muted-foreground">{plan.price == 0 ? "مجانية" : `${plan.price} ر.س/شهر`}</p>
            </div>
          </div>
        )}

        {/* Coupon Redemption */}
        <div className="mt-4 flex gap-2">
          <Input
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
            placeholder="أدخل كود الكوبون"
            className="text-sm flex-1"
            dir="ltr"
          />
          <Button size="sm" onClick={redeemCoupon} disabled={isRedeeming} className="text-xs">
            تطبيق
          </Button>
        </div>
      </div>

      {/* Usage Limits */}
      <div className="bg-card rounded-xl shadow-card">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" /> حدود الاستخدام</h2>
        </div>
        <div className="p-4 grid grid-cols-2 gap-4">
          {usageItems.map((item) => {
            const percent = getUsagePercent(item.value, item.limit);
            return (
              <div key={item.label} className="space-y-2">
                <div className="flex items-center gap-2">
                  <item.icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                </div>
                <p className="text-lg font-bold">{item.value} <span className="text-xs text-muted-foreground font-normal">/ {item.limit >= 999999 ? "∞" : item.limit}</span></p>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${percent > 90 ? "bg-destructive" : percent > 70 ? "bg-yellow-500" : "bg-primary"}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Transactions */}
      <div className="bg-card rounded-xl shadow-card">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-sm">سجل المعاملات</h2>
        </div>
        <div className="divide-y divide-border">
          {transactions.map((t) => (
            <div key={t.id} className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {t.type === "credit" || t.type === "refund" || t.type === "coupon"
                  ? <ArrowUpCircle className="w-4 h-4 text-primary" />
                  : <ArrowDownCircle className="w-4 h-4 text-destructive" />}
                <div>
                  <p className="text-xs font-medium">{t.description || t.type}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString("ar-SA")}</p>
                </div>
              </div>
              <p className={`text-sm font-bold ${t.type === "debit" || t.type === "subscription" ? "text-destructive" : "text-primary"}`}>
                {t.type === "debit" || t.type === "subscription" ? "-" : "+"}{Number(t.amount).toFixed(2)} ر.س
              </p>
            </div>
          ))}
          {transactions.length === 0 && <p className="p-6 text-center text-muted-foreground text-sm">لا توجد معاملات بعد</p>}
        </div>
      </div>
    </div>
  );
};

export default WalletPage;