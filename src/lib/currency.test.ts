/**
 * Unit tests for currency utilities
 *
 * Tests cover:
 * - Basic formatting and parsing
 * - Edge cases (zero, max amount, negatives)
 * - Input validation and error handling
 * - Rounding behavior
 * - Safe arithmetic operations
 */

import { describe, it, expect } from "vitest";
import {
  formatPHP,
  parsePHP,
  validateAmount,
  isValidAmount,
  parsePHPSafe,
  formatNumeric,
  addAmounts,
  subtractAmounts,
  multiplyAmount,
  percentageOf,
  MAX_AMOUNT_CENTS,
  CurrencyError,
} from "./currency";

describe("formatPHP", () => {
  it("formats zero correctly", () => {
    expect(formatPHP(0)).toBe("₱0.00");
  });

  it("formats small amounts with centavos", () => {
    expect(formatPHP(1)).toBe("₱0.01");
    expect(formatPHP(10)).toBe("₱0.10");
    expect(formatPHP(99)).toBe("₱0.99");
    expect(formatPHP(100)).toBe("₱1.00");
  });

  it("formats amounts with thousand separators", () => {
    expect(formatPHP(150050)).toBe("₱1,500.50");
    expect(formatPHP(100000)).toBe("₱1,000.00");
    expect(formatPHP(1000000)).toBe("₱10,000.00");
    expect(formatPHP(123456789)).toBe("₱1,234,567.89");
  });

  it("formats maximum amount correctly", () => {
    expect(formatPHP(MAX_AMOUNT_CENTS)).toBe("₱9,999,999.99");
  });

  it("formats negative amounts with minus sign before peso sign", () => {
    expect(formatPHP(-50000)).toBe("-₱500.00");
    expect(formatPHP(-150050)).toBe("-₱1,500.50");
    expect(formatPHP(-1)).toBe("-₱0.01");
  });

  it("always shows 2 decimal places", () => {
    expect(formatPHP(500)).toBe("₱5.00");
    expect(formatPHP(505)).toBe("₱5.05");
    expect(formatPHP(550)).toBe("₱5.50");
  });

  it("pads single-digit centavos with leading zero", () => {
    expect(formatPHP(101)).toBe("₱1.01");
    expect(formatPHP(102)).toBe("₱1.02");
    expect(formatPHP(109)).toBe("₱1.09");
  });
});

describe("parsePHP", () => {
  describe("numeric input", () => {
    it("converts numbers to cents", () => {
      expect(parsePHP(15.0)).toBe(1500);
      expect(parsePHP(15.5)).toBe(1550);
      expect(parsePHP(1500.5)).toBe(150050);
    });

    it("rounds floating-point precision issues", () => {
      expect(parsePHP(1500.505)).toBe(150051); // Rounds up
      expect(parsePHP(1500.504)).toBe(150050); // Rounds down
    });

    it("handles zero", () => {
      expect(parsePHP(0)).toBe(0);
      expect(parsePHP(0.0)).toBe(0);
    });

    it("throws error for negative numbers", () => {
      expect(() => parsePHP(-100)).toThrow("Negative amounts not allowed");
    });

    it("throws error for amounts exceeding maximum", () => {
      expect(() => parsePHP(10000000)).toThrow("Amount exceeds maximum");
    });
  });

  describe("string input", () => {
    it("parses plain numeric strings", () => {
      expect(parsePHP("1500.50")).toBe(150050);
      expect(parsePHP("15.00")).toBe(1500);
      expect(parsePHP("0.50")).toBe(50);
    });

    it("parses strings with peso sign", () => {
      expect(parsePHP("₱1,500.50")).toBe(150050);
      expect(parsePHP("₱15.00")).toBe(1500);
      expect(parsePHP("₱0.50")).toBe(50);
    });

    it("parses strings with thousand separators", () => {
      expect(parsePHP("1,500.50")).toBe(150050);
      expect(parsePHP("1,000,000.00")).toBe(100000000);
      expect(parsePHP("9,999,999.99")).toBe(MAX_AMOUNT_CENTS);
    });

    it("parses strings with both peso sign and thousand separators", () => {
      expect(parsePHP("₱1,500.50")).toBe(150050);
      expect(parsePHP("₱1,000.00")).toBe(100000);
    });

    it("ignores whitespace", () => {
      expect(parsePHP(" 1,500.50 ")).toBe(150050);
      expect(parsePHP("₱ 1,500.50")).toBe(150050);
      expect(parsePHP("1, 500.50")).toBe(150050);
    });

    it("handles strings without decimal places", () => {
      expect(parsePHP("1500")).toBe(150000);
      expect(parsePHP("15")).toBe(1500);
    });

    it("returns 0 for empty string", () => {
      expect(parsePHP("")).toBe(0);
      expect(parsePHP("   ")).toBe(0);
    });

    it("throws error for non-numeric strings", () => {
      expect(() => parsePHP("invalid")).toThrow("Invalid amount");
      expect(() => parsePHP("abc")).toThrow("Invalid amount");
    });

    it("returns 0 for currency-symbol-only input", () => {
      // ₱₱₱ strips to empty string → treated as empty input
      expect(parsePHP("₱₱₱")).toBe(0);
    });

    it("throws error for negative string amounts", () => {
      expect(() => parsePHP("-100")).toThrow("Negative amounts not allowed");
      expect(() => parsePHP("₱-1,500.50")).toThrow("Negative amounts not allowed");
    });

    it("throws error for string amounts exceeding maximum", () => {
      expect(() => parsePHP("10,000,000.00")).toThrow("Amount exceeds maximum");
      expect(() => parsePHP("₱99,999,999.99")).toThrow("Amount exceeds maximum");
    });
  });

  describe("edge cases", () => {
    it("returns 0 for null-like values", () => {
      expect(parsePHP("")).toBe(0);
      // @ts-expect-error - Testing runtime behavior
      expect(parsePHP(null)).toBe(0);
      // @ts-expect-error - Testing runtime behavior
      expect(parsePHP(undefined)).toBe(0);
    });

    it("handles very small amounts", () => {
      expect(parsePHP("0.01")).toBe(1);
      expect(parsePHP(0.01)).toBe(1);
    });

    it("handles maximum valid amount", () => {
      expect(parsePHP("9,999,999.99")).toBe(MAX_AMOUNT_CENTS);
      expect(parsePHP(9999999.99)).toBe(MAX_AMOUNT_CENTS);
    });
  });
});

