import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Download } from "lucide-react";
import { cn } from "@/lib/utils";

// Global registry: only one audio plays at a time
const activeAudioSet = new Set<HTMLAudioElement>();
const pauseAllExcept = (current: HTMLAudioElement) => {
  activeAudioSet.forEach((audio) => {
    if (audio !== current && !audio.paused) audio.pause();
  });
};

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
  const rafRef = useRef<number>();

  // Generate fake waveform bars (deterministic based on src)
  const bars = useRef<number[]>([]);
  if (bars.current.length === 0) {
    let seed = 0;
    for (let i = 0; i < src.length; i++) seed = ((seed << 5) - seed + src.charCodeAt(i)) | 0;
    bars.current = Array.from({ length: 28 }, (_, i) => {
      seed = (seed * 16807 + 7) % 2147483647;
      return 0.25 + (Math.abs(seed) % 60) / 100;
    });
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    activeAudioSet.add(audio);

    const onLoaded = () => {
      if (isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
      setIsLoaded(true);
    };
    const onDurationChange = () => {
      if (isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); audio.currentTime = 0; };
    const onPlay = () => {
      setIsPlaying(true);
      const tick = () => {
        if (!audio.paused) {
          setCurrentTime(audio.currentTime);
          if (isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    };
    const onPause = () => { setIsPlaying(false); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    const onError = () => { setHasError(true); setIsPlaying(false); };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);

    return () => {
      activeAudioSet.delete(audio);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); } else { pauseAllExcept(audio); audio.play().catch(() => {}); }
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
      <a href={src} target="_blank" rel="noreferrer" download
        className={cn("flex items-center gap-2 text-xs py-1", isAgent ? "text-muted-foreground hover:text-foreground" : "text-white/70 hover:text-white", className)}>
        <Download className="w-3.5 h-3.5" />
        <span>تحميل الصوتية</span>
      </a>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 w-full min-w-[180px] max-w-[280px]", className)}>
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause */}
      <button
        onClick={togglePlay}
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-95",
          isAgent
            ? "bg-primary text-primary-foreground shadow-sm"
            : "bg-white/25 text-white"
        )}
      >
        {isPlaying
          ? <Pause className="w-3.5 h-3.5" fill="currentColor" />
          : <Play className="w-3.5 h-3.5 mr-[-1px]" fill="currentColor" />}
      </button>

      {/* Waveform + meta */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div
          ref={progressRef}
          className="flex items-center gap-[1.5px] h-5 cursor-pointer"
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
                style={{ height: `${h * 100}%`, minWidth: 1.5, maxWidth: 3 }}
              />
            );
          })}
        </div>

        <div className="flex items-center justify-between">
          <span className={cn("text-[9px] font-mono tabular-nums", isAgent ? "text-muted-foreground" : "text-white/70")}>
            {isPlaying || currentTime > 0 ? formatTime(currentTime) : formatTime(duration)}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={cycleSpeed}
              className={cn(
                "text-[8px] font-bold px-1 py-0.5 rounded transition-colors",
                isAgent ? "bg-muted text-muted-foreground hover:bg-accent" : "bg-white/15 text-white/80 hover:bg-white/25"
              )}
            >
              {playbackRate}x
            </button>
            <a href={src} download target="_blank" rel="noreferrer"
              className={cn("p-0.5 rounded transition-colors", isAgent ? "text-muted-foreground hover:text-foreground" : "text-white/60 hover:text-white")}>
              <Download className="w-2.5 h-2.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioPlayer;
