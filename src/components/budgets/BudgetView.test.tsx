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
  const daysLeft = month === MONTH ? 11 : undefined;
  const rootRoute = createRootRoute();
  const routes = ["/budget", "/categories"].map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => (
        <BudgetView actor={MEMBER} month={month} currentMonth={MONTH} daysLeft={daysLeft} />
      ),
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

/** A category's row, found by its name (the row's one button). */
const row = async (name: string | RegExp) => {
  const item = (await screen.findByRole("button", { name })).closest("li");
  if (!item) throw new Error(`No row for ${String(name)}`);
  return item;
};
/** What the row shows on the right: left, or what was spent without a budget. */
const left = async (name: string | RegExp) => within(await row(name)).getByTestId("left");
const group = (name: string) => screen.findByRole("region", { name });
/** The group's left sits in its header, ahead of its rows'. */
const groupLeft = async (name: string) => {
  const [header] = within(await group(name)).getAllByTestId("left");
  if (!header) throw new Error(`No left for ${name}`);
  return header;
};
const bar = (name: string) => screen.getByRole("progressbar", { name: `${name} spent` });
const barTone = (name: string) => {
  const indicator = bar(name).querySelector("[data-slot=progress-indicator]");
  if (indicator?.classList.contains("bg-shortfall")) return "shortfall";
  if (indicator?.classList.contains("bg-warning")) return "warning";
  return indicator?.classList.contains("bg-primary") ? "primary" : "none";
};

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("BudgetView", () => {
  it("leads with what's left to spend this month, the budget and the days left", async () => {
    const { groceries, delivery, spend } = await foodThisMonth();
    await spend(groceries.id, "1200");
    await spend(delivery.id, "300");
    renderBudget();

    const hero = await screen.findByRole("region", { name: "Left to spend" });
    // Every category's spending counts, as in the group totals below it.
    expect(hero).toHaveTextContent("₱7,500.00");
    // Money's text repeats the amount for screen readers, so the caption is checked in parts.
    expect(hero).toHaveTextContent("of ₱9,000.00");
    expect(hero).toHaveTextContent("budget · 11 days left");
    expect(bar("All budgets")).toHaveAttribute("aria-valuenow", "17");
    expect(barTone("All budgets")).toBe("primary");
  });

  it("leaves out the days left for another month", async () => {
    await foodThisMonth();
    renderBudget("2026-11");

    expect(await screen.findByRole("region", { name: "Left to spend" })).not.toHaveTextContent(
      "days left"
    );
  });

  it("shows each category's budget, spent and left, and its group's left, with no inputs", async () => {
    const { groceries, spend } = await foodThisMonth();
    await spend(groceries.id, "1200");
    renderBudget();

    const groceriesRow = await row("Groceries");
    expect(groceriesRow).toHaveTextContent("₱8,000.00");
    expect(groceriesRow).toHaveTextContent("₱1,200.00");
    expect(await left("Groceries")).toHaveTextContent("₱6,800.00 left");
    expect(await groupLeft("Food")).toHaveTextContent("₱7,800.00 left");
    expect(bar("Groceries")).toHaveAttribute("aria-valuenow", "15");
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
  });

  it("shows a category without a budget by its spending alone", async () => {
    const { delivery, spend } = await foodThisMonth();
    await spend(delivery.id, "300");
    renderBudget();

    expect(await row("Delivery")).toHaveTextContent("None");
    expect(await left("Delivery")).toHaveTextContent("₱300.00 spent");
    expect(screen.queryByRole("progressbar", { name: "Delivery spent" })).not.toBeInTheDocument();
    // The group's spending still counts it against the group's budgets.
    expect(await groupLeft("Food")).toHaveTextContent("₱8,700.00 left");
  });

  it("shows an overspent category's left as −₱… in shortfall with a shortfall bar, and its group's too", async () => {
    const { restaurants, groceries, spend } = await foodThisMonth();
    await spend(restaurants.id, "10500");
    await spend(groceries.id, "1200");
    renderBudget();

    const restaurantsLeft = await left("Restaurants");
    expect(restaurantsLeft).toHaveTextContent("−₱9,500.00");
    expect(restaurantsLeft).not.toHaveTextContent("left");
    expect(within(restaurantsLeft).getByText("−₱9,500.00").parentElement).toHaveClass(
      "text-shortfall"
    );
    expect(bar("Restaurants")).toHaveAttribute("aria-valuenow", "100");
    expect(barTone("Restaurants")).toBe("shortfall");
    expect(await row("Restaurants")).toHaveTextContent("Over budget");

    expect(within(await groupLeft("Food")).getByText("−₱2,700.00").parentElement).toHaveClass(
      "text-shortfall"
    );
    expect(barTone("Groceries")).toBe("primary");
    expect(await row("Groceries")).not.toHaveTextContent("Over budget");
  });

  it("counts a budget spent exactly as fine, and one nearly spent as close", async () => {
    const { restaurants, groceries, spend } = await foodThisMonth();
    await spend(groceries.id, "8000");
    await spend(restaurants.id, "900");
    renderBudget();

    expect(await left("Groceries")).toHaveTextContent("₱0.00 left");
    expect(barTone("Groceries")).toBe("primary");
    expect(await row("Groceries")).not.toHaveTextContent("Close");

    expect(barTone("Restaurants")).toBe("warning");
    expect(await row("Restaurants")).toHaveTextContent("Close");
  });

  it("marks over budget exactly the categories Home counts as over", async () => {
    const { restaurants, groceries, spend } = await foodThisMonth();
    await spend(restaurants.id, "1000.01");
    await spend(groceries.id, "8000");
    renderBudget();

    await row("Groceries");
    const overspent = ["Groceries", "Restaurants"].filter((name) => barTone(name) === "shortfall");
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
    expect(await row(/^Delivery/)).toHaveTextContent("Retired");
    expect(await left(/^Delivery/)).toHaveTextContent("₱450.00 spent");
    expect(await groupLeft("Food")).toHaveTextContent("₱450.00 spent");
    september.unmount();

    renderBudget();
    await row("Groceries");
    expect(screen.queryByRole("button", { name: /^Delivery/ })).not.toBeInTheDocument();
    expect(await groupLeft("Food")).toHaveTextContent("₱9,000.00 left");
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
    expect(await groupLeft("Fun")).toHaveTextContent("₱500.00 left");
    expect(await row(/^Movies/)).toHaveTextContent("₱500.00");
    september.unmount();

    renderBudget();
    expect(await screen.findByText(/No categories yet/)).toBeInTheDocument();
  });

  it("points to Categories when there are none", async () => {
    renderBudget();
    expect(await screen.findByRole("link", { name: "Set up categories" })).toHaveAttribute(
      "href",
      "/categories"
    );
  });
});
