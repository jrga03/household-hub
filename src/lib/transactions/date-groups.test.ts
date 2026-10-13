import { describe, expect, it } from "vitest";
import { dateHeading, groupByDate } from "./date-groups";

const today = new Date(2026, 9, 13, 9, 30);

describe("dateHeading", () => {
  it("names today and yesterday", () => {
    expect(dateHeading("2026-10-13", today)).toBe("Today");
    expect(dateHeading("2026-10-12", today)).toBe("Yesterday");
  });

  it("shows the weekday and date for older days this year", () => {
    expect(dateHeading("2026-10-11", today)).toBe("Sun Oct 11");
    expect(dateHeading("2026-01-05", today)).toBe("Mon Jan 5");
  });

  it("adds the year for another year, and for a future date reads it plainly", () => {
    expect(dateHeading("2025-12-31", today)).toBe("Wed Dec 31, 2025");
    expect(dateHeading("2026-10-14", today)).toBe("Wed Oct 14");
  });
});

describe("groupByDate", () => {
  it("puts a heading before the first row of each date, keeping the order", () => {
    const rows = [
      { id: "a", date: "2026-10-13" },
      { id: "b", date: "2026-10-13" },
      { id: "c", date: "2026-10-11" },
    ];

    expect(groupByDate(rows)).toEqual([
      { kind: "date", date: "2026-10-13" },
      { kind: "row", row: rows[0] },
      { kind: "row", row: rows[1] },
      { kind: "date", date: "2026-10-11" },
      { kind: "row", row: rows[2] },
    ]);
  });

  it("gives nothing for no rows", () => {
    expect(groupByDate([])).toEqual([]);
  });
});
