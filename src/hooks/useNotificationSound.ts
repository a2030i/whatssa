import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

const requestPushPermission = () => {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
};

const showBrowserNotification = (senderName: string, preview: string) => {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    const n = new Notification(`رسالة من ${senderName}`, {
      body: preview,
      icon: "/favicon.ico",
      tag: "whatssa-msg",
      silent: true,
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch {}
};

const useNotificationSound = () => {
  const { orgId, user } = useAuth();
  const unreadCountRef = useRef(0);
  const originalTitleRef = useRef(document.title);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Create audio element lazily
  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(
        "data:audio/wav;base64,UklGRl4FAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YToFAACA/3//fwCAAIAAgACA/3//f/9/AID/f/9//38AgACA/3//f/9/AID/fwCAAIAAgP9/AID/fwCA/38AgACA/3//fwCAAIAAgP9//38AgP9/AIAAgACA/3//f/9/AID/f/9/AID/fwCA/38AgACA/3//fwCAAIAAgP9//38AgP9/"
      );
      audioRef.current.volume = 0.5;
    }
    return audioRef.current;
  }, []);

  // Update tab title with unread count
  const updateTitle = useCallback((count: number) => {
    if (count > 0) {
      document.title = `(${count}) رسالة جديدة — Respondly`;
    } else {
      document.title = originalTitleRef.current;
    }
  }, []);

  // Request browser notification permission once on mount
  useEffect(() => {
    requestPushPermission();
  }, []);

  // Reset unread count when tab becomes visible
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        unreadCountRef.current = 0;
        updateTitle(0);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [updateTitle]);

  // Listen for new incoming messages — filtered by org conversations
  useEffect(() => {
    if (!orgId || !user) return;

    // Pre-fetch org conversation IDs for fast filtering
    // We keep a Set of conversation IDs belonging to this org
    const orgConvIds = new Set<string>();
    let initialLoadDone = false;

    // Load org conversation IDs once
    supabase
      .from("conversations")
      .select("id")
      .eq("org_id", orgId)
      .then(({ data }) => {
        if (data) data.forEach((c: any) => orgConvIds.add(c.id));
        initialLoadDone = true;
      });

    const channel = supabase
      .channel(`notification-sound-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        async (payload) => {
          const msg = payload.new as any;
          if (msg.sender !== "customer") return;

          // Fast path: check cached org conversation IDs
          if (initialLoadDone && !orgConvIds.has(msg.conversation_id)) {
            // Double-check with a direct query (conversation might be new)
            const { data: conv } = await supabase
              .from("conversations")
              .select("org_id")
              .eq("id", msg.conversation_id)
              .maybeSingle();

            if (!conv || conv.org_id !== orgId) return;
            // Add to cache for future messages
            orgConvIds.add(msg.conversation_id);
          } else if (!initialLoadDone) {
            // Initial load not done yet, verify directly
            const { data: conv } = await supabase
              .from("conversations")
              .select("org_id")
              .eq("id", msg.conversation_id)
              .maybeSingle();
            if (!conv || conv.org_id !== orgId) return;
          }

          // Resolve sender info for notification
          const senderName: string = msg.metadata?.sender_name || msg.metadata?.customer_name || "عميل";
          const preview: string = msg.content
            ? String(msg.content).slice(0, 80)
            : msg.message_type === "image" ? "📷 صورة"
            : msg.message_type === "audio" ? "🎵 رسالة صوتية"
            : msg.message_type === "document" ? "📄 ملف"
            : "رسالة جديدة";

          // If tab is not visible, play sound, update title, and show browser notification
          if (document.visibilityState !== "visible") {
            unreadCountRef.current += 1;
            updateTitle(unreadCountRef.current);
            showBrowserNotification(senderName, preview);

            try {
              const audio = getAudio();
              audio.currentTime = 0;
              await audio.play();
            } catch {
              // Autoplay blocked — ignored
            }
          } else {
            // Tab is visible but user might not be on inbox — still play a subtle sound
            try {
              const audio = getAudio();
              audio.volume = 0.2;
              audio.currentTime = 0;
              await audio.play();
              audio.volume = 0.5;
            } catch {}
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, user, getAudio, updateTitle]);
};

export default useNotificationSound;
