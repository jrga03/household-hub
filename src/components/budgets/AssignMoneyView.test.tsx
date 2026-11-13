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
  initialAccountId,
  distribute = null,
  onDistribute = () => {},
}: {
  initialAccountId?: string;
  distribute?: DistributeRequest | null;
  onDistribute?: (mode: string | null) => void;
} = {}) {
  const rootRoute = createRootRoute();
  const routes = ["/assign-money", "/categories"].map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => (
        <AssignMoneyView
          actor={MEMBER}
          initialAccountId={initialAccountId}
          distribute={distribute}
          onDistribute={onDistribute}
        />
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

  it("lists no allocations; they open from each category's ledger on Budget", async () => {
    const { bpi, category } = await groceries();
    await addAllocation(MEMBER, {
      date: "2026-10-05",
      accountId: bpi.id,
      from: { kind: "unassigned" },
      to: { kind: "category", id: category.id },
      amountCents: parsePHP("8000"),
    });
    renderAssignMoney();

    expect(await screen.findByRole("region", { name: "Unassigned" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Allocations" })).not.toBeInTheDocument();
  });

  it("starts Move money on the account chosen on Accounts", async () => {
    await groceries();
    const gcash = await createAccount(MEMBER, {
      name: "GCash",
      type: "e_wallet",
      startingBalanceCents: parsePHP("1500"),
    });
    renderAssignMoney({ initialAccountId: gcash.id });

    fireEvent.click(await screen.findByRole("button", { name: "Move money" }));
    const dialog = await screen.findByRole("dialog", { name: "Move money" });
    expect(within(dialog).getByRole("combobox", { name: "Account" })).toHaveTextContent("GCash");
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
    expect(help).toHaveTextContent(/Distribute shares this month’s income/);
  });
});
