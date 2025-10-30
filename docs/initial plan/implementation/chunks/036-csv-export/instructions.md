# Instructions: CSV Export

Follow these steps in order. Estimated time: 1.5 hours.

---

## Important: CSV Format Contract

This chunk implements the CSV format specified in `docs/initial plan/FEATURES.md` lines 338-356:

- **Encoding**: UTF-8 with BOM (Excel compatibility)
- **Amount Format**: Decimal (1500.50, **NO currency symbol**)
- **Column Order** (guaranteed stable):
  1. date
  2. type (income|expense|transfer)
  3. description
  4. amount
  5. category
  6. account
  7. status (pending|cleared)
  8. notes
  9. created_at
  10. created_by

**Critical**: Do NOT use `formatPHP()` for CSV amounts - use plain decimal format.

---

## Step 1: Create CSV Exporter (30 min)

Create `src/lib/csv-exporter.ts`:

```typescript
import { db } from "./dexie";

export class CSVExporter {
  /**
   * Export transactions to CSV
   * Format spec: docs/initial plan/FEATURES.md lines 338-356
   */
  async exportTransactions(filters?: {
    dateFrom?: Date;
    dateTo?: Date;
    accountId?: string;
    categoryId?: string;
  }): Promise<string> {
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

    // CSV headers - matching FEATURES.md contract
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
      t.type,
      this.escapeCsv(t.description || ""),
      (t.amount_cents / 100).toFixed(2), // ✓ Decimal format: "1500.50"
      t.category_id || "",
      t.account_id || "",
      t.status,
      this.escapeCsv(t.notes || ""),
      t.created_at,
      t.created_by_user_id || "", // Maps schema field to CSV 'created_by' column
    ]);

    return this.generateCsv(headers, rows);
  }

  /**
   * Export accounts to CSV
   */
  async exportAccounts(): Promise<string> {
    const accounts = await db.accounts.toArray();

    const headers = ["name", "type", "initial_balance", "is_active"];

    const rows = accounts.map((a) => [
      this.escapeCsv(a.name),
      a.account_type,
      ((a.initial_balance_cents || 0) / 100).toFixed(2), // Decimal format
      a.is_active ? "Yes" : "No",
    ]);

    return this.generateCsv(headers, rows);
  }

  /**
   * Export categories to CSV
   */
  async exportCategories(): Promise<string> {
    const categories = await db.categories.toArray();

    const headers = ["name", "parent", "color", "is_active"];

    const rows = categories.map((c) => [
      this.escapeCsv(c.name),
      c.parent_id || "",
      c.color || "",
      c.is_active ? "Yes" : "No",
    ]);

    return this.generateCsv(headers, rows);
  }

  /**
   * Generate CSV string from headers and rows
   */
  private generateCsv(headers: string[], rows: string[][]): string {
    // Add UTF-8 BOM for Excel compatibility
    const BOM = "\uFEFF";

    const csvHeaders = headers.join(",");
    const csvRows = rows.map((row) => row.join(",")).join("\n");

    return BOM + csvHeaders + "\n" + csvRows;
  }

  /**
   * Escape CSV values (handle commas, quotes, newlines)
   */
  private escapeCsv(value: string): string {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Ensure date is in ISO 8601 format (YYYY-MM-DD)
   * Per FEATURES.md line 343 CSV format contract
   */
  private formatDate(date: string | Date): string {
    // Already in correct format
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }

    // Convert to YYYY-MM-DD
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj.toISOString().split("T")[0];
  }

  /**
   * Trigger download of CSV file
   */
  downloadCsv(csv: string, filename: string): void {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
  }
}

export const csvExporter = new CSVExporter();
```

---

## Step 2: Create Export Button Component (15 min)

Create `src/components/ExportButton.tsx`:

```typescript
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { csvExporter } from "@/lib/csv-exporter";

export function ExportButton() {
  const handleExport = async () => {
    // Export transactions
    const csv = await csvExporter.exportTransactions();

    // Generate filename with date
    const date = new Date().toISOString().split("T")[0];
    const filename = `household-hub-transactions-${date}.csv`;

    csvExporter.downloadCsv(csv, filename);
  };

  return (
    <Button onClick={handleExport} variant="outline">
      <Download className="w-4 h-4 mr-2" />
      Export CSV
    </Button>
  );
}
```

---

## Step 3: Add Export to Settings Page (10 min)

