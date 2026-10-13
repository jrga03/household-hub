import { describe, expect, it } from "vitest";
import { negateCents, parsePHP, ZERO_CENTS } from "@/lib/currency";
import { budgetProgress } from "./progress";

/** "-" before an amount makes it negative, as an overspent category's money is. */
const cents = (amount: string) =>
  amount.startsWith("-") ? negateCents(parsePHP(amount.slice(1))) : parsePHP(amount);

const figures = (spent: string, left: string) => ({ spent: cents(spent), money: cents(left) });

describe("budgetProgress", () => {
  it("fills by the share of the category's money already spent", () => {
    expect(budgetProgress(figures("1200", "6800"))).toEqual({ percent: 15, overspent: false });
  });

  it("is full and overspent once the money left goes negative", () => {
    expect(budgetProgress(figures("9000", "-1000"))).toEqual({ percent: 100, overspent: true });
  });

  it("is full but not overspent when everything is spent exactly", () => {
    expect(budgetProgress(figures("8000", "0"))).toEqual({ percent: 100, overspent: false });
  });

  it("is empty for a category with no money and no spending", () => {
    expect(budgetProgress({ spent: ZERO_CENTS, money: ZERO_CENTS })).toEqual({
      percent: 0,
      overspent: false,
    });
  });

  it("is empty when refunds outweigh the month's spending", () => {
    expect(budgetProgress(figures("-500", "1500"))).toEqual({
      percent: 0,
      overspent: false,
    });
  });
});
