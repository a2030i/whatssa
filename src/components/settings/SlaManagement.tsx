import { useState, useEffect } from "react";
import { Shield, Plus, Pencil, Trash2, Clock, AlertTriangle, Loader2, Timer, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SlaPolicy {
  id: string;
  name: string;
  priority: string;
  first_response_minutes: number;
  resolution_minutes: number;
  escalation_enabled: boolean;
  escalation_team_id: string | null;
  is_active: boolean;
}

const PRIORITIES = [
  { key: "urgent", label: "عاجل 🔴", color: "bg-destructive/10 text-destructive" },
  { key: "high", label: "عالي 🟠", color: "bg-warning/10 text-warning" },
  { key: "normal", label: "عادي 🟢", color: "bg-success/10 text-success" },
  { key: "low", label: "منخفض ⚪", color: "bg-muted text-muted-foreground" },
];

const formatMinutes = (m: number) => {
  if (m < 60) return `${m} دقيقة`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h} ساعة و ${rm} دقيقة` : `${h} ساعة`;
};

const SlaManagement = () => {
  const { orgId } = useAuth();
  const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SlaPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    name: "", priority: "normal", first_response_minutes: 30,
    resolution_minutes: 480, escalation_enabled: true, escalation_team_id: "",
  });

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    const [{ data: p }, { data: t }] = await Promise.all([
      supabase.from("sla_policies").select("*").eq("org_id", orgId).order("priority"),
      supabase.from("teams").select("id, name").eq("org_id", orgId),
    ]);
    setPolicies((p as SlaPolicy[]) || []);
    setTeams((t as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [orgId]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", priority: "normal", first_response_minutes: 30, resolution_minutes: 480, escalation_enabled: true, escalation_team_id: "" });
    setDialogOpen(true);
  };

  const openEdit = (p: SlaPolicy) => {
    setEditing(p);
    setForm({
      name: p.name, priority: p.priority,
      first_response_minutes: p.first_response_minutes,
      resolution_minutes: p.resolution_minutes,
      escalation_enabled: p.escalation_enabled,
      escalation_team_id: p.escalation_team_id || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!orgId || !form.name.trim()) { toast.error("اسم السياسة مطلوب"); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(), priority: form.priority,
      first_response_minutes: form.first_response_minutes,
      resolution_minutes: form.resolution_minutes,
      escalation_enabled: form.escalation_enabled,
      escalation_team_id: form.escalation_team_id || null,
      updated_at: new Date().toISOString(),
    };
    if (editing) {
      await supabase.from("sla_policies").update(payload).eq("id", editing.id);
      toast.success("تم تحديث السياسة");
    } else {
      await supabase.from("sla_policies").insert({ ...payload, org_id: orgId });
      toast.success("تمت إضافة السياسة");
    }
    setSaving(false);
    setDialogOpen(false);
    load();
  };

  const toggleActive = async (id: string, is_active: boolean) => {
    await supabase.from("sla_policies").update({ is_active }).eq("id", id);
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("sla_policies").delete().eq("id", id);
    toast.success("تم الحذف");
    load();
  };

  const getPriority = (key: string) => PRIORITIES.find(p => p.key === key) || PRIORITIES[2];

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">سياسات SLA</h3>
          <Badge variant="secondary" className="text-[10px]">{policies.length}</Badge>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1" onClick={openNew}>
          <Plus className="w-3 h-3" /> إضافة سياسة
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        حدد أوقات الاستجابة والحل لكل مستوى أولوية. يتم تصعيد المحادثات تلقائياً عند التجاوز.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : policies.length === 0 ? (
        <div className="text-center py-8">
          <Shield className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">لا توجد سياسات SLA</p>
          <Button size="sm" variant="outline" className="mt-3 h-7 text-xs" onClick={openNew}>
            <Plus className="w-3 h-3 ml-1" /> أضف أول سياسة
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {policies.map(p => {
            const pri = getPriority(p.priority);
            return (
              <div key={p.id} className={cn("flex items-center gap-3 p-3 rounded-lg border transition-colors", p.is_active ? "bg-card" : "bg-muted/30 opacity-60")}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={cn("text-[10px]", pri.color)}>{pri.label}</Badge>
                    <span className="text-sm font-medium">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> استجابة: {formatMinutes(p.first_response_minutes)}</span>
                    <span className="flex items-center gap-1"><Timer className="w-3 h-3" /> حل: {formatMinutes(p.resolution_minutes)}</span>
                    {p.escalation_enabled && <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-warning" /> تصعيد مفعّل</span>}
                  </div>
                </div>
                <Switch checked={p.is_active} onCheckedChange={(v) => toggleActive(p.id, v)} />
                <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => openEdit(p)}>
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive" onClick={() => handleDelete(p.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm">{editing ? "تعديل سياسة SLA" : "إضافة سياسة SLA"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">اسم السياسة</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="مثال: استجابة VIP" className="h-8 text-xs bg-secondary border-0" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الأولوية</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger className="h-8 text-xs bg-secondary border-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">وقت الاستجابة الأولى (دقائق)</Label>
                <Input type="number" value={form.first_response_minutes} onChange={e => setForm(f => ({ ...f, first_response_minutes: parseInt(e.target.value) || 0 }))} className="h-8 text-xs bg-secondary border-0" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">وقت الحل (دقائق)</Label>
                <Input type="number" value={form.resolution_minutes} onChange={e => setForm(f => ({ ...f, resolution_minutes: parseInt(e.target.value) || 0 }))} className="h-8 text-xs bg-secondary border-0" />
              </div>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                <div>
                  <p className="text-xs font-medium">تصعيد تلقائي</p>
                  <p className="text-[10px] text-muted-foreground">تصعيد المحادثة عند تجاوز الوقت</p>
                </div>
              </div>
              <Switch checked={form.escalation_enabled} onCheckedChange={v => setForm(f => ({ ...f, escalation_enabled: v }))} />
            </div>
            {form.escalation_enabled && teams.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">فريق التصعيد</Label>
                <Select value={form.escalation_team_id} onValueChange={v => setForm(f => ({ ...f, escalation_team_id: v }))}>
                  <SelectTrigger className="h-8 text-xs bg-secondary border-0"><SelectValue placeholder="اختر فريق" /></SelectTrigger>
                  <SelectContent>
                    {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={handleSave} disabled={saving} className="w-full h-8 text-xs">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : editing ? "حفظ التعديلات" : "إضافة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SlaManagement;

