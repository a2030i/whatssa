import { useState, useEffect } from "react";
import { X, ZoomIn, ZoomOut, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

const ImageLightbox = ({ src, alt = "صورة", onClose }: ImageLightboxProps) => {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col animate-fade-in" onClick={onClose}>
      {/* Top bar */}
      <div className="flex items-center justify-between p-3 shrink-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale((s) => Math.min(s + 0.5, 4))}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <ZoomIn className="w-4 h-4 text-white" />
          </button>
          <button
            onClick={() => setScale((s) => Math.max(s - 0.5, 0.5))}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <ZoomOut className="w-4 h-4 text-white" />
          </button>
          <a
            href={src}
            download
            target="_blank"
            rel="noreferrer"
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="w-4 h-4 text-white" />
          </a>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-full object-contain transition-transform duration-200 select-none"
          style={{ transform: `scale(${scale})` }}
          draggable={false}
          onClick={onClose}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setScale((s) => (s > 1 ? 1 : 2));
          }}
        />
      </div>
    </div>
  );
};

export default ImageLightbox;
