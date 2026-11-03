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
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { readCategoryList } from "@/lib/categories/projection";
import { createAccount } from "@/lib/commands/accounts";
import { addAllocation } from "@/lib/commands/allocations";
import {
  createCategory,
  createGroup,
  retireCategory,
  retireGroup,
} from "@/lib/commands/categories";
import { addTransaction } from "@/lib/commands/transactions";
import { UNASSIGNED_ENVELOPE } from "@/lib/allocations/events";
import { parsePHP } from "@/lib/currency";
import { CategoriesView } from "./CategoriesView";

/** Money shows an amount and speaks it in a second, screen-reader-only span. */
const SHOWN_AND_SPOKEN = 2;

const MEMBER = { householdId: "11111111-1111-4111-8111-111111111111", userId: "user-a" };

class FakeResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    const entry = { target, contentRect: { width: 393 } } as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

const originalResizeObserver = globalThis.ResizeObserver;
beforeEach(async () => {
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  await resetLocalDatabase();
});
afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
});

function renderCategories() {
  const rootRoute = createRootRoute();
  const categoriesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/categories",
    validateSearch: readOpenItem,
    component: () => (
      <PageShell variant="list-detail">
        <CategoriesView actor={MEMBER} />
      </PageShell>
    ),
  });
  const linkedRoutes = ["/transactions", "/accounts"].map((path) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => null })
  );
  const history = createMemoryHistory({ initialEntries: ["/categories"] });
  const router = createRouter({
    routeTree: rootRoute.addChildren([categoriesRoute, ...linkedRoutes]),
    history,
  });
  render(<RouterProvider router={router} />);
  return history;
}

async function foodWithGroceries() {
  const food = await createGroup(MEMBER, { name: "Food" });
  const groceries = await createCategory(MEMBER, { name: "Groceries", groupId: food.id });
  return { food, groceries };
}

async function account(name: string, startingBalance: string) {
  return createAccount(MEMBER, {
    name,
    type: "bank",
    startingBalanceCents: parsePHP(startingBalance),
  });
}

async function assign(accountId: string, categoryId: string, amount: string) {
  await addAllocation(MEMBER, {
    date: "2026-10-01",
    accountId,
    from: UNASSIGNED_ENVELOPE,
    to: { kind: "category", id: categoryId },
    amountCents: parsePHP(amount),
  });
}

async function spend(accountId: string, categoryId: string, amount: string) {
  await addTransaction(MEMBER, {
    date: "2026-10-02",
    type: "expense",
    amountCents: parsePHP(amount),
    accountId,
    categoryId,
    description: "Spent",
  });
}

