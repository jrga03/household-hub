# Data Migration Guide

## Overview

Complete guide for migrating from Google Sheets financial tracker to Household Hub, preserving all data integrity and relationships.

## Pre-Migration Checklist

- [ ] Backup Google Sheets (File → Download → Excel)
- [ ] Verify all formulas calculated correctly in export
- [ ] Note any custom formatting or conditional rules
- [ ] Document any manual processes
- [ ] Identify active filters or views
- [ ] Export as both CSV and XLSX formats

## Migration Strategy

### Phase 1: Data Extraction

1. Export all sheets from Google Sheets
2. Convert formula results to values
3. Preserve category hierarchies
4. Map account relationships

### Phase 2: Data Transformation

1. Normalize data structure
2. Generate unique IDs
3. Convert date formats
4. Clean and validate data

### Phase 3: Data Loading

1. Load reference data (categories, accounts)
2. Import historical transactions
3. Calculate initial balances
4. Verify data integrity

## Data Mapping

### From Google Sheets Structure

```
Google Sheets                 →    Household Hub Database
─────────────────────────────────────────────────────────
Main Category                 →    parent_category
Category                      →    category (with category_id)
Date                         →    date
Remarks                      →    description
Amount                       →    amount_cents (convert to cents)
                             →    type (derive: income if positive, expense if negative)
Bank Account                 →    account_id
Payment Method               →    notes (append to notes field)
Status                       →    status ('pending' or 'cleared')
OK                          →    status (if not OK, set to 'pending')
Notes                        →    notes
                             →    household_id (default value)
                             →    visibility ('household' default)
```

### Category Hierarchy Mapping

```javascript
// Extract from Constants sheet
const categoryMapping = {
  // Parent Category → Categories
  Savings: [
    "Forever House",
    "Just Savings",
    "Retirement",
    "Big Ticket Items",
    "Maintaining Balance",
  ],
  "Recurring Expenses": [
    "BPI AIA",
    "BPI Philam - Jason",
    "BPI Philam - Iel",
    "Car Payment",
    "Electricity",
    "HMO",
    "Internet",
  ],
  "Variable Expenses": ["Groceries", "Transportation", "Medical", "Revolving Funds"],
  // ... etc
};
```

## Migration Script

### 1. Setup Migration Environment

```bash
# Install dependencies
npm install csv-parse xlsx date-fns zod

# Create migration directory
mkdir migration
cd migration
```

### 2. Core Migration Script

