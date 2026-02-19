import { describe, expect, it } from "vitest";
import type { PDFPageData, PDFTextItem } from "@/types/pdf-import";
import {
  bdoCreditCardParser,
  convertBDODate,
  isSkippableLine,
  parseTransactionLine,
  reconstructLines,
} from "../bdo-credit-card";

// ============================================================================
// Helpers to build mock PDFTextItem arrays
// ============================================================================

/** Creates a PDFTextItem at a given (x, y) position */
function item(text: string, x: number, y: number, width?: number): PDFTextItem {
  return { text, x, y, width: width ?? text.length * 6, height: 10 };
}

/** Creates a PDFPageData from items */
function page(pageNumber: number, items: PDFTextItem[]): PDFPageData {
  return { pageNumber, items, width: 612, height: 792 };
}

// ============================================================================
// reconstructLines
// ============================================================================

describe("reconstructLines", () => {
  it("groups items on the same y-coordinate into a single line", () => {
    // Items are adjacent (gap = 60 - (10+30) = 20pt → single space inserted)
    const items = [
      item("Hello", 10, 700, 30),
      item("World", 35, 700, 30), // gap = 35 - 40 = -5pt → no space (adjacent)
    ];
    const lines = reconstructLines(items);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("HelloWorld");
  });

  it("groups items within y-tolerance into the same line", () => {
    const items = [
      item("Hello", 10, 700),
      item("World", 60, 702), // 2pt difference, within default 3pt tolerance
    ];
    const lines = reconstructLines(items);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toContain("Hello");
    expect(lines[0].text).toContain("World");
  });

  it("separates items beyond y-tolerance into different lines", () => {
    const items = [
      item("Line1", 10, 700),
      item("Line2", 10, 680), // 20pt gap
    ];
    const lines = reconstructLines(items);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe("Line1");
    expect(lines[1].text).toBe("Line2");
  });

  it("sorts lines top-to-bottom (descending y in PDF coords)", () => {
    const items = [item("Bottom", 10, 100), item("Top", 10, 700), item("Middle", 10, 400)];
    const lines = reconstructLines(items);
    expect(lines[0].text).toBe("Top");
    expect(lines[1].text).toBe("Middle");
    expect(lines[2].text).toBe("Bottom");
  });

  it("sorts items left-to-right within a line", () => {
    const items = [item("C", 200, 700), item("A", 10, 700), item("B", 100, 700)];
    const lines = reconstructLines(items);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toMatch(/A.*B.*C/);
  });

  it("inserts a space for small gaps (>5pt)", () => {
    // "Hello" at x=10 with width=30, "World" at x=46 → gap = 6pt
    const items = [item("Hello", 10, 700, 30), item("World", 46, 700, 30)];
    const lines = reconstructLines(items);
    expect(lines[0].text).toBe("Hello World");
  });

  it("inserts multiple spaces for large gaps (>30pt)", () => {
    // "Hello" at x=10 with width=30, "World" at x=80 → gap = 40pt
    const items = [item("Hello", 10, 700, 30), item("World", 80, 700, 30)];
    const lines = reconstructLines(items);
    expect(lines[0].text).toBe("Hello    World");
  });

  it("returns empty array for empty input", () => {
    expect(reconstructLines([])).toEqual([]);
  });

  it("filters out whitespace-only items", () => {
    const items = [item("Hello", 10, 700), item("   ", 60, 700), item("World", 100, 700)];
    const lines = reconstructLines(items);
    expect(lines).toHaveLength(1);
    // Whitespace item is filtered, so Hello and World should be present
    expect(lines[0].text).toContain("Hello");
    expect(lines[0].text).toContain("World");
  });

  it("respects custom y-tolerance", () => {
    const items = [
      item("A", 10, 700),
      item("B", 10, 696), // 4pt apart
    ];
    // With default tolerance (3), these should be separate
    const linesDefault = reconstructLines(items, 3);
    expect(linesDefault).toHaveLength(2);

    // With tolerance of 5, they should merge
    const linesWide = reconstructLines(items, 5);
    expect(linesWide).toHaveLength(1);
  });
});

// ============================================================================
// convertBDODate
// ============================================================================

