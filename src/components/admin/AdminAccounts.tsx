import { useEffect, useState } from "react";
import { supabase, invokeCloud } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Search, Building2, UserCheck, UserX, ShoppingBag, Store, Plus, Eye, Clock, MessageSquare, Archive, Trash2, Phone, Smartphone } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const AdminAccounts = () => {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [superAdminOrgIds, setSuperAdminOrgIds] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [wallets, setWallets] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [waConfigs, setWaConfigs] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [newAccount, setNewAccount] = useState({ email: "", full_name: "", org_name: "" });
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [o, p, pl, w, c, wa, roles] = await Promise.all([
      supabase.from("organizations").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*"),
      supabase.from("plans").select("*").order("sort_order"),
      supabase.from("wallets").select("*"),
      supabase.from("conversations").select("org_id, last_message_at").order("last_message_at", { ascending: false }),
      supabase.from("whatsapp_config_safe").select("*"),
      supabase.from("user_roles").select("user_id").eq("role", "super_admin"),
    ]);
    // Find org_ids that belong to super_admin users
    const saUserIds = new Set((roles.data || []).map((r: any) => r.user_id));
    const saOrgIds = new Set(
      (p.data || []).filter((pr: any) => saUserIds.has(pr.id)).map((pr: any) => pr.org_id).filter(Boolean)
    );
    setSuperAdminOrgIds(saOrgIds as Set<string>);
    setOrgs(o.data || []);
    setProfiles(p.data || []);
    setPlans(pl.data || []);
    setConversations(c.data || []);
    setWallets(w.data || []);
    setWaConfigs(wa.data || []);
  };

  const deleteWhatsAppConfig = async (configId: string) => {
    await supabase.from("whatsapp_config").delete().eq("id", configId);
    toast.success("تم حذف الرقم");
    load();
  };

  const toggleActive = async (orgId: string, active: boolean) => {
    await supabase.from("organizations").update({ is_active: !active }).eq("id", orgId);
    toast.success(!active ? "تم التفعيل" : "تم التعطيل");
    load();
  };

  const toggleEcommerce = async (orgId: string, current: boolean) => {
    await supabase.from("organizations").update({ is_ecommerce: !current }).eq("id", orgId);
    toast.success(!current ? "تم تحويله لمتجر إلكتروني" : "تم تحويله لمؤسسة عادية");
    load();
  };

  const updatePlan = async (orgId: string, planId: string) => {
    await supabase.from("organizations").update({ plan_id: planId }).eq("id", orgId);
    toast.success("تم تحديث الباقة");
    load();
  };

  const updateStatus = async (orgId: string, status: string) => {
    await supabase.from("organizations").update({ subscription_status: status }).eq("id", orgId);
    toast.success("تم تحديث الحالة");
    load();
  };

  const updateStorePlatform = async (orgId: string, platform: string) => {
    await supabase.from("organizations").update({ store_platform: platform || null }).eq("id", orgId);
    toast.success("تم تحديث المنصة");
    load();
  };

  const updateStoreUrl = async (orgId: string, url: string) => {
    await supabase.from("organizations").update({ store_url: url || null }).eq("id", orgId);
    toast.success("تم تحديث الرابط");
    load();
  };

  const createAccount = async () => {
    if (!newAccount.email || !newAccount.full_name) {
      toast.error("الاسم والبريد الإلكتروني مطلوبين");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await invokeCloud("admin-create-user", {
        body: { email: newAccount.email, full_name: newAccount.full_name, org_name: newAccount.org_name },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("تم إنشاء الحساب — العميل سيستلم رابط لتعيين كلمة المرور");
      setShowCreate(false);
      setNewAccount({ email: "", full_name: "", org_name: "" });
      setTimeout(() => load(), 1000);
    } catch (e: any) {
      toast.error(e.message || "فشل إنشاء الحساب");
    } finally {
      setCreating(false);
    }
  };

  const archiveOrg = async (orgId: string) => {
    await supabase.from("organizations").update({ is_active: false, subscription_status: "cancelled" }).eq("id", orgId);
    toast.success("تم أرشفة الحساب");
    load();
  };

  const deleteOrg = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("غير مسجل الدخول");
      const { data, error } = await invokeCloud("admin-delete-org", {
        body: { org_id: deleteTarget.id },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("تم حذف الحساب نهائياً");
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "فشل الحذف");
    } finally {
      setDeleting(false);
    }
  };

  const { startImpersonation } = useAuth();

  const impersonateOrg = async (orgId: string) => {
    const org = orgs.find(o => o.id === orgId);
    toast.success(`دخول كعميل: ${org?.name || orgId.slice(0, 8)}`);
    await startImpersonation(orgId);
    navigate("/");
  };

  const statusColor = (s: string) => {
    const m: Record<string, string> = { trial: "bg-blue-100 text-blue-700", active: "bg-green-100 text-green-700", expired: "bg-destructive/10 text-destructive", cancelled: "bg-muted text-muted-foreground" };
    return m[s] || m.trial;
  };

  const filtered = orgs.filter((o) => {
    // Hide super admin orgs
    if (superAdminOrgIds.has(o.id)) return false;
    // Hide orphan orgs with 0 members (created by self-signup trigger for users who later joined another org)
    const memberCount = profiles.filter((p) => p.org_id === o.id).length;
    if (memberCount === 0) return false;
    // Search filter
    return o.name?.toLowerCase().includes(search.toLowerCase()) || o.id.includes(search);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="بحث بالاسم أو ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 text-sm" />
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} منظمة</span>
        <Button size="sm" className="text-xs gap-1" onClick={() => setShowCreate(true)}>
          <Plus className="w-3 h-3" /> إضافة عميل
        </Button>
      </div>

      {/* Create Account Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm">إضافة عميل جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">الاسم الكامل</Label>
              <Input value={newAccount.full_name} onChange={(e) => setNewAccount({ ...newAccount, full_name: e.target.value })} placeholder="أحمد محمد" className="mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-xs">البريد الإلكتروني</Label>
              <Input value={newAccount.email} onChange={(e) => setNewAccount({ ...newAccount, email: e.target.value })} placeholder="client@example.com" className="mt-1 text-sm" dir="ltr" type="email" />
              <p className="text-[10px] text-muted-foreground mt-1">سيستلم العميل رابط لتعيين كلمة المرور على هذا البريد</p>
            </div>
            <div>
              <Label className="text-xs">اسم المنظمة (اختياري)</Label>
              <Input value={newAccount.org_name} onChange={(e) => setNewAccount({ ...newAccount, org_name: e.target.value })} placeholder="شركة أبجد" className="mt-1 text-sm" />
            </div>
            <Button className="w-full text-sm" onClick={createAccount} disabled={creating}>
              {creating ? "جاري الإنشاء..." : "إنشاء الحساب"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-3">
        {filtered.map((org) => {
          const plan = plans.find((p) => p.id === org.plan_id);
          const members = profiles.filter((p) => p.org_id === org.id);
          const wallet = wallets.find((w) => w.org_id === org.id);
          const isExpanded = expandedOrg === org.id;

          // Activity data
          const lastLogin = members
            .filter((m: any) => m.last_seen_at)
            .sort((a: any, b: any) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime())[0]?.last_seen_at;
          const lastMsg = conversations
            .filter((c: any) => c.org_id === org.id && c.last_message_at)
            .sort((a: any, b: any) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())[0]?.last_message_at;

          const timeAgo = (dateStr: string | null) => {
            if (!dateStr) return "لم يسجل";
            const diff = Date.now() - new Date(dateStr).getTime();
            const mins = Math.floor(diff / 60000);
            if (mins < 1) return "الآن";
            if (mins < 60) return `منذ ${mins} د`;
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return `منذ ${hrs} س`;
            const days = Math.floor(hrs / 24);
            return `منذ ${days} يوم`;
          };

          return (
            <div key={org.id} className="bg-card rounded-xl shadow-card overflow-hidden">
              <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-secondary/30 transition-colors" onClick={() => setExpandedOrg(isExpanded ? null : org.id)}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    {org.is_ecommerce ? <Store className="w-5 h-5 text-primary" /> : <Building2 className="w-5 h-5 text-primary" />}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{org.name}</p>
                     <p className="text-[10px] text-muted-foreground">
                       {org.id.slice(0, 12)}... · {members.length} عضو · رصيد: {wallet?.balance || 0} ر.س
                       {waConfigs.filter((w) => w.org_id === org.id).length > 0 && (
                         <> · <Smartphone className="w-3 h-3 inline" /> {waConfigs.filter((w) => w.org_id === org.id).length} رقم</>
                       )}
                     </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" /> آخر دخول: {timeAgo(lastLogin)}
                      </span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" /> آخر رسالة: {timeAgo(lastMsg)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {org.is_ecommerce && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium flex items-center gap-1">
                      <ShoppingBag className="w-3 h-3" /> متجر
                    </span>
                  )}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor(org.subscription_status)}`}>
                    {org.subscription_status === "trial" ? "تجريبي" : org.subscription_status === "active" ? "فعال" : org.subscription_status === "expired" ? "منتهي" : "ملغي"}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{plan?.name_ar || "بدون"}</span>
                  {org.is_active ? <UserCheck className="w-4 h-4 text-primary" /> : <UserX className="w-4 h-4 text-destructive" />}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-border p-4 space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] text-muted-foreground">الباقة</label>
                      <select value={org.plan_id || ""} onChange={(e) => updatePlan(org.id, e.target.value)} className="w-full text-xs bg-secondary rounded-lg px-3 py-2 mt-1">
                        {plans.map((p) => <option key={p.id} value={p.id}>{p.name_ar} - {p.price} ر.س</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">حالة الاشتراك</label>
                      <select value={org.subscription_status} onChange={(e) => updateStatus(org.id, e.target.value)} className="w-full text-xs bg-secondary rounded-lg px-3 py-2 mt-1">
                        <option value="trial">تجريبي</option>
                        <option value="active">فعال</option>
                        <option value="expired">منتهي</option>
                        <option value="cancelled">ملغي</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">تاريخ الإنشاء</label>
                      <p className="text-xs mt-1 bg-secondary rounded-lg px-3 py-2">{org.created_at ? new Date(org.created_at).toLocaleDateString("ar-SA") : "-"}</p>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">نهاية التجربة</label>
                      <p className="text-xs mt-1 bg-secondary rounded-lg px-3 py-2">{org.trial_ends_at ? new Date(org.trial_ends_at).toLocaleDateString("ar-SA") : "-"}</p>
                    </div>
                  </div>

                  {/* Account Type Toggle */}
                  <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <Store className="w-4 h-4 text-primary" /> نوع الحساب
                    </p>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{org.is_ecommerce ? "متجر إلكتروني" : "مؤسسة / شركة"}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {org.is_ecommerce ? "يظهر له: الطلبات، السلات المتروكة، فلاتر المتجر" : "واجهة عادية بدون ميزات المتجر"}
                        </p>
                      </div>
                      <Switch checked={org.is_ecommerce || false} onCheckedChange={() => toggleEcommerce(org.id, org.is_ecommerce || false)} />
                    </div>
                    {org.is_ecommerce && (
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">منصة المتجر</Label>
                          <select value={org.store_platform || ""} onChange={(e) => updateStorePlatform(org.id, e.target.value)} className="w-full text-xs bg-background rounded-lg px-3 py-2 mt-1">
                            <option value="">غير محدد</option>
                            <option value="salla">سلة</option>
                            <option value="zid">زد</option>
                            <option value="shopify">Shopify</option>
                            <option value="woocommerce">WooCommerce</option>
                            <option value="other">أخرى</option>
                          </select>
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">رابط المتجر</Label>
                          <Input
                            value={org.store_url || ""}
                            onChange={(e) => updateStoreUrl(org.id, e.target.value)}
                            placeholder="https://store.example.com"
                            className="text-xs bg-background border-0 mt-1 h-8"
                            dir="ltr"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-semibold mb-2">الأعضاء ({members.length})</p>
                    <div className="space-y-1">
                      {members.map((m) => (
                        <div key={m.id} className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">{m.full_name?.slice(0, 2) || "؟"}</div>
                          <span className="text-xs">{m.full_name || "بدون اسم"}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* WhatsApp Numbers */}
                  {(() => {
                    const orgWa = waConfigs.filter((w) => w.org_id === org.id);
                    return orgWa.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-primary" /> أرقام الواتساب ({orgWa.length})
                        </p>
                        <div className="space-y-1">
                          {orgWa.map((w) => (
                            <div key={w.id} className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-2">
                              <div className="flex items-center gap-2">
                                <Phone className="w-3.5 h-3.5 text-primary" />
                                <div>
                                  <span className="text-xs font-medium" dir="ltr">{w.display_phone || w.phone_number_id}</span>
                                  {w.business_name && <span className="text-[10px] text-muted-foreground mr-2">({w.business_name})</span>}
                                </div>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${w.is_connected ? "bg-green-100 text-green-700" : "bg-destructive/10 text-destructive"}`}>
                                  {w.is_connected ? "متصل" : "غير متصل"}
                                </span>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => deleteWhatsAppConfig(w.id)}
                                title="حذف الرقم"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2">
                        <Phone className="w-3 h-3" /> لا توجد أرقام واتساب مربوطة
                      </div>
                    );
                  })()}

                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="text-xs gap-1" onClick={(e) => { e.stopPropagation(); impersonateOrg(org.id); }}>
                      <Eye className="w-3 h-3" /> عرض كعميل
                    </Button>
                    <Button size="sm" variant={org.is_active ? "destructive" : "default"} className="text-xs" onClick={() => toggleActive(org.id, org.is_active)}>
                      {org.is_active ? "تعطيل المنظمة" : "تفعيل المنظمة"}
                    </Button>
                    {org.is_active && (
                      <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => archiveOrg(org.id)}>
                        <Archive className="w-3 h-3" /> أرشفة
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" className="text-xs gap-1" onClick={() => setDeleteTarget({ id: org.id, name: org.name })}>
                      <Trash2 className="w-3 h-3" /> حذف نهائي
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الحساب نهائياً؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف <strong>{deleteTarget?.name}</strong> وجميع بياناته (المحادثات، العملاء، الحملات، المحفظة) بشكل نهائي ولا يمكن التراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={deleteOrg} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "جاري الحذف..." : "حذف نهائي"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminAccounts;
