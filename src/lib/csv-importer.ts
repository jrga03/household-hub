/**
 * CSV Importer for Household Hub
 *
 * Core logic for parsing, mapping, validating, and importing CSV transaction data.
 * Complements csv-exporter.ts to provide round-trip data portability.
 *
 * KEY FEATURES:
 * - Auto-detect column mappings from headers
 * - Manual mapping override
 * - Row-by-row validation
 * - Account/category matching by ID or name
 * - Batch processing for large files (100 rows/batch)
 * - Round-Trip Guarantee: Preserve created_at/created_by metadata
 *
 * @module csv-importer
 */

import Papa from "papaparse";
import { parsePHP, validateAmount } from "./currency";
import type { Transaction } from "@/types/transactions";
import { generateFingerprint } from "./duplicate-detector";

/**
 * Column mapping configuration
 * Maps CSV column indices to transaction fields
 */
export interface ColumnMapping {
  description: number | null;
  amount: number | null;
  date: number | null;
  account: number | null;
  category: number | null;
  type: number | null;
  notes: number | null;
  status: number | null;
  created_at: number | null; // Round-Trip Guarantee: preserve metadata
  created_by: number | null; // Round-Trip Guarantee: preserve metadata
}

/**
 * CSV parse result from PapaParse
 */
export interface ParseResult {
  data: string[][];
  headers: string[];
  errors: Papa.ParseError[];
}

/**
 * Validation error for a specific field in a row
 */
export interface ValidationError {
  row: number;
  field: string;
  message: string;
  value: unknown;
}

/**
 * Parse CSV file with PapaParse
 *
 * @param file CSV file to parse
 * @returns Promise resolving to parsed data with headers and errors
 */
export async function parseCSV(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      // CSV injection prevention: Strip formula characters
      transform: (value: string) => {
        if (value && typeof value === "string") {
          const firstChar = value.charAt(0);
          // Prevent CSV injection by prefixing formula characters with single quote
          if (["=", "+", "-", "@"].includes(firstChar)) {
            return "'" + value;
          }
        }
        return value;
      },
      complete: (results) => {
        const headers = results.data[0] as string[];
        const data = results.data.slice(1) as string[][];

        resolve({
          data,
          headers,
          errors: results.errors,
        });
      },
      error: (error) => {
        reject(error);
      },
    });
  });
}

/**
 * Auto-detect column mappings based on header names
 *
 * Uses regex patterns to match common column naming conventions.
 * Returns best-guess mappings with null for unmatched fields.
 *
 * @param headers Array of column header strings
 * @returns ColumnMapping with detected indices
 */
export function detectColumnMappings(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    description: null,
    amount: null,
    date: null,
    account: null,
    category: null,
    type: null,
    notes: null,
    status: null,
    created_at: null,
    created_by: null,
  };

  // Regex patterns for each field
  const patterns: Record<keyof ColumnMapping, RegExp[]> = {
    description: [/description/i, /name/i, /title/i, /memo/i],
    amount: [/amount/i, /value/i, /price/i, /total/i],
    date: [/^date$/i, /^day$/i, /^when$/i], // Exclude "created_at" from matching
    account: [/account/i, /bank/i, /wallet/i],
    category: [/category/i, /class/i],
    type: [/^type$/i, /income|expense/i, /direction/i],
    notes: [/notes/i, /comment/i, /remark/i],
    status: [/status/i, /cleared/i, /pending/i],
    created_at: [/created_at/i, /created.*at/i, /timestamp/i],
    created_by: [/created_by/i, /created.*by/i, /author/i, /user/i],
  };

  // Match each header against patterns
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i].trim();

    for (const [field, regexes] of Object.entries(patterns)) {
      for (const regex of regexes) {
        if (regex.test(header)) {
          mapping[field as keyof ColumnMapping] = i;
          break;
        }
      }
    }
  }

  return mapping;
}

/**
 * Map CSV row to Transaction object using column mapping
 *
 * IMPORTANT: Preserves created_at and created_by for Round-Trip Guarantee
 * (FEATURES.md lines 378-384: Export → Import should produce identical data)
 *
 * @param row Array of cell values
 * @param mapping Column mapping configuration
 * @returns Partial transaction object
 */
export function mapRowToTransaction(row: string[], mapping: ColumnMapping): Partial<Transaction> {
  const transaction: Partial<Transaction> = {
    description: mapping.description !== null ? String(row[mapping.description] || "") : "",
    amount_cents: mapping.amount !== null ? parsePHP(row[mapping.amount]) : 0,
    date: mapping.date !== null ? String(row[mapping.date] || "") : "",
    account_id: mapping.account !== null ? String(row[mapping.account] || "") : "",
    category_id: mapping.category !== null ? String(row[mapping.category] || "") : "",
    type: mapping.type !== null ? (row[mapping.type] as "income" | "expense") : "expense",
    notes: mapping.notes !== null ? String(row[mapping.notes] || "") : undefined,
    status: mapping.status !== null ? (row[mapping.status] as "pending" | "cleared") : "pending",
  };

  // Preserve metadata fields for round-trip guarantee
  if (mapping.created_at !== null && row[mapping.created_at]) {
    transaction.created_at = String(row[mapping.created_at]);
  }
  if (mapping.created_by !== null && row[mapping.created_by]) {
    transaction.created_by_user_id = String(row[mapping.created_by]);
  }

  return transaction;
}

