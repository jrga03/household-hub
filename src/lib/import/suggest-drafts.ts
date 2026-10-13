import { getAccount } from "@/lib/accounts/projection";
import { canHoldMoneyIn } from "@/lib/categories/projection";
import { db } from "@/lib/dexie/db";
import { reportError } from "@/lib/sentry";
import { listDrafts } from "./drafts";
import { historySuggester, type DraftSuggester, type Suggestion } from "./suggestions";

/** Fills only what nothing has chosen yet: the member's edits and earlier suggestions stand. */
function applySuggestions(suggestions: Suggestion[]): Promise<void> {
  return db.transaction("rw", db.drafts, async () => {
    for (const { draftId, categoryId, description, source } of suggestions) {
      const draft = await db.drafts.get(draftId);
      if (!draft) continue;
      if (categoryId !== undefined && draft.categorySource === null) {
        await db.drafts.update(draftId, { categoryId, categorySource: source });
      }
      if (description !== undefined && draft.descriptionSource === "statement") {
        await db.drafts.update(draftId, { description, descriptionSource: source });
      }
    }
  });
}

/**
 * Runs each suggester over an import's drafts, in order. Called without
 * waiting: the drafts are reviewable at once, and a failing suggester is
 * reported and skipped.
 */
export async function suggestDrafts(
  importId: string,
  suggesters: DraftSuggester[] = [historySuggester]
): Promise<void> {
  for (const suggester of suggesters) {
    try {
      const statement = await db.imports.get(importId);
      const account = statement && (await getAccount(statement.accountId));
      if (!account) return;
      const [drafts, transactions, categories] = await Promise.all([
        listDrafts(importId),
        db.transactions.toArray(),
        db.categories
          .filter((category) => !category.retired && canHoldMoneyIn(category, account))
          .toArray(),
      ]);
      await applySuggestions(await suggester(drafts, { transactions, categories }));
    } catch (error) {
      reportError(error, { subsystem: "import", operation: "suggest" });
    }
  }
}
