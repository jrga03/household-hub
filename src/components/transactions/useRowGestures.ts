import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from "react";

/** The action a swipe uncovers: right shows the status change, left shows Remove. */
export type RevealedAction = "status" | "remove";

/** How far a revealed row stays moved, the width of the action behind it. */
export const REVEAL_WIDTH = 112;
const SLOP = 10;
const LONG_PRESS_MS = 500;

/** Where a row rests when let go at this offset. */
export const settleSwipe = (offset: number): RevealedAction | null =>
  offset >= REVEAL_WIDTH / 2 ? "status" : offset <= -REVEAL_WIDTH / 2 ? "remove" : null;

const restingOffset = (revealed: RevealedAction | null) =>
  revealed === "status" ? REVEAL_WIDTH : revealed === "remove" ? -REVEAL_WIDTH : 0;

const clampOffset = (offset: number) =>
  Math.max(-REVEAL_WIDTH * 1.25, Math.min(REVEAL_WIDTH * 1.25, offset));

interface RowGestureOptions {
  /** The whole row, actions included: a tap outside it puts a revealed row back. */
  rowRef: RefObject<HTMLElement | null>;
  revealed: RevealedAction | null;
  onRevealChange: (revealed: RevealedAction | null) => void;
  /** Off while selecting, when a tap selects instead. */
  canSwipe: boolean;
  onLongPress: () => void;
}

/**
 * A touch swipe reveals an action without doing it; the row snaps back on a
 * scroll or a tap elsewhere. Vertical moves are left to the page scroll (the
 * row needs `touch-action: pan-y`). A long press, by touch or mouse, calls
 * `onLongPress`, and the click that ends it is swallowed.
 */
export function useRowGestures({
  rowRef,
  revealed,
  onRevealChange,
  canSwipe,
  onLongPress,
}: RowGestureOptions) {
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const swiping = useRef(false);
  // Read on release, which can come before the last move has rendered.
  const lastOffset = useRef(0);
  const swallowClick = useRef(false);
  const pressTimer = useRef<number | undefined>(undefined);

  const cancelPress = () => {
    window.clearTimeout(pressTimer.current);
    pressTimer.current = undefined;
  };
  const stop = () => {
    cancelPress();
    start.current = null;
    swiping.current = false;
    setDragOffset(null);
  };

  useEffect(() => cancelPress, []);

  // Read when putting back, so a re-render mid-scroll doesn't swap the listeners out
  // while the scroll event is still being dispatched to them.
  const revealChange = useRef(onRevealChange);
  useLayoutEffect(() => {
    revealChange.current = onRevealChange;
  });

  useEffect(() => {
    if (!revealed) return;
    const putBack = () => revealChange.current(null);
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && rowRef.current?.contains(event.target)) return;
      putBack();
    };
    window.addEventListener("scroll", putBack, { passive: true });
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("scroll", putBack);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [revealed, rowRef]);

  return {
    offset: dragOffset ?? restingOffset(revealed),
    dragging: dragOffset !== null,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        swallowClick.current = false;
        start.current = { x: event.clientX, y: event.clientY, base: restingOffset(revealed) };
        cancelPress();
        pressTimer.current = window.setTimeout(() => {
          pressTimer.current = undefined;
          if (!start.current || swiping.current) return;
          start.current = null;
          swallowClick.current = true;
          onLongPress();
        }, LONG_PRESS_MS);
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        if (!start.current) return;
        const dx = event.clientX - start.current.x;
        const dy = event.clientY - start.current.y;
        if (!swiping.current) {
          const moved = Math.abs(dx) > SLOP || Math.abs(dy) > SLOP;
          if (moved) cancelPress();
          if (!canSwipe || event.pointerType === "mouse") {
            if (moved) start.current = null;
            return;
          }
          if (Math.abs(dy) > SLOP && Math.abs(dy) >= Math.abs(dx)) return stop();
          if (Math.abs(dx) <= SLOP) return;
          swiping.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        lastOffset.current = clampOffset(start.current.base + dx);
        setDragOffset(lastOffset.current);
      },
      onPointerUp: () => {
        if (swiping.current) {
          swallowClick.current = true;
          onRevealChange(settleSwipe(lastOffset.current));
        }
        stop();
      },
      onPointerCancel: stop,
      onClickCapture: (event: MouseEvent<HTMLElement>) => {
        if (!swallowClick.current && !revealed) return;
        // The tap that ends a swipe or long press, or puts a revealed row back, isn't a click on it.
        event.preventDefault();
        event.stopPropagation();
        if (!swallowClick.current) onRevealChange(null);
        swallowClick.current = false;
      },
      // A long press on a phone would otherwise open the browser's menu.
      onContextMenu: (event: MouseEvent<HTMLElement>) => {
        if (swallowClick.current || pressTimer.current !== undefined) event.preventDefault();
      },
    },
  };
}
