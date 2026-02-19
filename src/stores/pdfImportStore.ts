/**
 * PDF Import Store - Zustand Store for PDF Statement Import Workflow
 *
 * Manages state for the multi-step PDF import wizard:
 * upload → bank → extracting → preview → account → duplicates → confirming → complete
 *
 * Follows the same pattern as importStore.ts for CSV imports.
 *
 * @module stores/pdfImportStore
 */

import { create } from "zustand";
import type { PDFPageData, ParsedTransactionRow } from "@/types/pdf-import";

export type PDFImportStep =
  | "upload"
  | "bank"
  | "extracting"
  | "preview"
  | "account"
  | "duplicates"
  | "confirming"
  | "complete";

interface PDFImportState {
  // Current wizard step
  step: PDFImportStep;
  setStep: (step: PDFImportStep) => void;

  // File & password
  file: File | null;
  setFile: (file: File | null) => void;
  password: string;
  setPassword: (password: string) => void;
  needsPassword: boolean;
  setNeedsPassword: (needs: boolean) => void;

  // Bank selection
  selectedBankId: string | null;
  setSelectedBankId: (id: string | null) => void;

  // Extraction results
  extractedPages: PDFPageData[];
  setExtractedPages: (pages: PDFPageData[]) => void;

  // Parsed results
  parsedRows: ParsedTransactionRow[];
  setParsedRows: (rows: ParsedTransactionRow[]) => void;
  failedRows: { lineNumber: number; rawText: string; reason: string }[];
  setFailedRows: (rows: { lineNumber: number; rawText: string; reason: string }[]) => void;
  warnings: string[];
  setWarnings: (warnings: string[]) => void;

  // User edits to parsed rows (index → partial override)
  userEdits: Map<number, Partial<ParsedTransactionRow>>;
  setUserEdit: (index: number, edit: Partial<ParsedTransactionRow>) => void;
  clearUserEdits: () => void;

  // Account mapping
  selectedAccountId: string | null;
  setSelectedAccountId: (id: string | null) => void;

  // Duplicate detection
  duplicateIndices: Set<number>;
  setDuplicateIndices: (indices: Set<number>) => void;

  // Import session results
  importSessionId: string | null;
  setImportSessionId: (id: string | null) => void;
  resultCounts: { created: number; duplicates: number; failed: number };
  setResultCounts: (counts: { created: number; duplicates: number; failed: number }) => void;

  // Reset
  reset: () => void;
}

const INITIAL_STATE = {
  step: "upload" as PDFImportStep,
  file: null as File | null,
  password: "",
  needsPassword: false,
  selectedBankId: null as string | null,
  extractedPages: [] as PDFPageData[],
  parsedRows: [] as ParsedTransactionRow[],
  failedRows: [] as { lineNumber: number; rawText: string; reason: string }[],
  warnings: [] as string[],
  userEdits: new Map<number, Partial<ParsedTransactionRow>>(),
  selectedAccountId: null as string | null,
  duplicateIndices: new Set<number>(),
  importSessionId: null as string | null,
  resultCounts: { created: 0, duplicates: 0, failed: 0 },
};

export const usePDFImportStore = create<PDFImportState>((set) => ({
  ...INITIAL_STATE,

  setStep: (step) => set({ step }),
  setFile: (file) => set({ file }),
  setPassword: (password) => set({ password }),
  setNeedsPassword: (needsPassword) => set({ needsPassword }),
  setSelectedBankId: (selectedBankId) => set({ selectedBankId }),
  setExtractedPages: (extractedPages) => set({ extractedPages }),
  setParsedRows: (parsedRows) => set({ parsedRows }),
  setFailedRows: (failedRows) => set({ failedRows }),
  setWarnings: (warnings) => set({ warnings }),

  setUserEdit: (index, edit) =>
    set((state) => {
      const newEdits = new Map(state.userEdits);
      newEdits.set(index, { ...newEdits.get(index), ...edit });
      return { userEdits: newEdits };
    }),
  clearUserEdits: () => set({ userEdits: new Map() }),

  setSelectedAccountId: (selectedAccountId) => set({ selectedAccountId }),
  setDuplicateIndices: (duplicateIndices) => set({ duplicateIndices }),
  setImportSessionId: (importSessionId) => set({ importSessionId }),
  setResultCounts: (resultCounts) => set({ resultCounts }),

  reset: () => set({ ...INITIAL_STATE, userEdits: new Map(), duplicateIndices: new Set() }),
}));
