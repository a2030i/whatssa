import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Zap, Search, ToggleLeft, ToggleRight, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Org { id: string; name: string; }
interface FeatureFlag {
  id: string;
  org_id: string;
  feature_key: string;
  is_enabled: boolean;
  notes: string | null;
  expires_at: string | null;
  enabled_at: string | null;
}

const KNOWN_FEATURES = [
  { key: "ecommerce",           label: "التجارة الإلكترونية",    desc: "المنتجات، الطلبات، السلة" },
  { key: "ai_auto_reply",       label: "ردود AI تلقائية",        desc: "الرد التلقائي بالذكاء الاصطناعي" },
  { key: "campaigns_ab_test",   label: "A/B Testing للحملات",   desc: "تجربة إصدارين من الحملة" },
  { key: "advanced_analytics",  label: "تحليلات متقدمة",         desc: "تقارير تفصيلية ومقارنات" },
  { key: "custom_chatbot",      label: "بوت مخصص",              desc: "بناء محادثات آلية مخصصة" },
  { key: "api_access",          label: "API خارجي",             desc: "وصول عبر API tokens" },
  { key: "multi_channel",       label: "متعدد القنوات",          desc: "أكثر من قناة واتساب" },
  { key: "sla_policies",        label: "SLA policies",          desc: "سياسات مستوى الخدمة" },
  { key: "satisfaction_ratings",label: "تقييمات الرضا",          desc: "CSAT بعد إغلاق المحادثة" },
  { key: "snooze",              label: "تأجيل المحادثات",        desc: "Snooze للمحادثات" },
];

const fetchOrgs = async (): Promise<Org[]> => {
  const { data } = await supabase.from("organizations").select("id, name").order("name");
  return data || [];
};

const fetchFlags = async (orgId: string): Promise<FeatureFlag[]> => {
  const { data, error } = await supabase
    .from("org_feature_flags")
    .select("*")
    .eq("org_id", orgId);
  if (error) throw error;
  return data || [];
};

const AdminFeatureFlags = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [orgSearch, setOrgSearch] = useState("");
  const [selectedOrg, setSelectedOrg] = useState<Org | null>(null);
  const [customKey, setCustomKey] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);

  const { data: orgs = [] } = useQuery({ queryKey: ["orgs-list"], queryFn: fetchOrgs, staleTime: 5 * 60_000 });

  const { data: flags = [], isLoading: flagsLoading } = useQuery({
    queryKey: ["feature-flags", selectedOrg?.id],
    queryFn: () => fetchFlags(selectedOrg!.id),
    enabled: !!selectedOrg,
  });

  const toggle = useMutation({
    mutationFn: async ({ key, is_enabled }: { key: string; is_enabled: boolean }) => {
      const existing = flags.find(f => f.feature_key === key);
      if (existing) {
        const { error } = await supabase.from("org_feature_flags")
          .update({ is_enabled, enabled_by: user?.id, enabled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("org_feature_flags").insert({
          org_id: selectedOrg!.id,
          feature_key: key,
          is_enabled,
          enabled_by: user?.id,
          enabled_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
    },
    onSuccess: (_, { key, is_enabled }) => {
      toast.success(`${key}: ${is_enabled ? "مفعّل" : "موقوف"}`);
      qc.invalidateQueries({ queryKey: ["feature-flags", selectedOrg?.id] });
    },
    onError: () => toast.error("فشل التحديث"),
  });

  const filteredOrgs = orgs.filter(o => !orgSearch || o.name.toLowerCase().includes(orgSearch.toLowerCase()));

  const flagMap: Record<string, FeatureFlag> = {};
  flags.forEach(f => { flagMap[f.feature_key] = f; });

  const addCustom = () => {
    if (!customKey.trim()) return;
    toggle.mutate({ key: customKey.trim(), is_enabled: true });
    setCustomKey("");
    setAddingCustom(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          Feature Flags
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">تفعيل وإيقاف خصائص المنصة لكل منظمة على حدة</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Org selector */}
        <div className="border border-border rounded-2xl p-3 space-y-2">
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input value={orgSearch} onChange={e => setOrgSearch(e.target.value)}
              placeholder="ابحث عن منظمة..." dir="rtl"
              className="w-full border border-border rounded-lg py-2 pr-8 pl-3 text-xs bg-background focus:outline-none" />
          </div>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {filteredOrgs.map(org => (
              <button key={org.id} onClick={() => setSelectedOrg(org)}
                className={cn("w-full text-right px-3 py-2 rounded-xl text-xs transition-colors",
                  selectedOrg?.id === org.id ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-foreground")}>
                {org.name}
              </button>
            ))}
          </div>
        </div>

        {/* Flags panel */}
        <div className="md:col-span-2 border border-border rounded-2xl p-4">
          {!selectedOrg ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Zap className="w-10 h-10 mb-2 opacity-20" />
              <p className="text-sm">اختر منظمة من القائمة</p>
            </div>
          ) : flagsLoading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">جارٍ التحميل...</div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">{selectedOrg.name}</p>
                <button onClick={() => setAddingCustom(!addingCustom)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <Plus className="w-3 h-3" /> مفتاح مخصص
                </button>
              </div>

              {addingCustom && (
                <div className="flex gap-2">
                  <input value={customKey} onChange={e => setCustomKey(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addCustom()}
                    placeholder="feature_key مثلاً: beta_feature" dir="ltr"
                    className="flex-1 border border-border rounded-lg px-3 py-1.5 text-xs bg-background focus:outline-none" />
                  <button onClick={addCustom} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium">إضافة</button>
                  <button onClick={() => setAddingCustom(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
                </div>
              )}

              <div className="space-y-1.5">
                {KNOWN_FEATURES.map(feat => {
                  const existing = flagMap[feat.key];
                  const enabled = existing?.is_enabled ?? false;
                  return (
                    <div key={feat.key} className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/30 transition-colors">
                      <div>
                        <p className="text-[13px] font-medium">{feat.label}</p>
                        <p className="text-[11px] text-muted-foreground">{feat.desc}</p>
                      </div>
                      <button onClick={() => toggle.mutate({ key: feat.key, is_enabled: !enabled })}
                        disabled={toggle.isPending}>
                        {enabled
                          ? <ToggleRight className="w-6 h-6 text-primary" />
                          : <ToggleLeft className="w-6 h-6 text-muted-foreground" />}
                      </button>
                    </div>
                  );
                })}

                {/* Custom flags not in known list */}
                {flags.filter(f => !KNOWN_FEATURES.find(k => k.key === f.feature_key)).map(f => (
                  <div key={f.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/30 border border-dashed border-border transition-colors">
                    <div>
                      <p className="text-[13px] font-medium font-mono">{f.feature_key}</p>
                      {f.notes && <p className="text-[11px] text-muted-foreground">{f.notes}</p>}
                    </div>
                    <button onClick={() => toggle.mutate({ key: f.feature_key, is_enabled: !f.is_enabled })}
                      disabled={toggle.isPending}>
                      {f.is_enabled
                        ? <ToggleRight className="w-6 h-6 text-primary" />
                        : <ToggleLeft className="w-6 h-6 text-muted-foreground" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminFeatureFlags;
