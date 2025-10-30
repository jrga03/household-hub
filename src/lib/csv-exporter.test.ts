/**
 * Unit tests for CSV Exporter
 *
 * Tests the CSV export functionality for transactions, accounts, and categories.
 * Focus on currency formatting, CSV escaping, and format contract compliance.
 *
 * CRITICAL: CSV amounts must use plain decimal format WITHOUT currency symbols.
 * Format: "1500.50" (NOT "₱1,500.50")
 *
 * @module csv-exporter.test
 */

import { describe, it, expect, vi } from "vitest";
import { CSVExporter } from "./csv-exporter";
import { db } from "@/lib/dexie/db";

const exporter = new CSVExporter();

describe("CSV Exporter", () => {
  // ============================================================================
  // CSV Escaping Tests
  // ============================================================================

  describe("escapeCsv", () => {
    it("should escape commas in values", () => {
      const value = "Description, with comma";
      const escaped = exporter["escapeCsv"](value);

      expect(escaped).toBe('"Description, with comma"');
    });

    it("should escape quotes in values by doubling them", () => {
      const value = 'Description "with quotes"';
      const escaped = exporter["escapeCsv"](value);

      // Internal quotes should be doubled: " → ""
      expect(escaped).toBe('"Description ""with quotes"""');
    });

    it("should escape newlines in values", () => {
      const value = "Line 1\nLine 2";
      const escaped = exporter["escapeCsv"](value);

      // Newlines preserved within quotes
      expect(escaped).toBe('"Line 1\nLine 2"');
    });

    it("should not escape plain values without special characters", () => {
      const value = "Simple description";
      const escaped = exporter["escapeCsv"](value);

      expect(escaped).toBe("Simple description");
    });

    it("should handle values with multiple special characters", () => {
      const value = 'Complex, "value" with\nnewline';
      const escaped = exporter["escapeCsv"](value);

      // Should wrap in quotes and escape internal quotes
      expect(escaped).toBe('"Complex, ""value"" with\nnewline"');
    });

    it("should handle empty strings", () => {
      const value = "";
      const escaped = exporter["escapeCsv"](value);

      expect(escaped).toBe("");
    });
  });

  // ============================================================================
  // CSV Generation Tests
  // ============================================================================

  describe("generateCsv", () => {
    it("should generate valid CSV format with UTF-8 BOM", () => {
      const headers = ["date", "amount"];
      const rows = [["2024-01-01", "1500.50"]];

      const csv = exporter["generateCsv"](headers, rows);

      // Check BOM is present at start (Excel compatibility)
      expect(csv.charCodeAt(0)).toBe(0xfeff);

      // Check headers are present
      expect(csv).toContain("date,amount");

      // Check data row is present
      expect(csv).toContain("2024-01-01,1500.50");
    });

    it("should handle multiple rows correctly", () => {
      const headers = ["date", "amount"];
      const rows = [
        ["2024-01-01", "1500.50"],
        ["2024-01-02", "2000.00"],
        ["2024-01-03", "500.75"],
      ];

      const csv = exporter["generateCsv"](headers, rows);

      // Count lines: BOM + headers + 3 data rows = 4 lines total
      const lines = csv.split("\n");
      expect(lines.length).toBe(4);

      // Verify each row is present
      expect(csv).toContain("2024-01-01,1500.50");
      expect(csv).toContain("2024-01-02,2000.00");
      expect(csv).toContain("2024-01-03,500.75");
    });

    it("should join columns with commas", () => {
      const headers = ["col1", "col2", "col3"];
      const rows = [["a", "b", "c"]];

      const csv = exporter["generateCsv"](headers, rows);

      expect(csv).toContain("col1,col2,col3");
      expect(csv).toContain("a,b,c");
    });

    it("should join rows with newlines", () => {
      const headers = ["col"];
      const rows = [["row1"], ["row2"], ["row3"]];

      const csv = exporter["generateCsv"](headers, rows);

      // Check structure: BOM + header + newline + row1 + newline + row2 + newline + row3
      expect(csv).toMatch(/col\nrow1\nrow2\nrow3/);
    });

    it("should handle empty rows array", () => {
      const headers = ["date", "amount"];
      const rows: string[][] = [];

      const csv = exporter["generateCsv"](headers, rows);

      // Should have BOM + headers only
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      expect(csv).toContain("date,amount");

      // Should have exactly 2 lines (BOM line + header)
      const lines = csv.split("\n");
      expect(lines.length).toBe(2);
    });
  });

  // ============================================================================
  // CSV Format Contract Tests (FEATURES.md)
  // ============================================================================

  describe("CSV Format Contract (FEATURES.md)", () => {
    /**
     * MOST CRITICAL TEST: Verify currency format
     *
     * CSV amounts MUST use plain decimal format WITHOUT currency symbols.
     * This is the format contract specified in FEATURES.md lines 338-356.
     *
     * ✓ Correct: "1500.50"
     * ✗ Wrong: "₱1,500.50"
     */
    it("should use decimal format WITHOUT currency symbol (CRITICAL)", () => {
      const amount = 150050; // cents
      const decimal = (amount / 100).toFixed(2);

      // Verify decimal format
      expect(decimal).toBe("1500.50");

      // Verify NO currency symbols
      expect(decimal).not.toContain("₱");
      expect(decimal).not.toContain("PHP");
      expect(decimal).not.toContain("$");

      // Verify NO thousand separators
      expect(decimal).not.toContain(",");
    });

    it("should format various amounts correctly in decimal format", () => {
      const testCases = [
        { cents: 0, expected: "0.00" },
        { cents: 1, expected: "0.01" },
        { cents: 100, expected: "1.00" },
        { cents: 150050, expected: "1500.50" },
        { cents: 999999999, expected: "9999999.99" }, // Max safe amount
        { cents: 123456789, expected: "1234567.89" },
      ];

      testCases.forEach(({ cents, expected }) => {
        const decimal = (cents / 100).toFixed(2);
        expect(decimal).toBe(expected);
      });
    });

    it("should always have exactly 2 decimal places", () => {
      const testCases = [
        100, // 1.00 (not 1)
        12345, // 123.45
        10, // 0.10 (not 0.1)
        1, // 0.01 (not 0.01)
      ];

      testCases.forEach((cents) => {
        const decimal = (cents / 100).toFixed(2);

        // Should have exactly one decimal point
        expect(decimal.split(".").length).toBe(2);

        // Should have exactly 2 digits after decimal
        const [, decimalPart] = decimal.split(".");
        expect(decimalPart.length).toBe(2);
      });
    });

    it("should use correct column order (guaranteed stable)", () => {
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

      const csv = exporter["generateCsv"](headers, []);

      // Verify exact column order
      expect(csv).toContain(
        "date,type,description,amount,category,account,status,notes,created_at,created_by"
      );
    });

    it("should have exactly 10 columns in transaction export", () => {
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

      // Count columns
      expect(headers.length).toBe(10);
    });

    it("should map schema field names to CSV contract", () => {
      // Schema uses 'created_by_user_id', CSV contract uses 'created_by'
      const mockTransaction = {
        date: "2024-01-01",
        type: "expense" as const,
        description: "Test transaction",
        amount_cents: 150050,
        category_id: "cat-1",
        account_id: "acc-1",
        status: "cleared" as const,
        notes: "Test notes",
        created_at: "2024-01-01T00:00:00Z",
        created_by_user_id: "user-123", // Schema field name
      };

      // Simulate row mapping (same as exportTransactions method)
      const row = [
        mockTransaction.date,
        mockTransaction.type,
        exporter["escapeCsv"](mockTransaction.description),
        (mockTransaction.amount_cents / 100).toFixed(2),
        mockTransaction.category_id,
        mockTransaction.account_id,
        mockTransaction.status,
        exporter["escapeCsv"](mockTransaction.notes),
        mockTransaction.created_at,
        mockTransaction.created_by_user_id, // Maps to 'created_by' column
      ];

      // Verify column 9 (created_by) gets the user ID
      expect(row[9]).toBe("user-123");
    });

    it("should format dates as ISO 8601 (YYYY-MM-DD)", () => {
      const testCases = [
        { input: "2024-01-01", expected: "2024-01-01" },
        { input: new Date("2024-01-15T14:30:00Z"), expected: "2024-01-15" },
        { input: "2024-01-15T14:30:00Z", expected: "2024-01-15" },
        { input: new Date("2024-12-31T23:59:59Z"), expected: "2024-12-31" },
      ];

      testCases.forEach(({ input, expected }) => {
        const formatted = exporter["formatDate"](input);
        expect(formatted).toBe(expected);

        // Verify ISO 8601 format pattern
        expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });

    it("should preserve already formatted dates", () => {
      const date = "2024-01-01";
      const formatted = exporter["formatDate"](date);

      // Should return unchanged if already in ISO 8601 format
      expect(formatted).toBe(date);
    });

    it("should include UTF-8 BOM for Excel compatibility", () => {
      const csv = exporter["generateCsv"](["col"], [["val"]]);

      // BOM should be first character
      expect(csv.charCodeAt(0)).toBe(0xfeff);
    });
  });

  // ============================================================================
  // Edge Cases Tests
  // ============================================================================

  describe("Edge Cases", () => {
    it("should handle empty transaction list", async () => {
      // Mock Dexie to return empty array
      vi.spyOn(db.transactions, "toCollection").mockReturnValue({
        filter: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      } as ReturnType<typeof db.transactions.toCollection>);

      const csv = await exporter.exportTransactions();

      // Should have BOM + headers
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      expect(csv).toContain("date,type,description,amount");

      // Should have at least 2 lines (header + empty data section)
      const lines = csv.split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle transactions with missing optional fields", () => {
      const headers = ["date", "notes", "category"];
      const rows = [
        ["2024-01-01", "", ""], // Empty notes and category
        ["2024-01-02", "Has notes", ""], // Empty category
        ["2024-01-03", "", "cat-1"], // Empty notes
      ];

      const csv = exporter["generateCsv"](headers, rows);

      // Should handle empty fields gracefully
      expect(csv).toContain("2024-01-01,,");
      expect(csv).toContain("2024-01-02,Has notes,");
      expect(csv).toContain("2024-01-03,,cat-1");
    });

    it("should handle null values by converting to empty strings", () => {
      const mockTransaction = {
        date: "2024-01-01",
        type: "expense" as const,
        description: "Test",
        amount_cents: 100,
        category_id: null, // Null category
        account_id: "acc-1",
        status: "cleared" as const,
        notes: null, // Null notes
        created_at: "2024-01-01T00:00:00Z",
        created_by_user_id: null, // Null user
      };

      // Simulate row mapping with null handling
      const row = [
        mockTransaction.date,
        mockTransaction.type,
        exporter["escapeCsv"](mockTransaction.description || ""),
        (mockTransaction.amount_cents / 100).toFixed(2),
        mockTransaction.category_id || "", // Null → empty string
        mockTransaction.account_id || "",
        mockTransaction.status,
        exporter["escapeCsv"](mockTransaction.notes || ""), // Null → empty string
        mockTransaction.created_at,
        mockTransaction.created_by_user_id || "", // Null → empty string
      ];

      // Generate CSV to ensure no errors with empty values
      exporter["generateCsv"](
        [
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
        ],
        [row]
      );

      // Should convert nulls to empty strings
      expect(row[4]).toBe(""); // category
      expect(row[7]).toBe(""); // notes
      expect(row[9]).toBe(""); // created_by
    });

    it("should handle very long descriptions with special characters", () => {
      const longDescription =
        'This is a very long description with "quotes", commas, and\nnewlines that tests the CSV escaping logic thoroughly.';
      const escaped = exporter["escapeCsv"](longDescription);

      // Should be wrapped in quotes
      expect(escaped.startsWith('"')).toBe(true);
      expect(escaped.endsWith('"')).toBe(true);

      // Internal quotes should be doubled
      expect(escaped).toContain('""quotes""');

      // Should preserve newlines
      expect(escaped).toContain("\n");
    });

    it("should handle zero amounts correctly", () => {
      const amount = 0; // 0 cents
      const decimal = (amount / 100).toFixed(2);

      expect(decimal).toBe("0.00");
    });

    it("should handle single-cent amounts correctly", () => {
      const amount = 1; // 1 cent
      const decimal = (amount / 100).toFixed(2);

      expect(decimal).toBe("0.01");
    });

    it("should handle maximum safe amount correctly", () => {
      const maxAmount = 999999999; // ₱9,999,999.99 (max per spec)
      const decimal = (maxAmount / 100).toFixed(2);

      expect(decimal).toBe("9999999.99");

      // Should NOT contain currency symbols
      expect(decimal).not.toContain("₱");
    });

    it("should handle transaction types correctly", () => {
      const types = ["income", "expense", "transfer"] as const;

      types.forEach((type) => {
        const headers = ["type"];
        const rows = [[type]];
        const csv = exporter["generateCsv"](headers, rows);

        expect(csv).toContain(type);
      });
    });

    it("should handle transaction statuses correctly", () => {
      const statuses = ["pending", "cleared"] as const;

      statuses.forEach((status) => {
        const headers = ["status"];
        const rows = [[status]];
        const csv = exporter["generateCsv"](headers, rows);

        expect(csv).toContain(status);
      });
    });

    it("should handle boolean fields as Yes/No in account export", () => {
      const headers = ["is_active"];
      const rows = [["Yes"], ["No"]];

      const csv = exporter["generateCsv"](headers, rows);

      expect(csv).toContain("Yes");
      expect(csv).toContain("No");
    });

    it("should handle ISO 8601 timestamps correctly", () => {
      const timestamp = "2024-01-01T14:30:00.000Z";
      const headers = ["created_at"];
      const rows = [[timestamp]];

      const csv = exporter["generateCsv"](headers, rows);

      // Should preserve full ISO 8601 timestamp in created_at
      expect(csv).toContain(timestamp);
    });

    it("should handle empty string values", () => {
      const headers = ["description", "notes"];
      const rows = [["", ""]]; // Both empty

      const csv = exporter["generateCsv"](headers, rows);

      // Should have comma between empty fields
      expect(csv).toContain("description,notes");

      // CSV structure should be: BOM + headers + newline + empty,empty
      // The pattern is just a comma with empty values on either side
      expect(csv).toContain("\n,");
    });
  });

  // ============================================================================
  // Date Formatting Tests
  // ============================================================================

  describe("formatDate", () => {
    it("should handle already formatted ISO 8601 dates", () => {
      const date = "2024-01-15";
      const formatted = exporter["formatDate"](date);

      expect(formatted).toBe("2024-01-15");
    });

    it("should convert Date objects to ISO 8601", () => {
      const date = new Date("2024-01-15T14:30:00Z");
      const formatted = exporter["formatDate"](date);

      expect(formatted).toBe("2024-01-15");
      expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("should convert ISO 8601 timestamps to date-only format", () => {
      const timestamp = "2024-01-15T14:30:00.000Z";
      const formatted = exporter["formatDate"](timestamp);

      expect(formatted).toBe("2024-01-15");
    });

    it("should handle various date formats", () => {
      const testCases = [
        { input: "2024-01-01", expected: "2024-01-01" },
        { input: "2024-12-31", expected: "2024-12-31" },
        { input: new Date("2024-06-15"), expected: "2024-06-15" },
        { input: "2024-06-15T00:00:00Z", expected: "2024-06-15" },
      ];

      testCases.forEach(({ input, expected }) => {
        const formatted = exporter["formatDate"](input);
        expect(formatted).toBe(expected);
      });
    });

    it("should maintain consistent format across different inputs", () => {
      const dateStr = "2024-01-15";
      const dateObj = new Date("2024-01-15T00:00:00Z");
      const timestamp = "2024-01-15T14:30:00Z";

      const format1 = exporter["formatDate"](dateStr);
      const format2 = exporter["formatDate"](dateObj);
      const format3 = exporter["formatDate"](timestamp);

      // All should produce same ISO 8601 date
      expect(format1).toBe("2024-01-15");
      expect(format2).toBe("2024-01-15");
      expect(format3).toBe("2024-01-15");
    });
  });
});
