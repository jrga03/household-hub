import { useRef, useState, type MouseEvent, type PointerEvent } from "react";

/** How far a row must travel before letting go acts on it. */
export const SWIPE_THRESHOLD = 80;
const SLOP = 10;

interface SwipeHandlers {
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
}

/**
 * Horizontal touch swipes on a row; vertical moves are left to the page scroll
 * (the row needs `touch-action: pan-y`). Mouse pointers are ignored.
 */
export function useSwipe({ onSwipeRight, onSwipeLeft }: SwipeHandlers) {
  const [offset, setOffset] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiping = useRef(false);
  // Read on release, which can come before the last move has rendered.
  const travelled = useRef(0);
  const justSwiped = useRef(false);

  const reset = () => {
    start.current = null;
    swiping.current = false;
    travelled.current = 0;
    setOffset(0);
  };

  return {
    offset,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType === "mouse") return;
        start.current = { x: event.clientX, y: event.clientY };
        justSwiped.current = false;
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        if (!start.current) return;
        const dx = event.clientX - start.current.x;
        const dy = event.clientY - start.current.y;
        if (!swiping.current) {
          if (Math.abs(dy) > SLOP && Math.abs(dy) >= Math.abs(dx)) return reset();
          if (Math.abs(dx) <= SLOP) return;
          swiping.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        travelled.current = dx;
        setOffset(dx);
      },
      onPointerUp: () => {
        if (swiping.current) {
          justSwiped.current = true;
          if (travelled.current >= SWIPE_THRESHOLD) onSwipeRight();
          else if (travelled.current <= -SWIPE_THRESHOLD) onSwipeLeft();
        }
        reset();
      },
      onPointerCancel: reset,
      // The tap that ends a swipe isn't a click on the row.
      onClickCapture: (event: MouseEvent<HTMLElement>) => {
        if (!justSwiped.current) return;
        justSwiped.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
    },
  };
}
