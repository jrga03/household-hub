import { useRef, useState, type ReactNode } from "react";
import { useDrag } from "@use-gesture/react";
import { Trash2, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveSwipeAxis, resolveSnap, type SwipeAxis } from "@/lib/gestures/swipe";

/**
 * Total width of the revealed action tray: two 72px buttons.
 * The foreground is translated by at most this much, so the tray sits fully
 * exposed at -TRAY_WIDTH.
 */
const TRAY_WIDTH = 144;
/** Rubber-band ceiling: the finger can drag ~20% past the tray before resisting. */
const MAX_PULL = TRAY_WIDTH * 1.2;

interface SwipeableRowProps {
  /** Controlled open state. The parent (TransactionList) owns a single openRowId. */
  isOpen: boolean;
  /** Called on release-snap and on a foreground tap while open (to close). */
  onOpenChange: (open: boolean) => void;
  onClear: () => void;
  onDelete: () => void;
  /** "Mark cleared" when pending, "Mark pending" when cleared. */
  clearLabel: string;
  children: ReactNode;
}

/**
 * Clamp with rubber-band resistance past the tray width. Left swipe only:
 * positive (rightward) movement is pinned to 0 (no right-swipe tray).
 */
function clampWithRubberband(mx: number): number {
  if (mx >= 0) return 0;
  if (mx >= -TRAY_WIDTH) return mx;
  // Past full tray: apply diminishing resistance up to MAX_PULL.
  const overshoot = -mx - TRAY_WIDTH;
  const resisted = TRAY_WIDTH + overshoot * 0.35;
  return -Math.min(resisted, MAX_PULL);
}

/**
 * A transaction card wrapped with a left-swipe-to-reveal action tray.
 *
 * INVARIANT: the row wrapper height NEVER changes on swipe. Only the
 * foreground layer moves, via `transform: translateX` — no width/height/margin
 * mutation. This is what keeps TanStack Virtual's measureElement stable and the
 * virtualizer entirely unaware of the gesture. Do not translate or resize the
 * outer wrapper.
 */
export function SwipeableRow({
  isOpen,
  onOpenChange,
  onClear,
  onDelete,
  clearLabel,
  children,
}: SwipeableRowProps) {
  // Live drag position while the finger is down; null when at rest. At rest the
  // translate is DERIVED from the controlled `isOpen` prop, so external changes
  // (close-on-scroll, a sibling opening, a row removed after delete) animate the
  // foreground with NO effect + setState sync — the render reads isOpen directly.
  const [dragX, setDragX] = useState<number | null>(null);
  const dragging = dragX !== null;

  // Resting translate derives from the controlled prop; the drag overrides it.
  const restX = isOpen ? -TRAY_WIDTH : 0;
  const x = dragX ?? restX;

  // Per-gesture axis lock. Reset at the start of each drag; once it resolves to
  // "y" we ignore the rest of that gesture (it's a scroll), once "x" we own it.
  const axisRef = useRef<SwipeAxis>("pending");

  const bind = useDrag(
    ({ movement: [mx, my], first, last, cancel, canceled }) => {
      if (canceled) return;

      if (first) {
        axisRef.current = "pending";
      }

      // Manual axis lock: stay out of the way until direction is dominant.
      if (axisRef.current === "pending") {
        axisRef.current = resolveSwipeAxis(Math.abs(mx), Math.abs(my));
      }

      // Locked to vertical → this gesture is a scroll; release our claim and
      // bail for the remainder of the gesture (touch-action: pan-y already lets
      // the browser scroll natively).
      if (axisRef.current === "y") {
        cancel();
        return;
      }

      // Still undecided → don't move the foreground yet.
      if (axisRef.current !== "x") return;

      // Start position depends on whether the row was already open, so an
      // open row can be dragged further or dragged closed.
      const startX = isOpen ? -TRAY_WIDTH : 0;
      const next = clampWithRubberband(startX + mx);

      if (last) {
        // Clear the live-drag override; the resting position (and its animated
        // snap) is driven by the isOpen prop the parent flips in onOpenChange.
        setDragX(null);
        const snap = resolveSnap(next, TRAY_WIDTH);
        onOpenChange(snap === "open");
        return;
      }

      setDragX(next);
    },
    {
      // We do the axis lock manually (see resolveSwipeAxis) so we can be
      // direction-dominant/forgiving rather than trust use-gesture's own lock.
      axis: undefined,
      filterTaps: true,
      pointer: { touch: true },
    }
  );

  return (
    <div className="relative overflow-hidden">
      {/* Action tray, behind the foreground, pinned to the right edge.
          [ Clear ][ Delete ] — Delete outermost (destructive convention).
          While closed the buttons are removed from the tab order (tabIndex=-1)
          so the keyboard/SR path stays on the card + detail sheet; they are NOT
          aria-hidden because that would also strip their accessible name, and
          the swipe reveal is a pointer-only accelerator anyway. */}
      <div className="absolute inset-y-0 right-0 flex" style={{ width: TRAY_WIDTH }}>
        <button
          type="button"
          onClick={onClear}
          tabIndex={isOpen ? 0 : -1}
          aria-label={clearLabel}
          className="flex w-[72px] flex-col items-center justify-center gap-1 bg-secondary text-xs font-medium text-secondary-foreground"
        >
          <CheckCircle className="h-5 w-5" aria-hidden="true" />
          <span aria-hidden="true">{clearLabel}</span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          tabIndex={isOpen ? 0 : -1}
          aria-label="Delete"
          className="flex w-[72px] flex-col items-center justify-center gap-1 bg-destructive text-xs font-medium text-white"
        >
          <Trash2 className="h-5 w-5" aria-hidden="true" />
          <span aria-hidden="true">Delete</span>
        </button>
      </div>

      {/* Foreground layer holding the card. Moved ONLY via translateX. The
          transition is a real CSS transition (via transition-transform) so the
          index.css prefers-reduced-motion rule flattens it to ~0ms; it is
          suppressed while the finger is down so the drag follows 1:1. */}
      <div
        {...bind()}
        className={cn("relative bg-background", !dragging && "transition-transform")}
        // touchAction must live on the element useDrag binds to (the touched
        // element), NOT an ancestor — touch-action does not inherit. pan-y lets
        // the browser own vertical scroll until our manual axis lock decides the
        // gesture is horizontal.
        style={{ transform: `translateX(${x}px)`, touchAction: "pan-y" }}
      >
        {children}
      </div>
    </div>
  );
}
