import { readAccountNames } from "@/lib/accounts/projection";
import { envelopeLabel, UNASSIGNED_ENVELOPE, type Envelope } from "@/lib/allocations/events";
import { readCategoryNames } from "@/lib/categories/projection";
import type { Cents } from "@/lib/currency";
import { db } from "@/lib/dexie/db";
import type { TransactionStatus } from "@/lib/transactions/events";
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

const STATUS_LABELS: Record<TransactionStatus, string> = {
  cleared: "Cleared",
  pending: "Pending",
};

interface ExportRow {
  date: string;
  recordedHlc: string;
  values: string[];
}

/** A plain number a spreadsheet can sum: 150050 → "1500.50". */
const toDecimal = (cents: Cents) =>
  `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;

const envelopeOf = (categoryId: string | null): Envelope =>
  categoryId === null ? UNASSIGNED_ENVELOPE : { kind: "category", id: categoryId };

const byWhenRecorded = (a: ExportRow, b: ExportRow) =>
  a.date.localeCompare(b.date) || a.recordedHlc.localeCompare(b.recordedHlc);

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
        transaction.type === "income" ? "Income" : "Expense",
        toDecimal(transaction.amountCents),
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
        toDecimal(transfer.amountCents),
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
