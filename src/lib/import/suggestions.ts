import type { CategoryRow } from "@/lib/categories/projection";
import type { TransactionRow } from "@/lib/transactions/projection";
import type { DraftRow, SuggestionSource } from "./drafts";

export interface Suggestion {
  draftId: string;
  description?: string;
  categoryId?: string;
  source: SuggestionSource;
}

export interface SuggestionContext {
  /** Every transaction this device holds. */
  transactions: TransactionRow[];
  /** The categories in use that the import's account can hold money in. */
  categories: Pick<CategoryRow, "id">[];
}

/**
 * Proposes descriptions or categories for drafts. Suggesters run in order,
 * after the import is created, and never block the review; a later one can't
 * replace what an earlier one or the member set.
 */
export type DraftSuggester = (
  drafts: DraftRow[],
  context: SuggestionContext
) => Promise<Suggestion[]>;

/** Uppercased, digits stripped, spaces squeezed: reference numbers change, merchants don't. */
export const normalizeDescription = (description: string) =>
  description.toUpperCase().replace(/\d/g, "").replace(/\s+/g, " ").trim();

const newestFirst = (a: TransactionRow, b: TransactionRow) =>
  a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.recordedHlc < b.recordedHlc ? 1 : -1;

/** The category of the most recent saved transaction with the same normalized description. */
export const historySuggester: DraftSuggester = (drafts, { transactions, categories }) => {
  const usable = new Set(categories.map((category) => category.id));
  const latestCategory = new Map<string, string>();
  for (const transaction of [...transactions].sort(newestFirst)) {
    const key = normalizeDescription(transaction.description);
    if (transaction.removed || key === "" || latestCategory.has(key)) continue;
    if (transaction.categoryId !== null && usable.has(transaction.categoryId)) {
      latestCategory.set(key, transaction.categoryId);
    }
  }
  const suggestions = drafts.flatMap((draft): Suggestion[] => {
    if (draft.line.isCardPayment) return [];
    const categoryId = latestCategory.get(normalizeDescription(draft.line.description));
    return categoryId ? [{ draftId: draft.id, categoryId, source: "history" }] : [];
  });
  return Promise.resolve(suggestions);
};
