import { useEffect, useState } from "react";
import { supabase, cloudSupabase } from "@/lib/supabase";
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

export interface DashboardData {
  waStatus: WhatsAppStatus;
  messageStats: MessageStats;
  openConversations: number;
  totalConversations: number;
  templateCount: number;
  automationCount: number;
  walletBalance: number;
  orgName: string;
  planName: string;
  subscriptionStatus: string;
  metaPhoneStatus: string | null;
  metaBusinessVerification: string | null;
  metaQualityRating: string | null;
  metaMessagingLimit: string | null;
  tokenExpiresAt: string | null;
  tokenRefreshError: string | null;
  isLoading: boolean;
}

const getDateRange = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
};

export const useDashboardData = (): DashboardData => {
  const { orgId } = useAuth();
  const [data, setData] = useState<DashboardData>({
    waStatus: { isConnected: false, phoneNumberId: null, businessAccountId: null, displayPhone: null, businessName: null, lastSync: null },
    messageStats: { sentToday: 0, sent7Days: 0, sent30Days: 0, deliveredToday: 0, failedToday: 0, delivered7Days: 0, failed7Days: 0, delivered30Days: 0, failed30Days: 0, totalReceived: 0 },
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
        const today = getDateRange(0).split("T")[0] + "T00:00:00Z";
        const days7 = getDateRange(7);
        const days30 = getDateRange(30);

        const [waConfig, convs, automations, wallet, org] = await Promise.all([
          supabase.from("whatsapp_config_safe").select("*").eq("org_id", orgId).maybeSingle(),
          supabase.from("conversations").select("id, status").eq("org_id", orgId),
          supabase.from("automation_rules").select("id").eq("org_id", orgId),
          supabase.from("wallets").select("balance").eq("org_id", orgId).maybeSingle(),
          supabase.from("organizations").select("name, subscription_status, plans(name_ar)").eq("id", orgId).maybeSingle(),
        ]);

        const orgConvIds = (convs.data || []).map(c => c.id);
        
        let orgMsgs: any[] = [];
        if (orgConvIds.length > 0) {
          const { data: msgsData } = await supabase
            .from("messages")
            .select("id, sender, status, created_at, conversation_id")
            .in("conversation_id", orgConvIds.slice(0, 100))
            .gte("created_at", days30)
            .order("created_at", { ascending: false })
            .limit(1000);
          orgMsgs = msgsData || [];
        }

        const agentMsgs = orgMsgs.filter(m => m.sender === "agent");
        const countByRange = (items: any[], from: string, statusFilter?: string) =>
          items.filter(m => m.created_at && m.created_at >= from && (!statusFilter || m.status === statusFilter)).length;

        const sentToday = countByRange(agentMsgs, today);
        const sent7Days = countByRange(agentMsgs, days7);
        const sent30Days = countByRange(agentMsgs, days30);
        const deliveredToday = countByRange(agentMsgs, today, "delivered");
        const failedToday = countByRange(agentMsgs, today, "failed");
        const delivered7Days = countByRange(agentMsgs, days7, "delivered");
        const failed7Days = countByRange(agentMsgs, days7, "failed");
        const delivered30Days = countByRange(agentMsgs, days30, "delivered");
        const failed30Days = countByRange(agentMsgs, days30, "failed");
        const totalReceived = orgMsgs.filter(m => m.sender === "customer").length;

        const openConvs = (convs.data || []).filter(c => c.status === "active").length;

        const waData = waConfig.data;
        const waStatus: WhatsAppStatus = {
          isConnected: waData?.is_connected || false,
          phoneNumberId: waData?.phone_number_id || null,
          businessAccountId: waData?.business_account_id || null,
          displayPhone: waData?.display_phone || null,
          businessName: waData?.business_name || null,
          lastSync: waData?.updated_at || null,
        };

        let metaPhoneStatus: string | null = null;
        let metaBusinessVerification: string | null = null;
        let metaQualityRating: string | null = null;
        let metaMessagingLimit: string | null = null;

        if (waData?.is_connected && waData?.id) {
          try {
            const { data: statusData } = await cloudSupabase.functions.invoke("whatsapp-check-status", {
              body: { config_id: waData.id },
            });
            if (statusData?.phone) {
              metaPhoneStatus = statusData.phone.code_verification_status || statusData.phone.status || null;
              metaQualityRating = statusData.phone.quality_rating || null;
              metaMessagingLimit = statusData.phone.messaging_limit_tier || null;
            }
            if (statusData?.waba) {
              metaBusinessVerification = statusData.waba.business_verification_status || null;
            }
          } catch { /* silent */ }
        }

        const planData = org.data as any;

        setData({
          waStatus,
          messageStats: { sentToday, sent7Days, sent30Days, deliveredToday, failedToday, delivered7Days, failed7Days, delivered30Days, failed30Days, totalReceived },
          openConversations: openConvs,
          totalConversations: (convs.data || []).length,
          templateCount: 0,
          automationCount: (automations.data || []).length,
          walletBalance: wallet.data?.balance || 0,
          orgName: org.data?.name || "",
          planName: planData?.plans?.name_ar || "غير محدد",
          subscriptionStatus: org.data?.subscription_status || "trial",
          metaPhoneStatus,
          metaBusinessVerification,
          metaQualityRating,
          metaMessagingLimit,
          tokenExpiresAt: (waData as any)?.token_expires_at || null,
          tokenRefreshError: (waData as any)?.token_refresh_error || null,
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
