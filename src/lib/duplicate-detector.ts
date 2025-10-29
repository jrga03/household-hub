/**
 * Duplicate Detector for CSV Import
 *
 * Implements hash-based fingerprinting for duplicate detection during CSV import.
 * Per Decision #81: Uses description + amount + date + account as unique key.
 *
 * IMPORTANT: Must include account_id in fingerprint to prevent false duplicates.
 * Example: "Groceries ₱500 2025-01-15" in Cash vs Credit Card are DIFFERENT transactions.
 *
 * @module duplicate-detector
 */

import type { Transaction } from "@/types/transactions";

/**
 * Generate fingerprint hash for duplicate detection
 * Per Decision #81: Uses description + amount + date + account as unique key
 *
 * IMPORTANT: Must include account to prevent false duplicates
 * Example: "Groceries ₱500 2025-01-15" in Cash vs Credit Card are DIFFERENT
 *
 * Note: Using simple hashCode instead of sha256 for MVP (faster, sufficient for dedup)
 */
export function generateFingerprint(transaction: Partial<Transaction>): string {
  const parts = [
    transaction.description?.trim().toLowerCase() || "",
    transaction.amount_cents?.toString() || "",
    transaction.date || "",
    transaction.account_id || "", // CRITICAL: Include account per Decision #81
  ];

  const key = parts.join("|");
  return hashCode(key);
}

/**
 * Simple hash function for string keys
 * Uses Java's String.hashCode() algorithm
 */
function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * Detect duplicates in import data against existing transactions
 *
 * Compares fingerprints of import rows against existing transaction fingerprints.
 * Returns list of matches with metadata for user resolution.
 *
 * @param importData Array of partial transactions from CSV
 * @param existingTransactions Array of existing transactions from database (accepts Partial for compatibility)
 * @returns Array of duplicate matches found
 */
export async function detectDuplicates(
  importData: Partial<Transaction>[],
  existingTransactions: Partial<Transaction>[]
): Promise<DuplicateMatch[]> {
  const existingFingerprints = new Map<string, Partial<Transaction>>();

  // Build fingerprint map of existing transactions
  for (const txn of existingTransactions) {
    const fingerprint = generateFingerprint(txn);
    existingFingerprints.set(fingerprint, txn);
  }

  // Find duplicates in import data
  const duplicates: DuplicateMatch[] = [];

  for (let i = 0; i < importData.length; i++) {
    const importRow = importData[i];
    const fingerprint = generateFingerprint(importRow);

    if (existingFingerprints.has(fingerprint)) {
      duplicates.push({
        importIndex: i,
        importRow,
        existingTransaction: existingFingerprints.get(fingerprint)!,
        fingerprint,
        confidence: 1.0, // Exact match
      });
    }
  }

  return duplicates;
}

/**
 * Duplicate match result
 */
export interface DuplicateMatch {
  /** Index of the row in the import data */
  importIndex: number;
  /** The imported row data */
  importRow: Partial<Transaction>;
  /** The existing transaction that matches */
  existingTransaction: Partial<Transaction>;
  /** The fingerprint hash that matched */
  fingerprint: string;
  /** Confidence score (0-1, 1 = exact match) */
  confidence: number;
}

/**
 * Duplicate resolution action types
 */
export type DuplicateAction = "skip" | "keep-both" | "replace";

/**
 * User's resolution for a specific duplicate
 */
export interface DuplicateResolution {
  /** The duplicate match to resolve */
  match: DuplicateMatch;
  /** Action chosen by user */
  action: DuplicateAction;
}
