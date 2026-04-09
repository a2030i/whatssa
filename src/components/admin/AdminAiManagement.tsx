import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Brain, Sparkles, BarChart3, RefreshCw, Search, Wallet, Plus, TrendingUp, Trophy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// التسعير: تكلفة الوحدة = 0.038 ريال (تكلفة فعلية)، سعر البيع = 0.05 ريال (مجاني حالياً)
const COST_PER_TOKEN_SAR = 0.038; // تكلفة المزود
const SELL_PRICE_PER_TOKEN_SAR = 0.05; // سعر البيع للعميل

const formatSAR = (amount: number) => {
  if (amount >= 1000) return amount.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
  return amount.toFixed(2) + " ر.س";
};

const tokensToSAR = (tokens: number) => tokens * SELL_PRICE_PER_TOKEN_SAR;
const tokensToCostSAR = (tokens: number) => tokens * COST_PER_TOKEN_SAR;

interface OrgAiStatus {
  org_id: string;
  org_name: string;
  enabled: boolean;
  total_calls: number;
  tokens_used: number;
  last_used: string | null;
}

const RECHARGE_OPTIONS = [
  { label: "500 ر.س", tokens: 10000 },
  { label: "2,500 ر.س", tokens: 50000 },
  { label: "5,000 ر.س", tokens: 100000 },
  { label: "25,000 ر.س", tokens: 500000 },
];

