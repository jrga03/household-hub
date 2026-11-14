import { MAX_AMOUNT_CENTS, sumCents, type Cents } from "@/lib/currency";
import { appendTogether } from "@/lib/events/log";
import { db } from "@/lib/dexie/db";
import { deleteDrafts } from "@/lib/import/drafts";
import type { Actor } from "./accounts";
import { addTransaction } from "./transactions";

/**
 * Works offline. Each draft becomes a cleared transaction on its purchase
 * date, stamped with its import key (ADR 0008), and the drafts are deleted,
 * all as one change: if any is refused, nothing is saved and every draft stays.
 * The pin is one draft's vote, so a bulk save never pins.
 */
export function saveDrafts(actor: Actor, draftIds: string[], pinned = false): Promise<void> {
  return appendTogether(async () => {
    for (const draftId of draftIds) {
      const { draft, statement } = await requireSavableDraft(draftId);
      await addTransaction(actor, {
        date: draft.line.purchaseDate,
        type: draft.type,
        amountCents: draft.line.amount,
        accountId: statement.accountId,
        categoryId: draft.categoryId,
        description: draft.description,
        status: "cleared",
        importKey: draft.importKey,
        payingAccountId: draft.paidFromId,
        statementLine: draft.line.description,
        pinned: pinned && draftIds.length === 1,
      });
    }
    await deleteDrafts(draftIds);
  });
}

async function requireSavableDraft(draftId: string) {
  const draft = await db.drafts.get(draftId);
  if (!draft) throw new Error("A draft was saved or discarded elsewhere. Try again.");
  if (draft.line.isCardPayment) {
    throw new Error(
      `${draft.description} is a card payment. Record it as a card payment, or discard it.`
    );
  }
  const statement = await db.imports.get(draft.importId);
  if (!statement) throw new Error("That import no longer exists.");
  return { draft, statement };
}

export interface DraftPart {
  amountCents: Cents;
  description: string;
  /** Null for Unassigned. */
  categoryId: string | null;
  paidFromId: string | undefined;
}

/** Why these parts can't be saved yet, or null when they can. */
export function breakApartProblem(lineAmount: Cents, parts: DraftPart[]): string | null {
  if (parts.length < 2) return "Add a second part to break this line apart.";
  if (parts.some((part) => part.amountCents <= 0)) return "Every part needs an amount above ₱0.00.";
  if (parts.some((part) => part.amountCents > MAX_AMOUNT_CENTS)) {
    return "Every part needs an amount of at most ₱9,999,999.99.";
  }
  if (parts.some((part) => part.description.trim() === "")) {
    return "Every part needs a description.";
  }
  if (sumCents(parts.map((part) => part.amountCents)) !== lineAmount) {
    return "The parts must total the line.";
  }
  return null;
}

/**
 * Works offline. Each Part becomes its own cleared transaction with the line's
 * import key and type, and the draft is deleted, all as one change. Parts carry
 * no Statement Text, so they teach no learned suggestion, and nothing links them.
 */
export function breakApartDraft(actor: Actor, draftId: string, parts: DraftPart[]): Promise<void> {
  return appendTogether(async () => {
    const { draft, statement } = await requireSavableDraft(draftId);
    const problem = breakApartProblem(draft.line.amount, parts);
    if (problem) throw new Error(problem);
    for (const part of parts) {
      await addTransaction(actor, {
        date: draft.line.purchaseDate,
        type: draft.type,
        amountCents: part.amountCents,
        accountId: statement.accountId,
        categoryId: part.categoryId,
        description: part.description,
        status: "cleared",
        importKey: draft.importKey,
        payingAccountId: part.paidFromId,
      });
    }
    await deleteDrafts([draftId]);
  });
}
