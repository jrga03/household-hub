/**
 * A category's month record by record, with a running balance. Each record's
 * change is what it alone adds to the category's money in `sumAccountMoney`,
 * so the ledger always agrees with the month view.
 */

import type { AccountRow } from "@/lib/accounts/projection";
import type { AllocationRow } from "@/lib/allocations/projection";
import { sumCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import { db } from "@/lib/dexie/db";
import { sumAccountMoney, sumCategoryMoney } from "@/lib/transactions/money";
import type { TransactionRow } from "@/lib/transactions/projection";
import type { TransferRow } from "@/lib/transfers/projection";
import type { MonthRecords } from "./month";

export type LedgerRecord =
  | { kind: "transaction"; record: TransactionRow }
  | { kind: "transfer"; record: TransferRow }
  | { kind: "allocation"; record: AllocationRow };

export type LedgerRow = LedgerRecord & {
  /** What the record adds to the category's money; zero for a transfer between two accounts. */
  change: Cents;
  /** The category's money after the record. */
  balance: Cents;
};

export interface CategoryLedger {
  /** The category's money before the month's first day. */
  opening: Cents;
  /** Oldest first; within a day, in the order recorded. */
  rows: LedgerRow[];
  /** The category's money after the month's last day. */
  closing: Cents;
}

type MoneyRecords = Omit<MonthRecords, "budgets">;

function categoryMoney(
  categoryId: string,
  { accounts, transactions, allocations, transfers }: MoneyRecords
): Cents {
  const money = sumCategoryMoney(sumAccountMoney(accounts, transactions, allocations, transfers));
  return money.get(categoryId)?.total ?? ZERO_CENTS;
}

function changeFrom(categoryId: string, accounts: AccountRow[], entry: LedgerRecord): Cents {
  return categoryMoney(categoryId, {
    accounts,
    transactions: entry.kind === "transaction" ? [entry.record] : [],
    allocations: entry.kind === "allocation" ? [entry.record] : [],
    transfers: entry.kind === "transfer" ? [entry.record] : [],
  });
}

function touches(categoryId: string, entry: LedgerRecord): boolean {
  const isCategory = (envelope: AllocationRow["from"]) =>
    envelope.kind === "category" && envelope.id === categoryId;
  if (entry.kind === "transaction") return entry.record.categoryId === categoryId;
  if (entry.kind === "transfer") return isCategory(entry.record.envelope);
  return isCategory(entry.record.from) || isCategory(entry.record.to);
}

const inOrder = (a: LedgerRecord, b: LedgerRecord) =>
  a.record.date.localeCompare(b.record.date) ||
  a.record.recordedHlc.localeCompare(b.record.recordedHlc);

/** Every record touching the category dated in `month` ("yyyy-MM"), with its money before and after. */
export function categoryLedger(
  categoryId: string,
  month: string,
  records: MoneyRecords
): CategoryLedger {
  const { accounts, transactions, allocations, transfers } = records;
  const isBefore = (record: { date: string }) => record.date < `${month}-01`;
  const opening = categoryMoney(categoryId, {
    accounts,
    transactions: transactions.filter(isBefore),
    allocations: allocations.filter(isBefore),
    transfers: transfers.filter(isBefore),
  });

  const entries: LedgerRecord[] = [
    ...transactions.map((record) => ({ kind: "transaction" as const, record })),
    ...transfers.map((record) => ({ kind: "transfer" as const, record })),
    ...allocations.map((record) => ({ kind: "allocation" as const, record })),
  ];
  let balance = opening;
  const rows = entries
    .filter(
      (entry) =>
        !entry.record.removed &&
        entry.record.date.startsWith(`${month}-`) &&
        touches(categoryId, entry)
    )
    .sort(inOrder)
    .map((entry): LedgerRow => {
      const change = changeFrom(categoryId, accounts, entry);
      balance = sumCents([balance, change]);
      return { ...entry, change, balance };
    });

  return { opening, rows, closing: balance };
}

export async function readCategoryLedger(categoryId: string, month: string) {
  const [accounts, transactions, allocations, transfers] = await Promise.all([
    db.accounts.toArray(),
    db.transactions.toArray(),
    db.allocations.toArray(),
    db.transfers.toArray(),
  ]);
  return categoryLedger(categoryId, month, { accounts, transactions, allocations, transfers });
}