const AdminAiManagement = () => {
  const [orgs, setOrgs] = useState<OrgAiStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [totalCalls, setTotalCalls] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);
  const [aiBalance, setAiBalance] = useState(0);
  const [customRecharge, setCustomRecharge] = useState("");
  const [rechargeOpen, setRechargeOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);

    const [orgRes, settingsRes, usageRes, balanceRes] = await Promise.all([
      supabase.from("organizations").select("id, name").eq("is_active", true).order("name"),
      supabase.from("system_settings").select("key, value").like("key", "lovable_ai_%"),
      supabase.from("ai_usage_logs" as any).select("org_id, action, tokens_used, created_at").order("created_at", { ascending: false }).limit(1000),
      supabase.from("system_settings").select("value").eq("key", "lovable_ai_balance").maybeSingle(),
    ]);

    setAiBalance(Number(balanceRes.data?.value) || 0);

    const enabledMap: Record<string, boolean> = {};
    (settingsRes.data || []).forEach((s: any) => {
      if (s.key.startsWith("lovable_ai_enabled_")) {
        const orgId = s.key.replace("lovable_ai_enabled_", "");
        enabledMap[orgId] = s.value === true || s.value === "true";
      }
    });

    const usageCounts: Record<string, { count: number; tokens: number; last: string | null }> = {};
    let allTokens = 0;
    (usageRes.data || []).forEach((u: any) => {
      if (!usageCounts[u.org_id]) usageCounts[u.org_id] = { count: 0, tokens: 0, last: null };
      usageCounts[u.org_id].count++;
      usageCounts[u.org_id].tokens += (u.tokens_used || 0);
      allTokens += (u.tokens_used || 0);
      if (!usageCounts[u.org_id].last) usageCounts[u.org_id].last = u.created_at;
    });

    const orgStatuses: OrgAiStatus[] = (orgRes.data || []).map((o: any) => ({
      org_id: o.id,
      org_name: o.name,
      enabled: enabledMap[o.id] || false,
      total_calls: usageCounts[o.id]?.count || 0,
      tokens_used: usageCounts[o.id]?.tokens || 0,
      last_used: usageCounts[o.id]?.last || null,
    }));

    orgStatuses.sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return b.tokens_used - a.tokens_used;
    });

    setOrgs(orgStatuses);
    setTotalCalls((usageRes.data || []).length);
    setTotalTokens(allTokens);
    setIsLoading(false);
  };

  const toggleOrgAi = async (orgId: string, enable: boolean) => {
    const key = `lovable_ai_enabled_${orgId}`;
    const { data: existing } = await supabase
      .from("system_settings").select("key").eq("key", key).maybeSingle();

    if (existing) {
      const { error } = await supabase.from("system_settings").update({ value: enable, updated_at: new Date().toISOString() } as any).eq("key", key);
      if (error) { console.error("toggle AI error:", error); toast.error("فشل الحفظ"); return; }
    } else {
      const { error } = await supabase.from("system_settings").insert({ key, value: enable, description: "Lovable AI enabled for org" } as any);
      if (error) { console.error("toggle AI error:", error); toast.error("فشل الحفظ"); return; }
    }

    setOrgs(prev => prev.map(o => o.org_id === orgId ? { ...o, enabled: enable } : o));
    toast.success(enable ? "✨ تم تفعيل Lovable AI" : "تم إيقاف Lovable AI");
  };

  const handleRecharge = async (tokens: number) => {
    if (tokens <= 0) return;
    const newBalance = aiBalance + tokens;
    const { data: existing } = await supabase
      .from("system_settings").select("key").eq("key", "lovable_ai_balance").maybeSingle();

    if (existing) {
      await supabase.from("system_settings").update({ value: newBalance, updated_at: new Date().toISOString() }).eq("key", "lovable_ai_balance");
    } else {
      await supabase.from("system_settings").insert({ key: "lovable_ai_balance", value: newBalance, description: "Lovable AI token balance" });
    }

    setAiBalance(newBalance);
    setRechargeOpen(false);
    setCustomRecharge("");
    toast.success(`✅ تم شحن ${formatSAR(tokensToSAR(tokens))}`);
  };

  const filtered = orgs.filter(o => o.org_name.toLowerCase().includes(search.toLowerCase()));
  const enabledCount = orgs.filter(o => o.enabled).length;
  const usedPercent = aiBalance > 0 ? Math.min(100, (totalTokens / aiBalance) * 100) : 0;
  const remaining = Math.max(0, aiBalance - totalTokens);

  const totalCostSAR = tokensToCostSAR(totalTokens);
  const totalSellSAR = tokensToSAR(totalTokens);
  const remainingSAR = tokensToSAR(remaining);
  const balanceSAR = tokensToSAR(aiBalance);

  const topConsumers = [...orgs].filter(o => o.tokens_used > 0).sort((a, b) => b.tokens_used - a.tokens_used).slice(0, 5);

  return (
    <div className="space-y-6">
      <h2 className="font-semibold text-sm flex items-center gap-2">
        <Brain className="w-4 h-4 text-primary" /> إدارة Lovable AI
      </h2>

      {/* Balance Card */}
      <div className="bg-gradient-to-l from-primary/10 via-primary/5 to-card border border-primary/20 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            <span className="text-sm font-semibold">رصيد Lovable AI</span>
          </div>
          <Dialog open={rechargeOpen} onOpenChange={setRechargeOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="w-3 h-3" /> شحن
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>شحن رصيد Lovable AI</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <p className="text-xs text-muted-foreground">سعر الوحدة: {SELL_PRICE_PER_TOKEN_SAR} ر.س</p>
                <div className="grid grid-cols-2 gap-2">
                  {RECHARGE_OPTIONS.map(opt => (
                    <Button key={opt.tokens} variant="outline" className="h-14 text-sm flex flex-col gap-0.5"
                      onClick={() => handleRecharge(opt.tokens)}>
                      <span className="font-bold">{opt.label}</span>
                      <span className="text-[10px] text-muted-foreground">{opt.tokens.toLocaleString()} وحدة</span>
                    </Button>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">مبلغ مخصص (بالريال)</label>
                  <div className="flex items-center gap-2">
                    <Input type="number" placeholder="مثال: 1000"
                      value={customRecharge} onChange={e => setCustomRecharge(e.target.value)}
                      className="h-9 text-sm" />
                    <Button size="sm" disabled={!customRecharge || Number(customRecharge) <= 0}
                      onClick={() => handleRecharge(Math.floor(Number(customRecharge) / SELL_PRICE_PER_TOKEN_SAR))}>
                      شحن
                    </Button>
                  </div>
                  {customRecharge && Number(customRecharge) > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      = {Math.floor(Number(customRecharge) / SELL_PRICE_PER_TOKEN_SAR).toLocaleString()} وحدة
                    </p>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-bold">{formatSAR(remainingSAR)}</span>
          <span className="text-xs text-muted-foreground">متبقي من {formatSAR(balanceSAR)}</span>
        </div>

        <div className="space-y-1">
          <Progress value={usedPercent} className="h-2" />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>مستهلك: {formatSAR(totalSellSAR)}</span>
            <span>{usedPercent.toFixed(1)}%</span>
          </div>
        </div>

        {/* Cost vs Sell breakdown for super admin */}
        <div className="flex items-center gap-4 text-[10px] pt-1 border-t border-border/50">
          <span className="text-muted-foreground">
            💰 التكلفة الفعلية: <span className="font-semibold text-foreground">{formatSAR(totalCostSAR)}</span>
          </span>
          <span className="text-muted-foreground">
            📊 قيمة البيع: <span className="font-semibold text-foreground">{formatSAR(totalSellSAR)}</span>
          </span>
          {totalSellSAR > 0 && (
            <span className="text-muted-foreground">
              📈 الربح: <span className="font-semibold text-primary">{formatSAR(totalSellSAR - totalCostSAR)}</span>
            </span>
          )}
        </div>

        {remaining < aiBalance * 0.1 && aiBalance > 0 && (
          <div className="bg-destructive/10 text-destructive text-[11px] px-2 py-1.5 rounded-lg">
            ⚠️ الرصيد منخفض! أقل من 10% متبقي. يُنصح بالشحن لتجنب توقف الخدمة.
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-xl shadow-card p-4 text-center">
          <Sparkles className="w-5 h-5 mx-auto mb-1 text-primary" />
          <p className="text-lg font-bold">{enabledCount}</p>
          <p className="text-[10px] text-muted-foreground">مؤسسة مفعّلة</p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-4 text-center">
          <BarChart3 className="w-5 h-5 mx-auto mb-1 text-primary" />
          <p className="text-lg font-bold">{totalCalls.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">إجمالي الطلبات</p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-4 text-center">
          <TrendingUp className="w-5 h-5 mx-auto mb-1 text-primary" />
          <p className="text-lg font-bold">{formatSAR(totalSellSAR)}</p>
          <p className="text-[10px] text-muted-foreground">إجمالي الاستهلاك</p>
        </div>
      </div>

      {/* Top Consumers */}
      {topConsumers.length > 0 && (
        <div className="bg-card rounded-xl shadow-card p-4 space-y-3">
          <h3 className="text-xs font-semibold flex items-center gap-2">
            <Trophy className="w-4 h-4 text-accent-foreground" /> أكثر المؤسسات استهلاكاً
          </h3>
          <div className="space-y-2">
            {topConsumers.map((org, i) => {
              const pct = totalTokens > 0 ? (org.tokens_used / totalTokens) * 100 : 0;
              const orgCostSAR = tokensToSAR(org.tokens_used);
              return (
                <div key={org.org_id} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground w-5">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-xs font-medium truncate">{org.org_name}</p>
                      <span className="text-[10px] font-semibold text-muted-foreground shrink-0">{formatSAR(orgCostSAR)}</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                    <div className="flex justify-between mt-0.5">
                      <span className="text-[9px] text-muted-foreground">{org.total_calls} طلب</span>
                      <span className="text-[9px] text-muted-foreground">{pct.toFixed(1)}% من الإجمالي</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search & Refresh */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث عن مؤسسة..." className="h-9 pr-9 text-sm" />
        </div>
        <Button size="sm" variant="outline" onClick={loadData} className="gap-1">
          <RefreshCw className="w-3 h-3" /> تحديث
        </Button>
      </div>

      {/* Org List */}
      <div className="bg-card rounded-xl shadow-card divide-y divide-border">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">لا توجد مؤسسات</div>
        ) : (
          filtered.map(org => (
            <div key={org.org_id} className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{org.org_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {org.tokens_used > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        {formatSAR(tokensToSAR(org.tokens_used))}
                      </Badge>
                    )}
                    {org.total_calls > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {org.total_calls} طلب
                      </Badge>
                    )}
                    {org.last_used && (
                      <span className="text-[10px] text-muted-foreground">
                        آخر: {new Date(org.last_used).toLocaleDateString("ar-SA")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Switch checked={org.enabled} onCheckedChange={v => toggleOrgAi(org.org_id, v)} />
            </div>
          ))
        )}
      </div>

      {/* Pricing Info */}
      <div className="bg-muted/50 border rounded-lg p-3 space-y-1">
        <p className="text-xs font-medium">💎 التسعير الحالي</p>
        <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
          <div>تكلفة الوحدة: <span className="font-semibold text-foreground">{COST_PER_TOKEN_SAR} ر.س</span></div>
          <div>سعر البيع: <span className="font-semibold text-foreground">{SELL_PRICE_PER_TOKEN_SAR} ر.س</span></div>
          <div>الحالة: <Badge variant="secondary" className="text-[9px]">مجاني حالياً</Badge></div>
        </div>
      </div>

      {/* Warning */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
        <p className="text-xs text-primary font-medium">⚠️ تنبيه مهم</p>
        <p className="text-[10px] text-muted-foreground mt-1">
          الخدمة مجانية حالياً للمؤسسات. التكاليف تُحسب داخلياً فقط لمراقبة الاستهلاك. لا يتم تشغيل أي ذكاء اصطناعي تلقائياً — يحتاج المستخدم الضغط على زر لاستهلاك الوحدات.
        </p>
      </div>
    </div>
  );
};

export default AdminAiManagement;
