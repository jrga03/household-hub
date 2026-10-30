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
import { addAllocation } from "@/lib/commands/allocations";
import { parsePHP } from "@/lib/currency";
import { AssignMoneyHelp, AssignMoneyView, type DistributeRequest } from "./AssignMoneyView";
import { HOUSEHOLD } from "@/test/events";

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

function renderAssignMoney({
  distribute = null,
  onDistribute = () => {},
}: {
  distribute?: DistributeRequest | null;
  onDistribute?: (mode: string | null) => void;
} = {}) {
  const rootRoute = createRootRoute();
  const routes = ["/assign-money", "/categories"].map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => (
        <AssignMoneyView actor={MEMBER} distribute={distribute} onDistribute={onDistribute} />
      ),
    })
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ["/assign-money"] }),
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

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("AssignMoneyView", () => {
  it("totals Unassigned and starts Distribute from it", async () => {
    await groceries();
    await createAccount(MEMBER, {
      name: "GCash",
      type: "e_wallet",
      startingBalanceCents: parsePHP("1500"),
    });
    const onDistribute = vi.fn();
    renderAssignMoney({ onDistribute });

    const hero = await screen.findByRole("region", { name: "Unassigned" });
    expect(
      await within(hero).findByText("₱21,500.00", { selector: "[aria-hidden=true]" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Distribute" }));
    expect(onDistribute).toHaveBeenCalledWith("income");
  });

  it("opens Distribute money when asked, on its source account", async () => {
    const { bpi } = await groceries();
    renderAssignMoney({ distribute: { mode: "opening", accountId: bpi.id } });

    const sheet = await screen.findByRole("dialog", { name: "Distribute money" });
    expect(
      await within(sheet).findByRole("form", { name: "Distribute money" })
    ).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Groceries")).toBeInTheDocument();
  });

  it("opens an allocation for editing from its row", async () => {
    const { bpi, category } = await groceries();
    await addAllocation(MEMBER, {
      date: "2026-10-05",
      accountId: bpi.id,
      from: { kind: "unassigned" },
      to: { kind: "category", id: category.id },
      amountCents: parsePHP("8000"),
    });
    renderAssignMoney();

    const allocations = await screen.findByRole("list", { name: "Allocations" });
    const row = within(allocations).getByRole("button", { name: /^Unassigned → Groceries/ });
    expect(row).toHaveAccessibleName(/₱8,000\.00\s*Oct 5, 2026 · BPI$/);
    fireEvent.click(row);

    const dialog = await screen.findByRole("dialog", { name: "Edit allocation" });
    expect(within(dialog).getByLabelText("Amount (₱)")).toHaveDisplayValue(/^8,?000\.00$/);
  });

  it("puts a missing amount's problem on the Move money amount field", async () => {
    await groceries();
    renderAssignMoney();

    fireEvent.click(await screen.findByRole("button", { name: "Move money" }));
    const dialog = await screen.findByRole("dialog", { name: "Move money" });
    fireEvent.submit(within(dialog).getByRole("form", { name: "Move money" }));

    const amount = within(dialog).getByLabelText("Amount (₱)");
    await waitFor(() => expect(amount).toHaveAttribute("aria-invalid", "true"));
    expect(amount).toHaveAccessibleDescription(/more than zero/);
  });

  it("explains Unassigned, Move money and Distribute from its help button", async () => {
    render(<AssignMoneyHelp />);

    fireEvent.click(screen.getByRole("button", { name: "About assigning money" }));
    const help = await screen.findByRole("dialog");
    expect(help).toHaveTextContent(/Unassigned is money in your accounts not yet in a category/);
    expect(help).toHaveTextContent(/Move money moves it between categories/);
    expect(help).toHaveTextContent(/Distribute shares income/);
  });
});
