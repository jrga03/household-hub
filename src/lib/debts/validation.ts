/**
 * Debt Validation Logic
 *
 * Validates debt creation, updates, and deletion
 * Enforces business rules and data integrity
 */

import { db } from "@/lib/dexie/db";
import type { DebtFormData, InternalDebtFormData, EntityType } from "@/types/debt";

// =====================================================
// Types
// =====================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

// =====================================================
// Amount Validation
// =====================================================

const CURRENCY_LIMITS = {
  MIN_CENTS: 0,
  MAX_CENTS: 999999999, // ₱9,999,999.99
  MIN_DEBT: 100, // ₱1.00 minimum debt
};

export function validateAmount(cents: number, type: "debt"): ValidationResult {
  const errors: string[] = [];

  if (!Number.isInteger(cents)) {
    errors.push("Amount must be in whole cents (no fractions)");
  }

  if (cents < CURRENCY_LIMITS.MIN_DEBT) {
    errors.push("Amount must be at least ₱1.00");
  }

  if (cents > CURRENCY_LIMITS.MAX_CENTS) {
    errors.push(`Amount exceeds maximum of ₱9,999,999.99`);
  }

  return { valid: errors.length === 0, errors };
}

// =====================================================
// Name Validation
// =====================================================

export async function validateDebtName(
  name: string,
  householdId: string,
  debtType: "external" | "internal",
  excludeId?: string
): Promise<ValidationResult> {
  const errors: string[] = [];

  // Trim and check empty
  const trimmedName = name.trim();
  if (!trimmedName) {
    errors.push("Name is required");
    return { valid: false, errors };
  }

  // Length check
  if (trimmedName.length > 100) {
    errors.push("Name must be 100 characters or less");
  }

  // Uniqueness check (active debts only)
  const table = debtType === "external" ? db.debts : db.internalDebts;
  const duplicate = await table
    .where("household_id")
    .equals(householdId)
    .and(
      (debt) =>
        debt.name.toLowerCase() === trimmedName.toLowerCase() &&
        debt.status === "active" &&
        debt.id !== excludeId // Exclude self when editing
    )
    .first();

  if (duplicate) {
    errors.push(`An active debt named "${trimmedName}" already exists`);
  }

  return { valid: errors.length === 0, errors };
}

// =====================================================
// Entity Validation (Internal Debts)
// =====================================================

/**
 * Validate that entity exists in database
 * Soft references - no FK constraints, runtime validation
 * Note: Member validation removed as profiles table doesn't exist in Dexie
 */
export async function validateEntityExists(
  entityType: EntityType,
  entityId: string
): Promise<boolean> {
  switch (entityType) {
    case "category":
      // Use db.categories (not budgetCategories as in spec)
      const category = await db.categories.get(entityId);
      return !!category && category.is_active; // Using is_active instead of deleted_at

    case "account":
      const account = await db.accounts.get(entityId);
      return !!account && account.is_active; // Using is_active instead of deleted_at

    case "member":
      // No profiles table in Dexie, always return false for now
      // In production, this would check against Supabase profiles
      console.warn(
        `[Validation] Member validation not implemented - profiles table not in IndexedDB`
      );
      return false;

    default:
      return false;
  }
}

/**
 * Get display name for entity (for caching)
 */
export async function getEntityDisplayName(
  entityType: EntityType,
  entityId: string
): Promise<string> {
  switch (entityType) {
    case "category":
      const category = await db.categories.get(entityId);
      return category?.name || `Unknown category`;

    case "account":
      const account = await db.accounts.get(entityId);
      return account?.name || `Unknown account`;

    case "member":
      // No profiles table, return placeholder
      // In production, would fetch from Supabase
      return `Member ${entityId.slice(0, 8)}`;

    default:
      return `Unknown ${entityType}`;
  }
}

// =====================================================
// Debt Creation Validation
// =====================================================

export async function validateDebtCreation(data: DebtFormData): Promise<ValidationResult> {
  const errors: string[] = [];

  // Name validation
  const nameValidation = await validateDebtName(data.name, data.household_id, "external");
  errors.push(...nameValidation.errors);

  // Amount validation
  const amountValidation = validateAmount(data.original_amount_cents, "debt");
  errors.push(...amountValidation.errors);

  return { valid: errors.length === 0, errors };
}

export async function validateInternalDebtCreation(
  data: InternalDebtFormData
): Promise<ValidationResult> {
  const errors: string[] = [];

  // Name validation
  const nameValidation = await validateDebtName(data.name, data.household_id, "internal");
  errors.push(...nameValidation.errors);

  // Amount validation
  const amountValidation = validateAmount(data.original_amount_cents, "debt");
  errors.push(...amountValidation.errors);

  // Self-borrowing check
  if (data.from_type === data.to_type && data.from_id === data.to_id) {
    errors.push("Cannot borrow from the same entity");
  }

  // Entity type validation
  const validTypes: EntityType[] = ["category", "account", "member"];
  if (!validTypes.includes(data.from_type)) {
    errors.push(`Invalid from_type: ${data.from_type}`);
  }
  if (!validTypes.includes(data.to_type)) {
    errors.push(`Invalid to_type: ${data.to_type}`);
  }

  // Entity existence validation (runtime)
  // Skip member validation since profiles table doesn't exist
  if (data.from_type !== "member" && !(await validateEntityExists(data.from_type, data.from_id))) {
    errors.push(`Invalid ${data.from_type} selected`);
  }
  if (data.to_type !== "member" && !(await validateEntityExists(data.to_type, data.to_id))) {
    errors.push(`Invalid ${data.to_type} selected`);
  }

  return { valid: errors.length === 0, errors };
}

// =====================================================
// Debt Deletion Validation
// =====================================================

export async function validateDebtDeletion(
  debtId: string,
  type: "external" | "internal"
): Promise<ValidationResult> {
  const errors: string[] = [];

  // Check for payment history
  const field = type === "external" ? "debt_id" : "internal_debt_id";
  const paymentCount = await db.debtPayments.where(field).equals(debtId).count();

  if (paymentCount > 0) {
    errors.push("Cannot delete debt with payment history. Archive it instead.");
  }

  // Check for pending sync operations
  const pendingOps = await db.syncQueue
    .where("entity_id")
    .equals(debtId)
    .and((item) => item.status === "queued" || item.status === "syncing")
    .count();

  if (pendingOps > 0) {
    errors.push(
      "Cannot delete debt with pending sync operations. Please wait for sync to complete."
    );
  }

  // Check for pending payment sync operations
  const pendingPayments = await db.syncQueue
    .where("entity_type")
    .equals("debt_payment")
    .and((item) => {
      const payload = item.operation.payload as any;
      const hasDebtId =
        type === "external" ? payload?.debt_id === debtId : payload?.internal_debt_id === debtId;
      return hasDebtId && (item.status === "queued" || item.status === "syncing");
    })
    .count();

  if (pendingPayments > 0) {
    errors.push(
      `Cannot delete debt with ${pendingPayments} pending payment(s). Please wait for sync to complete.`
    );
  }

  return { valid: errors.length === 0, errors };
}
