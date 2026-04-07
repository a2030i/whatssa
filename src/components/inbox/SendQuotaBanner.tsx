import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, Clock, Send, X, Timer, ShieldAlert } from "lucide-react";
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

function useCountdown(targetDate: string | null): { text: string; totalSecs: number; pct: number } {
  const [state, setState] = useState({ text: "", totalSecs: 0, pct: 0 });

  useEffect(() => {
    if (!targetDate) { setState({ text: "", totalSecs: 0, pct: 0 }); return; }
    const totalDuration = Math.max(1, new Date(targetDate).getTime() - Date.now());
    const update = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) { setState({ text: "الآن", totalSecs: 0, pct: 100 }); return; }
      const totalSecs = Math.floor(diff / 1000);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      const pct = Math.min(100, Math.max(0, ((totalDuration - diff) / totalDuration) * 100));
      let text: string;
      if (mins >= 60) {
        const hrs = Math.floor(mins / 60);
        const m = mins % 60;
        text = `${hrs}س ${m}د`;
      } else {
        text = `${mins}:${secs.toString().padStart(2, "0")}`;
      }
      setState({ text, totalSecs, pct });
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return state;
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
      // silent
    } finally {
      setLoading(false);
    }
  }, [channelId, channelType]);

  useEffect(() => {
    fetchQuota();
    const interval = setInterval(fetchQuota, 60000);
    return () => clearInterval(interval);
  }, [fetchQuota]);

  useEffect(() => { setDismissed(false); }, [channelId]);

  if (!quota || dismissed || channelType === "email") return null;

  const isExhausted = quota.remaining === 0;
  const isPaused = quota.paused;
  const isLow = quota.remaining <= 10 && quota.remaining > 0;

  const isEvolution = quota.channel_type === "evolution";
  const limits = quota.limits || {};
  const limitLabel = isEvolution
    ? (() => {
        const h = limits.hourly;
        const d = limits.daily;
        const u = limits.unique;
        if (u && u.remaining === 0) return `عدد الأرقام الفريدة بالساعة (${u.used}/${u.max})`;
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

  // ═══ PAUSED ═══
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

  // ═══ EXHAUSTED — with prominent countdown bar ═══
  if (isExhausted) {
    return (
      <div className="mx-3 mb-1 overflow-hidden rounded-lg border border-destructive/40" dir="rtl">
        {/* Red top bar with countdown */}
        <div className="bg-destructive text-destructive-foreground px-3 py-2 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 animate-pulse" />
          <span className="text-xs font-bold flex-1">
            تم إيقاف الإرسال — تجاوز {limitLabel}
          </span>
          <button onClick={() => setDismissed(true)} className="p-0.5 rounded hover:bg-white/20">
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Countdown section */}
        {countdown.text && (
          <div className="bg-destructive/5 dark:bg-destructive/10 px-3 py-2 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-destructive font-semibold">
                <Timer className="w-3.5 h-3.5" />
                <span>يتجدد الحد بعد</span>
              </div>
              <span className="font-mono text-sm font-bold text-destructive tabular-nums">
                {countdown.text}
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full bg-destructive/15 overflow-hidden">
              <div
                className="h-full rounded-full bg-destructive transition-all duration-1000 ease-linear"
                style={{ width: `${countdown.pct}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              يمكنك الإرسال الآن — ستبقى الرسالة معلّقة ⏳ وترسل تلقائياً فور تجدد الحد
            </p>
          </div>
        )}

        {!countdown.text && (
          <div className="bg-destructive/5 px-3 py-1.5">
            <p className="text-[10px] text-muted-foreground">
              يمكنك الإرسال الآن — ستبقى الرسالة معلّقة ⏳ وترسل تلقائياً فور تجدد الحد
            </p>
          </div>
        )}
      </div>
    );
  }

  // ═══ LOW QUOTA ═══
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

  // ═══ NORMAL ═══
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
