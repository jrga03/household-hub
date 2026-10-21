import { describe, expect, it } from "vitest";
import { parsePHP } from "@/lib/currency";
import type { TransactionRow } from "@/lib/transactions/projection";
import type { TransferRow } from "@/lib/transfers/projection";
import { rowDisplay, totalKind } from "./rowDisplay";

const names = {
  categories: new Map([["groceries", "Groceries"]]),
  accounts: new Map([
    ["bpi", "BPI"],
    ["gcash", "GCash"],
  ]),
};

const transaction = (overrides: Partial<TransactionRow> = {}): TransactionRow => ({
  id: "t1",
  householdId: "h1",
  visibility: "household",
  ownerUserId: null,
  date: "2026-10-12",
  type: "expense",
  amountCents: parsePHP("250"),
  accountId: "bpi",
  categoryId: "groceries",
  payingAccountId: null,
  description: "Market",
  notes: "",
  status: "cleared",
  removed: false,
  recordedHlc: "hlc-1",
  importKey: null,
  ...overrides,
});

const transfer = (overrides: Partial<TransferRow> = {}): TransferRow => ({
  id: "x1",
  householdId: "h1",
  visibility: "household",
  ownerUserId: null,
  date: "2026-10-12",
  amountCents: parsePHP("2000"),
  fromAccountId: "bpi",
  toAccountId: "gcash",
  envelope: { kind: "category", id: "groceries" },
  description: "",
  notes: "",
  status: "cleared",
  removed: false,
  recordedHlc: "hlc-2",
  ...overrides,
});

describe("rowDisplay", () => {
  it("names an expense by its description, under its category and account", () => {
    expect(rowDisplay(transaction(), names)).toEqual({
      label: "Market",
      detail: "Groceries · BPI",
      amount: { kind: "expense" },
      category: "Groceries",
      account: "BPI",
    });
  });

  it("names a transaction without a description by its amount", () => {
    const income = transaction({ type: "income", description: "", categoryId: null });
    expect(rowDisplay(income, names)).toEqual({
      label: "₱250.00",
      detail: "Unassigned · BPI",
      amount: { kind: "income" },
      category: "Unassigned",
      account: "BPI",
    });
  });

  it("reads a transfer without a description as moved to its destination", () => {
    expect(rowDisplay(transfer(), names)).toEqual({
      label: "Transfer to GCash",
      detail: "Groceries · BPI → GCash",
      amount: { kind: "transfer" },
      category: "Groceries",
      account: "BPI → GCash",
      route: { from: "BPI", to: "GCash" },
    });
  });

  it("gives a transfer the leg of the account the list is filtered to", () => {
    expect(rowDisplay(transfer(), names, "gcash")).toMatchObject({
      label: "Transfer from BPI",
      amount: { kind: "transfer", leg: "in" },
    });
    expect(rowDisplay(transfer(), names, "bpi")).toMatchObject({
      amount: { kind: "transfer", leg: "out" },
    });
  });

  it("says when an account or category isn't on this device yet", () => {
    const row = transaction({ accountId: "elsewhere", categoryId: "unknown" });
    expect(rowDisplay(row, names).detail).toBe(
      "Category not on this device yet · Account not on this device yet"
    );
  });
});

describe("totalKind", () => {
  it("signs a total in or out, and reads nothing as a plain ₱0.00", () => {
    expect(totalKind("in", parsePHP("750"))).toEqual({ kind: "income" });
    expect(totalKind("out", parsePHP("250"))).toEqual({ kind: "expense" });
    expect(totalKind("in", parsePHP("0"))).toEqual({ kind: "net" });
    expect(totalKind("out", parsePHP("0"))).toEqual({ kind: "net" });
  });
});
