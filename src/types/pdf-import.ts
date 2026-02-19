/**
 * PDF Import Types for Household Hub
 *
 * Shared interfaces used across the PDF statement import feature:
 * - PDF text extraction (worker communication)
 * - Bank parser profiles (extensible registry)
 * - Import drafts (Dexie storage before confirmation)
 * - Import sessions (grouping drafts from one PDF upload)
 *
 * @module types/pdf-import
 */

// ============================================================================
// PDF Text Extraction Types
// ============================================================================

/**
 * A single text item extracted from a PDF page.
 * Includes position data for structured parsing (e.g. column alignment).
 */
export interface PDFTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName?: string;
}

/**
 * All text items from a single PDF page, grouped by page number.
 */
export interface PDFPageData {
  pageNumber: number;
  items: PDFTextItem[];
  width: number;
  height: number;
}

// ============================================================================
// Parser Types
// ============================================================================

/**
 * A single transaction row parsed from a PDF statement.
 * Uses string amounts (parser doesn't convert to cents — that's the draft layer's job).
 */
export interface ParsedTransactionRow {
  date: string;
  description: string;
  amount: string;
  type: "income" | "expense";
  confidence: number; // 0-1, how confident the parser is in this row
  rawText: string; // Original text line(s) for debugging
}

/**
 * Output of a bank parser profile's parse() function.
 */
export interface ParserResult {
  transactions: ParsedTransactionRow[];
  failedRows: { lineNumber: number; rawText: string; reason: string }[];
  warnings: string[];
}

/**
 * Contract for bank-specific parser profiles.
 * Each bank statement format gets its own profile implementing this interface.
 */
export interface BankParserProfile {
  id: string;
  label: string;
  detect?(firstPageText: string): boolean;
  parse(pages: PDFPageData[]): ParserResult;
}

// ============================================================================
// Web Worker Message Protocol
// ============================================================================

export type WorkerInboundMessage =
  | { type: "EXTRACT"; payload: { buffer: ArrayBuffer; password?: string } }
  | { type: "CANCEL" };

export type WorkerOutboundMessage =
  | { type: "PROGRESS"; payload: { current: number; total: number } }
  | { type: "PAGE_DONE"; payload: { pageNumber: number; data: PDFPageData } }
  | {
      type: "EXTRACTION_COMPLETE";
      payload: { pages: PDFPageData[]; totalPages: number };
    }
  | { type: "ERROR"; payload: { code: WorkerErrorCode; message: string } };

export type WorkerErrorCode =
  | "WRONG_PASSWORD"
  | "CORRUPT_PDF"
  | "EMPTY_PDF"
  | "EXTRACTION_FAILED"
  | "CANCELLED";

// ============================================================================
// Import Draft & Session Types (Dexie storage)
// ============================================================================

export type DraftStatus = "pending" | "editing" | "confirmed" | "discarded";

/**
 * A draft transaction stored in Dexie before user confirmation.
 * Contains the parsed transaction data plus provenance metadata.
 */
export interface ImportDraft {
  id: string;
  importSessionId: string;

  // Transaction fields (will be promoted to real transaction on confirm)
  date: string;
  description: string;
  amount_cents: number;
  type: "income" | "expense";
  account_id?: string;
  category_id?: string;
  notes?: string;

  // Provenance metadata
  source_file_name: string;
  source_bank: string;
  parsed_confidence: number;
  original_text: string;
  user_edited: boolean;
  draft_status: DraftStatus;
  import_key?: string;

  created_at: string;
  updated_at: string;
}

/**
 * Groups drafts from a single PDF upload.
 */
export interface ImportSession {
  id: string;
  file_name: string;
  source_bank: string;
  total_rows: number;
  confirmed_count: number;
  discarded_count: number;
  created_at: string;
}
