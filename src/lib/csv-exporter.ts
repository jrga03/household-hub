/**
 * CSV Exporter for Household Hub
 *
 * Implements CSV export functionality for manual backups.
 * Follows the CSV format contract specified in docs/initial plan/FEATURES.md lines 338-356.
 *
 * CRITICAL CURRENCY HANDLING:
 * - CSV amounts use plain decimal format WITHOUT currency symbols
 * - Format: "1500.50" (NOT "₱1,500.50")
 * - Always 2 decimal places
 * - NO peso signs (₱)
 * - NO thousand separators (commas)
 *
 * CSV FORMAT CONTRACT:
 * - Encoding: UTF-8 with BOM (Excel compatibility)
 * - Date Format: ISO 8601 (YYYY-MM-DD)
 * - Amount Format: Decimal (1500.50, no currency symbol)
 * - Column Order (guaranteed stable):
 *   1. date
 *   2. type (income|expense|transfer)
 *   3. description
 *   4. amount
 *   5. category
 *   6. account
 *   7. status (pending|cleared)
 *   8. notes
 *   9. created_at
 *   10. created_by
 *
 * @module csv-exporter
 */

import { db } from "@/lib/dexie/db";

/**
 * Export filters for transaction queries
 */
export interface ExportFilters {
  dateFrom?: Date;
  dateTo?: Date;
  accountId?: string;
  categoryId?: string;
}

/**
 * CSVExporter - Handles CSV generation and download for all entity types
 *
 * Key responsibilities:
 * - Export transactions, accounts, categories to CSV format
 * - Convert integer cents to decimal amounts (NO currency symbols)
 * - Ensure proper CSV escaping for special characters
 * - Add UTF-8 BOM for Excel compatibility
 * - Trigger browser download with proper filename
 *
 * @example
 * import { csvExporter } from '@/lib/csv-exporter';
 *
 * // Export all transactions
 * const csv = await csvExporter.exportTransactions();
 * csvExporter.downloadCsv(csv, 'transactions-2024-01-15.csv');
 *
 * // Export with filters
 * const filtered = await csvExporter.exportTransactions({
 *   dateFrom: new Date('2024-01-01'),
 *   dateTo: new Date('2024-01-31'),
 *   accountId: 'acc-123'
 * });
 */
export class CSVExporter {
  /**
   * Export transactions to CSV
   *
   * Implements the CSV format contract from FEATURES.md lines 338-356:
   * - Column order is guaranteed stable (never reorder)
   * - Amount is decimal format WITHOUT currency symbol
   * - Date is ISO 8601 (YYYY-MM-DD)
   * - UTF-8 with BOM for Excel compatibility
   *
   * @param filters - Optional filters for date range, account, category
   * @returns CSV string with UTF-8 BOM
   *
   * @example
   * // Export all transactions
   * const csv = await csvExporter.exportTransactions();
   *
   * // Export filtered by date range
   * const csv = await csvExporter.exportTransactions({
   *   dateFrom: new Date('2024-01-01'),
   *   dateTo: new Date('2024-01-31')
   * });
   *
   * // Export for specific account
   * const csv = await csvExporter.exportTransactions({
   *   accountId: 'acc-123'
   * });
   */
  async exportTransactions(filters?: ExportFilters): Promise<string> {
    let query = db.transactions.toCollection();

    // Apply filters
    if (filters?.accountId) {
      query = query.filter((t) => t.account_id === filters.accountId);
    }
    if (filters?.categoryId) {
      query = query.filter((t) => t.category_id === filters.categoryId);
    }
    if (filters?.dateFrom) {
      query = query.filter((t) => new Date(t.date) >= filters.dateFrom!);
    }
    if (filters?.dateTo) {
      query = query.filter((t) => new Date(t.date) <= filters.dateTo!);
    }

    const transactions = await query.toArray();

    // CSV headers - matching FEATURES.md contract (guaranteed stable order)
    const headers = [
      "date",
      "type",
      "description",
      "amount",
      "category",
      "account",
      "status",
      "notes",
      "created_at",
      "created_by",
    ];

    // CSV rows - CRITICAL: Amount must be decimal WITHOUT currency symbol
    const rows = transactions.map((t) => [
      this.formatDate(t.date), // Ensure YYYY-MM-DD format
      t.type, // income | expense | transfer
      this.escapeCsv(t.description || ""),
      (t.amount_cents / 100).toFixed(2), // ✓ Decimal format: "1500.50" (NOT "₱1,500.50")
      t.category_id || "",
      t.account_id || "",
      t.status, // pending | cleared
      this.escapeCsv(t.notes || ""),
      t.created_at,
      t.created_by_user_id || "", // Maps schema field to CSV 'created_by' column
    ]);

    return this.generateCsv(headers, rows);
  }

