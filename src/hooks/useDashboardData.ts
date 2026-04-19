import { useEffect, useState } from "react";
import { supabase, invokeCloud } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export interface WhatsAppStatus {
  isConnected: boolean;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  displayPhone: string | null;
  businessName: string | null;
  lastSync: string | null;
}

export interface MessageStats {
  sentToday: number;
  sent7Days: number;
  sent30Days: number;
  deliveredToday: number;
  failedToday: number;
  delivered7Days: number;
  failed7Days: number;
  delivered30Days: number;
  failed30Days: number;
  totalReceived: number;
}

export interface ChannelStatus {
  id: string;
  channelType: "official" | "unofficial" | null;
  channelLabel: string | null;
  waStatus: WhatsAppStatus;
  metaPhoneStatus: string | null;
  metaBusinessVerification: string | null;
  metaQualityRating: string | null;
  metaMessagingLimit: string | null;
  tokenExpiresAt: string | null;
  tokenRefreshError: string | null;
}

export interface AgentStat {
  id: string;
  full_name: string;
  open_convs: number;
  messages_7days: number;
  messages_today: number;
  read_msgs: number;
  delivered_msgs: number;
}

export interface HourStat { hour: number; count: number; }
export interface DayStat { day: string; day_num: number; count: number; }
export interface TopCustomer { customer_name: string; customer_phone: string; msg_count: number; last_message: string; }

export interface DashboardData {
  /** @deprecated use channels array */
  waStatus: WhatsAppStatus;
  messageStats: MessageStats;
  /** @deprecated use channels array */
  channelType: "official" | "unofficial" | null;
  channels: ChannelStatus[];
  openConversations: number;
  totalConversations: number;
  templateCount: number;
  automationCount: number;
  walletBalance: number;
  orgName: string;
  planName: string;
  subscriptionStatus: string;
  agents: AgentStat[];
  hourStats: HourStat[];
  dayStats: DayStat[];
  topCustomers: TopCustomer[];
  csatAverage: number | null;
  csatCount: number;
  /** @deprecated use channels array */
  metaPhoneStatus: string | null;
  /** @deprecated use channels array */
  metaBusinessVerification: string | null;
  /** @deprecated use channels array */
  metaQualityRating: string | null;
  /** @deprecated use channels array */
  metaMessagingLimit: string | null;
  /** @deprecated use channels array */
  tokenExpiresAt: string | null;
  /** @deprecated use channels array */
  tokenRefreshError: string | null;
  isLoading: boolean;
}

const getDateRange = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
};

const emptyWaStatus: WhatsAppStatus = { isConnected: false, phoneNumberId: null, businessAccountId: null, displayPhone: null, businessName: null, lastSync: null };

