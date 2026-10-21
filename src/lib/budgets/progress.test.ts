import { describe, expect, it } from "vitest";
import { negateCents, parsePHP, ZERO_CENTS } from "@/lib/currency";
import { budgetProgress, budgetStatus } from "./progress";

const peso = (amount: string) => parsePHP(amount);

describe("budgetProgress", () => {
  it("fills by the share of the budget spent, with the rest left", () => {
    expect(budgetProgress(peso("8000"), peso("1200"))).toEqual({
      left: peso("6800"),
      percent: 15,
      overspent: false,
    });
  });

  it("is full and overspent once spending passes the budget, with left negative", () => {
    expect(budgetProgress(peso("1000"), peso("10500"))).toEqual({
      left: negateCents(peso("9500")),
      percent: 100,
      overspent: true,
    });
  });

  it("is full but not overspent when the budget is spent exactly", () => {
    expect(budgetProgress(peso("8000"), peso("8000"))).toEqual({
      left: ZERO_CENTS,
      percent: 100,
      overspent: false,
    });
  });

  it("is empty when refunds outweigh the month's spending", () => {
    expect(budgetProgress(peso("8000"), negateCents(peso("500")))).toEqual({
      left: peso("8500"),
      percent: 0,
      overspent: false,
    });
  });

  it("has nothing to show without a budget", () => {
    expect(budgetProgress(ZERO_CENTS, peso("300"))).toBeNull();
  });
});

describe("budgetStatus", () => {
  it("is over only once spending passes the budget", () => {
    expect(budgetStatus(peso("1000"), peso("1000.01"))).toBe("over");
  });

  it("is fine, not close, when the budget is spent exactly", () => {
    expect(budgetStatus(peso("1000"), peso("1000"))).toBe("fine");
  });

  it("is close from 80% spent", () => {
    expect(budgetStatus(peso("1000"), peso("799.99"))).toBe("fine");
    expect(budgetStatus(peso("1000"), peso("800"))).toBe("close");
  });
});
