import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { toast } from "sonner";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { createAccount } from "@/lib/commands/accounts";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { setBudget } from "@/lib/commands/budgets";
import { addPayday } from "@/lib/commands/paydays";
import { addTransaction } from "@/lib/commands/transactions";
import { categoryMonth, readMonthView } from "@/lib/budgets/month";
import { parsePHP } from "@/lib/currency";
import { useCollapsedGroupsStore } from "@/stores/collapsedGroupsStore";
import { BudgetView } from "./BudgetView";
import { SetBudgetsView } from "./SetBudgetsView";
import { HOUSEHOLD } from "@/test/events";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };
const MONTH = "2026-10";

function renderSetBudgets(
  view = <SetBudgetsView actor={MEMBER} month={MONTH} currentMonth={MONTH} />
) {
  const rootRoute = createRootRoute();
  const routes = ["/set-budgets", "/categories"].map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => view,
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
  return { bpi, food, category };
}

const budgetIn = async (month: string, categoryId: string) =>
  categoryMonth(await readMonthView(month, MONTH), categoryId).budget;

beforeEach(async () => {
  await resetLocalDatabase();
  localStorage.clear();
  useCollapsedGroupsStore.setState({ collapsedGroupIds: [] });
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
        portions: [],
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

  it("leaves out a collapsed group's rows and keeps its budget total", async () => {
    const { bpi, category } = await groceries();
    await setBudget(MEMBER, {
      categoryId: category.id,
      fromMonth: MONTH,
      amountCents: parsePHP("8000"),
      accountId: bpi.id,
    });
    renderSetBudgets();

    const header = await screen.findByRole("button", { name: "Food" });
    expect(header).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(header);

    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Groceries" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Food" })).toHaveTextContent("₱8,000.00 budgeted");
  });

  it("starts with the groups this device collapsed, on Budget or before a reload", async () => {
    const { food } = await groceries();
    localStorage.setItem(
      "collapsed-groups",
      JSON.stringify({ state: { collapsedGroupIds: [food.id] }, version: 0 })
    );
    await useCollapsedGroupsStore.persist.rehydrate();
    renderSetBudgets();

    expect(await screen.findByRole("button", { name: "Food" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.queryByRole("textbox", { name: "Groceries" })).not.toBeInTheDocument();
  });

  it("collapses a group on Set budgets that was collapsed on Budget", async () => {
    await groceries();
    const budget = renderSetBudgets(
      <BudgetView actor={MEMBER} month={MONTH} currentMonth={MONTH} />
    );
    fireEvent.click(await screen.findByRole("button", { name: "Food" }));
    budget.unmount();
    renderSetBudgets();

    expect(await screen.findByRole("button", { name: "Food" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.queryByRole("textbox", { name: "Groceries" })).not.toBeInTheDocument();
  });

  it("offers done on the last shown amount when the groups after it are collapsed", async () => {
    await groceries();
    const savings = await createGroup(MEMBER, { name: "Savings" });
    await createCategory(MEMBER, { name: "Retirement", groupId: savings.id });
    renderSetBudgets();

    const amount = await screen.findByRole("textbox", { name: "Groceries" });
    expect(amount).toHaveAttribute("enterkeyhint", "next");
    fireEvent.click(screen.getByRole("button", { name: "Savings" }));
    expect(amount).toHaveAttribute("enterkeyhint", "done");
  });
});

describe("SetBudgetsView paydays", () => {
  const paydayNames = () =>
    within(screen.getByRole("list", { name: "Paydays" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent);

  async function savePayday(dialogName: string, name: string) {
    const dialog = await screen.findByRole("dialog", { name: dialogName });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: name },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  }

  it("adds, renames, reorders and deletes a payday", async () => {
    await groceries();
    renderSetBudgets();
    expect(await screen.findByText("No paydays yet.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add payday" }));
    await savePayday("Add payday", "  15th ");
    fireEvent.click(screen.getByRole("button", { name: "Add payday" }));
    await savePayday("Add payday", "30th salary");
    await waitFor(() => expect(paydayNames()).toEqual(["15th", "30th salary"]));
    expect(screen.getByRole("button", { name: "Move 15th up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move 30th salary down" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Edit 15th" }));
    await savePayday("Edit payday", "15th salary");
    await waitFor(() => expect(paydayNames()).toEqual(["15th salary", "30th salary"]));

    fireEvent.click(screen.getByRole("button", { name: "Move 30th salary up" }));
    await waitFor(() => expect(paydayNames()).toEqual(["30th salary", "15th salary"]));

    fireEvent.click(screen.getByRole("button", { name: "Edit 30th salary" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Edit payday" })).getByRole("button", {
        name: "Delete payday",
      })
    );
    await waitFor(() => expect(paydayNames()).toEqual(["15th salary"]));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  /** A ₱8,000 budget from `fromMonth`, all of it on the payday. */
  const onPayday = (categoryId: string, accountId: string, fromMonth: string, paydayId: string) =>
    setBudget(MEMBER, {
      categoryId,
      fromMonth,
      amountCents: parsePHP("8000"),
      accountId,
      portions: [{ paydayId, amountCents: parsePHP("8000") }],
    });

  const retireFromDialog = async (name: string) => {
    fireEvent.click(await screen.findByRole("button", { name: `Edit ${name}` }));
    const dialog = await screen.findByRole("dialog", { name: "Edit payday" });
    expect(within(dialog).queryByRole("button", { name: "Delete payday" })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Retire payday" }));
  };

  it("retires a payday an earlier month's budget names, lists it under Retired, and unretires it", async () => {
    const { bpi, category } = await groceries();
    const fifteenth = await addPayday(MEMBER, "15th salary");
    await addPayday(MEMBER, "30th salary");
    await onPayday(category.id, bpi.id, "2026-09", fifteenth.id);
    await setBudget(MEMBER, {
      categoryId: category.id,
      fromMonth: MONTH,
      amountCents: parsePHP("8000"),
      accountId: bpi.id,
    });
    renderSetBudgets();

    await retireFromDialog("15th salary");
    await waitFor(() => expect(paydayNames()).toEqual(["30th salary"]));
    expect(screen.queryByRole("list", { name: "Retired paydays" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show retired (1)" }));
    const retired = screen.getByRole("list", { name: "Retired paydays" });
    expect(retired).toHaveTextContent("15th salary");

    fireEvent.click(within(retired).getByRole("button", { name: "Unretire 15th salary" }));
    await waitFor(() => expect(paydayNames()).toEqual(["15th salary", "30th salary"]));
  });

  it("keeps a payday this month's budget has a portion on, and says why", async () => {
    const { bpi, category } = await groceries();
    const fifteenth = await addPayday(MEMBER, "15th salary");
    await onPayday(category.id, bpi.id, MONTH, fifteenth.id);
    renderSetBudgets();

    await retireFromDialog("15th salary");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Groceries has a portion on 15th salary from this month on. Move it to another payday first."
      )
    );
    expect(screen.getByRole("dialog", { name: "Edit payday" })).toBeInTheDocument();
  });

  it("keeps the dialog open with the reason when the name is blank", async () => {
    await groceries();
    renderSetBudgets();

    fireEvent.click(await screen.findByRole("button", { name: "Add payday" }));
    const dialog = await screen.findByRole("dialog", { name: "Add payday" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "   " },
    });
    fireEvent.submit(within(dialog).getByRole("form"));

    expect(await within(dialog).findByText("A payday needs a name.")).toBeInTheDocument();
  });
});

describe("SetBudgetsView by payday", () => {
  const section = (name: string) => screen.getByRole("region", { name });
  // The text as shown: each amount's spoken twin is left out.
  const shown = (element: HTMLElement) => {
    const copy = element.cloneNode(true) as HTMLElement;
    for (const spoken of copy.querySelectorAll(".sr-only")) spoken.remove();
    return copy.textContent;
  };
  const items = (name: string) =>
    within(screen.getByRole("list", { name })).getAllByRole("listitem").map(shown);

  it("groups this month's budgets under each payday, then any payday, with totals by account", async () => {
    const { bpi, food, category: groceryCategory } = await groceries();
    const gcash = await createAccount(MEMBER, {
      name: "GCash",
      type: "e_wallet",
      startingBalanceCents: parsePHP("0"),
    });
    const rent = await createCategory(MEMBER, { name: "Rent", groupId: food.id });
    const fun = await createCategory(MEMBER, { name: "Fun", groupId: food.id });
    const fifteenth = await addPayday(MEMBER, "15th salary");
    const thirtieth = await addPayday(MEMBER, "30th salary");
    const set = (categoryId: string, amount: string, accountId: string, portions = {}) =>
      setBudget(MEMBER, {
        categoryId,
        fromMonth: MONTH,
        amountCents: parsePHP(amount),
        accountId,
        portions: Object.entries(portions).map(([paydayId, portion]) => ({
          paydayId,
          amountCents: parsePHP(String(portion)),
        })),
      });
    await set(groceryCategory.id, "8000", bpi.id, {
      [fifteenth.id]: "4000",
      [thirtieth.id]: "4000",
    });
    await set(rent.id, "5000", gcash.id, { [fifteenth.id]: "5000" });
    await set(fun.id, "2000", gcash.id);
    renderSetBudgets();

    await screen.findByRole("region", { name: "15th salary" });
    expect(section("15th salary")).toHaveTextContent("₱9,000.00");
    expect(items("15th salary budgets")).toEqual(["Groceries₱4,000.00", "Rent₱5,000.00"]);
    expect(items("15th salary by account")).toEqual(["To BPI₱4,000.00", "To GCash₱5,000.00"]);
    expect(items("30th salary budgets")).toEqual(["Groceries₱4,000.00"]);
    expect(items("30th salary by account")).toEqual(["To BPI₱4,000.00"]);
    expect(section("Any payday")).toHaveTextContent("₱2,000.00");
    expect(items("Any payday budgets")).toEqual(["Fun₱2,000.00"]);
    expect(items("Any payday by account")).toEqual(["To GCash₱2,000.00"]);
  });

  it("shows no plan by payday until the household has paydays", async () => {
    await groceries();
    renderSetBudgets();

    await screen.findByText("No paydays yet.");
    expect(screen.queryByRole("region", { name: "Any payday" })).not.toBeInTheDocument();
  });
});

describe("SetBudgetsView portions", () => {
  async function openDetails() {
    fireEvent.click(await screen.findByRole("button", { name: "Groceries budget details" }));
    return screen.findByRole("dialog", { name: "Budget for Groceries" });
  }
  const type = (dialog: HTMLElement, name: string, value: string) =>
    fireEvent.change(within(dialog).getByRole("textbox", { name }), { target: { value } });

  it("splits a budget into portions that add up to it, then removes them", async () => {
    const { category } = await groceries();
    const fifteenth = await addPayday(MEMBER, "15th salary");
    const thirtieth = await addPayday(MEMBER, "30th salary");
    renderSetBudgets();

    let dialog = await openDetails();
    type(dialog, "Amount (₱)", "8000");
    type(dialog, "15th salary", "3000");
    type(dialog, "30th salary", "4000");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save budget" }));

    expect(
      await within(dialog).findByText(
        "These add up to ₱7,000.00. Make them add up to ₱8,000.00, or leave them all blank."
      )
    ).toBeInTheDocument();
    expect(await budgetIn(MONTH, category.id)).toBeNull();

    type(dialog, "30th salary", "5000");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save budget" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect((await budgetIn(MONTH, category.id))?.portions).toEqual([
      { paydayId: fifteenth.id, amountCents: parsePHP("3000") },
      { paydayId: thirtieth.id, amountCents: parsePHP("5000") },
    ]);

    dialog = await openDetails();
    expect(within(dialog).getByRole("textbox", { name: "15th salary" })).toHaveValue("3,000.00");
    type(dialog, "15th salary", "");
    type(dialog, "30th salary", "");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save budget" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await budgetIn(MONTH, category.id)).toMatchObject({
      amountCents: parsePHP("8000"),
      portions: [],
    });
  });
});
