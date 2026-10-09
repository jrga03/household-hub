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

import type { Debt, InternalDebt, DebtPayment, EntityType } from "@/types/debt";
import { cents } from "@/test/cents";

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
    id: crypto.randomUUID(),
    household_id: TEST_HOUSEHOLD_ID,
    name: "Test Debt",
    original_amount_cents: cents(100000), // ₱1,000.00
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
    id: crypto.randomUUID(),
    household_id: TEST_HOUSEHOLD_ID,
    name: "Test Internal Debt",
    original_amount_cents: cents(50000), // ₱500.00
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
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  return {
    id: crypto.randomUUID(),
    household_id: TEST_HOUSEHOLD_ID,
    debt_id: "test-debt-" + crypto.randomUUID(),
    internal_debt_id: undefined,
    transaction_id: TEST_TRANSACTION_ID,
    amount_cents: cents(10000), // ₱100.00
    payment_date: today,
    is_reversal: false,
    reverses_payment_id: undefined,
    idempotency_key: `${TEST_DEVICE_ID}-debt_payment-${crypto.randomUUID()}-${Date.now()}`,
    device_id: TEST_DEVICE_ID,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// =====================================================
// Helper Functions
// =====================================================