```typescript
// migrate-financial-data.ts
import { parse } from "csv-parse";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { format, parse as parseDate } from "date-fns";

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Data schemas
const TransactionSchema = z.object({
  date: z.string().transform((str) => {
    // Handle Excel date serial numbers
    if (!isNaN(Number(str))) {
      const excelDate = Number(str);
      const date = new Date((excelDate - 25569) * 86400 * 1000);
      return format(date, "yyyy-MM-dd");
    }
    // Parse various date formats
    return format(parseDate(str, "yyyy-MM-dd", new Date()), "yyyy-MM-dd");
  }),
  mainCategory: z.string().optional(),
  category: z.string(),
  remarks: z.string(),
  amount: z.number().or(z.string().transform(Number)),
  bankAccount: z.string().optional(),
  paymentMethod: z.string().optional(),
  status: z.enum(["Paid", "Not Paid"]).optional().default("Paid"),
  ok: z
    .boolean()
    .or(z.string().transform((val) => val === "TRUE"))
    .default(true),
  notes: z.string().optional(),
});

class FinancialDataMigrator {
  private categories = new Map<string, string>(); // name -> id
  private accounts = new Map<string, string>(); // name -> id
  private stats = {
    totalRows: 0,
    successfulImports: 0,
    failedImports: 0,
    errors: [] as any[],
  };

  async migrate(filePath: string): Promise<void> {
    console.log("🚀 Starting migration...");

    try {
      // Step 1: Setup reference data
      await this.setupCategories();
      await this.setupAccounts();

      // Step 2: Load and parse data
      const data = await this.loadExcelData(filePath);

      // Step 3: Transform and validate
      const transactions = await this.transformData(data);

      // Step 4: Import to database
      await this.importTransactions(transactions);

      // Step 5: Verify and report
      await this.verifyMigration();
      this.printReport();
    } catch (error) {
      console.error("❌ Migration failed:", error);
      throw error;
    }
  }

  private async loadExcelData(filePath: string): Promise<any[]> {
    const workbook = XLSX.readFile(filePath);
    const sheetName = "Dump"; // Main data sheet
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      throw new Error(`Sheet "${sheetName}" not found`);
    }

    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      dateNF: "yyyy-mm-dd",
    });

    console.log(`📊 Loaded ${jsonData.length} rows from Excel`);
    return jsonData;
  }

  private async setupCategories(): Promise<void> {
    // Load categories from Constants sheet or define here
    const categoriesData = [
      // Savings
      { parent: "Savings", name: "Forever House", budget: 10000 },
      { parent: "Savings", name: "Just Savings", budget: 6000 },
      { parent: "Savings", name: "Retirement", budget: 3000 },
      { parent: "Savings", name: "Big Ticket Items", budget: 2000 },

      // Recurring Expenses
      { parent: "Recurring Expenses", name: "BPI AIA", budget: 0 },
      { parent: "Recurring Expenses", name: "Car Payment", budget: 0 },
      { parent: "Recurring Expenses", name: "Electricity", budget: 0 },
      { parent: "Recurring Expenses", name: "Internet", budget: 0 },

      // Add all other categories...
    ];

    for (const cat of categoriesData) {
      const { data, error } = await supabase
        .from("categories")
        .upsert({
          parent_category: cat.parent,
          category: cat.name,
          budget_amount: cat.budget,
          account_type: "joint",
          is_active: true,
        })
        .select()
        .single();

      if (data) {
        this.categories.set(cat.name, data.id);
        console.log(`✅ Category created: ${cat.name}`);
      }
    }
  }

  private async setupAccounts(): Promise<void> {
    const accountsData = [
      { name: "BDO - Jason - Savings", type: "savings" },
      { name: "BDO - Iel", type: "savings" },
      { name: "BDO Joint OR", type: "checking" },
      { name: "BPI - Jason - Savings", type: "savings" },
      { name: "BPI Joint OR", type: "checking" },
      { name: "UB - Jason", type: "savings" },
      { name: "UB - Iel", type: "savings" },
      { name: "Cash", type: "cash" },
      { name: "Gcash", type: "digital" },
    ];

    for (const acc of accountsData) {
      const { data, error } = await supabase
        .from("bank_accounts")
        .upsert({
          account_name: acc.name,
          account_type: "joint",
          is_active: true,
        })
        .select()
        .single();

      if (data) {
        this.accounts.set(acc.name, data.id);
        console.log(`✅ Account created: ${acc.name}`);
      }
    }
  }

  private async transformData(rawData: any[], validateOnly = false): Promise<any[]> {
    const transactions = [];
    const validationErrors = [];
    const transferCandidates = new Map(); // For transfer detection

    for (const [index, row] of rawData.entries()) {
      try {
        // Skip header rows or empty rows
        if (!row.Date || row.Date === "Date") continue;

        // Parse and validate
        const parsed = TransactionSchema.parse({
          date: row.Date,
          mainCategory: row["Main Category"],
          category: row.Category,
          remarks: row.Remarks,
          amount: row.Amount,
          bankAccount: row["Bank Account"],
          paymentMethod: row["Payment Method"],
          status: row.Status,
          ok: row.OK,
          notes: row.Notes,
        });

        // Determine transaction type from amount sign
        const isIncome = parsed.amount > 0;
        const amountCents = Math.abs(Math.round(parsed.amount * 100));

        // Map to database structure
        const transaction = {
          date: parsed.date,
          type: isIncome ? "income" : "expense",
          description: parsed.remarks,
          amount_cents: amountCents,
          category_id: this.categories.get(parsed.category),
          account_id: this.accounts.get(parsed.bankAccount || ""),
          status: parsed.ok ? "cleared" : "pending",
          notes: [parsed.paymentMethod, parsed.notes].filter(Boolean).join(" - "),
          household_id: "00000000-0000-0000-0000-000000000001",
          visibility: "household",
          account_type: "joint",
        };

        // Detect potential transfers
        const transferKey = this.detectTransfer(transaction);
        if (transferKey) {
          if (transferCandidates.has(transferKey)) {
            // Found matching transfer - link them
            const otherTransaction = transferCandidates.get(transferKey);
            const transferGroupId = this.generateUUID();
            transaction.transfer_group_id = transferGroupId;
            otherTransaction.transfer_group_id = transferGroupId;
            console.log(`🔄 Transfer detected: ${transaction.description}`);
          } else {
            // Store as potential transfer candidate
            transferCandidates.set(transferKey, transaction);
          }
        }

        transactions.push(transaction);
      } catch (error) {
        const errorMsg = `Row ${index + 2}: ${error.message}`;
        validationErrors.push({ row: index + 2, error: errorMsg });
        console.error(`⚠️ ${errorMsg}`);
        this.stats.errors.push({ row: index + 2, error });
      }
    }

    // Report validation results
    if (validateOnly) {
      if (validationErrors.length > 0) {
        console.error("\n❌ Validation failed with errors:");
        validationErrors.forEach((err) => console.error(`  Row ${err.row}: ${err.error}`));
        throw new Error(`Import validation failed: ${validationErrors.length} errors found`);
      } else {
        console.log(`✅ Validation passed: ${transactions.length} transactions ready to import`);
      }
    }

    console.log(`✅ Transformed ${transactions.length} valid transactions`);
    console.log(`🔄 Detected ${transferCandidates.size} potential transfers`);
    return transactions;
  }

  private detectTransfer(transaction: any): string | null {
    // Common transfer patterns in descriptions
    const transferPatterns = [
      /transfer/i,
      /move to/i,
      /move from/i,
      /withdrawal.*deposit/i,
      /deposit.*withdrawal/i,
    ];

    const hasTransferPattern = transferPatterns.some((pattern) =>
      pattern.test(transaction.description)
    );

    if (hasTransferPattern && transaction.account_id) {
      // Create a key for matching opposite transfer
      const date = transaction.date;
      const amount = transaction.amount_cents;
      // Key format: date-amount (transfers should have same date and amount)
      return `${date}-${amount}`;
    }

    return null;
  }

  private generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private async importTransactions(transactions: any[]): Promise<void> {
    const BATCH_SIZE = 100;
    this.stats.totalRows = transactions.length;

    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      const batch = transactions.slice(i, i + BATCH_SIZE);

      try {
        const { data, error } = await supabase.from("transactions").insert(batch);

        if (error) throw error;

        this.stats.successfulImports += batch.length;
        console.log(`📥 Imported ${i + batch.length}/${transactions.length}`);

        // Progress bar
        const progress = Math.round(((i + batch.length) / transactions.length) * 100);
        process.stdout.write(
          `\rProgress: [${"=".repeat(progress / 2)}${" ".repeat(50 - progress / 2)}] ${progress}%`
        );
      } catch (error) {
        console.error(`❌ Batch import failed:`, error);
        this.stats.failedImports += batch.length;
      }

      // Rate limiting
      await this.sleep(500);
    }

    console.log("\n✅ Import complete");
  }

  private async verifyMigration(): Promise<void> {
    // Verify row counts
    const { count: dbCount } = await supabase
      .from("transactions")
      .select("*", { count: "exact", head: true });

    // Verify totals
    const { data: totals } = await supabase
      .from("transactions")
      .select("amount")
      .eq("include_in_calculations", true);

    const sum = totals?.reduce((acc, t) => acc + t.amount, 0) || 0;

    console.log("\n📊 Verification:");
    console.log(`  Database rows: ${dbCount}`);
    console.log(`  Expected rows: ${this.stats.successfulImports}`);
    console.log(`  Total amount: ${sum.toFixed(2)}`);

    // Verify materialized views
    await supabase.rpc("refresh_materialized_views");
  }

  private printReport(): void {
    console.log("\n" + "=".repeat(50));
    console.log("MIGRATION REPORT");
    console.log("=".repeat(50));
    console.log(`Total Rows Processed: ${this.stats.totalRows}`);
    console.log(`Successfully Imported: ${this.stats.successfulImports}`);
    console.log(`Failed Imports: ${this.stats.failedImports}`);
    console.log(
      `Success Rate: ${((this.stats.successfulImports / this.stats.totalRows) * 100).toFixed(2)}%`
    );

    if (this.stats.errors.length > 0) {
      console.log("\n⚠️ Errors:");
      this.stats.errors.slice(0, 10).forEach((err) => {
        console.log(`  Row ${err.row}: ${err.error.message}`);
      });

      if (this.stats.errors.length > 10) {
        console.log(`  ... and ${this.stats.errors.length - 10} more errors`);
      }
    }

    console.log("=".repeat(50));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Run migration with validation mode
async function main() {
  const migrator = new FinancialDataMigrator();

  // Path to your exported Excel file
  const filePath = "./data/Savings_Expenses.xlsx";

  // Parse command line arguments
  const args = process.argv.slice(2);
  const validateOnly = args.includes("--validate");

  try {
    if (validateOnly) {
      console.log("🔍 Running in validation mode...");
      const data = await migrator.readExcelData(filePath);
      await migrator.transformData(data, true); // Validate only
      console.log("✅ Validation complete - no errors found!");
    } else {
      await migrator.migrate(filePath);
      console.log("✨ Migration completed successfully!");
    }
  } catch (error) {
    console.error("💥 Migration failed:", error);
    process.exit(1);
  }
}

// Usage:
// npm run migrate           # Run full migration
// npm run migrate:validate  # Validate data only

// Execute if run directly
if (require.main === module) {
  main();
}

export { FinancialDataMigrator };
```

