import { describe, it, expect } from "vitest";
import { calculateBudgetTotals, type BudgetComparison } from "../useBudgetActuals";

function makeComparison(overrides: Partial<BudgetComparison> = {}): BudgetComparison {
  return {
    categoryId: "cat-1",
    categoryName: "Food",
    target: 500000, // ₱5,000
    actual: 300000, // ₱3,000
    remaining: 200000,
    percentage: 60,
    status: "under",
    ...overrides,
  };
}

describe("calculateBudgetTotals", () => {
  it("sums targets correctly", () => {
    const comparisons = [
      makeComparison({ target: 500000 }),
      makeComparison({ categoryId: "cat-2", target: 300000 }),
    ];
    const totals = calculateBudgetTotals(comparisons);
    expect(totals.totalTarget).toBe(800000);
  });

  it("sums actuals correctly", () => {
    const comparisons = [
      makeComparison({ actual: 200000 }),
      makeComparison({ categoryId: "cat-2", actual: 150000 }),
    ];
    const totals = calculateBudgetTotals(comparisons);
    expect(totals.totalActual).toBe(350000);
  });

  it("calculates remaining = target - actual", () => {
    const comparisons = [
      makeComparison({ target: 500000, actual: 300000 }),
      makeComparison({
        categoryId: "cat-2",
        target: 200000,
        actual: 250000,
      }),
    ];
    const totals = calculateBudgetTotals(comparisons);
    // (500000 + 200000) - (300000 + 250000) = 700000 - 550000 = 150000
    expect(totals.totalRemaining).toBe(150000);
  });

  it("handles negative remaining when over budget", () => {
    const comparisons = [makeComparison({ target: 100000, actual: 200000 })];
    const totals = calculateBudgetTotals(comparisons);
    expect(totals.totalRemaining).toBe(-100000);
  });

  it("calculates overall percentage", () => {
    const comparisons = [makeComparison({ target: 1000000, actual: 500000 })];
    const totals = calculateBudgetTotals(comparisons);
    expect(totals.overallPercentage).toBe(50);
  });

  it("handles zero target without NaN", () => {
    const comparisons = [makeComparison({ target: 0, actual: 0 })];
    const totals = calculateBudgetTotals(comparisons);
    expect(totals.overallPercentage).toBe(0);
    expect(Number.isNaN(totals.overallPercentage)).toBe(false);
  });

  it("counts category statuses correctly", () => {
    const comparisons = [
      makeComparison({ categoryId: "c1", status: "over" }),
      makeComparison({ categoryId: "c2", status: "over" }),
      makeComparison({ categoryId: "c3", status: "near" }),
      makeComparison({ categoryId: "c4", status: "under" }),
      makeComparison({ categoryId: "c5", status: "under" }),
      makeComparison({ categoryId: "c6", status: "under" }),
    ];
    const totals = calculateBudgetTotals(comparisons);
    expect(totals.categoriesOverBudget).toBe(2);
    expect(totals.categoriesNearBudget).toBe(1);
    expect(totals.categoriesUnderBudget).toBe(3);
  });

  it("returns zeros for empty comparisons array", () => {
    const totals = calculateBudgetTotals([]);
    expect(totals.totalTarget).toBe(0);
    expect(totals.totalActual).toBe(0);
    expect(totals.totalRemaining).toBe(0);
    expect(totals.overallPercentage).toBe(0);
    expect(totals.categoriesOverBudget).toBe(0);
    expect(totals.categoriesNearBudget).toBe(0);
    expect(totals.categoriesUnderBudget).toBe(0);
  });

  it("handles single category", () => {
    const comparisons = [
      makeComparison({
        target: 1000000,
        actual: 850000,
        status: "near",
      }),
    ];
    const totals = calculateBudgetTotals(comparisons);
    expect(totals.totalTarget).toBe(1000000);
    expect(totals.totalActual).toBe(850000);
    expect(totals.totalRemaining).toBe(150000);
    expect(totals.overallPercentage).toBe(85);
    expect(totals.categoriesNearBudget).toBe(1);
  });
});
