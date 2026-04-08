import { useState, useEffect } from "react";
import { Plus, Clock, Trash2, Save, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ShiftTemplate {
  id: string;
  name: string;
  name_ar: string;
  start_time: string;
  end_time: string;
  work_days: number[];
  color: string;
  is_active: boolean;
}

const DAY_LABELS = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

interface ShiftManagementProps {
  onShiftsLoaded?: (shifts: ShiftTemplate[]) => void;
}

const ShiftManagement = ({ onShiftsLoaded }: ShiftManagementProps) => {
  const { orgId } = useAuth();
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftTemplate | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [workDays, setWorkDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [color, setColor] = useState("#3b82f6");

  useEffect(() => {
    if (orgId) loadShifts();
  }, [orgId]);

  const loadShifts = async () => {
    const { data } = await supabase
      .from("shift_templates" as any)
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("created_at");
    const s = (data || []) as unknown as ShiftTemplate[];
    setShifts(s);
    onShiftsLoaded?.(s);
  };

  const openCreate = () => {
    setEditingShift(null);
    setName("");
    setNameAr("");
    setStartTime("09:00");
    setEndTime("17:00");
    setWorkDays([0, 1, 2, 3, 4]);
    setColor("#3b82f6");
    setDialogOpen(true);
  };

  const openEdit = (shift: ShiftTemplate) => {
    setEditingShift(shift);
    setName(shift.name);
    setNameAr(shift.name_ar);
    setStartTime(shift.start_time.slice(0, 5));
    setEndTime(shift.end_time.slice(0, 5));
    setWorkDays(shift.work_days);
    setColor(shift.color);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!nameAr.trim()) { toast.error("يرجى إدخال اسم الشفت"); return; }

    const payload = {
      org_id: orgId,
      name: name || nameAr,
      name_ar: nameAr,
      start_time: startTime,
      end_time: endTime,
      work_days: workDays,
      color,
    };

    if (editingShift) {
      await supabase.from("shift_templates" as any).update(payload as any).eq("id", editingShift.id);
      toast.success("تم تعديل الشفت");
    } else {
      await supabase.from("shift_templates" as any).insert(payload as any);
      toast.success("تم إنشاء الشفت");
    }

    setDialogOpen(false);
    loadShifts();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("shift_templates" as any).update({ is_active: false } as any).eq("id", id);
    toast.success("تم حذف الشفت");
    loadShifts();
  };

  const toggleDay = (day: number) => {
    setWorkDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          قوالب الشفتات
        </h3>
        <Button size="sm" variant="outline" onClick={openCreate} className="gap-1.5 text-xs h-8">
          <Plus className="w-3.5 h-3.5" /> شفت جديد
        </Button>
      </div>

      {shifts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">لم تُنشئ أي شفتات بعد</p>
          <Button size="sm" variant="link" onClick={openCreate} className="text-xs mt-1">أنشئ أول شفت</Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {shifts.map(shift => (
            <div
              key={shift.id}
              className="bg-card rounded-xl border p-3 flex items-center gap-3 group"
              style={{ borderRightWidth: 4, borderRightColor: shift.color }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{shift.name_ar}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-[10px]">
                    {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                  </Badge>
                  <div className="flex gap-0.5">
                    {DAY_LABELS.map((d, i) => (
                      <span
                        key={i}
                        className={cn(
                          "text-[8px] w-4 h-4 rounded-full flex items-center justify-center",
                          shift.work_days.includes(i) ? "bg-primary/10 text-primary font-bold" : "text-muted-foreground/30"
                        )}
                      >
                        {d[0]}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(shift)}>
                  <Save className="w-3 h-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(shift.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-primary" />
              {editingShift ? "تعديل الشفت" : "إنشاء شفت جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">اسم الشفت *</Label>
              <Input placeholder="مثال: الفترة الصباحية" value={nameAr} onChange={e => setNameAr(e.target.value)} className="text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">بداية الدوام</Label>
                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="text-sm" dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">نهاية الدوام</Label>
                <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="text-sm" dir="ltr" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">أيام العمل</Label>
              <div className="flex gap-1.5">
                {DAY_LABELS.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    className={cn(
                      "w-9 h-9 rounded-lg text-[10px] font-medium transition-all border",
                      workDays.includes(i)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 text-muted-foreground border-transparent hover:border-border"
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1"><Palette className="w-3 h-3" /> لون الشفت</Label>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={cn(
                      "w-7 h-7 rounded-full transition-all",
                      color === c ? "ring-2 ring-offset-2 ring-primary scale-110" : "opacity-60 hover:opacity-100"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} className="gap-1.5">
              <Save className="w-4 h-4" /> حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ShiftManagement;
