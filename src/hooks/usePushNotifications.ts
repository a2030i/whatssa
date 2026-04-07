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

  // Show a browser notification helper
  const showNotif = useCallback((title: string, body: string, tag: string) => {
    if (Notification.permission !== "granted") return;
    const notification = new Notification(title, {
      body,
      icon: "/placeholder.svg",
      dir: "rtl",
      lang: "ar",
      tag,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }, []);

  // Listen for new messages
  useEffect(() => {
    if (!isSubscribed || !orgId || !user) return;

    const channel = supabase
      .channel("push-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const msg = payload.new as any;
          if (msg.sender !== "customer") return;
          if (document.visibilityState === "visible") return;

          const { data: conv } = await supabase
            .from("conversations")
            .select("customer_name, customer_phone, org_id")
            .eq("id", msg.conversation_id)
            .maybeSingle();

          if (!conv || conv.org_id !== orgId) return;

          showNotif(
            conv.customer_name || conv.customer_phone || "رسالة جديدة",
            msg.content?.substring(0, 100) || "رسالة جديدة",
            `msg-${msg.id}`
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isSubscribed, orgId, user, showNotif]);

  // Listen for in-app notifications (assignments, mentions, SLA, follow-ups)
  useEffect(() => {
    if (!isSubscribed || !user) return;

    const channel = supabase
      .channel("push-notif-bell")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as any;
          if (document.visibilityState === "visible") return;
          showNotif(n.title || "إشعار جديد", n.body || "", `notif-${n.id}`);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isSubscribed, user, showNotif]);

  return { isSupported, isSubscribed, permission, subscribe, unsubscribe };
};

export default usePushNotifications;
