import { differenceInCalendarDays } from "date-fns";
import { formatPHP, isAmount, sumCents, type Cents } from "@/lib/currency";
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
  | { kind: "card-payment"; transfer: TransferRow | null }
  /** Above the most a record can hold, so saving it whole would fail. */
  | { kind: "over-limit" };

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
 * Pairs each recorded payment with at most one payment draft of its amount, nearest-dated pairs first.
 * shortcut: greedy, so a chain like drafts on the 10th and 13th with payments on the 8th and 11th
 * matches one pair, not two; upgrade to a best-coverage match if members hit it.
 */
function matchPayments(
  paymentDrafts: DraftRow[],
  payments: TransferRow[]
): Map<string, TransferRow> {
  const pairs = paymentDrafts.flatMap((draft) =>
    payments
      .filter((payment) => payment.amountCents === draft.line.amount)
      .map((payment) => ({
        draft,
        payment,
        apart: daysApart(draft.line.purchaseDate, payment.date),
      }))
      .filter((pair) => pair.apart <= MATCH_WINDOW_DAYS)
  );
  pairs.sort((a, b) => a.apart - b.apart || a.draft.position - b.draft.position);
  const paymentOf = new Map<string, TransferRow>();
  const used = new Set<string>();
  for (const { draft, payment } of pairs) {
    if (paymentOf.has(draft.id) || used.has(payment.id)) continue;
    paymentOf.set(draft.id, payment);
    used.add(payment.id);
  }
  return paymentOf;
}

/**
 * Flags each draft of an import into `accountId` against what this device
 * holds (ADR 0008). Read live, so a line imported on another device turns
 * "Already imported" once its events arrive.
 */
export function draftFlagger(
  accountId: string,
  drafts: DraftRow[],
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
  const paymentOf = matchPayments(
    drafts.filter((draft) => draft.line.isCardPayment),
    paymentsIn
  );

  return (draft) => {
    const { purchaseDate, amount } = draft.line;
    const discarded = discardedKeys.has(draft.importKey);
    if (draft.line.isCardPayment) {
      const transfer = paymentOf.get(draft.id) ?? null;
      if (transfer) return { kind: "card-payment", transfer };
      if (discarded) return { kind: "discarded-before" };
      return isAmount(amount) ? { kind: "card-payment", transfer } : { kind: "over-limit" };
    }
    const imported = byImportKey.get(draft.importKey);
    if (imported) return { kind: "already-imported", transactions: imported };
    if (discarded) return { kind: "discarded-before" };
    if (!isAmount(amount)) return { kind: "over-limit" };
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
    const ofImport = drafts
      .filter((draft) => draft.importId === statement.id)
      .sort((a, b) => a.position - b.position);
    const flagOf = draftFlagger(statement.accountId, ofImport, transactions, transfers, discarded);
    return { ...statement, drafts: ofImport.map((draft) => ({ ...draft, flag: flagOf(draft) })) };
  });
}
