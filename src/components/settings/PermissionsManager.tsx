import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Shield, Users, Eye, EyeOff, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface RolePermissions {
  [module: string]: boolean;
}

const MODULES = [
  { key: "dashboard", label: "لوحة التحكم", icon: "📊" },
  { key: "inbox", label: "صندوق الوارد", icon: "📥", alwaysOn: true },
  { key: "customers", label: "العملاء", icon: "👥" },
  { key: "analytics", label: "التحليلات", icon: "📈" },
  { key: "campaigns", label: "الحملات", icon: "📢" },
  { key: "automation", label: "الأتمتة", icon: "🤖" },
  { key: "chatbot", label: "الشات بوت", icon: "💬" },
  { key: "team", label: "الفريق", icon: "👥" },
  { key: "integrations", label: "التكاملات", icon: "🔗" },
  { key: "settings", label: "الإعدادات", icon: "⚙️" },
  { key: "orders", label: "الطلبات", icon: "📦" },
  { key: "templates", label: "القوالب", icon: "📄" },
  { key: "reports", label: "التقارير", icon: "📋" },
  { key: "tasks", label: "المهام", icon: "✅" },
  { key: "tickets", label: "التذاكر", icon: "🎫" },
  { key: "wallet", label: "المحفظة", icon: "💳" },
];

const ROLES = [
  { key: "member", label: "عضو", description: "موظف عادي" },
  { key: "supervisor", label: "مشرف", description: "مشرف فريق" },
];

const DEFAULT_PERMISSIONS: Record<string, RolePermissions> = {
  member: {
    dashboard: false, inbox: true, customers: false, analytics: false,
    campaigns: false, automation: false, chatbot: false, team: false,
    integrations: false, settings: false, orders: false, templates: false,
    reports: false, tasks: true, tickets: true, wallet: false,
  },
  supervisor: {
    dashboard: false, inbox: true, customers: true, analytics: true,
    campaigns: false, automation: false, chatbot: false, team: true,
    integrations: false, settings: false, orders: true, templates: false,
    reports: true, tasks: true, tickets: true, wallet: false,
  },
};

const PermissionsManager = () => {
  const { orgId } = useAuth();
  const [permissions, setPermissions] = useState<Record<string, RolePermissions>>(DEFAULT_PERMISSIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeRole, setActiveRole] = useState("member");

  useEffect(() => {
    if (!orgId) return;
    loadPermissions();
  }, [orgId]);

  const loadPermissions = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", orgId)
      .single();

    if (data?.settings) {
      const settings = data.settings as Record<string, any>;
      if (settings.role_permissions) {
        setPermissions({
          member: { ...DEFAULT_PERMISSIONS.member, ...settings.role_permissions.member },
          supervisor: { ...DEFAULT_PERMISSIONS.supervisor, ...settings.role_permissions.supervisor },
        });
      }
    }
    setLoading(false);
  };

  const togglePermission = (role: string, module: string) => {
    setPermissions(prev => ({
      ...prev,
      [role]: { ...prev[role], [module]: !prev[role][module] },
    }));
  };

  const savePermissions = async () => {
    if (!orgId) return;
    setSaving(true);
    const { data: org } = await supabase.from("organizations").select("settings").eq("id", orgId).single();
    const settings = (org?.settings as Record<string, any>) || {};

    await supabase.from("organizations").update({
      settings: { ...settings, role_permissions: permissions },
    }).eq("id", orgId);

    toast.success("تم حفظ الصلاحيات");
    setSaving(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              إدارة صلاحيات الأدوار
            </CardTitle>
            <Button size="sm" onClick={savePermissions} disabled={saving} className="gap-1">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              حفظ
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            تحكم بالصفحات المتاحة لكل دور. الأدمن يملك صلاحيات كاملة دائماً.
          </p>
        </CardHeader>
        <CardContent>
          {/* Role Tabs */}
          <div className="flex gap-2 mb-4">
            {ROLES.map((role) => (
              <button
                key={role.key}
                onClick={() => setActiveRole(role.key)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors",
                  activeRole === role.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                )}
              >
                <Users className="w-3.5 h-3.5" />
                {role.label}
              </button>
            ))}
          </div>

          {/* Permissions Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MODULES.map((mod) => {
              const isOn = permissions[activeRole]?.[mod.key] ?? false;
              const isAlwaysOn = mod.alwaysOn;
              return (
                <div
                  key={mod.key}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-xl border transition-colors",
                    isOn || isAlwaysOn ? "border-primary/20 bg-primary/5" : "border-border/40 bg-card"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{mod.icon}</span>
                    <div>
                      <p className="text-sm font-medium">{mod.label}</p>
                      {isAlwaysOn && (
                        <p className="text-[10px] text-muted-foreground">متاح دائماً</p>
                      )}
                    </div>
                  </div>
                  {isAlwaysOn ? (
                    <Badge variant="outline" className="text-[10px] text-primary border-primary/20">
                      <Eye className="w-3 h-3 ml-1" /> مفعّل
                    </Badge>
                  ) : (
                    <Switch
                      checked={isOn}
                      onCheckedChange={() => togglePermission(activeRole, mod.key)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PermissionsManager;

