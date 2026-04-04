import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Download } from "lucide-react";

// Global registry: only one audio plays at a time
const activeAudioSet = new Set<HTMLAudioElement>();
const pauseAllExcept = (current: HTMLAudioElement) => {
  activeAudioSet.forEach((audio) => {
    if (audio !== current && !audio.paused) audio.pause();
  });
};
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  src: string;
  isAgent?: boolean;
  className?: string;
}

const AudioPlayer = ({ src, isAgent = false, className }: AudioPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Generate fake waveform bars (deterministic based on src)
  const bars = useRef<number[]>([]);
  if (bars.current.length === 0) {
    let seed = 0;
    for (let i = 0; i < src.length; i++) seed = ((seed << 5) - seed + src.charCodeAt(i)) | 0;
    bars.current = Array.from({ length: 40 }, (_, i) => {
      seed = (seed * 16807 + 7) % 2147483647;
      return 0.15 + (Math.abs(seed) % 70) / 100;
    });
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Register in global set
    activeAudioSet.add(audio);

    const onLoaded = () => {
      setDuration(audio.duration);
      setIsLoaded(true);
    };
    const onTime = () => setCurrentTime(audio.currentTime);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (audio) audio.currentTime = 0;
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onError = () => {
      setHasError(true);
      setIsPlaying(false);
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);

    return () => {
      activeAudioSet.delete(audio);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
  }, [isPlaying]);

  const cycleSpeed = () => {
    const rates = [1, 1.5, 2];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const seekTo = (e: React.MouseEvent | React.TouchEvent) => {
    const el = progressRef.current;
    const audio = audioRef.current;
    if (!el || !audio || !duration) return;
    const rect = el.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    // RTL: right edge is start
    const ratio = Math.max(0, Math.min(1, (rect.right - clientX) / rect.width));
    audio.currentTime = ratio * duration;
  };

  const formatTime = (s: number) => {
    if (!s || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  if (hasError) {
    return (
      <div className={cn(
        "flex items-center gap-2 rounded-2xl px-3 py-2.5 min-w-[180px]",
        isAgent ? "bg-secondary/60" : "bg-white/15",
        className
      )}>
        <a href={src} target="_blank" rel="noreferrer" download className={cn("flex items-center gap-2 text-xs", isAgent ? "text-muted-foreground hover:text-foreground" : "text-white/70 hover:text-white")}>
          <Download className="w-4 h-4" />
          <span>تحميل الصوتية</span>
        </a>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex items-center gap-2 rounded-2xl px-3 py-2 min-w-[220px] max-w-[320px]",
      isAgent ? "bg-secondary/60" : "bg-white/15",
      className
    )}>
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-95",
          isAgent
            ? "bg-primary text-primary-foreground shadow-md"
            : "bg-white/25 text-white"
        )}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4" fill="currentColor" />
        ) : (
          <Play className="w-4 h-4 mr-[-2px]" fill="currentColor" />
        )}
      </button>

      {/* Waveform + progress */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div
          ref={progressRef}
          className="flex items-end gap-[2px] h-7 cursor-pointer py-0.5"
          onClick={seekTo}
          onTouchStart={seekTo}
        >
          {bars.current.map((h, i) => {
            const barProgress = i / bars.current.length;
            const isPlayed = barProgress <= progress;
            return (
              <div
                key={i}
                className={cn(
                  "flex-1 rounded-full transition-colors duration-150",
                  isPlayed
                    ? isAgent ? "bg-primary" : "bg-white"
                    : isAgent ? "bg-muted-foreground/25" : "bg-white/30"
                )}
                style={{ height: `${h * 100}%`, minWidth: 2 }}
              />
            );
          })}
        </div>

        {/* Time + speed */}
        <div className="flex items-center justify-between">
          <span className={cn(
            "text-[10px] font-mono tabular-nums",
            isAgent ? "text-muted-foreground" : "text-white/70"
          )}>
            {isPlaying || currentTime > 0 ? formatTime(currentTime) : formatTime(duration)}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={cycleSpeed}
              className={cn(
                "text-[9px] font-bold px-1.5 py-0.5 rounded-md transition-colors",
                isAgent
                  ? "bg-muted text-muted-foreground hover:bg-accent"
                  : "bg-white/15 text-white/80 hover:bg-white/25"
              )}
            >
              {playbackRate}x
            </button>
            <a
              href={src}
              download
              target="_blank"
              rel="noreferrer"
              className={cn(
                "p-0.5 rounded transition-colors",
                isAgent ? "text-muted-foreground hover:text-foreground" : "text-white/60 hover:text-white"
              )}
            >
              <Download className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioPlayer;
