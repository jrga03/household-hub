import { describe, expect, it } from "vitest";
import { cents } from "@/test/cents";
import { cardPaymentEnvelope } from "@/lib/allocations/events";
import type { TransactionRow } from "@/lib/transactions/projection";
import type { TransferRow } from "@/lib/transfers/projection";
import type { DraftRow } from "./drafts";
import {
  discardedByDefault,
  draftFlagger,
  keptTotalNote,
  needsDescription,
  selectedByDefault,
} from "./review";

const CARD = "card";
const BANK = "bank";

function draft(overrides: Partial<DraftRow> = {}, line: Partial<DraftRow["line"]> = {}): DraftRow {
  return {
    id: "d1",
    importId: "i1",
    position: 0,
    line: {
      purchaseDate: "2026-09-10",
      postingDate: "2026-09-11",
      description: "COFFEE SHOP",
      amount: cents(15000),
      type: "expense",
      isCardPayment: false,
      ...line,
    },
    importKey: "key-1",
    description: "COFFEE SHOP",
    descriptionSource: "statement",
    categoryId: null,
    categorySource: null,
    type: line.type ?? "expense",
    ...overrides,
  };
}

let nextId = 0;
function transaction(overrides: Partial<TransactionRow> = {}): TransactionRow {
  nextId += 1;
  return {
    id: `t${nextId}`,
    householdId: "h",
    visibility: "household",
    ownerUserId: null,
    date: "2026-09-10",
    type: "expense",
    amountCents: cents(15000),
    accountId: CARD,
    categoryId: null,
    payingAccountId: BANK,
    description: "Coffee",
    notes: "",
    status: "cleared",
    removed: false,
    recordedHlc: `hlc-${nextId}`,
    importKey: null,
    paidByUserId: null,
    statementText: null,
    pinned: false,
    ...overrides,
  };
}

function transfer(overrides: Partial<TransferRow> = {}): TransferRow {
  nextId += 1;
  return {
    id: `x${nextId}`,
    householdId: "h",
    visibility: "household",
    ownerUserId: null,
    date: "2026-09-10",
    amountCents: cents(500000),
    fromAccountId: BANK,
    toAccountId: CARD,
    fromEnvelope: cardPaymentEnvelope(CARD),
    toEnvelope: cardPaymentEnvelope(CARD),
    description: "",
    notes: "",
    status: "cleared",
    removed: false,
    recordedHlc: `hlc-${nextId}`,
    ...overrides,
  };
}

const flagFor = (
  subject: DraftRow,
  records: { transactions?: TransactionRow[]; transfers?: TransferRow[]; discarded?: string[] }
) =>
  draftFlagger(
    CARD,
    records.transactions ?? [],
    records.transfers ?? [],
    new Set(records.discarded)
  )(subject);

describe("Already imported", () => {
  it("matches a transaction with the same import key", () => {
    const imported = transaction({ importKey: "key-1" });

    expect(flagFor(draft(), { transactions: [imported] })).toEqual({
      kind: "already-imported",
      transactions: [imported],
    });
  });

  it("matches every kept part of a broken-apart line", () => {
    const groceries = transaction({ importKey: "key-1", amountCents: cents(10000) });
    const removed = transaction({ importKey: "key-1", amountCents: cents(3000), removed: true });
    const supplies = transaction({ importKey: "key-1", amountCents: cents(5000) });

    expect(flagFor(draft(), { transactions: [groceries, removed, supplies] })).toEqual({
      kind: "already-imported",
      transactions: [groceries, supplies],
    });
  });

  it("imports again once every part is removed", () => {
    const parts = [
      transaction({ importKey: "key-1", amountCents: cents(10000), removed: true }),
      transaction({ importKey: "key-1", amountCents: cents(5000), removed: true }),
    ];

    expect(flagFor(draft(), { transactions: parts })).toBeNull();
  });

  it("ignores a removed transaction with the same key", () => {
    const removed = transaction({ importKey: "key-1", removed: true, date: "2026-01-01" });

    expect(flagFor(draft(), { transactions: [removed] })).toBeNull();
  });

  it("wins over a hand-typed look-alike", () => {
    const imported = transaction({ importKey: "key-1" });
    const typed = transaction();

    expect(flagFor(draft(), { transactions: [typed, imported] })?.kind).toBe("already-imported");
  });
});

describe("Discarded before", () => {
  const payment = draft(
    { type: "income" },
    { description: "PAYMENT RECEIVED", amount: cents(500000), isCardPayment: true, type: "income" }
  );

  it("flags a line discarded on this device", () => {
    expect(flagFor(draft(), { discarded: ["key-1"] })).toEqual({ kind: "discarded-before" });
  });

  it("ignores a discard of another line", () => {
    expect(flagFor(draft(), { discarded: ["key-2"] })).toBeNull();
  });

  it("yields to Already imported", () => {
    const imported = transaction({ importKey: "key-1" });

    expect(flagFor(draft(), { transactions: [imported], discarded: ["key-1"] })?.kind).toBe(
      "already-imported"
    );
  });

  it("wins over a hand-typed look-alike", () => {
    expect(flagFor(draft(), { transactions: [transaction()], discarded: ["key-1"] })?.kind).toBe(
      "discarded-before"
    );
  });

  it("yields to a recorded card payment", () => {
    const paid = transfer();

    expect(flagFor(payment, { transfers: [paid], discarded: ["key-1"] })).toEqual({
      kind: "card-payment",
      transfer: paid,
    });
  });

  it("flags an unmatched card payment discarded before", () => {
    expect(flagFor(payment, { discarded: ["key-1"] })).toEqual({ kind: "discarded-before" });
  });
});

