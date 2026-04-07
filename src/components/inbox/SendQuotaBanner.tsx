import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Clock, Send, X, Loader2, Timer } from "lucide-react";
import { invokeCloud } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface QuotaData {
  channel_type: string;
  paused: boolean;
  paused_reason?: string;
  remaining: number;
  limits: {
    hourly?: { used: number; max: number; remaining: number };
    daily?: { used: number; max: number; remaining: number };
    unique?: { used: number; max: number; remaining: number };
    monthly?: { used: number; max: number; remaining: number };
  };
  warmup_pct?: number;
  reset_at: string | null;
}

interface SendQuotaBannerProps {
  channelId?: string;
  channelType?: string;
  onQuotaExhausted?: (quota: QuotaData) => void;
}

function useCountdown(targetDate: string | null): string {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    if (!targetDate) { setRemaining(""); return; }
    const update = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) { setRemaining("الآن"); return; }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      if (mins >= 60) {
        const hrs = Math.floor(mins / 60);
        const m = mins % 60;
        setRemaining(`${hrs}س ${m}د`);
      } else {
        setRemaining(`${mins}د ${secs}ث`);
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return remaining;
}

export default function SendQuotaBanner({ channelId, channelType, onQuotaExhausted }: SendQuotaBannerProps) {
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const countdown = useCountdown(quota?.reset_at || null);

  const fetchQuota = useCallback(async () => {
    if (!channelId || channelType === "email") return;
    setLoading(true);
    try {
      const { data, error } = await invokeCloud("check-send-quota", {
        body: { channel_id: channelId },
      });
      if (!error && data) {
        setQuota(data as QuotaData);
        if (data.remaining === 0 || data.paused) {
          onQuotaExhausted?.(data as QuotaData);
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [channelId, channelType]);

  useEffect(() => {
    fetchQuota();
    // Refresh every 60s
    const interval = setInterval(fetchQuota, 60000);
    return () => clearInterval(interval);
  }, [fetchQuota]);

  // Reset dismissed when channel changes
  useEffect(() => { setDismissed(false); }, [channelId]);

  if (!quota || dismissed || channelType === "email") return null;

  // Show nothing if plenty of quota remaining and not paused
  const isLow = quota.remaining <= 10 && quota.remaining > 0;
  const isExhausted = quota.remaining === 0;
  const isPaused = quota.paused;

  if (!isLow && !isExhausted && !isPaused) return null;

  // Determine display info
  const isEvolution = quota.channel_type === "evolution";
  const limitLabel = isEvolution
    ? (() => {
        const h = quota.limits.hourly;
        const d = quota.limits.daily;
        if (h && h.remaining === 0) return `الحد الساعي (${h.used}/${h.max})`;
        if (d && d.remaining === 0) return `الحد اليومي (${d.used}/${d.max})`;
        if (h) return `${h.remaining} رسالة/ساعة`;
        return "";
      })()
    : (() => {
        const m = quota.limits.monthly;
        if (m) return `${m.remaining} رسالة متبقية من ${m.max.toLocaleString()}`;
        return "";
      })();

  if (isPaused) {
    return (
      <div className="mx-3 mb-1 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center gap-2 text-xs" dir="rtl">
        <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
        <div className="flex-1">
          <span className="font-semibold text-destructive">الإرسال متوقف مؤقتاً</span>
          {quota.paused_reason && <span className="text-muted-foreground mr-1">— {quota.paused_reason}</span>}
        </div>
        <button onClick={() => setDismissed(true)} className="p-0.5 rounded hover:bg-destructive/10">
          <X className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>
    );
  }

  if (isExhausted) {
    return (
      <div className="mx-3 mb-1 px-3 py-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 space-y-1" dir="rtl">
        <div className="flex items-center gap-2 text-xs">
          <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <div className="flex-1">
            <span className="font-semibold text-yellow-800 dark:text-yellow-300">تم استنفاد حد الرسائل</span>
            <span className="text-yellow-700 dark:text-yellow-400 mr-1">— {limitLabel}</span>
          </div>
          <button onClick={() => setDismissed(true)} className="p-0.5 rounded hover:bg-yellow-200 dark:hover:bg-yellow-800">
            <X className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
        {countdown && (
          <div className="flex items-center gap-1.5 text-[11px] text-yellow-700 dark:text-yellow-400 pr-6">
            <Timer className="w-3 h-3" />
            <span>يتجدد الحد بعد: <strong className="font-mono">{countdown}</strong></span>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground pr-6">
          يمكنك الإرسال الآن — ستبقى الرسالة معلّقة ⏳ حتى يتجدد الحد وترسل تلقائياً
        </p>
      </div>
    );
  }

  // Low quota warning
  return (
    <div className="mx-3 mb-1 px-3 py-1.5 rounded-lg bg-yellow-50/50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 flex items-center gap-2 text-xs" dir="rtl">
      <Clock className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400 shrink-0" />
      <span className="text-yellow-800 dark:text-yellow-300">
        متبقي <strong>{quota.remaining}</strong> رسالة — {limitLabel}
      </span>
      {quota.warmup_pct && quota.warmup_pct < 100 && (
        <span className="text-[10px] text-muted-foreground">(تسخين {quota.warmup_pct}%)</span>
      )}
      <button onClick={() => setDismissed(true)} className="p-0.5 rounded hover:bg-yellow-200 dark:hover:bg-yellow-800 mr-auto">
        <X className="w-3 h-3 text-muted-foreground" />
      </button>
    </div>
  );
}
