# Instructions: CSV Export

Follow these steps in order. Estimated time: 1 hour.

---

## Step 1: Create CSV Exporter (30 min)

Create `src/lib/csv-exporter.ts`:

```typescript
import { formatPHP } from "./currency";
import { db } from "./dexie";

export class CSVExporter {
  /**
   * Export transactions to CSV
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

    // CSV headers
    const headers = [
      "Date",
      "Description",
      "Amount",
      "Type",
      "Account",
      "Category",
      "Status",
      "Notes",
    ];

    // CSV rows
    const rows = transactions.map((t) => [
      t.date,
      this.escapeCsv(t.description || ""),
      formatPHP(t.amount_cents),
      t.type,
      t.account_id || "",
      t.category_id || "",
      t.status,
      this.escapeCsv(t.notes || ""),
    ]);

    return this.generateCsv(headers, rows);
  }

  /**
   * Export accounts to CSV
   */
  async exportAccounts(): Promise<string> {
    const accounts = await db.accounts.toArray();

    const headers = ["Name", "Type", "Initial Balance", "Is Active"];

    const rows = accounts.map((a) => [
      this.escapeCsv(a.name),
      a.account_type,
      formatPHP(a.initial_balance_cents || 0),
      a.is_active ? "Yes" : "No",
    ]);

    return this.generateCsv(headers, rows);
  }

  /**
   * Export categories to CSV
   */
  async exportCategories(): Promise<string> {
    const categories = await db.categories.toArray();

    const headers = ["Name", "Parent", "Color", "Is Active"];

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

Add export section to settings:

```typescript
<Card>
  <CardHeader>
    <CardTitle>Data Export</CardTitle>
    <CardDescription>Download your data as CSV</CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    <Button onClick={() => exportAndDownload("transactions")}>
      Export Transactions
    </Button>

    <Button onClick={() => exportAndDownload("accounts")}>
      Export Accounts
    </Button>

    <Button onClick={() => exportAndDownload("categories")}>
      Export Categories
    </Button>
  </CardContent>
</Card>
```

---

## Step 4: Create Unit Tests (10 min)

Create `src/lib/csv-exporter.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { CSVExporter } from "./csv-exporter";

const exporter = new CSVExporter();

describe("CSV Exporter", () => {
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

  it("should generate valid CSV format", () => {
    const headers = ["Date", "Amount"];
    const rows = [["2024-01-01", "₱1,000.00"]];

    const csv = exporter["generateCsv"](headers, rows);

    expect(csv).toContain("Date,Amount");
    expect(csv).toContain("2024-01-01,₱1,000.00");
  });
});
```

---

## Done!

When CSV export downloads correctly with proper formatting, proceed to checkpoint.

**Next**: Run through `checkpoint.md`
