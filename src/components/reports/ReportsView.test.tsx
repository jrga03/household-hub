import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { PageShell } from "@/components/layout/PageShell";
import type { CategoryList, CategoryRow, GroupRow } from "@/lib/categories/projection";
import { parsePHP } from "@/lib/currency";
import type { SpendingGrid, SpendingGrids } from "@/lib/reports/spending";
import type { ReportsSearch } from "@/lib/reports/search";
import { HOUSEHOLD } from "@/test/events";
import { ReportsView } from "./ReportsView";

const owned = { householdId: HOUSEHOLD, visibility: "household", ownerUserId: null } as const;
const group = (id: string, name: string): GroupRow => ({ ...owned, id, name, retired: false });
const category = (id: string, name: string, groupId: string): CategoryRow => ({
  ...owned,
  id,
  name,
  groupId,
  retired: false,
});

const FOOD = group("food", "Food");
const HOME = group("home", "Home");
const CATEGORIES: CategoryList = {
  groups: [
    {
      ...FOOD,
      categories: [
        category("groceries", "Groceries", "food"),
        category("dining", "Dining", "food"),
      ],
    },
    { ...HOME, categories: [category("power", "Electricity", "home")] },
  ],
  ungrouped: [],
  retiredGroups: [],
  retiredCategories: [],
};

/** Spending by month, then category; a pair is `[spent, spentToDay]`. */
function grid(months: Record<string, Record<string, string | [string, string]>>): SpendingGrid {
  return new Map(
    Object.entries(months).map(([month, cells]) => [
      month,
      new Map(
        Object.entries(cells).map(([categoryId, amount]) => {
          const [spent, toDay] = Array.isArray(amount) ? amount : [amount, amount];
          return [categoryId, { spent: parsePHP(spent), spentToDay: parsePHP(toDay) }];
        })
      ),
    ])
  );
}

const EMPTY = grid({});

function renderReports({
  grids,
  today = "2026-11-15",
  search: initial = {},
}: {
  grids: SpendingGrids;
  today?: string;
  search?: ReportsSearch;
}) {
  function Harness() {
    const [search, setSearch] = useState(initial);
    return (
      <PageShell variant="list-detail">
        <ReportsView
          grids={grids}
          categories={CATEGORIES}
          search={search}
          today={today}
          onSearchChange={(patch) => setSearch((previous) => ({ ...previous, ...patch }))}
        />
      </PageShell>
    );
  }
  return render(<Harness />);
}

const rowNames = () =>
  within(screen.getByRole("list", { name: "Categories" }))
    .getAllByRole("listitem")
    .map((item) => within(item).getByRole("button").textContent);

describe("ReportsView", () => {
  afterEach(() => localStorage.clear());

  it("ranks the period's categories by Spending under the period's total", () => {
    renderReports({
      grids: {
        household: grid({
          "2026-10": { groceries: "9000" },
          "2026-11": { groceries: "3000", dining: "4500", power: "2000" },
        }),
        mine: EMPTY,
      },
    });

    expect(rowNames().map((name) => name?.match(/^(Dining|Groceries|Electricity)/)?.[0])).toEqual([
      "Dining",
      "Groceries",
      "Electricity",
    ]);
    const hero = screen.getByRole("region", { name: "Spending, Nov 2026" });
    expect(hero).toHaveTextContent("₱9,500.00");
  });

  it("shows the change only once the previous period starts on or after go-live", () => {
    const grids = {
      household: grid({
        "2026-10": { groceries: "1000" },
        "2026-11": { groceries: ["4000", "2000"] },
        "2026-12": { groceries: "3000" },
      }),
      mine: EMPTY,
    };
    const { unmount } = renderReports({ grids, today: "2026-11-15" });
    expect(screen.getByRole("list", { name: "Categories" })).not.toHaveTextContent("%");
    unmount();

    // November is cut at the 10th, as December is only that far in.
    renderReports({ grids, today: "2026-12-10" });
    expect(screen.getByRole("list", { name: "Categories" })).toHaveTextContent(
      "up 50% on the previous period"
    );
  });

  it("shows the monthly average over the period's months, but not for Month", () => {
    const grids = {
      household: grid({
        "2026-10": { groceries: "900" },
        "2026-11": { groceries: "2100" },
        "2026-12": { groceries: "3000" },
      }),
      mine: EMPTY,
    };
    renderReports({ grids, today: "2026-12-10" });
    expect(screen.queryByText(/a month on average/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "3 months" }));
    const hero = screen.getByRole("region", { name: "Spending, Oct – Dec 2026" });
    expect(hero).toHaveTextContent("₱6,000.00");
    expect(hero).toHaveTextContent("₱2,000.00 a month on average");
  });

  it("narrows the list to a group with its chip", () => {
    renderReports({
      grids: {
        household: grid({ "2026-11": { groceries: "3000", power: "2000" } }),
        mine: EMPTY,
      },
    });
    const home = screen.getByRole("button", { name: "Home", pressed: false });

    fireEvent.click(home);
    expect(rowNames()).toEqual([expect.stringMatching(/^Electricity/)]);
    fireEvent.click(home);
    expect(rowNames()).toHaveLength(2);
  });

  it("waits for a second month with spending before drawing sparklines", () => {
    const { unmount } = renderReports({
      grids: { household: grid({ "2026-11": { groceries: "3000" } }), mine: EMPTY },
    });
    expect(screen.getByText("Trends show once a second month has spending.")).toBeInTheDocument();
    expect(screen.queryByTestId("sparkline")).not.toBeInTheDocument();
    unmount();

    renderReports({
      grids: {
        household: grid({ "2026-10": { groceries: "1000" }, "2026-11": { groceries: "3000" } }),
        mine: EMPTY,
      },
    });
    expect(screen.queryByText(/Trends show/)).not.toBeInTheDocument();
    expect(screen.getByTestId("sparkline")).toBeInTheDocument();
  });

  it("switches between Household and Mine, and remembers the choice", () => {
    renderReports({
      grids: {
        household: grid({ "2026-11": { groceries: "3000" } }),
        mine: grid({ "2026-11": { dining: "700" } }),
      },
    });
    expect(rowNames()).toEqual([expect.stringMatching(/^Groceries/)]);

    fireEvent.click(screen.getByRole("radio", { name: "Mine" }));
    expect(rowNames()).toEqual([expect.stringMatching(/^Dining/)]);
    expect(screen.getByRole("region", { name: "Spending, Nov 2026" })).toHaveTextContent("₱700.00");
    expect(localStorage.getItem("household-hub-finances-view")).toBe("mine");
  });

  it("marks the row a tap opens", () => {
    renderReports({
      grids: { household: grid({ "2026-11": { groceries: "3000" } }), mine: EMPTY },
    });
    const groceries = screen.getByRole("button", { name: /^Groceries/ });

    fireEvent.click(groceries);
    expect(groceries).toHaveAttribute("aria-current", "true");
  });
});
