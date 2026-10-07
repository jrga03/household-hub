import { describe, expect, it } from "vitest";
import { partialMatchKey, type QueryKey } from "@tanstack/react-query";
import type { EntityType } from "@/types/sync";
import { invalidatesAfterWrite, keysAfterWrite, queryKeys } from "@/lib/query-keys";

type Sample = { key: QueryKey; reads: readonly EntityType[] };

// Every root, every builder, and the entity types its query reads (from the
// fetcher's tables). Adding a root to queryKeys fails to compile until listed.
const SAMPLES = {
  transactions: [
    {
      key: queryKeys.transactions.list({ search: "rice" }),
      reads: ["transaction", "account", "category"],
    },
    {
      key: queryKeys.transactions.filterSummary(undefined),
      reads: ["transaction", "account", "category"],
    },
    { key: queryKeys.transactions.detail("t1"), reads: ["transaction", "account", "category"] },
  ],
  accounts: [
    { key: queryKeys.accounts.list(), reads: ["account"] },
    { key: queryKeys.accounts.balances(), reads: ["account", "transaction"] },
    { key: queryKeys.accounts.balance("a1"), reads: ["account", "transaction"] },
  ],
  categories: [
    { key: queryKeys.categories.list(), reads: ["category"] },
    { key: queryKeys.categories.grouped(), reads: ["category"] },
  ],
  budgets: [
    { key: queryKeys.budgets.month("2026-10"), reads: ["budget", "category", "transaction"] },
  ],
  dashboard: [
    { key: queryKeys.dashboard.month("2026-10"), reads: ["transaction", "category", "account"] },
  ],
  categoryTotals: [
    { key: queryKeys.categoryTotals.month("2026-10"), reads: ["transaction", "category"] },
  ],
  analytics: [
    {
      key: queryKeys.analytics.range("2026-01-01", "2026-10-31", { accountId: "a1" }),
      reads: ["transaction", "budget", "category", "account"],
    },
  ],
  transfers: [{ key: queryKeys.transfers.list("hh-1"), reads: ["transaction", "account"] }],
  debts: [
    { key: queryKeys.debts.activeExternal("hh-1"), reads: ["debt", "debt_payment", "transaction"] },
  ],
} satisfies Record<keyof typeof queryKeys, readonly Sample[]>;

describe("queryKeys", () => {
  it.each(Object.entries(SAMPLES))("nests every %s key under its root", (root, samples) => {
    const all = queryKeys[root as keyof typeof queryKeys].all;
    for (const { key } of samples) expect(partialMatchKey(key, all)).toBe(true);
  });

  it("nests a single balance under the balances prefix", () => {
    expect(partialMatchKey(queryKeys.accounts.balance("a1"), queryKeys.accounts.balances())).toBe(
      true
    );
  });

  it("keeps the account list out of the balances prefix", () => {
    expect(partialMatchKey(queryKeys.accounts.list(), queryKeys.accounts.balances())).toBe(false);
  });

  it("keeps today's shapes for roots that were not merged", () => {
    expect(queryKeys.transactions.filterSummary(undefined)).toEqual([
      "transactions",
      "filter-summary",
      undefined,
    ]);
    expect(queryKeys.categories.grouped()).toEqual(["categories", "grouped"]);
    expect(queryKeys.budgets.month("2026-10")).toEqual(["budgets", "2026-10"]);
    expect(queryKeys.dashboard.month("2026-10")).toEqual(["dashboard", "2026-10"]);
    expect(queryKeys.categoryTotals.month("2026-10")).toEqual(["category-totals", "2026-10"]);
    expect(queryKeys.analytics.range("a", "b", undefined)).toEqual([
      "analytics",
      "a",
      "b",
      undefined,
    ]);
    expect(queryKeys.transfers.list("hh-1")).toEqual(["transfers", "hh-1"]);
    expect(queryKeys.debts.activeExternal("hh-1")).toEqual(["debts", "hh-1", "external", "active"]);
  });
});

describe("invalidatesAfterWrite", () => {
  const cases = Object.entries(SAMPLES).flatMap(([root, samples]) =>
    samples.flatMap(({ key, reads }) => reads.map((entity) => ({ root, key, entity })))
  );

  it.each(cases)("a $entity write refreshes $key", ({ key, entity }) => {
    expect(invalidatesAfterWrite[entity].some((target) => partialMatchKey(key, target))).toBe(true);
  });

  it("keeps the account list out of a transaction write", () => {
    const list = queryKeys.accounts.list();
    expect(invalidatesAfterWrite.transaction.some((target) => partialMatchKey(list, target))).toBe(
      false
    );
  });

  it("dedupes the union across entities", () => {
    const keys = keysAfterWrite(["transaction", "account"]);
    expect(keys).toContainEqual(queryKeys.transactions.all);
    expect(keys.filter((key) => key[0] === "transactions")).toHaveLength(1);
  });

  it("accepts a single entity", () => {
    expect(keysAfterWrite("budget")).toEqual([queryKeys.budgets.all, queryKeys.analytics.all]);
  });
});
