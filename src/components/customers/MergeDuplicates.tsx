import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Merge, Check, AlertTriangle, Phone, User, Mail } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

interface DuplicateGroup {
  phone: string;
  customers: any[];
}

const MergeDuplicates = ({ onMerged }: { onMerged?: () => void }) => {
  const { orgId } = useAuth();
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null);
  const [primaryId, setPrimaryId] = useState<string>("");

  useEffect(() => {
    if (orgId) detect();
  }, [orgId]);

  const detect = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("customers")
      .select("*")
      .eq("org_id", orgId!)
      .order("created_at", { ascending: true });

    if (!data) { setLoading(false); return; }

    // Group by phone
    const phoneMap: Record<string, any[]> = {};
    data.forEach(c => {
      const phone = c.phone.replace(/[\s\-()]/g, "");
      if (!phoneMap[phone]) phoneMap[phone] = [];
      phoneMap[phone].push(c);
    });

    // Also check by normalized phone (with/without country code)
    const normalized: Record<string, any[]> = {};
    data.forEach(c => {
      let p = c.phone.replace(/[\s\-()]/g, "");
      // Normalize Saudi numbers
      if (p.startsWith("+966")) p = "0" + p.slice(4);
      else if (p.startsWith("966")) p = "0" + p.slice(3);
      const key = p;
      if (!normalized[key]) normalized[key] = [];
      if (!normalized[key].find((x: any) => x.id === c.id)) normalized[key].push(c);
    });

    const dupes: DuplicateGroup[] = [];
    const seen = new Set<string>();

    Object.entries(normalized).forEach(([phone, custs]) => {
      if (custs.length > 1) {
        const ids = custs.map(c => c.id).sort().join(",");
        if (!seen.has(ids)) {
          seen.add(ids);
          dupes.push({ phone, customers: custs });
        }
      }
    });

    setDuplicates(dupes);
    setLoading(false);
  };

  const handleMerge = async () => {
    if (!selectedGroup || !primaryId) return;
    setMerging(true);

    const primary = selectedGroup.customers.find(c => c.id === primaryId);
    const others = selectedGroup.customers.filter(c => c.id !== primaryId);

    // Merge data: combine tags, prefer non-null values
    const mergedTags = [...new Set([...(primary.tags || []), ...others.flatMap((o: any) => o.tags || [])])];
    const mergedName = primary.name || others.find((o: any) => o.name)?.name;
    const mergedEmail = primary.email || others.find((o: any) => o.email)?.email;
    const mergedCompany = primary.company || others.find((o: any) => o.company)?.company;
    const mergedNotes = [primary.notes, ...others.map((o: any) => o.notes)].filter(Boolean).join("\n---\n");

    // Update primary customer
    await supabase.from("customers").update({
      name: mergedName,
      email: mergedEmail,
      company: mergedCompany,
      tags: mergedTags,
      notes: mergedNotes || null,
    }).eq("id", primaryId);

    // Update conversations to point to primary
    for (const other of others) {
      await supabase.from("conversations")
        .update({ customer_id: primaryId })
        .eq("customer_id", other.id)
        .eq("org_id", orgId!);

      // Delete duplicate
      await supabase.from("customers").delete().eq("id", other.id);
    }

    toast.success(`تم دمج ${selectedGroup.customers.length} جهة اتصال`);
    setSelectedGroup(null);
    setPrimaryId("");
    setMerging(false);
    detect();
    onMerged?.();
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-4" dir="rtl">
      {duplicates.length === 0 ? (
        <Card className="bg-card/70 backdrop-blur-sm border-border/40 rounded-2xl">
          <CardContent className="p-8 text-center">
            <Check className="w-12 h-12 mx-auto text-primary mb-3" />
            <h3 className="font-semibold text-sm">لا توجد جهات اتصال مكررة</h3>
            <p className="text-xs text-muted-foreground mt-1">جميع جهات الاتصال فريدة</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <span className="text-sm font-semibold">تم اكتشاف {duplicates.length} مجموعة مكررة</span>
            </div>
          </div>

          <div className="space-y-3">
            {duplicates.map((group, i) => (
              <Card key={i} className="bg-card/70 backdrop-blur-sm border-border/40 rounded-2xl hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-mono" dir="ltr">{group.phone}</span>
                      <Badge variant="destructive" className="text-[9px]">{group.customers.length} مكرر</Badge>
                    </div>
                    <Button size="sm" variant="outline" className="text-xs gap-1.5 rounded-xl" onClick={() => { setSelectedGroup(group); setPrimaryId(group.customers[0].id); }}>
                      <Merge className="w-3 h-3" /> دمج
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.customers.map(c => (
                      <div key={c.id} className="bg-secondary/30 rounded-xl p-2.5 text-xs space-y-1">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3 h-3 text-muted-foreground" />
                          <span className="font-medium">{c.name || "بدون اسم"}</span>
                        </div>
                        {c.email && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Mail className="w-3 h-3" />
                            <span>{c.email}</span>
                          </div>
                        )}
                        <div className="flex gap-1">
                          {(c.tags || []).map((t: string) => (
                            <Badge key={t} variant="secondary" className="text-[8px] px-1">{t}</Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Merge Dialog */}
      <Dialog open={!!selectedGroup} onOpenChange={() => setSelectedGroup(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base">دمج جهات الاتصال</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">اختر جهة الاتصال الأساسية (سيتم نقل البيانات والمحادثات إليها وحذف البقية):</p>

          <RadioGroup value={primaryId} onValueChange={setPrimaryId} className="space-y-2">
            {selectedGroup?.customers.map(c => (
              <div key={c.id} className="flex items-center gap-3 bg-secondary/30 rounded-xl p-3">
                <RadioGroupItem value={c.id} id={c.id} />
                <Label htmlFor={c.id} className="flex-1 cursor-pointer">
                  <p className="text-sm font-medium">{c.name || "بدون اسم"}</p>
                  <p className="text-[10px] text-muted-foreground font-mono" dir="ltr">{c.phone}</p>
                  {c.email && <p className="text-[10px] text-muted-foreground">{c.email}</p>}
                </Label>
              </div>
            ))}
          </RadioGroup>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedGroup(null)}>إلغاء</Button>
            <Button size="sm" onClick={handleMerge} disabled={merging || !primaryId} className="gap-1.5">
              {merging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Merge className="w-3.5 h-3.5" />}
              دمج
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MergeDuplicates;
