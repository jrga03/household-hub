import { describe, expect, it } from "vitest";
import { parsePHP } from "@/lib/currency";
import { planChange } from "./plan";

const BPI = { id: "bpi", name: "BPI" };
const GCASH = { id: "gcash", name: "GCash" };
const groceries = { amountCents: parsePHP("8000"), accountId: "gcash", fromMonth: "2026-09" };

describe("planChange", () => {
  it("sets a new budget funded by the first account that can fund it", () => {
    expect(planChange("5,000", null, [BPI, GCASH])).toEqual({
      kind: "set",
      amountCents: parsePHP("5000"),
      accountId: "bpi",
    });
  });

  it("keeps the funding account of the budget in force", () => {
    expect(planChange("9000", groceries, [BPI, GCASH])).toEqual({
      kind: "set",
      amountCents: parsePHP("9000"),
      accountId: "gcash",
    });
  });

  it("moves to the first choice when the budget's funding account can no longer fund it", () => {
    expect(planChange("9000", groceries, [BPI])).toMatchObject({ kind: "set", accountId: "bpi" });
  });

  it("leaves an unchanged amount alone", () => {
    expect(planChange("8,000.00", groceries, [BPI, GCASH])).toEqual({ kind: "unchanged" });
  });

  it("clears the budget when emptied or set to 0", () => {
    const cleared = { kind: "set", amountCents: parsePHP("0"), accountId: null };
    expect(planChange("", groceries, [BPI])).toEqual(cleared);
    expect(planChange("0", groceries, [BPI])).toEqual(cleared);
  });

  it("does nothing when a category without a budget is left empty", () => {
    expect(planChange("  ", null, [BPI])).toEqual({ kind: "unchanged" });
    expect(planChange("0", null, [BPI])).toEqual({ kind: "unchanged" });
  });

  it("refuses text that isn't an amount", () => {
    expect(planChange("lots", null, [BPI])).toMatchObject({ kind: "problem" });
  });

  it("refuses a budget no account can fund", () => {
    expect(planChange("500", null, [])).toEqual({
      kind: "problem",
      message: "No account can fund it yet.",
    });
  });
});
