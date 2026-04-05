import { useState, useEffect, useCallback } from "react";
import { Users, Send, RefreshCw, Check, X, Megaphone, Image, FileText, Video, Mic, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { invokeCloud } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface Group {
  id: string;
  subject: string;
  size: number;
  creation: number | null;
  owner: string;
  description: string;
  profile_pic: string | null;
}

const GroupsBroadcastPage = () => {
  const { orgId } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState("image");
  const [delaySeconds, setDelaySeconds] = useState(3);
  const [sendResult, setSendResult] = useState<{ sent: number; total: number } | null>(null);

  const fetchGroups = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const { data, error } = await invokeCloud("evolution-manage", {
        body: { action: "fetch_groups" },
      });
      if (error) throw error;
      if (data?.groups) {
        setGroups(data.groups);
        toast.success(`تم جلب ${data.groups.length} قروب`);
      }
    } catch (e: any) {
      toast.error(e?.message || "فشل جلب القروبات");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((g) => g.id)));
    }
  };

  const handleSend = async () => {
    if (selectedIds.size === 0) return toast.error("اختر قروب واحد على الأقل");
    if (!message && !mediaUrl) return toast.error("أدخل رسالة أو رابط وسائط");

    setSending(true);
    setSendResult(null);
    try {
      const { data, error } = await invokeCloud("evolution-manage", {
        body: {
          action: "broadcast_groups",
          group_ids: Array.from(selectedIds),
          message,
          media_url: mediaUrl || undefined,
          media_type: mediaType,
          delay_seconds: delaySeconds,
        },
      });
      if (error) throw error;
      setSendResult({ sent: data?.sent || 0, total: data?.total || 0 });
      toast.success(`تم الإرسال: ${data?.sent}/${data?.total}`);
    } catch (e: any) {
      toast.error(e?.message || "فشل الإرسال");
    } finally {
      setSending(false);
    }
  };

  const filtered = groups.filter(
    (g) =>
      g.subject.toLowerCase().includes(search.toLowerCase()) ||
      g.id.includes(search)
  );

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-primary" />
            بث القروبات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            أرسل رسائل جماعية لقروبات الواتساب (غير رسمي)
          </p>
        </div>
        <Button onClick={fetchGroups} disabled={loading} variant="outline" className="gap-2">
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          {groups.length > 0 ? "تحديث القروبات" : "جلب القروبات"}
        </Button>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-3 p-3 rounded-lg border border-warning/30 bg-warning/5">
        <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          الإرسال المكثف للقروبات قد يؤدي لحظر الرقم. يُفضل التأخير بين الرسائل وعدم الإفراط في الاستخدام.
        </p>
      </div>

      {groups.length === 0 && !loading ? (
        <div className="text-center py-16 space-y-3">
          <Users className="w-12 h-12 mx-auto text-muted-foreground/50" />
          <p className="text-muted-foreground">اضغط "جلب القروبات" لعرض جميع القروبات المتاحة</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Groups List */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center gap-3">
              <Input
                placeholder="بحث في القروبات..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1"
              />
              <Button variant="ghost" size="sm" onClick={selectAll}>
                {selectedIds.size === filtered.length && filtered.length > 0 ? "إلغاء الكل" : "تحديد الكل"}
              </Button>
              <Badge variant="secondary">{selectedIds.size} محدد</Badge>
            </div>

            <div className="max-h-[500px] overflow-y-auto space-y-2 border rounded-lg p-2">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : (
                filtered.map((group) => (
                  <div
                    key={group.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      selectedIds.has(group.id)
                        ? "border-primary/50 bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    )}
                    onClick={() => toggleSelect(group.id)}
                  >
                    <Checkbox
                      checked={selectedIds.has(group.id)}
                      onCheckedChange={() => toggleSelect(group.id)}
                    />
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{group.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {group.size} عضو
                        {group.description && ` • ${group.description.slice(0, 50)}`}
                      </p>
                    </div>
                  </div>
                ))
              )}
              {!loading && filtered.length === 0 && groups.length > 0 && (
                <p className="text-center py-4 text-muted-foreground text-sm">لا توجد نتائج</p>
              )}
            </div>
          </div>

          {/* Compose Panel */}
          <div className="space-y-4 border rounded-lg p-4">
            <h3 className="font-semibold text-foreground">تأليف الرسالة</h3>

            <div className="space-y-2">
              <Label>الرسالة النصية</Label>
              <Textarea
                placeholder="اكتب رسالتك هنا..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>رابط الوسائط (اختياري)</Label>
              <Input
                placeholder="https://example.com/file.pdf"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
              />
            </div>

            {mediaUrl && (
              <div className="space-y-2">
                <Label>نوع الوسائط</Label>
                <Select value={mediaType} onValueChange={setMediaType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image"><div className="flex items-center gap-2"><Image className="w-4 h-4" /> صورة</div></SelectItem>
                    <SelectItem value="video"><div className="flex items-center gap-2"><Video className="w-4 h-4" /> فيديو</div></SelectItem>
                    <SelectItem value="document"><div className="flex items-center gap-2"><FileText className="w-4 h-4" /> ملف/PDF</div></SelectItem>
                    <SelectItem value="audio"><div className="flex items-center gap-2"><Mic className="w-4 h-4" /> صوت/بودكاست</div></SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>التأخير بين الرسائل (ثواني)</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Number(e.target.value) || 3)}
              />
            </div>

            {sendResult && (
              <div className="p-3 rounded-lg bg-success/10 border border-success/30 space-y-2">
                <div className="flex items-center gap-2 text-success text-sm font-medium">
                  <Check className="w-4 h-4" />
                  تم الإرسال: {sendResult.sent}/{sendResult.total}
                </div>
                <Progress value={(sendResult.sent / sendResult.total) * 100} className="h-2" />
              </div>
            )}

            <Button
              className="w-full gap-2"
              onClick={handleSend}
              disabled={sending || selectedIds.size === 0 || (!message && !mediaUrl)}
            >
              {sending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {sending ? "جاري الإرسال..." : `إرسال لـ ${selectedIds.size} قروب`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupsBroadcastPage;
