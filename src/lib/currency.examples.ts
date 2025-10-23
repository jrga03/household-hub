/**
 * Real-world usage examples for currency utilities
 *
 * These examples demonstrate common patterns for using currency
 * utilities in the Household Hub application.
 */

import {
  formatPHP,
  parsePHP,
  parsePHPSafe,
  validateAmount,
  addAmounts,
  subtractAmounts,
  multiplyAmount,
  percentageOf,
} from "./currency";

/**
 * Example 1: Form Input Handling
 *
 * Use parsePHPSafe() for form validation to get user-friendly
 * error messages without throwing exceptions.
 */
export function handleAmountInput(userInput: string): {
  isValid: boolean;
  cents?: number;
  errorMessage?: string;
} {
  const result = parsePHPSafe(userInput);

  if (result.success === false) {
    // Map error codes to user-friendly messages
    const errorCode = result.error.code;

    switch (errorCode) {
      case "NEGATIVE_AMOUNT":
        return {
          isValid: false,
          errorMessage: "Amount cannot be negative. Use income/expense type instead.",
        };
      case "EXCEEDS_MAX":
        return {
          isValid: false,
          errorMessage: "Amount too large. Maximum is ₱9,999,999.99",
        };
      case "INVALID_FORMAT":
        return {
          isValid: false,
          errorMessage: "Please enter a valid amount (e.g., 1,500.50)",
        };
      case "NOT_INTEGER":
        return {
          isValid: false,
          errorMessage: "Amount must be a whole number of cents",
        };
    }
  }

  // Success case - result.success must be true here
  const cents = result.value;
  return {
    isValid: true,
    cents,
  };
}

/**
 * Example 2: Display Formatting
 *
 * Always use formatPHP() to display amounts to users.
 * Ensures consistent formatting across the application.
 */
export function displayTransactionAmount(amountCents: number, type: "income" | "expense"): string {
  const formatted = formatPHP(amountCents);

  // Add visual indicator for income vs expense
  if (type === "income") {
    return `+${formatted}`;
  } else {
    return `-${formatted}`;
  }
}

/**
 * Example 3: Account Balance Calculation
 *
 * Calculate running balance from transaction list.
 * IMPORTANT: Exclude transfers (they would count twice)
 */
export function calculateAccountBalance(
  transactions: Array<{
    amount_cents: number;
    type: "income" | "expense";
    transfer_group_id: string | null;
  }>
): number {
  return transactions.reduce((balance, tx) => {
    // CRITICAL: Skip transfers to avoid double-counting
    if (tx.transfer_group_id !== null) {
      return balance;
    }

    // Add income, subtract expense
    if (tx.type === "income") {
      return addAmounts(balance, tx.amount_cents);
    } else {
      return subtractAmounts(balance, tx.amount_cents);
    }
  }, 0);
}

/**
 * Example 4: Budget Variance Calculation
 *
 * Calculate how much over/under budget a category is.
 * Positive = over budget, Negative = under budget
 */
export function calculateBudgetVariance(
  budgetTargetCents: number,
  actualSpendingCents: number
): {
  varianceCents: number;
  percentageSpent: number;
  isOverBudget: boolean;
  formatted: string;
} {
  const varianceCents = actualSpendingCents - budgetTargetCents;
  const percentageSpent =
    budgetTargetCents > 0 ? Math.round((actualSpendingCents / budgetTargetCents) * 100) : 0;

  return {
    varianceCents,
    percentageSpent,
    isOverBudget: varianceCents > 0,
    formatted:
      varianceCents >= 0
        ? `${formatPHP(varianceCents)} over budget`
        : `${formatPHP(Math.abs(varianceCents))} under budget`,
  };
}

/**
 * Example 5: CSV Export
 *
 * Format transaction amounts for CSV export.
 * Use plain numeric format (no currency symbol) for machine-readable output.
 */
export function formatForCSV(transaction: {
  date: string;
  description: string;
  amount_cents: number;
  type: "income" | "expense";
}): string {
  const amount = transaction.amount_cents / 100;
  const signedAmount = transaction.type === "expense" ? -amount : amount;

  return `${transaction.date},${transaction.description},${signedAmount.toFixed(2)}`;
}

/**
 * Example 6: CSV Import
 *
 * Parse CSV amounts and convert to cents.
 * Handle both signed amounts (-1500.50) and separate type column.
 */
export function parseFromCSV(amountStr: string): {
  amount_cents: number;
  type: "income" | "expense";
} {
  const amount = parseFloat(amountStr);

  if (isNaN(amount)) {
    throw new Error(`Invalid amount in CSV: "${amountStr}"`);
  }

  const type = amount >= 0 ? "income" : "expense";
  const absoluteAmount = Math.abs(amount);

  // Convert to cents (parsePHP expects positive amounts)
  const amount_cents = parsePHP(absoluteAmount);

  return { amount_cents, type };
}

