import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { format } from "date-fns";
import { PageShell } from "@/components/layout/PageShell";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { createAccount } from "@/lib/commands/accounts";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { setBudget } from "@/lib/commands/budgets";
import { addTransaction } from "@/lib/commands/transactions";
import { parsePHP } from "@/lib/currency";
import { localMonth } from "@/lib/utils/dates";
import { FinancesSection } from "./FinancesSection";

vi.mock("@/hooks/useHousehold", () => ({
  useHousehold: () => ({ household: null, isOwner: false, isKnown: true }),
}));

const MEMBER = { householdId: "11111111-1111-4111-8111-111111111111", userId: "user-a" };
const today = () => format(new Date(), "yyyy-MM-dd");

function stubShellWidth(width: number) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        const entry = { target, contentRect: { width } } as ResizeObserverEntry;
        this.callback([entry], this as unknown as ResizeObserver);
      }
      disconnect() {}
    }
  );
}

function renderHome() {
  const rootRoute = createRootRoute();
  const routes = ["/", "/transactions", "/budget", "/accounts", "/review", "/import"].map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => (
        <PageShell variant="supporting-pane">
          <FinancesSection userId={MEMBER.userId} />
        </PageShell>
      ),
    })
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

const shownAccounts = async () =>
  within(await screen.findByRole("list", { name: "Balances" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

const blockStorage = () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("Blocked", "SecurityError");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Blocked", "SecurityError");
  });
};

const spend = (accountId: string, amount: string, categoryId: string | null = null) =>
  addTransaction(MEMBER, {
    date: today(),
    type: "expense",
    amountCents: parsePHP(amount),
    accountId,
    categoryId,
    description: "Spending",
  });

async function budgetedCategory(name: string, budget: string, spent: string) {
  const group = await createGroup(MEMBER, { name: `${name} group` });
  const { id } = await createCategory(MEMBER, { name, groupId: group.id });
  await setBudget(MEMBER, {
    categoryId: id,
    fromMonth: localMonth(new Date()),
    amountCents: parsePHP(budget),
    accountId: bpiId,
  });
  await spend(bpiId, spent, id);
  return id;
}

let bpiId: string;

