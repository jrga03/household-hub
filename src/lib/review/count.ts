import { listAccounts, listRetiredAccounts } from "@/lib/accounts/projection";
import type { Cents } from "@/lib/currency";
import { db } from "@/lib/dexie/db";
import { needsCategory } from "@/lib/transactions/filter";
import { readAccountMoney, sumUnassigned } from "@/lib/transactions/money";
import { owedByPayer } from "@/lib/transactions/owed";

/** Every kind of item the Review screen lists, in its section order. */
export const REVIEW_KINDS = [
  "uncategorized",
  "payBack",
  "drafts",
  "unassigned",
  "joinRequests",
] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];
export type ReviewCounts = Record<ReviewKind, number>;

/** The kinds this device can count without a connection. */
export type LocalReviewCounts = Omit<ReviewCounts, "joinRequests">;

/** What the household owes each member, from this device's transactions. */
export const readOwed = async () =>
  owedByPayer(await db.transactions.orderBy("paidByUserId").toArray());

/**
 * Unassigned summed as Assign money's hero sums it: accounts in use and retired
 * ones, deleted ones left out. Cards hold no envelopes, so they add nothing.
 */
export async function readUnassigned(): Promise<Cents> {
  const [accounts, retired, money] = await Promise.all([
    listAccounts(),
    listRetiredAccounts(),
    readAccountMoney(),
  ]);
  return sumUnassigned([...accounts, ...retired], money);
}

export async function countLocalReviewItems(): Promise<LocalReviewCounts> {
  const [uncategorized, owed, drafts, unassigned] = await Promise.all([
    db.transactions
      .filter((transaction) => !transaction.removed && needsCategory(transaction))
      .count(),
    readOwed(),
    db.drafts.count(),
    readUnassigned(),
  ]);
  return { uncategorized, payBack: owed.size, drafts, unassigned: unassigned === 0 ? 0 : 1 };
}

export const totalReviewItems = (counts: ReviewCounts) =>
  REVIEW_KINDS.reduce((total, kind) => total + counts[kind], 0);
