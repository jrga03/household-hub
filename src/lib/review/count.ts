import { db } from "@/lib/dexie/db";
import { needsCategory } from "@/lib/transactions/filter";

/** How many local items need a look: for now, expenses with no category. */
export function countReviewItems(): Promise<number> {
  return db.transactions
    .filter((transaction) => !transaction.removed && needsCategory(transaction))
    .count();
}
