import { describe, expect, it } from "vitest";
import { asCents } from "@/lib/currency";
import { filterTransactions, readTransactionFilter, totalTransactions } from "./filter";
import type { TransactionRow } from "./projection";

let nextId = 0;

function row(overrides: Partial<TransactionRow> = {}): TransactionRow {
  nextId += 1;
  return {
    id: `t${nextId}`,
    householdId: "h1",
    visibility: "household",
    ownerUserId: null,
    date: "2026-10-12",
    type: "expense",
    amountCents: asCents(25000),
    accountId: "bpi",
    categoryId: "groceries",
    payingAccountId: null,
    description: "",
    notes: "",
    status: "cleared",
    removed: false,
    recordedHlc: `hlc-${nextId}`,
    ...overrides,
  };
}

const ids = (rows: TransactionRow[]) => rows.map((transaction) => transaction.id);

describe("filterTransactions", () => {
  it("keeps every transaction when nothing is filtered", () => {
    const rows = [row(), row({ type: "income" })];
    expect(filterTransactions(rows, {})).toEqual(rows);
  });

  it("keeps one category, or Unassigned", () => {
    const groceries = row({ categoryId: "groceries" });
    const restaurants = row({ categoryId: "restaurants" });
    const unassigned = row({ categoryId: null });
    const rows = [groceries, restaurants, unassigned];

    expect(ids(filterTransactions(rows, { category: "groceries" }))).toEqual([groceries.id]);
    expect(ids(filterTransactions(rows, { category: "unassigned" }))).toEqual([unassigned.id]);
  });

  it("keeps one month by its local calendar date", () => {
    const lastDayOfSeptember = row({ date: "2026-09-30" });
    const firstOfOctober = row({ date: "2026-10-01" });
    const lastDayOfOctober = row({ date: "2026-10-31" });
    const rows = [lastDayOfSeptember, firstOfOctober, lastDayOfOctober];

    expect(ids(filterTransactions(rows, { month: "2026-10" }))).toEqual([
      firstOfOctober.id,
      lastDayOfOctober.id,
    ]);
  });

  it("combines account, type and status", () => {
    const match = row({ accountId: "visa", type: "expense", status: "pending" });
    const rows = [
      match,
      row({ accountId: "bpi", type: "expense", status: "pending" }),
      row({ accountId: "visa", type: "income", status: "pending" }),
      row({ accountId: "visa", type: "expense", status: "cleared" }),
    ];

    expect(
      ids(filterTransactions(rows, { account: "visa", type: "expense", status: "pending" }))
    ).toEqual([match.id]);
  });

  it("keeps expenses that need a category, leaving out uncategorized income", () => {
    const uncategorizedExpense = row({ type: "expense", categoryId: null });
    const rows = [
      uncategorizedExpense,
      row({ type: "income", categoryId: null }),
      row({ type: "expense", categoryId: "groceries" }),
    ];

    expect(ids(filterTransactions(rows, { needsCategory: true }))).toEqual([
      uncategorizedExpense.id,
    ]);
  });
});

describe("filterTransactions search", () => {
  it("finds the query in the description or notes, ignoring case", () => {
    const inDescription = row({ description: "SM Market" });
    const inNotes = row({ notes: "weekly market run" });
    const rows = [inDescription, inNotes, row({ description: "Jollibee" })];

    expect(ids(filterTransactions(rows, { query: "  MARKET " }))).toEqual([
      inDescription.id,
      inNotes.id,
    ]);
  });

  it("finds the exact amount when the query is a number", () => {
    const twoFifty = row({ amountCents: asCents(25000) });
    const rows = [
      twoFifty,
      row({ amountCents: asCents(2500) }),
      row({ amountCents: asCents(25050) }),
      row({ amountCents: asCents(125000) }),
    ];

    expect(ids(filterTransactions(rows, { query: "250" }))).toEqual([twoFifty.id]);
    expect(ids(filterTransactions(rows, { query: "₱250.00" }))).toEqual([twoFifty.id]);
    expect(ids(filterTransactions(rows, { query: "1,250" }))).toEqual([rows[3]?.id]);
  });

  it("still finds a number written in the description", () => {
    const roomNumber = row({ description: "Room 250 deposit", amountCents: asCents(500000) });
    const rows = [roomNumber, row({ amountCents: asCents(10000) })];

    expect(ids(filterTransactions(rows, { query: "250" }))).toEqual([roomNumber.id]);
  });

  it("treats a number with text after it as text, not an amount", () => {
    const rows = [row({ amountCents: asCents(25000) })];

    expect(filterTransactions(rows, { query: "250abc" })).toEqual([]);
  });
});

describe("totalTransactions", () => {
  it("adds income and expenses apart, and nets them", () => {
    const rows = [
      row({ type: "income", amountCents: asCents(100000) }),
      row({ type: "expense", amountCents: asCents(25000) }),
      row({ type: "expense", amountCents: asCents(12550) }),
    ];

    expect(totalTransactions(rows)).toEqual({
      incomeCents: 100000,
      expenseCents: 37550,
      netCents: 62450,
    });
  });

  it("nets below zero when expenses are larger", () => {
    const rows = [
      row({ type: "income", amountCents: asCents(1000) }),
      row({ type: "expense", amountCents: asCents(2500) }),
    ];

    expect(totalTransactions(rows).netCents).toBe(-1500);
  });

  it("is zero for no transactions", () => {
    expect(totalTransactions([])).toEqual({ incomeCents: 0, expenseCents: 0, netCents: 0 });
  });
});

describe("a 10,000-transaction list", () => {
  it("searches and totals in under 50 ms", () => {
    const many = Array.from({ length: 10_000 }, (_, index) =>
      row({
        type: index % 3 === 0 ? "income" : "expense",
        amountCents: asCents(100 + index),
        categoryId: index % 4 === 0 ? null : "groceries",
        description: `Purchase ${index}`,
        notes: index % 5 === 0 ? "split with Ana" : "",
      })
    );

    const started = performance.now();
    const found = filterTransactions(many, { month: "2026-10", query: "ana" });
    totalTransactions(found);
    const elapsed = performance.now() - started;

    expect(found).toHaveLength(2000);
    expect(elapsed).toBeLessThan(50);
  });
});

describe("readTransactionFilter", () => {
  it("reads every filter from the URL", () => {
    expect(
      readTransactionFilter({
        month: "2026-10",
        account: "visa",
        category: "unassigned",
        type: "expense",
        status: "pending",
        needsCategory: true,
        query: "250",
      })
    ).toEqual({
      month: "2026-10",
      account: "visa",
      category: "unassigned",
      type: "expense",
      status: "pending",
      needsCategory: true,
      query: "250",
    });
  });

  it("reads a numeric query typed into the address bar as text", () => {
    expect(readTransactionFilter({ query: 250 })).toEqual({ query: "250" });
  });

  it("drops values it can't use, so a stale link shows everything", () => {
    expect(
      readTransactionFilter({
        month: "2026-13",
        account: "",
        category: 42,
        type: "transfer",
        status: "void",
        needsCategory: "yes",
        query: "",
        other: "x",
      })
    ).toEqual({});
  });
});
