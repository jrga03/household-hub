/**
 * Debt Validation Logic
 *
 * Validates debt creation, updates, and deletion
 * Enforces business rules and data integrity
 */

import { db } from "@/lib/dexie/db";
import type { DebtFormData, InternalDebtFormData, EntityType } from "@/types/debt";
import { z } from "zod";

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

export function validateAmount(cents: number, _type: "debt"): ValidationResult {
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
    case "category": {
      // Use db.categories (not budgetCategories as in spec)
      const category = await db.categories.get(entityId);
      return !!category && category.is_active; // Using is_active instead of deleted_at
    }

    case "account": {
      const account = await db.accounts.get(entityId);
      return !!account && account.is_active; // Using is_active instead of deleted_at
    }

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
    case "category": {
      const category = await db.categories.get(entityId);
      return category?.name || `Unknown category`;
    }

    case "account": {
      const account = await db.accounts.get(entityId);
      return account?.name || `Unknown account`;
    }

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
      const payload = item.operation.payload as Record<string, unknown> | undefined;
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

// =====================================================
// Zod Schemas for Form Validation
// =====================================================

/**
 * External debt creation schema
 */
export const createExternalDebtSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less")
    .trim(),

  original_amount_cents: z
    .number()
    .int("Amount must be a whole number")
    .min(100, "Amount must be at least ₱1.00")
    .max(99999999900, "Amount must not exceed ₱999,999,999.00"),

  description: z.string().max(500, "Description must be 500 characters or less").optional(),

  household_id: z.string().min(1, "Household ID is required"),
});

export type CreateExternalDebtFormData = z.infer<typeof createExternalDebtSchema>;

/**
 * External debt edit schema (name only)
 */
export const editExternalDebtSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less")
    .trim(),
});

export type EditExternalDebtFormData = z.infer<typeof editExternalDebtSchema>;

/**
 * Internal debt creation schema
 */
export const createInternalDebtSchema = z
  .object({
    from_type: z.enum(["user", "account"], {
      errorMap: () => ({ message: "From type must be user or account" }),
    }),

    from_id: z.string().min(1, "From is required"),

    to_type: z.enum(["user", "account"], {
      errorMap: () => ({ message: "To type must be user or account" }),
    }),

    to_id: z.string().min(1, "To is required"),

    original_amount_cents: z
      .number()
      .int("Amount must be a whole number")
      .min(100, "Amount must be at least ₱1.00")
      .max(99999999900, "Amount must not exceed ₱999,999,999.00"),

    description: z.string().max(500, "Description must be 500 characters or less").optional(),

    household_id: z.string().min(1, "Household ID is required"),
  })
  .refine(
    (data) => {
      // Ensure from and to are different
      if (data.from_type === data.to_type && data.from_id === data.to_id) {
        return false;
      }
      return true;
    },
    {
      message: "From and To must be different",
      path: ["to_id"], // Show error on "to" field
    }
  );

export type CreateInternalDebtFormData = z.infer<typeof createInternalDebtSchema>;

/**
 * Check if debt name is unique within active debts
 *
 * @param name - Debt name to check
 * @param householdId - Household ID
 * @param excludeDebtId - Optional debt ID to exclude (for edit forms)
 * @returns True if name is unique
 */
export async function isDebtNameUnique(
  name: string,
  householdId: string,
  excludeDebtId?: string
): Promise<boolean> {
  const trimmedName = name.trim();

  const existing = await db.debts
    .where("household_id")
    .equals(householdId)
    .and((debt) => {
      // Exclude archived debts
      if (debt.status === "archived") return false;

      // Exclude current debt (for edit)
      if (excludeDebtId && debt.id === excludeDebtId) return false;

      // Case-insensitive name match
      return debt.name.toLowerCase() === trimmedName.toLowerCase();
    })
    .first();

  return !existing;
}

/**
 * Validate amount string and convert to cents
 *
 * @param input - Amount string (e.g., "1500", "₱1,500.50")
 * @returns Amount in cents or null if invalid
 */
export function parseAmountInput(input: string): number | null {
  try {
    // Remove currency symbol, commas, spaces
    const cleaned = input.replace(/[₱,\s]/g, "");

    // Parse as float
    const pesos = parseFloat(cleaned);

    if (isNaN(pesos) || pesos < 0) {
      return null;
    }

    // Convert to cents
    const cents = Math.round(pesos * 100);

    // Validate range
    if (cents < 100 || cents > 99999999900) {
      return null;
    }

    return cents;
  } catch {
    return null;
  }
}

/**
 * Format cents to display value for input
 *
 * @param cents - Amount in cents
 * @returns Formatted string (e.g., "1500.50")
 */
export function formatAmountInput(cents: number): string {
  const pesos = cents / 100;
  return pesos.toFixed(2);
}
