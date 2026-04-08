import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Brain, Sparkles, BarChart3, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface OrgAiStatus {
  org_id: string;
  org_name: string;
  enabled: boolean;
  total_calls: number;
  last_used: string | null;
}

const AdminAiManagement = () => {
  const [orgs, setOrgs] = useState<OrgAiStatus[]>([]);
  const [usageLogs, setUsageLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [totalCalls, setTotalCalls] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);

    // Get all orgs
    const { data: orgData } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("is_active", true)
      .order("name");

    // Get all lovable_ai settings
    const { data: settingsData } = await supabase
      .from("system_settings")
      .select("key, value")
      .like("key", "lovable_ai_enabled_%");

    const enabledMap: Record<string, boolean> = {};
    (settingsData || []).forEach((s: any) => {
      const orgId = s.key.replace("lovable_ai_enabled_", "");
      enabledMap[orgId] = s.value === true || s.value === "true";
    });

    // Get usage logs aggregated
    const { data: usageData } = await supabase
      .from("ai_usage_logs" as any)
      .select("org_id, action, created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    const usageCounts: Record<string, { count: number; last: string | null }> = {};
    (usageData || []).forEach((u: any) => {
      if (!usageCounts[u.org_id]) usageCounts[u.org_id] = { count: 0, last: null };
      usageCounts[u.org_id].count++;
      if (!usageCounts[u.org_id].last) usageCounts[u.org_id].last = u.created_at;
    });

    const orgStatuses: OrgAiStatus[] = (orgData || []).map((o: any) => ({
      org_id: o.id,
      org_name: o.name,
      enabled: enabledMap[o.id] || false,
      total_calls: usageCounts[o.id]?.count || 0,
      last_used: usageCounts[o.id]?.last || null,
    }));

    // Sort: enabled first, then by usage
    orgStatuses.sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return b.total_calls - a.total_calls;
    });

    setOrgs(orgStatuses);
    setUsageLogs(usageData || []);
    setTotalCalls((usageData || []).length);
    setIsLoading(false);
  };

  const toggleOrgAi = async (orgId: string, enable: boolean) => {
    const key = `lovable_ai_enabled_${orgId}`;
    const { data: existing } = await supabase
      .from("system_settings")
      .select("key")
      .eq("key", key)
      .maybeSingle();

    if (existing) {
      await supabase.from("system_settings").update({
        value: enable,
        updated_at: new Date().toISOString(),
      }).eq("key", key);
    } else {
      await supabase.from("system_settings").insert({
        key,
        value: enable,
        description: `Lovable AI enabled for org`,
      });
    }

    setOrgs(prev => prev.map(o =>
      o.org_id === orgId ? { ...o, enabled: enable } : o
    ));

    toast.success(enable ? "✨ تم تفعيل Lovable AI" : "تم إيقاف Lovable AI");
  };

  const filtered = orgs.filter(o =>
    o.org_name.toLowerCase().includes(search.toLowerCase())
  );

  const enabledCount = orgs.filter(o => o.enabled).length;

  return (
    <div className="space-y-6">
      <h2 className="font-semibold text-sm flex items-center gap-2">
        <Brain className="w-4 h-4 text-primary" /> إدارة Lovable AI
      </h2>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-xl shadow-card p-4 text-center">
          <Sparkles className="w-5 h-5 mx-auto mb-1 text-primary" />
          <p className="text-lg font-bold">{enabledCount}</p>
          <p className="text-[10px] text-muted-foreground">مؤسسة مفعّلة</p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-4 text-center">
          <BarChart3 className="w-5 h-5 mx-auto mb-1 text-primary" />
          <p className="text-lg font-bold">{totalCalls}</p>
          <p className="text-[10px] text-muted-foreground">إجمالي الطلبات</p>
        </div>
        <div className="bg-card rounded-xl shadow-card p-4 text-center">
          <Brain className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
          <p className="text-lg font-bold">{orgs.length}</p>
          <p className="text-[10px] text-muted-foreground">إجمالي المؤسسات</p>
        </div>
      </div>

      {/* Search & Refresh */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث عن مؤسسة..."
            className="h-9 pr-9 text-sm"
          />
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
          filtered.map((org) => (
            <div key={org.org_id} className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{org.org_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {org.total_calls > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        {org.total_calls} طلب
                      </Badge>
                    )}
                    {org.last_used && (
                      <span className="text-[10px] text-muted-foreground">
                        آخر استخدام: {new Date(org.last_used).toLocaleDateString("ar-SA")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Switch
                checked={org.enabled}
                onCheckedChange={(v) => toggleOrgAi(org.org_id, v)}
              />
            </div>
          ))
        )}
      </div>

      {/* Warning */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
        <p className="text-xs text-primary font-medium">⚠️ تنبيه مهم</p>
        <p className="text-[10px] text-muted-foreground mt-1">
          تكاليف Lovable AI تُحسب على وحدات المنصة. لا يتم تشغيل أي ذكاء اصطناعي تلقائياً — يحتاج المستخدم الضغط على زر (تحليل، اقتراح رد، تلخيص) لاستهلاك الوحدات.
          ميزة الرد التلقائي تعمل فقط إذا فعّلها المستخدم يدوياً من إعدادات AI.
        </p>
      </div>
    </div>
  );
};

export default AdminAiManagement;
