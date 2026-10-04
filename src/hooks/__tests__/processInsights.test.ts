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
  it("average monthly spending is whole cents (was a fraction before 2b)", () => {
    const insights = processInsights(
      [expense("a", 100000), expense("b", 1)],
      new Date(2026, 6, 1),
      new Date(2026, 8, 29)
    );
    expect(Number.isInteger(insights.avgMonthlySpending)).toBe(true);
    expect(insights.avgMonthlySpending).toBe(33334); // 100001 / 3, rounded
  });
});
