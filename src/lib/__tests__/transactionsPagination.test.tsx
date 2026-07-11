/**
 * Hook-level tests for the paged transactions list and the filter-summary
 * RPC (mobile UX review R10, plan item 7.1):
 * - useTransactions pages via .range() windows and flattens pages for
 *   consumers, with getNextPageParam driven by page fullness
 * - the unsynced-Dexie-row overlay (review R9) is merged over the FLATTENED
 *   list, so a local row cannot duplicate its server echo across pages
 * - the offline fallback mirrors the same paging window from Dexie
 * - useTransactionsFilterSummary maps the RPC row, and falls back to a
 *   full-local-dataset Dexie computation when the RPC fails
 *
 * Only the network boundary (@/lib/supabase) is mocked; the overlay and
 * fallback reads run against the real Dexie tables backed by fake-indexeddb.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { TransactionWithRelations } from "@/types/transactions";
import type { SyncQueueItem } from "@/types/sync";

vi.mock("@/lib/supabase", () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

// The overlay is scoped to the signed-in user (shared-device rule)
vi.mock("@/stores/authStore", () => ({
  useAuthStore: { getState: () => ({ user: { id: "user-1" } }) },
}));

import { supabase } from "@/lib/supabase";
import { db, type LocalTransaction } from "@/lib/dexie/db";
import {
  useTransactions,
  useTransactionsFilterSummary,
  TRANSACTIONS_PAGE_SIZE,
} from "@/lib/supabaseQueries";

// ─── Helpers ─────────────────────────────────────

function makeServerRow(id: string, date: string, createdAt: string): TransactionWithRelations {
  return {
    id,
    household_id: "hh-1",
    date,
    description: `server ${id}`,
    amount_cents: 10000,
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
    created_at: createdAt,
    updated_at: createdAt,
    account: null,
    category: null,
  };
}

function makeLocalTransaction(overrides: Partial<LocalTransaction> = {}): LocalTransaction {
  return {
    id: crypto.randomUUID(),
    household_id: "hh-1",
    date: "2026-07-01",
    description: "local transaction",
    amount_cents: 10000,
    type: "expense",
    currency_code: "PHP",
    status: "pending",
    visibility: "household",
    created_by_user_id: "user-1",
    tagged_user_ids: [],
    device_id: "dev-1",
    created_at: "2026-07-01T10:00:00.000Z",
    updated_at: "2026-07-01T10:00:00.000Z",
    ...overrides,
  };
}

function makeQueueItem(entityId: string): SyncQueueItem {
  return {
    id: crypto.randomUUID(),
    household_id: "hh-1",
    entity_type: "transaction",
    entity_id: entityId,
    operation: {
      op: "create",
      payload: {},
      idempotencyKey: `key-${entityId}`,
      lamportClock: 1,
    },
    device_id: "dev-1",
    user_id: "user-1",
    status: "queued",
    retry_count: 0,
    max_retries: 3,
    error_message: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    synced_at: null,
    next_retry_at: null,
  };
}

/**
 * Sorted (date desc, created_at desc) synthetic server dataset. Index 0 is
 * the newest row; dates step backwards one day per row.
 */
function makeServerDataset(count: number): TransactionWithRelations[] {
  const base = new Date("2026-07-01T10:00:00.000Z");
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base.getTime() - i * 24 * 60 * 60 * 1000);
    const date = d.toISOString().slice(0, 10);
    return makeServerRow(`srv-${String(i).padStart(3, "0")}`, date, d.toISOString());
  });
}

type RangeResult = { data: TransactionWithRelations[] | null; error: unknown };

/**
 * Mocks the supabase query-builder chain used by useTransactions. Every
 * chained filter method returns the builder; awaiting .range(from, to)
 * resolves via `rangeImpl`.
 */
function mockTransactionsRange(rangeImpl: (from: number, to: number) => RangeResult) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "order", "gte", "lte", "eq", "is", "or"]) {
    builder[method] = vi.fn(() => builder);
  }
  const range = vi.fn((from: number, to: number) => Promise.resolve(rangeImpl(from, to)));
  builder.range = range;
  vi.mocked(supabase.from).mockReturnValue(builder as never);
  return { range };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(async () => {
  vi.mocked(supabase.from).mockReset();
  vi.mocked(supabase.rpc).mockReset();
  await db.transactions.clear();
  await db.syncQueue.clear();
  await db.accounts.clear();
  await db.categories.clear();
});

// ─── useTransactions paging ──────────────────────

