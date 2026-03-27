import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Wallet, Plus, ArrowUpCircle, ArrowDownCircle } from "lucide-react";

const AdminFinance = () => {
  const [wallets, setWallets] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [showAddCredit, setShowAddCredit] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditDesc, setCreditDesc] = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [w, o, t] = await Promise.all([
      supabase.from("wallets").select("*"),
      supabase.from("organizations").select("id, name"),
      supabase.from("wallet_transactions").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setWallets(w.data || []);
    setOrgs(o.data || []);
    setTransactions(t.data || []);
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

  return (
    <div className="space-y-6">
      {/* Wallets */}
      <div className="bg-card rounded-xl shadow-card">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm">المحافظ</h2>
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
      <div className="bg-card rounded-xl shadow-card">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-sm">آخر المعاملات</h2>
        </div>
        <div className="divide-y divide-border">
          {transactions.map((t) => (
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