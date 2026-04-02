import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// Generate VAPID key pair - in production this should be stored as env vars
// For now we use a simple approach with notification API
const usePushNotifications = () => {
  const { user, orgId } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    const supported = "Notification" in window && "serviceWorker" in navigator;
    setIsSupported(supported);
    if (supported) {
      setPermission(Notification.permission);
      setIsSubscribed(Notification.permission === "granted");
    }
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported || !user || !orgId) return;

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm === "granted") {
        // Register service worker
        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        
        setIsSubscribed(true);
        toast.success("تم تفعيل إشعارات المتصفح");
      } else if (perm === "denied") {
        toast.error("تم رفض إذن الإشعارات - يمكنك تغييره من إعدادات المتصفح");
      }
    } catch (err) {
      console.error("Push subscription error:", err);
      toast.error("فشل تفعيل الإشعارات");
    }
  }, [isSupported, user, orgId]);

  const unsubscribe = useCallback(async () => {
    setIsSubscribed(false);
    toast.success("تم إيقاف إشعارات المتصفح");
  }, []);

  // Listen for new messages and show notifications
  useEffect(() => {
    if (!isSubscribed || !orgId || !user) return;

    const channel = supabase
      .channel("push-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        async (payload) => {
          const msg = payload.new as any;
          // Only notify for incoming customer messages
          if (msg.sender !== "customer") return;

          // Don't notify if tab is visible
          if (document.visibilityState === "visible") return;

          // Get conversation info
          const { data: conv } = await supabase
            .from("conversations")
            .select("customer_name, customer_phone, org_id")
            .eq("id", msg.conversation_id)
            .maybeSingle();

          if (!conv || conv.org_id !== orgId) return;

          const title = conv.customer_name || conv.customer_phone || "رسالة جديدة";
          const body = msg.content?.substring(0, 100) || "رسالة جديدة";

          // Show browser notification
          if (Notification.permission === "granted") {
            const notification = new Notification(title, {
              body,
              icon: "/placeholder.svg",
              dir: "rtl",
              lang: "ar",
              tag: `msg-${msg.id}`,
            });

            notification.onclick = () => {
              window.focus();
              notification.close();
            };
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isSubscribed, orgId, user]);

  return { isSupported, isSubscribed, permission, subscribe, unsubscribe };
};

export default usePushNotifications;
