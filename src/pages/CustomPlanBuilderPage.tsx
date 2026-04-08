import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Sparkles, ShoppingCart, Brain, Wallet } from "lucide-react";

interface PlanModule {
  id: string;
  key: string;
  name_ar: string;
  category: string;
  pricing_type: string;
  unit_price: number;
  unit_label: string;
  min_qty: number;
  max_qty: number;
  free_qty: number;
  sort_order: number;
}

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  people: { label: "الأشخاص", icon: "👥" },
  channels: { label: "القنوات", icon: "📱" },
  usage: { label: "الاستخدام", icon: "💬" },
  commerce: { label: "التجارة", icon: "🏪" },
  automation: { label: "الأتمتة", icon: "🤖" },
  features: { label: "الميزات", icon: "🔓" },
};

const CustomPlanBuilderPage = () => {
  const { orgId } = useAuth();
  const [modules, setModules] = useState<PlanModule[]>([]);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadModules();
  }, [orgId]);

  const loadModules = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("plan_modules" as any)
      .select("*")
      .eq("is_active", true)
      .order("sort_order");

    const mods = (data as any[]) || [];
    setModules(mods);

    // Load current org subscriptions
    if (orgId) {
      const { data: subs } = await supabase
        .from("org_module_subscriptions" as any)
        .select("module_id, quantity, enabled")
        .eq("org_id", orgId);

      const sel: Record<string, number> = {};
      const tog: Record<string, boolean> = {};
      const subsArr = (subs || []) as any[];
      mods.forEach(m => {
        const sub = subsArr.find((s: any) => s.module_id === m.id);
        if (m.pricing_type === "toggle") {
          tog[m.id] = sub?.enabled || false;
        } else {
          sel[m.id] = sub?.quantity ?? m.free_qty;
        }
      });
      setSelections(sel);
      setToggles(tog);
    }

    setIsLoading(false);
  };

  const monthlyTotal = useMemo(() => {
    let total = 0;
    modules.forEach(m => {
      if (m.pricing_type === "toggle") {
        if (toggles[m.id]) total += m.unit_price;
      } else {
        const qty = selections[m.id] || 0;
        const billable = Math.max(0, qty - m.free_qty);
        total += billable * m.unit_price;
      }
    });
    return total;
  }, [modules, selections, toggles]);

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);

    for (const mod of modules) {
      const quantity = mod.pricing_type === "toggle" ? (toggles[mod.id] ? 1 : 0) : (selections[mod.id] || 0);
      const enabled = mod.pricing_type === "toggle" ? !!toggles[mod.id] : quantity > 0;
      const billable = mod.pricing_type === "toggle" ? (toggles[mod.id] ? 1 : 0) : Math.max(0, quantity - mod.free_qty);
      const cost = billable * mod.unit_price;

      await supabase
        .from("org_module_subscriptions" as any)
        .upsert({
          org_id: orgId,
          module_id: mod.id,
          quantity,
          enabled,
          monthly_cost: cost,
          updated_at: new Date().toISOString(),
        }, { onConflict: "org_id,module_id" });
    }

    setSaving(false);
    toast.success("✅ تم حفظ باقتك بنجاح!");
  };

  const grouped = modules.reduce<Record<string, PlanModule[]>>((acc, m) => {
    (acc[m.category] = acc[m.category] || []).push(m);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Sparkles className="w-6 h-6 mx-auto mb-2 animate-pulse text-primary" />
        جاري التحميل...
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 max-w-[800px] mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-xl font-bold flex items-center justify-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> فصّل باقتك
        </h1>
        <p className="text-sm text-muted-foreground">اختر العناصر والكميات اللي تناسب عملك — ادفع بس على اللي تحتاجه</p>
      </div>

      {/* Modules by category */}
      {Object.entries(grouped).map(([cat, mods]) => {
        const catInfo = CATEGORY_LABELS[cat] || { label: cat, icon: "📦" };
        return (
          <div key={cat} className="space-y-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <span>{catInfo.icon}</span> {catInfo.label}
            </h2>
            <div className="bg-card rounded-xl shadow-card divide-y divide-border">
              {mods.map(mod => {
                if (mod.pricing_type === "toggle") {
                  return (
                    <div key={mod.id} className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{mod.name_ar}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {mod.unit_price} ر.س/شهر
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {toggles[mod.id] && (
                          <Badge className="text-[10px]">{mod.unit_price} ر.س</Badge>
                        )}
                        <Switch
                          checked={toggles[mod.id] || false}
                          onCheckedChange={v => setToggles(p => ({ ...p, [mod.id]: v }))}
                        />
                      </div>
                    </div>
                  );
                }

                const qty = selections[mod.id] || 0;
                const billable = Math.max(0, qty - mod.free_qty);
                const cost = billable * mod.unit_price;

                return (
                  <div key={mod.id} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{mod.name_ar}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {mod.unit_price} ر.س / {mod.unit_label}
                          {mod.free_qty > 0 && (
                            <span className="text-primary"> • أول {mod.free_qty} مجاناً</span>
                          )}
                        </p>
                      </div>
                      <div className="text-left">
                        <p className="text-lg font-bold">{qty}</p>
                        {cost > 0 && (
                          <p className="text-[10px] text-muted-foreground">{cost.toFixed(2)} ر.س</p>
                        )}
                        {cost === 0 && qty > 0 && (
                          <Badge variant="secondary" className="text-[9px]">مجاني</Badge>
                        )}
                      </div>
                    </div>
                    <Slider
                      value={[qty]}
                      onValueChange={([v]) => setSelections(p => ({ ...p, [mod.id]: v }))}
                      min={mod.min_qty}
                      max={Math.min(mod.max_qty, mod.key === "monthly_conversations" ? 10000 : mod.max_qty)}
                      step={mod.key === "monthly_conversations" ? 100 : 1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[9px] text-muted-foreground">
                      <span>{mod.min_qty}</span>
                      <span>{mod.key === "monthly_conversations" ? "10,000+" : mod.max_qty}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* AI Wallet Notice */}
      <div className="bg-gradient-to-l from-primary/10 via-primary/5 to-card border border-primary/20 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="w-5 h-5 text-primary" />
          <span className="text-sm font-semibold">Lovable AI</span>
          <Badge variant="secondary" className="text-[9px]">منفصل</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          رصيد الذكاء الاصطناعي منفصل تماماً عن الباقة. يمكنك شحنه في أي وقت من <span className="font-medium text-foreground">الإعدادات → الذكاء الاصطناعي</span>.
        </p>
      </div>

      {/* Sticky Summary */}
      <div className="sticky bottom-4 bg-card border-2 border-primary/20 rounded-2xl p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-muted-foreground">الإجمالي الشهري</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">{monthlyTotal.toFixed(2)}</span>
              <span className="text-sm text-muted-foreground">ر.س/شهر</span>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="gap-2 h-11 px-6">
            <ShoppingCart className="w-4 h-4" />
            {saving ? "جاري الحفظ..." : "اشترك الآن"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CustomPlanBuilderPage;
