# Instructions: CSV Import

Follow these steps in order. Estimated time: 2 hours.

---

## Step 1: Install PapaParse Library (5 min)

```bash
npm install papaparse
npm install -D @types/papaparse
```

**Verify**: No installation errors

---

## Step 2: Create Duplicate Detector Utility (20 min)

Create `src/lib/duplicate-detector.ts`:

```typescript
import type { Transaction } from "@/types";

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
 */
export async function detectDuplicates(
  importData: Partial<Transaction>[],
  existingTransactions: Transaction[]
): Promise<DuplicateMatch[]> {
  const existingFingerprints = new Map<string, Transaction>();

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

export interface DuplicateMatch {
  importIndex: number;
  importRow: Partial<Transaction>;
  existingTransaction: Transaction;
  fingerprint: string;
  confidence: number; // 0-1, 1 = exact match
}

export type DuplicateAction = "skip" | "keep-both" | "replace";

export interface DuplicateResolution {
  match: DuplicateMatch;
  action: DuplicateAction;
}
```

**Verify**: No TypeScript errors

---

## Step 3: Create CSV Importer Core Logic (30 min)

Create `src/lib/csv-importer.ts`:

```typescript
import Papa from "papaparse";
import { parsePHP, validateAmount } from "./currency";
import type { Transaction } from "@/types";

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

export interface ParseResult {
  data: any[][];
  headers: string[];
  errors: Papa.ParseError[];
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
  value: any;
}

/**
 * Parse CSV file with PapaParse
 */
export async function parseCSV(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.data[0] as string[];
        const data = results.data.slice(1) as any[][];

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
  };

  const patterns: Record<keyof ColumnMapping, RegExp[]> = {
    description: [/description/i, /name/i, /title/i, /memo/i],
    amount: [/amount/i, /value/i, /price/i, /total/i],
    date: [/^date$/i, /day/i, /when/i], // Exclude "created_at" from matching
    account: [/account/i, /bank/i, /wallet/i],
    category: [/category/i, /class/i],
    type: [/^type$/i, /income|expense/i, /direction/i],
    notes: [/notes/i, /comment/i, /remark/i],
    status: [/status/i, /cleared/i, /pending/i],
    created_at: [/created_at/i, /created.*at/i, /timestamp/i],
    created_by: [/created_by/i, /created.*by/i, /author/i, /user/i],
  };

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
 */
export function mapRowToTransaction(row: any[], mapping: ColumnMapping): Partial<Transaction> {
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

  // Account validation
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

  // Category validation
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
 * Store import fingerprint for duplicate prevention across imports
 * Per Decision #81: Store as import_key field to prevent re-importing same data
 */
export function addImportKey(transaction: Partial<Transaction>): Partial<Transaction> {
  const { generateFingerprint } = require("./duplicate-detector");
  return {
    ...transaction,
    import_key: generateFingerprint(transaction),
  };
}
```

**Verify**: No TypeScript errors

---

## Step 4: Create Import Workflow Store (15 min)

Create `src/stores/importStore.ts`:

