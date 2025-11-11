/**
 * Debt Tracking Type Definitions
 *
 * Architecture:
 * - Balances are DERIVED from payment history (never stored)
 * - Payments are IMMUTABLE (compensating events for edits)
 * - Internal debts use SOFT REFERENCES (no FK constraints)
 *
 * @module types/debt
 */

// =====================================================
// Base Types
// =====================================================

/**
 * Debt status lifecycle states
 * - active: Debt has outstanding balance
 * - paid_off: Debt fully paid (balance = 0)
 * - archived: Debt closed for reporting (balance may be non-zero)
 */
export type DebtStatus = "active" | "paid_off" | "archived";

/**
 * Entity types for internal debt references
 * Soft references - no FK constraints in IndexedDB
 */
export type EntityType = "category" | "account" | "member";

// =====================================================
// External Debt (loans from outside)
// =====================================================

/**
 * External debt record (e.g., car loan, credit card debt)
 *
 * CRITICAL: No current_balance_cents field - balance is ALWAYS calculated
 * from payment history to ensure data integrity.
 */
export interface Debt {
  /** UUID primary key */
  id: string;

  /** Household this debt belongs to */
  household_id: string;

  /** Debt name (e.g., "Car Loan", "Credit Card") */
  name: string;

  /** Original borrowed amount in cents (always positive) */
  original_amount_cents: number;

  // NOTE: No current_balance_cents - calculated from payments at read time
  // Balance = original_amount_cents - SUM(payments.amount_cents WHERE !is_reversal)

  /** Current lifecycle state */
  status: DebtStatus;

  /** When debt was created (ISO 8601 UTC) */
  created_at: string;

  /** When debt was last modified (ISO 8601 UTC) */
  updated_at: string;

  /** When debt was archived (ISO 8601 UTC) - null for active/paid_off */
  closed_at?: string;
}

// =====================================================
// Internal Debt (household borrowing)
// =====================================================

/**
 * Internal debt record (borrowing between household entities)
 *
 * Examples:
 * - Category borrowing: "Groceries" borrowed from "Entertainment"
 * - Account borrowing: "Checking" borrowed from "Savings"
 * - Member borrowing: "Alice" borrowed from "Bob"
 *
 * CRITICAL: Display names are CACHED at creation and may become stale
 * if referenced entities are renamed/deleted. This is acceptable - the
 * display name preserves historical context.
 */
export interface InternalDebt {
  /** UUID primary key */
  id: string;

  /** Household this debt belongs to */
  household_id: string;

  /** Debt name (e.g., "Category Borrowing: Groceries → Entertainment") */
  name: string;

  /** Original borrowed amount in cents (always positive) */
  original_amount_cents: number;

  // NOTE: No current_balance_cents - calculated from payments

  /** Type of lending entity */
  from_type: EntityType;

  /** UUID of lending entity (soft reference - no FK) */
  from_id: string;

  /** Cached display name at creation (may become stale) */
  from_display_name: string;

  /** Type of borrowing entity */
  to_type: EntityType;

  /** UUID of borrowing entity (soft reference - no FK) */
  to_id: string;

  /** Cached display name at creation (may become stale) */
  to_display_name: string;

  /** Current lifecycle state */
  status: DebtStatus;

  /** When debt was created (ISO 8601 UTC) */
  created_at: string;

  /** When debt was last modified (ISO 8601 UTC) */
  updated_at: string;

  /** When debt was archived (ISO 8601 UTC) - null for active/paid_off */
  closed_at?: string;
}

// =====================================================
// Debt Payment (immutable audit trail)
// =====================================================

/**
 * Debt payment record - IMMUTABLE audit trail
 *
 * Payment Lifecycle:
 * 1. Create payment: amount_cents > 0, is_reversal = false
 * 2. If transaction edited: Create reversal payment (amount_cents < 0, is_reversal = true)
 * 3. Balance calculation: SUM(amount_cents WHERE !is_reversal)
 *
 * CRITICAL: Payments are never updated or deleted. Edits create compensating
 * reversal payments to maintain complete audit trail.
 */
export interface DebtPayment {
  /** UUID primary key */
  id: string;

  /** Household this payment belongs to */
  household_id: string;

  // Debt linkage (exactly ONE of these must be set, not both)

  /** External debt ID (null for internal debt payments) */
  debt_id?: string;

  /** Internal debt ID (null for external debt payments) */
  internal_debt_id?: string;

  /** Transaction ID that created this payment */
  transaction_id: string;

  /** Payment amount in cents
   * - Positive for regular payments (reduces balance)
   * - Negative for reversals (increases balance)
   */
  amount_cents: number;

  /** Payment date (DATE: YYYY-MM-DD in user's timezone) */
  payment_date: string;

  /** Device that created this payment */
  device_id: string;

  /** True if this payment reverses a previous payment (IMMUTABLE) */
  is_reversal: boolean;

  /** ID of original payment being reversed (null for regular payments) */
  reverses_payment_id?: string;

  /** Why this reversal occurred (null for regular payments) */
  adjustment_reason?: string;

  /** True if payment exceeded remaining balance */
  is_overpayment?: boolean;

  /** Amount that exceeded balance (null if no overpayment) */
  overpayment_amount?: number;

  /** When payment record was created (ISO 8601 UTC) */
  created_at: string;

  /** When payment record was last updated (ISO 8601 UTC) */
  updated_at: string;

  /** Idempotency key for event sourcing (format: deviceId-entityType-entityId-lamportClock) */
  idempotency_key: string;
}

// =====================================================
// Computed Types (for UI/queries)
// =====================================================

/**
 * External debt with calculated balance field
 *
 * Balance calculation:
 * current_balance_cents = original_amount_cents - SUM(payments.amount_cents WHERE !is_reversal)
 */