  /**
   * Export accounts to CSV
   *
   * Exports account data with decimal-formatted initial balances.
   * Maps boolean fields to human-readable "Yes"/"No".
   *
   * @returns CSV string with UTF-8 BOM
   *
   * @example
   * const csv = await csvExporter.exportAccounts();
   * csvExporter.downloadCsv(csv, 'accounts-2024-01-15.csv');
   */
  async exportAccounts(): Promise<string> {
    const accounts = await db.accounts.toArray();

    const headers = ["name", "type", "initial_balance", "is_active"];

    const rows = accounts.map((a) => [
      this.escapeCsv(a.name),
      a.type, // bank | investment | credit_card | cash
      ((a.initial_balance_cents || 0) / 100).toFixed(2), // Decimal format: "1500.50"
      a.is_active ? "Yes" : "No", // Human-readable boolean
    ]);

    return this.generateCsv(headers, rows);
  }

  /**
   * Export categories to CSV
   *
   * Exports category hierarchy with parent references.
   * Maps boolean fields to human-readable "Yes"/"No".
   *
   * @returns CSV string with UTF-8 BOM
   *
   * @example
   * const csv = await csvExporter.exportCategories();
   * csvExporter.downloadCsv(csv, 'categories-2024-01-15.csv');
   */
  async exportCategories(): Promise<string> {
    const categories = await db.categories.toArray();

    const headers = ["name", "parent", "color", "is_active"];

    const rows = categories.map((c) => [
      this.escapeCsv(c.name),
      c.parent_id || "", // Empty string for parent categories (null parent_id)
      c.color || "",
      c.is_active ? "Yes" : "No", // Human-readable boolean
    ]);

    return this.generateCsv(headers, rows);
  }

  /**
   * Generate CSV string from headers and rows
   *
   * Adds UTF-8 BOM for Excel compatibility.
   * The BOM (Byte Order Mark) ensures Excel correctly interprets UTF-8 encoding.
   *
   * @param headers - Column headers
   * @param rows - Data rows (each row is array of strings)
   * @returns CSV string with UTF-8 BOM
   *
   * @example
   * const headers = ['date', 'amount'];
   * const rows = [['2024-01-01', '1500.50']];
   * const csv = exporter.generateCsv(headers, rows);
   * // Output: "\uFEFFdate,amount\n2024-01-01,1500.50"
   */
  private generateCsv(headers: string[], rows: string[][]): string {
    // Add UTF-8 BOM for Excel compatibility
    // The BOM (\uFEFF) ensures Excel correctly interprets UTF-8 encoding
    const BOM = "\uFEFF";

    const csvHeaders = headers.join(",");
    const csvRows = rows.map((row) => row.join(",")).join("\n");

    return BOM + csvHeaders + "\n" + csvRows;
  }

  /**
   * Escape CSV values (handle commas, quotes, newlines)
   *
   * CSV escaping rules:
   * - Values containing commas, quotes, or newlines must be wrapped in quotes
   * - Internal quotes must be escaped by doubling them (" → "")
   * - Plain values without special characters don't need escaping
   *
   * @param value - String value to escape
   * @returns Escaped CSV value
   *
   * @example
   * escapeCsv('Simple text') → 'Simple text'
   * escapeCsv('Text, with comma') → '"Text, with comma"'
   * escapeCsv('Text "with quotes"') → '"Text ""with quotes"""'
   * escapeCsv('Line 1\nLine 2') → '"Line 1\nLine 2"'
   */
  private escapeCsv(value: string): string {
    // Check if value contains special characters that require escaping
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      // Wrap in quotes and escape internal quotes by doubling them
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Ensure date is in ISO 8601 format (YYYY-MM-DD)
   *
   * Per FEATURES.md line 343 CSV format contract, dates must be ISO 8601.
   * Handles both string dates (already formatted) and Date objects.
   *
   * @param date - Date string or Date object
   * @returns ISO 8601 date string (YYYY-MM-DD)
   *
   * @example
   * formatDate('2024-01-01') → '2024-01-01'
   * formatDate(new Date('2024-01-15T14:30:00Z')) → '2024-01-15'
   * formatDate('2024-01-15T14:30:00Z') → '2024-01-15'
   */
  private formatDate(date: string | Date): string {
    // Already in correct format (YYYY-MM-DD)
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }

    // Convert to YYYY-MM-DD
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj.toISOString().split("T")[0];
  }

  /**
   * Trigger download of CSV file
   *
   * Creates a Blob with proper MIME type, generates a download URL,
   * and triggers browser download via temporary <a> element.
   *
   * Note: URL.revokeObjectURL is called after download to free memory.
   *
   * @param csv - CSV content string
   * @param filename - Desired filename (e.g., 'transactions-2024-01-15.csv')
   *
   * @example
   * const csv = await csvExporter.exportTransactions();
   * csvExporter.downloadCsv(csv, 'household-hub-transactions-2024-01-15.csv');
   */
  downloadCsv(csv: string, filename: string): void {
    // Create blob with proper MIME type and charset
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.click();

    // Clean up object URL to prevent memory leaks
    URL.revokeObjectURL(url);
  }
}

/**
 * Singleton CSVExporter instance for convenient import
 *
 * @example
 * import { csvExporter } from '@/lib/csv-exporter';
 * const csv = await csvExporter.exportTransactions();
 * csvExporter.downloadCsv(csv, 'transactions.csv');
 */
export const csvExporter = new CSVExporter();
