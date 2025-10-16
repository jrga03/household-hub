# Troubleshooting: CSV Import

Common issues and solutions when working with CSV import functionality.

---

## CSV Parsing Issues

### Problem: File won't parse or shows "Failed to parse CSV file"

**Symptoms**:

- Error toast appears immediately after file selection
- Console shows PapaParse errors
- No progress to mapping step

**Cause 1**: Invalid CSV format (mismatched quotes, malformed rows)

**Solution**:

```typescript
// Add more robust error handling in parseCSV
Papa.parse(file, {
  header: false,
  skipEmptyLines: true,
  encoding: "UTF-8",
  transformHeader: (header) => header.trim(),
  error: (error, file) => {
    console.error("Parse error:", error);
    toast.error(`Parse failed: ${error.message}`);
  },
});
```

**Cause 2**: File encoding issues (not UTF-8)

**Solution**:

- Ensure CSV is saved as UTF-8
- Try UTF-8 with BOM for Excel compatibility
- Add encoding detection:

```typescript
// Detect encoding before parsing
const text = await file.text();
const encoding = detectEncoding(text); // Use chardet or similar
```

---

### Problem: Headers not detected or incorrect

**Symptoms**:

- All headers show as "Column 1", "Column 2", etc.
- Auto-detection fails to map any columns
- First data row missing

**Cause**: CSV has no header row or header is malformed

**Solution**:

Add header validation:

```typescript
export function validateHeaders(headers: string[]): boolean {
  // Check if headers look like actual headers vs data
  const hasNumbers = headers.some((h) => !isNaN(Number(h)));
  const hasRepeats = new Set(headers).size !== headers.length;

  if (hasNumbers || hasRepeats) {
    // Probably data row, not headers
    return false;
  }

  return true;
}

// In parsing logic:
if (!validateHeaders(results.data[0])) {
  // Ask user: "No headers detected. Does your CSV have headers?"
  // If no: Generate generic headers ["Column 1", "Column 2", ...]
}
```

---

### Problem: Large CSV files cause browser tab to freeze

**Symptoms**:

- Browser becomes unresponsive
- UI freezes during parse
- "Page Unresponsive" warning

**Cause**: Synchronous parsing of large file blocks main thread

**Solution 1**: Use PapaParse streaming mode

```typescript
export async function parseCSVStreaming(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const data: any[][] = [];
    let headers: string[] = [];

    Papa.parse(file, {
      chunk: (results) => {
        if (headers.length === 0) {
          headers = results.data[0] as string[];
        }
        data.push(...(results.data.slice(1) as any[][]));

        // Update progress
        console.log(`Parsed ${data.length} rows...`);
      },
      complete: () => {
        resolve({ data, headers, errors: [] });
      },
      error: reject,
    });
  });
}
```

**Solution 2**: Use Web Worker for parsing

```typescript
// workers/csv-parser.worker.ts
import Papa from "papaparse";

self.onmessage = (e: MessageEvent) => {
  const { file } = e.data;

  Papa.parse(file, {
    header: false,
    skipEmptyLines: true,
    complete: (results) => {
      self.postMessage({ success: true, results });
    },
    error: (error) => {
      self.postMessage({ success: false, error: error.message });
    },
  });
};

// In main app:
const worker = new Worker(new URL("./csv-parser.worker.ts", import.meta.url));
worker.postMessage({ file });
worker.onmessage = (e) => {
  if (e.data.success) {
    // Handle results
  }
};
```

---

## Column Mapping Issues

### Problem: Auto-detection fails for non-standard headers

**Symptoms**:

- Required fields not auto-mapped
- "Continue" button disabled
- User must map all fields manually

**Cause**: Header names don't match detection patterns

**Solution**:

Expand detection patterns:

