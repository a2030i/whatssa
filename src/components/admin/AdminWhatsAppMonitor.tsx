import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Phone, Wifi, WifiOff, RefreshCw, Search, Building2, MessageSquare,
  ArrowUpRight, ArrowDownLeft, Clock, Shield, QrCode, Loader2,
  Signal, AlertTriangle, CheckCircle2, Filter
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface ChannelWithStats {
  id: string;
  org_id: string;
  org_name: string;
  display_phone: string | null;
  business_name: string | null;
  channel_label: string | null;
  channel_type: string;
  is_connected: boolean;
  evolution_instance_name: string | null;
  evolution_instance_status: string | null;
  quality_rating: string | null;
  messaging_limit_tier: string | null;
  created_at: string | null;
  updated_at: string | null;
  onboarding_type: string | null;
  health_status: any;
  token_expires_at: string | null;
  last_webhook_at: string | null;
  // Stats
  sent_count: number;
  received_count: number;
  conversations_count: number;
  last_message_at: string | null;
}

const qualityMap: Record<string, { label: string; color: string }> = {
  GREEN: { label: "ممتاز", color: "bg-emerald-500/15 text-emerald-700 border-emerald-200" },
  YELLOW: { label: "متوسط", color: "bg-amber-500/15 text-amber-700 border-amber-200" },
  RED: { label: "منخفض", color: "bg-red-500/15 text-red-700 border-red-200" },
};

