import { describe, expect, it } from "vitest";
import { asCents } from "@/lib/currency";
import type { BalanceCorrectionRow } from "@/lib/corrections/projection";
import type { TransferRow } from "@/lib/transfers/projection";
import {
  filterTransactions,
  newestFirst,
  readTransactionFilter,
  totalTransactions,
  transferDirection,
} from "./filter";
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
    importKey: null,
    ...overrides,
  };
}

function transferRow(overrides: Partial<TransferRow> = {}): TransferRow {
  nextId += 1;
  return {
    id: `x${nextId}`,
    householdId: "h1",
    visibility: "household",
    ownerUserId: null,
    date: "2026-10-12",
    amountCents: asCents(200000),
    fromAccountId: "bpi",
    toAccountId: "gcash",
    envelope: { kind: "category", id: "groceries" },
    description: "",
    notes: "",
    status: "cleared",
    removed: false,
    recordedHlc: `hlc-${nextId}`,
    ...overrides,
  };
}

function correctionRow(overrides: Partial<BalanceCorrectionRow> = {}): BalanceCorrectionRow {
  nextId += 1;
  return {
    id: `c${nextId}`,
    householdId: "h1",
    visibility: "household",
    ownerUserId: null,
    accountId: "bpi",
    date: "2026-10-12",
    amountCents: asCents(35000),
    direction: "lower",
    envelope: { kind: "category", id: "groceries" },
    payingAccountId: null,
    removed: false,
    recordedHlc: `hlc-${nextId}`,
    ...overrides,
  };
}

