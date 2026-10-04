import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  parseAccountBalanceDeltas,
  parseTransactionsFilterSummary,
} from "@/lib/validations/rpcResults";

describe("parseAccountBalanceDeltas", () => {
  it("accepts signed deltas (live local shape)", () => {
    const rows = parseAccountBalanceDeltas([
      {
        account_id: "a1",
        cleared_delta_cents: 4954950,
        pending_delta_cents: -2500,
        cleared_count: 2,
        pending_count: 1,
      },
    ]);
    expect(rows[0]?.pending_delta_cents).toBe(-2500);
  });

  it("treats null data as no rows", () => {
    expect(parseAccountBalanceDeltas(null)).toEqual([]);
  });

  it("rejects fractional cents", () => {
    expect(() =>
      parseAccountBalanceDeltas([
        {
          account_id: "a1",
          cleared_delta_cents: 1.5,
          pending_delta_cents: 0,
          cleared_count: 0,
          pending_count: 0,
        },
      ])
    ).toThrow(ZodError);
  });
});

describe("parseTransactionsFilterSummary", () => {
  it("takes the single row and defaults an empty result to zeros", () => {
    expect(
      parseTransactionsFilterSummary([{ txn_count: 3, total_in_cents: 100, total_out_cents: 250 }])
    ).toEqual({
      txn_count: 3,
      total_in_cents: 100,
      total_out_cents: 250,
    });
    expect(parseTransactionsFilterSummary([])).toEqual({
      txn_count: 0,
      total_in_cents: 0,
      total_out_cents: 0,
    });
  });

  it("rejects a string total", () => {
    expect(() =>
      parseTransactionsFilterSummary([{ txn_count: 1, total_in_cents: "100", total_out_cents: 0 }])
    ).toThrow(ZodError);
  });
});