const AdminWhatsAppMonitor = () => {
  const [channels, setChannels] = useState<ChannelWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "meta" | "evolution" | "connected" | "disconnected">("all");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [chRes, orgRes] = await Promise.all([
        supabase.from("whatsapp_config_safe").select("*"),
        supabase.from("organizations").select("id, name"),
      ]);

      const orgsMap: Record<string, string> = {};
      (orgRes.data || []).forEach((o: any) => { orgsMap[o.id] = o.name; });

      const channelList = chRes.data || [];
      const channelIds = channelList.map((c: any) => c.id).filter(Boolean);

      // Get conversations grouped by channel with last_message_at + id for message lookup
      const convRes = await supabase
        .from("conversations")
        .select("id, channel_id, last_message_at")
        .in("channel_id", channelIds.length ? channelIds : ["__none__"]);

      const convCounts: Record<string, number> = {};
      const lastActivity: Record<string, string | null> = {};
      const convToChannel: Record<string, string> = {};
      (convRes.data || []).forEach((c: any) => {
        convCounts[c.channel_id] = (convCounts[c.channel_id] || 0) + 1;
        if (c.last_message_at && (!lastActivity[c.channel_id] || c.last_message_at > lastActivity[c.channel_id]!)) {
          lastActivity[c.channel_id] = c.last_message_at;
        }
        if (c.id && c.channel_id) convToChannel[c.id] = c.channel_id;
      });

      const convIds = Object.keys(convToChannel);

      // Get send log counts per channel
      const sendLogRes = await supabase
        .from("channel_send_log")
        .select("channel_id, message_type")
        .in("channel_id", channelIds.length ? channelIds : ["__none__"]);

      const sentCounts: Record<string, number> = {};
      (sendLogRes.data || []).forEach((s: any) => {
        sentCounts[s.channel_id] = (sentCounts[s.channel_id] || 0) + 1;
      });

      // Get received message counts — messages sent by customers, grouped per channel
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const receivedRes = await supabase
        .from("messages")
        .select("conversation_id")
        .in("conversation_id", convIds.length ? convIds : ["__none__"])
        .eq("sender", "customer")
        .gte("created_at", thirtyDaysAgo);

      const receivedByChannel: Record<string, number> = {};
      (receivedRes.data || []).forEach((m: any) => {
        const chId = convToChannel[m.conversation_id];
        if (chId) receivedByChannel[chId] = (receivedByChannel[chId] || 0) + 1;
      });

      const enriched: ChannelWithStats[] = channelList.map((ch: any) => ({
        id: ch.id,
        org_id: ch.org_id,
        org_name: orgsMap[ch.org_id] || "غير معروف",
        display_phone: ch.display_phone,
        business_name: ch.business_name,
        channel_label: ch.channel_label,
        channel_type: ch.channel_type || "evolution",
        is_connected: ch.is_connected ?? false,
        evolution_instance_name: ch.evolution_instance_name,
        evolution_instance_status: ch.evolution_instance_status,
        quality_rating: ch.quality_rating,
        messaging_limit_tier: ch.messaging_limit_tier,
        created_at: ch.created_at,
        updated_at: ch.updated_at,
        onboarding_type: ch.onboarding_type,
        health_status: ch.health_status,
        token_expires_at: ch.token_expires_at || null,
        last_webhook_at: ch.last_webhook_at || null,
        sent_count: sentCounts[ch.id] || 0,
        received_count: receivedByChannel[ch.id] || 0,
        conversations_count: convCounts[ch.id] || 0,
        last_message_at: lastActivity[ch.id] || null,
      }));

      setChannels(enriched);
    } catch (err) {
      console.error("Failed to load WhatsApp monitor:", err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = channels.filter((ch) => {
    const matchesSearch =
      !search ||
      (ch.display_phone || "").includes(search) ||
      (ch.business_name || "").includes(search) ||
      (ch.org_name || "").includes(search) ||
      (ch.channel_label || "").includes(search);

    if (filter === "meta") return matchesSearch && ch.channel_type === "meta";
    if (filter === "evolution") return matchesSearch && ch.channel_type !== "meta";
    if (filter === "connected") return matchesSearch && ch.is_connected;
    if (filter === "disconnected") return matchesSearch && !ch.is_connected;
    return matchesSearch;
  });

  const totalMeta = channels.filter((c) => c.channel_type === "meta").length;
  const totalEvolution = channels.filter((c) => c.channel_type !== "meta").length;
  const totalConnected = channels.filter((c) => c.is_connected).length;
  const totalDisconnected = channels.filter((c) => !c.is_connected).length;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Phone className="w-5 h-5 text-primary" />
            مراقبة أرقام الواتساب
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {channels.length} رقم مربوط • {totalConnected} متصل • {totalDisconnected} منقطع
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          تحديث
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="إجمالي الأرقام"
          value={channels.length}
          icon={<Phone className="w-4 h-4" />}
          color="bg-primary/10 text-primary"
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <SummaryCard
          label="رسمي (Meta)"
          value={totalMeta}
          icon={<Shield className="w-4 h-4" />}
          color="bg-blue-500/10 text-blue-600"
          active={filter === "meta"}
          onClick={() => setFilter("meta")}
        />
        <SummaryCard
          label="غير رسمي (QR)"
          value={totalEvolution}
          icon={<QrCode className="w-4 h-4" />}
          color="bg-violet-500/10 text-violet-600"
          active={filter === "evolution"}
          onClick={() => setFilter("evolution")}
        />
        <SummaryCard
          label="منقطع"
          value={totalDisconnected}
          icon={<WifiOff className="w-4 h-4" />}
          color={totalDisconnected > 0 ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600"}
          active={filter === "disconnected"}
          onClick={() => setFilter("disconnected")}
        />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="بحث بالرقم أو اسم المنظمة..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-9 text-sm bg-card/70 border-border/40 rounded-xl"
        />
      </div>

      {/* Channels List */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          جاري التحميل...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Phone className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>لا توجد أرقام مطابقة</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ch) => (
            <ChannelCard key={ch.id} channel={ch} />
          ))}
        </div>
      )}
    </div>
  );
};

const SummaryCard = ({ label, value, icon, color, active, onClick }: {
  label: string; value: number; icon: React.ReactNode; color: string; active: boolean; onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "rounded-xl border p-3 text-right transition-all hover:shadow-sm",
      active ? "border-primary/40 bg-primary/5 shadow-sm" : "border-border/40 bg-card/70"
    )}
  >
    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-2", color)}>
      {icon}
    </div>
    <p className="text-2xl font-bold">{value}</p>
    <p className="text-xs text-muted-foreground">{label}</p>
  </button>
);

