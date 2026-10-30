import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SpendingGrids } from "@/lib/reports/spending";
import { watchSpending } from "@/lib/reports/watch-spending";
import { useSpendingGrids } from "./useSpendingGrids";

vi.mock("@/lib/reports/watch-spending", () => ({ watchSpending: vi.fn() }));

const grids = (month: string): SpendingGrids => ({
  household: new Map([[month, new Map()]]),
  mine: new Map(),
});

describe("useSpendingGrids", () => {
  it("is undefined until the first run, then gives the latest grids", () => {
    let post: (next: SpendingGrids) => void = () => {};
    const stop = vi.fn();
    vi.mocked(watchSpending).mockImplementation((_request, onGrids) => {
      post = onGrids;
      return stop;
    });

    const { result, unmount } = renderHook(() => useSpendingGrids("user-me", "2026-11-12"));
    expect(result.current).toBeUndefined();
    expect(watchSpending).toHaveBeenCalledWith(
      { userId: "user-me", todayDay: 12 },
      expect.any(Function)
    );

    act(() => post(grids("2026-10")));
    act(() => post(grids("2026-11")));
    expect(result.current).toEqual(grids("2026-11"));

    unmount();
    expect(stop).toHaveBeenCalled();
  });
});