describe("useTransactions infinite pagination (R10)", () => {
  it("fetches .range() pages of TRANSACTIONS_PAGE_SIZE and flattens them", async () => {
    const dataset = makeServerDataset(TRANSACTIONS_PAGE_SIZE * 2 + 20); // 120
    const { range } = mockTransactionsRange((from, to) => ({
      data: dataset.slice(from, to + 1),
      error: null,
    }));

    const { result } = renderHook(() => useTransactions(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(range).toHaveBeenCalledWith(0, TRANSACTIONS_PAGE_SIZE - 1);
    expect(result.current.data).toHaveLength(TRANSACTIONS_PAGE_SIZE);
    expect(result.current.hasNextPage).toBe(true); // full page → maybe more

    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data).toHaveLength(TRANSACTIONS_PAGE_SIZE * 2));
    expect(range).toHaveBeenCalledWith(TRANSACTIONS_PAGE_SIZE, TRANSACTIONS_PAGE_SIZE * 2 - 1);

    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data).toHaveLength(120));
    // Short page (20 < page size) ends pagination
    expect(result.current.hasNextPage).toBe(false);
    // Flattened order is preserved
    expect(result.current.data?.[0].id).toBe("srv-000");
    expect(result.current.data?.[119].id).toBe("srv-119");
  });

  it("overlays an unsynced local row once across page boundaries (local wins)", async () => {
    const dataset = makeServerDataset(TRANSACTIONS_PAGE_SIZE + 5);
    // Server echo of the local row sits in PAGE 2's window
    const echoIndex = TRANSACTIONS_PAGE_SIZE + 2;
    const echo = dataset[echoIndex];
    const localEdit = makeLocalTransaction({
      id: echo.id,
      date: echo.date,
      created_at: echo.created_at,
      updated_at: echo.updated_at,
      description: "local unsynced edit",
    });
    await db.transactions.add(localEdit);
    await db.syncQueue.add(makeQueueItem(echo.id));

    mockTransactionsRange((from, to) => ({ data: dataset.slice(from, to + 1), error: null }));

    const { result } = renderHook(() => useTransactions(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Page 1 loaded: the overlay adds the local row even though its server
    // echo hasn't been fetched yet (review R9)
    const afterPage1 = result.current.data ?? [];
    expect(afterPage1.filter((t) => t.id === echo.id)).toHaveLength(1);
    expect(afterPage1.find((t) => t.id === echo.id)?.description).toBe("local unsynced edit");

    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data?.length).toBe(TRANSACTIONS_PAGE_SIZE + 5));

    // Page 2 delivered the server echo: still exactly one row, local wins
    const afterPage2 = result.current.data ?? [];
    expect(afterPage2.filter((t) => t.id === echo.id)).toHaveLength(1);
    expect(afterPage2.find((t) => t.id === echo.id)?.description).toBe("local unsynced edit");
  });

  it("pages the Dexie fallback with the same offset/limit when the network fails", async () => {
    mockTransactionsRange(() => {
      throw new Error("Failed to fetch");
    });

    // 60 local rows, newest first by created_at
    await db.transactions.bulkAdd(
      Array.from({ length: 60 }, (_, i) =>
        makeLocalTransaction({
          id: `loc-${String(i).padStart(2, "0")}`,
          date: "2026-07-01",
          created_at: `2026-07-01T10:${String(59 - i).padStart(2, "0")}:00.000Z`,
        })
      )
    );

    const { result } = renderHook(() => useTransactions(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(TRANSACTIONS_PAGE_SIZE);
    expect(result.current.data?.[0].id).toBe("loc-00"); // newest created_at first
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data).toHaveLength(60));
    // Short second page (10 rows) ends pagination offline too
    expect(result.current.hasNextPage).toBe(false);
  });
});

// ─── useTransactionsFilterSummary ────────────────

describe("useTransactionsFilterSummary (R10)", () => {
  it("maps the RPC row and passes the mirrored filter params", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ txn_count: 250, total_in_cents: 1234500, total_out_cents: 987600 }],
      error: null,
    } as never);

    const { result } = renderHook(
      () => useTransactionsFilterSummary({ type: "expense", search: "grocery" }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      count: 250,
      totalInCents: 1234500,
      totalOutCents: 987600,
    });
    expect(supabase.rpc).toHaveBeenCalledWith("transactions_filter_summary", {
      p_date_from: null,
      p_date_to: null,
      p_account_id: null,
      p_category_id: null,
      p_status: null,
      p_type: "expense",
      p_amount_min: null,
      p_amount_max: null,
      p_search: "grocery",
      p_exclude_transfers: true, // CRITICAL default: transfers excluded
    });
  });

  it("sends p_exclude_transfers false only when explicitly requested", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);

    const { result } = renderHook(() => useTransactionsFilterSummary({ excludeTransfers: false }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledWith(
      "transactions_filter_summary",
      expect.objectContaining({ p_exclude_transfers: false })
    );
    // Empty RPC result degrades to zeros, not a crash
    expect(result.current.data).toEqual({ count: 0, totalInCents: 0, totalOutCents: 0 });
  });

  it("falls back to a full-dataset Dexie summary when the RPC fails", async () => {
    vi.mocked(supabase.rpc).mockRejectedValue(new Error("Failed to fetch"));

    await db.transactions.bulkAdd([
      makeLocalTransaction({ id: "t1", type: "income", amount_cents: 500000 }),
      makeLocalTransaction({ id: "t2", type: "expense", amount_cents: 150050 }),
      // Transfer leg must stay excluded in the fallback too
      makeLocalTransaction({
        id: "t3",
        type: "expense",
        amount_cents: 700000,
        transfer_group_id: "tg-1",
      }),
    ]);

    const { result } = renderHook(() => useTransactionsFilterSummary(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // All three numbers from ONE source (the local dataset)
    expect(result.current.data).toEqual({
      count: 2,
      totalInCents: 500000,
      totalOutCents: 150050,
    });
  });

  it("rethrows non-network RPC errors (e.g. function missing) instead of serving local numbers", async () => {
    // A missing/undeployed RPC while ONLINE must surface as a query error so
    // the route derives header numbers from the loaded pages (one source),
    // never sparse local-mirror totals rendered next to a server list.
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: new Error("function transactions_filter_summary does not exist"),
    } as never);

    await db.transactions.add(
      makeLocalTransaction({ id: "t1", type: "expense", amount_cents: 4200 })
    );

    const { result } = renderHook(() => useTransactionsFilterSummary(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it("falls back to local numbers when the RPC fails with a network error", async () => {
    vi.mocked(supabase.rpc).mockRejectedValue(new TypeError("Failed to fetch"));

    await db.transactions.add(
      makeLocalTransaction({ id: "t1", type: "expense", amount_cents: 4200 })
    );

    const { result } = renderHook(() => useTransactionsFilterSummary(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ count: 1, totalInCents: 0, totalOutCents: 4200 });
  });
});