```typescript
const patterns: Record<keyof ColumnMapping, RegExp[]> = {
  description: [
    /description/i,
    /name/i,
    /title/i,
    /memo/i,
    /details/i,
    /particulars/i,
    /narration/i,
  ],
  amount: [/amount/i, /value/i, /price/i, /total/i, /sum/i, /cost/i, /spend/i],
  date: [/date/i, /day/i, /time/i, /when/i, /timestamp/i, /posted/i],
  // ... more patterns
};
```

**Add fuzzy matching**:

```typescript
import Fuse from "fuse.js";

function fuzzyDetectColumn(header: string, patterns: string[]): number {
  const fuse = new Fuse(patterns, { threshold: 0.3 });
  const results = fuse.search(header);
  return results.length > 0 ? 1.0 - results[0].score! : 0;
}
```

---

### Problem: Preview shows wrong data in columns

**Symptoms**:

- Preview table shows misaligned data
- Wrong columns displayed
- Data doesn't match header

**Cause**: Mapping indices incorrect or preview logic bug

**Solution**:

Add debugging:

```typescript
// In ColumnMapper preview rendering
console.log("Mapping:", mapping);
console.log("Sample row:", sampleRows[0]);
console.log(
  "Mapped values:",
  FIELDS.map((f) => (mapping[f.key] !== null ? sampleRows[0][mapping[f.key]!] : null))
);

// Verify mapping indices are valid
if (mapping[field.key] !== null && mapping[field.key]! >= headers.length) {
  console.error(`Invalid mapping index for ${field.key}: ${mapping[field.key]}`);
}
```

---

## Duplicate Detection Issues

### Problem: Duplicates not detected when they should be

**Symptoms**:

- Import skips duplicate detection step
- Known duplicates imported as new transactions
- No "Resolve Duplicates" screen

**Cause 1**: Fingerprint generation not matching existing format

**Solution**:

Normalize data before fingerprinting:

```typescript
function normalizeForFingerprint(txn: Partial<Transaction>): string {
  const description = (txn.description || "").toLowerCase().trim().replace(/\s+/g, " "); // Normalize whitespace

  const amount = txn.amount_cents?.toString() || "0";

  const date = txn.date ? new Date(txn.date).toISOString().split("T")[0] : "";

  return `${description}|${amount}|${date}`;
}
```

**Cause 2**: Date format mismatch

**Solution**:

```typescript
// Always normalize dates to YYYY-MM-DD
function normalizeDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toISOString().split("T")[0];
  } catch {
    return "";
  }
}
```

---

### Problem: False duplicates detected

**Symptoms**:

- Too many false positives
- Different transactions flagged as duplicates
- Overly aggressive matching

**Cause**: Fingerprint too simple or collision-prone

**Solution**:

Add more fields to fingerprint:

```typescript
function generateEnhancedFingerprint(transaction: Partial<Transaction>): string {
  const parts = [
    transaction.description?.trim().toLowerCase() || "",
    transaction.amount_cents?.toString() || "",
    transaction.date || "",
    transaction.account_id || "", // Add account
    transaction.category_id || "", // Add category (optional)
  ];

  return hashCode(parts.join("|"));
}
```

**Or use fuzzy matching**:

```typescript
import { distance } from "fastest-levenshtein";

function isFuzzyDuplicate(txn1: Transaction, txn2: Transaction): boolean {
  const descDistance = distance(txn1.description.toLowerCase(), txn2.description.toLowerCase());

  const amountMatch = txn1.amount_cents === txn2.amount_cents;
  const dateMatch = txn1.date === txn2.date;

  // Consider duplicate if description is similar and amount+date match
  return descDistance <= 3 && amountMatch && dateMatch;
}
```

---

### Problem: Duplicate resolution UI doesn't update

**Symptoms**:

- Radio buttons don't change
- Actions not applied
- "Continue" button doesn't work

**Cause**: State not updating properly

**Solution**:

Fix state immutability:

```typescript
// Incorrect:
const handleActionChange = (index: number, action: DuplicateAction) => {
  actions.set(index, action); // Mutates Map directly
  setActions(actions); // React won't detect change
};

// Correct:
const handleActionChange = (index: number, action: DuplicateAction) => {
  setActions(new Map(actions.set(index, action))); // Create new Map
};
```