```typescript
import { create } from "zustand";
import type { ColumnMapping } from "@/lib/csv-importer";
import type { DuplicateMatch, DuplicateResolution } from "@/lib/duplicate-detector";
import type { Transaction } from "@/types";

export type ImportStep =
  | "upload"
  | "mapping"
  | "duplicates"
  | "validation"
  | "importing"
  | "complete";

interface ImportState {
  // Current step
  step: ImportStep;
  setStep: (step: ImportStep) => void;

  // File data
  file: File | null;
  setFile: (file: File | null) => void;

  // Parsed CSV
  headers: string[];
  rows: any[][];
  setParsedData: (headers: string[], rows: any[][]) => void;

  // Column mapping
  mapping: ColumnMapping | null;
  setMapping: (mapping: ColumnMapping) => void;

  // Duplicates
  duplicates: DuplicateMatch[];
  setDuplicates: (duplicates: DuplicateMatch[]) => void;

  resolutions: DuplicateResolution[];
  setResolutions: (resolutions: DuplicateResolution[]) => void;

  // Validation
  validTransactions: Partial<Transaction>[];
  validationErrors: any[];
  setValidationResults: (valid: Partial<Transaction>[], errors: any[]) => void;

  // Progress
  progress: number;
  setProgress: (progress: number) => void;
  currentRow: number; // Row-by-row feedback (IMPLEMENTATION-PLAN.md line 429)
  setCurrentRow: (row: number) => void;

  // Replace action support
  transactionsToImport: Partial<Transaction>[];
  transactionsToReplace: { existing: Transaction; update: Partial<Transaction> }[];
  setTransactionsToImport: (txns: Partial<Transaction>[]) => void;
  setTransactionsToReplace: (
    txns: { existing: Transaction; update: Partial<Transaction> }[]
  ) => void;

  // Results
  imported: number;
  skipped: number;
  failed: number;
  setResults: (imported: number, skipped: number, failed: number) => void;

  // Reset
  reset: () => void;
}

export const useImportStore = create<ImportState>((set) => ({
  step: "upload",
  setStep: (step) => set({ step }),

  file: null,
  setFile: (file) => set({ file }),

  headers: [],
  rows: [],
  setParsedData: (headers, rows) => set({ headers, rows }),

  mapping: null,
  setMapping: (mapping) => set({ mapping }),

  duplicates: [],
  setDuplicates: (duplicates) => set({ duplicates }),

  resolutions: [],
  setResolutions: (resolutions) => set({ resolutions }),

  validTransactions: [],
  validationErrors: [],
  setValidationResults: (valid, errors) =>
    set({ validTransactions: valid, validationErrors: errors }),

  progress: 0,
  setProgress: (progress) => set({ progress }),
  currentRow: 0,
  setCurrentRow: (currentRow) => set({ currentRow }),

  transactionsToImport: [],
  transactionsToReplace: [],
  setTransactionsToImport: (transactionsToImport) => set({ transactionsToImport }),
  setTransactionsToReplace: (transactionsToReplace) => set({ transactionsToReplace }),

  imported: 0,
  skipped: 0,
  failed: 0,
  setResults: (imported, skipped, failed) => set({ imported, skipped, failed }),

  reset: () =>
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
      currentRow: 0,
      transactionsToImport: [],
      transactionsToReplace: [],
      imported: 0,
      skipped: 0,
      failed: 0,
    }),
}));
```

**Verify**: No TypeScript errors

---

## Step 5: Create Column Mapper Component (25 min)

Create `src/components/ColumnMapper.tsx`:

```typescript
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ColumnMapping } from "@/lib/csv-importer";

interface ColumnMapperProps {
  headers: string[];
  sampleRows: any[][];
  initialMapping: ColumnMapping;
  onConfirm: (mapping: ColumnMapping) => void;
  onCancel: () => void;
}

const FIELDS = [
  { key: "description", label: "Description", required: true },
  { key: "amount", label: "Amount", required: true },
  { key: "date", label: "Date", required: true },
  { key: "account", label: "Account", required: false },
  { key: "category", label: "Category", required: false },
  { key: "type", label: "Type", required: false },
  { key: "notes", label: "Notes", required: false },
  { key: "status", label: "Status", required: false },
  { key: "created_at", label: "Created At", required: false },  // Round-Trip Guarantee
  { key: "created_by", label: "Created By", required: false },  // Round-Trip Guarantee
] as const;

export function ColumnMapper({
  headers,
  sampleRows,
  initialMapping,
  onConfirm,
  onCancel,
}: ColumnMapperProps) {
  const [mapping, setMapping] = useState<ColumnMapping>(initialMapping);

  const handleFieldChange = (field: keyof ColumnMapping, columnIndex: string) => {
    setMapping({
      ...mapping,
      [field]: columnIndex === "none" ? null : parseInt(columnIndex),
    });
  };

  const isValid = mapping.description !== null && mapping.amount !== null && mapping.date !== null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Map Columns</h2>
        <p className="text-sm text-muted-foreground">
          Match your CSV columns to transaction fields. Required fields are marked with *.
        </p>
      </div>

      <div className="space-y-4">
        {FIELDS.map((field) => (
          <div key={field.key} className="grid grid-cols-[200px_1fr] gap-4 items-center">
            <label className="text-sm font-medium">
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </label>
            <Select
              value={mapping[field.key]?.toString() || "none"}
              onValueChange={(value) => handleFieldChange(field.key, value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select column..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not mapped</SelectItem>
                {headers.map((header, index) => (
                  <SelectItem key={index} value={index.toString()}>
                    {header} (Column {index + 1})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">Preview</h3>
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {FIELDS.filter((f) => mapping[f.key] !== null).map((field) => (
                  <th key={field.key} className="px-3 py-2 text-left font-medium">
                    {field.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleRows.slice(0, 3).map((row, i) => (
                <tr key={i} className="border-b">
                  {FIELDS.filter((f) => mapping[f.key] !== null).map((field) => (
                    <td key={field.key} className="px-3 py-2">
                      {mapping[field.key] !== null ? row[mapping[field.key]!] : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Showing first 3 rows as preview
        </p>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onConfirm(mapping)} disabled={!isValid}>
          Continue
        </Button>
      </div>
    </div>
  );
}
```

