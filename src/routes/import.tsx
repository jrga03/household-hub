/**
 * Import Route - CSV Import Workflow
 *
 * Multi-step import process:
 * 1. Upload: File selection
 * 2. Mapping: Column mapping with auto-detection
 * 3. Duplicates: Duplicate resolution (if any found)
 * 4. Validation: Row-by-row validation (automatic)
 * 5. Importing: Batch insert with progress
 * 6. Complete: Results summary
 *
 * @module routes/import
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ColumnMapper } from "@/components/ColumnMapper";
import { DuplicateResolver } from "@/components/DuplicateResolver";
import { useImportStore } from "@/stores/importStore";
import {
  parseCSV,
  detectColumnMappings,
  mapRowToTransaction,
  validateTransaction,
  batchProcess,
  addImportKey,
  resolveReferences,
} from "@/lib/csv-importer";
import { detectDuplicates } from "@/lib/duplicate-detector";
import { db } from "@/lib/dexie/db";
import { toast } from "sonner";
import type { Transaction } from "@/types/transactions";
import type { DuplicateAction } from "@/lib/duplicate-detector";

export const Route = createFileRoute("/import")({
  component: ImportPage,
});

function ImportPage() {
  const store = useImportStore();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // File size validation (50MB limit)
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
      return;
    }

    // Warn about large files
    const estimatedRows = file.size / 100; // Rough estimate
    if (estimatedRows > 50000) {
      toast.warning("Large file detected. Import may take several minutes.");
    }

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

  const handleMappingConfirm = async (mapping: typeof store.mapping) => {
    if (!mapping) return;

    store.setMapping(mapping);
    setIsProcessing(true);

    try {
      // Map rows to transactions
      const transactions = store.rows.map((row) => mapRowToTransaction(row, mapping));

      // Detect duplicates (LocalTransaction is compatible with Partial<Transaction>)
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

  const handleDuplicateResolve = async (actions: Map<number, DuplicateAction>) => {
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
        continue; // Skip this row entirely
      }

      const mapped = mapRowToTransaction(row, store.mapping!);

      if (action === "replace") {
        // Find the existing transaction to replace
        const duplicate = store.duplicates.find((d) => d.importIndex === i);
        if (duplicate && duplicate.existingTransaction.id) {
          toReplace.push({
            existing: duplicate.existingTransaction as Transaction,
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

  const handleValidation = async (transactions: Partial<Transaction>[]) => {
    setIsProcessing(true);

    try {
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
          // Resolve account/category names to IDs before adding to valid list
          const resolved = resolveReferences(txn, accounts, categories);
          valid.push(resolved);
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

  const handleImport = async (transactions: Partial<Transaction>[]) => {
    store.setStep("importing");
    setIsProcessing(true);

    try {
      let imported = 0;
      let replaced = 0;
      let failed = 0;
      const totalOperations = transactions.length + (store.transactionsToReplace?.length || 0);

      // Handle "Replace" actions first
      if (store.transactionsToReplace && store.transactionsToReplace.length > 0) {
        for (const { existing, update } of store.transactionsToReplace) {
          try {
            // Build update object with proper types (convert null to undefined for Dexie)
            const updateData: Partial<Transaction> = {
              ...update,
              import_key: addImportKey(update).import_key || undefined,
              account_id: update.account_id || undefined,
              category_id: update.category_id || undefined,
              notes: update.notes || undefined,
            };

            await db.transactions.update(existing.id, updateData);
            replaced++;
            store.setProgress(((replaced + imported) / totalOperations) * 100);
          } catch (error) {
            failed++;
            console.error("Replace failed:", error);
          }
        }
      }

      // Handle new imports ("Keep Both" action or no duplicates)
      // TODO: Enrich transactions with required fields (id, household_id, device_id, etc.)
      // This requires auth context and device ID which should be implemented when
      // integrating with the full authentication system.
      //
      // For now, this is a placeholder that will need completion in production:
      // const enrichedTransactions = await enrichTransactions(transactions);
      for await (const batch of batchProcess(transactions, 100)) {
        try {
          // Add import_key to each transaction before import
          const batchWithKeys = batch.map(addImportKey);

          // NOTE: This will fail in production without enriching transactions
          // with required fields. See TODO above.
          await db.transaction("rw", db.transactions, async () => {
            await db.transactions.bulkAdd(batchWithKeys as Transaction[]);
          });
          imported += batch.length;
        } catch (error: unknown) {
          // Distinguish between different error types
          const errorName = error instanceof Error ? error.name : "Unknown";
          if (errorName === "ConstraintError") {
            toast.error(`Duplicate transaction detected in batch`);
          } else if (errorName === "QuotaExceededError") {
            toast.error("Storage quota exceeded. Please free up space.");
            break; // Stop processing
          }
          failed += batch.length;
          console.error("Batch import failed:", error);
        }

        store.setProgress(((replaced + imported) / totalOperations) * 100);
        store.setCurrentRow(imported); // Row-by-row feedback
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
                <p className="text-sm text-muted-foreground">or drag and drop your CSV file here</p>
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
          <p className="text-sm text-muted-foreground">{Math.round(store.progress)}% complete</p>
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