### 3. Rollback Script

```typescript
// rollback-migration.ts
async function rollbackMigration(beforeDate: Date) {
  console.log("⚠️ Starting rollback...");

  // Delete transactions after migration date
  const { error } = await supabase
    .from("transactions")
    .delete()
    .gte("created_at", beforeDate.toISOString());

  if (error) {
    console.error("Rollback failed:", error);
    return;
  }

  // Reset sequences
  await supabase.rpc("reset_id_sequences");

  // Refresh materialized views
  await supabase.rpc("refresh_materialized_views");

  console.log("✅ Rollback complete");
}
```

## Running the Migration

### 1. Prepare Data

```bash
# Export from Google Sheets
# File → Download → Microsoft Excel (.xlsx)

# Place in migration folder
mv ~/Downloads/Savings_Expenses.xlsx ./migration/data/
```

### 2. Configure Environment

```bash
# Create .env file
cat > .env << EOF
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
EOF
```

### 3. Run Migration

```bash
# Install dependencies
npm install

# Run migration
npm run migrate

# Or with TypeScript
npx ts-node migrate-financial-data.ts
```

### 4. Verify Results

```sql
-- Check transaction count
SELECT COUNT(*) FROM transactions;

-- Verify categories
SELECT parent_category, category, COUNT(*)
FROM transactions
GROUP BY parent_category, category;

-- Check account balances
SELECT * FROM account_balances;

-- Verify date range
SELECT MIN(date), MAX(date) FROM transactions;
```

