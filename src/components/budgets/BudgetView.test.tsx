import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { createAccount } from "@/lib/commands/accounts";
import { addAllocation } from "@/lib/commands/allocations";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { addTransaction } from "@/lib/commands/transactions";
import { UNASSIGNED_ENVELOPE } from "@/lib/allocations/events";
import { parsePHP } from "@/lib/currency";
import { BudgetView } from "./BudgetView";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };
const MONTH = "2026-10";

// The ledger pane measures itself with ResizeObserver, which jsdom lacks.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof globalThis.ResizeObserver;

function renderBudget() {
  const rootRoute = createRootRoute();
  const routes = ["/budget", "/categories"].map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => <BudgetView actor={MEMBER} month={MONTH} currentMonth={MONTH} />,
    })
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ["/budget"] }),
  });
  return render(<RouterProvider router={router} />);
}

/** BPI holds ₱8,000 in Groceries and ₱1,000 in Restaurants, under Food. */
async function foodThisMonth() {
  const bpi = await createAccount(MEMBER, {
    name: "BPI",
    type: "bank",
    startingBalanceCents: parsePHP("20000"),
  });
  const food = await createGroup(MEMBER, { name: "Food" });
  const groceries = await createCategory(MEMBER, { name: "Groceries", groupId: food.id });
  const restaurants = await createCategory(MEMBER, { name: "Restaurants", groupId: food.id });
  for (const [categoryId, amount] of [
    [groceries.id, "8000"],
    [restaurants.id, "1000"],
  ] as const) {
    await addAllocation(MEMBER, {
      date: `${MONTH}-01`,
      accountId: bpi.id,
      from: UNASSIGNED_ENVELOPE,
      to: { kind: "category", id: categoryId },
      amountCents: parsePHP(amount),
    });
  }
  const spend = (categoryId: string, amount: string) =>
    addTransaction(MEMBER, {
      date: `${MONTH}-05`,
      type: "expense",
      amountCents: parsePHP(amount),
      accountId: bpi.id,
      categoryId,
      description: "Spending",
    });
  return { groceries, restaurants, spend };
}

const figures = (name: string) => screen.findByLabelText(name);
/** The last figure is what's left. */
const left = async (name: string) =>
  within(await figures(`${name} allocated, spent and left`))
    .getAllByText(/₱/)
    .at(-1);

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("BudgetView", () => {
  it("shows each category's allocated, spent and left, and its group's totals, with no inputs", async () => {
    const { groceries, spend } = await foodThisMonth();
    await spend(groceries.id, "1200");
    renderBudget();

    expect(await figures("Groceries allocated, spent and left")).toHaveTextContent(
      "Allocated₱8,000.00Spent₱1,200.00Left₱6,800.00"
    );
    expect(await figures("Food allocated, spent and left")).toHaveTextContent(
      "Allocated₱9,000.00Spent₱1,200.00Left₱7,800.00"
    );
    expect(screen.getByRole("progressbar", { name: "Groceries spent" })).toHaveAttribute(
      "aria-valuenow",
      "15"
    );
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
  });

  it("shows an overspent category's left in red with a full red bar, and its group's total too", async () => {
    const { restaurants, spend } = await foodThisMonth();
    await spend(restaurants.id, "10500");
    renderBudget();

    expect(await left("Restaurants")).toHaveTextContent("-₱9,500.00");
    expect(await left("Restaurants")).toHaveClass("text-destructive");
    const bar = screen.getByRole("progressbar", { name: "Restaurants spent" });
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(bar).toHaveAttribute("data-overspent", "true");

    expect(await left("Food")).toHaveTextContent("-₱1,500.00");
    expect(await left("Food")).toHaveClass("text-destructive");
    expect(screen.getByRole("progressbar", { name: "Food spent" })).toHaveAttribute(
      "data-overspent",
      "true"
    );
    expect(await left("Groceries")).not.toHaveClass("text-destructive");
  });

  it("points to Categories when there are none", async () => {
    renderBudget();
    expect(await screen.findByRole("link", { name: "Categories" })).toHaveAttribute(
      "href",
      "/categories"
    );
  });
});
