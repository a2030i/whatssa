import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend, PieChart, Pie, Cell } from "recharts";
import { Loader2, MessageSquare, Clock, CheckCircle2, TrendingUp, Phone, Mail, Wifi, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChannelMetrics {
  channelId: string;
  channelName: string;
  channelType: "meta" | "evolution" | "email";
  displayPhone: string | null;
  totalConversations: number;
  activeConversations: number;
  closedConversations: number;
  totalMessagesSent: number;
  totalMessagesReceived: number;
  avgFirstResponseMin: number;
  deliveredCount: number;
  failedCount: number;
  deliveryRate: number;
  avgSatisfaction: number | null;
  ratingsCount: number;
}

const CHANNEL_COLORS: Record<string, string> = {
  meta: "hsl(142 64% 42%)",
  evolution: "hsl(217 91% 60%)",
  email: "hsl(280 67% 55%)",
};

const CHANNEL_LABELS: Record<string, string> = {
  meta: "واتساب رسمي",
  evolution: "واتساب ويب",
  email: "بريد إلكتروني",
};

const CHANNEL_ICONS: Record<string, typeof Phone> = {
  meta: Phone,
  evolution: Wifi,
  email: Mail,
};

const ChannelPerformanceReport = ({ period }: { period: string }) => {
  const { orgId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<ChannelMetrics[]>([]);

  const getDateRange = () => {
    const now = new Date();
    let start: Date;
    switch (period) {
      case "today": start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
      case "month": start = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case "quarter": start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()); break;
      default: start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
    }
    return { start: start.toISOString(), end: now.toISOString() };
  };

  useEffect(() => {
    if (!orgId) return;
    fetchChannelData();
  }, [orgId, period]);

  const fetchChannelData = async () => {
    setLoading(true);
    const { start, end } = getDateRange();

    // Fetch all channels config
    const { data: configs } = await supabase
      .from("whatsapp_config")
      .select("id, channel_type, business_name, display_phone")
      .eq("org_id", orgId!);

    // Also check email configs
    const { data: emailConfigs } = await supabase
      .from("email_configs")
      .select("id, label, email_address")
      .eq("org_id", orgId!)
      .eq("is_active", true);

    // Fetch conversations with channel breakdown
    const { data: conversations } = await supabase
      .from("conversations")
      .select("id, channel_id, conversation_type, status, created_at, first_response_at, closed_at")
      .eq("org_id", orgId!)
      .gte("created_at", start)
      .lte("created_at", end)
      .limit(1000);

    // Fetch messages for the period
    const { data: messages } = await supabase
      .from("messages")
      .select("conversation_id, sender, status, created_at")
      .gte("created_at", start)
      .lte("created_at", end)
      .limit(5000);

    // Fetch satisfaction ratings
    const { data: ratings } = await supabase
      .from("satisfaction_ratings")
      .select("conversation_id, rating")
      .eq("org_id", orgId!)
      .gte("created_at", start)
      .lte("created_at", end);

    // Build conv → channel mapping
    const convChannelMap = new Map<string, string>();
    const convTypeMap = new Map<string, string>();
    (conversations || []).forEach(c => {
      if (c.channel_id) convChannelMap.set(c.id, c.channel_id);
      convTypeMap.set(c.id, c.conversation_type || "unknown");
    });

    // Build channel metrics map
    const metricsMap = new Map<string, ChannelMetrics>();

    // Initialize from whatsapp configs
    (configs || []).forEach(cfg => {
      metricsMap.set(cfg.id, {
        channelId: cfg.id,
        channelName: cfg.business_name || cfg.display_phone || "قناة",
        channelType: cfg.channel_type === "meta_api" ? "meta" : "evolution",
        displayPhone: cfg.display_phone,
        totalConversations: 0,
        activeConversations: 0,
        closedConversations: 0,
        totalMessagesSent: 0,
        totalMessagesReceived: 0,
        avgFirstResponseMin: 0,
        deliveredCount: 0,
        failedCount: 0,
        deliveryRate: 0,
        avgSatisfaction: null,
        ratingsCount: 0,
      });
    });

    // Initialize email channels
    (emailConfigs || []).forEach(ec => {
      metricsMap.set(`email_${ec.id}`, {
        channelId: ec.id,
        channelName: ec.label || ec.email_address,
        channelType: "email",
        displayPhone: ec.email_address,
        totalConversations: 0,
        activeConversations: 0,
        closedConversations: 0,
        totalMessagesSent: 0,
        totalMessagesReceived: 0,
        avgFirstResponseMin: 0,
        deliveredCount: 0,
        failedCount: 0,
        deliveryRate: 0,
        avgSatisfaction: null,
        ratingsCount: 0,
      });
    });

    // If no configs but have conversations by type, create virtual channels
    const typeGroups = new Map<string, string>();
    
    // Process conversations
    const frtByChannel = new Map<string, number[]>();
    
    (conversations || []).forEach(c => {
      let key = c.channel_id;
      
      if (!key) {
        // Group by type for unlinked conversations
        const type = c.conversation_type || "unknown";
        if (type === "email") key = "virtual_email";
        else if (type === "meta") key = "virtual_meta";
        else if (type === "evolution") key = "virtual_evolution";
        else key = "virtual_other";
        
        if (!metricsMap.has(key)) {
          const label = CHANNEL_LABELS[type] || "أخرى";
          metricsMap.set(key, {
            channelId: key,
            channelName: label,
            channelType: type === "email" ? "email" : type === "meta" ? "meta" : type === "evolution" ? "evolution" : "meta",
            displayPhone: null,
            totalConversations: 0, activeConversations: 0, closedConversations: 0,
            totalMessagesSent: 0, totalMessagesReceived: 0, avgFirstResponseMin: 0,
            deliveredCount: 0, failedCount: 0, deliveryRate: 0,
            avgSatisfaction: null, ratingsCount: 0,
          });
        }
      }
      
      if (!key) return;
      const m = metricsMap.get(key);
      if (!m) return;
      
      m.totalConversations++;
      if (c.status === "closed") m.closedConversations++;
      else m.activeConversations++;
      
      // FRT
      if (c.first_response_at && c.created_at) {
        const diff = (new Date(c.first_response_at).getTime() - new Date(c.created_at).getTime()) / 60000;
        if (diff > 0 && diff < 1440) {
          if (!frtByChannel.has(key)) frtByChannel.set(key, []);
          frtByChannel.get(key)!.push(diff);
        }
      }
    });

    // Process messages
    const msgConvIds = new Set((conversations || []).map(c => c.id));
    (messages || []).forEach(msg => {
      if (!msgConvIds.has(msg.conversation_id)) return;
      const convChannelId = convChannelMap.get(msg.conversation_id);
      const convType = convTypeMap.get(msg.conversation_id) || "unknown";
      
      let key = convChannelId;
      if (!key) {
        if (convType === "email") key = "virtual_email";
        else if (convType === "meta") key = "virtual_meta";
        else if (convType === "evolution") key = "virtual_evolution";
        else key = "virtual_other";
      }
      
      const m = metricsMap.get(key!);
      if (!m) return;
      
      if (msg.sender === "agent" || msg.sender === "bot") {
        m.totalMessagesSent++;
        if (msg.status === "delivered" || msg.status === "read") m.deliveredCount++;
        if (msg.status === "failed") m.failedCount++;
      } else {
        m.totalMessagesReceived++;
      }
    });

    // Process ratings
    (ratings || []).forEach(r => {
      const convChannelId = convChannelMap.get(r.conversation_id);
      const convType = convTypeMap.get(r.conversation_id) || "unknown";
      let key = convChannelId;
      if (!key) {
        if (convType === "email") key = "virtual_email";
        else if (convType === "meta") key = "virtual_meta";
        else if (convType === "evolution") key = "virtual_evolution";
        else key = "virtual_other";
      }
      const m = metricsMap.get(key!);
      if (!m) return;
      m.ratingsCount++;
      m.avgSatisfaction = m.avgSatisfaction ? (m.avgSatisfaction * (m.ratingsCount - 1) + r.rating) / m.ratingsCount : r.rating;
    });

    // Finalize metrics
    const results: ChannelMetrics[] = [];
    metricsMap.forEach((m, key) => {
      // Calc FRT avg
      const frts = frtByChannel.get(key);
      if (frts && frts.length > 0) {
        m.avgFirstResponseMin = Math.round((frts.reduce((a, b) => a + b, 0) / frts.length) * 10) / 10;
      }
      // Delivery rate
      if (m.totalMessagesSent > 0) {
        m.deliveryRate = Math.round((m.deliveredCount / m.totalMessagesSent) * 100);
      }
      // Only include channels with data
      if (m.totalConversations > 0 || m.totalMessagesSent > 0) {
        results.push(m);
      }
    });

    // Sort by conversations desc
    results.sort((a, b) => b.totalConversations - a.totalConversations);
    setChannels(results);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <Phone className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-sm text-muted-foreground">لا توجد بيانات قنوات لهذه الفترة</p>
        </CardContent>
      </Card>
    );
  }

  // Aggregated stats
  const totalConvs = channels.reduce((s, c) => s + c.totalConversations, 0);
  const totalSent = channels.reduce((s, c) => s + c.totalMessagesSent, 0);
  const totalReceived = channels.reduce((s, c) => s + c.totalMessagesReceived, 0);
  const avgFrt = channels.filter(c => c.avgFirstResponseMin > 0).length > 0
    ? Math.round(channels.filter(c => c.avgFirstResponseMin > 0).reduce((s, c) => s + c.avgFirstResponseMin, 0) / channels.filter(c => c.avgFirstResponseMin > 0).length * 10) / 10
    : 0;

  // Pie data by type
  const typeAgg: Record<string, number> = {};
  channels.forEach(c => {
    const label = CHANNEL_LABELS[c.channelType] || "أخرى";
    typeAgg[label] = (typeAgg[label] || 0) + c.totalConversations;
  });
  const pieData = Object.entries(typeAgg).map(([name, value]) => ({ name, value }));

  // Bar comparison data
  const barData = channels.map(c => ({
    name: c.channelName.length > 15 ? c.channelName.slice(0, 15) + "…" : c.channelName,
    محادثات: c.totalConversations,
    صادرة: c.totalMessagesSent,
    واردة: c.totalMessagesReceived,
  }));

  // Radar data (normalized 0-100)
  const maxConv = Math.max(...channels.map(c => c.totalConversations), 1);
  const maxMsg = Math.max(...channels.map(c => c.totalMessagesSent + c.totalMessagesReceived), 1);
  const maxFrt = Math.max(...channels.map(c => c.avgFirstResponseMin), 1);

  const radarData = [
    { metric: "المحادثات", ...Object.fromEntries(channels.slice(0, 4).map(c => [c.channelName.slice(0, 10), Math.round((c.totalConversations / maxConv) * 100)])) },
    { metric: "الرسائل", ...Object.fromEntries(channels.slice(0, 4).map(c => [c.channelName.slice(0, 10), Math.round(((c.totalMessagesSent + c.totalMessagesReceived) / maxMsg) * 100)])) },
    { metric: "سرعة الرد", ...Object.fromEntries(channels.slice(0, 4).map(c => [c.channelName.slice(0, 10), c.avgFirstResponseMin > 0 ? Math.round((1 - c.avgFirstResponseMin / maxFrt) * 100) : 0])) },
    { metric: "التوصيل", ...Object.fromEntries(channels.slice(0, 4).map(c => [c.channelName.slice(0, 10), c.deliveryRate])) },
    { metric: "الإغلاق", ...Object.fromEntries(channels.slice(0, 4).map(c => [c.channelName.slice(0, 10), c.totalConversations > 0 ? Math.round((c.closedConversations / c.totalConversations) * 100) : 0])) },
  ];

  const radarKeys = channels.slice(0, 4).map(c => c.channelName.slice(0, 10));
  const radarColors = channels.slice(0, 4).map(c => CHANNEL_COLORS[c.channelType] || "hsl(38 92% 50%)");

  return (
    <div className="space-y-4">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Phone, label: "قنوات نشطة", value: channels.length, color: "text-primary" },
          { icon: MessageSquare, label: "إجمالي المحادثات", value: totalConvs, color: "text-info" },
          { icon: TrendingUp, label: "رسائل صادرة", value: totalSent, color: "text-success" },
          { icon: Clock, label: "متوسط أول رد", value: avgFrt > 0 ? `${avgFrt} د` : "—", color: "text-warning" },
        ].map(kpi => (
          <Card key={kpi.label} className="bg-card/70 backdrop-blur-sm border-border/40 rounded-2xl">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <kpi.icon className={cn("w-4 h-4", kpi.color)} />
                <span className="text-[11px] text-muted-foreground font-medium">{kpi.label}</span>
              </div>
              <p className={cn("text-xl font-black", kpi.color)}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Channel Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {channels.map(ch => {
          const Icon = CHANNEL_ICONS[ch.channelType] || Phone;
          const color = CHANNEL_COLORS[ch.channelType] || "hsl(38 92% 50%)";
          const closureRate = ch.totalConversations > 0 ? Math.round((ch.closedConversations / ch.totalConversations) * 100) : 0;
          
          return (
            <Card key={ch.channelId} className="relative overflow-hidden bg-card/70 backdrop-blur-sm border-border/40 rounded-2xl">
              <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: color }} />
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
                      <Icon className="w-4 h-4" style={{ color }} />
                    </div>
                    <div>
                      <p className="text-sm font-bold leading-tight">{ch.channelName}</p>
                      {ch.displayPhone && (
                        <p className="text-[10px] text-muted-foreground" dir="ltr">{ch.displayPhone}</p>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] rounded-lg" style={{ borderColor: `${color}40`, color }}>
                    {CHANNEL_LABELS[ch.channelType]}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center p-2 bg-secondary/50 rounded-lg">
                    <p className="text-lg font-black">{ch.totalConversations}</p>
                    <p className="text-[9px] text-muted-foreground">محادثة</p>
                  </div>
                  <div className="text-center p-2 bg-secondary/50 rounded-lg">
                    <p className="text-lg font-black">{ch.totalMessagesSent}</p>
                    <p className="text-[9px] text-muted-foreground">صادرة</p>
                  </div>
                  <div className="text-center p-2 bg-secondary/50 rounded-lg">
                    <p className="text-lg font-black">{ch.totalMessagesReceived}</p>
                    <p className="text-[9px] text-muted-foreground">واردة</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {/* Response Time */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" /> أول رد
                    </span>
                    <span className={cn("font-semibold", ch.avgFirstResponseMin > 0 && ch.avgFirstResponseMin <= 2 ? "text-success" : ch.avgFirstResponseMin > 5 ? "text-destructive" : "text-warning")}>
                      {ch.avgFirstResponseMin > 0 ? `${ch.avgFirstResponseMin} د` : "—"}
                    </span>
                  </div>
                  
                  {/* Delivery Rate */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> نسبة التوصيل
                    </span>
                    <span className={cn("font-semibold", ch.deliveryRate >= 95 ? "text-success" : ch.deliveryRate >= 80 ? "text-warning" : "text-destructive")}>
                      {ch.totalMessagesSent > 0 ? `${ch.deliveryRate}%` : "—"}
                    </span>
                  </div>

                  {/* Closure Rate */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> نسبة الإغلاق
                    </span>
                    <span className="font-semibold">{ch.totalConversations > 0 ? `${closureRate}%` : "—"}</span>
                  </div>

                  {/* Satisfaction */}
                  {ch.ratingsCount > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">⭐ رضا العملاء</span>
                      <span className="font-semibold">{ch.avgSatisfaction?.toFixed(1)}/5 ({ch.ratingsCount})</span>
                    </div>
                  )}

                  {/* Progress bar for closure */}
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden mt-1">
                    <div className="h-full rounded-full transition-all" style={{ width: `${closureRate}%`, backgroundColor: color }} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Distribution Pie */}
        <Card className="bg-card/70 backdrop-blur-sm border-border/40 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">توزيع المحادثات حسب نوع القناة</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie 
                  data={pieData} 
                  cx="50%" cy="50%" 
                  innerRadius={50} outerRadius={75} 
                  paddingAngle={4} 
                  dataKey="value" 
                  nameKey="name"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                  fontSize={10}
                >
                  {pieData.map((entry, i) => {
                    const type = Object.entries(CHANNEL_LABELS).find(([, v]) => v === entry.name)?.[0] || "meta";
                    return <Cell key={i} fill={CHANNEL_COLORS[type] || `hsl(${i * 90} 60% 50%)`} />;
                  })}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Comparison Bar */}
        <Card className="bg-card/70 backdrop-blur-sm border-border/40 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">مقارنة أداء القنوات</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" fontSize={9} tickLine={false} axisLine={false} width={70} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="محادثات" fill="hsl(142 64% 42%)" radius={[0, 4, 4, 0]} />
                <Bar dataKey="صادرة" fill="hsl(217 91% 60%)" radius={[0, 4, 4, 0]} />
                <Bar dataKey="واردة" fill="hsl(280 67% 55%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Radar Chart */}
      {channels.length >= 2 && (
        <Card className="bg-card/70 backdrop-blur-sm border-border/40 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">مقارنة شاملة (رادار)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="metric" fontSize={10} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} fontSize={8} />
                {radarKeys.map((key, i) => (
                  <Radar key={key} name={key} dataKey={key} stroke={radarColors[i]} fill={radarColors[i]} fillOpacity={0.15} strokeWidth={2} />
                ))}
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Detailed Table */}
      <Card className="bg-card/70 backdrop-blur-sm border-border/40 rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">جدول المقارنة التفصيلي</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-right p-2.5 text-[10px] font-semibold text-muted-foreground">القناة</th>
                  <th className="text-right p-2.5 text-[10px] font-semibold text-muted-foreground">النوع</th>
                  <th className="text-right p-2.5 text-[10px] font-semibold text-muted-foreground">محادثات</th>
                  <th className="text-right p-2.5 text-[10px] font-semibold text-muted-foreground">صادرة</th>
                  <th className="text-right p-2.5 text-[10px] font-semibold text-muted-foreground">واردة</th>
                  <th className="text-right p-2.5 text-[10px] font-semibold text-muted-foreground">أول رد</th>
                  <th className="text-right p-2.5 text-[10px] font-semibold text-muted-foreground">توصيل</th>
                  <th className="text-right p-2.5 text-[10px] font-semibold text-muted-foreground">إغلاق</th>
                </tr>
              </thead>
              <tbody>
                {channels.map(ch => {
                  const closureRate = ch.totalConversations > 0 ? Math.round((ch.closedConversations / ch.totalConversations) * 100) : 0;
                  const color = CHANNEL_COLORS[ch.channelType];
                  return (
                    <tr key={ch.channelId} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors">
                      <td className="p-2.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                          <span className="font-medium text-xs">{ch.channelName}</span>
                        </div>
                      </td>
                      <td className="p-2.5">
                        <Badge variant="outline" className="text-[9px]" style={{ borderColor: `${color}40`, color }}>{CHANNEL_LABELS[ch.channelType]}</Badge>
                      </td>
                      <td className="p-2.5 font-semibold text-xs">{ch.totalConversations}</td>
                      <td className="p-2.5 text-xs">{ch.totalMessagesSent}</td>
                      <td className="p-2.5 text-xs">{ch.totalMessagesReceived}</td>
                      <td className="p-2.5 text-xs">
                        <span className={cn(ch.avgFirstResponseMin > 0 && ch.avgFirstResponseMin <= 2 ? "text-success" : ch.avgFirstResponseMin > 5 ? "text-destructive" : "text-warning")}>
                          {ch.avgFirstResponseMin > 0 ? `${ch.avgFirstResponseMin}د` : "—"}
                        </span>
                      </td>
                      <td className="p-2.5 text-xs">
                        <span className={cn(ch.deliveryRate >= 95 ? "text-success" : ch.deliveryRate >= 80 ? "text-warning" : ch.totalMessagesSent > 0 ? "text-destructive" : "text-muted-foreground")}>
                          {ch.totalMessagesSent > 0 ? `${ch.deliveryRate}%` : "—"}
                        </span>
                      </td>
                      <td className="p-2.5 text-xs font-medium">{ch.totalConversations > 0 ? `${closureRate}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChannelPerformanceReport;

