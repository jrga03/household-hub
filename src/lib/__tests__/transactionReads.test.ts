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
  for (const method of ["select", "gte", "lte", "is", "eq", "not", "order"]) {
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

const range = { startDate: "2026-04-01", endDate: "2026-09-30" };

describe("analytics transaction reads", () => {
  beforeEach(() => vi.mocked(supabase.from).mockReset());

  it("excludes transfers and applies the date range and filters", async () => {
    const calls = mockFrom({ data: [{ id: "t1" }], error: null });

    const rows = await fetchAnalyticsTransactions(range, {
      accountId: "acc-1",
      categoryId: "cat-1",
      type: "expense",
    });

    expect(supabase.from).toHaveBeenCalledWith("transactions");
    expect(calls).toEqual([
      ["select", ["*, categories(name)"]],
      ["gte", ["date", "2026-04-01"]],
      ["lte", ["date", "2026-09-30"]],
      ["is", ["transfer_group_id", null]],
      ["eq", ["account_id", "acc-1"]],
      ["eq", ["category_id", "cat-1"]],
      ["eq", ["type", "expense"]],
    ]);
    expect(rows).toEqual([{ id: "t1" }]);
  });

  it("selects only type and amount for totals, still excluding transfers", async () => {
    const calls = mockFrom({ data: null, error: null });

    const rows = await fetchAnalyticsTransactionTotals(range);

    expect(calls).toEqual([
      ["select", ["type, amount_cents"]],
      ["gte", ["date", "2026-04-01"]],
      ["lte", ["date", "2026-09-30"]],
      ["is", ["transfer_group_id", null]],
    ]);
    expect(rows).toEqual([]);
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
