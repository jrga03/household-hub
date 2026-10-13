import { useLiveQuery } from "dexie-react-hooks";
import { readLastImportCard } from "@/lib/import/drafts";
import { readImportReview } from "@/lib/import/review";
import type { StatementFormatId } from "@/lib/import/statement";

/** Open imports with their flagged drafts, re-read as records sync in; undefined while loading. */
export function useImportReview() {
  return useLiveQuery(readImportReview, []);
}

/** The card last imported into with this format on this device; null once read and none. */
export function useLastImportCard(formatId: StatementFormatId) {
  return useLiveQuery(async () => (await readLastImportCard(formatId)) ?? null, [formatId]);
}
