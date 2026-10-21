import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import { PlanView, type DistributeRequest } from "./PlanView";
import { HOUSEHOLD } from "@/test/events";

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };
const MONTH = "2026-10";

function renderPlan({
  distribute = null,
  onDistribute = () => {},
}: {
  distribute?: DistributeRequest | null;
  onDistribute?: (mode: string | null) => void;
} = {}) {
  const rootRoute = createRootRoute();
  const routes = ["/plan", "/categories"].map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => (
        <PlanView
          actor={MEMBER}
          month={MONTH}
          currentMonth={MONTH}
          distribute={distribute}
          onDistribute={onDistribute}
        />
      ),
    })
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ["/plan"] }),
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

describe("PlanView", () => {
  it("sets a category's budget from the month when its amount is typed and left", async () => {
    const { bpi, category } = await groceries();
    renderPlan();

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
    renderPlan();

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
    renderPlan();

    expect(await screen.findByRole("textbox", { name: "Groceries" })).toHaveAccessibleDescription(
      "Spent Sep ₱2,500.00 · Oct ₱1,200.00 Holds minus ₱3,700.00"
    );
  });

  it("totals what's left to assign and starts Distribute from it", async () => {
    await groceries();
    await createAccount(MEMBER, {
      name: "GCash",
      type: "e_wallet",
      startingBalanceCents: parsePHP("1500"),
    });
    const onDistribute = vi.fn();
    renderPlan({ onDistribute });

    const bar = await screen.findByRole("region", { name: "To assign" });
    expect(
      await within(bar).findByText("₱21,500.00", { selector: "[aria-hidden=true]" })
    ).toBeInTheDocument();
    fireEvent.click(within(bar).getByRole("button", { name: "Distribute" }));
    expect(onDistribute).toHaveBeenCalledWith("income");
  });

  it("opens Distribute money when asked, on its source account", async () => {
    const { bpi } = await groceries();
    renderPlan({ distribute: { mode: "opening", accountId: bpi.id } });

    const sheet = await screen.findByRole("dialog", { name: "Distribute money" });
    expect(
      await within(sheet).findByRole("form", { name: "Distribute money" })
    ).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Groceries")).toBeInTheDocument();
  });

  it("moves money into a category from its row", async () => {
    await groceries();
    renderPlan();

    fireEvent.click(await screen.findByRole("button", { name: "Groceries actions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Move money" }));

    const dialog = await screen.findByRole("dialog", { name: "Move money" });
    expect(within(dialog).getByLabelText("To")).toHaveTextContent("Groceries");
  });
});
