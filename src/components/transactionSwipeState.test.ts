import { describe, it, expect } from "vitest";
import { nextOpenRowId } from "./transactionSwipeState";

describe("nextOpenRowId (single-open swipe state)", () => {
  it("opens a row when none is open", () => {
    expect(nextOpenRowId(null, "a", true)).toBe("a");
  });
  it("opening row B replaces row A (single open)", () => {
    expect(nextOpenRowId("a", "b", true)).toBe("b");
  });
  it("closing the open row clears it", () => {
    expect(nextOpenRowId("a", "a", false)).toBe(null);
  });
  it("a stale close from a different row does not clear the open row", () => {
    expect(nextOpenRowId("a", "b", false)).toBe("a");
  });
  it("closing when nothing is open stays null", () => {
    expect(nextOpenRowId(null, "a", false)).toBe(null);
  });
});
