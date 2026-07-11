/**
 * Tests for parseLocalDate: "yyyy-MM-dd" must parse as LOCAL midnight, not
 * UTC midnight. new Date("yyyy-MM-dd") is UTC midnight, which displays as the
 * previous calendar day in UTC-negative timezones and shifts day math for
 * UTC+ users. Shared by date-picker.tsx and TransactionFilters.tsx.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parseLocalDate } from "./dates";

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
