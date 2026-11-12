import { differenceInCalendarDays } from "date-fns";
import { formatPHP, sumCents, type Cents } from "@/lib/currency";
import { db } from "@/lib/dexie/db";
import type { TransactionRow } from "@/lib/transactions/projection";
import type { TransferRow } from "@/lib/transfers/projection";
import { parseLocalDate } from "@/lib/utils/dates";
import { listImports, type DraftRow, type ImportRow } from "./drafts";

/** How far apart a statement line and a typed-in record may be dated and still look alike. */
const MATCH_WINDOW_DAYS = 3;

export type DraftFlag =
  /** Every kept transaction with the line's import key: one for a whole line, more for its parts. */
  | { kind: "already-imported"; transactions: [TransactionRow, ...TransactionRow[]] }
  | { kind: "might-be-recorded"; transaction: TransactionRow }
  /** Discarded on this device within the last 6 months. */
  | { kind: "discarded-before" }
  /** A payment towards the card; `transfer` is the recorded payment it matches, if any. */
  | { kind: "card-payment"; transfer: TransferRow | null };

const daysApart = (a: string, b: string) =>
  Math.abs(differenceInCalendarDays(parseLocalDate(a), parseLocalDate(b)));

function closest<Row extends { date: string }>(date: string, rows: Row[]): Row | null {
  let best: Row | null = null;
  for (const row of rows) {
    const apart = daysApart(date, row.date);
    if (apart > MATCH_WINDOW_DAYS) continue;
    if (!best || apart < daysApart(date, best.date)) best = row;
  }
  return best;
}

/**
 * Flags each draft of an import into `accountId` against what this device
 * holds (ADR 0008). Read live, so a line imported on another device turns
 * "Already imported" once its events arrive.
 */
export function draftFlagger(
  accountId: string,
  transactions: TransactionRow[],
  transfers: TransferRow[],
  discardedKeys: ReadonlySet<string>
): (draft: DraftRow) => DraftFlag | null {
  const kept = transactions.filter((transaction) => !transaction.removed);
  const byImportKey = new Map<string, [TransactionRow, ...TransactionRow[]]>();
  for (const transaction of kept) {
    if (transaction.importKey === null) continue;
    const parts = byImportKey.get(transaction.importKey);
    if (parts) parts.push(transaction);
    else byImportKey.set(transaction.importKey, [transaction]);
  }
  const typedIn = kept.filter(
    (transaction) => transaction.importKey === null && transaction.accountId === accountId
  );
  const paymentsIn = transfers.filter(
    (transfer) => !transfer.removed && transfer.toAccountId === accountId
  );

  return (draft) => {
    const { purchaseDate, amount } = draft.line;
    const discarded = discardedKeys.has(draft.importKey);
    if (draft.line.isCardPayment) {
      const sameAmount = paymentsIn.filter((transfer) => transfer.amountCents === amount);
      const transfer = closest(purchaseDate, sameAmount);
      return !transfer && discarded
        ? { kind: "discarded-before" }
        : { kind: "card-payment", transfer };
    }
    const imported = byImportKey.get(draft.importKey);
    if (imported) return { kind: "already-imported", transactions: imported };
    if (discarded) return { kind: "discarded-before" };
    const lookAlike = closest(
      purchaseDate,
      typedIn.filter(
        (transaction) => transaction.type === draft.type && transaction.amountCents === amount
      )
    );
    return lookAlike ? { kind: "might-be-recorded", transaction: lookAlike } : null;
  };
}

/** Says what is kept of an already-imported line when its parts, or its edited amount, no longer total the line. */
export function keptTotalNote(transactions: TransactionRow[], lineAmount: Cents): string | null {
  const kept = sumCents(transactions.map((transaction) => transaction.amountCents));
  return kept === lineAmount
    ? null
    : `The kept parts total ${formatPHP(kept)} of this line's ${formatPHP(lineAmount)}.`;
}

/** A line already imported or discarded before, or a card payment already recorded, is discarded unless kept on purpose. */
export const discardedByDefault = (flag: DraftFlag | null) =>
  flag?.kind === "already-imported" ||
  flag?.kind === "discarded-before" ||
  (flag?.kind === "card-payment" && flag.transfer !== null);

/** A draft saved as a transaction must be named first; a card payment isn't saved as one. */
export const needsDescription = (draft: DraftRow) =>
  !draft.line.isCardPayment && draft.description.trim() === "";

/** Only an unflagged draft starts selected; every flag asks the member to decide. */
export const selectedByDefault = (flag: DraftFlag | null) => flag === null;

export interface ReviewedDraft extends DraftRow {
  flag: DraftFlag | null;
}

export interface ReviewedImport extends ImportRow {
  /** Statement order. */
  drafts: ReviewedDraft[];
}

/** Every open import, newest first, with its drafts flagged against what this device holds now. */
export async function readImportReview(): Promise<ReviewedImport[]> {
  const [imports, drafts, transactions, transfers, discardedKeys] = await Promise.all([
    listImports(),
    db.drafts.toArray(),
    db.transactions.toArray(),
    db.transfers.toArray(),
    db.discards.toCollection().primaryKeys(),
  ]);
  const discarded = new Set(discardedKeys);
  return imports.map((statement) => {
    const flagOf = draftFlagger(statement.accountId, transactions, transfers, discarded);
    return {
      ...statement,
      drafts: drafts
        .filter((draft) => draft.importId === statement.id)
        .sort((a, b) => a.position - b.position)
        .map((draft) => ({ ...draft, flag: flagOf(draft) })),
    };
  });
}
