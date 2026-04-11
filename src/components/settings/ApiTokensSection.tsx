import { useState, useEffect } from "react";
import { Key, Copy, Plus, Trash2, Shield, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ApiToken {
  id: string;
  name: string;
  token: string;
  token_preview: string | null;
  permissions: string[];
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  expires_at: string | null;
}

const allPermissions = [
  { key: "messages", label: "الرسائل", desc: "إرسال رسائل واتساب" },
  { key: "customers", label: "العملاء", desc: "إدارة بيانات العملاء" },
  { key: "orders", label: "الطلبات", desc: "إدارة الطلبات والسلات المتروكة" },
  { key: "conversations", label: "المحادثات", desc: "عرض المحادثات والرسائل" },
  { key: "whatsapp", label: "واتساب QR", desc: "إنشاء وإدارة أرقام QR" },
];

const ApiTokensSection = () => {
  const { orgId, user } = useAuth();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState<string[]>(["messages", "customers", "orders", "conversations"]);
  const [creating, setCreating] = useState(false);
  const [maxTokens, setMaxTokens] = useState<number>(2);
  // Store the raw token just after creation — shown once only
  const [justCreatedToken, setJustCreatedToken] = useState<{ id: string; raw: string } | null>(null);

  useEffect(() => {
    if (orgId) {
      loadTokens();
      loadMaxTokens();
    }
  }, [orgId]);

  const loadMaxTokens = async () => {
    const { data: org } = await supabase.from("organizations").select("plan_id").eq("id", orgId!).maybeSingle();
    if (org?.plan_id) {
      const { data: plan } = await supabase.from("plans").select("max_api_tokens").eq("id", org.plan_id).maybeSingle();
      if (plan && (plan as any).max_api_tokens) setMaxTokens((plan as any).max_api_tokens);
    }
  };

  const loadTokens = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("api_tokens")
      .select("id, name, token_preview, token_hash, permissions, is_active, last_used_at, created_at, expires_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    setTokens((data as any) || []);
    setLoading(false);
  };

  const limitReached = tokens.length >= maxTokens;

  const createToken = async () => {
    if (limitReached) { toast.error(`وصلت للحد الأقصى (${maxTokens} توكنات). قم بترقية باقتك لإنشاء المزيد.`); return; }
    if (!newName.trim()) { toast.error("أدخل اسم التوكن"); return; }
    if (!newPerms.length) { toast.error("اختر صلاحية واحدة على الأقل"); return; }
    setCreating(true);
    const { data, error } = await supabase
      .from("api_tokens")
      .insert({ org_id: orgId, name: newName.trim(), permissions: newPerms, created_by: user?.id })
      .select("id, token")
      .single();
    setCreating(false);
    if (error) { toast.error(error.message); return; }

    const created = data as any;
    // Immediately hash the token server-side
    await supabase.rpc("hash_api_token" as any, { _token_id: created.id });

    // Store raw token for one-time display
    setJustCreatedToken({ id: created.id, raw: created.token });

    toast.success("تم إنشاء التوكن — انسخه الآن! لن يظهر مرة أخرى.");
    setShowCreate(false);
    setNewName("");
    setNewPerms(["messages", "customers", "orders", "conversations"]);
    loadTokens();
  };

  const deleteToken = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا التوكن؟")) return;
    const { error } = await supabase.from("api_tokens").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم حذف التوكن");
    if (justCreatedToken?.id === id) setJustCreatedToken(null);
    loadTokens();
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from("api_tokens").update({ is_active: active }).eq("id", id);
    loadTokens();
    toast.success(active ? "تم تفعيل التوكن" : "تم تعطيل التوكن");
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast.success("تم نسخ التوكن");
  };

  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-api`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold">توكنات API</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{tokens.length}/{maxTokens}</Badge>
          <Button size="sm" onClick={() => setShowCreate(true)} disabled={limitReached}>
            <Plus className="w-4 h-4 ml-1" /> إنشاء توكن جديد
          </Button>
        </div>
      </div>

      <div className="bg-secondary/50 rounded-lg p-3 text-sm">
        <p className="text-muted-foreground mb-1">رابط الـ API الأساسي:</p>
        <div className="flex items-center gap-2">
          <code className="bg-background px-2 py-1 rounded text-xs font-mono flex-1 truncate" dir="ltr">{baseUrl}</code>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { navigator.clipboard.writeText(baseUrl); toast.success("تم نسخ الرابط"); }}>
            <Copy className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
      ) : tokens.length === 0 ? (
        <div className="text-center py-8 border border-dashed rounded-lg">
          <Key className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">لا توجد توكنات بعد</p>
          <p className="text-muted-foreground text-xs mt-1">أنشئ توكن للبدء في استخدام الـ API</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tokens.map((t) => {
            const isJustCreated = justCreatedToken?.id === t.id;
            return (
              <div key={t.id} className={cn("border rounded-lg p-4 space-y-3", isJustCreated && "ring-2 ring-primary/50", !t.is_active && "opacity-60")}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm">{t.name}</span>
                    <Badge variant={t.is_active ? "default" : "secondary"} className="text-[10px]">
                      {t.is_active ? "فعال" : "معطل"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={t.is_active} onCheckedChange={(v) => toggleActive(t.id, v)} />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteToken(t.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Token display */}
                {isJustCreated ? (
                  <div className="space-y-2">
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-xs text-primary font-medium">انسخ التوكن الآن — لن يظهر مرة أخرى بعد مغادرة هذه الصفحة!</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="bg-secondary px-2 py-1 rounded text-xs font-mono flex-1 truncate" dir="ltr">
                        {justCreatedToken.raw}
                      </code>
                      <Button variant="outline" size="sm" className="gap-1 shrink-0" onClick={() => copyToken(justCreatedToken.raw)}>
                        <Copy className="w-3.5 h-3.5" /> نسخ
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <code className="bg-secondary px-2 py-1 rounded text-xs font-mono flex-1 truncate" dir="ltr">
                      {t.token_preview || "••••••••••••••••"}
                    </code>
                  </div>
                )}

                <div className="flex flex-wrap gap-1">
                  {t.permissions.map((p) => (
                    <Badge key={p} variant="outline" className="text-[10px]">
                      {allPermissions.find((ap) => ap.key === p)?.label || p}
                    </Badge>
                  ))}
                </div>

                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span>أُنشئ: {new Date(t.created_at).toLocaleDateString("ar-SA-u-ca-gregory")}</span>
                  {t.last_used_at && <span>آخر استخدام: {new Date(t.last_used_at).toLocaleDateString("ar-SA-u-ca-gregory")}</span>}
                  {t.expires_at && <span>ينتهي: {new Date(t.expires_at).toLocaleDateString("ar-SA-u-ca-gregory")}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>إنشاء توكن API جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>اسم التوكن</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثال: ربط المتجر" className="mt-1" />
            </div>
            <div>
              <Label className="mb-2 block">الصلاحيات</Label>
              <div className="space-y-2">
                {allPermissions.map((p) => (
                  <label key={p.key} className="flex items-center gap-2 p-2 rounded-lg border hover:bg-secondary/50 cursor-pointer">
                    <Checkbox
                      checked={newPerms.includes(p.key)}
                      onCheckedChange={(checked) => {
                        setNewPerms(prev => checked ? [...prev, p.key] : prev.filter(x => x !== p.key));
                      }}
                    />
                    <div>
                      <p className="text-sm font-medium">{p.label}</p>
                      <p className="text-[11px] text-muted-foreground">{p.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button>
            <Button onClick={createToken} disabled={creating}>
              {creating ? "جاري الإنشاء..." : "إنشاء التوكن"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApiTokensSection;

