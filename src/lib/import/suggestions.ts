import type { CategoryRow } from "@/lib/categories/projection";
import type { TransactionRow } from "@/lib/transactions/projection";
import type { DraftRow, SuggestionSource } from "./drafts";
import { normalizeStatementText } from "./statement";

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

const newestFirst = (a: TransactionRow, b: TransactionRow) =>
  a.date !== b.date
    ? a.date < b.date
      ? 1
      : -1
    : a.recordedHlc !== b.recordedHlc
      ? a.recordedHlc < b.recordedHlc
        ? 1
        : -1
      : a.id < b.id
        ? 1
        : -1;

/** The category of the most recent saved transaction with the same normalized description. */
export const historySuggester: DraftSuggester = (drafts, { transactions, categories }) => {
  const usable = new Set(categories.map((category) => category.id));
  const latestCategory = new Map<string, string>();
  for (const transaction of [...transactions].sort(newestFirst)) {
    const key = normalizeStatementText(transaction.description);
    if (transaction.removed || key === "" || latestCategory.has(key)) continue;
    if (transaction.categoryId !== null && usable.has(transaction.categoryId)) {
      latestCategory.set(key, transaction.categoryId);
    }
  }
  const suggestions = drafts.flatMap((draft): Suggestion[] => {
    if (draft.line.isCardPayment) return [];
    const categoryId = latestCategory.get(normalizeStatementText(draft.line.description));
    return categoryId ? [{ draftId: draft.id, categoryId, source: "history" }] : [];
  });
  return Promise.resolve(suggestions);
};

const WINDOW = 5;

/** The value with weight 2 or more and over half the window's weight, if any. */
function winner(window: { value: string; weight: number }[]): string | undefined {
  const weights = new Map<string, number>();
  let total = 0;
  for (const { value, weight } of window) {
    weights.set(value, (weights.get(value) ?? 0) + weight);
    total += weight;
  }
  for (const [value, weight] of weights) {
    if (weight >= 2 && weight * 2 > total) return value;
  }
  return undefined;
}

/**
 * A description and a category voted by the newest saves with the same
 * Statement Text (GLOSSARY: Statement Text, Pin).
 */
export const learnedSuggester: DraftSuggester = (drafts, { transactions, categories }) => {
  const usable = new Set(categories.map((category) => category.id));
  const byId = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const newestSaves = [...byId.values()].sort(newestFirst);
  const suggestions = drafts.flatMap((draft): Suggestion[] => {
    const statementText = normalizeStatementText(draft.line.description);
    if (draft.line.isCardPayment || statementText === "") return [];
    const saves = newestSaves.filter(
      (transaction) => !transaction.removed && transaction.statementText === statementText
    );
    const newestPin = saves.find((save) => save.pinned);
    const vote = (save: TransactionRow, value: string) => ({
      value,
      weight: save === newestPin ? 3 : 1,
    });
    const description = winner(saves.slice(0, WINDOW).map((save) => vote(save, save.description)));
    const categoryId = winner(
      saves
        .flatMap((save) =>
          save.categoryId !== null && usable.has(save.categoryId)
            ? [vote(save, save.categoryId)]
            : []
        )
        .slice(0, WINDOW)
    );
    if (description === undefined && categoryId === undefined) return [];
    return [{ draftId: draft.id, description, categoryId, source: "learned" }];
  });
  return Promise.resolve(suggestions);
};
