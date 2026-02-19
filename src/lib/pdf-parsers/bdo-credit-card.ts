/**
 * BDO Credit Card Statement Parser
 *
 * Implements the BankParserProfile contract for BDO Unibank credit card statements.
 *
 * Key challenges solved:
 * - pdfjs-dist returns text items with (x, y) coordinates, not lines —
 *   reconstructLines() groups them by y-proximity and stitches left-to-right
 * - BDO uses wide column gaps to separate Sale Date / Post Date / Description / Amount
 * - Credits appear as negative amounts (e.g. -1,826.00) which must be mapped to
 *   type: "income" with a positive amount string (parsePHP throws on negatives)
 *
 * @module pdf-parsers/bdo-credit-card
 */

import type {
  BankParserProfile,
  PDFPageData,
  PDFTextItem,
  ParsedTransactionRow,
  ParserResult,
} from "@/types/pdf-import";

// ============================================================================
// Types
// ============================================================================

interface ReconstructedLine {
  y: number;
  text: string;
  items: PDFTextItem[];
}

// ============================================================================
// Line Reconstruction
// ============================================================================

/**
 * Groups PDF text items into logical lines by y-coordinate proximity.
 *
 * PDF text items have (x, y) coordinates — we must group items on the same
 * "row" and concatenate them left-to-right with appropriate spacing to
 * reconstruct the visual line layout.
 *
 * @param items - Text items from a single PDF page
 * @param yTolerance - Max y-distance to consider items on the same line (default 3pt)
 * @returns Lines sorted top-to-bottom (descending y in PDF coords)
 */
export function reconstructLines(items: PDFTextItem[], yTolerance = 3): ReconstructedLine[] {
  // Filter empty items
  const nonEmpty = items.filter((item) => item.text.trim().length > 0);

  if (nonEmpty.length === 0) return [];

  // Sort by y descending (top of page first in PDF coords), then x ascending
  const sorted = [...nonEmpty].sort((a, b) => {
    if (Math.abs(a.y - b.y) > yTolerance) return b.y - a.y;
    return a.x - b.x;
  });

  // Group items whose y-coordinates are within tolerance
  const groups: PDFTextItem[][] = [];
  let currentGroup: PDFTextItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(item.y - currentY) <= yTolerance) {
      currentGroup.push(item);
    } else {
      groups.push(currentGroup);
      currentGroup = [item];
      currentY = item.y;
    }
  }
  groups.push(currentGroup);

  // Build lines from groups
  return groups.map((group) => {
    // Sort group by x ascending (left to right)
    const byX = [...group].sort((a, b) => a.x - b.x);

    // Concatenate with spacing based on gaps
    let text = byX[0].text;
    for (let i = 1; i < byX.length; i++) {
      const prev = byX[i - 1];
      const curr = byX[i];
      const gap = curr.x - (prev.x + prev.width);

      if (gap > 30) {
        // Large column gap — insert multiple spaces to preserve column alignment
        text += "    " + curr.text;
      } else if (gap > 5) {
        // Small gap — single space
        text += " " + curr.text;
      } else {
        // Items are adjacent or overlapping
        text += curr.text;
      }
    }

    // Use the average y of the group for sorting
    const avgY = group.reduce((sum, item) => sum + item.y, 0) / group.length;
    return { y: avgY, text, items: group };
  });
}

// ============================================================================
// Skip Detection
// ============================================================================

const SKIP_PATTERNS: RegExp[] = [
  /^\s*$/,
  /PREVIOUS\s+STATEMENT\s+BALANCE/i,
  /CARD\s+NUMBER\b/i,
  /^\s*SUBTOTAL\b/i,
  /^\s*TOTAL\b/i,
  /^\s*Reference:/i,
  /Statement\s+of\s+Account/i,
  /Credit\s+Cards$/i,
  /VISA\s+(GOLD|PLATINUM|CLASSIC)/i,
  /Sale\s+Date\s+Post\s+Date/i,
  /^\s*Page\s+\d+/i,
  /Account\s+Summary/i,
  /Credit\s+Card\s+Points/i,
  /BDO\s+Unibank/i,
  /Bangko\s+Sentral/i,
  /PAYMENT\s+DUE\s+DATE/i,
  /MINIMUM\s+AMOUNT\s+DUE/i,
  /CREDIT\s+LIMIT/i,
  /CASH\s+ADVANCE\s+LIMIT/i,
  /Interest\s+Rate/i,
  /Statement\s+Date/i,
  /Total\s+Amount\s+Due/i,
  /Points\s+Earned/i,
  /Points\s+Redeemed/i,
  /All\s+Rights\s+Reserved/i,
];

