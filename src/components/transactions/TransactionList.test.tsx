import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider, queryOptions } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { format } from "date-fns";
import { readOpenItem } from "@/components/layout/DetailPane";
import { PageShell } from "@/components/layout/PageShell";
import { createAccount } from "@/lib/commands/accounts";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { addTransaction } from "@/lib/commands/transactions";
import { parsePHP } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { readTransactionFilter } from "@/lib/transactions/filter";
import { listTransactions } from "@/lib/transactions/projection";
import { monthLabel } from "@/lib/utils/dates";
import { TransactionList } from "./TransactionList";
import { HOUSEHOLD } from "@/test/events";

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

vi.mock("@/lib/household-members", () => ({
  householdMembersQueryOptions: (householdId: string) =>
    queryOptions({
      queryKey: ["household-members", householdId],
      queryFn: () => Promise.resolve([]),
    }),
}));

let shellWidth = 393;
const observers = new Set<FakeResizeObserver>();

class FakeResizeObserver {
  private readonly targets = new Set<Element>();
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.targets.add(target);
    observers.add(this);
    this.notify();
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
    observers.delete(this);
  }
  notify() {
    const entries = [...this.targets].map(
      (target) => ({ target, contentRect: { width: shellWidth } }) as ResizeObserverEntry
    );
    this.callback(entries, this as unknown as ResizeObserver);
  }
}

const originalResizeObserver = globalThis.ResizeObserver;
beforeEach(async () => {
  shellWidth = 393;
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  await resetLocalDatabase();
});
afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  observers.clear();
});

function renderTransactions(initialEntry: string) {
  const rootRoute = createRootRoute();
  const transactionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/transactions",
    validateSearch: (search: Record<string, unknown>) => ({
      ...readTransactionFilter(search),
      ...readOpenItem(search),
    }),
    component: function Transactions() {
      const { open: _open, ...filter } = transactionsRoute.useSearch();
      const navigate = transactionsRoute.useNavigate();
      return (
        <PageShell variant="list-detail">
          <TransactionList
            actor={MEMBER}
            filter={filter}
            onFilterChange={(next) => void navigate({ search: next })}
          />
        </PageShell>
      );
    },
  });
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const router = createRouter({ routeTree: rootRoute.addChildren([transactionsRoute]), history });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return history;
}

const localDate = (date: Date) => format(date, "yyyy-MM-dd");

async function recordMarket({ pending = false } = {}) {
  const account = await createAccount(MEMBER, {
    name: "BPI",
    type: "bank",
    startingBalanceCents: parsePHP("1000"),
  });
  return addTransaction(MEMBER, {
    date: localDate(new Date()),
    type: "expense",
    amountCents: parsePHP("250"),
    accountId: account.id,
    categoryId: null,
    description: "Market",
    status: pending ? "pending" : "cleared",
  });
}

