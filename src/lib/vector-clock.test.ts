import { describe, it, expect } from "vitest";
import {
  compareVectorClocks,
  mergeVectorClocks,
  incrementVectorClock,
  createVectorClock,
  isEmptyVectorClock,
  getMaxClockValue,
} from "./vector-clock";

describe("Vector Clock Comparison", () => {
  it("should detect equal clocks", () => {
    const v1 = { device1: 5, device2: 3 };
    const v2 = { device1: 5, device2: 3 };

    expect(compareVectorClocks(v1, v2)).toBe("equal");
  });

  it("should detect local ahead (causally ordered)", () => {
    const v1 = { device1: 5, device2: 3 };
    const v2 = { device1: 3, device2: 2 };

    expect(compareVectorClocks(v1, v2)).toBe("local-ahead");
  });

  it("should detect remote ahead (causally ordered)", () => {
    const v1 = { device1: 3, device2: 2 };
    const v2 = { device1: 5, device2: 3 };

    expect(compareVectorClocks(v1, v2)).toBe("remote-ahead");
  });

  it("should detect concurrent edits (conflict)", () => {
    const v1 = { device1: 5, device2: 2 };
    const v2 = { device1: 3, device2: 4 };

    expect(compareVectorClocks(v1, v2)).toBe("concurrent");
  });

  it("should handle missing devices in clock", () => {
    // v1 has only device1:5, v2 has device1:3 and device2:2
    // Since v2 has device2:2 which v1 doesn't have (defaults to 0),
    // and v1 has device1:5 > v2's device1:3, this is concurrent
    const v1 = { device1: 5 };
    const v2 = { device1: 3, device2: 2 };

    expect(compareVectorClocks(v1, v2)).toBe("concurrent");
  });

  it("should handle empty clocks", () => {
    const v1 = {};
    const v2 = {};

    expect(compareVectorClocks(v1, v2)).toBe("equal");
  });
});

describe("Vector Clock Merging", () => {
  it("should take element-wise maximum", () => {
    const v1 = { device1: 5, device2: 3 };
    const v2 = { device1: 3, device2: 7 };

    const merged = mergeVectorClocks(v1, v2);

    expect(merged).toEqual({ device1: 5, device2: 7 });
  });

  it("should include devices from both clocks", () => {
    const v1 = { device1: 5 };
    const v2 = { device2: 3 };

    const merged = mergeVectorClocks(v1, v2);

    expect(merged).toEqual({ device1: 5, device2: 3 });
  });

  it("should be commutative", () => {
    const v1 = { device1: 5, device2: 3 };
    const v2 = { device1: 3, device2: 7 };

    const merge1 = mergeVectorClocks(v1, v2);
    const merge2 = mergeVectorClocks(v2, v1);

    expect(merge1).toEqual(merge2);
  });

  it("should be idempotent", () => {
    const v1 = { device1: 5, device2: 3 };

    const merged = mergeVectorClocks(v1, v1);

    expect(merged).toEqual(v1);
  });
});

describe("Vector Clock Operations", () => {
  it("should increment clock for device", () => {
    const clock = { device1: 5, device2: 3 };
    const updated = incrementVectorClock(clock, "device1");

    expect(updated).toEqual({ device1: 6, device2: 3 });
  });

  it("should initialize device clock if not present", () => {
    const clock = { device1: 5 };
    const updated = incrementVectorClock(clock, "device2");

    expect(updated).toEqual({ device1: 5, device2: 1 });
  });

  it("should create new clock for device", () => {
    const clock = createVectorClock("device1");

    expect(clock).toEqual({ device1: 1 });
  });

  it("should detect empty clock", () => {
    expect(isEmptyVectorClock({})).toBe(true);
    expect(isEmptyVectorClock({ device1: 1 })).toBe(false);
  });

  it("should get max clock value", () => {
    const clock = { device1: 5, device2: 3, device3: 8 };

    expect(getMaxClockValue(clock)).toBe(8);
  });

  it("should return 0 for empty clock", () => {
    expect(getMaxClockValue({})).toBe(0);
  });
});

describe("Vector Clock Properties", () => {
  it("comparison should be reflexive", () => {
    const clock = { device1: 5, device2: 3 };

    expect(compareVectorClocks(clock, clock)).toBe("equal");
  });

  it("comparison should be consistent", () => {
    const v1 = { device1: 5, device2: 2 };
    const v2 = { device1: 3, device2: 4 };

    const result1 = compareVectorClocks(v1, v2);
    const result2 = compareVectorClocks(v2, v1);

    // Both should be "concurrent" or opposite ahead results
    expect(result1).toBe("concurrent");
    expect(result2).toBe("concurrent");
  });

  it("merge should preserve causality", () => {
    const v1 = { device1: 5, device2: 3 };
    const v2 = { device1: 3, device2: 7 };
    const merged = mergeVectorClocks(v1, v2);

    // Merged should be ahead of both inputs
    expect(compareVectorClocks(merged, v1)).toBe("local-ahead");
    expect(compareVectorClocks(merged, v2)).toBe("local-ahead");
  });
});
