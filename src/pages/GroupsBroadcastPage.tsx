import { useState, useEffect, useCallback } from "react";
import { Users, Send, RefreshCw, Check, Megaphone, Image, FileText, Video, Mic, AlertTriangle, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { supabase, invokeCloud } from "@/lib/supabase";
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

interface Channel {
  id: string;
  display_phone: string;
  business_name: string;
  evolution_instance_name: string;
  channel_label: string | null;
}

const GroupsBroadcastPage = () => {
  const { orgId } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState("");
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

  // Load evolution channels
  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("whatsapp_config")
      .select("id, display_phone, business_name, evolution_instance_name, channel_label")
      .eq("org_id", orgId)
      .eq("channel_type", "evolution")
      .eq("is_connected", true)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setChannels(data as Channel[]);
          setSelectedChannelId(data[0].id);
        }
      });
  }, [orgId]);

  const fetchGroups = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setGroups([]);
    setSelectedIds(new Set());
    try {
      const { data, error } = await invokeCloud("evolution-manage", {
        body: { action: "fetch_groups", channel_id: selectedChannelId || undefined },
      });
      if (error) throw error;
      if (data?.groups) {
        setGroups(data.groups);
        toast.success(`تم جلب ${data.groups.length} قروب`);
      } else if (data?.error) {
        toast.error(data.error);
      }
    } catch (e: any) {
      toast.error(e?.message || "فشل جلب القروبات");
    } finally {
      setLoading(false);
    }
  }, [orgId, selectedChannelId]);

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
          channel_id: selectedChannelId || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
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

  const selectedChannel = channels.find((c) => c.id === selectedChannelId);

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
            <Megaphone className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            بث القروبات
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            أرسل رسائل جماعية لقروبات الواتساب (غير رسمي)
          </p>
        </div>

        {/* Channel selector + fetch button */}
        <div className="flex flex-col sm:flex-row gap-2">
          {channels.length > 1 && (
            <Select value={selectedChannelId} onValueChange={(v) => { setSelectedChannelId(v); setGroups([]); setSelectedIds(new Set()); }}>
              <SelectTrigger className="flex-1 sm:max-w-[280px]">
                <SelectValue placeholder="اختر القناة" />
              </SelectTrigger>
              <SelectContent>
                {channels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    <div className="flex items-center gap-2">
                      <Radio className="w-3.5 h-3.5 text-primary" />
                      <span>{ch.channel_label || ch.business_name || ch.display_phone}</span>
                      {ch.display_phone && <span className="text-muted-foreground text-xs">({ch.display_phone})</span>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {channels.length === 1 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              <Radio className="w-4 h-4 text-primary" />
              <span>{selectedChannel?.channel_label || selectedChannel?.business_name || selectedChannel?.display_phone}</span>
            </div>
          )}

          <Button onClick={fetchGroups} disabled={loading || !selectedChannelId} variant="outline" className="gap-2 shrink-0">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            {groups.length > 0 ? "تحديث" : "جلب القروبات"}
          </Button>
        </div>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-warning/30 bg-warning/5">
        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          الإرسال المكثف قد يؤدي لحظر الرقم. يُفضل التأخير وعدم الإفراط.
        </p>
      </div>

      {channels.length === 0 && !loading ? (
        <div className="text-center py-16 space-y-3">
          <Radio className="w-12 h-12 mx-auto text-muted-foreground/50" />
          <p className="text-muted-foreground">لا توجد قنوات واتساب غير رسمية مربوطة</p>
          <p className="text-xs text-muted-foreground">اذهب لصفحة الربط والتكامل لإضافة قناة</p>
        </div>
      ) : groups.length === 0 && !loading ? (
        <div className="text-center py-12 space-y-3">
          <Users className="w-12 h-12 mx-auto text-muted-foreground/50" />
          <p className="text-muted-foreground">اضغط "جلب القروبات" لعرض جميع القروبات المتاحة</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Groups List */}
          <div className="lg:col-span-2 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                placeholder="بحث في القروبات..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 h-9 text-sm"
              />
              <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs shrink-0">
                {selectedIds.size === filtered.length && filtered.length > 0 ? "إلغاء" : "الكل"}
              </Button>
              <Badge variant="secondary" className="text-xs shrink-0">{selectedIds.size}</Badge>
            </div>

            <div className="max-h-[400px] md:max-h-[500px] overflow-y-auto space-y-1.5 border rounded-lg p-1.5">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : (
                filtered.map((group) => (
                  <div
                    key={group.id}
                    className={cn(
                      "flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors",
                      selectedIds.has(group.id)
                        ? "border-primary/50 bg-primary/5"
                        : "border-transparent hover:bg-muted/50"
                    )}
                    onClick={() => toggleSelect(group.id)}
                  >
                    <Checkbox
                      checked={selectedIds.has(group.id)}
                      onCheckedChange={() => toggleSelect(group.id)}
                      className="shrink-0"
                    />
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{group.subject}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {group.size} عضو
                        {group.description && ` · ${group.description.slice(0, 40)}`}
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
          <div className="space-y-3 border rounded-lg p-3">
            <h3 className="font-semibold text-sm text-foreground">تأليف الرسالة</h3>

            <div className="space-y-1.5">
              <Label className="text-xs">الرسالة</Label>
              <Textarea
                placeholder="اكتب رسالتك هنا..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">رابط وسائط (اختياري)</Label>
              <Input
                placeholder="https://example.com/file.pdf"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                className="text-sm h-9"
              />
            </div>

            {mediaUrl && (
              <div className="space-y-1.5">
                <Label className="text-xs">نوع الوسائط</Label>
                <Select value={mediaType} onValueChange={setMediaType}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image"><div className="flex items-center gap-2"><Image className="w-3.5 h-3.5" /> صورة</div></SelectItem>
                    <SelectItem value="video"><div className="flex items-center gap-2"><Video className="w-3.5 h-3.5" /> فيديو</div></SelectItem>
                    <SelectItem value="document"><div className="flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> ملف/PDF</div></SelectItem>
                    <SelectItem value="audio"><div className="flex items-center gap-2"><Mic className="w-3.5 h-3.5" /> بودكاست</div></SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">التأخير بين الرسائل (ثواني)</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Number(e.target.value) || 3)}
                className="h-9 text-sm"
              />
            </div>

            {sendResult && (
              <div className="p-2.5 rounded-lg bg-success/10 border border-success/30 space-y-1.5">
                <div className="flex items-center gap-2 text-success text-xs font-medium">
                  <Check className="w-3.5 h-3.5" />
                  تم الإرسال: {sendResult.sent}/{sendResult.total}
                </div>
                <Progress value={(sendResult.sent / sendResult.total) * 100} className="h-1.5" />
              </div>
            )}

            <Button
              className="w-full gap-2 text-sm"
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
