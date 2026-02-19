/**
 * Import Draft CRUD Helpers
 *
 * Manages ImportDraft and ImportSession records in Dexie.
 * Drafts are parsed PDF transactions awaiting user review before promotion
 * to real transactions via createOfflineTransactionsBatch().
 *
 * @module import-drafts
 */

import { nanoid } from "nanoid";
import { db } from "@/lib/dexie/db";
import { generateFingerprint } from "@/lib/duplicate-detector";
import { createOfflineTransactionsBatch } from "@/lib/offline/transactions";
import { parsePHP } from "@/lib/currency";
import type { TransactionInput } from "@/lib/offline/types";
import type {
  ImportDraft,
  ImportSession,
  ParsedTransactionRow,
  DraftStatus,
} from "@/types/pdf-import";

/**
 * Create an import session with all its draft records atomically.
 *
 * Converts ParsedTransactionRows into ImportDraft records with fingerprints
 * for later duplicate detection.
 */
export async function createImportSession(
  fileName: string,
  bankId: string,
  rows: ParsedTransactionRow[],
  accountId: string
): Promise<{ sessionId: string; drafts: ImportDraft[] }> {
  const sessionId = nanoid();
  const now = new Date().toISOString();

  const session: ImportSession = {
    id: sessionId,
    file_name: fileName,
    source_bank: bankId,
    total_rows: rows.length,
    confirmed_count: 0,
    discarded_count: 0,
    created_at: now,
  };

  const drafts: ImportDraft[] = rows.map((row) => {
    const amountCents = parsePHP(row.amount);
    const fingerprint = generateFingerprint({
      description: row.description,
      amount_cents: amountCents,
      date: row.date,
      account_id: accountId,
    });

    return {
      id: nanoid(),
      importSessionId: sessionId,
      date: row.date,
      description: row.description,
      amount_cents: amountCents,
      type: row.type,
      account_id: accountId,
      source_file_name: fileName,
      source_bank: bankId,
      parsed_confidence: row.confidence,
      original_text: row.rawText,
      user_edited: false,
      draft_status: "pending" as DraftStatus,
      import_key: fingerprint,
      created_at: now,
      updated_at: now,
    };
  });

  await db.transaction("rw", db.importSessions, db.importDrafts, async () => {
    await db.importSessions.add(session);
    await db.importDrafts.bulkAdd(drafts);
  });

  return { sessionId, drafts };
}

/**
 * Update a draft with user edits (inline editing in review table).
 */
export async function updateDraft(
  id: string,
  patch: Partial<
    Pick<
      ImportDraft,
      "date" | "description" | "amount_cents" | "type" | "category_id" | "notes" | "account_id"
    >
  >
): Promise<void> {
  await db.importDrafts.update(id, {
    ...patch,
    user_edited: true,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Mark a draft as discarded (soft delete — keeps provenance data).
 */
export async function discardDraft(id: string): Promise<void> {
  const draft = await db.importDrafts.get(id);
  if (!draft) return;

  await db.importDrafts.update(id, {
    draft_status: "discarded" as DraftStatus,
    updated_at: new Date().toISOString(),
  });

  // Update session counters
  await db.importSessions
    .where("id")
    .equals(draft.importSessionId)
    .modify((session: ImportSession) => {
      session.discarded_count += 1;
    });
}

/**
 * Get all pending/editing drafts, optionally filtered by session.
 */
export async function getPendingDrafts(sessionId?: string): Promise<ImportDraft[]> {
  if (sessionId) {
    return db.importDrafts
      .where("[importSessionId+draft_status]")
      .between([sessionId, "editing"], [sessionId, "pending"], true, true)
      .toArray();
  }

  return db.importDrafts.where("draft_status").anyOf("pending", "editing").sortBy("created_at");
}

/**
 * Count of pending drafts (for nav badge).
 */
export async function getPendingDraftCount(): Promise<number> {
  return db.importDrafts.where("draft_status").anyOf("pending", "editing").count();
}

/**
 * Promote confirmed drafts to real transactions via createOfflineTransactionsBatch().
 * Marks drafts as "confirmed" and updates session counters.
 */
export async function confirmDrafts(
  draftIds: string[],
  userId: string
): Promise<{
  success: boolean;
  confirmed: number;
  error?: string;
}> {
  const drafts = await db.importDrafts.bulkGet(draftIds);
  const validDrafts = drafts.filter(
    (d): d is ImportDraft =>
      d !== undefined && (d.draft_status === "pending" || d.draft_status === "editing")
  );

  if (validDrafts.length === 0) {
    return { success: true, confirmed: 0 };
  }

  // Convert drafts to TransactionInput for batch creation
  const inputs: TransactionInput[] = validDrafts.map((draft) => ({
    date: draft.date,
    description: draft.description,
    amount_cents: draft.amount_cents,
    type: draft.type,
    account_id: draft.account_id,
    category_id: draft.category_id,
    status: "pending" as const,
    visibility: "household" as const,
    notes: draft.notes,
    import_key: draft.import_key,
  }));

  const result = await createOfflineTransactionsBatch(inputs, userId);

  if (!result.success) {
    return { success: false, confirmed: 0, error: result.error };
  }

  // Mark drafts as confirmed
  const now = new Date().toISOString();
  await db.transaction("rw", db.importDrafts, db.importSessions, async () => {
    await Promise.all(
      validDrafts.map((draft) =>
        db.importDrafts.update(draft.id, {
          draft_status: "confirmed" as DraftStatus,
          updated_at: now,
        })
      )
    );

    // Group by session and update counters
    const sessionCounts = new Map<string, number>();
    for (const draft of validDrafts) {
      sessionCounts.set(draft.importSessionId, (sessionCounts.get(draft.importSessionId) || 0) + 1);
    }

    for (const [sessionId, count] of sessionCounts) {
      await db.importSessions
        .where("id")
        .equals(sessionId)
        .modify((session: ImportSession) => {
          session.confirmed_count += count;
        });
    }
  });

  return { success: true, confirmed: validDrafts.length };
}