---

## Validation Issues

### Problem: Valid transactions fail validation

**Symptoms**:

- Error toast shows unexpected validation errors
- All rows show as invalid
- No transactions imported

**Cause 1**: Date parsing too strict

**Solution**:

Support multiple date formats:

```typescript
import { parse, isValid } from "date-fns";

const DATE_FORMATS = [
  "yyyy-MM-dd",
  "MM/dd/yyyy",
  "dd/MM/yyyy",
  "yyyy/MM/dd",
  "M/d/yyyy",
  "d/M/yyyy",
];

function parseFlexibleDate(dateStr: string): Date | null {
  for (const format of DATE_FORMATS) {
    try {
      const date = parse(dateStr, format, new Date());
      if (isValid(date)) {
        return date;
      }
    } catch {
      continue;
    }
  }
  return null;
}
```

**Cause 2**: Amount parsing issues

**Solution**:

Handle various currency formats:

```typescript
function parseFlexibleAmount(amountStr: string): number {
  // Remove currency symbols and spaces
  let cleaned = amountStr.replace(/[₱$€£,\s]/g, "");

  // Handle parentheses as negative (accounting format)
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    cleaned = "-" + cleaned.slice(1, -1);
  }

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.round(parsed * 100);
}
```

---

### Problem: Account/category names not matching

**Symptoms**:

- "Account not found" errors
- "Category not found" errors
- Have to manually create accounts first

**Cause**: Import uses names but validation expects IDs

**Solution**:

Support lookup by name or ID:

```typescript
function findAccountByNameOrId(identifier: string, accounts: Account[]): Account | null {
  return (
    accounts.find((a) => a.id === identifier) ||
    accounts.find((a) => a.name.toLowerCase() === identifier.toLowerCase()) ||
    null
  );
}

// In validation:
const account = findAccountByNameOrId(transaction.account_id, accounts);
if (transaction.account_id && !account) {
  errors.push({
    row: rowIndex,
    field: "account",
    message: `Account "${transaction.account_id}" not found`,
    value: transaction.account_id,
  });
}
```

**Auto-create missing accounts** (optional):

```typescript
async function createMissingAccounts(
  transactions: Partial<Transaction>[],
  existingAccounts: Account[]
): Promise<Account[]> {
  const newAccountNames = new Set<string>();

  for (const txn of transactions) {
    if (txn.account_id && !findAccountByNameOrId(txn.account_id, existingAccounts)) {
      newAccountNames.add(txn.account_id);
    }
  }

  const newAccounts: Account[] = [];
  for (const name of newAccountNames) {
    const account = await createAccount({
      name,
      type: "checking",
      currency: "PHP",
    });
    newAccounts.push(account);
  }

  return newAccounts;
}
```

---

## Import Performance Issues

### Problem: Import takes too long for large files

**Symptoms**:

- Import of 10k rows takes >1 minute
- Progress bar moves very slowly
- Browser tab sluggish

**Cause**: Batch size too small or transaction overhead

**Solution 1**: Increase batch size

```typescript
// Increase from 100 to 500-1000
for await (const batch of batchProcess(transactions, 1000)) {
  await db.transactions.bulkAdd(batch);
}
```

**Solution 2**: Use single transaction for all batches

```typescript
await db.transaction("rw", db.transactions, async () => {
  for await (const batch of batchProcess(transactions, 1000)) {
    await db.transactions.bulkAdd(batch);
    store.setProgress((imported / total) * 100);
  }
});
```

**Solution 3**: Defer sync to background

```typescript
// Don't trigger sync immediately
const imported = await bulkImport(transactions);

// Queue for background sync instead
await queueBackgroundSync({
  operation: "bulk-import",
  entityIds: imported.map((t) => t.id),
  priority: "low",
});
```

---

### Problem: UI freezes during import

**Symptoms**:

- Progress bar doesn't update smoothly
- Can't interact with page
- Browser shows "Page Unresponsive"

