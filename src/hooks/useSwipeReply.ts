import { useRef, useCallback } from "react";

interface UseSwipeReplyOptions {
  onSwipe: () => void;
  direction?: "left" | "right";
  threshold?: number;
}

export function useSwipeReply({ onSwipe, direction = "right", threshold = 60 }: UseSwipeReplyOptions) {
  const startX = useRef(0);
  const currentX = useRef(0);
  const isSwiping = useRef(false);
  const didVibrate = useRef(false);
  const elRef = useRef<HTMLDivElement | null>(null);

  const vibrate = () => {
    if (navigator.vibrate) {
      navigator.vibrate(15);
    }
  };

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    currentX.current = 0;
    isSwiping.current = false;
    didVibrate.current = false;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const diff = e.touches[0].clientX - startX.current;
    const isCorrectDirection = direction === "right" ? diff > 0 : diff < 0;

    if (!isCorrectDirection) {
      if (elRef.current) elRef.current.style.transform = "";
      currentX.current = 0;
      return;
    }

    const absDiff = Math.abs(diff);
    // Dampen movement after threshold
    const dampened = absDiff > threshold ? threshold + (absDiff - threshold) * 0.3 : absDiff;
    currentX.current = diff;
    isSwiping.current = absDiff > 10;

    if (elRef.current && isSwiping.current) {
      elRef.current.style.transform = `translateX(${direction === "right" ? dampened : -dampened}px)`;
      elRef.current.style.transition = "none";
    }
  }, [direction, threshold]);

  const onTouchEnd = useCallback(() => {
    const absDiff = Math.abs(currentX.current);
    if (elRef.current) {
      elRef.current.style.transform = "";
      elRef.current.style.transition = "transform 0.25s ease-out";
    }
    if (absDiff >= threshold) {
      onSwipe();
    }
    currentX.current = 0;
    isSwiping.current = false;
  }, [threshold, onSwipe]);

  return { ref: elRef, onTouchStart, onTouchMove, onTouchEnd };
}
