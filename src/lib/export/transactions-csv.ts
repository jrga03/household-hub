import { readAccountNames } from "@/lib/accounts/projection";
import { envelopeLabel, UNASSIGNED_ENVELOPE, type Envelope } from "@/lib/allocations/events";
import { readCategoryNames } from "@/lib/categories/projection";
import { formatPHPDecimal } from "@/lib/currency";
import { db } from "@/lib/dexie/db";
import type { TransactionStatus, TransactionType } from "@/lib/transactions/events";
import { toCsv } from "./csv";

const HEADER = [
  "Date",
  "Type",
  "Amount",
  "Account",
  "To account",
  "Category",
  "Status",
  "Description",
  "Notes",
];

const TYPE_LABELS: Record<TransactionType, string> = {
  expense: "Expense",
  income: "Income",
};

const STATUS_LABELS: Record<TransactionStatus, string> = {
  cleared: "Cleared",
  pending: "Pending",
};

interface ExportRow {
  date: string;
  recordedHlc: string;
  values: string[];
}

const envelopeOf = (categoryId: string | null): Envelope =>
  categoryId === null ? UNASSIGNED_ENVELOPE : { kind: "category", id: categoryId };

// Dates and formatted HLCs both sort as strings, by code unit like the projector.
const byWhenRecorded = (a: ExportRow, b: ExportRow) => {
  const aKey = `${a.date} ${a.recordedHlc}`;
  const bKey = `${b.date} ${b.recordedHlc}`;
  return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
};

/**
 * Every transaction and transfer this device holds, oldest first, which is
 * what the member can see. Removed records are left out.
 */
export async function readTransactionsCsv(): Promise<string> {
  const [transactions, transfers, accountNames, categoryNames] = await Promise.all([
    db.transactions.toArray(),
    db.transfers.toArray(),
    readAccountNames(),
    readCategoryNames(),
  ]);
  const accountName = (id: string) => accountNames.get(id) ?? "An account";

  const transactionRows = transactions
    .filter((transaction) => !transaction.removed)
    .map((transaction) => ({
      date: transaction.date,
      recordedHlc: transaction.recordedHlc,
      values: [
        transaction.date,
        TYPE_LABELS[transaction.type],
        formatPHPDecimal(transaction.amountCents),
        accountName(transaction.accountId),
        "",
        envelopeLabel(envelopeOf(transaction.categoryId), categoryNames, accountNames),
        STATUS_LABELS[transaction.status],
        transaction.description,
        transaction.notes,
      ],
    }));
  const transferRows = transfers
    .filter((transfer) => !transfer.removed)
    .map((transfer) => ({
      date: transfer.date,
      recordedHlc: transfer.recordedHlc,
      values: [
        transfer.date,
        "Transfer",
        formatPHPDecimal(transfer.amountCents),
        accountName(transfer.fromAccountId),
        accountName(transfer.toAccountId),
        envelopeLabel(transfer.envelope, categoryNames, accountNames),
        STATUS_LABELS[transfer.status],
        transfer.description,
        transfer.notes,
      ],
    }));

  const rows = [...transactionRows, ...transferRows].sort(byWhenRecorded);
  return toCsv([HEADER, ...rows.map((row) => row.values)]);
}