describe("CategoriesView", () => {
  it("shows each group as a section headed by its name, with its categories and their money as rows", async () => {
    const { groceries } = await foodWithGroceries();
    for (const [name, amount] of [
      ["BDO Savings", "800"],
      ["GCash", "200"],
    ] as const) {
      const holding = await account(name, amount);
      await assign(holding.id, groceries.id, amount);
    }
    renderCategories();

    const food = await screen.findByRole("region", { name: "Food" });
    expect(within(food).getByRole("heading", { name: "Food" })).toBeInTheDocument();
    const categories = within(food).getByRole("list", { name: "Food categories" });
    expect(
      within(categories).getByRole("button", { name: /^Groceries\s*₱1,000\.00$/ })
    ).toBeInTheDocument();
    expect(within(food).getByRole("button", { name: "Open group Food" })).toBeInTheDocument();
  });

  it("opens a category's money in each account, a negative line included", async () => {
    const { groceries } = await foodWithGroceries();
    const cash = await account("Cash", "2000");
    const bank = await account("Bank", "0");
    await assign(cash.id, groceries.id, "2000");
    await spend(bank.id, groceries.id, "500");
    const history = renderCategories();

    fireEvent.click(await screen.findByRole("button", { name: /^Groceries/ }));
    await waitFor(() => expect(history.location.search).toBe(`?open=${groceries.id}`));
    const pane = await screen.findByRole("dialog", { name: "Groceries" });
    expect(within(pane).getAllByText("₱1,500.00")).toHaveLength(SHOWN_AND_SPOKEN);
    expect(within(pane).getByRole("link", { name: "Cash" })).toHaveAttribute(
      "href",
      `/accounts?open=${cash.id}`
    );
    expect(within(pane).getByRole("link", { name: "Bank" })).toBeInTheDocument();
    expect(within(pane).getAllByText("₱2,000.00")).toHaveLength(SHOWN_AND_SPOKEN);
    expect(within(pane).getByText("minus ₱500.00").parentElement).toHaveClass("text-shortfall");
    expect(within(pane).getByRole("link", { name: "View transactions" })).toHaveAttribute(
      "href",
      `/transactions?category=${groceries.id}`
    );
  });

  it("says a category with no money is not in any account", async () => {
    await foodWithGroceries();
    renderCategories();

    fireEvent.click(await screen.findByRole("button", { name: /^Groceries/ }));
    const pane = await screen.findByRole("dialog", { name: "Groceries" });
    expect(within(pane).getByText("Not in any account")).toBeInTheDocument();
  });

  it("renames a category from its pane's Edit", async () => {
    const { groceries } = await foodWithGroceries();
    renderCategories();

    fireEvent.click(await screen.findByRole("button", { name: /^Groceries/ }));
    const pane = await screen.findByRole("dialog", { name: "Groceries" });
    fireEvent.click(within(pane).getByRole("button", { name: "Edit" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit category" });
    const name = within(sheet).getByRole("textbox", { name: "Name" });
    fireEvent.change(name, { target: { value: "Market" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const list = await readCategoryList();
      expect(list.groups[0]?.categories.find((row) => row.id === groceries.id)?.name).toBe(
        "Market"
      );
    });
    await waitFor(() => expect(sheet).not.toBeInTheDocument());
  });

  it("opens a group's money in each account, the sum of its categories, and edits it", async () => {
    const { food, groceries } = await foodWithGroceries();
    const dining = await createCategory(MEMBER, { name: "Dining", groupId: food.id });
    const bank = await account("Bank", "1000");
    const cash = await account("Cash", "300");
    await assign(bank.id, groceries.id, "600");
    await assign(bank.id, dining.id, "150");
    await assign(cash.id, dining.id, "300");
    renderCategories();

    fireEvent.click(await screen.findByRole("button", { name: "Open group Food" }));
    const pane = await screen.findByRole("dialog", { name: "Food" });
    expect(within(pane).getAllByText("₱1,050.00")).toHaveLength(SHOWN_AND_SPOKEN);
    expect(within(pane).getByRole("link", { name: "Bank" })).toBeInTheDocument();
    expect(within(pane).getAllByText("₱750.00")).toHaveLength(SHOWN_AND_SPOKEN);
    expect(within(pane).getAllByText("₱300.00")).toHaveLength(SHOWN_AND_SPOKEN);
    expect(within(pane).queryByRole("link", { name: "View transactions" })).toBeNull();

    fireEvent.click(within(pane).getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("dialog", { name: "Edit group" })).toBeInTheDocument();
  });

  it("opens a retired category with its money and View transactions, but no Edit", async () => {
    const { groceries } = await foodWithGroceries();
    await retireCategory(MEMBER, groceries.id);
    renderCategories();

    fireEvent.click(await screen.findByRole("button", { name: "Show retired (1)" }));
    fireEvent.click(screen.getByRole("button", { name: /^Groceries/ }));
    const pane = await screen.findByRole("dialog", { name: "Groceries" });
    expect(within(pane).getByText("Retired")).toBeInTheDocument();
    expect(within(pane).getByRole("link", { name: "View transactions" })).toBeInTheDocument();
    expect(within(pane).queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("opens a retired group from its Retired row, leaving Unretire and Delete in the row", async () => {
    const savings = await createGroup(MEMBER, { name: "Savings" });
    await retireGroup(MEMBER, savings.id);
    renderCategories();

    fireEvent.click(await screen.findByRole("button", { name: "Show retired (1)" }));
    fireEvent.click(screen.getByRole("button", { name: /^Savings/ }));
    const pane = await screen.findByRole("dialog", { name: "Savings" });
    expect(within(pane).getByText("Not in any account")).toBeInTheDocument();
    expect(within(pane).getByText("Retired")).toBeInTheDocument();
    expect(within(pane).queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("asks for a group next to the Group field when a category is added without one", async () => {
    await foodWithGroceries();
    renderCategories();

    const form = await screen.findByRole("form", { name: "Add a category" });
    fireEvent.change(within(form).getByRole("textbox", { name: "Name" }), {
      target: { value: "Snacks" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "Add category" }));

    const group = await within(form).findByRole("combobox", { name: "Group" });
    await waitFor(() => expect(group).toHaveAttribute("aria-invalid", "true"));
    expect(group).toHaveAccessibleDescription("Choose a group.");
  });

  it("deletes a retired category with one press, without asking first", async () => {
    const { groceries } = await foodWithGroceries();
    await retireCategory(MEMBER, groceries.id);
    renderCategories();

    fireEvent.click(await screen.findByRole("button", { name: "Show retired (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Groceries" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Show retired/ })).not.toBeInTheDocument()
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
