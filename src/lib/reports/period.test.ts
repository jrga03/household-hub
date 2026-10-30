import { describe, expect, it } from "vitest";
import { cents } from "@/test/cents";
import { monthsEnding, periodMonths, previousPeriod, spendingOver } from "./period";
import type { SpendingGrid } from "./spending";

describe("periodMonths", () => {
  it("is the whole months ending on the end month", () => {
    expect(periodMonths("3m", "2027-02")).toEqual({
      months: ["2026-12", "2027-01", "2027-02"],
      cutToToday: false,
    });
  });

  it("is the last 12 months for Year", () => {
    expect(periodMonths("year", "2027-12").months).toEqual([
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05",
      "2027-06",
      "2027-07",
      "2027-08",
      "2027-09",
      "2027-10",
      "2027-11",
      "2027-12",
    ]);
  });

  it("leaves out months before the first month of data", () => {
    expect(periodMonths("6m", "2026-11").months).toEqual(["2026-10", "2026-11"]);
    expect(monthsEnding("2026-11", 12)).toEqual(["2026-10", "2026-11"]);
  });
});

describe("previousPeriod", () => {
  it("is the same length just before, whole, when the period ends on a full month", () => {
    expect(previousPeriod("3m", "2027-06", "2027-08-15")).toEqual({
      months: ["2027-01", "2027-02", "2027-03"],
      cutToToday: false,
    });
  });

  it("is cut at today's day of the month when the period ends on this month", () => {
    expect(previousPeriod("month", "2027-03", "2027-03-31")).toEqual({
      months: ["2027-02"],
      cutToToday: true,
    });
  });

  it("is missing when it starts before go-live on 2026-10-29", () => {
    expect(previousPeriod("month", "2026-11", "2026-11-20")).toBeNull();
    expect(previousPeriod("3m", "2027-03", "2027-03-01")).toBeNull();
    expect(previousPeriod("month", "2026-12", "2026-12-01")).not.toBeNull();
  });
});

describe("spendingOver", () => {
  const GROCERIES = "groceries";
  const RENT = "rent";
  const grid: SpendingGrid = new Map([
    ["2027-01", new Map([[GROCERIES, { spent: cents(1000), spentToDay: cents(400) }]])],
    [
      "2027-02",
      new Map([
        [GROCERIES, { spent: cents(2000), spentToDay: cents(500) }],
        [RENT, { spent: cents(300), spentToDay: cents(300) }],
      ]),
    ],
  ]);

  it("sums each category over the period's months", () => {
    expect(spendingOver(grid, { months: ["2027-01", "2027-02"], cutToToday: false })).toEqual(
      new Map([
        [GROCERIES, 3000],
        [RENT, 300],
      ])
    );
  });

  it("counts only up to today's day in the last month of a cut previous period", () => {
    expect(
      spendingOver(grid, { months: ["2027-01", "2027-02"], cutToToday: true }).get(GROCERIES)
    ).toBe(1000 + 500);
  });
});
