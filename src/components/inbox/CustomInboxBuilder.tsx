import { useState, useEffect } from "react";
import { X, Plus, Trash2, Save, Filter, Settings, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface FilterCondition {
  id: string;
  field: string;
  operator: string;
  value: string;
}

interface FilterGroup {
  id: string;
  logic: "and" | "or";
  conditions: FilterCondition[];
}

export interface CustomInbox {
  id: string;
  name: string;
  filters: FilterGroup[];
  is_shared: boolean;
}

const FIELDS = [
  { value: "status", label: "حالة المحادثة" },
  { value: "assigned_to", label: "الموظف المسؤول" },
  { value: "assigned_team", label: "الفريق" },
  { value: "tags", label: "الوسوم" },
  { value: "conversation_type", label: "نوع المحادثة" },
  { value: "unread_count", label: "الرسائل غير المقروءة" },
  { value: "customer_name", label: "اسم العميل" },
];

const OPERATORS: Record<string, { value: string; label: string }[]> = {
  status: [
    { value: "eq", label: "يساوي" },
    { value: "neq", label: "لا يساوي" },
  ],
  assigned_to: [
    { value: "eq", label: "يساوي" },
    { value: "neq", label: "لا يساوي" },
    { value: "is_null", label: "غير معيّن" },
    { value: "is_not_null", label: "معيّن" },
  ],
  assigned_team: [
    { value: "eq", label: "يساوي" },
    { value: "neq", label: "لا يساوي" },
    { value: "is_null", label: "بدون فريق" },
  ],
  tags: [
    { value: "contains", label: "يحتوي على" },
    { value: "not_contains", label: "لا يحتوي على" },
  ],
  conversation_type: [
    { value: "eq", label: "يساوي" },
    { value: "neq", label: "لا يساوي" },
  ],
  unread_count: [
    { value: "gt", label: "أكبر من" },
    { value: "eq", label: "يساوي" },
    { value: "lt", label: "أقل من" },
  ],
  customer_name: [
    { value: "contains", label: "يحتوي على" },
    { value: "eq", label: "يساوي" },
  ],
};

const VALUE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  status: [
    { value: "active", label: "نشط" },
    { value: "waiting", label: "بانتظار" },
    { value: "closed", label: "مغلق" },
  ],
  conversation_type: [
    { value: "private", label: "خاصة" },
    { value: "group", label: "قروب" },
    { value: "broadcast", label: "بث" },
  ],
};

const genId = () => Math.random().toString(36).slice(2, 8);

interface CustomInboxBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editInbox?: CustomInbox | null;
  onSaved: () => void;
}

