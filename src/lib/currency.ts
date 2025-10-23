/**
 * Currency Utilities for Household Hub
 *
 * Handles PHP (Philippine Peso) currency formatting, parsing, and validation
 * with centavo-level precision. All amounts are stored as integer cents
 * (1 PHP = 100 cents) to avoid floating-point precision issues.
 *
 * CRITICAL RULES:
 * - Always store amounts as positive integers with explicit type field
 * - Use BIGINT cents in database (max: 999,999,999 cents = PHP 9,999,999.99)
 * - Never use floating-point arithmetic for currency calculations
 * - Always exclude transfers from budget/analytics calculations
 *
 * @module currency
 */

/**
 * Maximum supported amount in cents (PHP 9,999,999.99)
 * This is ~0.000011% of JavaScript's MAX_SAFE_INTEGER (9,007,199,254,740,991)
 * so standard Number type is safe for all operations.
 */
export const MAX_AMOUNT_CENTS = 999999999;

/**
 * Currency code for MVP (only PHP supported)
 */
export const CURRENCY_CODE = "PHP";

/**
 * Peso sign character
 */
export const PESO_SIGN = "₱";

/**
 * Formats integer cents as PHP currency string with thousand separators.
 *
 * Converts integer cent values to human-readable PHP currency format:
 * - Thousand separators using en-PH locale
 * - Always shows 2 decimal places (centavos)
 * - Peso sign (₱) prefix
 * - Negative amounts prefixed with "-" before peso sign
 *
 * @param cents - Integer amount in cents (1 PHP = 100 cents)
 * @returns Formatted currency string (e.g., "₱1,500.50")
 *
 * @example
 * formatPHP(150050)      // "₱1,500.50"
 * formatPHP(0)           // "₱0.00"
 * formatPHP(100)         // "₱1.00"
 * formatPHP(-50000)      // "-₱500.00"
 * formatPHP(999999999)   // "₱9,999,999.99"
 */
export function formatPHP(cents: number): string {
  // Handle zero as special case for clarity
  if (cents === 0) {
    return `${PESO_SIGN}0.00`;
  }

  // Track sign and work with absolute value
  const isNegative = cents < 0;
  const absoluteCents = Math.abs(cents);

  // Split into pesos and centavos
  const pesos = Math.floor(absoluteCents / 100);
  const centavos = absoluteCents % 100;

  // Format pesos with thousand separators using en-PH locale
  const formattedPesos = pesos.toLocaleString("en-PH");

  // Ensure centavos always has 2 digits (pad with leading zero if needed)
  const formattedCentavos = centavos.toString().padStart(2, "0");

  // Assemble final string with proper sign placement
  return `${isNegative ? "-" : ""}${PESO_SIGN}${formattedPesos}.${formattedCentavos}`;
}

/**
 * Parses user input into integer cents with validation.
 *
 * Accepts various input formats and normalizes to integer cents:
 * - Numbers: Direct conversion (1500.50 → 150050)
 * - Strings with currency symbols: "₱1,500.50" → 150050
 * - Strings with thousand separators: "1,500.50" → 150050
 * - Plain strings: "1500.50" → 150050
 *
 * Returns 0 for invalid/empty input (graceful degradation).
 * Throws error if amount exceeds MAX_AMOUNT_CENTS or is negative.
 *
 * @param input - User input (string or number)
 * @returns Integer amount in cents
 * @throws {Error} If amount is negative or exceeds maximum
 *
 * @example
 * parsePHP("1,500.50")     // 150050
 * parsePHP("₱1,500.50")    // 150050
 * parsePHP("1500.50")      // 150050
 * parsePHP(1500.50)        // 150050
 * parsePHP("invalid")      // 0 (graceful)
 * parsePHP("")             // 0 (graceful)
 * parsePHP("-100")         // throws Error
 * parsePHP("10000000")     // throws Error (exceeds max)
 */
export function parsePHP(input: string | number): number {
  // Handle numeric input directly
  if (typeof input === "number") {
    const cents = Math.round(input * 100);

    // Validate range
    if (cents < 0) {
      throw new Error(
        "Negative amounts not allowed. Use transaction type field to indicate income/expense."
      );
    }
    if (cents > MAX_AMOUNT_CENTS) {
      throw new Error(
        `Amount exceeds maximum: ${formatPHP(cents)} (max: ${formatPHP(MAX_AMOUNT_CENTS)})`
      );
    }

    return cents;
  }

  // Handle empty or invalid input gracefully
  if (!input || typeof input !== "string") {
    return 0;
  }

  // Clean input: remove currency symbols, thousand separators, and whitespace
  const cleaned = input.replace(/[₱,\s]/g, "");

  // Parse as float (handles decimal point)
  const parsed = parseFloat(cleaned);

  // Return 0 for invalid input (graceful degradation)
  if (isNaN(parsed)) {
    return 0;
  }

  // Convert to cents and round to handle floating-point precision
  const cents = Math.round(parsed * 100);

  // Validate range
  if (cents < 0) {
    throw new Error(
      "Negative amounts not allowed. Use transaction type field to indicate income/expense."
    );
  }
  if (cents > MAX_AMOUNT_CENTS) {
    throw new Error(
      `Amount exceeds maximum: ${formatPHP(cents)} (max: ${formatPHP(MAX_AMOUNT_CENTS)})`
    );
  }

  return cents;
}

