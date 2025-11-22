/**
 * Debt Tracking Public API
 *
 * This module exports all public functions for debt tracking functionality.
 *
 * @module debts
 */

// CRUD operations
export {
  createExternalDebt,
  createInternalDebt,
  getDebt,
  getDebtWithBalance,
  listDebts,
  searchDebtsByName,
  updateDebtName,
  archiveDebt,
  unarchiveDebt,
  deleteDebt,
  getDebtsWithBalances,
} from "./crud";

// Validation utilities
export {
  validateAmount,
  validateDebtName,
  validateEntityExists,
  getEntityDisplayName,
  validateDebtCreation,
  validateInternalDebtCreation,
  validateDebtDeletion,
  isDebtNameUnique,
  parseAmountInput,
  formatAmountInput,
} from "./validation";

// Balance calculation
export {
  calculateDebtBalance,
  calculateDebtBalanceWithDetails,
  calculateMultipleBalances,
  type DebtBalanceDetails,
} from "./balance";

// Status management
export {
  updateDebtStatusFromBalance,
  getExpectedStatus,
  isValidStatusTransition,
  updateMultipleDebtStatuses,
  recoverInvalidDebtStates,
} from "./status";

// Payment processing
export {
  processDebtPayment,
  getDebtPayments,
  getPayment,
  getPaymentsByTransaction,
  isTransactionLinkedToDebt,
} from "./payments";

// Re-export PaymentResult type from types
export type { PaymentResult } from "@/types/debt";

// Reversal system
export {
  reverseDebtPayment,
  isPaymentReversed,
  getPaymentReversals,
  handleTransactionEdit,
  handleTransactionDelete,
} from "./reversals";

// Event sourcing
export {
  createDebtEvent,
  createInternalDebtEvent,
  createDebtPaymentEvent,
  calculateDelta,
  eventExists,
  getDebtEvents,
  getPaymentEvents,
  getDebtEventsInRange,
} from "./events";

// Sync queue integration
export {
  addDebtEventToSyncQueue,
  getSyncStatusForDebt,
  getPendingDebtSyncCount,
  type DebtSyncStatus,
} from "./sync";

// Re-export types
export type {
  Debt,
  InternalDebt,
  DebtPayment,
  DebtStatus,
  EntityType,
  DebtWithBalance,
  InternalDebtWithBalance,
  DebtFormData,
  InternalDebtFormData,
  DebtPaymentFormData,
  ProcessPaymentData,
  DebtPaymentWithDetails,
  DebtSummary,
  CreateReversalData,
  ReversalResult,
  TransactionEditData,
  TransactionDeleteData,
  // Event types
  BaseDebtEvent,
  DebtEvent,
  InternalDebtEvent,
  DebtPaymentEvent,
  AnyDebtEvent,
} from "@/types/debt";