describe("validateAmount", () => {
  it("accepts valid amounts", () => {
    expect(validateAmount(0)).toBe(true);
    expect(validateAmount(1)).toBe(true);
    expect(validateAmount(150050)).toBe(true);
    expect(validateAmount(MAX_AMOUNT_CENTS)).toBe(true);
  });

  it("rejects negative amounts", () => {
    expect(validateAmount(-1)).toBe(false);
    expect(validateAmount(-150050)).toBe(false);
  });

  it("rejects amounts exceeding maximum", () => {
    expect(validateAmount(MAX_AMOUNT_CENTS + 1)).toBe(false);
    expect(validateAmount(1000000000)).toBe(false);
  });

  it("rejects non-integer amounts", () => {
    expect(validateAmount(1500.5)).toBe(false);
    expect(validateAmount(0.5)).toBe(false);
  });

  it("rejects NaN and Infinity", () => {
    expect(validateAmount(NaN)).toBe(false);
    expect(validateAmount(Infinity)).toBe(false);
    expect(validateAmount(-Infinity)).toBe(false);
  });
});

describe("isValidAmount", () => {
  it("acts as type guard", () => {
    const amount: number = 150050;
    if (isValidAmount(amount)) {
      // TypeScript should narrow type here
      expect(amount).toBe(150050);
    }
  });

  it("has same behavior as validateAmount", () => {
    expect(isValidAmount(150050)).toBe(validateAmount(150050));
    expect(isValidAmount(-100)).toBe(validateAmount(-100));
    expect(isValidAmount(1500.5)).toBe(validateAmount(1500.5));
  });
});

describe("parsePHPSafe", () => {
  it("returns success result for valid input", () => {
    const result = parsePHPSafe("1,500.50");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe(150050);
    }
  });

  it("returns error result for negative amounts", () => {
    const result = parsePHPSafe("-100");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(CurrencyError);
      expect(result.error.code).toBe("NEGATIVE_AMOUNT");
      expect(result.error.message).toContain("Negative amounts not allowed");
    }
  });

  it("returns error result for amounts exceeding maximum", () => {
    const result = parsePHPSafe("10,000,000.00");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(CurrencyError);
      expect(result.error.code).toBe("EXCEEDS_MAX");
      expect(result.error.message).toContain("Amount exceeds maximum");
    }
  });

  it("handles invalid format gracefully", () => {
    const result = parsePHPSafe("invalid");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(CurrencyError);
      expect(result.error.code).toBe("INVALID_FORMAT");
    }
  });
});

describe("formatNumeric", () => {
  it("formats amounts as numeric strings without currency symbol", () => {
    expect(formatNumeric(150050)).toBe("1500.50");
    expect(formatNumeric(0)).toBe("0.00");
    expect(formatNumeric(100)).toBe("1.00");
  });

  it("always shows 2 decimal places", () => {
    expect(formatNumeric(500)).toBe("5.00");
    expect(formatNumeric(505)).toBe("5.05");
    expect(formatNumeric(550)).toBe("5.50");
  });

  it("handles large amounts", () => {
    expect(formatNumeric(MAX_AMOUNT_CENTS)).toBe("9999999.99");
    expect(formatNumeric(123456789)).toBe("1234567.89");
  });
});

describe("addAmounts", () => {
  it("adds two amounts correctly", () => {
    expect(addAmounts(150050, 200000)).toBe(350050);
    expect(addAmounts(100, 200)).toBe(300);
    expect(addAmounts(0, 1500)).toBe(1500);
  });

  it("throws error when sum exceeds maximum", () => {
    expect(() => addAmounts(MAX_AMOUNT_CENTS, 1)).toThrow("Sum exceeds maximum");
    expect(() => addAmounts(500000000, 600000000)).toThrow("Sum exceeds maximum");
  });

  it("allows adding to maximum if sum stays within limit", () => {
    expect(addAmounts(MAX_AMOUNT_CENTS - 100, 100)).toBe(MAX_AMOUNT_CENTS);
  });
});