/**
 * Example 7: Split Transaction (e.g., Bill Splitting)
 *
 * Split an amount evenly across N people.
 * Handles rounding to ensure total matches original amount.
 */
export function splitAmount(totalCents: number, numPeople: number): number[] {
  if (numPeople <= 0) {
    throw new Error("Number of people must be positive");
  }

  const baseShare = Math.floor(totalCents / numPeople);
  const remainder = totalCents % numPeople;

  // Distribute remainder cents one-by-one to avoid rounding errors
  const shares = Array(numPeople).fill(baseShare);
  for (let i = 0; i < remainder; i++) {
    shares[i] += 1;
  }

  return shares;
}

/**
 * Example 8: Tax Calculation
 *
 * Calculate tax amount for a transaction.
 * Common for Philippine VAT (12%) or other tax scenarios.
 */
export function calculateTax(
  amountCents: number,
  taxPercentage: number
): {
  taxAmount: number;
  totalWithTax: number;
  formatted: string;
} {
  const taxAmount = percentageOf(amountCents, taxPercentage);
  const totalWithTax = addAmounts(amountCents, taxAmount);

  return {
    taxAmount,
    totalWithTax,
    formatted: `${formatPHP(amountCents)} + ${formatPHP(taxAmount)} (${taxPercentage}% tax) = ${formatPHP(totalWithTax)}`,
  };
}

/**
 * Example 9: Recurring Transaction Calculation
 *
 * Calculate total cost of a recurring expense over a period.
 */
export function calculateRecurringTotal(
  amountPerMonth: number,
  months: number
): {
  totalCents: number;
  formatted: string;
} {
  const totalCents = multiplyAmount(amountPerMonth, months);

  return {
    totalCents,
    formatted: `${formatPHP(amountPerMonth)}/month × ${months} months = ${formatPHP(totalCents)}`,
  };
}

/**
 * Example 10: Discount Calculation
 *
 * Apply a percentage discount to an amount.
 */
export function applyDiscount(
  originalCents: number,
  discountPercentage: number
): {
  discountAmount: number;
  finalAmount: number;
  formatted: string;
} {
  const discountAmount = percentageOf(originalCents, discountPercentage);
  const finalAmount = subtractAmounts(originalCents, discountAmount);

  return {
    discountAmount,
    finalAmount,
    formatted: `${formatPHP(originalCents)} - ${formatPHP(discountAmount)} (${discountPercentage}% off) = ${formatPHP(finalAmount)}`,
  };
}

/**
 * Example 11: Category Rollup Calculation
 *
 * Sum amounts from multiple child categories.
 * CRITICAL: Always exclude transfers!
 */
export function calculateCategoryTotal(
  transactions: Array<{
    amount_cents: number;
    transfer_group_id: string | null;
  }>
): number {
  return transactions.reduce((total, tx) => {
    // CRITICAL: Skip transfers to avoid double-counting
    if (tx.transfer_group_id !== null) {
      return total;
    }

    return addAmounts(total, tx.amount_cents);
  }, 0);
}

/**
 * Example 12: Income vs Expense Summary
 *
 * Calculate total income and expenses for a period.
 * CRITICAL: Exclude transfers!
 */
export function calculateIncomeSummary(
  transactions: Array<{
    amount_cents: number;
    type: "income" | "expense";
    transfer_group_id: string | null;
  }>
): {
  totalIncome: number;
  totalExpense: number;
  netIncome: number;
  formatted: string;
} {
  let totalIncome = 0;
  let totalExpense = 0;

  transactions.forEach((tx) => {
    // CRITICAL: Skip transfers to avoid double-counting
    if (tx.transfer_group_id !== null) {
      return;
    }

    if (tx.type === "income") {
      totalIncome = addAmounts(totalIncome, tx.amount_cents);
    } else {
      totalExpense = addAmounts(totalExpense, tx.amount_cents);
    }
  });

  const netIncome = subtractAmounts(totalIncome, totalExpense);

  return {
    totalIncome,
    totalExpense,
    netIncome,
    formatted: `Income: ${formatPHP(totalIncome)} - Expense: ${formatPHP(totalExpense)} = Net: ${formatPHP(netIncome)}`,
  };
}

/**
 * Example 13: Validation Before Save
 *
 * Validate transaction data before saving to database.
 */
export function validateTransaction(data: {
  amount_cents: number;
  type: "income" | "expense";
  description: string;
}): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate amount
  if (!validateAmount(data.amount_cents)) {
    if (!Number.isInteger(data.amount_cents)) {
      errors.push("Amount must be an integer (cents)");
    } else if (data.amount_cents < 0) {
      errors.push("Amount cannot be negative");
    } else {
      errors.push("Amount exceeds maximum allowed value");
    }
  }

  // Validate type
  if (!["income", "expense"].includes(data.type)) {
    errors.push("Type must be 'income' or 'expense'");
  }

  // Validate description
  if (!data.description || data.description.trim() === "") {
    errors.push("Description is required");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
