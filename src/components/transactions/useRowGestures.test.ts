import { describe, expect, it } from "vitest";
import { REVEAL_WIDTH, settleSwipe } from "./useRowGestures";

describe("settleSwipe", () => {
  it("reveals the status action past half its width to the right", () => {
    expect(settleSwipe(REVEAL_WIDTH / 2)).toBe("status");
    expect(settleSwipe(REVEAL_WIDTH * 3)).toBe("status");
  });

  it("reveals Remove past half its width to the left", () => {
    expect(settleSwipe(-REVEAL_WIDTH / 2)).toBe("remove");
  });

  it("snaps back for a short drag", () => {
    expect(settleSwipe(REVEAL_WIDTH / 2 - 1)).toBeNull();
    expect(settleSwipe(-REVEAL_WIDTH / 2 + 1)).toBeNull();
    expect(settleSwipe(0)).toBeNull();
  });
});
