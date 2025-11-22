/**
 * Test Utilities for Debt Testing
 *
 * Factory functions for creating test data with sensible defaults.
 * Reduces boilerplate and ensures consistency across tests.
 *
 * ## Usage
 *
 * ```typescript
 * // Create test debt with defaults
 * const debt = createTestDebt();
 *
 * // Override specific fields
 * const customDebt = createTestDebt({
 *   name: "Car Loan",
 *   original_amount_cents: 500000, // ₱5,000.00
 * });
 *
 * // Create multiple payments
 * const payments = createTestPayments(5, {
 *   debt_id: debt.id,
 *   amount_cents: 10000,
 * });
 * ```
 *
 * @module debts/test-utils
 */

import { nanoid } from "nanoid";
import type { Debt, InternalDebt, DebtPayment } from "@/types/debt";

// =====================================================
// Constants
// =====================================================

/** Default household ID for tests */
export const TEST_HOUSEHOLD_ID = "test-household-001";

/** Default device ID for tests */
export const TEST_DEVICE_ID = "test-device-001";

/** Default user IDs for tests */
export const TEST_USER_1 = "test-user-001";
export const TEST_USER_2 = "test-user-002";

/** Default transaction ID for payments */
export const TEST_TRANSACTION_ID = "test-transaction-001";

// =====================================================
// Factory Functions
// =====================================================

/**
 * Create a test external debt with default values
 *
 * Generates a valid Debt object with sensible defaults.
 * All fields can be overridden via the `overrides` parameter.
 *
 * @param overrides - Partial debt object to override defaults
 * @returns Complete Debt object ready for testing
 *
 * @example
 * ```typescript
 * const debt = createTestDebt({
 *   name: "Student Loan",
 *   original_amount_cents: 1000000, // ₱10,000.00
 *   status: "active",
 * });
 * ```
 */
export function createTestDebt(overrides?: Partial<Debt>): Debt {
  const now = new Date().toISOString();

  return {
    id: nanoid(),
    household_id: TEST_HOUSEHOLD_ID,
    name: "Test Debt",
    original_amount_cents: 100000, // ₱1,000.00
    status: "active",
    created_at: now,
    updated_at: now,
    closed_at: undefined,
    ...overrides,
  };
}

/**
 * Create a test internal debt with default values
 *
 * Generates a valid InternalDebt object for household member borrowing.
 * Defaults to lender_user_id and borrower_user_id pattern.
 *
 * @param overrides - Partial internal debt object to override defaults
 * @returns Complete InternalDebt object ready for testing
 *
 * @example
 * ```typescript
 * const debt = createTestInternalDebt({
 *   lender_user_id: "alice",
 *   borrower_user_id: "bob",
 *   original_amount_cents: 50000, // ₱500.00
 * });
 * ```
 */
export function createTestInternalDebt(overrides?: Partial<InternalDebt>): InternalDebt {
  const now = new Date().toISOString();

  return {
    id: nanoid(),
    household_id: TEST_HOUSEHOLD_ID,
    name: "Test Internal Debt",
    original_amount_cents: 50000, // ₱500.00
    from_type: "member" as EntityType,
    from_id: TEST_USER_1,
    from_display_name: "Test User 1",
    to_type: "member" as EntityType,
    to_id: TEST_USER_2,
    to_display_name: "Test User 2",
    status: "active",
    created_at: now,
    updated_at: now,
    closed_at: undefined,
    ...overrides,
  };
}

/**
 * Create a test debt payment with default values
 *
 * Generates a valid DebtPayment object with sensible defaults.
 * Note: amount_cents is positive for payments, negative for reversals.
 *
 * @param overrides - Partial payment object to override defaults
 * @returns Complete DebtPayment object ready for testing
 *
 * @example
 * ```typescript
 * const payment = createTestPayment({
 *   debt_id: debt.id,
 *   amount_cents: 30000, // ₱300.00 payment
 *   transaction_id: "txn-123",
 * });
 *
 * const reversal = createTestPayment({
 *   debt_id: debt.id,
 *   amount_cents: -30000, // Negative for reversal
 *   is_reversal: true,
 *   reverses_payment_id: "pay-123",
 * });
 * ```
 */