describe("convertBDODate", () => {
  it("converts MM/DD/YY to YYYY-MM-DD for years 00-79 (2000s)", () => {
    expect(convertBDODate("12/13/25")).toBe("2025-12-13");
    expect(convertBDODate("01/02/26")).toBe("2026-01-02");
    expect(convertBDODate("06/15/00")).toBe("2000-06-15");
  });

  it("converts MM/DD/YY to YYYY-MM-DD for years 80-99 (1900s)", () => {
    expect(convertBDODate("03/15/80")).toBe("1980-03-15");
    expect(convertBDODate("12/31/99")).toBe("1999-12-31");
  });

  it("handles boundary year 79 as 2079", () => {
    expect(convertBDODate("01/01/79")).toBe("2079-01-01");
  });

  it("preserves leading zeros in month and day", () => {
    expect(convertBDODate("01/05/26")).toBe("2026-01-05");
  });
});

// ============================================================================
// isSkippableLine
// ============================================================================

describe("isSkippableLine", () => {
  it("skips empty lines", () => {
    expect(isSkippableLine("")).toBe(true);
    expect(isSkippableLine("   ")).toBe(true);
  });

  it("skips PREVIOUS STATEMENT BALANCE", () => {
    expect(isSkippableLine("  PREVIOUS STATEMENT BALANCE  132,550.94")).toBe(true);
  });

  it("skips CARD NUMBER lines", () => {
    expect(isSkippableLine("CARD NUMBER XXXX-XXXX-XXXX-1234")).toBe(true);
    expect(isSkippableLine("  CARD NUMBER 6121-0719-XXXX-XXXX")).toBe(true);
  });

  it("skips SUBTOTAL and TOTAL", () => {
    expect(isSkippableLine("  SUBTOTAL    45,678.00")).toBe(true);
    expect(isSkippableLine("  TOTAL       132,550.94")).toBe(true);
  });

  it("skips Reference continuation lines", () => {
    expect(isSkippableLine("  Reference: 1234567")).toBe(true);
  });

  it("skips column headers", () => {
    expect(isSkippableLine("Sale Date  Post Date  Transaction Details  Amount")).toBe(true);
  });

  it("skips Statement of Account", () => {
    expect(isSkippableLine("  Statement of Account")).toBe(true);
  });

  it("skips page numbers", () => {
    expect(isSkippableLine("Page 1 of 6")).toBe(true);
    expect(isSkippableLine("  Page 3 of 6")).toBe(true);
  });

  it("skips Credit Cards header", () => {
    expect(isSkippableLine("Credit Cards")).toBe(true);
  });

  it("skips VISA GOLD / VISA PLATINUM", () => {
    expect(isSkippableLine("VISA GOLD")).toBe(true);
    expect(isSkippableLine("VISA PLATINUM")).toBe(true);
  });

  it("skips account summary and points sections", () => {
    expect(isSkippableLine("Account Summary")).toBe(true);
    expect(isSkippableLine("Credit Card Points")).toBe(true);
    expect(isSkippableLine("Points Earned This Month")).toBe(true);
    expect(isSkippableLine("Points Redeemed")).toBe(true);
  });

  it("skips footer disclaimer lines", () => {
    expect(isSkippableLine("BDO Unibank, Inc.")).toBe(true);
    expect(isSkippableLine("Bangko Sentral ng Pilipinas")).toBe(true);
    expect(isSkippableLine("All Rights Reserved")).toBe(true);
  });

  it("skips financial summary lines", () => {
    expect(isSkippableLine("PAYMENT DUE DATE")).toBe(true);
    expect(isSkippableLine("MINIMUM AMOUNT DUE")).toBe(true);
    expect(isSkippableLine("CREDIT LIMIT")).toBe(true);
    expect(isSkippableLine("CASH ADVANCE LIMIT")).toBe(true);
    expect(isSkippableLine("Interest Rate")).toBe(true);
    expect(isSkippableLine("Statement Date")).toBe(true);
    expect(isSkippableLine("Total Amount Due")).toBe(true);
  });

  it("does NOT skip valid transaction lines", () => {
    expect(isSkippableLine("12/13/25  12/17/25  SHOPEE PH MANDALUYONG PH    1,245.00")).toBe(false);
    expect(isSkippableLine("01/02/26  01/04/26  PAYMENT RECEIVED - THANK YOU    -132,550.94")).toBe(
      false
    );
  });
});

// ============================================================================
// parseTransactionLine
// ============================================================================

