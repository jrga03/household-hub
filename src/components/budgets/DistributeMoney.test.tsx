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
import { createAccount, retireAccount } from "@/lib/commands/accounts";
import { addAllocation } from "@/lib/commands/allocations";
import { setBudget } from "@/lib/commands/budgets";
import { createCategory, createGroup } from "@/lib/commands/categories";
import type { DistributeMode } from "@/lib/budgets/distribute";
import { distributeMoney } from "@/lib/commands/distribute";
import { addPayday } from "@/lib/commands/paydays";
import { parsePHP, sumCents } from "@/lib/currency";
import { DistributeMoney } from "./DistributeMoney";
import { HOUSEHOLD } from "@/test/events";

vi.mock("@/lib/commands/distribute", () => ({ distributeMoney: vi.fn() }));

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

function renderDistribute(mode: DistributeMode, accountId: string) {
  const rootRoute = createRootRoute();
  const routes = ["/assign-money", "/categories"].map((path) =>
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
    history: createMemoryHistory({ initialEntries: ["/assign-money"] }),
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

const secondHouseholdAccount = () =>
  createAccount(MEMBER, { name: "BDO", type: "bank", startingBalanceCents: parsePHP("20000") });

async function chooseFrom(name: string) {
  fireEvent.click(screen.getByLabelText("From"));
  fireEvent.click(await screen.findByRole("option", { name }));
}

async function expectLineGoesTo(name: string) {
  await waitFor(() => expect(screen.getByLabelText("Groceries goes to")).toHaveTextContent(name));
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

    fireEvent.click(screen.getByLabelText("From"));
    fireEvent.click(await screen.findByRole("option", { name: "GCash (Personal)" }));

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

    await expectLineGoesTo("BDO");
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
    await setBudget(
      MEMBER,
      {
        categoryId: groceries.id,
        fromMonth: "2026-10",
        amountCents: parsePHP("3000"),
        accountId: cash.id,
      },
      "2026-11"
    );
    await retireAccount(MEMBER, cash.id);
    renderDistribute("income", bpi.id);
    expect(await screen.findByLabelText("Groceries goes to")).toHaveTextContent("BPI");

    await chooseFrom("BDO");

    await expectLineGoesTo("BDO");
  });

  it("distributes from the new From account to it, never the old one", async () => {
    const groceries = await householdCategory("Groceries");
    const bpi = await householdAccount();
    const bdo = await secondHouseholdAccount();
    renderDistribute("opening", bpi.id);
    await screen.findByLabelText("Groceries goes to");

    await chooseFrom("BDO");
    await expectLineGoesTo("BDO");
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
    fireEvent.click(screen.getByLabelText("Add a category"));
    fireEvent.click(await screen.findByRole("option", { name: "Groceries" }));
    fireEvent.change(await screen.findByLabelText("Groceries"), { target: { value: "500" } });

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-20" } });
    fireEvent.change(screen.getByLabelText("Income (₱)"), { target: { value: "9000" } });

    expect(screen.getByLabelText("Groceries")).toHaveValue("500.00");
  });

  it("shows how much goes to each account and updates as amounts and accounts change", async () => {
    const groceries = await householdCategory("Groceries");
    const transportation = await householdCategory("Transportation");
    const bpi = await householdAccount();
    const bdo = await secondHouseholdAccount();
    const budget = (categoryId: string, amount: string, accountId: string) =>
      setBudget(
        MEMBER,
        {
          categoryId,
          fromMonth: "2026-10",
          amountCents: parsePHP(amount),
          accountId,
        },
        "2026-11"
      );
    await budget(groceries.id, "3000", bpi.id);
    await budget(transportation.id, "1000", bdo.id);
    renderDistribute("income", bpi.id);
    const summary = await screen.findByRole("list", { name: "Where the money goes" });
    const expectRows = (expected: string[]) => {
      const rows = within(summary).getAllByRole("listitem");
      expect(rows).toHaveLength(expected.length);
      expected.forEach((text, index) => expect(rows[index]).toHaveTextContent(text));
    };

    expectRows(["BDO₱1,000.00", "Stays in BPI₱3,000.00"]);

    fireEvent.change(screen.getByLabelText("Transportation"), { target: { value: "400" } });
    expectRows(["BDO₱400.00", "Stays in BPI₱3,000.00"]);

    fireEvent.click(screen.getByLabelText("Groceries goes to"));
    fireEvent.click(await screen.findByRole("option", { name: "BDO" }));
    await waitFor(() => expectRows(["BDO₱3,400.00"]));
  });

  describe("paydays", () => {
    async function groceriesInPortions() {
      const groceries = await householdCategory("Groceries");
      const utilities = await householdCategory("Utilities");
      const bpi = await householdAccount();
      const fifteenth = await addPayday(MEMBER, "15th salary");
      const thirtieth = await addPayday(MEMBER, "30th salary");
      const inPortions = (categoryId: string, portions: [string, string][]) =>
        setBudget(
          MEMBER,
          {
            categoryId,
            fromMonth: "2026-10",
            amountCents: sumCents(portions.map(([, amount]) => parsePHP(amount))),
            accountId: bpi.id,
            portions: portions.map(([paydayId, amount]) => ({
              paydayId,
              amountCents: parsePHP(amount),
            })),
          },
          "2026-11"
        );
      await inPortions(groceries.id, [
        [fifteenth.id, "4000"],
        [thirtieth.id, "4000"],
      ]);
      await inPortions(utilities.id, [[thirtieth.id, "6000"]]);
      const fund = (categoryId: string, amount: string) =>
        addAllocation(MEMBER, {
          date: "2026-10-05",
          accountId: bpi.id,
          from: { kind: "unassigned" },
          to: { kind: "category", id: categoryId },
          amountCents: parsePHP(amount),
        });
      return { groceries, utilities, bpi, fund };
    }

    const chip = (name: string) => screen.findByRole("button", { name });

    it("preselects the first payday with money left and fills only its budgets", async () => {
      const { bpi } = await groceriesInPortions();
      renderDistribute("income", bpi.id);

      expect(await chip("15th salary")).toHaveAttribute("aria-pressed", "true");
      expect(await chip("30th salary")).toHaveAttribute("aria-pressed", "false");
      expect(await screen.findByLabelText("Groceries")).toHaveValue("4,000.00");
      expect(screen.queryByLabelText("Utilities")).not.toBeInTheDocument();
    });

    it("preselects a later payday once the earlier one's portions are funded", async () => {
      const { groceries, bpi, fund } = await groceriesInPortions();
      await fund(groceries.id, "4000");
      renderDistribute("income", bpi.id);

      expect(await chip("30th salary")).toHaveAttribute("aria-pressed", "true");
      expect(await chip("15th salary")).toHaveAttribute("aria-pressed", "false");
      expect(await screen.findByLabelText("Utilities")).toHaveValue("6,000.00");
    });

    it("lets a member choose several paydays", async () => {
      const { bpi } = await groceriesInPortions();
      renderDistribute("income", bpi.id);

      fireEvent.click(await chip("30th salary"));

      await waitFor(() => expect(screen.getByLabelText("Groceries")).toHaveValue("8,000.00"));
      expect(screen.getByLabelText("Utilities")).toHaveValue("6,000.00");
    });

    it("collapses fully funded lines under Already funded, counted once given an amount", async () => {
      const { groceries, bpi, fund } = await groceriesInPortions();
      await fund(groceries.id, "8000");
      renderDistribute("income", bpi.id);
      expect(await chip("30th salary")).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(await chip("15th salary"));

      const toggle = await screen.findByRole("button", { name: "Already funded" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByLabelText("Groceries")).not.toBeInTheDocument();
      expect(await screen.findByLabelText("Utilities")).toHaveValue("6,000.00");
      const summary = screen.getByRole("list", { name: "Where the money goes" });
      expect(summary).toHaveTextContent("Stays in BPI₱6,000.00");

      fireEvent.click(toggle);
      fireEvent.change(screen.getByLabelText("Groceries"), { target: { value: "500" } });

      expect(summary).toHaveTextContent("Stays in BPI₱6,500.00");
      expect(screen.getByLabelText("Groceries")).toBeInTheDocument();
    });
  });

  describe("one category in several accounts", () => {
    async function addGroceries() {
      fireEvent.click(screen.getByLabelText("Add a category"));
      fireEvent.click(await screen.findByRole("option", { name: "Groceries" }));
    }

    async function sendSecondLineTo(name: string) {
      const accounts = screen.getAllByLabelText("Groceries goes to");
      expect(accounts).toHaveLength(2);
      fireEvent.click(accounts[1]!);
      fireEvent.click(await screen.findByRole("option", { name }));
    }

    async function twoGroceriesLines() {
      const groceries = await householdCategory("Groceries");
      const bpi = await householdAccount();
      const bdo = await secondHouseholdAccount();
      renderDistribute("income", bpi.id);
      await screen.findByLabelText("Add a category");
      await addGroceries();
      await addGroceries();
      await waitFor(() => expect(screen.getAllByLabelText("Groceries")).toHaveLength(2));
      return { groceries, bpi, bdo };
    }

    it("keeps offering a category after it is on a line", async () => {
      await twoGroceriesLines();

      fireEvent.click(screen.getByLabelText("Add a category"));
      expect(await screen.findByRole("option", { name: "Groceries" })).toBeInTheDocument();
    });

    it("submits two lines for one category in different accounts", async () => {
      const { groceries, bpi, bdo } = await twoGroceriesLines();
      const [first, second] = screen.getAllByLabelText("Groceries");
      fireEvent.change(first!, { target: { value: "800" } });
      fireEvent.change(second!, { target: { value: "200" } });
      expect(screen.getAllByLabelText("Groceries goes to")[1]).toHaveTextContent("BDO");

      fireEvent.click(screen.getByRole("button", { name: "Distribute" }));

      await waitFor(() =>
        expect(distributeMoney).toHaveBeenCalledWith(MEMBER, {
          sourceAccountId: bpi.id,
          date: "2026-10-13",
          lines: [
            { categoryId: groceries.id, accountId: bpi.id, amountCents: parsePHP("800") },
            { categoryId: groceries.id, accountId: bdo.id, amountCents: parsePHP("200") },
          ],
        })
      );
    });

    it('shows the category\'s budget on a repeated line, not "No budget"', async () => {
      const groceries = await householdCategory("Groceries");
      const bpi = await householdAccount();
      await secondHouseholdAccount();
      await setBudget(
        MEMBER,
        {
          categoryId: groceries.id,
          fromMonth: "2026-10",
          amountCents: parsePHP("3000"),
          accountId: bpi.id,
        },
        "2026-11"
      );
      renderDistribute("income", bpi.id);
      await screen.findByLabelText("Groceries");

      await addGroceries();

      await waitFor(() => expect(screen.getAllByLabelText("Groceries")).toHaveLength(2));
      expect(screen.queryByText("No budget")).not.toBeInTheDocument();
    });

    it("flags the second line for the same account, refuses to submit, and clears on a new account", async () => {
      await twoGroceriesLines();
      await sendSecondLineTo("BPI");

      const error = await screen.findByText("Already on a line for this account");
      const accounts = screen.getAllByLabelText("Groceries goes to");
      expect(accounts).toHaveLength(2);
      const [firstAccount, secondAccount] = accounts;
      expect(secondAccount).toHaveAttribute("aria-invalid", "true");
      expect(secondAccount).toHaveAccessibleDescription("Already on a line for this account");
      expect(firstAccount).not.toHaveAttribute("aria-invalid");
      expect(error.closest("li")).toBe(secondAccount!.closest("li"));

      fireEvent.change(screen.getAllByLabelText("Groceries")[0]!, { target: { value: "800" } });
      fireEvent.click(screen.getByRole("button", { name: "Distribute" }));
      await screen.findByText(/Two Groceries lines go to the same account/);
      expect(distributeMoney).not.toHaveBeenCalled();

      await sendSecondLineTo("BDO");
      await waitFor(() =>
        expect(screen.queryByText("Already on a line for this account")).not.toBeInTheDocument()
      );
      expect(screen.getAllByLabelText("Groceries goes to")[1]).not.toHaveAttribute("aria-invalid");
    });
  });
});
