import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase";
import {
  fetchAnalyticsTransactions,
  fetchAnalyticsTransactionTotals,
  fetchTransferLegs,
} from "@/lib/supabaseQueries";

vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn() } }));

type Call = [method: string, args: unknown[]];

// Records every builder call and resolves like a PostgREST query when awaited.
function queryBuilder(result: { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {
    then: (resolve: (value: unknown) => void) => resolve(result),
  };
  for (const method of ["select", "gte", "lte", "is", "eq", "in", "not", "order"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  return { builder, calls };
}

function mockFrom(result: { data: unknown; error: unknown }) {
  const { builder, calls } = queryBuilder(result);
  vi.mocked(supabase.from).mockReturnValue(builder as never);
  return calls;
}

// One recorded builder per table, so a test can assert which relation each query read.
function mockTables(results: Record<string, { data: unknown; error: unknown }>) {
  const callsByTable: Record<string, Call[]> = {};
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const { builder, calls } = queryBuilder(results[table] ?? { data: [], error: null });
    callsByTable[table] = calls;
    return builder;
  }) as never);
  return callsByTable;
}

const range = { startDate: "2026-04-01", endDate: "2026-09-30" };

describe("analytics transaction reads", () => {
  beforeEach(() => vi.mocked(supabase.from).mockReset());

  it("reads the transfer-excluding view and applies the date range and filters", async () => {
    const calls = mockTables({
      categories: { data: [], error: null },
      transactions_non_transfer: { data: [{ id: "t1" }], error: null },
    });

    const rows = await fetchAnalyticsTransactions(range, {
      accountId: "acc-1",
      categoryId: "cat-1",
      type: "expense",
    });

    expect(supabase.from).not.toHaveBeenCalledWith("transactions");
    expect(calls.transactions_non_transfer).toEqual([
      ["select", ["*, categories(name)"]],
      ["gte", ["date", "2026-04-01"]],
      ["lte", ["date", "2026-09-30"]],
      ["eq", ["account_id", "acc-1"]],
      ["in", ["category_id", ["cat-1"]]],
      ["eq", ["type", "expense"]],
    ]);
    expect(rows).toEqual([{ id: "t1" }]);
  });

  it("expands a parent category to itself and its children", async () => {
    const calls = mockTables({
      categories: { data: [{ id: "child-1" }, { id: "child-2" }], error: null },
    });

    await fetchAnalyticsTransactions(range, { categoryId: "parent-1" });

    expect(calls.categories).toEqual([
      ["select", ["id"]],
      ["eq", ["parent_id", "parent-1"]],
    ]);
    expect(calls.transactions_non_transfer).toContainEqual([
      "in",
      ["category_id", ["parent-1", "child-1", "child-2"]],
    ]);
  });

  it("does not look up categories when no category filter is set", async () => {
    const calls = mockTables({});

    await fetchAnalyticsTransactions(range);

    expect(calls.categories).toBeUndefined();
  });

  it("selects only type and amount for totals, from the view", async () => {
    const calls = mockTables({ transactions_non_transfer: { data: null, error: null } });

    const rows = await fetchAnalyticsTransactionTotals(range);

    expect(calls.transactions_non_transfer).toEqual([
      ["select", ["type, amount_cents"]],
      ["gte", ["date", "2026-04-01"]],
      ["lte", ["date", "2026-09-30"]],
    ]);
    expect(rows).toEqual([]);
  });

  it("throws the category lookup error", async () => {
    const error = { message: "categories down" };
    mockTables({ categories: { data: null, error } });

    await expect(fetchAnalyticsTransactions(range, { categoryId: "cat-1" })).rejects.toBe(error);
  });

  it("throws the Supabase error", async () => {
    const error = { message: "boom" };
    mockFrom({ data: null, error });

    await expect(fetchAnalyticsTransactions(range)).rejects.toBe(error);
  });
});

describe("fetchTransferLegs", () => {
  beforeEach(() => vi.mocked(supabase.from).mockReset());

  it("reads only transfer rows for the household, newest first, unwrapping array joins", async () => {
    const calls = mockFrom({
      data: [
        {
          id: "t1",
          date: "2026-09-30",
          amount_cents: 1000,
          description: "Float",
          transfer_group_id: "g1",
          type: "expense",
          account: [{ id: "acc-1", name: "Checking" }],
        },
        {
          id: "t2",
          date: "2026-09-30",
          amount_cents: 1000,
          description: "Float",
          transfer_group_id: "g1",
          type: "income",
          account: null,
        },
      ],
      error: null,
    });

    const legs = await fetchTransferLegs("hh-1");

    expect(supabase.from).toHaveBeenCalledWith("transactions");
    expect(calls.slice(1)).toEqual([
      ["eq", ["household_id", "hh-1"]],
      ["not", ["transfer_group_id", "is", null]],
      ["order", ["date", { ascending: false }]],
    ]);
    expect(legs).toEqual([
      {
        id: "t1",
        date: "2026-09-30",
        amount_cents: 1000,
        description: "Float",
        transfer_group_id: "g1",
        type: "expense",
        account: { id: "acc-1", name: "Checking" },
      },
      {
        id: "t2",
        date: "2026-09-30",
        amount_cents: 1000,
        description: "Float",
        transfer_group_id: "g1",
        type: "income",
        account: null,
      },
    ]);
  });
});
