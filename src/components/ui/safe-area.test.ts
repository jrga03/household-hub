import { afterEach, describe, expect, it, vi } from "vitest";

import { safeAreaPadding } from "./safe-area";

function mockInsets(insets: { top: string; right: string; bottom: string; left: string }) {
  vi.spyOn(window, "getComputedStyle").mockReturnValue({
    paddingTop: insets.top,
    paddingRight: insets.right,
    paddingBottom: insets.bottom,
    paddingLeft: insets.left,
  } as CSSStyleDeclaration);
}

describe("safeAreaPadding", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps popups clear of an iPhone Dynamic Island and home indicator", () => {
    mockInsets({ top: "59px", right: "0px", bottom: "34px", left: "0px" });

    expect(safeAreaPadding()).toEqual({ top: 67, right: 8, bottom: 42, left: 8 });
  });

  it("falls back to the base gap when the browser has no safe-area insets", () => {
    mockInsets({ top: "", right: "", bottom: "", left: "" });

    expect(safeAreaPadding()).toEqual({ top: 8, right: 8, bottom: 8, left: 8 });
  });
});
