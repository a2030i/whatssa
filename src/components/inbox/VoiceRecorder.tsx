import { useState, useRef, useEffect, useCallback } from "react";
import { Send, XCircle, Play, Pause, Trash2, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceRecorderProps {
  onSend: (blob: Blob) => void;
  onCancel: () => void;
}

const BAR_COUNT = 45;

const VoiceRecorder = ({ onSend, onCancel }: VoiceRecorderProps) => {
  const [phase, setPhase] = useState<"recording" | "preview">("recording");
  const [time, setTime] = useState(0);
  const [bars, setBars] = useState<number[]>(() => Array(BAR_COUNT).fill(0.08));
  const [previewBars, setPreviewBars] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playProgress, setPlayProgress] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordedBarsRef = useRef<number[]>([]);

  // Start recording on mount
  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;

        // Audio analysis for waveform
        const ctx = new AudioContext();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.4;
        source.connect(analyser);
        analyserRef.current = analyser;

        // MediaRecorder
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
        const recorder = new MediaRecorder(stream, { mimeType });
        audioChunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          blobRef.current = blob;
          stream.getTracks().forEach(t => t.stop());
          setPreviewBars([...recordedBarsRef.current]);
          setPhase("preview");
        };
        mediaRecorderRef.current = recorder;
        recorder.start();

        // Timer
        timerRef.current = setInterval(() => setTime(t => t + 1), 1000);

        // Waveform animation loop
        const dataArr = new Uint8Array(analyser.frequencyBinCount);
        const animate = () => {
          analyser.getByteFrequencyData(dataArr);
          // Pick evenly spaced frequency bins
          const newBars: number[] = [];
          const step = Math.max(1, Math.floor(dataArr.length / BAR_COUNT));
          for (let i = 0; i < BAR_COUNT; i++) {
            const val = dataArr[Math.min(i * step, dataArr.length - 1)] / 255;
            newBars.push(Math.max(0.08, val));
          }
          setBars(newBars);
          recordedBarsRef.current = [...recordedBarsRef.current.slice(-(BAR_COUNT - 1)), newBars[Math.floor(BAR_COUNT / 2)]];
          animFrameRef.current = requestAnimationFrame(animate);
        };
        animate();
      } catch {
        onCancel();
      }
    };

    start();

    return () => {
      cancelled = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      audioContextRef.current?.close().catch(() => {});
    };
  }, []);

  const stopRecording = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    audioContextRef.current?.close().catch(() => {});
  }, []);

  const handleCancel = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioContextRef.current?.close().catch(() => {});
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    onCancel();
  }, [onCancel]);

  const handleSend = useCallback(() => {
    if (blobRef.current && blobRef.current.size > 500) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      onSend(blobRef.current);
    }
  }, [onSend]);

  const togglePlayback = useCallback(() => {
    if (!blobRef.current) return;

    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    if (!audioRef.current) {
      const url = URL.createObjectURL(blobRef.current);
      audioRef.current = new Audio(url);
      audioRef.current.onended = () => {
        setIsPlaying(false);
        setPlayProgress(0);
      };
      audioRef.current.ontimeupdate = () => {
        if (audioRef.current && audioRef.current.duration) {
          setPlayProgress(audioRef.current.currentTime / audioRef.current.duration);
        }
      };
    }
    audioRef.current.play().catch(() => {});
    setIsPlaying(true);
  }, [isPlaying]);

  const handleDeletePreview = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    blobRef.current = null;
    setPlayProgress(0);
    setIsPlaying(false);
    onCancel();
  }, [onCancel]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // ─── RECORDING PHASE ───
  if (phase === "recording") {
    return (
      <div className="shrink-0 border-t border-destructive/30 bg-gradient-to-t from-destructive/5 to-card p-3 flex items-center gap-3">
        {/* Cancel */}
        <button
          onClick={handleCancel}
          className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-secondary transition-colors shrink-0"
          title="إلغاء"
        >
          <Trash2 className="w-4 h-4 text-destructive" />
        </button>

        {/* Live waveform */}
        <div className="flex-1 flex items-center gap-1.5 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse shrink-0" />
          <span className="text-sm font-mono font-semibold text-destructive tabular-nums shrink-0 w-10">
            {formatTime(time)}
          </span>
          <div className="flex-1 flex items-center justify-center gap-[1.5px] h-9 overflow-hidden">
            {bars.map((h, i) => (
              <div
                key={i}
                className="rounded-full bg-destructive/70 transition-all duration-75"
                style={{
                  width: 3,
                  height: `${Math.max(3, h * 32)}px`,
                  opacity: 0.5 + h * 0.5,
                }}
              />
            ))}
          </div>
        </div>

        {/* Stop & go to preview */}
        <button
          onClick={stopRecording}
          className="w-10 h-10 rounded-full bg-destructive flex items-center justify-center hover:bg-destructive/90 transition-all shrink-0 shadow-md"
          title="إيقاف"
        >
          <div className="w-3.5 h-3.5 rounded-sm bg-white" />
        </button>
      </div>
    );
  }

  // ─── PREVIEW PHASE ───
  const displayBars = previewBars.length > 0 ? previewBars : Array(BAR_COUNT).fill(0.3);
  // Pad or trim to BAR_COUNT
  const normalizedBars = displayBars.length >= BAR_COUNT
    ? displayBars.slice(-BAR_COUNT)
    : [...Array(BAR_COUNT - displayBars.length).fill(0.08), ...displayBars];

  return (
    <div className="shrink-0 border-t border-border/40 bg-card p-3 flex items-center gap-3">
      {/* Delete */}
      <button
        onClick={handleDeletePreview}
        className="w-9 h-9 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/10 transition-colors shrink-0"
        title="حذف"
      >
        <Trash2 className="w-4 h-4 text-destructive" />
      </button>

      {/* Play/Pause */}
      <button
        onClick={togglePlayback}
        className="w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-all shrink-0 shadow-md"
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 text-primary-foreground" fill="currentColor" />
        ) : (
          <Play className="w-4 h-4 text-primary-foreground mr-[-2px]" fill="currentColor" />
        )}
      </button>

      {/* Waveform with progress overlay */}
      <div className="flex-1 flex items-center gap-1.5 min-w-0">
        <span className="text-xs font-mono font-medium text-muted-foreground tabular-nums shrink-0 w-9">
          {formatTime(time)}
        </span>
        <div className="flex-1 flex items-center justify-center gap-[1.5px] h-9 overflow-hidden">
          {normalizedBars.map((h, i) => {
            const barRatio = i / normalizedBars.length;
            const isPlayed = barRatio <= playProgress;
            return (
              <div
                key={i}
                className={cn(
                  "rounded-full transition-colors duration-100",
                  isPlayed ? "bg-primary" : "bg-muted-foreground/25"
                )}
                style={{
                  width: 3,
                  height: `${Math.max(3, h * 32)}px`,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Send */}
      <button
        onClick={handleSend}
        className="w-10 h-10 rounded-full gradient-whatsapp flex items-center justify-center hover:opacity-90 transition-opacity shrink-0 shadow-md"
        title="إرسال"
      >
        <Send className="w-4 h-4 text-whatsapp-foreground" style={{ transform: "scaleX(-1)" }} />
      </button>
    </div>
  );
};

export default VoiceRecorder;