export const useDashboardData = (): DashboardData => {
  const { orgId } = useAuth();
  const [data, setData] = useState<DashboardData>({
    waStatus: emptyWaStatus,
    messageStats: { sentToday: 0, sent7Days: 0, sent30Days: 0, deliveredToday: 0, failedToday: 0, delivered7Days: 0, failed7Days: 0, delivered30Days: 0, failed30Days: 0, totalReceived: 0 },
    channelType: null,
    channels: [],
    openConversations: 0,
    totalConversations: 0,
    templateCount: 0,
    automationCount: 0,
    walletBalance: 0,
    orgName: "",
    planName: "",
    subscriptionStatus: "trial",
    agents: [],
    hourStats: [],
    dayStats: [],
    topCustomers: [],
    csatAverage: null,
    csatCount: 0,
    metaPhoneStatus: null,
    metaBusinessVerification: null,
    metaQualityRating: null,
    metaMessagingLimit: null,
    tokenExpiresAt: null,
    tokenRefreshError: null,
    isLoading: true,
  });

  useEffect(() => {
    if (!orgId) {
      setData(prev => ({ ...prev, isLoading: false }));
      return;
    }
    const load = async () => {
      try {
        const today = new Date().toISOString().split("T")[0] + "T00:00:00+03:00";
        const days7 = getDateRange(7);
        const days30 = getDateRange(30);

        const [waConfigs, openConvsCount, totalConvsCount, automations, wallet, org, convRows, profilesData, csatRatings] = await Promise.all([
          supabase.from("whatsapp_config_safe").select("*").eq("org_id", orgId).eq("is_connected", true).order("created_at"),
          supabase.from("conversations").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "active").eq("conversation_type", "private"),
          supabase.from("conversations").select("id", { count: "exact", head: true }).eq("org_id", orgId),
          supabase.from("automation_rules").select("id", { count: "exact", head: true }).eq("org_id", orgId),
          supabase.from("wallets").select("balance").eq("org_id", orgId).maybeSingle(),
          supabase.from("organizations").select("name, subscription_status, plans(name_ar)").eq("id", orgId).maybeSingle(),
          supabase.from("conversations").select("id, assigned_to_id, status, conversation_type").eq("org_id", orgId),
          supabase.from("profiles").select("id, full_name").eq("org_id", orgId),
          supabase.from("satisfaction_ratings" as any).select("rating").eq("org_id", orgId).gte("created_at", days30),
        ]);

        const allConvIds = (convRows.data || []).map((c: any) => c.id);

        // Fetch message stats + employee messages in parallel
        const [sentTodayQ, sent7Q, sent30Q, deliveredTodayQ, failedTodayQ, delivered7Q, failed7Q, delivered30Q, failed30Q, receivedQ, msgs7Res, msgs30Res] = await Promise.all([
          supabase.rpc("count_org_messages", { _org_id: orgId, _from: today, _sender: "agent", _status: null }),
          supabase.rpc("count_org_messages", { _org_id: orgId, _from: days7, _sender: "agent", _status: null }),
          supabase.rpc("count_org_messages", { _org_id: orgId, _from: days30, _sender: "agent", _status: null }),
          supabase.rpc("count_org_messages", { _org_id: orgId, _from: today, _sender: "agent", _status: "delivered" }),
          supabase.rpc("count_org_messages", { _org_id: orgId, _from: today, _sender: "agent", _status: "failed" }),
          supabase.rpc("count_org_messages", { _org_id: orgId, _from: days7, _sender: "agent", _status: "delivered" }),
          supabase.rpc("count_org_messages", { _org_id: orgId, _from: days7, _sender: "agent", _status: "failed" }),
          supabase.rpc("count_org_messages", { _org_id: orgId, _from: days30, _sender: "agent", _status: "delivered" }),
          supabase.rpc("count_org_messages", { _org_id: orgId, _from: days30, _sender: "agent", _status: "failed" }),
          supabase.rpc("count_org_messages", { _org_id: orgId, _from: days30, _sender: "customer", _status: null }),
          allConvIds.length > 0
            ? supabase.from("messages").select("metadata, status, created_at, sender").eq("sender", "agent").gte("created_at", days7).in("conversation_id", allConvIds)
            : Promise.resolve({ data: [] }),
          allConvIds.length > 0
            ? supabase.from("messages").select("created_at, sender").gte("created_at", days30).in("conversation_id", allConvIds)
            : Promise.resolve({ data: [] }),
        ]);

        const msgs7 = (msgs7Res as any).data || [];
        const msgs30 = (msgs30Res as any).data || [];
        const allConvRows = convRows.data || [];
        const profiles = profilesData.data || [];

        // توقيت السعودية
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayUTC = new Date(todayStart.getTime() - 3 * 36e5);

        // أداء الموظفين — open_convs من assigned_to_id مباشرة (private فقط)
        const agents: AgentStat[] = profiles.map((p: any) => {
          const am = msgs7.filter((m: any) => m.metadata?.sender_name === p.full_name);
          const tm = am.filter((m: any) => new Date(m.created_at) >= todayUTC);
          const openC = allConvRows.filter((c: any) =>
            c.assigned_to_id === p.id &&
            c.status === "active" &&
            c.conversation_type === "private"
          ).length;
          return {
            id: p.id,
            full_name: p.full_name,
            open_convs: openC,
            messages_7days: am.length,
            messages_today: tm.length,
            read_msgs: am.filter((m: any) => m.status === "read").length,
            delivered_msgs: am.filter((m: any) => m.status === "delivered").length,
          };
        }).filter((a: AgentStat) => a.messages_7days > 0 || a.open_convs > 0)
          .sort((a: AgentStat, b: AgentStat) => b.messages_today - a.messages_today);

        // إحصائيات الساعات (بتوقيت السعودية)
        const hMap: Record<number, number> = {};
        msgs30.forEach((m: any) => {
          const h = (new Date(m.created_at).getUTCHours() + 3) % 24;
          hMap[h] = (hMap[h] || 0) + 1;
        });
        const hourStats: HourStat[] = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: hMap[i] || 0 }));

        // إحصائيات الأيام
        const dMap: Record<number, number> = {};
        msgs30.forEach((m: any) => {
          const d = new Date(new Date(m.created_at).getTime() + 3 * 36e5).getUTCDay();
          dMap[d] = (dMap[d] || 0) + 1;
        });
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const dayStats: DayStat[] = dayNames.map((name, i) => ({ day: name, day_num: i, count: dMap[i] || 0 }));

        // أكثر العملاء تواصلاً
        const privateConvIds = allConvRows.filter((c: any) => c.conversation_type === "private").map((c: any) => c.id);
        let topCustomers: TopCustomer[] = [];
        if (privateConvIds.length > 0) {
          const { data: custMsgs } = await supabase
            .from("messages")
            .select("conversation_id")
            .eq("sender", "customer")
            .gte("created_at", days30)
            .in("conversation_id", privateConvIds);

          const convCount: Record<string, number> = {};
          (custMsgs || []).forEach((m: any) => {
            convCount[m.conversation_id] = (convCount[m.conversation_id] || 0) + 1;
          });
          const topConvIds = Object.entries(convCount).sort(([, a], [, b]) => b - a).slice(0, 8).map(([id]) => id);

          if (topConvIds.length > 0) {
            const { data: convDetails } = await supabase
              .from("conversations")
              .select("id, customer_name, customer_phone, last_message_at")
              .in("id", topConvIds);
            topCustomers = (convDetails || []).map((c: any) => ({
              customer_name: c.customer_name || c.customer_phone,
              customer_phone: c.customer_phone,
              msg_count: convCount[c.id] || 0,
              last_message: c.last_message_at,
            })).sort((a, b) => b.msg_count - a.msg_count);
          }
        }

        // CSAT
        const csatRatingsData = (csatRatings as any).data || [];
        const csatCount = csatRatingsData.length;
        const csatAverage = csatCount > 0
          ? Math.round((csatRatingsData.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / csatCount) * 10) / 10
          : null;

        const allChannels = (waConfigs.data || []) as any[];

        // Build channel statuses
        const channels: ChannelStatus[] = allChannels.map((ch: any) => {
          const chType: "official" | "unofficial" | null = ch.channel_type === "official" || ch.channel_type === "meta_api" ? "official" : ch.channel_type === "unofficial" || ch.channel_type === "evolution" ? "unofficial" : null;
          return {
            id: ch.id,
            channelType: chType,
            channelLabel: ch.channel_label || ch.business_name || ch.display_phone || ch.evolution_instance_name || null,
            waStatus: {
              isConnected: ch.is_connected || false,
              phoneNumberId: ch.phone_number_id || null,
              businessAccountId: ch.business_account_id || null,
              displayPhone: ch.display_phone || null,
              businessName: ch.business_name || null,
              lastSync: ch.updated_at || null,
            },
            metaPhoneStatus: null,
            metaBusinessVerification: null,
            metaQualityRating: null,
            metaMessagingLimit: null,
            tokenExpiresAt: ch.token_expires_at || null,
            tokenRefreshError: ch.token_refresh_error || null,
          };
        });

        // Fetch Meta status for official channels (in parallel)
        const officialChannels = channels.filter(c => c.channelType === "official" && c.waStatus.isConnected);
        await Promise.all(officialChannels.map(async (ch) => {
          try {
            const { data: statusData } = await invokeCloud("whatsapp-check-status", {
              body: { config_id: ch.id },
            });
            if (statusData?.phone) {
              ch.metaPhoneStatus = statusData.phone.code_verification_status || statusData.phone.status || null;
              ch.metaQualityRating = statusData.phone.quality_rating || null;
              ch.metaMessagingLimit = statusData.phone.messaging_limit_tier || null;
            }
            if (statusData?.waba) {
              ch.metaBusinessVerification = statusData.waba.business_verification_status || null;
            }
          } catch { /* silent */ }
        }));

        // Legacy compat: use first channel
        const firstChannel = channels[0] || null;
        const planData = org.data as any;

        setData({
          waStatus: firstChannel?.waStatus || emptyWaStatus,
          messageStats: {
            sentToday: (sentTodayQ.data as number) || 0,
            sent7Days: (sent7Q.data as number) || 0,
            sent30Days: (sent30Q.data as number) || 0,
            deliveredToday: (deliveredTodayQ.data as number) || 0,
            failedToday: (failedTodayQ.data as number) || 0,
            delivered7Days: (delivered7Q.data as number) || 0,
            failed7Days: (failed7Q.data as number) || 0,
            delivered30Days: (delivered30Q.data as number) || 0,
            failed30Days: (failed30Q.data as number) || 0,
            totalReceived: (receivedQ.data as number) || 0,
          },
          channelType: firstChannel?.channelType || null,
          channels,
          openConversations: openConvsCount.count || 0,
          totalConversations: totalConvsCount.count || 0,
          templateCount: 0,
          automationCount: automations.count || 0,
          walletBalance: wallet.data?.balance || 0,
          orgName: org.data?.name || "",
          planName: planData?.plans?.name_ar || "غير محدد",
          subscriptionStatus: org.data?.subscription_status || "trial",
          agents,
          hourStats,
          dayStats,
          topCustomers,
          csatAverage,
          csatCount,
          metaPhoneStatus: firstChannel?.metaPhoneStatus || null,
          metaBusinessVerification: firstChannel?.metaBusinessVerification || null,
          metaQualityRating: firstChannel?.metaQualityRating || null,
          metaMessagingLimit: firstChannel?.metaMessagingLimit || null,
          tokenExpiresAt: firstChannel?.tokenExpiresAt || null,
          tokenRefreshError: firstChannel?.tokenRefreshError || null,
          isLoading: false,
        });
      } catch (err) {
        console.error("Dashboard load error:", err);
        setData(prev => ({ ...prev, isLoading: false }));
      }
    };
    load();
  }, [orgId]);

  return data;
};
