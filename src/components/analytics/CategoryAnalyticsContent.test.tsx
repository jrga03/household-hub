/**
 * Tests for CategoryAnalyticsContent: the loading state must announce itself
 * via the shared labeled LoadingSpinner (review R41 pattern, applied in the
 * analytics sweep) instead of an unlabeled raw animate-spin div.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CategoryAnalyticsContent } from "./CategoryAnalyticsContent";
import { useCategoryTotalsComparison } from "@/lib/supabaseQueries";
import type { CategoryTotalGroup } from "@/lib/supabaseQueries";

vi.mock("@/lib/supabaseQueries", () => ({
  useCategoryTotalsComparison: vi.fn(),
}));

const mockedComparison = vi.mocked(useCategoryTotalsComparison);

type ComparisonResult = ReturnType<typeof useCategoryTotalsComparison>;

function comparisonState(state: {
  isLoading: boolean;
  currentData?: CategoryTotalGroup[];
  previousData?: CategoryTotalGroup[];
  isError?: boolean;
}): ComparisonResult {
  const side = (data?: CategoryTotalGroup[]) => ({
    data,
    isError: state.isError ?? false,
    error: state.isError ? new Error("boom") : null,
  });
  return {
    current: side(state.currentData),
    previous: side(state.previousData),
    isLoading: state.isLoading,
  } as unknown as ComparisonResult;
}

beforeEach(() => {
  mockedComparison.mockReset();
});

describe("CategoryAnalyticsContent", () => {
  it("shows a labeled status spinner while loading", () => {
    mockedComparison.mockReturnValue(comparisonState({ isLoading: true }));

    render(<CategoryAnalyticsContent />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading category analytics");
  });

  it("renders the total spending once loaded", () => {
    const group: CategoryTotalGroup = {
      parentId: "cat-1",
      parentName: "Food",
      parentColor: "#ff0000",
      totalExpenseCents: 150050,
      children: [],
    };
    mockedComparison.mockReturnValue(
      comparisonState({ isLoading: false, currentData: [group], previousData: [] })
    );

    render(<CategoryAnalyticsContent />);

    expect(screen.getByText("Total Spending")).toBeInTheDocument();
    // Renders in the summary card AND the category group card
    expect(screen.getAllByText("₱1,500.50").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the error state when either month fails", () => {
    mockedComparison.mockReturnValue(comparisonState({ isLoading: false, isError: true }));

    render(<CategoryAnalyticsContent />);

    expect(screen.getByText("Failed to load category data")).toBeInTheDocument();
  });
});