Add export section to your settings page (create `src/routes/settings.tsx` if it doesn't exist):

```typescript
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { csvExporter } from "@/lib/csv-exporter";
import { Download } from "lucide-react";
import { useState } from "react";

export function SettingsPage() {
  const [isExporting, setIsExporting] = useState(false);

  const exportAndDownload = async (type: "transactions" | "accounts" | "categories") => {
    setIsExporting(true);
    try {
      let csv: string;
      let filename: string;
      const date = new Date().toISOString().split("T")[0];

      switch (type) {
        case "transactions":
          csv = await csvExporter.exportTransactions();
          filename = `household-hub-transactions-${date}.csv`;
          break;
        case "accounts":
          csv = await csvExporter.exportAccounts();
          filename = `household-hub-accounts-${date}.csv`;
          break;
        case "categories":
          csv = await csvExporter.exportCategories();
          filename = `household-hub-categories-${date}.csv`;
          break;
      }

      csvExporter.downloadCsv(csv, filename);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="container max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Data Export</CardTitle>
          <CardDescription>Download your data as CSV</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => exportAndDownload("transactions")}
            disabled={isExporting}
            variant="outline"
            className="w-full"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Transactions
          </Button>

          <Button
            onClick={() => exportAndDownload("accounts")}
            disabled={isExporting}
            variant="outline"
            className="w-full"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Accounts
          </Button>

          <Button
            onClick={() => exportAndDownload("categories")}
            disabled={isExporting}
            variant="outline"
            className="w-full"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Categories
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Step 4: Create Unit Tests (15 min)

Create `src/lib/csv-exporter.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { CSVExporter } from "./csv-exporter";
import { db } from "./dexie";

const exporter = new CSVExporter();

describe("CSV Exporter", () => {
  describe("escapeCsv", () => {
    it("should escape commas in values", () => {
      const value = "Description, with comma";
      const escaped = exporter["escapeCsv"](value);

      expect(escaped).toBe('"Description, with comma"');
    });

    it("should escape quotes in values", () => {
      const value = 'Description "with quotes"';
      const escaped = exporter["escapeCsv"](value);

      expect(escaped).toBe('"Description ""with quotes"""');
    });

    it("should escape newlines in values", () => {
      const value = "Line 1\nLine 2";
      const escaped = exporter["escapeCsv"](value);

      expect(escaped).toBe('"Line 1\nLine 2"');
    });

    it("should not escape plain values", () => {
      const value = "Simple description";
      const escaped = exporter["escapeCsv"](value);

      expect(escaped).toBe("Simple description");
    });
  });

  describe("generateCsv", () => {
    it("should generate valid CSV format with BOM", () => {
      const headers = ["date", "amount"];
      const rows = [["2024-01-01", "1500.50"]];

      const csv = exporter["generateCsv"](headers, rows);

      // Check BOM is present
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      // Check headers
      expect(csv).toContain("date,amount");
      // Check data
      expect(csv).toContain("2024-01-01,1500.50");
    });

    it("should handle multiple rows", () => {
      const headers = ["date", "amount"];
      const rows = [
        ["2024-01-01", "1500.50"],
        ["2024-01-02", "2000.00"],
      ];

      const csv = exporter["generateCsv"](headers, rows);

      expect(csv.split("\n").length).toBe(3); // BOM + headers + 2 data rows
    });
  });

  describe("CSV Format Contract (FEATURES.md)", () => {
    it("should use decimal format WITHOUT currency symbol", () => {
      const amount = 150050; // cents
      const decimal = (amount / 100).toFixed(2);

      expect(decimal).toBe("1500.50"); // Not "₱1,500.50"
      expect(decimal).not.toContain("₱");
    });

    it("should use correct column order", () => {
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

      expect(csv).toContain(
        "date,type,description,amount,category,account,status,notes,created_at,created_by"
      );
    });

    it("should map schema field names to CSV contract", () => {
      // Schema uses 'created_by_user_id', CSV contract uses 'created_by'
      const mockTransaction = {
        date: "2024-01-01",
        type: "expense",
        description: "Test",
        amount_cents: 150050,
        category_id: "cat-1",
        account_id: "acc-1",
        status: "cleared",
        notes: "Test notes",
        created_at: "2024-01-01T00:00:00Z",
        created_by_user_id: "user-123", // Schema field name
      };

      // Simulate row mapping (column 9 is created_by)
      const row = [
        mockTransaction.date,
        mockTransaction.type,
        mockTransaction.description,
        (mockTransaction.amount_cents / 100).toFixed(2),
        mockTransaction.category_id,
        mockTransaction.account_id,
        mockTransaction.status,
        mockTransaction.notes,
        mockTransaction.created_at,
        mockTransaction.created_by_user_id, // Maps to 'created_by' column
      ];

      expect(row[9]).toBe("user-123"); // created_by column gets user ID
    });

    it("should format dates as ISO 8601 (YYYY-MM-DD)", () => {
      expect(exporter["formatDate"]("2024-01-01")).toBe("2024-01-01");
      expect(exporter["formatDate"](new Date("2024-01-15T14:30:00Z"))).toBe("2024-01-15");
      expect(exporter["formatDate"]("2024-01-15T14:30:00Z")).toBe("2024-01-15");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty transaction list", async () => {
      // Mock empty Dexie query
      const csv = await exporter.exportTransactions();

      expect(csv).toContain("date,type,description");
      expect(csv.split("\n").length).toBeGreaterThanOrEqual(2); // Headers + BOM at minimum
    });

    it("should handle transactions with missing optional fields", () => {
      const headers = ["date", "notes"];
      const rows = [["2024-01-01", ""]]; // Empty notes

      const csv = exporter["generateCsv"](headers, rows);

      expect(csv).toContain("2024-01-01,");
    });
  });
});
```

**Note**: Some tests use Dexie mocks. If you haven't set up Vitest with Dexie mocks, you can skip the integration tests for now.

---

## Step 5: Implement Decision #84 - Logout Data Retention (20 min)

Enhance the logout flow to prevent accidental data loss.

**Reference**: `docs/initial plan/DECISIONS.md` lines 1046-1114

### Modify `src/stores/authStore.ts`

Add these utility functions before the store definition:

```typescript
import { db } from "@/lib/dexie";
import { csvExporter } from "@/lib/csv-exporter";

/**
 * Check if there are unsynced changes in the sync queue
 */
async function checkUnsyncedData(): Promise<boolean> {
  try {
    const queueCount = await db.syncQueue
      .where("status")
      .anyOf(["draft", "queued", "syncing", "failed"])
      .count();
    return queueCount > 0;
  } catch (error) {
    console.error("Failed to check unsynced data:", error);
    return false; // Fail gracefully
  }
}

/**
 * Clear all IndexedDB data (logout cleanup)
 */
async function clearIndexedDB(): Promise<void> {
  try {
    await db.delete();
    await db.open(); // Recreate empty database
  } catch (error) {
    console.error("Failed to clear IndexedDB:", error);
    // Continue with logout even if clear fails
  }
}
```

### Update the signOut function

Replace the existing `signOut` function with:

```typescript
signOut: async () => {
  // Check for unsynced offline data
  const hasOfflineData = await checkUnsyncedData();

  if (hasOfflineData) {
    const shouldExport = window.confirm(
      "⚠️ You have unsynced offline data.\n\n" +
      "This data will be lost if you log out now.\n\n" +
      "Would you like to export it first?"
    );

    if (shouldExport) {
      try {
        // Export all transactions
        const csv = await csvExporter.exportTransactions();
        const date = new Date().toISOString().split("T")[0];
        const filename = `household-hub-backup-${date}.csv`;

        csvExporter.downloadCsv(csv, filename);

        // Give user time to see the download
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error("Export failed:", error);
        alert("Export failed. Please try manual export from Settings.");
        return; // Abort logout if export fails
      }
    }
  }

  // Clear local data and sign out
  await clearIndexedDB();
  await supabase.auth.signOut();
  set({ user: null, session: null });
},
```

### Add Integration Test

Create `src/stores/authStore.test.ts` (or add to existing):

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/dexie";
import { csvExporter } from "@/lib/csv-exporter";

describe("Auth Store - Logout Data Retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should prompt for export when unsynced data exists", async () => {
    // Mock unsynced data
    vi.spyOn(db.syncQueue, "where").mockReturnValue({
      anyOf: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(5), // 5 unsynced items
      }),
    } as any);

    // Mock user confirmation
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    // Mock CSV export
    const exportSpy = vi.spyOn(csvExporter, "exportTransactions").mockResolvedValue("mock csv");
    const downloadSpy = vi.spyOn(csvExporter, "downloadCsv").mockImplementation(() => {});

    // Test logout flow
    // await authStore.signOut(); // Your actual signOut call

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("unsynced offline data"));
    expect(exportSpy).toHaveBeenCalled();
    expect(downloadSpy).toHaveBeenCalled();
  });

  it("should not prompt when no unsynced data", async () => {
    // Mock no unsynced data
    vi.spyOn(db.syncQueue, "where").mockReturnValue({
      anyOf: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(0), // No unsynced items
      }),
    } as any);

    const confirmSpy = vi.spyOn(window, "confirm");

    // Test logout flow
    // await authStore.signOut();

    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
```

---

## Done!

When CSV export downloads correctly and logout data retention works, proceed to checkpoint.

**Next**: Run through `checkpoint.md`
