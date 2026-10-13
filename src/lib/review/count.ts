import { db } from "@/lib/dexie/db";
import { needsCategory } from "@/lib/transactions/filter";

/** Every kind of item the Review screen lists, in its section order. */
export const REVIEW_KINDS = ["uncategorized", "drafts", "joinRequests"] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];
export type ReviewCounts = Record<ReviewKind, number>;

/** The kinds this device can count without a connection. */
export type LocalReviewCounts = Pick<ReviewCounts, "uncategorized" | "drafts">;

export async function countLocalReviewItems(): Promise<LocalReviewCounts> {
  const [uncategorized, drafts] = await Promise.all([
    db.transactions
      .filter((transaction) => !transaction.removed && needsCategory(transaction))
      .count(),
    db.drafts.count(),
  ]);
  return { uncategorized, drafts };
}

export const totalReviewItems = (counts: ReviewCounts) =>
  REVIEW_KINDS.reduce((total, kind) => total + counts[kind], 0);
