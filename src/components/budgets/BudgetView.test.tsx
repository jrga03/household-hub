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
import { setBudget } from "@/lib/commands/budgets";
import {
  createCategory,
  createGroup,
  retireCategory,
  retireGroup,
} from "@/lib/commands/categories";
import { db } from "@/lib/dexie/db";
import { addTransaction } from "@/lib/commands/transactions";
import { readFinanceOverview } from "@/lib/finances/overview";
import { parsePHP } from "@/lib/currency";
import { BudgetView } from "./BudgetView";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };
const MONTH = "2026-10";

function renderBudget(month = MONTH) {
  const rootRoute = createRootRoute();
  const routes = ["/budget", "/categories"].map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => <BudgetView actor={MEMBER} month={month} currentMonth={MONTH} />,
    })
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ["/budget"] }),
  });
  return render(<RouterProvider router={router} />);
}

/** Under Food: Groceries with an ₱8,000 budget, Restaurants with ₱1,000, Delivery with none. */
async function foodThisMonth() {
  const bpi = await createAccount(MEMBER, {
    name: "BPI",
    type: "bank",
    startingBalanceCents: parsePHP("20000"),
  });
  const food = await createGroup(MEMBER, { name: "Food" });
  const groceries = await createCategory(MEMBER, { name: "Groceries", groupId: food.id });
  const restaurants = await createCategory(MEMBER, { name: "Restaurants", groupId: food.id });
  const delivery = await createCategory(MEMBER, { name: "Delivery", groupId: food.id });
  for (const [categoryId, amount] of [
    [groceries.id, "8000"],
    [restaurants.id, "1000"],
  ] as const) {
    await setBudget(MEMBER, {
      categoryId,
      fromMonth: MONTH,
      amountCents: parsePHP(amount),
      accountId: bpi.id,
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
  return { groceries, restaurants, delivery, spend };
}

const figures = (name: string) => screen.findByLabelText(`${name} budget, spent and left`);
/** The last figure is what's left. */
const left = async (name: string) =>
  within(await figures(name))
    .getAllByText(/₱/, { selector: "[aria-hidden=true]" })
    .at(-1)?.parentElement;

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("BudgetView", () => {
  it("shows each category's budget, spent and left, and its group's totals, with no inputs", async () => {
    const { groceries, spend } = await foodThisMonth();
    await spend(groceries.id, "1200");
    renderBudget();

    expect(await figures("Groceries")).toHaveTextContent(
      "Budget₱8,000.00Spent₱1,200.00Left₱6,800.00"
    );
    expect(await figures("Food")).toHaveTextContent("Budget₱9,000.00Spent₱1,200.00Left₱7,800.00");
    expect(screen.getByRole("progressbar", { name: "Groceries spent" })).toHaveAttribute(
      "aria-valuenow",
      "15"
    );
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
  });

  it("shows a category without a budget by its spending alone", async () => {
    const { delivery, spend } = await foodThisMonth();
    await spend(delivery.id, "300");
    renderBudget();

    expect(await figures("Delivery")).toHaveTextContent("BudgetNoneSpent₱300.00");
    expect(await figures("Delivery")).not.toHaveTextContent("Left");
    expect(screen.queryByRole("progressbar", { name: "Delivery spent" })).not.toBeInTheDocument();
    // The group's spending still counts it against the group's budgets.
    expect(await figures("Food")).toHaveTextContent("Budget₱9,000.00Spent₱300.00Left₱8,700.00");
  });

  it("shows an overspent category's left in red with a full red bar, and its group's total too", async () => {
    const { restaurants, groceries, spend } = await foodThisMonth();
    await spend(restaurants.id, "10500");
    await spend(groceries.id, "1200");
    renderBudget();

    expect(await left("Restaurants")).toHaveTextContent("−₱9,500.00");
    expect(await left("Restaurants")).toHaveClass("text-shortfall");
    const bar = screen.getByRole("progressbar", { name: "Restaurants spent" });
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(bar).toHaveAttribute("data-overspent", "true");

    expect(await left("Food")).toHaveTextContent("−₱2,700.00");
    expect(await left("Food")).toHaveClass("text-shortfall");
    expect(screen.getByRole("progressbar", { name: "Food spent" })).toHaveAttribute(
      "data-overspent",
      "true"
    );
    expect(await left("Groceries")).not.toHaveClass("text-shortfall");
    expect(screen.getByRole("progressbar", { name: "Groceries spent" })).not.toHaveAttribute(
      "data-overspent"
    );
  });

  it("marks overspent exactly the categories Home counts as over", async () => {
    const { restaurants, groceries, spend } = await foodThisMonth();
    await spend(restaurants.id, "1000.01");
    await spend(groceries.id, "8000");
    renderBudget();

    await screen.findByRole("progressbar", { name: "Groceries spent" });
    const overspent = ["Groceries", "Restaurants"].filter((name) =>
      screen.getByRole("progressbar", { name: `${name} spent` }).hasAttribute("data-overspent")
    );
    const { budgets } = await readFinanceOverview("household", MEMBER.userId, MONTH);
    expect(overspent).toEqual(["Restaurants"]);
    expect(budgets.over).toBe(overspent.length);
  });

  it("keeps a retired category's row and totals in a month it had spending, and drops it in one with none", async () => {
    const { delivery, groceries } = await foodThisMonth();
    const bpi = (await db.accounts.toArray())[0];
    if (!bpi) throw new Error("No account");
    await addTransaction(MEMBER, {
      date: "2026-09-12",
      type: "expense",
      amountCents: parsePHP("450"),
      accountId: bpi.id,
      categoryId: delivery.id,
      description: "Pizza",
    });
    await retireCategory(MEMBER, delivery.id, { toCategoryId: groceries.id, date: "2026-09-30" });

    const september = renderBudget("2026-09");
    expect(await figures("Delivery")).toHaveTextContent("BudgetNoneSpent₱450.00");
    expect(screen.getByRole("button", { name: "Delivery ledger" })).toHaveTextContent("Retired");
    expect(await figures("Food")).toHaveTextContent("Spent₱450.00");
    september.unmount();

    renderBudget();
    await figures("Groceries");
    expect(screen.queryByLabelText("Delivery budget, spent and left")).not.toBeInTheDocument();
    expect(await figures("Food")).toHaveTextContent("Spent₱0.00");
  });

  it("shows a retired group in a month one of its categories shows", async () => {
    const bpi = await createAccount(MEMBER, {
      name: "BPI",
      type: "bank",
      startingBalanceCents: parsePHP("1000"),
    });
    const fun = await createGroup(MEMBER, { name: "Fun" });
    const movies = await createCategory(MEMBER, { name: "Movies", groupId: fun.id });
    await setBudget(MEMBER, {
      categoryId: movies.id,
      fromMonth: "2026-09",
      amountCents: parsePHP("500"),
      accountId: bpi.id,
    });
    await setBudget(MEMBER, {
      categoryId: movies.id,
      fromMonth: MONTH,
      amountCents: parsePHP("0"),
      accountId: null,
    });
    await retireCategory(MEMBER, movies.id);
    await retireGroup(MEMBER, fun.id);

    const september = renderBudget("2026-09");
    expect(await figures("Fun")).toHaveTextContent("Budget₱500.00Spent₱0.00Left₱500.00");
    expect(await figures("Movies")).toHaveTextContent("Budget₱500.00");
    september.unmount();

    renderBudget();
    expect(await screen.findByText(/No categories yet/)).toBeInTheDocument();
  });

  it("points to Categories when there are none", async () => {
    renderBudget();
    expect(await screen.findByRole("link", { name: "Categories" })).toHaveAttribute(
      "href",
      "/categories"
    );
  });
});