const ids = (rows: { id: string }[]) => rows.map((transaction) => transaction.id);

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
    expect(ids(filterTransactions(rows, { query: "₱ 250" }))).toEqual([twoFifty.id]);
    expect(ids(filterTransactions(rows, { query: "250." }))).toEqual([twoFifty.id]);
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

  it("forgives one typo in a word longer than three letters", () => {
    const jollibee = row({ description: "Jollibee" });
    const meralco = row({ description: "Meralco bill" });
    const rows = [jollibee, meralco];

    expect(ids(filterTransactions(rows, { query: "jolibee" }))).toEqual([jollibee.id]);
    expect(ids(filterTransactions(rows, { query: "meralko" }))).toEqual([meralco.id]);
  });

  it("forgives no typo in a number", () => {
    expect(filterTransactions([row({ description: "Room 2501" })], { query: "2500" })).toEqual([]);
  });

  it("forgives two swapped letters", () => {
    const meralco = row({ description: "Meralco" });

    expect(ids(filterTransactions([meralco], { query: "mearlco" }))).toEqual([meralco.id]);
  });

  it("finds a partly typed word with a typo", () => {
    const meralco = row({ description: "Meralco" });

    expect(ids(filterTransactions([meralco], { query: "meralk" }))).toEqual([meralco.id]);
  });

  it("forgives no typo in a word of three letters or fewer", () => {
    expect(filterTransactions([row({ description: "1 gal water" })], { query: "gas" })).toEqual([]);
  });

  it("needs the first letter right", () => {
    expect(filterTransactions([row({ description: "Jollibee" })], { query: "kolibee" })).toEqual(
      []
    );
  });

  it("ignores accents on either side", () => {
    const paranaque = row({ description: "Parañaque toll" });

    expect(ids(filterTransactions([paranaque], { query: "paranaque" }))).toEqual([paranaque.id]);
    expect(
      ids(filterTransactions([row({ description: "Paranaque" })], { query: "PARAÑAQUE" }))
    ).toHaveLength(1);
  });

  it("finds words typed without their spaces or punctuation", () => {
    const grabFood = row({ description: "Grab Food" });
    const sevenEleven = row({ notes: "snacks at 7-Eleven" });
    const rows = [grabFood, sevenEleven];

    expect(ids(filterTransactions(rows, { query: "grabfood" }))).toEqual([grabFood.id]);
    expect(ids(filterTransactions(rows, { query: "7eleven" }))).toEqual([sevenEleven.id]);
  });

  it("finds a number by its exact amount or in the text", () => {
    const sevenEleven = row({ description: "7-11", amountCents: asCents(25000) });
    const exactAmount = row({ description: "Load", amountCents: asCents(71100) });
    const rows = [sevenEleven, exactAmount, row({ amountCents: asCents(7110) })];

    expect(ids(filterTransactions(rows, { query: "711" }))).toEqual([
      sevenEleven.id,
      exactAmount.id,
    ]);
  });

  it("matches no text for a query with no letters or digits, but still finds an amount", () => {
    const rows = [row({ description: "7-Eleven ₱ store" })];

    expect(filterTransactions(rows, { query: "₱" })).toEqual([]);
    expect(filterTransactions(rows, { query: "-" })).toEqual([]);
    expect(ids(filterTransactions(rows, { query: "₱250" }))).toEqual(ids(rows));
  });

  it("reads quotes and a leading dash as plain text", () => {
    const sevenEleven = row({ description: "7-Eleven" });

    expect(ids(filterTransactions([sevenEleven], { query: "-eleven" }))).toEqual([sevenEleven.id]);
    expect(ids(filterTransactions([sevenEleven], { query: '"elevn"' }))).toEqual([sevenEleven.id]);
  });

  it("finds words with apostrophes", () => {
    const rockNRoll = row({ description: "Rock 'n' Roll bar" });
    const mcdonalds = row({ description: "McDonald's" });
    const rows = [rockNRoll, mcdonalds];

    expect(ids(filterTransactions(rows, { query: "rock 'n' roll" }))).toEqual([rockNRoll.id]);
    expect(ids(filterTransactions(rows, { query: "mcdonald's" }))).toEqual([mcdonalds.id]);
    expect(ids(filterTransactions(rows, { query: "mcdonalds" }))).toEqual([mcdonalds.id]);
  });

  it("finds non-Latin text by substring", () => {
    const cafe = row({ description: "Кафе Пушкин" });

    expect(ids(filterTransactions([cafe], { query: "кафе" }))).toEqual([cafe.id]);
  });

  it("needs every word, in any order, in the description or notes", () => {
    const order = row({ description: "Grab Food order" });
    const split = row({ description: "Grab", notes: "food for the team" });
    const court = row({ description: "Food court" });
    const rows = [order, split, court];

    expect(ids(filterTransactions(rows, { query: "food grab" }))).toEqual([order.id, split.id]);
    expect(ids(filterTransactions(rows, { query: "grab food" }))).toEqual([order.id, split.id]);
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

describe("a 10,000-transaction fuzzy search", () => {
  it("finds typos and reordered words while typing, in under 500 ms", () => {
    const many = Array.from({ length: 10_000 }, (_, index) =>
      row({
        description: index % 10 === 0 ? "Grab Food order" : `Purchase ${index}`,
        notes: index % 7 === 0 ? "Parañaque branch" : "",
      })
    );

    const started = performance.now();
    for (const query of ["o", "or", "ord", "ordr", "ordr g", "ordr gr", "ordr grab"]) {
      filterTransactions(many, { query });
    }
    const found = filterTransactions(many, { query: "ordr grab paranaque" });
    const elapsed = performance.now() - started;

    expect(found).toHaveLength(143);
    expect(elapsed).toBeLessThan(500);
  });
});

describe("transfers in the list", () => {
  const toGcash = transferRow();
  const toBpi = transferRow({ fromAccountId: "gcash", toAccountId: "bpi" });
  const expense = row({ accountId: "bpi" });
  const rows = [toGcash, toBpi, expense];

  it("keeps a transfer under the account filter of either side", () => {
    expect(ids(filterTransactions(rows, { account: "gcash" }))).toEqual([toGcash.id, toBpi.id]);
    expect(ids(filterTransactions(rows, { account: "bdo" }))).toEqual([]);
  });

  it("keeps only transfers under the Transfer type, and none under Expense or Income", () => {
    expect(ids(filterTransactions(rows, { type: "transfer" }))).toEqual([toGcash.id, toBpi.id]);
    expect(ids(filterTransactions(rows, { type: "expense" }))).toEqual([expense.id]);
    expect(ids(filterTransactions(rows, { type: "income" }))).toEqual([]);
  });

  it("matches the category filter by the transfer's envelope", () => {
    const unassigned = transferRow({ envelope: { kind: "unassigned" } });
    const cardPayment = transferRow({ envelope: { kind: "card_payment", id: "visa" } });
    const all = [toGcash, unassigned, cardPayment];

    expect(ids(filterTransactions(all, { category: "groceries" }))).toEqual([toGcash.id]);
    expect(ids(filterTransactions(all, { category: "unassigned" }))).toEqual([unassigned.id]);
    expect(ids(filterTransactions(all, { category: "visa" }))).toEqual([]);
  });

  it("never counts a transfer as needing a category", () => {
    const unassigned = transferRow({ envelope: { kind: "unassigned" } });

    expect(filterTransactions([unassigned], { needsCategory: true })).toEqual([]);
  });

  it("applies month, status and search to transfers", () => {
    const pending = transferRow({ status: "pending", date: "2026-09-30", notes: "Rent money" });

    expect(ids(filterTransactions([toGcash, pending], { status: "pending" }))).toEqual([
      pending.id,
    ]);
    expect(ids(filterTransactions([toGcash, pending], { month: "2026-09" }))).toEqual([pending.id]);
    expect(ids(filterTransactions([toGcash, pending], { query: "rent" }))).toEqual([pending.id]);
    expect(ids(filterTransactions([toGcash, expense], { query: "2,000" }))).toEqual([toGcash.id]);
  });

  it("leaves transfers out of the income and expense totals", () => {
    expect(totalTransactions(rows)).toEqual({
      incomeCents: 0,
      expenseCents: 25000,
      netCents: -25000,
    });
  });

  it("signs a transfer by the filtered account's side", () => {
    expect(transferDirection(toGcash, "bpi")).toBe("out");
    expect(transferDirection(toGcash, "gcash")).toBe("in");
    expect(transferDirection(toGcash, undefined)).toBeNull();
    expect(transferDirection(toGcash, "bdo")).toBeNull();
  });

  it("merges transactions and transfers newest date first, then most recently recorded", () => {
    const older = row({ date: "2026-10-11", recordedHlc: "hlc-9" });
    const sameDayEarlier = transferRow({ date: "2026-10-12", recordedHlc: "hlc-1" });
    const sameDayLater = row({ date: "2026-10-12", recordedHlc: "hlc-2" });
    const newest = transferRow({ date: "2026-10-13", recordedHlc: "hlc-0" });

    expect(ids(newestFirst([sameDayLater, older], [newest, sameDayEarlier]))).toEqual([
      newest.id,
      sameDayLater.id,
      sameDayEarlier.id,
      older.id,
    ]);
  });
});

describe("balance corrections in the list", () => {
  const shortfall = correctionRow();
  const surplus = correctionRow({
    accountId: "gcash",
    direction: "raise",
    envelope: { kind: "unassigned" },
  });
  const expense = row({ accountId: "bpi" });
  const rows = [shortfall, surplus, expense];

  it("keeps a correction under its account, its envelope and the Balance correction type", () => {
    expect(ids(filterTransactions(rows, { account: "gcash" }))).toEqual([surplus.id]);
    expect(ids(filterTransactions(rows, { category: "groceries" }))).toEqual([
      shortfall.id,
      expense.id,
    ]);
    expect(ids(filterTransactions(rows, { category: "unassigned" }))).toEqual([surplus.id]);
    expect(ids(filterTransactions(rows, { type: "correction" }))).toEqual([
      shortfall.id,
      surplus.id,
    ]);
    expect(ids(filterTransactions(rows, { type: "expense" }))).toEqual([expense.id]);
  });

  it("counts a correction as cleared and never as needing a category", () => {
    expect(ids(filterTransactions(rows, { status: "cleared" }))).toEqual(ids(rows));
    expect(filterTransactions(rows, { status: "pending" })).toEqual([]);
    expect(filterTransactions([surplus], { needsCategory: true })).toEqual([]);
  });

  it("finds a correction by its amount", () => {
    expect(ids(filterTransactions(rows, { query: "350" }))).toEqual([shortfall.id, surplus.id]);
  });

  it("leaves corrections out of the income and expense totals", () => {
    expect(totalTransactions(rows)).toEqual({
      incomeCents: 0,
      expenseCents: 25000,
      netCents: -25000,
    });
  });

  it("merges corrections with transactions and transfers, newest first", () => {
    const newest = correctionRow({ date: "2026-10-13" });
    const older = row({ date: "2026-10-11" });

    expect(ids(newestFirst([older], [], [newest]))).toEqual([newest.id, older.id]);
  });
});

describe("readTransactionFilter", () => {
  it("reads the Balance correction type", () => {
    expect(readTransactionFilter({ type: "correction" })).toEqual({ type: "correction" });
  });

  it("reads the Transfer type", () => {
    expect(readTransactionFilter({ type: "transfer" })).toEqual({ type: "transfer" });
  });

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
        type: "refund",
        status: "void",
        needsCategory: "yes",
        query: "",
        other: "x",
      })
    ).toEqual({});
  });
});