/**
 * Validate mapped transaction data
 *
 * Checks required fields, amount validity, date format, and foreign key references.
 * Accounts and categories can be matched by either ID or name.
 *
 * @param transaction Partial transaction to validate
 * @param rowIndex Row number for error reporting
 * @param accounts Array of available accounts
 * @param categories Array of available categories
 * @returns Array of validation errors (empty if valid)
 */
export function validateTransaction(
  transaction: Partial<Transaction>,
  rowIndex: number,
  accounts: { id: string; name: string }[],
  categories: { id: string; name: string }[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required fields
  if (!transaction.description || transaction.description.trim() === "") {
    errors.push({
      row: rowIndex,
      field: "description",
      message: "Description is required",
      value: transaction.description,
    });
  }

  // Amount validation
  if (transaction.amount_cents === undefined || !validateAmount(transaction.amount_cents)) {
    errors.push({
      row: rowIndex,
      field: "amount",
      message: "Invalid amount",
      value: transaction.amount_cents,
    });
  }

  // Date validation
  if (!transaction.date || !isValidDate(transaction.date)) {
    errors.push({
      row: rowIndex,
      field: "date",
      message: "Invalid date format",
      value: transaction.date,
    });
  }

  // Account validation (match by ID or name)
  if (
    transaction.account_id &&
    !accounts.find((a) => a.id === transaction.account_id || a.name === transaction.account_id)
  ) {
    errors.push({
      row: rowIndex,
      field: "account",
      message: "Account not found",
      value: transaction.account_id,
    });
  }

  // Category validation (match by ID or name)
  if (
    transaction.category_id &&
    !categories.find((c) => c.id === transaction.category_id || c.name === transaction.category_id)
  ) {
    errors.push({
      row: rowIndex,
      field: "category",
      message: "Category not found",
      value: transaction.category_id,
    });
  }

  // Type validation
  if (transaction.type && !["income", "expense"].includes(transaction.type)) {
    errors.push({
      row: rowIndex,
      field: "type",
      message: 'Type must be "income" or "expense"',
      value: transaction.type,
    });
  }

  return errors;
}

/**
 * Check if date string is valid
 */
function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Generate error report CSV
 *
 * Creates downloadable CSV file with validation errors.
 *
 * @param errors Array of validation errors
 * @returns CSV string
 */
export function generateErrorReport(errors: ValidationError[]): string {
  const rows = [["Row", "Field", "Message", "Value"]];

  for (const error of errors) {
    rows.push([
      String(error.row + 2), // +2 because row 1 is header, index starts at 0
      error.field,
      error.message,
      String(error.value || ""),
    ]);
  }

  return Papa.unparse(rows);
}

/**
 * Process import in batches to avoid UI blocking
 *
 * Performance note: 16ms = one frame at 60fps, allows smooth UI repainting
 *
 * @param items Array of items to process
 * @param batchSize Number of items per batch (default 100)
 * @yields Batches of items
 */
export async function* batchProcess<T>(
  items: T[],
  batchSize: number = 100
): AsyncGenerator<T[], void, unknown> {
  for (let i = 0; i < items.length; i += batchSize) {
    yield items.slice(i, i + batchSize);
    // Allow UI to repaint between batches (one frame at 60fps)
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
}

/**
 * Resolve account/category names to their IDs
 *
 * CSVs can reference accounts/categories by either ID or name.
 * This function converts names to IDs after validation confirms they exist.
 *
 * CRITICAL: Must be called after validation to ensure references are valid.
 *
 * @param transaction Transaction with potential name references
 * @param accounts Available accounts (with id and name)
 * @param categories Available categories (with id and name)
 * @returns Transaction with resolved IDs
 */
export function resolveReferences(
  transaction: Partial<Transaction>,
  accounts: { id: string; name: string }[],
  categories: { id: string; name: string }[]
): Partial<Transaction> {
  let resolvedAccountId = transaction.account_id;
  let resolvedCategoryId = transaction.category_id;

  // Resolve account name to ID
  if (transaction.account_id) {
    const account = accounts.find(
      (a) => a.id === transaction.account_id || a.name === transaction.account_id
    );
    resolvedAccountId = account?.id || null;
  }

  // Resolve category name to ID
  if (transaction.category_id) {
    const category = categories.find(
      (c) => c.id === transaction.category_id || c.name === transaction.category_id
    );
    resolvedCategoryId = category?.id || null;
  }

  return {
    ...transaction,
    account_id: resolvedAccountId,
    category_id: resolvedCategoryId,
  };
}

/**
 * Store import fingerprint for duplicate prevention across imports
 * Per Decision #81: Store as import_key field to prevent re-importing same data
 *
 * @param transaction Transaction to add fingerprint to
 * @returns Transaction with import_key field
 */
export function addImportKey(transaction: Partial<Transaction>): Partial<Transaction> {
  return {
    ...transaction,
    import_key: generateFingerprint(transaction),
  };
}