**Cause**: Too much work on main thread

**Solution**: Use Web Worker for import

```typescript
// workers/import.worker.ts
import { openDB } from "idb";

self.onmessage = async (e: MessageEvent) => {
  const { transactions } = e.data;

  const db = await openDB("household-hub", 1);
  const tx = db.transaction("transactions", "readwrite");

  let imported = 0;
  for (let i = 0; i < transactions.length; i += 100) {
    const batch = transactions.slice(i, i + 100);
    for (const txn of batch) {
      await tx.store.add(txn);
    }
    imported += batch.length;

    // Report progress
    self.postMessage({ type: "progress", imported, total: transactions.length });
  }

  await tx.done;
  self.postMessage({ type: "complete", imported });
};
```

---

## Memory Issues

### Problem: Browser runs out of memory with very large files

**Symptoms**:

- Tab crashes during import
- "Out of memory" error
- System becomes unresponsive

**Cause**: Loading entire CSV into memory at once

**Solution**: Stream processing

```typescript
export async function streamProcessCSV(
  file: File,
  onBatch: (batch: any[]) => Promise<void>
): Promise<void> {
  let currentBatch: any[] = [];
  const BATCH_SIZE = 500;

  await new Promise((resolve, reject) => {
    Papa.parse(file, {
      worker: true,
      step: async (row: any) => {
        currentBatch.push(row.data);

        if (currentBatch.length >= BATCH_SIZE) {
          await onBatch(currentBatch);
          currentBatch = []; // Clear batch to free memory
        }
      },
      complete: async () => {
        if (currentBatch.length > 0) {
          await onBatch(currentBatch);
        }
        resolve(void 0);
      },
      error: reject,
    });
  });
}
```

---

## State Management Issues

### Problem: Import state not resetting properly

**Symptoms**:

- Previous import data still visible
- Can't start new import
- Stale data displayed

**Cause**: Incomplete state reset

**Solution**:

Ensure all state cleared:

```typescript
reset: () => {
  set({
    step: "upload",
    file: null,
    headers: [],
    rows: [],
    mapping: null,
    duplicates: [],
    resolutions: [],
    validTransactions: [],
    validationErrors: [],
    progress: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
  });

  // Also clear any cached data
  caches.open("csv-import").then((cache) => cache.delete("temp-data"));
};
```

---

## Accessibility Issues

### Problem: Screen reader doesn't announce progress

**Symptoms**:

- Progress updates silent
- No feedback during import
- Screen reader users confused

**Cause**: Missing ARIA live regions

**Solution**:

Add live region:

```typescript
<div role="status" aria-live="polite" aria-atomic="true">
  {progress > 0 && `Import progress: ${Math.round(progress)}% complete`}
</div>

{importComplete && (
  <div role="alert" aria-live="assertive">
    Import complete! Imported {imported} transactions.
  </div>
)}
```

---

## Prevention Tips

1. **Test with various CSV formats**: Excel exports, Google Sheets, bank statements
2. **Validate early**: Check file format before heavy processing
3. **Stream large files**: Don't load entire CSV into memory
4. **Progress feedback**: Always show progress for operations >1 second
5. **Error recovery**: Allow user to fix issues and retry
6. **Auto-save state**: Persist import progress in case of crashes

---

## Getting Help

If you're stuck:

1. Check browser console for detailed errors
2. Verify CSV file is valid (try opening in Excel/Sheets)
3. Test with small sample CSV first
4. Check memory usage in DevTools
5. Enable PapaParse debug mode
6. Review state in React DevTools

---

## Quick Fixes

```bash
# Reset import state
localStorage.removeItem('import-state');

# Clear IndexedDB data
// In browser console:
indexedDB.deleteDatabase('household-hub');

# Restart dev server
npm run dev

# Clear build cache
rm -rf node_modules/.vite
npm run dev
```

---

**Remember**: CSV import is complex. When in doubt, validate early, process in batches, and provide clear error messages.