beforeEach(async () => {
  await resetLocalDatabase();
  localStorage.clear();
  stubShellWidth(1000);
  bpiId = (
    await createAccount(MEMBER, {
      name: "BPI",
      type: "bank",
      startingBalanceCents: parsePHP("40000"),
    })
  ).id;
  await createAccount(MEMBER, {
    name: "Wallet",
    type: "cash",
    startingBalanceCents: parsePHP("500"),
    visibility: "personal",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("FinancesSection", () => {
  it("shows what is left this month as the one hero figure, with In, Out and Days left", async () => {
    await spend(bpiId, "250");
    renderHome();

    const hero = await screen.findByRole("region", { name: "Left this month" });
    expect(hero).toHaveTextContent("minus ₱250.00");
    const month = screen.getByRole("region", { name: "This month" });
    expect(month).toHaveTextContent(/In₱0\.00/);
    expect(month).toHaveTextContent(/Out−₱250\.00/);
    expect(month).toHaveTextContent(/Days left\d+/);
  });

  it("lists what needs attention, most urgent first, closed by the budgets that are fine", async () => {
    const diningId = await budgetedCategory("Dining out", "3000", "4230");
    await budgetedCategory("Groceries", "8000", "7000");
    await budgetedCategory("Rent", "15000", "15000");
    await spend(bpiId, "20000");
    renderHome();

    const feed = await screen.findByRole("list", { name: "Needs attention" });
    await waitFor(() => expect(within(feed).getAllByRole("link")).toHaveLength(4));
    const items = within(feed).getAllByRole("link");
    expect(items[0]).toHaveAccessibleName(/^Dining out is ₱1,230\.00 over/);
    expect(items[1]).toHaveAccessibleName(/^BPI is at minus ₱6,230\.00/);
    expect(items[2]).toHaveAccessibleName(/^Groceries has ₱1,000\.00 left/);
    expect(items[3]).toHaveAccessibleName(/^1 expense needs a category/);
    expect(within(items[0]!).getByText("Over budget")).toBeInTheDocument();
    expect(within(items[2]!).getByText("Close")).toBeInTheDocument();
    expect(items[0]).toHaveAttribute("href", `/budget?open=${diningId}`);
    expect(items[1]).toHaveAttribute("href", `/accounts?open=${bpiId}`);
    expect(items[3]).toHaveAttribute("href", "/review");
    expect(screen.getByText("1 budget is fine.")).toBeInTheDocument();
  });

  it("says nothing needs attention when all is well", async () => {
    renderHome();
    expect(await screen.findByText("Nothing needs attention.")).toBeInTheDocument();
  });

  it("shows a negative balance as short, and a card's owed amount plainly", async () => {
    const visa = await createAccount(MEMBER, {
      name: "Visa",
      type: "credit_card",
      startingBalanceCents: parsePHP("0"),
      payingAccountId: bpiId,
    });
    await spend(bpiId, "41000");
    await spend(visa.id, "2000");
    renderHome();

    const balances = await screen.findByRole("list", { name: "Balances" });
    const short = await within(balances).findByText("−₱1,000.00");
    expect(short.parentElement).toHaveClass("text-shortfall");
    const owed = within(balances).getByRole("link", { name: /^Visa/ });
    expect(owed).toHaveTextContent(/^VisaOwed ₱2,000\.00/);
    expect(
      within(owed).getByText("₱2,000.00", { selector: "[aria-hidden=true]" }).parentElement
    ).not.toHaveClass("text-shortfall");
  });

  it("puts Balances then Latest beside the main column from 840", async () => {
    renderHome();

    const side = await screen.findByRole("complementary");
    expect(
      within(side)
        .getAllByRole("heading")
        .map((heading) => heading.textContent)
    ).toEqual(["Balances", "Latest"]);
    expect(within(side).getByRole("link", { name: /BPI/ })).toHaveAttribute(
      "href",
      `/accounts?open=${bpiId}`
    );
    expect(within(side).getByRole("link", { name: "See all" })).toHaveAttribute(
      "href",
      "/transactions"
    );
  });

  it("stacks into one column below 840, with Budgets", async () => {
    stubShellWidth(600);
    renderHome();

    await screen.findByRole("list", { name: "Balances" });
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "Needs attention",
      "Latest",
      "Budgets",
      "Balances",
    ]);
    expect(screen.getByRole("link", { name: "Budget" })).toHaveAttribute("href", "/budget");
  });

  it("opens a latest transaction on Transactions", async () => {
    const { id } = await spend(bpiId, "250");
    renderHome();

    const latest = await screen.findByRole("list", { name: "Latest transactions" });
    expect(await within(latest).findByRole("link", { name: /Spending/ })).toHaveAttribute(
      "href",
      `/transactions?open=${id}`
    );
  });

  it("switches to Mine and remembers it on this device", async () => {
    const { unmount } = renderHome();
    expect(await shownAccounts()).toEqual([expect.stringContaining("BPI")]);

    fireEvent.click(screen.getByRole("radio", { name: "Mine" }));
    expect(await screen.findByRole("link", { name: /Wallet/ })).toBeInTheDocument();
    unmount();

    renderHome();
    expect(await screen.findByRole("radio", { name: "Mine" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(await shownAccounts()).toEqual([expect.stringContaining("Wallet")]);
  });

  it("still shows Household and switches when storage is blocked", async () => {
    blockStorage();
    renderHome();
    expect(await shownAccounts()).toEqual([expect.stringContaining("BPI")]);

    fireEvent.click(screen.getByRole("radio", { name: "Mine" }));
    expect(await screen.findByRole("link", { name: /Wallet/ })).toBeInTheDocument();
  });
});