describe("parseTransactionLine", () => {
  it("parses a standard expense transaction", () => {
    const result = parseTransactionLine("12/13/25  12/17/25  SHOPEE PH MANDALUYONG PH    1,245.00");
    expect(result).not.toBeNull();
    expect(result!.date).toBe("2025-12-13");
    expect(result!.description).toBe("SHOPEE PH MANDALUYONG PH");
    expect(result!.amount).toBe("1245.00");
    expect(result!.type).toBe("expense");
    expect(result!.confidence).toBe(1.0);
  });

  it("parses a credit/refund (negative amount) as income", () => {
    const result = parseTransactionLine(
      "12/26/25  12/28/25  SHOPEE PH MANDALUYONG PH    -1,826.00"
    );
    expect(result).not.toBeNull();
    expect(result!.date).toBe("2025-12-26");
    expect(result!.description).toBe("SHOPEE PH MANDALUYONG PH");
    expect(result!.amount).toBe("1826.00");
    expect(result!.type).toBe("income");
  });

  it("parses payment received (large negative amount) as income", () => {
    const result = parseTransactionLine(
      "01/02/26  01/04/26  PAYMENT RECEIVED - THANK YOU    -132,550.94"
    );
    expect(result).not.toBeNull();
    expect(result!.date).toBe("2026-01-02");
    expect(result!.description).toBe("PAYMENT RECEIVED - THANK YOU");
    expect(result!.amount).toBe("132550.94");
    expect(result!.type).toBe("income");
  });

  it("handles large amounts with multiple comma separators", () => {
    const result = parseTransactionLine("01/05/26  01/07/26  SOME MERCHANT    1,234,567.89");
    expect(result).not.toBeNull();
    expect(result!.amount).toBe("1234567.89");
  });

  it("normalizes multi-space gaps in descriptions", () => {
    const result = parseTransactionLine("12/13/25  12/17/25  MERCHANT    NAME HERE    1,245.00");
    expect(result).not.toBeNull();
    // The regex captures everything between post date and the amount column gap
    // The description should have internal multi-spaces collapsed
    expect(result!.description).not.toContain("  ");
  });

  it("returns null for non-transaction lines", () => {
    expect(parseTransactionLine("SUBTOTAL    45,678.00")).toBeNull();
    expect(parseTransactionLine("Page 1 of 6")).toBeNull();
    expect(parseTransactionLine("")).toBeNull();
    expect(parseTransactionLine("Random text without dates")).toBeNull();
  });

  it("returns 0.9 confidence for descriptions longer than 80 chars", () => {
    const longDesc = "A".repeat(81);
    const line = `12/13/25  12/17/25  ${longDesc}    1,245.00`;
    const result = parseTransactionLine(line);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(0.9);
  });

  it("returns 0.8 confidence for descriptions shorter than 3 chars", () => {
    const result = parseTransactionLine("12/13/25  12/17/25  AB    1,245.00");
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(0.8);
  });

  it("preserves rawText for debugging", () => {
    const line = "  12/13/25  12/17/25  SHOPEE PH    1,245.00  ";
    const result = parseTransactionLine(line);
    expect(result).not.toBeNull();
    expect(result!.rawText).toBe(line.trim());
  });

  it("amounts are always positive strings (safe for parsePHP)", () => {
    const expense = parseTransactionLine("12/13/25  12/17/25  MERCHANT    500.00");
    const income = parseTransactionLine("12/13/25  12/17/25  REFUND    -500.00");
    expect(expense!.amount).toBe("500.00");
    expect(income!.amount).toBe("500.00");
    // Neither should start with a minus sign
    expect(expense!.amount.startsWith("-")).toBe(false);
    expect(income!.amount.startsWith("-")).toBe(false);
  });
});

// ============================================================================
// parse (integration)
// ============================================================================