describe("subtractAmounts", () => {
  it("subtracts two amounts correctly", () => {
    expect(subtractAmounts(200000, 150050)).toBe(49950);
    expect(subtractAmounts(1500, 500)).toBe(1000);
    expect(subtractAmounts(1000, 1000)).toBe(0);
  });

  it("throws error when result would be negative", () => {
    expect(() => subtractAmounts(100, 200)).toThrow("Result would be negative");
    expect(() => subtractAmounts(0, 1)).toThrow("Result would be negative");
  });

  it("allows subtraction resulting in zero", () => {
    expect(subtractAmounts(1500, 1500)).toBe(0);
  });
});

describe("multiplyAmount", () => {
  it("multiplies amount by factor", () => {
    expect(multiplyAmount(100000, 1.05)).toBe(105000); // 5% increase
    expect(multiplyAmount(100000, 0.5)).toBe(50000); // 50% of amount
    expect(multiplyAmount(100000, 2)).toBe(200000); // Double
  });

  it("rounds to nearest cent", () => {
    expect(multiplyAmount(100, 1.555)).toBe(156); // Rounds up
    expect(multiplyAmount(100, 1.554)).toBe(155); // Rounds down
  });

  it("throws error when result exceeds maximum", () => {
    expect(() => multiplyAmount(MAX_AMOUNT_CENTS, 2)).toThrow("Result exceeds maximum");
    expect(() => multiplyAmount(500000000, 3)).toThrow("Result exceeds maximum");
  });

  it("handles multiplication by zero", () => {
    expect(multiplyAmount(100000, 0)).toBe(0);
  });

  it("handles multiplication by 1 (identity)", () => {
    expect(multiplyAmount(150050, 1)).toBe(150050);
  });
});

describe("percentageOf", () => {
  it("calculates percentage of amount", () => {
    expect(percentageOf(100000, 15)).toBe(15000); // 15% of ₱1,000
    expect(percentageOf(100000, 50)).toBe(50000); // 50% of ₱1,000
    expect(percentageOf(100000, 100)).toBe(100000); // 100% of ₱1,000
  });

  it("rounds to nearest cent", () => {
    expect(percentageOf(100, 33.33)).toBe(33); // 33.33% of 100 cents
    expect(percentageOf(1000, 33.33)).toBe(333); // 33.33% of 1000 cents
  });

  it("handles zero percentage", () => {
    expect(percentageOf(100000, 0)).toBe(0);
  });

  it("handles fractional percentages", () => {
    expect(percentageOf(100000, 0.5)).toBe(500); // 0.5% of ₱1,000
    expect(percentageOf(100000, 10.5)).toBe(10500); // 10.5% of ₱1,000
  });
});

describe("round-trip formatting and parsing", () => {
  it("formats and parses back to original value", () => {
    const testCases = [0, 1, 100, 150050, 999999, MAX_AMOUNT_CENTS];

    testCases.forEach((cents) => {
      const formatted = formatPHP(cents);
      const parsed = parsePHP(formatted);
      expect(parsed).toBe(cents);
    });
  });

  it("preserves value through multiple conversions", () => {
    const original = 150050;
    const formatted1 = formatPHP(original);
    const parsed1 = parsePHP(formatted1);
    const formatted2 = formatPHP(parsed1);
    const parsed2 = parsePHP(formatted2);

    expect(parsed1).toBe(original);
    expect(parsed2).toBe(original);
    expect(formatted1).toBe(formatted2);
  });
});

describe("financial calculation accuracy", () => {
  it("maintains precision across multiple operations", () => {
    // Simulate budget calculation: income - expenses
    const income = parsePHP("5,000.00"); // ₱5,000
    const expense1 = parsePHP("1,500.50"); // ₱1,500.50
    const expense2 = parsePHP("2,300.25"); // ₱2,300.25

    const total = subtractAmounts(subtractAmounts(income, expense1), expense2);
    expect(total).toBe(119925); // ₱1,199.25
    expect(formatPHP(total)).toBe("₱1,199.25");
  });

  it("handles tax calculations accurately", () => {
    const amount = parsePHP("1,000.00"); // ₱1,000
    const tax = percentageOf(amount, 12); // 12% VAT
    const total = addAmounts(amount, tax);

    expect(tax).toBe(12000); // ₱120
    expect(total).toBe(112000); // ₱1,120
    expect(formatPHP(total)).toBe("₱1,120.00");
  });

  it("handles budget variance calculations", () => {
    const budgetTarget = parsePHP("10,000.00"); // ₱10,000 budget
    const actualSpending = parsePHP("12,500.50"); // ₱12,500.50 spent

    const variance = actualSpending - budgetTarget;
    expect(variance).toBe(250050); // ₱2,500.50 over budget
    expect(formatPHP(variance)).toBe("₱2,500.50");

    const percentageSpent = Math.round((actualSpending / budgetTarget) * 100);
    expect(percentageSpent).toBe(125); // 125% of budget
  });
});