## Post-Migration Tasks

### 1. Data Validation

- [ ] Verify total transaction count matches
- [ ] Check all categories imported correctly
- [ ] Confirm account balances are accurate
- [ ] Validate date ranges
- [ ] Test filtering views

### 2. Initial Setup

- [ ] Set current month budgets
- [ ] Configure notification preferences
- [ ] Create user accounts
- [ ] Set up bank account balances
- [ ] Configure color themes

### 3. Testing

- [ ] Create test transaction
- [ ] Verify calculations
- [ ] Test all views/filters
- [ ] Check report generation
- [ ] Validate offline sync

## Troubleshooting

### Common Issues

#### 1. Date Format Errors

```typescript
// Fix: Handle multiple date formats
const parseFlexibleDate = (dateStr: string): Date => {
  const formats = ["yyyy-MM-dd", "MM/dd/yyyy", "dd/MM/yyyy", "yyyy-MM-dd HH:mm:ss"];

  for (const format of formats) {
    try {
      return parseDate(dateStr, format, new Date());
    } catch {}
  }

  throw new Error(`Unable to parse date: ${dateStr}`);
};
```

#### 2. Category Not Found

```typescript
// Fix: Create missing categories on the fly
if (!this.categories.has(categoryName)) {
  const { data } = await supabase
    .from("categories")
    .insert({
      parent_category: "Uncategorized",
      category: categoryName,
      account_type: "joint",
    })
    .select()
    .single();

  this.categories.set(categoryName, data.id);
}
```

#### 3. Duplicate Entries

```typescript
// Fix: Add deduplication logic
const seen = new Set<string>();
const unique = transactions.filter((tx) => {
  const key = `${tx.date}-${tx.amount}-${tx.remarks}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
```

#### 4. Large File Handling

```typescript
// Fix: Stream processing for large files
const stream = fs.createReadStream(filePath);
const parser = parse({ columns: true });

stream
  .pipe(parser)
  .on("data", async (row) => {
    await processRow(row);
  })
  .on("end", () => {
    console.log("Stream processing complete");
  });
```

## Validation Queries

```sql
-- Compare totals by category
SELECT
  category,
  COUNT(*) as transaction_count,
  SUM(amount) as total_amount
FROM transactions
WHERE include_in_calculations = true
GROUP BY category
ORDER BY total_amount DESC;

-- Monthly summaries
SELECT
  DATE_TRUNC('month', date) as month,
  SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as income,
  SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END) as expenses,
  SUM(amount) as net
FROM transactions
WHERE include_in_calculations = true
GROUP BY DATE_TRUNC('month', date)
ORDER BY month DESC;

-- Account balances
SELECT
  ba.account_name,
  COUNT(t.id) as transactions,
  SUM(t.amount) as balance
FROM bank_accounts ba
LEFT JOIN transactions t ON t.bank_account_id = ba.id
WHERE t.include_in_calculations = true
GROUP BY ba.account_name;
```

## Data Archival

After successful migration:

1. **Archive Original Files**

```bash
mkdir -p archives/$(date +%Y%m%d)
cp data/*.xlsx archives/$(date +%Y%m%d)/
cp data/*.csv archives/$(date +%Y%m%d)/
```

2. **Create Backup**

```bash
pg_dump $DATABASE_URL > backup_post_migration_$(date +%Y%m%d).sql
```

3. **Document Migration**

```markdown
# Migration Log

Date: 2024-XX-XX
Source: Savings_Expenses.xlsx
Rows Imported: XXXX
Success Rate: XX%
Issues: None / List any issues
Verified By: [Name]
```

## Next Steps

1. Train users on new system
2. Run parallel for one month
3. Decommission Google Sheets
4. Set up automated backups
5. Configure monitoring
