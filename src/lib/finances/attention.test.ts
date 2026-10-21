import { describe, expect, it } from "vitest";
import { negateCents, parsePHP, ZERO_CENTS, type Cents } from "@/lib/currency";
import { attentionFeed, type AttentionInput } from "./attention";

const peso = (amount: string): Cents => parsePHP(amount);

const budget = (name: string, budgeted: string, spent: string) => ({
  categoryId: `category-${name}`,
  name,
  budget: peso(budgeted),
  spent: peso(spent),
});

const account = (name: string, balance: Cents, type: "bank" | "credit_card" = "bank") => ({
  account: { id: `account-${name}`, name, type },
  balance,
});

const NOTHING_TO_REVIEW = { uncategorized: 0, drafts: 0, joinRequests: 0 };

const feed = (input: Partial<AttentionInput>) =>
  attentionFeed({ budgets: [], balances: [], review: NOTHING_TO_REVIEW, ...input });

describe("attentionFeed", () => {
  it("lists over budget, then negative balances, then close budgets, then review items", () => {
    const items = feed({
      review: { uncategorized: 3, drafts: 0, joinRequests: 0 },
      balances: [account("Metrobank Payroll", negateCents(peso("1200")))],
      budgets: [budget("Groceries", "8000", "7000"), budget("Dining out", "3000", "4230")],
    });

    expect(items).toEqual([
      {
        kind: "over",
        categoryId: "category-Dining out",
        name: "Dining out",
        budget: peso("3000"),
        spent: peso("4230"),
        over: peso("1230"),
      },
      {
        kind: "short",
        accountId: "account-Metrobank Payroll",
        name: "Metrobank Payroll",
        balance: negateCents(peso("1200")),
      },
      {
        kind: "close",
        categoryId: "category-Groceries",
        name: "Groceries",
        budget: peso("8000"),
        left: peso("1000"),
      },
      { kind: "review", review: "uncategorized", count: 3 },
    ]);
  });

  it("leaves out a budget spent exactly, one below 80%, and an account at zero", () => {
    expect(
      feed({
        budgets: [budget("Rent", "15000", "15000"), budget("Fuel", "2000", "1599.99")],
        balances: [account("BPI", ZERO_CENTS), account("GCash", peso("10"))],
      })
    ).toEqual([]);
  });

  it("never lists a credit card, whose figure is what is owed", () => {
    expect(feed({ balances: [account("Visa", negateCents(peso("500")), "credit_card")] })).toEqual(
      []
    );
  });

  it("puts the most urgent first within each kind", () => {
    const items = feed({
      budgets: [
        budget("Fuel", "1000", "1100"),
        budget("Dining out", "1000", "2000"),
        budget("Groceries", "1000", "850"),
        budget("Snacks", "1000", "950"),
      ],
      balances: [
        account("Wallet", negateCents(peso("50"))),
        account("BPI", negateCents(peso("900"))),
      ],
      review: { uncategorized: 1, drafts: 2, joinRequests: 1 },
    });

    expect(items.map((item) => ("name" in item ? item.name : item.review))).toEqual([
      "Dining out",
      "Fuel",
      "BPI",
      "Wallet",
      "Snacks",
      "Groceries",
      "uncategorized",
      "drafts",
      "joinRequests",
    ]);
  });

  it("lists review items only while their count is above zero", () => {
    expect(feed({ review: { uncategorized: 0, drafts: 4, joinRequests: 0 } })).toEqual([
      { kind: "review", review: "drafts", count: 4 },
    ]);
  });
});
