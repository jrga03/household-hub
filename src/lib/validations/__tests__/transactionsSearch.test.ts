import { describe, expect, it } from "vitest";
import { transactionsSearchSchema } from "../transactionsSearch";

const parse = (search: Record<string, unknown>) => transactionsSearchSchema.parse(search);

describe("transactionsSearchSchema", () => {
  it("defaults to hiding transfers with no filters set", () => {
    expect(parse({})).toEqual({
      dateFrom: undefined,
      dateTo: undefined,
      accountId: undefined,
      categoryId: undefined,
      status: null,
      type: null,
      search: undefined,
      excludeTransfers: true,
      amountMin: undefined,
      amountMax: undefined,
      selected: undefined,
    });
  });

  it("turns transfer exclusion off for boolean false and the string 'false'", () => {
    // TanStack's default search parser round-trips ?excludeTransfers=false as a boolean
    expect(parse({ excludeTransfers: false }).excludeTransfers).toBe(false);
    expect(parse({ excludeTransfers: "false" }).excludeTransfers).toBe(false);
    expect(parse({ excludeTransfers: true }).excludeTransfers).toBe(true);
    expect(parse({ excludeTransfers: "nope" }).excludeTransfers).toBe(true);
  });

  it("keeps amount filters as integer cents and drops invalid ones", () => {
    expect(parse({ amountMin: 50000, amountMax: "150000" })).toMatchObject({
      amountMin: 50000,
      amountMax: 150000,
    });
    expect(parse({ amountMin: "abc" }).amountMin).toBeUndefined();
    expect(parse({ amountMin: -1 }).amountMin).toBeUndefined();
    expect(parse({ amountMin: 12.5 }).amountMin).toBeUndefined();
    expect(parse({ amountMax: 1_000_000_000 }).amountMax).toBeUndefined();
  });

  it("accepts only known status and type values", () => {
    expect(parse({ status: "cleared", type: "income" })).toMatchObject({
      status: "cleared",
      type: "income",
    });
    expect(parse({ status: "bogus", type: 5 })).toMatchObject({ status: null, type: null });
  });

  it("keeps numeric-looking text params as strings", () => {
    // TanStack parses ?search=123 into the number 123
    expect(parse({ search: 123 }).search).toBe("123");
    expect(parse({ search: "" }).search).toBeUndefined();
    expect(parse({ selected: "tx-1", accountId: "acc-1" })).toMatchObject({
      selected: "tx-1",
      accountId: "acc-1",
    });
  });
});
