/**
 * Route-level tests for the transactions page's narrow-layout tap semantics
 * (mobile UX review R14/R38):
 * - tapping a card opens the read-only detail Sheet, NOT the edit form
 * - the sheet's explicit Edit button closes the sheet and opens the form
 * - the table's Edit pencil opens the edit form DIRECTLY (an explicit edit
 *   control must never land on the read-only sheet)
 * - the sheet's Delete/status buttons reuse the table's mutation paths:
 *   delete confirms + closes the sheet, status toggle keeps it open
 * - the filtered In/Out totals render inline (they are pane-only on wide)
 *
 * Mounts the REAL route file (createFileRoute instance re-parented onto a
 * minimal test root, the same `.update()` wiring routeTree.gen.ts uses) so
 * the handleRowClick/isNarrow/sheet glue in routes/transactions.tsx is what
 * is under test, not a re-implementation.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { Route as TransactionsRouteImport } from "@/routes/transactions";
import { confirm } from "@/lib/confirm";
import { handleTransactionDelete } from "@/lib/debts";
import { formatPHP } from "@/lib/currency";
import type { TransactionWithRelations } from "@/types/transactions";

// Radix components measure via ResizeObserver, which jsdom lacks
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof globalThis.ResizeObserver;

// Narrow by default: the route's useContainerNarrow(1500) decides sheet vs
// detail pane, TransactionList's useContainerNarrow(640) decides cards vs
// table. Both narrow = the phone scenario under test. Tests override the
// implementation (keyed by the breakpoint argument) to model the mid-width
// window where the route is narrow but the list still renders the table.
const containerNarrow = vi.fn((_breakpointPx: number): boolean => true);
vi.mock("@/hooks/useContainerWidth", () => ({
  useContainerNarrow: (breakpointPx: number) => [vi.fn(), containerNarrow(breakpointPx)],
}));

// The edit form is out of scope here; a marker is enough to assert the
// Edit hand-off opened it with the right transaction.
vi.mock("@/components/TransactionFormDialog", () => ({
  TransactionFormDialog: ({ open, editingId }: { open: boolean; editingId: string | null }) =>
    open ? <div data-testid="transaction-form" data-editing-id={editingId ?? ""} /> : null,
}));

vi.mock("@/hooks/usePrefetchTransactionData", () => ({
  usePrefetchTransactionData: () => {},
}));

const mockTransactionsQuery = vi.fn(
  (): {
    data: TransactionWithRelations[] | undefined;
    isLoading: boolean;
    fetchNextPage: ReturnType<typeof vi.fn>;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
  } => ({
    data: [],
    isLoading: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  })
);
const mockTransactionQuery = vi.fn(
  (): { data: TransactionWithRelations | undefined; isLoading: boolean } => ({
    data: undefined,
    isLoading: false,
  })
);
// Server-side filter summary (count + In/Out totals over the WHOLE filtered
// set, review R10); undefined models "still loading / no answer yet"
const mockFilterSummaryQuery = vi.fn(
  (): { data: { count: number; totalInCents: number; totalOutCents: number } | undefined } => ({
    data: undefined,
  })
);

// Hoisted so the sheet-action tests can assert on the exact mutation calls
const toggleMutate = vi.fn();
const deleteMutateAsync = vi.fn();

vi.mock("@/lib/supabaseQueries", () => ({
  useTransactions: () => mockTransactionsQuery(),
  useTransactionsFilterSummary: () => mockFilterSummaryQuery(),
  useTransaction: () => mockTransactionQuery(),
  useAccounts: () => ({ data: [] }),
  useCategoriesGrouped: () => ({ data: [], isLoading: false }),
  useToggleTransactionStatus: () => ({ mutate: toggleMutate }),
  useSetTransactionStatus: () => ({ mutateAsync: vi.fn() }),
  useDeleteTransaction: () => ({ mutateAsync: deleteMutateAsync }),
}));

// Honor the hook's defaultResult (third arg) like the real initial render:
// TransactionList passes none (sync-status Map fallback), CategorySelector's
// recent-categories query passes [] (mobile UX 6.8).
vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: (_querier: unknown, _deps?: unknown, defaultResult?: unknown) =>
    defaultResult ?? new Map<string, never>(),
}));

vi.mock("@/lib/debts", () => ({
  handleTransactionDelete: vi.fn(),
}));

// Destructive confirms go through the app-level AlertDialog mechanism
// (@/lib/confirm, review R39); the host isn't mounted here, so mock it
vi.mock("@/lib/confirm", () => ({
  confirm: vi.fn().mockResolvedValue(false),
}));

// jsdom has no layout; render every row (see TransactionList.test.tsx)
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => opts.count * opts.estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, index) => ({
        index,
        key: index,
        start: index * opts.estimateSize(),
        size: opts.estimateSize(),
        end: (index + 1) * opts.estimateSize(),
        lane: 0,
      })),
    measureElement: () => {},
    measure: () => {},
  }),
}));

function buildTransaction(overrides: Partial<TransactionWithRelations>): TransactionWithRelations {
  return {
    id: "txn-1",
    household_id: "hh-1",
    date: "2026-07-01",
    description: "Groceries",
    amount_cents: 150050,
    type: "expense",
    currency_code: "PHP",
    account_id: null,
    category_id: null,
    transfer_group_id: null,
    debt_id: null,
    internal_debt_id: null,
    status: "pending",
    visibility: "household",
    created_by_user_id: "user-1",
    tagged_user_ids: [],
    notes: null,
    import_key: null,
    device_id: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    account: null,
    category: null,
    ...overrides,
  };
}

const groceries = buildTransaction({ id: "txn-1", description: "Groceries" });
const salary = buildTransaction({
  id: "txn-2",
  description: "Salary",
  amount_cents: 500000,
  type: "income",
});

async function renderTransactionsRoute() {
  const rootRoute = createRootRoute({ component: Outlet });
  const transactionsRoute = TransactionsRouteImport.update({
    id: "/transactions",
    path: "/transactions",
    getParentRoute: () => rootRoute,
  } as unknown as Parameters<typeof TransactionsRouteImport.update>[0]);
  const router = createRouter({
    routeTree: rootRoute.addChildren([transactionsRoute]),
    history: createMemoryHistory({ initialEntries: ["/transactions"] }),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  // Wait for the route to mount
  await screen.findByText("Track your income and expenses");
}

beforeEach(() => {
  containerNarrow.mockImplementation(() => true);
  mockTransactionsQuery.mockReturnValue({
    data: [groceries, salary],
    isLoading: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  });
  mockTransactionQuery.mockReturnValue({ data: groceries, isLoading: false });
  mockFilterSummaryQuery.mockReturnValue({ data: undefined });
});

describe("transactions route on narrow layouts (R14/R38)", () => {
  it("shows the filtered In/Out totals inline (loaded-page fallback while the summary loads)", async () => {
    await renderTransactionsRoute();

    expect(screen.getByText(`In ${formatPHP(500000)}`)).toBeInTheDocument();
    expect(screen.getByText(`Out ${formatPHP(150050)}`)).toBeInTheDocument();
  });

  it("uses the server summary for the count and In/Out totals once it resolves (R10)", async () => {
    // 500 matching rows on the server, only 2 loaded: the header must report
    // the full filtered set, not the loaded pages
    mockFilterSummaryQuery.mockReturnValue({
      data: { count: 500, totalInCents: 777700, totalOutCents: 555500 },
    });
    await renderTransactionsRoute();

    expect(screen.getByText("500 transactions")).toBeInTheDocument();
    expect(screen.getByText(`In ${formatPHP(777700)}`)).toBeInTheDocument();
    expect(screen.getByText(`Out ${formatPHP(555500)}`)).toBeInTheDocument();
  });

  it("opens the read-only detail sheet on card tap instead of the edit form", async () => {
    await renderTransactionsRoute();

    fireEvent.click(screen.getByRole("button", { name: "View Groceries" }));

    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Groceries")).toBeInTheDocument();
    expect(within(sheet).getByText(formatPHP(150050))).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    // No direct jump into the edit form
    expect(screen.queryByTestId("transaction-form")).not.toBeInTheDocument();
  });

  it("Edit from the sheet closes it and opens the edit form for that transaction", async () => {
    await renderTransactionsRoute();

    fireEvent.click(screen.getByRole("button", { name: "View Groceries" }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Edit" }));

    const form = await screen.findByTestId("transaction-form");
    expect(form).toHaveAttribute("data-editing-id", "txn-1");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("opens the edit form directly from the table's Edit pencil", async () => {
    // 640 ≤ container < 1500: the list renders the TABLE (pencil visible) but
    // the route is still narrow (row taps inspect in the sheet). The pencil
    // is an explicit edit intent and must bypass the read-only sheet.
    containerNarrow.mockImplementation((breakpointPx) => breakpointPx > 640);
    await renderTransactionsRoute();

    fireEvent.click(screen.getByLabelText("Edit Groceries"));

    const form = await screen.findByTestId("transaction-form");
    expect(form).toHaveAttribute("data-editing-id", "txn-1");
    // The read-only sheet never opened
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("deletes from the sheet's Delete button and closes the sheet", async () => {
    vi.mocked(confirm).mockResolvedValueOnce(true);
    await renderTransactionsRoute();

    fireEvent.click(screen.getByRole("button", { name: "View Groceries" }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Delete" }));

    // Same flow as the table's per-row Delete: confirm → debt reversal FIRST
    // → delete mutation (shared via confirmAndDeleteTransaction)
    expect(vi.mocked(confirm)).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Delete transaction "Groceries"?' })
    );
    await waitFor(() => {
      expect(vi.mocked(handleTransactionDelete)).toHaveBeenCalledWith({ transaction_id: "txn-1" });
      expect(deleteMutateAsync).toHaveBeenCalledWith("txn-1");
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("keeps the sheet open and deletes nothing when the confirm is cancelled", async () => {
    vi.mocked(confirm).mockResolvedValueOnce(false);
    await renderTransactionsRoute();

    fireEvent.click(screen.getByRole("button", { name: "View Groceries" }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Delete" }));

    // The confirm resolves asynchronously; give the cancelled path a tick
    await waitFor(() => expect(vi.mocked(confirm)).toHaveBeenCalled());
    expect(deleteMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("toggles status from the sheet and keeps it open", async () => {
    await renderTransactionsRoute();

    fireEvent.click(screen.getByRole("button", { name: "View Groceries" }));
    const sheet = await screen.findByRole("dialog");

    // Groceries is pending, so the toggle offers "Mark cleared"
    fireEvent.click(within(sheet).getByRole("button", { name: "Mark cleared" }));

    expect(toggleMutate).toHaveBeenCalledWith(
      "txn-1",
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    // The sheet stays open (label refreshes via the invalidated query)
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("labels the status toggle from the transaction's current status", async () => {
    mockTransactionQuery.mockReturnValue({
      data: { ...groceries, status: "cleared" },
      isLoading: false,
    });
    await renderTransactionsRoute();

    fireEvent.click(screen.getByRole("button", { name: "View Groceries" }));
    const sheet = await screen.findByRole("dialog");

    expect(within(sheet).getByRole("button", { name: "Mark pending" })).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Mark cleared" })).not.toBeInTheDocument();
  });
});
