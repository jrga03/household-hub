/**
 * Central Type Definitions Export
 *
 * Exports all type definitions from the types directory for convenient imports.
 * Use: import { Debt, Account, Transaction } from '@/types';
 *
 * NOTE: Some types have naming conflicts and should be imported directly:
 * - EntityType: Use import from '@/types/debt' or '@/types/sync' explicitly
 * - TransactionType: Use import from '@/types/transactions' explicitly
 *
 * @module types
 */

// Account types
export * from "./accounts";

// Category types
export * from "./categories";

// Device types
export * from "./device";

// Event types
export * from "./event";

// Resolution types
export * from "./resolution";

// Currency types (exported first to establish TransactionType)
export type { AmountCents, CurrencyCode } from "./currency";

// Transaction types (includes TransactionType - takes precedence)
export * from "./transactions";

// Sync types (includes EntityType - takes precedence)
export * from "./sync";

// Debt types (NEW) - exported selectively to avoid EntityType conflict
export type {
  DebtStatus,
  // EntityType exported from sync.ts instead (debt's EntityType conflicts)
  Debt,
  InternalDebt,
  DebtPayment,
  DebtWithBalance,
  InternalDebtWithBalance,
  DebtFormData,
  InternalDebtFormData,
  DebtPaymentFormData,
  DebtPaymentWithDetails,
  DebtSummary,
} from "./debt";