describe("bdoCreditCardParser.parse", () => {
  it("parses a mock page with mixed transaction and non-transaction lines", () => {
    // Simulate a page with reconstructed text items that will form lines
    const mockPage = page(1, [
      // Header line (will be skipped)
      item("Statement of Account", 50, 750, 150),
      // Column header (will be skipped)
      item("Sale Date", 30, 700, 60),
      item("Post Date", 100, 700, 60),
      item("Transaction Details", 200, 700, 120),
      item("Amount", 450, 700, 50),
      // Transaction 1: expense
      item("12/13/25", 30, 660, 60),
      item("12/17/25", 100, 660, 60),
      item("SHOPEE PH MANDALUYONG PH", 200, 660, 180),
      item("1,245.00", 450, 660, 60),
      // Transaction 2: income (credit)
      item("12/26/25", 30, 640, 60),
      item("12/28/25", 100, 640, 60),
      item("PAYMENT RECEIVED - THANK YOU", 200, 640, 200),
      item("-5,000.00", 450, 640, 60),
      // Footer (will be skipped)
      item("Page 1 of 1", 250, 50, 80),
    ]);

    const result = bdoCreditCardParser.parse([mockPage]);

    expect(result.transactions).toHaveLength(2);
    expect(result.warnings).toHaveLength(0);

    // First transaction: expense
    expect(result.transactions[0].date).toBe("2025-12-13");
    expect(result.transactions[0].type).toBe("expense");
    expect(result.transactions[0].amount).toBe("1245.00");

    // Second transaction: income
    expect(result.transactions[1].date).toBe("2025-12-26");
    expect(result.transactions[1].type).toBe("income");
    expect(result.transactions[1].amount).toBe("5000.00");
  });

  it("returns warning when no transactions are found", () => {
    const mockPage = page(1, [
      item("Statement of Account", 50, 750, 150),
      item("BDO Unibank", 50, 700, 100),
    ]);

    const result = bdoCreditCardParser.parse([mockPage]);
    expect(result.transactions).toHaveLength(0);
    expect(result.warnings).toContain(
      "No transactions found in this PDF. Please verify this is a BDO credit card statement."
    );
  });

  it("returns warning when >20% of attempted lines fail", () => {
    // 1 valid transaction + 4 lines that look non-skippable but don't match
    const mockPage = page(1, [
      // Valid transaction
      item("12/13/25", 30, 700, 60),
      item("12/17/25", 100, 700, 60),
      item("SHOPEE PH", 200, 700, 80),
      item("1,245.00", 450, 700, 60),
      // Non-skippable lines that fail parsing (no dates at start)
      item("Something random here", 30, 660, 200),
      item("Another random line", 30, 640, 200),
      item("Yet another line", 30, 620, 200),
      item("One more failing line", 30, 600, 200),
    ]);

    const result = bdoCreditCardParser.parse([mockPage]);
    expect(result.transactions).toHaveLength(1);
    expect(result.failedRows.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes("could not be parsed"))).toBe(true);
  });

  it("handles multiple pages", () => {
    const page1 = page(1, [
      item("12/13/25", 30, 700, 60),
      item("12/17/25", 100, 700, 60),
      item("MERCHANT A", 200, 700, 80),
      item("100.00", 450, 700, 60),
    ]);
    const page2 = page(2, [
      item("01/02/26", 30, 700, 60),
      item("01/04/26", 100, 700, 60),
      item("MERCHANT B", 200, 700, 80),
      item("200.00", 450, 700, 60),
    ]);

    const result = bdoCreditCardParser.parse([page1, page2]);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].description).toBe("MERCHANT A");
    expect(result.transactions[1].description).toBe("MERCHANT B");
  });

  it("records failed rows with page number and reason", () => {
    const mockPage = page(3, [item("This won't parse as a transaction", 30, 700, 250)]);

    const result = bdoCreditCardParser.parse([mockPage]);
    expect(result.failedRows).toHaveLength(1);
    expect(result.failedRows[0].lineNumber).toBe(3);
    expect(result.failedRows[0].reason).toContain("does not match");
  });

  it("handles empty pages gracefully", () => {
    const result = bdoCreditCardParser.parse([page(1, [])]);
    expect(result.transactions).toHaveLength(0);
  });
});

// ============================================================================
// detect
// ============================================================================

describe("bdoCreditCardParser.detect", () => {
  it("detects BDO UNIBANK in text", () => {
    expect(bdoCreditCardParser.detect!("BDO UNIBANK Statement")).toBe(true);
    expect(bdoCreditCardParser.detect!("bdo unibank statement")).toBe(true);
  });

  it("detects BANCO DE ORO in text", () => {
    expect(bdoCreditCardParser.detect!("BANCO DE ORO credit card")).toBe(true);
  });

  it("returns false for non-BDO text", () => {
    expect(bdoCreditCardParser.detect!("BPI Statement of Account")).toBe(false);
    expect(bdoCreditCardParser.detect!("Metrobank Credit Card")).toBe(false);
  });
});
