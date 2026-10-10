import { describe, expect, it } from "vitest";
import { compareHlc, formatHlc, initialHlc, parseHlc, receiveHlc, tickHlc } from "./hlc";

const DEVICE_A = "aaaaaaaa-0000-4000-8000-000000000000";
const DEVICE_B = "bbbbbbbb-0000-4000-8000-000000000000";

describe("local writes", () => {
  it("are monotonic while the wall clock advances", () => {
    const first = tickHlc(initialHlc(DEVICE_A), 1_000);
    const second = tickHlc(first, 2_000);

    expect(compareHlc(second, first)).toBeGreaterThan(0);
  });

  it("are monotonic within the same millisecond", () => {
    const first = tickHlc(initialHlc(DEVICE_A), 1_000);
    const second = tickHlc(first, 1_000);

    expect(compareHlc(second, first)).toBeGreaterThan(0);
  });

  it("stay monotonic when the wall clock goes backwards", () => {
    const first = tickHlc(initialHlc(DEVICE_A), 5_000);
    const second = tickHlc(first, 1_000);
    const third = tickHlc(second, 2_000);

    expect(compareHlc(second, first)).toBeGreaterThan(0);
    expect(compareHlc(third, second)).toBeGreaterThan(0);
  });
});

describe("receiving a remote timestamp", () => {
  it("advances past a remote timestamp from a device whose clock runs ahead", () => {
    const local = tickHlc(initialHlc(DEVICE_A), 1_000);
    const remote = tickHlc(initialHlc(DEVICE_B), 60_000);

    const received = receiveHlc(local, remote, 1_001);
    const nextLocalWrite = tickHlc(received, 1_002);

    expect(compareHlc(received, remote)).toBeGreaterThan(0);
    expect(compareHlc(nextLocalWrite, remote)).toBeGreaterThan(0);
  });

  it("keeps the device's own identity", () => {
    const remote = tickHlc(initialHlc(DEVICE_B), 60_000);

    expect(receiveHlc(initialHlc(DEVICE_A), remote, 1_000).deviceId).toBe(DEVICE_A);
  });
});

describe("ordering", () => {
  it("breaks a tie on wall time and counter by device id", () => {
    const fromA = tickHlc(initialHlc(DEVICE_A), 1_000);
    const fromB = tickHlc(initialHlc(DEVICE_B), 1_000);

    expect(compareHlc(fromA, fromB)).toBeLessThan(0);
    expect(compareHlc(fromB, fromA)).toBeGreaterThan(0);
  });

  it("formats to a string that sorts the same way and parses back", () => {
    const earlier = tickHlc(initialHlc(DEVICE_B), 999);
    const later = tickHlc(tickHlc(initialHlc(DEVICE_A), 1_000), 1_000);

    expect(formatHlc(earlier) < formatHlc(later)).toBe(true);
    expect(parseHlc(formatHlc(later))).toEqual(later);
  });

  it("rejects a malformed timestamp", () => {
    expect(() => parseHlc("not-a-clock")).toThrow();
  });
});
