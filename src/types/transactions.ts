/**
 * Transaction Types for Household Hub
 *
 * Defines TypeScript interfaces for the transactions table and related operations.
 * Transactions are the core entity for financial tracking.
 *
 * KEY DESIGN PATTERNS:
 * 1. Amount Storage: Always positive integers with explicit type field (income/expense)
 * 2. Date Storage: DATE type (user's local date), not TIMESTAMPTZ
 * 3. Transfer Pairs: Two linked transactions with shared transfer_group_id
 * 4. Visibility: Household (shared) or personal (private)
 *
 * @see DATABASE.md lines 160-198 for schema specification
 * @see DECISIONS.md #9 for amount storage rationale
 * @see DECISIONS.md #60 for transfer representation
 */

import type { Cents } from "@/lib/currency";

/**
 * Transaction type: income or expense
 * CRITICAL: Always use with positive amount_cents
 */
export type TransactionType = "income" | "expense";

/**
 * Transaction status: pending or cleared
 * Used to track which transactions have been reconciled
 */
export type TransactionStatus = "pending" | "cleared";

/**
 * Transaction visibility: household or personal
 * Household: Visible to all household members
 * Personal: Only visible to creator
 */
export type TransactionVisibility = "household" | "personal";

/**
 * Type guard for TransactionType enum values
 */
export const isTransactionType = (value: string): value is TransactionType =>
  value === "income" || value === "expense";

/**
 * Type guard for TransactionStatus enum values
 */
export const isTransactionStatus = (value: string): value is TransactionStatus =>
  value === "pending" || value === "cleared";

/**
 * Type guard for TransactionVisibility enum values
 */
export const isTransactionVisibility = (value: string): value is TransactionVisibility =>
  value === "household" || value === "personal";

/**
 * Main Transaction interface
 * Represents a single financial transaction (income or expense)
 */
export interface Transaction {
  id: string;
  household_id: string;

  // Core fields
  date: string; // DATE type: "YYYY-MM-DD" format (user's local date)
  description: string;
  amount_cents: Cents; // Always positive, type field indicates direction
  type: TransactionType;
  currency_code: string; // "PHP" only for MVP

  // Relationships
  account_id: string | null;
  category_id: string | null;
  transfer_group_id: string | null; // Links paired transfer transactions
  debt_id: string | null; // Optional link to external debt
  internal_debt_id: string | null; // Optional link to internal debt

  // Status and filtering
  status: TransactionStatus;
  visibility: TransactionVisibility;

  // User tracking
  created_by_user_id: string | null;
  tagged_user_ids: string[]; // @mentions - users involved in transaction

  // Additional data
  notes: string | null;
  import_key: string | null; // For CSV import deduplication

  // Sync and audit
  device_id: string | null;
  created_at: string; // TIMESTAMPTZ (ISO 8601)
  updated_at: string; // TIMESTAMPTZ (ISO 8601)
}

/**
 * Transaction filter parameters
 * Used for querying transactions with various filters
 *
 * NOTE: Uses camelCase for URL params and TypeScript code.
 * Converted to snake_case when building database queries.
 */
export interface TransactionFilters {
  dateFrom?: string; // "YYYY-MM-DD" format
  dateTo?: string; // "YYYY-MM-DD" format
  accountId?: string;
  categoryId?: string;
  status?: TransactionStatus | null; // null = "all"
  type?: TransactionType | null; // null = "all"
  search?: string; // Full-text search on description and notes
  excludeTransfers?: boolean; // CRITICAL: Default true for analytics/budgets
  amountMin?: Cents;
  amountMax?: Cents;
}

/**
 * Transaction with joined relationships
 * Used when fetching transactions with account/category details
 */
export interface TransactionWithRelations extends Transaction {
  account?: {
    id: string;
    name: string;
  } | null;
  category?: {
    id: string;
    name: string;
    color: string;
  } | null;
}
