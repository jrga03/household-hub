/**
 * Tests for TransactionList's dual presentation (mobile UX review R6, R14):
 * - table on wide containers, card list on narrow containers (decided by the
 *   list's own container width via useContainerNarrow, mocked here)
 * - whole row / whole card tap calls onEdit
 * - inner controls (checkbox, status toggle, delete) stop propagation so a
 *   tap on them never counts as a row tap
 * - the Edit pencil is an explicit edit intent: it routes through
 *   onRequestEdit when the host provides it (hosts whose onEdit merely
 *   inspects), falling back to onEdit otherwise
 * - card selection keeps the bulk-actions toolbar reachable
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TransactionList } from "./TransactionList";
import { confirm } from "@/lib/confirm";
import { formatPHP } from "@/lib/currency";
import type { TransactionWithRelations } from "@/types/transactions";

const mockIsNarrow = vi.fn((): boolean => false);
vi.mock("@/hooks/useContainerWidth", () => ({
  useContainerNarrow: () => [vi.fn(), mockIsNarrow()],
}));

interface MockTransactionsResult {
  data: TransactionWithRelations[] | undefined;
  isLoading: boolean;
  fetchNextPage: ReturnType<typeof vi.fn>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}

const fetchNextPage = vi.fn();
const mockTransactionsQuery = vi.fn(
  (): MockTransactionsResult => ({
    data: [],
    isLoading: false,
    fetchNextPage,
    hasNextPage: false,
    isFetchingNextPage: false,
  })
);
const toggleMutate = vi.fn();

vi.mock("@/lib/supabaseQueries", () => ({
  useTransactions: () => mockTransactionsQuery(),
  useToggleTransactionStatus: () => ({ mutate: toggleMutate }),
  useSetTransactionStatus: () => ({ mutateAsync: vi.fn() }),
  useDeleteTransaction: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: () => new Map<string, never>(),
}));

vi.mock("@/lib/debts", () => ({
  handleTransactionDelete: vi.fn(),
}));

// Destructive confirms go through the app-level AlertDialog mechanism
// (@/lib/confirm, review R39); the host isn't mounted here, so mock it
vi.mock("@/lib/confirm", () => ({
  confirm: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/stores/navStore", () => ({
  useNavStore: (selector: (state: { setQuickAddOpen: (open: boolean) => void }) => unknown) =>
    selector({ setQuickAddOpen: vi.fn() }),
}));

// jsdom has no layout: the real virtualizer measures a 0-height scroll
// element and renders nothing. Render every row instead — virtualization
// itself is not under test here, row interaction is.
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

const fixtures = [
  buildTransaction({ id: "txn-1", description: "Groceries", amount_cents: 150050 }),
  buildTransaction({
    id: "txn-2",
    description: "Salary",
    amount_cents: 500000,
    type: "income",
    category: { id: "cat-1", name: "Income", color: "#00ff00" },
  }),
];

function renderList(onEdit = vi.fn(), onRequestEdit?: (id: string) => void, totalCount?: number) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <TransactionList onEdit={onEdit} onRequestEdit={onRequestEdit} totalCount={totalCount} />
    </QueryClientProvider>
  );
  return onEdit;
}

function mockQueryResult(overrides: Partial<MockTransactionsResult> = {}) {
  mockTransactionsQuery.mockReturnValue({
    data: fixtures,
    isLoading: false,
    fetchNextPage,
    hasNextPage: false,
    isFetchingNextPage: false,
    ...overrides,
  });
}

beforeEach(() => {
  mockIsNarrow.mockReturnValue(false);
  mockQueryResult();
});

describe("TransactionList presentation modes (R6)", () => {
  it("renders the table on wide containers", () => {
    renderList();

    expect(document.querySelector("table")).toBeInTheDocument();
    expect(screen.getAllByTestId("transaction-row")).toHaveLength(2);
    expect(screen.getByText("Groceries")).toBeInTheDocument();
  });

  it("renders a card list instead of the table on narrow containers", () => {
    mockIsNarrow.mockReturnValue(true);
    renderList();

    expect(document.querySelector("table")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("transaction-row")).toHaveLength(2);
    // Signed amount stays visible on the card (the whole point of R6)
    expect(screen.getByText(`-${formatPHP(150050)}`)).toBeInTheDocument();
    expect(screen.getByText(`+${formatPHP(500000)}`)).toBeInTheDocument();
    // Category meta from the RecentTransactions pattern
    expect(screen.getByText("Income")).toBeInTheDocument();
    // Bulk selection entry points survive the mode switch
    expect(screen.getByLabelText("Select all")).toBeInTheDocument();
  });
});

describe("row/card tap semantics (R14)", () => {
  it("calls onEdit when a card is tapped", () => {
    mockIsNarrow.mockReturnValue(true);
    const onEdit = renderList();

    fireEvent.click(screen.getByRole("button", { name: "View Groceries" }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith("txn-1");
  });

  it("selects via the card checkbox without triggering the card tap", () => {
    mockIsNarrow.mockReturnValue(true);
    const onEdit = renderList();

    fireEvent.click(screen.getByLabelText("Select Groceries"));

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText("1 of 2 selected")).toBeInTheDocument();
  });

  it("calls onEdit when a table row is clicked", () => {
    const onEdit = renderList();

    fireEvent.click(screen.getAllByTestId("transaction-row")[0]);

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith("txn-1");
  });

  it("stops propagation on the table row's inner controls", () => {
    const onEdit = renderList();

    fireEvent.click(screen.getByLabelText("Select Groceries"));
    fireEvent.click(screen.getByLabelText("Mark Groceries as cleared"));
    fireEvent.click(screen.getByLabelText("Delete Groceries"));

    // None of the inner controls opened the row (onEdit not called by them)
    expect(onEdit).not.toHaveBeenCalled();
    // ... but they still did their own jobs
    expect(toggleMutate).toHaveBeenCalledWith("txn-1");
    expect(vi.mocked(confirm)).toHaveBeenCalled();
    expect(screen.getByText("1 of 2 selected")).toBeInTheDocument();

    // Without onRequestEdit the Edit pencil falls back to onEdit, exactly once
    fireEvent.click(screen.getByLabelText("Edit Groceries"));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith("txn-1");
  });

  it("routes the Edit pencil through onRequestEdit when provided", () => {
    const onEdit = vi.fn();
    const onRequestEdit = vi.fn();
    renderList(onEdit, onRequestEdit);

    // Pencil = explicit edit intent: must NOT go through onEdit (which the
    // transactions route maps to the read-only inspection sheet on narrow)
    fireEvent.click(screen.getByLabelText("Edit Groceries"));
    expect(onRequestEdit).toHaveBeenCalledTimes(1);
    expect(onRequestEdit).toHaveBeenCalledWith("txn-1");
    expect(onEdit).not.toHaveBeenCalled();

    // Row taps keep going through onEdit
    fireEvent.click(screen.getAllByTestId("transaction-row")[0]);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith("txn-1");
    expect(onRequestEdit).toHaveBeenCalledTimes(1);
  });
});

describe("infinite pagination (R10)", () => {
  // The virtualizer mock renders EVERY row, so the last virtual index always
  // sits at the end of the loaded list — exactly the "scrolled near the end"
  // condition the fetch-next effect watches for.
  it("fetches the next page when the last virtual row nears the end", () => {
    mockQueryResult({ hasNextPage: true });
    renderList();

    expect(fetchNextPage).toHaveBeenCalled();
  });

  it("does not fetch when there is no next page", () => {
    mockQueryResult({ hasNextPage: false });
    renderList();

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("does not re-fetch while a next page is already loading", () => {
    mockQueryResult({ hasNextPage: true, isFetchingNextPage: true });
    renderList();

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("shows a small loading row while the next page is fetching", () => {
    mockQueryResult({ isFetchingNextPage: true });
    renderList();

    expect(screen.getByText("Loading more transactions…")).toBeInTheDocument();
  });

  it("uses the server total for the selection label when provided", () => {
    renderList(vi.fn(), undefined, 500);

    fireEvent.click(screen.getByLabelText("Select Groceries"));

    // Honest label: selection covers loaded rows, count shows the full
    // filtered set from the server summary
    expect(screen.getByText("1 of 500 selected")).toBeInTheDocument();
  });
});
