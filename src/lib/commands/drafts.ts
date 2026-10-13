import { appendTogether } from "@/lib/events/log";
import { db } from "@/lib/dexie/db";
import { deleteDrafts } from "@/lib/import/drafts";
import type { Actor } from "./accounts";
import { addTransaction } from "./transactions";

/**
 * Works offline. Each draft becomes a cleared transaction on its purchase
 * date, stamped with its import key (ADR 0008), and the drafts are deleted,
 * all as one change: if any is refused, nothing is saved and every draft stays.
 */
export function saveDrafts(actor: Actor, draftIds: string[]): Promise<void> {
  return appendTogether(async () => {
    for (const draftId of draftIds) {
      const draft = await db.drafts.get(draftId);
      if (!draft) throw new Error("A draft was saved or discarded elsewhere. Try again.");
      if (draft.line.isCardPayment) {
        throw new Error(
          `${draft.description} is a card payment. Record it as a card payment, or discard it.`
        );
      }
      const statement = await db.imports.get(draft.importId);
      if (!statement) throw new Error("That import no longer exists.");
      await addTransaction(actor, {
        date: draft.line.purchaseDate,
        type: draft.type,
        amountCents: draft.line.amount,
        accountId: statement.accountId,
        categoryId: draft.categoryId,
        description: draft.description,
        status: "cleared",
        importKey: draft.importKey,
      });
    }
    await deleteDrafts(draftIds);
  });
}
