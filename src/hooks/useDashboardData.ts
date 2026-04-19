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
        const today = getDateRange(0).split("T")[0] + "T21:00:00Z";
        const days7 = getDateRange(7);
        const days30 = getDateRange(30);

        const [waConfigs, openConvsCount, totalConvsCount, automations, wallet, org] = await Promise.all([
          supabase.from("whatsapp_config_safe").select("*").eq("org_id", orgId).eq("is_connected", true).order("created_at"),
          supabase.from("conversations").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "active").eq("conversation_type", "private"),
          supabase.from("conversations").select("id", { count: "exact", head: true }).eq("org_id", orgId),
          supabase.from("automation_rules").select("id", { count: "exact", head: true }).eq("org_id", orgId),
          supabase.from("wallets").select("balance").eq("org_id", orgId).maybeSingle(),
          supabase.from("organizations").select("name, subscription_status, plans(name_ar)").eq("id", orgId).maybeSingle(),
        ]);

        // Fetch message stats
        const [sentTodayQ, sent7Q, sent30Q, deliveredTodayQ, failedTodayQ, delivered7Q, failed7Q, delivered30Q, failed30Q, receivedQ] = await Promise.all([
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
        ]);

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
