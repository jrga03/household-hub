/**
 * Brand type for amount in cents
 * Prevents accidental mixing of cents and peso amounts
 */
export type AmountCents = number & { readonly __brand: "AmountCents" };

/**
 * Maximum supported amount in cents (PHP 9,999,999.99)
 */
export const MAX_AMOUNT_CENTS = 999999999;

/**
 * Currency code (PHP only for MVP)
 */
export type CurrencyCode = "PHP";

/**
 * Transaction type for amount interpretation
 */
export type TransactionType = "income" | "expense";

/**
 * Create branded AmountCents from regular number
 */
export function amountCents(value: number): AmountCents {
  if (!Number.isInteger(value)) {
    throw new Error(`Amount must be integer cents, got: ${value}`);
  }
  if (value < 0 || value > MAX_AMOUNT_CENTS) {
    throw new Error(`Amount out of range: ${value}`);
  }
  return value as AmountCents;
}
