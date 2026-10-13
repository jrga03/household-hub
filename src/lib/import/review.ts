import { differenceInCalendarDays } from "date-fns";
import { db } from "@/lib/dexie/db";
import type { TransactionRow } from "@/lib/transactions/projection";
import type { TransferRow } from "@/lib/transfers/projection";
import { parseLocalDate } from "@/lib/utils/dates";
import { listImports, type DraftRow, type ImportRow } from "./drafts";

/** How far apart a statement line and a typed-in record may be dated and still look alike. */
const MATCH_WINDOW_DAYS = 3;

export type DraftFlag =
  | { kind: "already-imported"; transaction: TransactionRow }
  | { kind: "might-be-recorded"; transaction: TransactionRow }
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
  transfers: TransferRow[]
): (draft: DraftRow) => DraftFlag | null {
  const kept = transactions.filter((transaction) => !transaction.removed);
  const byImportKey = new Map(
    kept.flatMap((transaction) =>
      transaction.importKey === null ? [] : [[transaction.importKey, transaction] as const]
    )
  );
  const typedIn = kept.filter(
    (transaction) => transaction.importKey === null && transaction.accountId === accountId
  );
  const paymentsIn = transfers.filter(
    (transfer) => !transfer.removed && transfer.toAccountId === accountId
  );

  return (draft) => {
    const { purchaseDate, amount } = draft.line;
    if (draft.line.isCardPayment) {
      const sameAmount = paymentsIn.filter((transfer) => transfer.amountCents === amount);
      return { kind: "card-payment", transfer: closest(purchaseDate, sameAmount) };
    }
    const imported = byImportKey.get(draft.importKey);
    if (imported) return { kind: "already-imported", transaction: imported };
    const lookAlike = closest(
      purchaseDate,
      typedIn.filter(
        (transaction) => transaction.type === draft.type && transaction.amountCents === amount
      )
    );
    return lookAlike ? { kind: "might-be-recorded", transaction: lookAlike } : null;
  };
}

/** A line already imported, or a card payment already recorded, is discarded unless kept on purpose. */
export const discardedByDefault = (flag: DraftFlag | null) =>
  flag?.kind === "already-imported" || (flag?.kind === "card-payment" && flag.transfer !== null);

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
  const [imports, drafts, transactions, transfers] = await Promise.all([
    listImports(),
    db.drafts.toArray(),
    db.transactions.toArray(),
    db.transfers.toArray(),
  ]);
  return imports.map((statement) => {
    const flagOf = draftFlagger(statement.accountId, transactions, transfers);
    return {
      ...statement,
      drafts: drafts
        .filter((draft) => draft.importId === statement.id)
        .sort((a, b) => a.position - b.position)
        .map((draft) => ({ ...draft, flag: flagOf(draft) })),
    };
  });
}
