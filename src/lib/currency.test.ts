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
  parsePHPUnbounded,
  validateAmount,
  parsePHPSafe,
  formatPHPAxisTick,
  MAX_AMOUNT_CENTS,
  CurrencyError,
  asCents,
  ZERO_CENTS,
  sumCents,
  diffCents,
  absCents,
  negateCents,
  divideCents,
  formatPHPChartValue,
} from "./currency";

describe("formatPHP", () => {
  it("formats zero correctly", () => {
    expect(formatPHP(asCents(0))).toBe("₱0.00");
  });

  it("formats small amounts with centavos", () => {
    expect(formatPHP(asCents(1))).toBe("₱0.01");
    expect(formatPHP(asCents(10))).toBe("₱0.10");
    expect(formatPHP(asCents(99))).toBe("₱0.99");
    expect(formatPHP(asCents(100))).toBe("₱1.00");
  });

  it("formats amounts with thousand separators", () => {
    expect(formatPHP(asCents(150050))).toBe("₱1,500.50");
    expect(formatPHP(asCents(100000))).toBe("₱1,000.00");
    expect(formatPHP(asCents(1000000))).toBe("₱10,000.00");
    expect(formatPHP(asCents(123456789))).toBe("₱1,234,567.89");
  });

  it("formats maximum amount correctly", () => {
    expect(formatPHP(asCents(MAX_AMOUNT_CENTS))).toBe("₱9,999,999.99");
  });

  it("formats negative amounts with minus sign before peso sign", () => {
    expect(formatPHP(asCents(-50000))).toBe("-₱500.00");
    expect(formatPHP(asCents(-150050))).toBe("-₱1,500.50");
    expect(formatPHP(asCents(-1))).toBe("-₱0.01");
  });

  it("always shows 2 decimal places", () => {
    expect(formatPHP(asCents(500))).toBe("₱5.00");
    expect(formatPHP(asCents(505))).toBe("₱5.05");
    expect(formatPHP(asCents(550))).toBe("₱5.50");
  });

  it("pads single-digit centavos with leading zero", () => {
    expect(formatPHP(asCents(101))).toBe("₱1.01");
    expect(formatPHP(asCents(102))).toBe("₱1.02");
    expect(formatPHP(asCents(109))).toBe("₱1.09");
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

  it.each(["99999999999999999", 1e20])(
    "reports EXCEEDS_MAX for %s even past the safe-integer range",
    (input) => {
      const result = parsePHPSafe(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("EXCEEDS_MAX");
        expect(result.error.message).toContain("Amount exceeds maximum");
      }
    }
  );

  it("handles invalid format gracefully", () => {
    const result = parsePHPSafe("invalid");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(CurrencyError);
      expect(result.error.code).toBe("INVALID_FORMAT");
    }
  });
});

describe("formatPHPAxisTick", () => {
  it("formats zero as ₱0", () => {
    expect(formatPHPAxisTick(asCents(0))).toBe("₱0");
  });

  it("formats sub-thousand peso values without a suffix", () => {
    expect(formatPHPAxisTick(asCents(50000))).toBe("₱500");
    expect(formatPHPAxisTick(asCents(100))).toBe("₱1");
  });

  it("shows centavos only when the tick is not a whole peso", () => {
    expect(formatPHPAxisTick(asCents(12345))).toBe("₱123.45");
  });

  it("formats thousands compactly with a lowercase k", () => {
    expect(formatPHPAxisTick(asCents(1200000))).toBe("₱12k");
    expect(formatPHPAxisTick(asCents(1250000))).toBe("₱12.5k");
    expect(formatPHPAxisTick(asCents(100000))).toBe("₱1k");
  });

  it("formats millions compactly with M", () => {
    expect(formatPHPAxisTick(asCents(100000000))).toBe("₱1M");
    expect(formatPHPAxisTick(asCents(150000000))).toBe("₱1.5M");
    expect(formatPHPAxisTick(asCents(MAX_AMOUNT_CENTS))).toBe("₱10M");
  });

  it("takes CENTS, not pesos (the 100x consolidation trap)", () => {
    // 12,000 pesos passed as pesos would render ₱120 — the wrong magnitude
    expect(formatPHPAxisTick(asCents(1200000))).toBe("₱12k");
    expect(formatPHPAxisTick(asCents(12000))).toBe("₱120");
  });

  it("places the sign before the peso symbol for negatives", () => {
    expect(formatPHPAxisTick(asCents(-50000))).toBe("-₱500");
    expect(formatPHPAxisTick(asCents(-1250000))).toBe("-₱12.5k");
  });
});

describe("parsePHPUnbounded", () => {
  it("parses formatted peso input to cents", () => {
    expect(parsePHPUnbounded("₱1,500.50")).toBe(150050);
    expect(parsePHPUnbounded(" 12.3 ")).toBe(1230);
  });

  it("returns values above MAX_AMOUNT_CENTS instead of throwing", () => {
    expect(parsePHPUnbounded("99999999")).toBe(9999999900);
  });

  it("returns null for empty, non-numeric, and negative input", () => {
    expect(parsePHPUnbounded("")).toBeNull();
    expect(parsePHPUnbounded("abc")).toBeNull();
    expect(parsePHPUnbounded("-")).toBeNull();
    expect(parsePHPUnbounded("-5")).toBeNull();
  });
});

describe("round-trip formatting and parsing", () => {
  it("formats and parses back to original value", () => {
    const testCases = [0, 1, 100, 150050, 999999, MAX_AMOUNT_CENTS];

    testCases.forEach((cents) => {
      const formatted = formatPHP(asCents(cents));
      const parsed = parsePHP(formatted);
      expect(parsed).toBe(cents);
    });
  });

  it("preserves value through multiple conversions", () => {
    const original = asCents(150050);
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

    const total = diffCents(diffCents(asCents(income), asCents(expense1)), asCents(expense2));
    expect(total).toBe(119925); // ₱1,199.25
    expect(formatPHP(total)).toBe("₱1,199.25");
  });

  it("handles budget variance calculations", () => {
    const budgetTarget = parsePHP("10,000.00"); // ₱10,000 budget
    const actualSpending = parsePHP("12,500.50"); // ₱12,500.50 spent

    const variance = diffCents(actualSpending, budgetTarget);
    expect(variance).toBe(250050); // ₱2,500.50 over budget
    expect(formatPHP(variance)).toBe("₱2,500.50");

    const percentageSpent = Math.round((actualSpending / budgetTarget) * 100);
    expect(percentageSpent).toBe(125); // 125% of budget
  });
});

describe("asCents", () => {
  it("brands safe integers of any sign", () => {
    expect(asCents(150050)).toBe(150050);
    expect(asCents(-2500)).toBe(-2500);
    expect(asCents(0)).toBe(0);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "throws NOT_INTEGER for %s",
    (value) => {
      expect(() => asCents(value)).toThrow(CurrencyError);
      try {
        asCents(value);
      } catch (error) {
        expect(error instanceof CurrencyError && error.code).toBe("NOT_INTEGER");
      }
    }
  );

  it("ZERO_CENTS is zero", () => {
    expect(ZERO_CENTS).toBe(0);
  });
});

describe("cents arithmetic", () => {
  it("sumCents adds any number of signed amounts without a max", () => {
    expect(sumCents([asCents(999999999), asCents(999999999), asCents(-2)])).toBe(1999999996);
    expect(sumCents([])).toBe(0);
  });

  it("diffCents may go negative", () => {
    expect(diffCents(asCents(100), asCents(250))).toBe(-150);
  });

  it("absCents and negateCents", () => {
    expect(absCents(asCents(-2500))).toBe(2500);
    expect(negateCents(asCents(2500))).toBe(-2500);
  });

  it("divideCents rounds to a whole cent", () => {
    expect(divideCents(asCents(100000), 3)).toBe(33333);
    expect(divideCents(asCents(200), 3)).toBe(67);
    expect(Number.isInteger(divideCents(asCents(123457), 7))).toBe(true);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "divideCents rejects divisor %s",
    (divisor) => {
      expect(() => divideCents(asCents(100), divisor)).toThrow(RangeError);
    }
  );
});

describe("formatPHPChartValue", () => {
  it("formats integer cents like formatPHP", () => {
    expect(formatPHPChartValue(150050)).toBe("₱1,500.50");
  });

  it.each(["150050", 1.5, null, undefined, Number.NaN])("renders a dash for %s", (value) => {
    expect(formatPHPChartValue(value)).toBe("₱—");
  });
});

describe("parsers return branded cents", () => {
  it("parsePHPUnbounded returns an over-max value for amounts past the safe-integer range", () => {
    expect(parsePHPUnbounded("1e300")).toBe(MAX_AMOUNT_CENTS + 1);
    expect(parsePHPUnbounded("99999999999999999")).toBe(MAX_AMOUNT_CENTS + 1);
  });

  it.each(["", "abc", "-5", "Infinity"])("parsePHPUnbounded returns null for %j", (input) => {
    expect(parsePHPUnbounded(input)).toBeNull();
  });
});
