import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { createAccount } from "@/lib/commands/accounts";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { setBudget } from "@/lib/commands/budgets";
import { addTransaction } from "@/lib/commands/transactions";
import { categoryMonth, readMonthView } from "@/lib/budgets/month";
import { parsePHP } from "@/lib/currency";
import { SetBudgetsView } from "./SetBudgetsView";
import { HOUSEHOLD } from "@/test/events";

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };
const MONTH = "2026-10";

function renderSetBudgets() {
  const rootRoute = createRootRoute();
  const routes = ["/set-budgets", "/categories"].map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => <SetBudgetsView actor={MEMBER} month={MONTH} currentMonth={MONTH} />,
    })
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ["/set-budgets"] }),
  });
  return render(<RouterProvider router={router} />);
}

/** BPI with ₱20,000 Unassigned, and Groceries under Food. */
async function groceries() {
  const bpi = await createAccount(MEMBER, {
    name: "BPI",
    type: "bank",
    startingBalanceCents: parsePHP("20000"),
  });
  const food = await createGroup(MEMBER, { name: "Food" });
  const category = await createCategory(MEMBER, { name: "Groceries", groupId: food.id });
  return { bpi, category };
}

const budgetIn = async (month: string, categoryId: string) =>
  categoryMonth(await readMonthView(month, MONTH), categoryId).budget;

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("SetBudgetsView", () => {
  it("sets a category's budget from the month when its amount is typed and left", async () => {
    const { bpi, category } = await groceries();
    renderSetBudgets();

    const amount = await screen.findByRole("textbox", { name: "Groceries" });
    fireEvent.focus(amount);
    fireEvent.change(amount, { target: { value: "8000" } });
    fireEvent.blur(amount);

    await waitFor(async () =>
      expect(await budgetIn(MONTH, category.id)).toEqual({
        amountCents: parsePHP("8000"),
        accountId: bpi.id,
        fromMonth: MONTH,
      })
    );
    expect(await screen.findByDisplayValue("8,000.00")).toBe(amount);
  });

  it("clears a budget when its amount is emptied", async () => {
    const { bpi, category } = await groceries();
    await setBudget(MEMBER, {
      categoryId: category.id,
      fromMonth: "2026-09",
      amountCents: parsePHP("5000"),
      accountId: bpi.id,
    });
    renderSetBudgets();

    const amount = await screen.findByDisplayValue("5,000.00");
    fireEvent.focus(amount);
    fireEvent.change(amount, { target: { value: "" } });
    fireEvent.blur(amount);

    await waitFor(async () => expect(await budgetIn(MONTH, category.id)).toBeNull());
    expect(await budgetIn("2026-09", category.id)).not.toBeNull();
  });

  it("hints what the category spent last month and this month, and the money it holds", async () => {
    const { bpi, category } = await groceries();
    for (const [date, amount] of [
      ["2026-09-20", "2500"],
      ["2026-10-03", "1200"],
    ] as const) {
      await addTransaction(MEMBER, {
        date,
        type: "expense",
        amountCents: parsePHP(amount),
        accountId: bpi.id,
        categoryId: category.id,
        description: "Market",
      });
    }
    renderSetBudgets();

    expect(await screen.findByRole("textbox", { name: "Groceries" })).toHaveAccessibleDescription(
      "Spent Sep ₱2,500.00 · Oct ₱1,200.00 Holds minus ₱3,700.00"
    );
  });

  it("opens a category's budget details from its row", async () => {
    await groceries();
    renderSetBudgets();

    fireEvent.click(await screen.findByRole("button", { name: "Groceries budget details" }));
    expect(await screen.findByRole("dialog", { name: "Budget for Groceries" })).toBeInTheDocument();
  });
});
