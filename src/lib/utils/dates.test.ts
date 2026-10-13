/**
 * Tests for parseLocalDate: "yyyy-MM-dd" must parse as LOCAL midnight, not
 * UTC midnight. new Date("yyyy-MM-dd") is UTC midnight, which displays as the
 * previous calendar day in UTC-negative timezones and shifts day math for
 * UTC+ users. Shared by date-picker.tsx and TransactionFilters.tsx.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  isLocalMonth,
  localMonth,
  monthLabel,
  parseLocalDate,
  shiftMonth,
  todayLocalDate,
} from "./dates";

beforeAll(() => {
  // Fix a non-UTC timezone so a UTC-midnight parse regression is detectable
  // (in UTC the local and UTC calendar days coincide). Node re-reads TZ on
  // assignment since v13, so this affects Date for the rest of this file.
  vi.stubEnv("TZ", "Asia/Manila");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("parseLocalDate", () => {
  it("returns an Invalid Date when a date part is missing", () => {
    expect(Number.isNaN(parseLocalDate("2026-07").getTime())).toBe(true);
    expect(Number.isNaN(parseLocalDate("").getTime())).toBe(true);
  });

  it("parses yyyy-MM-dd as LOCAL midnight, not UTC midnight", () => {
    const date = parseLocalDate("2026-07-05");

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6); // July (0-indexed)
    expect(date.getDate()).toBe(5);
    // Local midnight; new Date("2026-07-05") would be 08:00 in Asia/Manila
    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
  });

  it("keeps the calendar day across month/year boundaries", () => {
    const newYear = parseLocalDate("2026-01-01");
    expect([newYear.getFullYear(), newYear.getMonth(), newYear.getDate()]).toEqual([2026, 0, 1]);

    const yearEnd = parseLocalDate("2025-12-31");
    expect([yearEnd.getFullYear(), yearEnd.getMonth(), yearEnd.getDate()]).toEqual([2025, 11, 31]);
  });

  it("returns an Invalid Date for malformed input", () => {
    expect(Number.isNaN(parseLocalDate("not-a-date").getTime())).toBe(true);
    expect(Number.isNaN(parseLocalDate("").getTime())).toBe(true);
    expect(Number.isNaN(parseLocalDate("2026-07").getTime())).toBe(true);
  });
});

describe("months", () => {
  it.each([
    ["2026-10", true],
    ["2026-12", true],
    ["2026-13", false],
    ["2026-00", false],
    ["2026-10-01", false],
    [202610, false],
  ])("isLocalMonth(%j) is %s", (value, expected) => {
    expect(isLocalMonth(value)).toBe(expected);
  });

  it.each([
    ["2026-10", 1, "2026-11"],
    ["2026-12", 1, "2027-01"],
    ["2026-01", -1, "2025-12"],
    ["2026-03", -14, "2025-01"],
  ])("shiftMonth(%s, %i) is %s", (month, by, expected) => {
    expect(shiftMonth(month, by)).toBe(expected);
  });

  it("names a month", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
  });

  it("gives the local calendar month", () => {
    expect(localMonth(new Date(2026, 9, 31, 23, 59))).toBe("2026-10");
  });
});

describe("todayLocalDate", () => {
  it("gives the local calendar day, not the UTC one", () => {
    vi.useFakeTimers();
    // 7:30 on 1 Nov in Manila is still 31 Oct in UTC.
    vi.setSystemTime(new Date("2026-10-31T23:30:00Z"));
    try {
      expect(todayLocalDate()).toBe("2026-11-01");
    } finally {
      vi.useRealTimers();
    }
  });
});