**Verify**: Component renders without errors

---

## Step 6: Create Duplicate Resolver Component (25 min)

Create `src/components/DuplicateResolver.tsx`:

```typescript
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { formatPHP } from "@/lib/currency";
import type { DuplicateMatch, DuplicateAction } from "@/lib/duplicate-detector";

interface DuplicateResolverProps {
  duplicates: DuplicateMatch[];
  onResolve: (actions: Map<number, DuplicateAction>) => void;
  onCancel: () => void;
}

export function DuplicateResolver({
  duplicates,
  onResolve,
  onCancel,
}: DuplicateResolverProps) {
  const [actions, setActions] = useState<Map<number, DuplicateAction>>(
    new Map(duplicates.map((d) => [d.importIndex, "skip"]))
  );

  const handleActionChange = (index: number, action: DuplicateAction) => {
    setActions(new Map(actions.set(index, action)));
  };

  const handleBulkAction = (action: DuplicateAction) => {
    const newActions = new Map<number, DuplicateAction>();
    duplicates.forEach((d) => newActions.set(d.importIndex, action));
    setActions(newActions);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">
          Resolve Duplicates ({duplicates.length} found)
        </h2>
        <p className="text-sm text-muted-foreground">
          These transactions match existing records. Choose an action for each.
        </p>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => handleBulkAction("skip")}>
          Skip All
        </Button>
        <Button size="sm" variant="outline" onClick={() => handleBulkAction("keep-both")}>
          Keep All
        </Button>
      </div>

      <div className="space-y-4 max-h-96 overflow-y-auto">
        {duplicates.map((match) => (
          <div key={match.importIndex} className="border rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium mb-1">Existing Transaction</p>
                <p>{match.existingTransaction.description}</p>
                <p className="text-muted-foreground">
                  {formatPHP(match.existingTransaction.amount_cents)} •{" "}
                  {match.existingTransaction.date}
                </p>
              </div>
              <div>
                <p className="font-medium mb-1">Import Row #{match.importIndex + 1}</p>
                <p>{match.importRow.description}</p>
                <p className="text-muted-foreground">
                  {match.importRow.amount_cents && formatPHP(match.importRow.amount_cents)} •{" "}
                  {match.importRow.date}
                </p>
              </div>
            </div>

            <RadioGroup
              value={actions.get(match.importIndex)}
              onValueChange={(value) =>
                handleActionChange(match.importIndex, value as DuplicateAction)
              }
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="skip" id={`skip-${match.importIndex}`} />
                <Label htmlFor={`skip-${match.importIndex}`}>
                  Skip - Don't import this row
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="keep-both" id={`keep-${match.importIndex}`} />
                <Label htmlFor={`keep-${match.importIndex}`}>
                  Keep Both - Import as new transaction
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="replace" id={`replace-${match.importIndex}`} />
                <Label htmlFor={`replace-${match.importIndex}`}>
                  Replace - Update existing with import data
                </Label>
              </div>
            </RadioGroup>
          </div>
        ))}
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onResolve(actions)}>
          Continue with {duplicates.length} resolution(s)
        </Button>
      </div>
    </div>
  );
}
```