export function createTestPayment(overrides?: Partial<DebtPayment>): DebtPayment {
  const now = new Date().toISOString();
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  return {
    id: nanoid(),
    household_id: TEST_HOUSEHOLD_ID,
    debt_id: "test-debt-" + nanoid(),
    internal_debt_id: undefined,
    transaction_id: TEST_TRANSACTION_ID,
    amount_cents: 10000, // ₱100.00
    payment_date: today,
    is_reversal: false,
    reverses_payment_id: undefined,
    idempotency_key: `${TEST_DEVICE_ID}-debt_payment-${nanoid()}-${Date.now()}`,
    device_id: TEST_DEVICE_ID,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

/**
 * Create multiple test payments with incremental amounts
 *
 * Useful for testing scenarios with multiple payment history records.
 * Each payment gets a unique ID and incrementing amount.
 *
 * @param count - Number of payments to create
 * @param baseOverrides - Base overrides applied to all payments
 * @returns Array of DebtPayment objects
 *
 * @example
 * ```typescript
 * // Create 5 payments for same debt
 * const payments = createTestPayments(5, {
 *   debt_id: "debt-123",
 *   amount_cents: 10000, // Base amount ₱100.00
 * });
 *
 * // Amounts will be: ₱100, ₱101, ₱102, ₱103, ₱104
 * // (incremented by ₱0.01 each)
 * ```
 */
export function createTestPayments(
  count: number,
  baseOverrides?: Partial<DebtPayment>
): DebtPayment[] {
  return Array.from({ length: count }, (_, i) =>
    createTestPayment({
      ...baseOverrides,
      id: `payment-${i + 1}`,
      amount_cents: (baseOverrides?.amount_cents || 10000) + i * 100, // Increment by ₱1.00
      idempotency_key: `${TEST_DEVICE_ID}-debt_payment-payment-${i + 1}-${i + 1}`,
    })
  );
}

// =====================================================
// Helper Functions
// =====================================================

/**
 * Wait for a specified duration
 *
 * Useful for testing async operations and timing-dependent code.
 *
 * @param ms - Milliseconds to wait
 * @returns Promise that resolves after the delay
 *
 * @example
 * ```typescript
 * // Wait 100ms before checking state
 * await wait(100);
 * expect(balance).toBe(expectedValue);
 * ```
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a valid idempotency key
 *
 * Creates a properly formatted idempotency key for events and payments.
 * Format: ${deviceId}-${entityType}-${entityId}-${lamportClock}
 *
 * @param entityType - Type of entity (debt, debt_payment, etc.)
 * @param entityId - ID of the entity
 * @param lamportClock - Lamport clock value (defaults to timestamp)
 * @param deviceId - Device ID (defaults to TEST_DEVICE_ID)
 * @returns Formatted idempotency key
 *
 * @example
 * ```typescript
 * const key = generateIdempotencyKey("debt_payment", "pay-123", 42);
 * // Result: "test-device-001-debt_payment-pay-123-42"
 * ```
 */
export function generateIdempotencyKey(
  entityType: string,
  entityId: string,
  lamportClock: number = Date.now(),
  deviceId: string = TEST_DEVICE_ID
): string {
  return `${deviceId}-${entityType}-${entityId}-${lamportClock}`;
}

/**
 * Create a date string in YYYY-MM-DD format
 *
 * Useful for creating payment_date and debt date fields.
 *
 * @param daysOffset - Days to offset from today (positive = future, negative = past)
 * @returns Date string in YYYY-MM-DD format
 *
 * @example
 * ```typescript
 * const today = createDateString(0);        // "2024-11-11"
 * const yesterday = createDateString(-1);   // "2024-11-10"
 * const nextWeek = createDateString(7);     // "2024-11-18"
 * ```
 */
export function createDateString(daysOffset: number = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().split("T")[0];
}

/**
 * Create an ISO timestamp string
 *
 * Useful for created_at, updated_at fields.
 *
 * @param secondsOffset - Seconds to offset from now (positive = future, negative = past)
 * @returns ISO timestamp string
 *
 * @example
 * ```typescript
 * const now = createTimestamp(0);           // "2024-11-11T12:00:00.000Z"
 * const oneMinuteAgo = createTimestamp(-60); // "2024-11-11T11:59:00.000Z"
 * ```
 */
export function createTimestamp(secondsOffset: number = 0): string {
  const date = new Date();
  date.setSeconds(date.getSeconds() + secondsOffset);
  return date.toISOString();
}
