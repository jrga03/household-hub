/**
 * PDF Import Duplicate Detection
 *
 * Checks parsed PDF rows against both live transactions and confirmed import drafts
 * to prevent double-importing the same statement.
 *
 * Reuses generateFingerprint() from duplicate-detector.ts for consistency
 * with the CSV import dedup strategy.
 *
 * @module pdf-import-duplicates
 */

import { db } from "@/lib/dexie/db";
import { generateFingerprint } from "@/lib/duplicate-detector";
import { parsePHP } from "@/lib/currency";
import type { ParsedTransactionRow } from "@/types/pdf-import";

/**
 * Check parsed PDF rows against existing transactions and confirmed drafts.
 * Returns a Set of row indices that are duplicates.
 */
export async function detectPDFDuplicates(
  rows: ParsedTransactionRow[],
  accountId: string
): Promise<Set<number>> {
  const duplicateIndices = new Set<number>();

  // Build fingerprints for all rows
  const rowFingerprints = rows.map((row) =>
    generateFingerprint({
      description: row.description,
      amount_cents: parsePHP(row.amount),
      date: row.date,
      account_id: accountId,
    })
  );

  // Get all existing transaction fingerprints for this account
  const existingTransactions = await db.transactions
    .where("account_id")
    .equals(accountId)
    .toArray();

  const existingFingerprints = new Set(existingTransactions.map((tx) => generateFingerprint(tx)));

  // Also check confirmed import drafts for this account
  const confirmedDrafts = await db.importDrafts
    .where("account_id")
    .equals(accountId)
    .filter((d) => d.draft_status === "confirmed")
    .toArray();

  for (const draft of confirmedDrafts) {
    if (draft.import_key) {
      existingFingerprints.add(draft.import_key);
    }
  }

  // Check each row against existing fingerprints
  for (let i = 0; i < rowFingerprints.length; i++) {
    if (existingFingerprints.has(rowFingerprints[i])) {
      duplicateIndices.add(i);
    }
  }

  return duplicateIndices;
}