**Verify**: Component renders without errors

---

## Step 7: Create Import Route (35 min)

Create `src/routes/import.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ColumnMapper } from "@/components/ColumnMapper";
import { DuplicateResolver } from "@/components/DuplicateResolver";
import { useImportStore } from "@/stores/importStore";
import { parseCSV, detectColumnMappings, mapRowToTransaction, validateTransaction, batchProcess } from "@/lib/csv-importer";
import { detectDuplicates } from "@/lib/duplicate-detector";
import { getDexieDb } from "@/lib/dexie";
import { toast } from "sonner";

export const Route = createFileRoute("/import")({
  component: ImportPage,
});

function ImportPage() {
  const store = useImportStore();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    store.setFile(file);
    setIsProcessing(true);

    try {
      const result = await parseCSV(file);
      store.setParsedData(result.headers, result.data);

      const mapping = detectColumnMappings(result.headers);
      store.setMapping(mapping);

      store.setStep("mapping");
    } catch (error) {
      toast.error("Failed to parse CSV file");
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMappingConfirm = async (mapping) => {
    store.setMapping(mapping);
    setIsProcessing(true);

    try {
      // Map rows to transactions
      const transactions = store.rows.map((row) => mapRowToTransaction(row, mapping));

      // Detect duplicates
      const db = await getDexieDb();
      const existing = await db.transactions.toArray();
      const duplicates = await detectDuplicates(transactions, existing);

      store.setDuplicates(duplicates);

      if (duplicates.length > 0) {
        store.setStep("duplicates");
      } else {
        // No duplicates, proceed to validation
        await handleValidation(transactions);
      }
    } catch (error) {
      toast.error("Failed to process mappings");
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDuplicateResolve = async (actions) => {
    store.setResolutions(
      store.duplicates.map((d) => ({
        match: d,
        action: actions.get(d.importIndex)!,
      }))
    );

    // Separate transactions by action type
    const toImport: Partial<Transaction>[] = [];
    const toReplace: { existing: Transaction; update: Partial<Transaction> }[] = [];

    for (let i = 0; i < store.rows.length; i++) {
      const row = store.rows[i];
      const action = actions.get(i);

      if (action === "skip") {
        continue;  // Skip this row entirely
      }

      const mapped = mapRowToTransaction(row, store.mapping!);

      if (action === "replace") {
        // Find the existing transaction to replace
        const duplicate = store.duplicates.find((d) => d.importIndex === i);
        if (duplicate) {
          toReplace.push({
            existing: duplicate.existingTransaction,
            update: mapped,
          });
        }
      } else {
        // "keep-both" or no duplicate action
        toImport.push(mapped);
      }
    }

    // Store for later use in import step
    store.setTransactionsToImport(toImport);
    store.setTransactionsToReplace(toReplace);

    await handleValidation([...toImport, ...toReplace.map((r) => r.update)]);
  };

  const handleValidation = async (transactions) => {
    setIsProcessing(true);

    try {
      const db = await getDexieDb();
      const accounts = await db.accounts.toArray();
      const categories = await db.categories.toArray();

      const errors = [];
      const valid = [];

      for (let i = 0; i < transactions.length; i++) {
        const txn = transactions[i];
        const txnErrors = validateTransaction(txn, i, accounts, categories);

        if (txnErrors.length > 0) {
          errors.push(...txnErrors);
        } else {
          valid.push(txn);
        }
      }

      store.setValidationResults(valid, errors);

      if (errors.length > 0) {
        toast.warning(`${errors.length} rows have validation errors`);
      }

      if (valid.length > 0) {
        await handleImport(valid);
      } else {
        toast.error("No valid rows to import");
      }
    } catch (error) {
      toast.error("Validation failed");
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImport = async (transactions) => {
    store.setStep("importing");
    setIsProcessing(true);

    try {
      const db = await getDexieDb();
      const { addImportKey } = await import("@/lib/csv-importer");
      let imported = 0;
      let replaced = 0;
      let failed = 0;
      const totalOperations = transactions.length + (store.transactionsToReplace?.length || 0);

      // Handle "Replace" actions first
      if (store.transactionsToReplace && store.transactionsToReplace.length > 0) {
        for (const { existing, update } of store.transactionsToReplace) {
          try {
            await db.transactions.update(existing.id, {
              ...update,
              import_key: addImportKey(update).import_key,  // Store fingerprint
            });
            replaced++;
            store.setProgress(((replaced + imported) / totalOperations) * 100);
          } catch (error) {
            failed++;
            console.error("Replace failed:", error);
          }
        }
      }

      // Handle new imports ("Keep Both" action or no duplicates)
      for await (const batch of batchProcess(transactions, 100)) {
        try {
          // Add import_key to each transaction before import
          const batchWithKeys = batch.map(addImportKey);

          await db.transaction("rw", db.transactions, async () => {
            await db.transactions.bulkAdd(batchWithKeys);
          });
          imported += batch.length;
        } catch (error) {
          failed += batch.length;
          console.error("Batch import failed:", error);
        }

        store.setProgress(((replaced + imported) / totalOperations) * 100);
        store.setCurrentRow(imported);  // Row-by-row feedback
      }

      const skipped = store.resolutions.filter((r) => r.action === "skip").length;
      store.setResults(imported, skipped, failed);
      store.setStep("complete");

      toast.success(`Imported ${imported}, replaced ${replaced}, skipped ${skipped} transactions`);
    } catch (error) {
      toast.error("Import failed");
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl py-8">
      <h1 className="text-3xl font-bold mb-8">Import Transactions</h1>

      {store.step === "upload" && (
        <div className="space-y-4">
          <div className="border-2 border-dashed rounded-lg p-12 text-center">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              disabled={isProcessing}
              className="hidden"
              id="csv-upload"
            />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <div className="space-y-2">
                <p className="text-lg font-medium">Click to select CSV file</p>
                <p className="text-sm text-muted-foreground">
                  or drag and drop your CSV file here
                </p>
              </div>
            </label>
          </div>
        </div>
      )}

      {store.step === "mapping" && (
        <ColumnMapper
          headers={store.headers}
          sampleRows={store.rows}
          initialMapping={store.mapping!}
          onConfirm={handleMappingConfirm}
          onCancel={() => store.reset()}
        />
      )}

      {store.step === "duplicates" && (
        <DuplicateResolver
          duplicates={store.duplicates}
          onResolve={handleDuplicateResolve}
          onCancel={() => store.reset()}
        />
      )}

      {store.step === "importing" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Importing...</h2>
          <Progress value={store.progress} />
          <p className="text-sm text-muted-foreground">
            {Math.round(store.progress)}% complete
          </p>
          {/* Row-by-row feedback per IMPLEMENTATION-PLAN.md line 429 */}
          <p className="text-xs text-muted-foreground">
            Processing row {store.currentRow} of {store.rows.length}
          </p>
        </div>
      )}

      {store.step === "complete" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Import Complete</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="border rounded-lg p-4">
              <p className="text-2xl font-bold text-green-600">{store.imported}</p>
              <p className="text-sm text-muted-foreground">Imported</p>
            </div>
            <div className="border rounded-lg p-4">
              <p className="text-2xl font-bold text-yellow-600">{store.skipped}</p>
              <p className="text-sm text-muted-foreground">Skipped</p>
            </div>
            <div className="border rounded-lg p-4">
              <p className="text-2xl font-bold text-red-600">{store.failed}</p>
              <p className="text-sm text-muted-foreground">Failed</p>
            </div>
          </div>
          <Button onClick={() => store.reset()}>Import Another File</Button>
        </div>
      )}
    </div>
  );
}
```