describe("Might already be recorded", () => {
  it.each(["2026-09-07", "2026-09-10", "2026-09-13"])(
    "matches a typed-in transaction on %s, within 3 days",
    (date) => {
      const typed = transaction({ date });

      expect(flagFor(draft(), { transactions: [typed] })).toEqual({
        kind: "might-be-recorded",
        transaction: typed,
      });
    }
  );

  it.each([
    ["4 days before", { date: "2026-09-06" }],
    ["4 days after", { date: "2026-09-14" }],
    ["on another account", { accountId: BANK }],
    ["in the other direction", { type: "income" as const }],
    ["for another amount", { amountCents: cents(15001) }],
    ["removed", { removed: true }],
    ["imported from another line", { importKey: "key-2" }],
  ])("ignores a transaction %s", (_name, overrides) => {
    expect(flagFor(draft(), { transactions: [transaction(overrides)] })).toBeNull();
  });

  it("follows the draft's edited direction", () => {
    const refund = transaction({ type: "income" });

    expect(flagFor(draft({ type: "income" }), { transactions: [refund] })?.kind).toBe(
      "might-be-recorded"
    );
  });

  it("shows the closest match by date", () => {
    const far = transaction({ date: "2026-09-13" });
    const near = transaction({ date: "2026-09-09" });

    expect(flagFor(draft(), { transactions: [far, near] })).toMatchObject({ transaction: near });
  });
});

describe("Card payment", () => {
  const payment = draft(
    { type: "income" },
    { description: "PAYMENT RECEIVED", amount: cents(500000), isCardPayment: true, type: "income" }
  );

  it("matches a transfer into the card for the same amount within 3 days", () => {
    const paid = transfer({ date: "2026-09-08" });

    expect(flagFor(payment, { transfers: [paid] })).toEqual({
      kind: "card-payment",
      transfer: paid,
    });
  });

  it.each([
    ["out of the card", { fromAccountId: CARD, toAccountId: BANK }],
    ["for another amount", { amountCents: cents(400000) }],
    ["4 days away", { date: "2026-09-14" }],
    ["removed", { removed: true }],
  ])("doesn't match a transfer %s", (_name, overrides) => {
    expect(flagFor(payment, { transfers: [transfer(overrides)] })).toEqual({
      kind: "card-payment",
      transfer: null,
    });
  });

  it("is never read as a typed-in income", () => {
    const income = transaction({ type: "income", amountCents: cents(500000) });

    expect(flagFor(payment, { transactions: [income] })).toEqual({
      kind: "card-payment",
      transfer: null,
    });
  });
});

describe("selectedByDefault", () => {
  it("selects a plain draft, and leaves every flagged one for the member", () => {
    expect(selectedByDefault(null)).toBe(true);
    expect(selectedByDefault({ kind: "already-imported", transactions: [transaction()] })).toBe(
      false
    );
    expect(selectedByDefault({ kind: "might-be-recorded", transaction: transaction() })).toBe(
      false
    );
    expect(selectedByDefault({ kind: "card-payment", transfer: null })).toBe(false);
    expect(selectedByDefault({ kind: "discarded-before" })).toBe(false);
  });
});

describe("discardedByDefault", () => {
  it("discards a line already imported or a card payment already recorded, never a look-alike", () => {
    expect(discardedByDefault({ kind: "already-imported", transactions: [transaction()] })).toBe(
      true
    );
    expect(discardedByDefault({ kind: "card-payment", transfer: transfer() })).toBe(true);
    expect(discardedByDefault({ kind: "card-payment", transfer: null })).toBe(false);
    expect(discardedByDefault({ kind: "might-be-recorded", transaction: transaction() })).toBe(
      false
    );
    expect(discardedByDefault(null)).toBe(false);
  });

  it("discards a line discarded before", () => {
    expect(discardedByDefault({ kind: "discarded-before" })).toBe(true);
  });
});

describe("needsDescription", () => {
  it("flags a draft whose description is blank", () => {
    expect(needsDescription(draft({ description: "" }))).toBe(true);
    expect(needsDescription(draft({ description: "   " }))).toBe(true);
  });

  it("passes a described draft, and a card payment, which isn't saved as a transaction", () => {
    expect(needsDescription(draft())).toBe(false);
    expect(needsDescription(draft({ description: "" }, { isCardPayment: true }))).toBe(false);
  });
});

describe("keptTotalNote", () => {
  const line = cents(250000);

  it("says nothing when the kept parts total the line", () => {
    const parts = [
      transaction({ amountCents: cents(180000) }),
      transaction({ amountCents: cents(70000) }),
    ];

    expect(keptTotalNote(parts, line)).toBeNull();
  });

  it("names the kept total when a part was removed", () => {
    expect(keptTotalNote([transaction({ amountCents: cents(180000) })], line)).toBe(
      "The kept parts total ₱1,800.00 of this line's ₱2,500.00."
    );
  });

  it("names the kept total when a whole line's amount was edited", () => {
    expect(keptTotalNote([transaction({ amountCents: cents(240000) })], line)).toBe(
      "The kept parts total ₱2,400.00 of this line's ₱2,500.00."
    );
  });
});