describe("TransactionList", () => {
  it("drops a stale open id when no transactions are left", async () => {
    const history = renderTransactions("/transactions?open=gone");

    expect(await screen.findByText(/No transactions yet/)).toBeInTheDocument();
    await waitFor(() => expect(history.location.search).toBe(""));
  });

  it("shows only the date in each date heading, no amount", async () => {
    await recordMarket();
    renderTransactions("/transactions");

    const today = (await screen.findByRole("heading", { name: "Today" })).parentElement;
    expect(today).toHaveTextContent(/^Today$/);
  });

  it("names a month range in the Month chip, the year once when both ends share it", async () => {
    await recordMarket();
    renderTransactions("/transactions?from=2026-08&to=2026-10");
    expect(await screen.findByRole("combobox", { name: "Month: Aug – Oct 2026" })).toBeVisible();
  });

  it("names both years in the Month chip when a range crosses a year", async () => {
    await recordMarket();
    renderTransactions("/transactions?from=2025-11&to=2026-01");
    expect(
      await screen.findByRole("combobox", { name: "Month: Nov 2025 – Jan 2026" })
    ).toBeVisible();
  });

  it("replaces a range with the month picked", async () => {
    await recordMarket();
    const history = renderTransactions("/transactions?from=2026-08&to=2026-10");

    const chip = await screen.findByRole("combobox", { name: "Month: Aug – Oct 2026" });
    fireEvent.keyDown(chip, { key: "Enter" });
    const thisMonth = format(new Date(), "yyyy-MM");
    fireEvent.keyDown(await screen.findByRole("option", { name: monthLabel(thisMonth) }), {
      key: "Enter",
    });
    expect(
      await screen.findByRole("combobox", { name: `Month: ${monthLabel(thisMonth)}` })
    ).toBeVisible();
    expect(history.location.search).toBe(`?month=${thisMonth}`);
  });

  it("removes the visibility filter from its chip", async () => {
    await recordMarket();
    const history = renderTransactions("/transactions?visibility=household");

    const chip = await screen.findByRole("combobox", { name: "Visibility: Household" });
    fireEvent.keyDown(chip, { key: "Enter" });
    fireEvent.keyDown(await screen.findByRole("option", { name: "Any visibility" }), {
      key: "Enter",
    });
    expect(await screen.findByRole("combobox", { name: "Visibility" })).toBeVisible();
    expect(history.location.search).toBe("");
  });

  it("shows whose out-of-pocket expenses the list is narrowed to, and removes only that", async () => {
    await recordMarket();
    const history = renderTransactions("/transactions?owedTo=user-a&visibility=household");

    const chip = await screen.findByRole("button", { name: "Paid by you" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip);
    await waitFor(() => expect(history.location.search).toBe("?visibility=household"));
    expect(screen.queryByRole("button", { name: /^Paid by/ })).toBeNull();
  });

  it("names a payer it doesn't know as a member in the chip", async () => {
    await recordMarket();
    renderTransactions("/transactions?owedTo=user-gone");

    expect(await screen.findByRole("button", { name: "Paid by a member" })).toBeVisible();
  });

  it("shows the payer chip in the laptop's filter rail too", async () => {
    shellWidth = 1100;
    await recordMarket();
    renderTransactions("/transactions?owedTo=user-a");

    const rail = await screen.findByRole("search", { name: "Filter transactions" });
    expect(within(rail).getByRole("button", { name: "Paid by you" })).toBeVisible();
  });

  describe("beside the detail pane", () => {
    beforeEach(() => {
      shellWidth = 1100;
    });

    it("opens a row's detail on a click, but a quick action only acts", async () => {
      await recordMarket({ pending: true });
      const history = renderTransactions("/transactions");

      const table = await screen.findByRole("table", { name: "Transactions" });
      fireEvent.click(within(table).getByRole("button", { name: "Mark Market cleared" }));
      await waitFor(async () => expect((await listTransactions())[0]?.status).toBe("cleared"));
      expect(history.location.search).toBe("");

      fireEvent.click(within(table).getByRole("button", { name: /^(Pending )?Market$/ }));
      const pane = await screen.findByRole("region", { name: "Market" });
      expect(history.location.search).toMatch(/open=/);
      expect(pane).toHaveTextContent("−₱250.00");
      const cleared = within(pane).getByText("Cleared");
      expect(cleared.closest("[data-slot=badge]")).toBeNull();
      expect(within(pane).getByRole("button", { name: "Edit" })).toBeInTheDocument();
      expect(within(pane).getByRole("button", { name: "Mark pending" })).toBeInTheDocument();
      expect(within(pane).getByRole("button", { name: "Remove" })).toBeInTheDocument();
    });

    it("sums Spent for one category with no type, a refund netted against it", async () => {
      const account = await createAccount(MEMBER, {
        name: "BPI",
        type: "bank",
        startingBalanceCents: parsePHP("1000"),
      });
      const group = await createGroup(MEMBER, { name: "Food" });
      const groceries = await createCategory(MEMBER, { name: "Groceries", groupId: group.id });
      const entry = (type: "income" | "expense", amount: string) =>
        addTransaction(MEMBER, {
          date: localDate(new Date()),
          type,
          amountCents: parsePHP(amount),
          accountId: account.id,
          categoryId: groceries.id,
          description: type === "expense" ? "Market" : "Refund",
        });
      await entry("expense", "250");
      await entry("income", "40");
      const history = renderTransactions(`/transactions?category=${groceries.id}`);

      const summary = (await screen.findByText("Spent", { exact: false })).parentElement;
      expect(summary).toHaveTextContent("Spent ₱210.00");

      history.push(`/transactions?category=${groceries.id}&type=expense`);
      await waitFor(() => expect(screen.queryByText("Spent", { exact: false })).toBeNull());
      history.push("/transactions?category=unassigned");
      expect(await screen.findByText("Unassigned", { selector: "span" })).toBeVisible();
      expect(screen.queryByText("Spent", { exact: false })).toBeNull();
      history.push("/transactions");
      expect(await screen.findByRole("table", { name: "Transactions" })).toBeVisible();
      expect(screen.queryByText("Spent", { exact: false })).toBeNull();
    });

    it("shows the summary only while a filter is set", async () => {
      await recordMarket();
      const history = renderTransactions("/transactions");

      expect(await screen.findByRole("table", { name: "Transactions" })).toBeVisible();
      expect(screen.queryByText("1 transaction")).toBeNull();

      for (const search of ["type=expense", "query=Market", "status=cleared"]) {
        history.push(`/transactions?${search}`);
        expect(await screen.findByText("1 transaction")).toBeVisible();
        history.push("/transactions");
        await waitFor(() => expect(screen.queryByText("1 transaction")).toBeNull());
      }
    });

    it("folds the filter rail into a Filters button while the detail is open", async () => {
      await recordMarket();
      renderTransactions("/transactions");

      const table = await screen.findByRole("table", { name: "Transactions" });
      expect(screen.getByRole("search", { name: "Filter transactions" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();

      fireEvent.click(within(table).getByRole("button", { name: /^(Pending )?Market$/ }));
      const pane = await screen.findByRole("region", { name: "Market" });
      expect(screen.queryByRole("search", { name: "Filter transactions" })).toBeNull();
      expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();

      fireEvent.click(within(pane).getByRole("button", { name: "Close" }));
      expect(await screen.findByRole("search", { name: "Filter transactions" })).toBeVisible();
      expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();
    });
  });

  it("moves between the list and the table as the shell crosses 840", async () => {
    await recordMarket();
    renderTransactions("/transactions");
    expect(await screen.findByRole("list", { name: "Transactions" })).toBeInTheDocument();

    shellWidth = 1100;
    act(() => {
      for (const observer of observers) observer.notify();
    });
    expect(await screen.findByRole("table", { name: "Transactions" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Transactions" })).toBeNull();
  });

  it("names who paid an open out-of-pocket expense, in the list and the table", async () => {
    await recordMarket();
    const bpi = (await listTransactions())[0]?.accountId ?? "";
    await addTransaction(MEMBER, {
      date: localDate(new Date()),
      type: "expense",
      amountCents: parsePHP("300"),
      accountId: bpi,
      categoryId: null,
      description: "Rice",
      paidByUserId: MEMBER.userId,
    });
    renderTransactions("/transactions");

    const list = await screen.findByRole("list", { name: "Transactions" });
    await waitFor(() => expect(within(list).getByText(/Paid by you/)).toBeInTheDocument());
    expect(within(list).getAllByText(/Paid by/)).toHaveLength(1);

    shellWidth = 1100;
    act(() => {
      for (const observer of observers) observer.notify();
    });
    const table = await screen.findByRole("table", { name: "Transactions" });
    expect(within(table).getByText("Paid by you")).toBeInTheDocument();
  });
});
