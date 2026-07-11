import { describe, it, expect } from "vitest";
import { resolveSwipeAxis, resolveSnap, AXIS_LOCK_PX, SNAP_RATIO } from "./swipe";

describe("resolveSwipeAxis (direction-dominant lock)", () => {
  it("is pending below the lock threshold", () => {
    expect(resolveSwipeAxis(4, 2)).toBe("pending");
  });
  it("locks to x when horizontal dominates past threshold", () => {
    expect(resolveSwipeAxis(AXIS_LOCK_PX + 1, 3)).toBe("x");
  });
  it("locks to y (scroll) when vertical dominates", () => {
    expect(resolveSwipeAxis(AXIS_LOCK_PX + 1, AXIS_LOCK_PX + 20)).toBe("y");
  });
  it("treats a tie as scroll (protect the list)", () => {
    expect(resolveSwipeAxis(AXIS_LOCK_PX + 1, AXIS_LOCK_PX + 1)).toBe("y");
  });
});

describe("resolveSnap (40% open threshold)", () => {
  const TRAY = 144;
  it("snaps closed below the ratio", () => {
    expect(resolveSnap(-(TRAY * (SNAP_RATIO - 0.05)), TRAY)).toBe("closed");
  });
  it("snaps open past the ratio", () => {
    expect(resolveSnap(-(TRAY * (SNAP_RATIO + 0.05)), TRAY)).toBe("open");
  });
  it("ignores rightward (positive) offset — no right-swipe", () => {
    expect(resolveSnap(TRAY, TRAY)).toBe("closed");
  });
});
