import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Settings2, Save, RefreshCw, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

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
  is_active: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  people: "👥 الأشخاص",
  channels: "📱 القنوات",
  usage: "💬 الاستخدام",
  commerce: "🏪 التجارة",
  automation: "🤖 الأتمتة",
  features: "🔓 الميزات",
};

const AdminPricingManager = () => {
  const [modules, setModules] = useState<PlanModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editedModules, setEditedModules] = useState<Record<string, Partial<PlanModule>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadModules(); }, []);

  const loadModules = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("plan_modules" as any)
      .select("*")
      .order("sort_order");
    setModules((data as any[]) || []);
    setEditedModules({});
    setIsLoading(false);
  };

  const updateField = (id: string, field: string, value: any) => {
    setEditedModules(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }));
  };

  const getVal = (mod: PlanModule, field: keyof PlanModule) => {
    return editedModules[mod.id]?.[field] ?? mod[field];
  };

  const hasChanges = Object.keys(editedModules).length > 0;

  const saveAll = async () => {
    setSaving(true);
    const entries = Object.entries(editedModules);
    for (const [id, changes] of entries) {
      await supabase
        .from("plan_modules" as any)
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq("id", id);
    }
    setSaving(false);
    setEditedModules({});
    toast.success(`✅ تم حفظ ${entries.length} تعديل`);
    loadModules();
  };

  const grouped = modules.reduce<Record<string, PlanModule[]>>((acc, m) => {
    (acc[m.category] = acc[m.category] || []).push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" /> إدارة تسعير الباقات
        </h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={loadModules} className="gap-1">
            <RefreshCw className="w-3 h-3" /> تحديث
          </Button>
          {hasChanges && (
            <Button size="sm" onClick={saveAll} disabled={saving} className="gap-1">
              <Save className="w-3 h-3" /> حفظ التعديلات ({Object.keys(editedModules).length})
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground text-sm">جاري التحميل...</div>
      ) : (
        Object.entries(grouped).map(([cat, mods]) => (
          <div key={cat} className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground">
              {CATEGORY_LABELS[cat] || cat}
            </h3>
            <div className="bg-card rounded-xl shadow-card divide-y divide-border">
              {mods.map(mod => {
                const isEdited = !!editedModules[mod.id];
                return (
                  <div key={mod.id} className={`p-3 space-y-2 ${isEdited ? "bg-primary/5" : ""}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{mod.name_ar}</span>
                        <Badge variant="outline" className="text-[9px]">
                          {mod.pricing_type === "toggle" ? "تفعيل/تعطيل" : "لكل " + mod.unit_label}
                        </Badge>
                      </div>
                      <Switch
                        checked={getVal(mod, "is_active") as boolean}
                        onCheckedChange={v => updateField(mod.id, "is_active", v)}
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {/* Price */}
                      <div>
                        <label className="text-[10px] text-muted-foreground">السعر (ر.س)</label>
                        <div className="relative">
                          <DollarSign className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            type="number" step="0.01"
                            value={getVal(mod, "unit_price") as number}
                            onChange={e => updateField(mod.id, "unit_price", Number(e.target.value))}
                            className="h-8 text-xs pr-7"
                          />
                        </div>
                      </div>

                      {mod.pricing_type === "per_unit" && (
                        <>
                          {/* Free qty */}
                          <div>
                            <label className="text-[10px] text-muted-foreground">مجاني</label>
                            <Input
                              type="number"
                              value={getVal(mod, "free_qty") as number}
                              onChange={e => updateField(mod.id, "free_qty", Number(e.target.value))}
                              className="h-8 text-xs"
                            />
                          </div>

                          {/* Min */}
                          <div>
                            <label className="text-[10px] text-muted-foreground">أقل عدد</label>
                            <Input
                              type="number"
                              value={getVal(mod, "min_qty") as number}
                              onChange={e => updateField(mod.id, "min_qty", Number(e.target.value))}
                              className="h-8 text-xs"
                            />
                          </div>

                          {/* Max */}
                          <div>
                            <label className="text-[10px] text-muted-foreground">أقصى عدد</label>
                            <Input
                              type="number"
                              value={getVal(mod, "max_qty") as number}
                              onChange={e => updateField(mod.id, "max_qty", Number(e.target.value))}
                              className="h-8 text-xs"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      <div className="bg-muted/50 border rounded-lg p-3">
        <p className="text-[10px] text-muted-foreground">
          💡 التعديلات تنعكس فوراً على صفحة "فصّل باقتك" للعملاء الجدد. الاشتراكات الحالية لا تتأثر حتى التجديد.
        </p>
      </div>
    </div>
  );
};

export default AdminPricingManager;
