import { describe, expect, it } from "vitest";
import { processInsights } from "@/hooks/useAnalytics";
import type { AnalyticsTransactionRow } from "@/lib/supabaseQueries";
import { cents } from "@/test/cents";

const expense = (id: string, amount: number): AnalyticsTransactionRow => ({
  id,
  date: "2026-09-01",
  type: "expense",
  amount_cents: cents(amount),
  category_id: "c1",
  account_id: "a1",
  description: id,
  categories: { name: "Food" },
});

describe("processInsights", () => {
  it("average monthly spending is whole cents over calendar months", () => {
    const insights = processInsights(
      [expense("a", 100000), expense("b", 1)],
      new Date(2026, 6, 1),
      new Date(2026, 8, 30)
    );
    expect(Number.isInteger(insights.avgMonthlySpending)).toBe(true);
    expect(insights.avgMonthlySpending).toBe(33334); // 100001 / 3 months (Jul to Sep), rounded
  });

  it("the analytics page's six-month range counts as six months", () => {
    const insights = processInsights(
      [expense("a", 600000)],
      new Date(2026, 4, 1),
      new Date(2026, 9, 31, 23, 59, 59, 999)
    );
    expect(insights.avgMonthlySpending).toBe(100000);
  });
});
