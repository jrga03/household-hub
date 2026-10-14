/**
 * A category's month record by record, with a running balance. Each record's
 * change is what it alone adds to the category's money in `sumAccountMoney`,
 * so the ledger always agrees with the month view.
 */

import type { AccountRow } from "@/lib/accounts/projection";
import type { AllocationRow } from "@/lib/allocations/projection";
import type { BalanceCorrectionRow } from "@/lib/corrections/projection";
import { diffCents, sumCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import { db } from "@/lib/dexie/db";
import {
  readMoneyRecords,
  sumAccountMoney,
  sumCategoryMoney,
  type MoneyRecords,
} from "@/lib/transactions/money";
import type { TransactionRow } from "@/lib/transactions/projection";
import type { TransferRow } from "@/lib/transfers/projection";

export type LedgerRecord =
  | { kind: "transaction"; record: TransactionRow }
  | { kind: "transfer"; record: TransferRow }
  | { kind: "allocation"; record: AllocationRow }
  | { kind: "correction"; record: BalanceCorrectionRow };

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
  /** What records dated after the month add; this month's figure in the month view includes it. */
  datedLater: Cents;
}

function categoryMoney(categoryId: string, records: MoneyRecords): Cents {
  return sumCategoryMoney(sumAccountMoney(records)).get(categoryId)?.total ?? ZERO_CENTS;
}

function changeFrom(categoryId: string, accounts: AccountRow[], entry: LedgerRecord): Cents {
  return categoryMoney(categoryId, {
    accounts,
    transactions: entry.kind === "transaction" ? [entry.record] : [],
    allocations: entry.kind === "allocation" ? [entry.record] : [],
    transfers: entry.kind === "transfer" ? [entry.record] : [],
    corrections: entry.kind === "correction" ? [entry.record] : [],
  });
}

function touches(categoryId: string, entry: LedgerRecord): boolean {
  const isCategory = (envelope: AllocationRow["from"]) =>
    envelope.kind === "category" && envelope.id === categoryId;
  if (entry.kind === "transaction") return entry.record.categoryId === categoryId;
  if (entry.kind === "transfer" || entry.kind === "correction") {
    return isCategory(entry.record.envelope);
  }
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
  const { accounts, transactions, allocations, transfers, corrections } = records;
  const isBefore = (record: { date: string }) => record.date < `${month}-01`;
  const opening = categoryMoney(categoryId, {
    accounts,
    transactions: transactions.filter(isBefore),
    allocations: allocations.filter(isBefore),
    transfers: transfers.filter(isBefore),
    corrections: corrections.filter(isBefore),
  });

  const entries: LedgerRecord[] = [
    ...transactions.map((record) => ({ kind: "transaction" as const, record })),
    ...transfers.map((record) => ({ kind: "transfer" as const, record })),
    ...allocations.map((record) => ({ kind: "allocation" as const, record })),
    ...corrections.map((record) => ({ kind: "correction" as const, record })),
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

  const now = categoryMoney(categoryId, records);
  return { opening, rows, closing: balance, datedLater: diffCents(now, balance) };
}

export const readCategoryLedger = async (categoryId: string, month: string) =>
  categoryLedger(categoryId, month, await readMoneyRecords());

export interface LedgerRecordId {
  kind: LedgerRecord["kind"];
  id: string;
}

/** The record as it is now; null once it's gone or removed, so an open edit can close. */
export async function readLedgerRecord({ kind, id }: LedgerRecordId): Promise<LedgerRecord | null> {
  if (kind === "transaction") {
    const record = await db.transactions.get(id);
    return record && !record.removed ? { kind, record } : null;
  }
  if (kind === "transfer") {
    const record = await db.transfers.get(id);
    return record && !record.removed ? { kind, record } : null;
  }
  if (kind === "correction") {
    const record = await db.balanceCorrections.get(id);
    return record && !record.removed ? { kind, record } : null;
  }
  const record = await db.allocations.get(id);
  return record && !record.removed ? { kind, record } : null;
}
