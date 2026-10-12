import { describe, expect, it } from "vitest";
import { cents } from "@/test/cents";
import { budgetHistory, budgetInForce, budgetsInForce } from "./inForce";
import type { BudgetRow } from "./projection";

const GROCERIES = "cccccccc-0000-4000-8000-000000000001";
const RENT = "cccccccc-0000-4000-8000-000000000002";
const BPI = "aaaaaaaa-0000-4000-8000-000000000001";

const version = (fromMonth: string, amount: number | null, categoryId = GROCERIES): BudgetRow => ({
  id: `${categoryId}:${fromMonth}`,
  householdId: "h",
  visibility: "household",
  ownerUserId: null,
  categoryId,
  fromMonth,
  amountCents: amount === null ? null : cents(amount),
  accountId: amount === null ? null : BPI,
});

const history = [
  version("2026-12", 900000),
  version("2026-10", 800000),
  version("2027-03", null),
  version("2026-11", 50000, RENT),
];

describe("budgetInForce", () => {
  it.each([
    ["2026-09", null],
    ["2026-10", 800000],
    ["2026-11", 800000],
    ["2026-12", 900000],
    ["2027-02", 900000],
    ["2027-03", null],
    ["2027-08", null],
  ])("for %s is %s", (month, expected) => {
    expect(budgetInForce(history, GROCERIES, month)?.amountCents ?? null).toBe(expected);
  });

  it("names the funding account and the month it was set from", () => {
    expect(budgetInForce(history, GROCERIES, "2026-11")).toEqual({
      amountCents: 800000,
      accountId: BPI,
      fromMonth: "2026-10",
    });
  });

  it("starts again after a clear", () => {
    const restarted = [...history, version("2027-06", 700000)];

    expect(budgetInForce(restarted, GROCERIES, "2027-05")).toBeNull();
    expect(budgetInForce(restarted, GROCERIES, "2027-06")?.amountCents).toBe(700000);
  });
});

describe("budgetsInForce", () => {
  it("gives each category's budget for the month, leaving out cleared ones", () => {
    const inForce = budgetsInForce(history, "2026-11");

    expect([...inForce.keys()].sort()).toEqual([GROCERIES, RENT]);
    expect(inForce.get(GROCERIES)?.amountCents).toBe(800000);
    expect(budgetsInForce(history, "2027-03").has(GROCERIES)).toBe(false);
  });
});

describe("budgetHistory", () => {
  it("lists every version of the category, latest month first, cleared ones included", () => {
    expect(
      budgetHistory(history, GROCERIES).map(({ fromMonth, amountCents, accountId }) => ({
        fromMonth,
        amountCents,
        accountId,
      }))
    ).toEqual([
      { fromMonth: "2027-03", amountCents: null, accountId: null },
      { fromMonth: "2026-12", amountCents: 900000, accountId: BPI },
      { fromMonth: "2026-10", amountCents: 800000, accountId: BPI },
    ]);
  });
});