export interface DebtWithBalance extends Debt {
  /** COMPUTED field - not stored in database */
  current_balance_cents: number;
}

/**
 * Internal debt with calculated balance field
 *
 * Balance calculation:
 * current_balance_cents = original_amount_cents - SUM(payments.amount_cents WHERE !is_reversal)
 */
export interface InternalDebtWithBalance extends InternalDebt {
  /** COMPUTED field - not stored in database */
  current_balance_cents: number;
}

// =====================================================
// Form Data Types (for UI)
// =====================================================

/**
 * Form data for creating external debt
 */
export interface DebtFormData {
  name: string;
  original_amount_cents: number;
  household_id: string;
}

/**
 * Form data for creating internal debt
 * Note: Display names are auto-generated from entities, not user-provided
 */
export interface InternalDebtFormData extends DebtFormData {
  from_type: EntityType;
  from_id: string;
  from_display_name?: string; // Optional - auto-generated if not provided
  to_type: EntityType;
  to_id: string;
  to_display_name?: string; // Optional - auto-generated if not provided
}

/**
 * Form data for creating debt payment
 */
export interface DebtPaymentFormData {
  debt_id?: string;
  internal_debt_id?: string;
  transaction_id: string;
  amount_cents: number;
  payment_date: string;
}

// =====================================================
// Payment Processing Types
// =====================================================

export interface ProcessPaymentData {
  transaction_id: string;
  amount_cents: number;
  payment_date: string; // DATE format YYYY-MM-DD
  debt_id?: string;
  internal_debt_id?: string;
  household_id: string;
}

export interface PaymentResult {
  payment: DebtPayment;
  wasOverpayment: boolean;
  overpaymentAmount: number; // Positive value if overpaid
  newBalance: number; // Can be negative
  statusChanged: boolean;
  newStatus: DebtStatus;
}

// =====================================================
// Query Result Types
// =====================================================

/**
 * Payment with linked transaction and debt information
 * Used for payment history display
 */
export interface DebtPaymentWithDetails extends DebtPayment {
  transaction?: {
    type: string;
    account_id: string;
    transfer_group_id?: string;
  };
  debt?: {
    name: string;
    status: DebtStatus;
  };
}

/**
 * Debt summary statistics for dashboard
 */
export interface DebtSummary {
  /** Total number of debts across all statuses */
  total_debts: number;

  /** Number of debts with status='active' */
  active_debts: number;

  /** Number of debts with status='paid_off' */
  paid_off_debts: number;

  /** Number of debts with status='archived' */
  archived_debts: number;

  /** Sum of all original_amount_cents */
  total_original_amount: number;

  /** Sum of all current balances (calculated) */
  total_current_balance: number;

  /** Sum of all payments made */
  total_paid: number;
}

// =====================================================
// Reversal Types (for compensating events)
// =====================================================

/**
 * Input for creating a reversal
 */
export interface CreateReversalData {
  payment_id: string;
  reason?: string; // Optional: "transaction_edited" | "transaction_deleted" | "user_initiated"
}

/**
 * Result of reversal operation
 */
export interface ReversalResult {
  reversal: DebtPayment;
  originalPayment: DebtPayment;
  newBalance: number;
  statusChanged: boolean;
  newStatus?: DebtStatus;
}

/**
 * Input for handling transaction edit
 */
export interface TransactionEditData {
  transaction_id: string;
  new_amount_cents?: number;
  new_debt_id?: string;
  new_internal_debt_id?: string;
  payment_date: string; // ISO date for new payment
}

/**
 * Input for handling transaction delete
 */
export interface TransactionDeleteData {
  transaction_id: string;
}

// =====================================================
// Event Sourcing Types (D10)
// =====================================================

/**
 * Base event structure for debt entities
 *
 * Events enable:
 * - Complete audit trail (who changed what and when)
 * - Multi-device sync with conflict resolution
 * - Event replay for debugging and recovery
 * - Compliance with immutable financial record-keeping
 */
export interface BaseDebtEvent {
  /** Event ID (nanoid) */
  id: string;

  /** Entity type this event applies to */
  entityType: "debt" | "internal_debt" | "debt_payment";

  /** ID of the entity being modified */
  entityId: string;

  /** Operation type */
  op: "create" | "update" | "delete";

  /** Changed data (full entity for create, delta for update) */
  payload: Record<string, any>;

  /** Idempotency key for deduplication
   * Format: ${deviceId}-${entityType}-${entityId}-${lamportClock}
   * For payments: reuses payment.idempotency_key
   */
  idempotencyKey: string;

  /** Lamport clock value (global monotonic counter) */
  lamportClock: number;

  /** Vector clock for conflict resolution
   * Format: { deviceId: lamportClock }
   */
  vectorClock: Record<string, number>;

  /** User who made the change */
  actorUserId: string;

  /** Device that generated this event */
  deviceId: string;

  /** Unix timestamp (milliseconds) for ordering */
  timestamp: number;

  /** ISO 8601 timestamp for human readability */
  created_at: string;
}

/**
 * Event for external debt operations
 */
export interface DebtEvent extends BaseDebtEvent {
  entityType: "debt";
  payload: Partial<Debt>;
}

/**
 * Event for internal debt operations
 */
export interface InternalDebtEvent extends BaseDebtEvent {
  entityType: "internal_debt";
  payload: Partial<InternalDebt>;
}

/**
 * Event for debt payment operations (includes reversals)
 */
export interface DebtPaymentEvent extends BaseDebtEvent {
  entityType: "debt_payment";
  payload: DebtPayment;
}

/**
 * Union type for all debt events
 */
export type AnyDebtEvent = DebtEvent | InternalDebtEvent | DebtPaymentEvent;
