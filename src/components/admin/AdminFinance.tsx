import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Wallet, Plus, ArrowUpCircle, ArrowDownCircle, DollarSign, TrendingUp, CreditCard } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const AdminFinance = () => {
  const [wallets, setWallets] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [showAddCredit, setShowAddCredit] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditDesc, setCreditDesc] = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [w, o, t, p] = await Promise.all([
      supabase.from("wallets").select("*"),
      supabase.from("organizations").select("id, name, plan_id, subscription_status"),
      supabase.from("wallet_transactions").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("plans").select("id, name_ar, price"),
    ]);
    setWallets(w.data || []);
    setOrgs(o.data || []);
    setTransactions(t.data || []);
    setPlans(p.data || []);
  };

  const addCredit = async (orgId: string) => {
    const amount = parseFloat(creditAmount);
    if (!amount || amount <= 0) { toast.error("أدخل مبلغ صحيح"); return; }
    const wallet = wallets.find((w) => w.org_id === orgId);
    if (!wallet) { toast.error("لا توجد محفظة"); return; }

    const newBalance = Number(wallet.balance) + amount;
    await supabase.from("wallets").update({ balance: newBalance, updated_at: new Date().toISOString() }).eq("id", wallet.id);
    await supabase.from("wallet_transactions").insert({
      wallet_id: wallet.id, org_id: orgId, type: "credit", amount,
      balance_after: newBalance, description: creditDesc || "إضافة رصيد يدوية", reference_type: "manual",
    });
    toast.success(`تم إضافة ${amount} ر.س`);
    setCreditAmount(""); setCreditDesc(""); setShowAddCredit(null);
    load();
  };

  const getOrgName = (orgId: string) => orgs.find((o) => o.id === orgId)?.name || orgId.slice(0, 8);

  // Financial Summary
  const totalBalance = wallets.reduce((s, w) => s + Number(w.balance), 0);
  const totalCredits = transactions.filter(t => t.type === "credit").reduce((s, t) => s + Number(t.amount), 0);
  const totalDebits = transactions.filter(t => t.type === "debit").reduce((s, t) => s + Number(t.amount), 0);
  
  // Monthly revenue estimate from active subscriptions
  const monthlyRevenue = orgs.reduce((s, o) => {
    if (o.subscription_status !== "active") return s;
    const plan = plans.find(p => p.id === o.plan_id);
    return s + (plan?.price || 0);
  }, 0);

  // Monthly transactions chart
  const monthlyChart: Record<string, { month: string; credits: number; debits: number }> = {};
  transactions.forEach(t => {
    const month = t.created_at?.slice(0, 7) || "";
    if (!monthlyChart[month]) monthlyChart[month] = { month, credits: 0, debits: 0 };
    if (t.type === "credit") monthlyChart[month].credits += Number(t.amount);
    else monthlyChart[month].debits += Number(t.amount);
  });
  const chartData = Object.values(monthlyChart).reverse().slice(-6);

  const summaryCards = [
    { label: "إجمالي رصيد المحافظ", value: `${totalBalance.toLocaleString()} ر.س`, icon: Wallet, color: "text-primary", bg: "bg-primary/10" },
    { label: "إجمالي الشحنات", value: `${totalCredits.toLocaleString()} ر.س`, icon: ArrowUpCircle, color: "text-emerald-600", bg: "bg-emerald-500/10" },
    { label: "إجمالي الخصومات", value: `${totalDebits.toLocaleString()} ر.س`, icon: ArrowDownCircle, color: "text-destructive", bg: "bg-destructive/10" },
    { label: "الإيرادات الشهرية (اشتراكات)", value: `${monthlyRevenue.toLocaleString()} ر.س`, icon: TrendingUp, color: "text-amber-600", bg: "bg-amber-500/10" },
  ];

  return (
    <div className="space-y-6">
      {/* Financial Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryCards.map((card) => (
          <div key={card.label} className="bg-card rounded-xl p-4 shadow-card border border-border/50">
            <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <p className="text-lg font-bold">{card.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Revenue Chart */}
      {chartData.length > 0 && (
        <div className="bg-card rounded-xl shadow-card border border-border/50 p-4">
          <h3 className="font-semibold text-sm mb-4">حركة المحافظ الشهرية</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="credits" name="شحن" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="debits" name="خصم" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Wallets */}
      <div className="bg-card rounded-xl shadow-card border border-border/50">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm">المحافظ ({wallets.length})</h2>
        </div>
        <div className="divide-y divide-border">
          {wallets.map((w) => (
            <div key={w.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{getOrgName(w.org_id)}</p>
                  <p className="text-xl font-bold text-primary mt-1">{Number(w.balance).toFixed(2)} ر.س</p>
                </div>
                <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => setShowAddCredit(showAddCredit === w.org_id ? null : w.org_id)}>
                  <Plus className="w-3 h-3" /> إضافة رصيد
                </Button>
              </div>
              {showAddCredit === w.org_id && (
                <div className="mt-3 flex items-end gap-2 bg-secondary/50 rounded-lg p-3">
                  <div className="flex-1">
                    <Label className="text-[10px]">المبلغ (ر.س)</Label>
                    <Input type="number" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} className="h-8 text-sm" placeholder="100" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-[10px]">الوصف</Label>
                    <Input value={creditDesc} onChange={(e) => setCreditDesc(e.target.value)} className="h-8 text-sm" placeholder="إضافة رصيد" />
                  </div>
                  <Button size="sm" className="h-8 text-xs" onClick={() => addCredit(w.org_id)}>إضافة</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-card rounded-xl shadow-card border border-border/50">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-sm">آخر المعاملات</h2>
        </div>
        <div className="divide-y divide-border">
          {transactions.slice(0, 20).map((t) => (
            <div key={t.id} className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {t.type === "credit" ? <ArrowUpCircle className="w-4 h-4 text-primary" /> : <ArrowDownCircle className="w-4 h-4 text-destructive" />}
                <div>
                  <p className="text-xs font-medium">{t.description || t.type}</p>
                  <p className="text-[10px] text-muted-foreground">{getOrgName(t.org_id)} · {new Date(t.created_at).toLocaleDateString("ar-SA")}</p>
                </div>
              </div>
              <div className="text-left">
                <p className={`text-sm font-bold ${t.type === "credit" ? "text-primary" : "text-destructive"}`}>
                  {t.type === "credit" ? "+" : "-"}{Number(t.amount).toFixed(2)} ر.س
                </p>
                <p className="text-[10px] text-muted-foreground">رصيد: {Number(t.balance_after).toFixed(2)}</p>
              </div>
            </div>
          ))}
          {transactions.length === 0 && <p className="p-6 text-center text-muted-foreground text-sm">لا توجد معاملات</p>}
        </div>
      </div>
    </div>
  );
};

export default AdminFinance;
