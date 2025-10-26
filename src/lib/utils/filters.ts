import type { TransactionFilters } from "@/types/transactions";

/**
 * Check if any filters are actively applied (excluding the default excludeTransfers)
 *
 * Used to:
 * - Show "Clear Filters" button in TransactionFilters component
 * - Differentiate empty state messages in TransactionList
 *
 * @param filters - The current transaction filters
 * @returns true if any non-default filters are applied
 *
 * @example
 * ```typescript
 * const filters = { dateFrom: "2024-01-01", excludeTransfers: true };
 * hasActiveTransactionFilters(filters); // true (dateFrom is set)
 *
 * const defaultFilters = { excludeTransfers: true };
 * hasActiveTransactionFilters(defaultFilters); // false (only default)
 * ```
 */
export function hasActiveTransactionFilters(filters?: TransactionFilters): boolean {
  if (!filters) return false;

  return !!(
    filters.dateFrom ||
    filters.dateTo ||
    filters.accountId ||
    filters.categoryId ||
    filters.status ||
    filters.type ||
    filters.search
  );
}