const ChannelCard = ({ channel }: { channel: ChannelWithStats }) => {
  const isMeta = channel.channel_type === "meta";
  const quality = qualityMap[channel.quality_rating || ""] || null;

  // Token expiry warning: warn if expires within 7 days, critical if expired
  const tokenExpiry = channel.token_expires_at ? new Date(channel.token_expires_at) : null;
  const now = new Date();
  const tokenDaysLeft = tokenExpiry ? Math.ceil((tokenExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
  const tokenExpired = tokenDaysLeft !== null && tokenDaysLeft <= 0;
  const tokenWarning = tokenDaysLeft !== null && tokenDaysLeft > 0 && tokenDaysLeft <= 7;

  return (
    <div className={cn(
      "rounded-xl border p-4 bg-card/70 backdrop-blur-sm transition-all hover:shadow-sm",
      !channel.is_connected && "border-destructive/30 bg-destructive/5"
    )}>
      {/* Top Row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            isMeta ? "bg-blue-500/10" : "bg-violet-500/10"
          )}>
            {isMeta ? <Shield className="w-5 h-5 text-blue-600" /> : <QrCode className="w-5 h-5 text-violet-600" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm" dir="ltr">{channel.display_phone || "بدون رقم"}</span>
              <Badge variant="outline" className={cn("text-[10px]", isMeta ? "border-blue-200 text-blue-600" : "border-violet-200 text-violet-600")}>
                {isMeta ? "Meta" : "QR"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {channel.channel_label || channel.business_name || "—"}
            </p>
          </div>
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-1.5">
          {channel.is_connected ? (
            <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-200 gap-1 text-[10px]">
              <Wifi className="w-3 h-3" /> متصل
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1 text-[10px]">
              <WifiOff className="w-3 h-3" /> منقطع
            </Badge>
          )}
        </div>
      </div>

      {/* Org Row */}
      <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
        <Building2 className="w-3.5 h-3.5" />
        <span className="font-medium text-foreground">{channel.org_name}</span>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <StatPill icon={<MessageSquare className="w-3 h-3" />} label="محادثات" value={channel.conversations_count} />
        <StatPill icon={<ArrowUpRight className="w-3 h-3 text-blue-500" />} label="مرسلة" value={channel.sent_count} />
        <StatPill icon={<ArrowDownLeft className="w-3 h-3 text-emerald-500" />} label="مستقبلة (30د)" value={channel.received_count} />
        <StatPill
          icon={<Clock className="w-3 h-3" />}
          label="آخر نشاط"
          value={channel.last_message_at
            ? formatDistanceToNow(new Date(channel.last_message_at), { addSuffix: true, locale: ar })
            : "—"
          }
          isText
        />
      </div>

      {/* Meta-specific info */}
      {isMeta && (
        <div className="flex items-center gap-2 flex-wrap">
          {quality && (
            <Badge variant="outline" className={cn("text-[10px]", quality.color)}>
              <Signal className="w-3 h-3 ml-1" /> جودة: {quality.label}
            </Badge>
          )}
          {channel.messaging_limit_tier && (
            <Badge variant="outline" className="text-[10px] border-border/40">
              حد الإرسال: {channel.messaging_limit_tier}
            </Badge>
          )}
          {tokenExpired && (
            <Badge variant="destructive" className="gap-1 text-[10px]">
              <AlertTriangle className="w-3 h-3" /> Token منتهي
            </Badge>
          )}
          {tokenWarning && (
            <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-700 gap-1">
              <Clock className="w-3 h-3" /> Token ينتهي خلال {tokenDaysLeft}د
            </Badge>
          )}
        </div>
      )}

      {/* Evolution-specific info */}
      {!isMeta && channel.evolution_instance_name && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] border-border/40">
            Instance: <span dir="ltr" className="mr-1">{channel.evolution_instance_name}</span>
          </Badge>
          {channel.evolution_instance_status && (
            <Badge variant="outline" className={cn(
              "text-[10px]",
              channel.evolution_instance_status === "open" ? "border-emerald-200 text-emerald-600" : "border-amber-200 text-amber-600"
            )}>
              {channel.evolution_instance_status}
            </Badge>
          )}
        </div>
      )}

      {/* Created at */}
      <div className="mt-2 text-[10px] text-muted-foreground">
        مُضاف {channel.created_at ? format(new Date(channel.created_at), "yyyy/MM/dd") : "—"}
      </div>
    </div>
  );
};

const StatPill = ({ icon, label, value, isText }: { icon: React.ReactNode; label: string; value: number | string; isText?: boolean }) => (
  <div className="bg-secondary/30 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
    {icon}
    <div className="min-w-0">
      <p className={cn("font-bold text-xs", isText && "text-[10px] font-medium")}>{typeof value === "number" ? value.toLocaleString("ar-SA") : value}</p>
      <p className="text-[9px] text-muted-foreground leading-none">{label}</p>
    </div>
  </div>
);

export default AdminWhatsAppMonitor;
