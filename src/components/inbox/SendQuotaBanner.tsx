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

      if (error || !data || data.error) {
        setQuota(null);
        return;
      }

      setQuota(data as QuotaData);
      if (data.remaining === 0 || data.paused) {
        onQuotaExhausted?.(data as QuotaData);
      }
    } catch {
      setQuota(null);
    } finally {
      setLoading(false);
    }
  }, [channelId, channelType, onQuotaExhausted]);

  useEffect(() => {
    fetchQuota();
    // Refresh every 60s
    const interval = setInterval(fetchQuota, 60000);
    return () => clearInterval(interval);
  }, [fetchQuota]);

  // Reset dismissed when channel changes
  useEffect(() => { setDismissed(false); }, [channelId]);

  if (!quota || dismissed || channelType === "email") return null;

  const isExhausted = quota.remaining === 0;
  const isPaused = quota.paused;
  const isLow = quota.remaining <= 10 && quota.remaining > 0;
  const hasQuota = quota.remaining > 10;

  // Determine display info
  const isEvolution = quota.channel_type === "evolution";
  const limits = quota.limits || {};
  const limitLabel = isEvolution
    ? (() => {
        const h = limits.hourly;
        const d = limits.daily;
        if (h && h.remaining === 0) return `الحد الساعي (${h.used}/${h.max})`;
        if (d && d.remaining === 0) return `الحد اليومي (${d.used}/${d.max})`;
        if (h) return `${h.remaining} رسالة/ساعة`;
        return "";
      })()
    : (() => {
        const m = limits.monthly;
        if (m) return `${m.remaining} رسالة متبقية من ${m.max.toLocaleString()}`;
        return "";
      })();

  if (isPaused) {
    return (
      <div className="mx-3 mb-1 px-4 py-3 rounded-xl bg-destructive/10 border-2 border-destructive/40 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300" dir="rtl">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-destructive" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-destructive">⛔ الإرسال متوقف مؤقتاً</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {quota.paused_reason || "تم تجاوز حد الإرسال لحماية الرقم من الحظر"}
            </p>
          </div>
        </div>
        {countdown && (
          <div className="flex items-center gap-2 bg-background/80 rounded-lg px-3 py-2 border border-border">
            <Timer className="w-4 h-4 text-warning shrink-0" />
            <span className="text-xs text-foreground">
              يتجدد الحد خلال: <strong className="font-mono text-sm text-warning">{countdown}</strong>
            </span>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          💡 الرسائل المرسلة الآن ستبقى <strong>معلّقة ⏳</strong> وترسل تلقائياً فور تجدد الحد — لا حاجة لإعادة الإرسال يدوياً.
        </p>
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

  if (isLow) {
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

  // Normal quota — always show remaining count
  return (
    <div className="mx-3 mb-1 px-3 py-1.5 rounded-lg bg-muted/50 border border-border flex items-center gap-2 text-xs" dir="rtl">
      <Send className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground">
        متبقي <strong className="text-foreground">{quota.remaining}</strong> رسالة — {limitLabel}
      </span>
      {quota.warmup_pct && quota.warmup_pct < 100 && (
        <span className="text-[10px] text-muted-foreground">(تسخين {quota.warmup_pct}%)</span>
      )}
    </div>
  );
}