const CustomInboxBuilder = ({ open, onOpenChange, editInbox, onSaved }: CustomInboxBuilderProps) => {
  const { orgId, user } = useAuth();
  const [name, setName] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [groups, setGroups] = useState<FilterGroup[]>([
    { id: genId(), logic: "and", conditions: [{ id: genId(), field: "status", operator: "neq", value: "closed" }] },
  ]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("filters");

  useEffect(() => {
    if (editInbox) {
      setName(editInbox.name);
      setIsShared(editInbox.is_shared);
      setGroups(editInbox.filters.length > 0 ? editInbox.filters : [
        { id: genId(), logic: "and", conditions: [{ id: genId(), field: "status", operator: "neq", value: "closed" }] },
      ]);
    } else {
      setName("");
      setIsShared(false);
      setGroups([{ id: genId(), logic: "and", conditions: [{ id: genId(), field: "status", operator: "neq", value: "closed" }] }]);
    }
  }, [editInbox, open]);

  const addCondition = (groupId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, conditions: [...g.conditions, { id: genId(), field: "status", operator: "eq", value: "active" }] }
          : g
      )
    );
  };

  const removeCondition = (groupId: string, conditionId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, conditions: g.conditions.filter((c) => c.id !== conditionId) }
          : g
      ).filter((g) => g.conditions.length > 0)
    );
  };

  const updateCondition = (groupId: string, conditionId: string, field: string, value: any) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? {
              ...g,
              conditions: g.conditions.map((c) =>
                c.id === conditionId ? { ...c, [field]: value } : c
              ),
            }
          : g
      )
    );
  };

  const addGroup = () => {
    setGroups((prev) => [
      ...prev,
      { id: genId(), logic: "or", conditions: [{ id: genId(), field: "status", operator: "eq", value: "active" }] },
    ]);
  };

  const needsValueInput = (operator: string) => !["is_null", "is_not_null"].includes(operator);

  const save = async (asNew = false) => {
    if (!name.trim()) {
      toast.error("أدخل اسم الصندوق");
      return;
    }
    if (!orgId || !user) return;
    setSaving(true);

    const payload = {
      org_id: orgId,
      created_by: user.id,
      name: name.trim(),
      filters: groups as any,
      is_shared: isShared,
    };

    let error;
    if (editInbox && !asNew) {
      ({ error } = await supabase.from("custom_inboxes").update(payload).eq("id", editInbox.id));
    } else {
      ({ error } = await supabase.from("custom_inboxes").insert(payload));
    }

    setSaving(false);
    if (error) {
      toast.error("فشل الحفظ");
      return;
    }
    toast.success(asNew ? "تم حفظ صندوق جديد" : "تم الحفظ");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">
            {editInbox ? "تعديل صندوق الوارد" : "إنشاء صندوق وارد مخصص"}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="filters" className="text-xs gap-1.5">
              <Filter className="w-3.5 h-3.5" /> تصفية
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs gap-1.5">
              <Settings className="w-3.5 h-3.5" /> الإعدادات
            </TabsTrigger>
          </TabsList>

          <TabsContent value="filters" className="space-y-4 mt-4">
            <p className="text-xs text-muted-foreground">
              أنشئ صناديق وارد مخصصة لتصنيف المحادثات بناءً على معايير محددة.
            </p>

            {groups.map((group, gi) => (
              <div key={group.id}>
                {gi > 0 && (
                  <div className="flex items-center justify-end gap-2 my-3">
                    <Button
                      size="sm"
                      variant={group.logic === "or" ? "default" : "outline"}
                      className="h-6 text-[10px] px-2"
                      onClick={() =>
                        setGroups((prev) =>
                          prev.map((g) =>
                            g.id === group.id ? { ...g, logic: g.logic === "and" ? "or" : "and" } : g
                          )
                        )
                      }
                    >
                      {group.logic === "or" ? "أو" : "و"}
                    </Button>
                  </div>
                )}

                <div className="border border-border rounded-lg p-3 space-y-3 bg-secondary/30">
                  {group.conditions.map((cond) => (
                    <div key={cond.id} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Select
                          value={cond.field}
                          onValueChange={(v) => {
                            updateCondition(group.id, cond.id, "field", v);
                            const ops = OPERATORS[v];
                            if (ops) updateCondition(group.id, cond.id, "operator", ops[0].value);
                            const vals = VALUE_OPTIONS[v];
                            if (vals) updateCondition(group.id, cond.id, "value", vals[0].value);
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FIELDS.map((f) => (
                              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={cond.operator}
                          onValueChange={(v) => updateCondition(group.id, cond.id, "operator", v)}
                        >
                          <SelectTrigger className="h-8 text-xs w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(OPERATORS[cond.field] || []).map((op) => (
                              <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <button
                          onClick={() => removeCondition(group.id, cond.id)}
                          className="p-1.5 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {needsValueInput(cond.operator) && (
                        <div className="mr-0">
                          {VALUE_OPTIONS[cond.field] ? (
                            <Select
                              value={cond.value}
                              onValueChange={(v) => updateCondition(group.id, cond.id, "value", v)}
                            >
                              <SelectTrigger className="h-8 text-xs w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {VALUE_OPTIONS[cond.field].map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={cond.value}
                              onChange={(e) => updateCondition(group.id, cond.id, "value", e.target.value)}
                              placeholder="القيمة..."
                              className="h-8 text-xs"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" className="text-[11px] h-7 gap-1" onClick={() => addCondition(group.id)}>
                      <Plus className="w-3 h-3" /> إضافة فلتر
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="text-[11px] h-8 gap-1" onClick={addGroup}>
                <Plus className="w-3 h-3" /> إضافة مجموعة فلاتر
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-xs font-medium">اسم الصندوق</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: المحادثات المفتوحة" className="text-sm" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium">مشاركة مع الفريق</p>
                <p className="text-[11px] text-muted-foreground">يظهر لجميع أعضاء المؤسسة</p>
              </div>
              <button
                onClick={() => setIsShared(!isShared)}
                className={cn(
                  "w-10 h-5 rounded-full transition-colors relative",
                  isShared ? "bg-primary" : "bg-muted"
                )}
              >
                <span className={cn(
                  "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                  isShared ? "right-0.5" : "left-0.5"
                )} />
              </button>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => onOpenChange(false)}>
            إعادة ضبط
          </Button>
          <div className="flex gap-2">
            {editInbox && (
              <Button variant="outline" size="sm" className="text-xs" onClick={() => save(true)} disabled={saving}>
                حفظ كصندوق جديد
              </Button>
            )}
            <Button size="sm" className="text-xs" onClick={() => save(false)} disabled={saving}>
              <Save className="w-3 h-3 ml-1" />
              حفظ
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CustomInboxBuilder;