/**
 * Validates that an amount is within safe range for currency operations.
 *
 * Checks that the amount:
 * - Is an integer (no decimal cents)
 * - Is non-negative (use transaction type for direction)
 * - Does not exceed MAX_AMOUNT_CENTS
 *
 * @param cents - Amount to validate (in integer cents)
 * @returns true if amount is valid, false otherwise
 *
 * @example
 * validateAmount(150050)        // true
 * validateAmount(0)             // true
 * validateAmount(999999999)     // true (max amount)
 * validateAmount(-100)          // false (negative)
 * validateAmount(1000000000)    // false (exceeds max)
 * validateAmount(1500.5)        // false (not integer)
 */
export function validateAmount(cents: number): boolean {
  return Number.isInteger(cents) && cents >= 0 && cents <= MAX_AMOUNT_CENTS;
}

/**
 * Type guard for valid currency amounts.
 * Useful in TypeScript for narrowing types based on validation.
 *
 * @param cents - Amount to check
 * @returns Type predicate indicating if amount is valid
 *
 * @example
 * const userInput = parsePHP(inputString);
 * if (isValidAmount(userInput)) {
 *   // TypeScript knows userInput is a valid amount here
 *   await createTransaction({ amount_cents: userInput });
 * }
 */
export function isValidAmount(cents: number): cents is number {
  return validateAmount(cents);
}

/**
 * Error class for currency-related validation failures.
 * Use this for domain-specific error handling in forms and APIs.
 */
export class CurrencyError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_FORMAT" | "NEGATIVE_AMOUNT" | "EXCEEDS_MAX" | "NOT_INTEGER"
  ) {
    super(message);
    this.name = "CurrencyError";
  }
}

/**
 * Safe version of parsePHP that returns a Result type instead of throwing.
 * Useful for form validation where you want to display specific error messages.
 *
 * @param input - User input to parse
 * @returns Result object with success flag and value or error
 *
 * @example
 * const result = parsePHPSafe("1,500.50");
 * if (result.success) {
 *   console.log("Amount:", result.value);
 * } else {
 *   console.error("Error:", result.error.message);
 * }
 */
export function parsePHPSafe(
  input: string | number
): { success: true; value: number } | { success: false; error: CurrencyError } {
  try {
    const value = parsePHP(input);
    return { success: true, value };
  } catch (error) {
    if (error instanceof Error) {
      const message = error.message;

      // Classify error type
      let code: CurrencyError["code"];
      if (message.includes("Negative")) {
        code = "NEGATIVE_AMOUNT";
      } else if (message.includes("exceeds")) {
        code = "EXCEEDS_MAX";
      } else {
        code = "INVALID_FORMAT";
      }

      return { success: false, error: new CurrencyError(message, code) };
    }

    return {
      success: false,
      error: new CurrencyError("Unknown parsing error", "INVALID_FORMAT"),
    };
  }
}

/**
 * Formats a cents amount as just the numeric value without currency symbol.
 * Useful for CSV exports or API responses where currency is implicit.
 *
 * @param cents - Integer amount in cents
 * @returns Formatted numeric string with 2 decimal places
 *
 * @example
 * formatNumeric(150050)   // "1500.50"
 * formatNumeric(100)      // "1.00"
 * formatNumeric(0)        // "0.00"
 */
export function formatNumeric(cents: number): string {
  const pesos = cents / 100;
  return pesos.toFixed(2);
}

/**
 * Adds two amounts safely, ensuring no overflow.
 *
 * @param a - First amount in cents
 * @param b - Second amount in cents
 * @returns Sum in cents
 * @throws {Error} If result exceeds MAX_AMOUNT_CENTS
 *
 * @example
 * addAmounts(150050, 200000)  // 350050
 */
export function addAmounts(a: number, b: number): number {
  const sum = a + b;
  if (sum > MAX_AMOUNT_CENTS) {
    throw new Error(`Sum exceeds maximum: ${formatPHP(sum)} (max: ${formatPHP(MAX_AMOUNT_CENTS)})`);
  }
  return sum;
}

/**
 * Subtracts two amounts safely, ensuring result is non-negative.
 *
 * @param a - Amount to subtract from (in cents)
 * @param b - Amount to subtract (in cents)
 * @returns Difference in cents
 * @throws {Error} If result would be negative
 *
 * @example
 * subtractAmounts(200000, 150050)  // 49950
 */
export function subtractAmounts(a: number, b: number): number {
  const difference = a - b;
  if (difference < 0) {
    throw new Error(
      `Result would be negative: ${formatPHP(a)} - ${formatPHP(b)} = ${formatPHP(difference)}`
    );
  }
  return difference;
}

/**
 * Multiplies an amount by a factor, rounding to nearest cent.
 *
 * @param cents - Amount in cents
 * @param factor - Multiplication factor (e.g., 1.05 for 5% increase)
 * @returns Result in cents, rounded to nearest cent
 * @throws {Error} If result exceeds MAX_AMOUNT_CENTS
 *
 * @example
 * multiplyAmount(100000, 1.05)  // 105000 (5% increase)
 * multiplyAmount(100000, 0.5)   // 50000 (50% of amount)
 */
export function multiplyAmount(cents: number, factor: number): number {
  const result = Math.round(cents * factor);
  if (result > MAX_AMOUNT_CENTS) {
    throw new Error(
      `Result exceeds maximum: ${formatPHP(result)} (max: ${formatPHP(MAX_AMOUNT_CENTS)})`
    );
  }
  return result;
}

/**
 * Calculates percentage of an amount, rounding to nearest cent.
 *
 * @param cents - Base amount in cents
 * @param percentage - Percentage (e.g., 15 for 15%)
 * @returns Calculated amount in cents
 *
 * @example
 * percentageOf(100000, 15)  // 15000 (15% of 100000 cents = ₱1,000)
 */
export function percentageOf(cents: number, percentage: number): number {
  return Math.round((cents * percentage) / 100);
}
