import { describe, expect, it } from "vitest";
import { cents } from "@/test/cents";
import { cardPaymentEnvelope } from "@/lib/allocations/events";
import type { TransactionRow } from "@/lib/transactions/projection";
import type { TransferRow } from "@/lib/transfers/projection";
import type { DraftRow } from "./drafts";
import { discardedByDefault, draftFlagger, selectedByDefault } from "./review";

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
    envelope: cardPaymentEnvelope(CARD),
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
  records: { transactions?: TransactionRow[]; transfers?: TransferRow[] }
) => draftFlagger(CARD, records.transactions ?? [], records.transfers ?? [])(subject);

describe("Already imported", () => {
  it("matches a transaction with the same import key", () => {
    const imported = transaction({ importKey: "key-1" });

    expect(flagFor(draft(), { transactions: [imported] })).toEqual({
      kind: "already-imported",
      transaction: imported,
    });
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
    expect(selectedByDefault({ kind: "already-imported", transaction: transaction() })).toBe(false);
    expect(selectedByDefault({ kind: "might-be-recorded", transaction: transaction() })).toBe(
      false
    );
    expect(selectedByDefault({ kind: "card-payment", transfer: null })).toBe(false);
  });
});

describe("discardedByDefault", () => {
  it("discards a line already imported or a card payment already recorded, never a look-alike", () => {
    expect(discardedByDefault({ kind: "already-imported", transaction: transaction() })).toBe(true);
    expect(discardedByDefault({ kind: "card-payment", transfer: transfer() })).toBe(true);
    expect(discardedByDefault({ kind: "card-payment", transfer: null })).toBe(false);
    expect(discardedByDefault({ kind: "might-be-recorded", transaction: transaction() })).toBe(
      false
    );
    expect(discardedByDefault(null)).toBe(false);
  });
});
