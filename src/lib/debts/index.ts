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
  updateExternalDebt,
  updateInternalDebt,
  deleteExternalDebt,
  deleteInternalDebt,
  getExternalDebt,
  getInternalDebt,
  getExternalDebtWithBalance,
  getInternalDebtWithBalance,
  listExternalDebts,
  listInternalDebts,
} from "./crud";

// Validation utilities
export {
  validateDebtFormData,
  validateInternalDebtFormData,
  validateDebtPaymentFormData,
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
  determineDebtStatus,
  checkAndUpdateDebtStatus,
  updateMultipleDebtStatuses,
  type StatusUpdateResult,
} from "./status";

// Payment processing
export {
  processDebtPayment,
  getDebtPaymentHistory,
  getRecentPayments,
  type PaymentResult,
} from "./payments";

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
