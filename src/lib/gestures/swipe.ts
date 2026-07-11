/** Pixels of movement before the axis lock commits. Direction-dominant:
 *  the larger axis wins; a tie is scroll (protect the list). */
export const AXIS_LOCK_PX = 10;
/** Fraction of tray width the finger must pass (on release) to snap open. */
export const SNAP_RATIO = 0.4;

export type SwipeAxis = "x" | "y" | "pending";

export function resolveSwipeAxis(absDx: number, absDy: number): SwipeAxis {
  if (absDx < AXIS_LOCK_PX && absDy < AXIS_LOCK_PX) return "pending";
  return absDx > absDy ? "x" : "y";
}

/** offsetX is negative for a left swipe (reveals the right-edge tray). */
export function resolveSnap(offsetX: number, trayWidth: number): "open" | "closed" {
  if (offsetX >= 0) return "closed"; // rightward drag never opens the left tray
  return Math.abs(offsetX) >= trayWidth * SNAP_RATIO ? "open" : "closed";
}
