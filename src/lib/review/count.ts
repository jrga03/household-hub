import { db } from "@/lib/dexie/db";
import { needsCategory } from "@/lib/transactions/filter";
import { isOpenOutOfPocket, owedByPayer } from "@/lib/transactions/owed";

/** Every kind of item the Review screen lists, in its section order. */
export const REVIEW_KINDS = ["uncategorized", "payBack", "drafts", "joinRequests"] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];
export type ReviewCounts = Record<ReviewKind, number>;

/** The kinds this device can count without a connection. */
export type LocalReviewCounts = Pick<ReviewCounts, "uncategorized" | "payBack" | "drafts">;

/** What the household owes each member, from this device's transactions. */
export const readOwed = async () =>
  owedByPayer(await db.transactions.filter(isOpenOutOfPocket).toArray());

export async function countLocalReviewItems(): Promise<LocalReviewCounts> {
  const [uncategorized, owed, drafts] = await Promise.all([
    db.transactions
      .filter((transaction) => !transaction.removed && needsCategory(transaction))
      .count(),
    readOwed(),
    db.drafts.count(),
  ]);
  return { uncategorized, payBack: owed.size, drafts };
}

export const totalReviewItems = (counts: ReviewCounts) =>
  REVIEW_KINDS.reduce((total, kind) => total + counts[kind], 0);
