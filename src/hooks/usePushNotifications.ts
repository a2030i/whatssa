import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const usePushNotifications = () => {
  const { user, orgId } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [vapidKey, setVapidKey] = useState<string | null>(null);

  // Load VAPID public key from system_settings
  useEffect(() => {
    const loadVapidKey = async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "vapid_public_key")
        .maybeSingle();
      if (data?.value) setVapidKey(data.value as string);
    };
    loadVapidKey();
  }, []);

  useEffect(() => {
    const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    setIsSupported(supported);
    if (supported) {
      setPermission(Notification.permission);
      // Check if already subscribed
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub);
        });
      });
    }
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported || !user || !orgId || !vapidKey) {
      if (!vapidKey) toast.error("مفاتيح VAPID غير مُعدّة — تواصل مع المسؤول");
      return;
    }

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm === "granted") {
        const registration = await navigator.serviceWorker.ready;

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });

        const p256dh = arrayBufferToBase64Url(subscription.getKey("p256dh")!);
        const authKey = arrayBufferToBase64Url(subscription.getKey("auth")!);

        // Save to database
        const { error } = await supabase.from("push_subscriptions").upsert({
          user_id: user.id,
          org_id: orgId,
          endpoint: subscription.endpoint,
          p256dh,
          auth_key: authKey,
        }, { onConflict: "user_id,endpoint" });

        if (error) {
          console.error("Failed to save push subscription:", error);
          toast.error("فشل حفظ اشتراك الإشعارات");
          return;
        }

        setIsSubscribed(true);
        toast.success("تم تفعيل إشعارات Push — ستصلك حتى لو كان التطبيق مغلق");
      } else if (perm === "denied") {
        toast.error("تم رفض إذن الإشعارات — يمكنك تغييره من إعدادات المتصفح");
      }
    } catch (err) {
      console.error("Push subscription error:", err);
      toast.error("فشل تفعيل الإشعارات");
    }
  }, [isSupported, user, orgId, vapidKey]);

  const unsubscribe = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        // Remove from database
        if (user) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("user_id", user.id)
            .eq("endpoint", subscription.endpoint);
        }
      }
      setIsSubscribed(false);
      toast.success("تم إيقاف إشعارات Push");
    } catch (err) {
      console.error("Unsubscribe error:", err);
      setIsSubscribed(false);
    }
  }, [user]);

  // Show a browser notification helper (fallback for when app is open)
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

  // Listen for new messages (in-app fallback)
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

  // Listen for in-app notifications
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

  return { isSupported, isSubscribed, permission, subscribe, unsubscribe, vapidKey };
};

export default usePushNotifications;
