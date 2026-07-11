/**
 * Tests for the analytics filter bottom sheet (review R8): on narrow layouts
 * the inline FilterPanel is hidden and this controlled Sheet is the filter
 * entry point. It must render the SAME FilterPanel (not a fork), seed its
 * drafts from the currently APPLIED filters (so reopening never shows stale
 * defaults), forward applied filters, and dismiss itself on apply/clear.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { AnalyticsFilterSheet } from "./AnalyticsFilterSheet";
import type { AnalyticsFilterValues } from "./FilterPanel";

const accounts = [{ id: "acc-1", name: "BDO Checking" }];
const categories = [{ id: "cat-1", name: "Groceries" }];

const defaultApplied: AnalyticsFilterValues = {
  startDate: new Date(2026, 0, 1),
  endDate: new Date(2026, 5, 30),
  accountId: undefined,
  categoryId: undefined,
  type: undefined,
};

/**
 * Mirrors the real route wiring (routes/analytics/index.tsx): applied filter
 * state lives in the owner, the sheet seeds FilterPanel from it, and
 * onFilterChange REPLACES the applied state.
 */
function ControlledSheet({
  initialApplied = defaultApplied,
  onFilterChange,
}: {
  initialApplied?: AnalyticsFilterValues;
  onFilterChange?: (f: AnalyticsFilterValues) => void;
}) {
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState<AnalyticsFilterValues>(initialApplied);
  return (
    <AnalyticsFilterSheet
      open={open}
      onOpenChange={setOpen}
      onFilterChange={(f) => {
        setApplied(f);
        onFilterChange?.(f);
      }}
      initialValues={applied}
      accounts={accounts}
      categories={categories}
    />
  );
}

describe("AnalyticsFilterSheet", () => {
  it("renders a Filters trigger and opens the shared FilterPanel", async () => {
    render(<ControlledSheet />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));

    const sheet = await screen.findByRole("dialog");
    // FilterPanel's own controls prove the same component is mounted
    expect(sheet).toHaveTextContent("Start Date");
    expect(sheet).toHaveTextContent("End Date");
    expect(screen.getByRole("button", { name: "Apply Filters" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
  });

  it("forwards applied filters and closes the sheet on apply", async () => {
    const onFilterChange = vi.fn();
    render(<ControlledSheet onFilterChange={onFilterChange} />);

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply Filters" }));

    expect(onFilterChange).toHaveBeenCalledTimes(1);
    const applied = onFilterChange.mock.calls[0][0] as AnalyticsFilterValues;
    expect(applied.startDate).toBeInstanceOf(Date);
    expect(applied.endDate).toBeInstanceOf(Date);
    // Default state applies no entity filters
    expect(applied.accountId).toBeUndefined();
    expect(applied.categoryId).toBeUndefined();
    expect(applied.type).toBeUndefined();

    // Applying dismisses the sheet so the updated dashboard is visible
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("forwards the reset range and closes the sheet on clear", async () => {
    const onFilterChange = vi.fn();
    render(<ControlledSheet onFilterChange={onFilterChange} />);

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    fireEvent.click(await screen.findByRole("button", { name: /clear/i }));

    expect(onFilterChange).toHaveBeenCalledTimes(1);
    const cleared = onFilterChange.mock.calls[0][0] as AnalyticsFilterValues;
    expect(cleared.startDate).toBeInstanceOf(Date);
    expect(cleared.endDate).toBeInstanceOf(Date);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("seeds the panel from currently applied filters on every open (reopen shows reality, not defaults)", async () => {
    render(
      <ControlledSheet
        initialApplied={{
          ...defaultApplied,
          startDate: new Date(2026, 0, 15),
          accountId: "acc-1",
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    let sheet = await screen.findByRole("dialog");
    // Date trigger reflects the APPLIED start date, not the default range
    expect(sheet).toHaveTextContent("Jan 15, 2026");

    // Close via apply, then reopen — still seeded from applied state
    fireEvent.click(screen.getByRole("button", { name: "Apply Filters" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    sheet = await screen.findByRole("dialog");
    expect(sheet).toHaveTextContent("Jan 15, 2026");
  });

  it("re-applying without touching a field keeps previously applied filters (no silent wipe)", async () => {
    const onFilterChange = vi.fn();
    render(
      <ControlledSheet
        initialApplied={{ ...defaultApplied, accountId: "acc-1", type: "expense" }}
        onFilterChange={onFilterChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply Filters" }));

    // The original R8 bug: this emitted accountId/type: undefined, wiping them
    const applied = onFilterChange.mock.calls[0][0] as AnalyticsFilterValues;
    expect(applied.accountId).toBe("acc-1");
    expect(applied.type).toBe("expense");
    expect(applied.startDate).toEqual(defaultApplied.startDate);
    expect(applied.endDate).toEqual(defaultApplied.endDate);
  });
});