**Verify**: Route accessible at `/import`

---

## Step 8: Add Unit Tests (15 min)

Create `src/lib/csv-importer.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { detectColumnMappings, validateTransaction } from "./csv-importer";
import { generateFingerprint } from "./duplicate-detector";

describe("detectColumnMappings", () => {
  it("should detect standard column names", () => {
    const headers = ["Description", "Amount", "Date", "Account"];
    const mapping = detectColumnMappings(headers);

    expect(mapping.description).toBe(0);
    expect(mapping.amount).toBe(1);
    expect(mapping.date).toBe(2);
    expect(mapping.account).toBe(3);
  });

  it("should handle case-insensitive matching", () => {
    const headers = ["DESCRIPTION", "amount", "DaTe"];
    const mapping = detectColumnMappings(headers);

    expect(mapping.description).toBe(0);
    expect(mapping.amount).toBe(1);
    expect(mapping.date).toBe(2);
  });

  it("should handle alternative column names", () => {
    const headers = ["Name", "Value", "When", "Bank"];
    const mapping = detectColumnMappings(headers);

    expect(mapping.description).toBe(0);
    expect(mapping.amount).toBe(1);
    expect(mapping.date).toBe(2);
    expect(mapping.account).toBe(3);
  });
});

describe("generateFingerprint", () => {
  it("should generate consistent fingerprints", () => {
    const txn = {
      description: "Groceries",
      amount_cents: 150050,
      date: "2025-01-15",
    };

    const fp1 = generateFingerprint(txn);
    const fp2 = generateFingerprint(txn);

    expect(fp1).toBe(fp2);
  });

  it("should generate different fingerprints for different data", () => {
    const txn1 = {
      description: "Groceries",
      amount_cents: 150050,
      date: "2025-01-15",
    };

    const txn2 = {
      description: "Restaurant",
      amount_cents: 150050,
      date: "2025-01-15",
    };

    expect(generateFingerprint(txn1)).not.toBe(generateFingerprint(txn2));
  });

  it("should be case-insensitive for descriptions", () => {
    const txn1 = {
      description: "Groceries",
      amount_cents: 150050,
      date: "2025-01-15",
    };

    const txn2 = {
      description: "GROCERIES",
      amount_cents: 150050,
      date: "2025-01-15",
    };

    expect(generateFingerprint(txn1)).toBe(generateFingerprint(txn2));
  });
});

describe("validateTransaction", () => {
  const accounts = [
    { id: "acc1", name: "Checking" },
    { id: "acc2", name: "Savings" },
  ];

  const categories = [
    { id: "cat1", name: "Groceries" },
    { id: "cat2", name: "Transport" },
  ];

  it("should pass validation for valid transaction", () => {
    const txn = {
      description: "Test",
      amount_cents: 10000,
      date: "2025-01-15",
      account_id: "acc1",
      category_id: "cat1",
      type: "expense" as const,
    };

    const errors = validateTransaction(txn, 0, accounts, categories);
    expect(errors).toHaveLength(0);
  });

  it("should fail for missing description", () => {
    const txn = {
      description: "",
      amount_cents: 10000,
      date: "2025-01-15",
    };

    const errors = validateTransaction(txn, 0, accounts, categories);
    expect(errors.some((e) => e.field === "description")).toBe(true);
  });

  it("should fail for invalid amount", () => {
    const txn = {
      description: "Test",
      amount_cents: -100,
      date: "2025-01-15",
    };

    const errors = validateTransaction(txn, 0, accounts, categories);
    expect(errors.some((e) => e.field === "amount")).toBe(true);
  });

  it("should fail for invalid date", () => {
    const txn = {
      description: "Test",
      amount_cents: 10000,
      date: "invalid-date",
    };

    const errors = validateTransaction(txn, 0, accounts, categories);
    expect(errors.some((e) => e.field === "date")).toBe(true);
  });
});
```

**Run tests**:

```bash
npm test src/lib/csv-importer.test.ts
```

All tests should pass.

---

## Done!

When all tests pass and the import flow works end-to-end, you're ready for the checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.

---

## Notes

**Large File Handling**:

- Parse in chunks for files >10MB
- Use Web Workers for parsing (optional)
- Show progress during parse

**Error Recovery**:

- Allow user to download error report CSV
- Retry failed batches individually
- Don't block successful imports on partial failures

**Optimization**:

- Index existing transactions by fingerprint for faster lookups
- Use virtual scrolling for large duplicate lists
- Debounce validation during mapping changes
