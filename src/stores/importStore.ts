/**
 * Import Store - Zustand Store for CSV Import Workflow
 *
 * Manages state for multi-step import process:
 * 1. Upload → 2. Mapping → 3. Duplicates → 4. Validation → 5. Importing → 6. Complete
 *
 * Tracks file data, column mappings, duplicate resolutions, validation results,
 * and import progress throughout the workflow.
 *
 * @module stores/importStore
 */

import { create } from "zustand";
import type { ColumnMapping } from "@/lib/csv-importer";
import type { DuplicateMatch, DuplicateResolution } from "@/lib/duplicate-detector";
import type { Transaction } from "@/types/transactions";

/**
 * Import workflow steps
 */
export type ImportStep =
  | "upload"
  | "mapping"
  | "duplicates"
  | "validation"
  | "importing"
  | "complete";

/**
 * Import workflow state
 */
interface ImportState {
  // Current step
  step: ImportStep;
  setStep: (step: ImportStep) => void;

  // File data
  file: File | null;
  setFile: (file: File | null) => void;

  // Parsed CSV
  headers: string[];
  rows: string[][];
  setParsedData: (headers: string[], rows: string[][]) => void;

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
  validationErrors: unknown[];
  setValidationResults: (valid: Partial<Transaction>[], errors: unknown[]) => void;

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

/**
 * Import store instance
 */
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