/**
 * Checks if a line should be skipped (headers, footers, summaries, etc.)
 */
export function isSkippableLine(text: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(text));
}

// ============================================================================
// Date Conversion
// ============================================================================

/**
 * Converts BDO's MM/DD/YY date format to ISO YYYY-MM-DD.
 *
 * Uses a century pivot at year 80:
 * - 00-79 → 2000-2079
 * - 80-99 → 1980-1999
 *
 * @example convertBDODate("12/13/25") → "2025-12-13"
 * @example convertBDODate("01/02/26") → "2026-01-02"
 */
export function convertBDODate(mmddyy: string): string {
  const [mm, dd, yy] = mmddyy.split("/");
  const year = parseInt(yy, 10);
  const fullYear = year >= 80 ? 1900 + year : 2000 + year;
  return `${fullYear}-${mm}-${dd}`;
}

// ============================================================================
// Transaction Line Parsing
// ============================================================================

/**
 * Core regex matching BDO credit card transaction lines.
 *
 * Format: SaleDate  PostDate  Description    Amount
 * - Dates are MM/DD/YY
 * - Description and amount are separated by 2+ whitespace chars
 *   (distinguishes the column gap from spaces within the description)
 * - Amount may be negative (credits/payments)
 */
const TRANSACTION_RE =
  /(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+(.+?)\s{2,}(-?[\d,]+\.\d{2})\s*$/;

/**
 * Attempts to parse a single line as a BDO credit card transaction.
 *
 * @returns ParsedTransactionRow or null if the line doesn't match
 */
export function parseTransactionLine(text: string): ParsedTransactionRow | null {
  const match = text.match(TRANSACTION_RE);
  if (!match) return null;

  const [, saleDate, , descriptionRaw, amountRaw] = match;

  // Convert date
  const date = convertBDODate(saleDate);

  // Clean description: collapse multi-space gaps into single space
  const description = descriptionRaw.trim().replace(/\s{2,}/g, " ");

  // Determine type and absolute amount
  const isNegative = amountRaw.startsWith("-");
  const absoluteAmount = amountRaw.replace(/^-/, "").replace(/,/g, "");
  const type: "income" | "expense" = isNegative ? "income" : "expense";

  // Confidence scoring
  let confidence = 1.0;
  if (description.length > 80) confidence = 0.9;
  if (description.length < 3) confidence = 0.8;

  return {
    date,
    description,
    amount: absoluteAmount,
    type,
    confidence,
    rawText: text.trim(),
  };
}

// ============================================================================
// Main Parser
// ============================================================================

export const bdoCreditCardParser: BankParserProfile = {
  id: "bdo-credit-card",
  label: "BDO Credit Card",

  detect(firstPageText: string): boolean {
    const normalized = firstPageText.toUpperCase();
    return normalized.includes("BDO UNIBANK") || normalized.includes("BANCO DE ORO");
  },

  parse(pages: PDFPageData[]): ParserResult {
    const transactions: ParsedTransactionRow[] = [];
    const failedRows: ParserResult["failedRows"] = [];
    const warnings: string[] = [];
    let attemptedLines = 0;

    for (const page of pages) {
      const lines = reconstructLines(page.items);

      for (const line of lines) {
        // Skip known non-transaction lines silently
        if (isSkippableLine(line.text)) continue;

        attemptedLines++;
        const parsed = parseTransactionLine(line.text);

        if (parsed) {
          transactions.push(parsed);
        } else {
          failedRows.push({
            lineNumber: page.pageNumber,
            rawText: line.text.trim(),
            reason:
              "Line does not match transaction pattern (SaleDate PostDate Description Amount)",
          });
        }
      }
    }

    // Generate warnings
    if (transactions.length === 0) {
      warnings.push(
        "No transactions found in this PDF. Please verify this is a BDO credit card statement."
      );
    }

    if (attemptedLines > 0 && failedRows.length / attemptedLines > 0.2) {
      warnings.push(
        `${failedRows.length} of ${attemptedLines} non-header lines could not be parsed. Some transactions may be missing.`
      );
    }

    return { transactions, failedRows, warnings };
  },
};
