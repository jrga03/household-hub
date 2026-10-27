import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { createAccount, retireAccount } from "@/lib/commands/accounts";
import { setBudget } from "@/lib/commands/budgets";
import { createCategory, createGroup } from "@/lib/commands/categories";
import type { DistributeMode } from "@/lib/budgets/distribute";
import { distributeMoney } from "@/lib/commands/distribute";
import { parsePHP } from "@/lib/currency";
import { DistributeMoney } from "./DistributeMoney";
import { HOUSEHOLD } from "@/test/events";

vi.mock("@/lib/commands/distribute", () => ({ distributeMoney: vi.fn() }));

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

function renderDistribute(mode: DistributeMode, accountId: string) {
  const rootRoute = createRootRoute();
  const routes = ["/plan", "/categories"].map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => (
        <DistributeMoney
          actor={MEMBER}
          mode={mode}
          initialAccountId={accountId}
          initialDate="2026-10-13"
          onDone={() => {}}
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

const householdAccount = () =>
  createAccount(MEMBER, { name: "BPI", type: "bank", startingBalanceCents: parsePHP("40000") });

const personalAccount = () =>
  createAccount(MEMBER, {
    name: "GCash",
    type: "e_wallet",
    visibility: "personal",
    startingBalanceCents: parsePHP("5000"),
  });

const householdGroup = () => createGroup(MEMBER, { name: "Monthly bills" });

async function householdCategory(name: string) {
  const group = await householdGroup();
  return createCategory(MEMBER, { name, groupId: group.id });
}

function expectNothingToDistribute() {
  expect(screen.getByRole("link", { name: "Categories" })).toHaveAttribute("href", "/categories");
  expect(screen.queryByRole("button", { name: "Distribute" })).not.toBeInTheDocument();
  expect(screen.queryByText(/stays in Unassigned/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Add a category below/)).not.toBeInTheDocument();
}

beforeEach(async () => {
  vi.mocked(distributeMoney).mockReset();
  await resetLocalDatabase();
});

describe("DistributeMoney", () => {
  it.each<DistributeMode>(["opening", "income"])(
    "points a household account in a household with no groups to the suggested set (%s mode)",
    async (mode) => {
      const bpi = await householdAccount();
      renderDistribute(mode, bpi.id);

      expect(await screen.findByText(/BPI has no categories yet/)).toHaveTextContent(
        'On Categories, "Use suggested categories" sets up a starter set, or add your own.'
      );
      expectNothingToDistribute();
    }
  );

  it("doesn't offer the suggested set once a household group exists", async () => {
    await householdGroup();
    const bpi = await householdAccount();
    renderDistribute("opening", bpi.id);

    const emptyState = await screen.findByText(/BPI has no categories yet/);
    expect(emptyState).toHaveTextContent("Add a household category on Categories.");
    expect(emptyState).not.toHaveTextContent(/suggested/i);
    expectNothingToDistribute();
  });

  it.each<DistributeMode>(["opening", "income"])(
    "tells a personal account with no personal categories to add one (%s mode)",
    async (mode) => {
      await householdCategory("Groceries");
      const gcash = await personalAccount();
      renderDistribute(mode, gcash.id);

      const emptyState = await screen.findByText(/GCash has no categories yet/);
      expect(emptyState).toHaveTextContent("Add a personal category on Categories.");
      expect(emptyState).not.toHaveTextContent(/suggested/i);
      expectNothingToDistribute();
    }
  );

  it("keeps the no-budgets copy, picker, totals and button when the account holds categories", async () => {
    await householdCategory("Groceries");
    const bpi = await householdAccount();
    renderDistribute("income", bpi.id);

    expect(
      await screen.findByText("No budgets this month for BPI's categories. Add a category below.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Add a category")).toBeInTheDocument();
    expect(screen.getByText(/stays in Unassigned/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Distribute" })).toBeInTheDocument();
    expect(screen.queryByText(/has no categories yet/)).not.toBeInTheDocument();
  });

  it("lists a line per category in opening mode when the account holds one", async () => {
    await householdCategory("Groceries");
    const bpi = await householdAccount();
    renderDistribute("opening", bpi.id);

    expect(await screen.findByLabelText("Groceries")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Distribute" })).toBeInTheDocument();
    expect(screen.queryByText(/has no categories yet/)).not.toBeInTheDocument();
  });

  it("updates the empty state when the From account changes", async () => {
    const bpi = await householdAccount();
    await personalAccount();
    renderDistribute("opening", bpi.id);
    await screen.findByText(/BPI has no categories yet/);

    fireEvent.keyDown(screen.getByLabelText("From"), { key: "Enter" });
    fireEvent.keyDown(await screen.findByRole("option", { name: "GCash (Personal)" }), {
      key: "Enter",
    });

    expect(await screen.findByText(/GCash has no categories yet/)).toHaveTextContent(
      "Add a personal category on Categories."
    );
  });

  it("moves the lines to the new From account in opening mode", async () => {
    await householdCategory("Groceries");
    const bpi = await householdAccount();
    await secondHouseholdAccount();
    renderDistribute("opening", bpi.id);
    expect(await screen.findByLabelText("Groceries goes to")).toHaveTextContent("BPI");

    await chooseFrom("BDO");

    await waitFor(() =>
      expect(screen.getByLabelText("Groceries goes to")).toHaveTextContent("BDO")
    );
  });

  it("keeps a line in the new From account in income mode when its funding account is retired", async () => {
    const groceries = await householdCategory("Groceries");
    const bpi = await householdAccount();
    await secondHouseholdAccount();
    const cash = await createAccount(MEMBER, {
      name: "Cash",
      type: "cash",
      startingBalanceCents: parsePHP("0"),
    });
    await setBudget(MEMBER, {
      categoryId: groceries.id,
      fromMonth: "2026-10",
      amountCents: parsePHP("3000"),
      accountId: cash.id,
    });
    await retireAccount(MEMBER, cash.id);
    renderDistribute("income", bpi.id);
    expect(await screen.findByLabelText("Groceries goes to")).toHaveTextContent("BPI");

    await chooseFrom("BDO");

    await waitFor(() =>
      expect(screen.getByLabelText("Groceries goes to")).toHaveTextContent("BDO")
    );
  });

  it("distributes from the new From account to it, never the old one", async () => {
    const groceries = await householdCategory("Groceries");
    const bpi = await householdAccount();
    const bdo = await secondHouseholdAccount();
    renderDistribute("opening", bpi.id);
    await screen.findByLabelText("Groceries goes to");

    await chooseFrom("BDO");
    await waitFor(() =>
      expect(screen.getByLabelText("Groceries goes to")).toHaveTextContent("BDO")
    );
    fireEvent.change(screen.getByLabelText("Groceries"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Distribute" }));

    await waitFor(() =>
      expect(distributeMoney).toHaveBeenCalledWith(MEMBER, {
        sourceAccountId: bdo.id,
        date: "2026-10-13",
        lines: [{ categoryId: groceries.id, accountId: bdo.id, amountCents: parsePHP("500") }],
      })
    );
  });

  it("keeps line edits when the date stays in the month or the income changes", async () => {
    await householdCategory("Groceries");
    const bpi = await householdAccount();
    renderDistribute("income", bpi.id);
    await screen.findByLabelText("Add a category");
    fireEvent.keyDown(screen.getByLabelText("Add a category"), { key: "Enter" });
    fireEvent.keyDown(await screen.findByRole("option", { name: "Groceries" }), { key: "Enter" });
    fireEvent.change(await screen.findByLabelText("Groceries"), { target: { value: "500" } });

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-20" } });
    fireEvent.change(screen.getByLabelText("Income (₱)"), { target: { value: "9000" } });

    expect(screen.getByLabelText("Groceries")).toHaveValue("500.00");
  });
});

const secondHouseholdAccount = () =>
  createAccount(MEMBER, { name: "BDO", type: "bank", startingBalanceCents: parsePHP("20000") });

async function chooseFrom(name: string) {
  fireEvent.keyDown(screen.getByLabelText("From"), { key: "Enter" });
  fireEvent.keyDown(await screen.findByRole("option", { name }), { key: "Enter" });
}
