import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { readOpenItem } from "@/components/layout/DetailPane";
import { PageShell } from "@/components/layout/PageShell";
import type { CategoryList, CategoryRow, GroupRow } from "@/lib/categories/projection";
import { readCategoryList } from "@/lib/categories/projection";
import { createAccount } from "@/lib/commands/accounts";
import { setBudget } from "@/lib/commands/budgets";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { addTransaction } from "@/lib/commands/transactions";
import { parsePHP } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import type { SpendingGrid, SpendingGrids } from "@/lib/reports/spending";
import { readReportsSearch } from "@/lib/reports/search";
import { HOUSEHOLD } from "@/test/events";
import { ReportsView } from "./ReportsView";

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };
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

let router: ReturnType<typeof createReportsRouter>;

function createReportsRouter(
  grids: SpendingGrids,
  categories: CategoryList,
  today: string,
  initialEntry: string
) {
  const rootRoute = createRootRoute();
  const reportsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/reports",
    validateSearch: (search: Record<string, unknown>) => ({
      ...readReportsSearch(search),
      ...readOpenItem(search),
    }),
    component: function Reports() {
      const search = reportsRoute.useSearch();
      const navigate = reportsRoute.useNavigate();
      return (
        <PageShell variant="list-detail">
          <ReportsView
            grids={grids}
            categories={categories}
            search={search}
            today={today}
            userId={MEMBER.userId}
            onSearchChange={(patch) =>
              void navigate({
                search: (previous) => ({ ...previous, ...patch }),
                resetScroll: false,
              })
            }
          />
        </PageShell>
      );
    },
  });
  const transactionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/transactions",
    component: () => null,
  });
  return createRouter({
    routeTree: rootRoute.addChildren([reportsRoute, transactionsRoute]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
}

async function renderReports({
  grids,
  categories = CATEGORIES,
  today = "2026-11-15",
  url = "/reports",
}: {
  grids: SpendingGrids;
  categories?: CategoryList;
  today?: string;
  url?: string;
}) {
  router = createReportsRouter(grids, categories, today, url);
  const result = render(<RouterProvider router={router} />);
  await screen.findByRole("radiogroup", { name: "Period" });
  return result;
}

const rowNames = () =>
  within(screen.getByRole("list", { name: "Categories" }))
    .getAllByRole("listitem")
    .map((item) => within(item).getByRole("button").textContent);

describe("ReportsView", () => {
  afterEach(() => localStorage.clear());

  it("ranks the period's categories by Spending under the period's total", async () => {
    await renderReports({
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

  it("shows the change only once the previous period starts on or after go-live", async () => {
    const grids = {
      household: grid({
        "2026-10": { groceries: "1000" },
        "2026-11": { groceries: ["4000", "2000"] },
        "2026-12": { groceries: "3000" },
      }),
      mine: EMPTY,
    };
    const { unmount } = await renderReports({ grids, today: "2026-11-15" });
    expect(screen.getByRole("list", { name: "Categories" })).not.toHaveTextContent("%");
    unmount();

    // November is cut at the 10th, as December is only that far in.
    await renderReports({ grids, today: "2026-12-10" });
    expect(screen.getByRole("list", { name: "Categories" })).toHaveTextContent(
      "up 50% on the previous period"
    );
  });

  it("shows the monthly average over the period's months, but not for Month", async () => {
    const grids = {
      household: grid({
        "2026-10": { groceries: "900" },
        "2026-11": { groceries: "2100" },
        "2026-12": { groceries: "3000" },
      }),
      mine: EMPTY,
    };
    await renderReports({ grids, today: "2026-12-10" });
    expect(screen.queryByText(/a month on average/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "3 months" }));
    const hero = await screen.findByRole("region", { name: "Spending, Oct – Dec 2026" });
    expect(hero).toHaveTextContent("₱6,000.00");
    expect(hero).toHaveTextContent("₱2,000.00 a month on average");
  });

  it("narrows the list to a group with its chip", async () => {
    await renderReports({
      grids: {
        household: grid({ "2026-11": { groceries: "3000", power: "2000" } }),
        mine: EMPTY,
      },
    });
    const home = screen.getByRole("button", { name: "Home", pressed: false });

    fireEvent.click(home);
    await waitFor(() => expect(rowNames()).toEqual([expect.stringMatching(/^Electricity/)]));
    fireEvent.click(home);
    await waitFor(() => expect(rowNames()).toHaveLength(2));
  });

  it("waits for a second month with spending before drawing sparklines", async () => {
    const { unmount } = await renderReports({
      grids: { household: grid({ "2026-11": { groceries: "3000" } }), mine: EMPTY },
    });
    expect(screen.getByText("Trends show once a second month has spending.")).toBeInTheDocument();
    expect(screen.queryByTestId("sparkline")).not.toBeInTheDocument();
    unmount();

    await renderReports({
      grids: {
        household: grid({ "2026-10": { groceries: "1000" }, "2026-11": { groceries: "3000" } }),
        mine: EMPTY,
      },
    });
    expect(screen.queryByText(/Trends show/)).not.toBeInTheDocument();
    expect(screen.getByTestId("sparkline")).toBeInTheDocument();
  });

  it("switches between Household and Mine, and remembers the choice", async () => {
    await renderReports({
      grids: {
        household: grid({ "2026-11": { groceries: "3000" } }),
        mine: grid({ "2026-11": { dining: "700" } }),
      },
    });
    expect(rowNames()).toEqual([expect.stringMatching(/^Groceries/)]);

    fireEvent.click(screen.getByRole("radio", { name: "Mine" }));
    await waitFor(() => expect(rowNames()).toEqual([expect.stringMatching(/^Dining/)]));
    expect(screen.getByRole("region", { name: "Spending, Nov 2026" })).toHaveTextContent("₱700.00");
    expect(localStorage.getItem("household-hub-finances-view")).toBe("mine");
  });

  it("marks the row a tap opens", async () => {
    await renderReports({
      grids: { household: grid({ "2026-11": { groceries: "3000" } }), mine: EMPTY },
    });
    const groceries = screen.getByRole("button", { name: /^Groceries/ });

    fireEvent.click(groceries);
    await waitFor(() => expect(groceries).toHaveAttribute("aria-current", "true"));
  });

  describe("the category pane", () => {
    let shellWidth = 1000;
    class FakeResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        const entry = { target, contentRect: { width: shellWidth } } as ResizeObserverEntry;
        this.callback([entry], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    }
    const originalResizeObserver = globalThis.ResizeObserver;
    beforeEach(async () => {
      shellWidth = 1000;
      globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
      await resetLocalDatabase();
    });
    afterEach(() => {
      globalThis.ResizeObserver = originalResizeObserver;
    });

    const pane = () => screen.findByRole("region", { name: "Groceries" });

    /** Each month bar's name and color role, oldest first. */
    const bars = (region: HTMLElement) =>
      within(within(region).getByRole("figure"))
        .getAllByRole("link")
        .map((link) => [
          link.getAttribute("aria-label"),
          link
            .querySelector("[class*=bg-]")
            ?.className.match(/bg-(chart-muted|chart|primary)/)?.[1],
        ]);

    it("draws the end month primary, the period chart and earlier months muted", async () => {
      await renderReports({
        grids: {
          household: grid({
            "2026-10": { groceries: "1000" },
            "2026-11": { groceries: "3000" },
            "2026-12": { groceries: "2000" },
            "2027-01": { groceries: "500" },
          }),
          mine: EMPTY,
        },
        today: "2027-01-10",
        url: "/reports?period=3m&open=groceries",
      });
      const region = await pane();

      expect(region).toHaveTextContent("Spending, Nov 2026 – Jan 2027₱5,500.00");
      // Months before October 2026 have no data, so the 12 months show only four.
      expect(bars(region)).toEqual([
        ["October 2026: ₱1,000.00 spent", "chart-muted"],
        ["November 2026: ₱3,000.00 spent", "chart"],
        ["December 2026: ₱2,000.00 spent", "chart"],
        ["January 2027: ₱500.00 spent", "primary"],
      ]);
      expect(within(region).getByRole("link", { name: /^January 2027/ })).toHaveAttribute(
        "aria-current",
        "true"
      );
    });

    it("waits for a second month with spending before drawing the bars", async () => {
      await renderReports({
        grids: { household: grid({ "2026-11": { groceries: "3000" } }), mine: EMPTY },
        url: "/reports?open=groceries",
      });
      const region = await pane();

      expect(region).toHaveTextContent("Months show once a second month has spending.");
      expect(within(region).queryByRole("figure")).not.toBeInTheDocument();
    });

    /** Groceries in the local database, with an account to fund its budget. */
    async function seedGroceries() {
      const group = await createGroup(MEMBER, { name: "Food" });
      const { id } = await createCategory(MEMBER, { name: "Groceries", groupId: group.id });
      const account = await createAccount(MEMBER, {
        name: "BPI",
        type: "bank",
        startingBalanceCents: parsePHP("40000"),
      });
      return { categoryId: id, accountId: account.id, categories: await readCategoryList() };
    }

    it("shows the budget in force in the end month, and how far over it the month is", async () => {
      const { categoryId, accountId, categories } = await seedGroceries();
      await setBudget(MEMBER, {
        categoryId,
        fromMonth: "2026-10",
        amountCents: parsePHP("2500"),
        accountId,
      });
      await renderReports({
        grids: {
          household: grid({
            "2026-10": { [categoryId]: "1000" },
            "2026-11": { [categoryId]: "3000" },
          }),
          mine: EMPTY,
        },
        categories,
        url: `/reports?open=${categoryId}`,
      });

      const region = await pane();
      expect(region).toHaveTextContent("Budget, Nov 2026₱2,500.00");
      expect(region.querySelector(".text-shortfall")).toHaveTextContent(/^₱500\.00.*over$/);
    });

    it("shows no budget when the end month has none", async () => {
      const { categoryId, accountId, categories } = await seedGroceries();
      await setBudget(MEMBER, {
        categoryId,
        fromMonth: "2026-12",
        amountCents: parsePHP("2500"),
        accountId,
      });
      await renderReports({
        grids: { household: grid({ "2026-11": { [categoryId]: "3000" } }), mine: EMPTY },
        categories,
        url: `/reports?open=${categoryId}`,
      });

      expect(await pane()).toHaveTextContent("Budget, Nov 2026No budget");
    });

    it("links each month, the period and each of the period's transactions to Transactions", async () => {
      const { categoryId, accountId, categories } = await seedGroceries();
      const spend = (date: string, description: string) =>
        addTransaction(MEMBER, {
          date,
          type: "expense",
          amountCents: parsePHP("100"),
          accountId,
          categoryId,
          description,
        });
      await spend("2026-10-31", "Before the period");
      const market = await spend("2026-11-03", "Market");
      await renderReports({
        grids: {
          household: grid({
            "2026-10": { [categoryId]: "100" },
            "2026-11": { [categoryId]: "100" },
          }),
          mine: EMPTY,
        },
        categories,
        url: `/reports?open=${categoryId}`,
      });
      const region = await pane();

      expect(within(region).getByRole("link", { name: /^November 2026/ })).toHaveAttribute(
        "href",
        `/transactions?month=2026-11&category=${categoryId}&visibility=household`
      );
      expect(within(region).getByRole("link", { name: "Open in Transactions" })).toHaveAttribute(
        "href",
        `/transactions?from=2026-11&to=2026-11&category=${categoryId}&visibility=household`
      );
      const list = await within(region).findByRole("list", { name: "Groceries in Nov 2026" });
      const rows = within(list).getAllByRole("link");
      expect(rows.map((row) => row.textContent)).toEqual([expect.stringMatching(/^Market/)]);
      expect(rows[0]).toHaveAttribute("href", `/transactions?open=${market.id}`);
    });
  });
});
