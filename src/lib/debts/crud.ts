/**
 * Debt CRUD Operations
 *
 * Create, Read, Update, Delete operations for debts
 * Supports both external and internal debt types
 */

import { nanoid } from "nanoid";
import { db } from "@/lib/dexie/db";
import {
  validateDebtCreation,
  validateInternalDebtCreation,
  validateDebtDeletion,
  validateDebtName,
  getEntityDisplayName,
} from "./validation";
import { calculateDebtBalance } from "./balance";
import { createDebtEvent, createInternalDebtEvent, calculateDelta } from "./events";
import type {
  Debt,
  InternalDebt,
  DebtFormData,
  InternalDebtFormData,
  DebtWithBalance,
  InternalDebtWithBalance,
  DebtStatus,
} from "@/types/debt";

// =====================================================
// CREATE Operations
// =====================================================

/**
 * Create external debt (loan from outside)
 */
export async function createExternalDebt(data: DebtFormData): Promise<Debt> {
  // 1. Validate
  const validation = await validateDebtCreation(data);
  if (!validation.valid) {
    throw new Error(validation.errors.join(", "));
  }

  // 2. Create debt
  const debt: Debt = {
    id: nanoid(),
    household_id: data.household_id,
    name: data.name.trim(),
    original_amount_cents: data.original_amount_cents,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await db.debts.add(debt);

  // 3. Create event (for event sourcing & sync)
  await createDebtEvent(debt, "create");

  console.log("[Debt Created]", debt.name, `(₱${(debt.original_amount_cents / 100).toFixed(2)})`);

  return debt;
}

/**
 * Create internal debt (household borrowing)
 * Note: The form data type in types/debt.ts includes display_name fields,
 * but we'll calculate them here if not provided
 */
export async function createInternalDebt(data: InternalDebtFormData): Promise<InternalDebt> {
  // 1. Validate
  const validation = await validateInternalDebtCreation(data);
  if (!validation.valid) {
    throw new Error(validation.errors.join(", "));
  }

  // 2. Cache display names (calculate if not provided)
  const fromDisplayName =
    data.from_display_name || (await getEntityDisplayName(data.from_type, data.from_id));
  const toDisplayName =
    data.to_display_name || (await getEntityDisplayName(data.to_type, data.to_id));

  // 3. Create internal debt
  const debt: InternalDebt = {
    id: nanoid(),
    household_id: data.household_id,
    name: data.name.trim(),
    original_amount_cents: data.original_amount_cents,
    from_type: data.from_type,
    from_id: data.from_id,
    from_display_name: fromDisplayName,
    to_type: data.to_type,
    to_id: data.to_id,
    to_display_name: toDisplayName,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await db.internalDebts.add(debt);

  // 4. Create event (for event sourcing & sync)
  await createInternalDebtEvent(debt, "create");

  console.log(
    "[Internal Debt Created]",
    debt.name,
    `${fromDisplayName} → ${toDisplayName}`,
    `(₱${(debt.original_amount_cents / 100).toFixed(2)})`
  );

  return debt;
}

// =====================================================
// READ Operations
// =====================================================

/**
 * Get debt by ID
 */
export async function getDebt(
  debtId: string,
  type: "external" | "internal"
): Promise<Debt | InternalDebt | undefined> {
  const table = type === "external" ? db.debts : db.internalDebts;
  return await table.get(debtId);
}

/**
 * Get debt with calculated balance
 */
export async function getDebtWithBalance(
  debtId: string,
  type: "external" | "internal"
): Promise<DebtWithBalance | InternalDebtWithBalance | undefined> {
  const debt = await getDebt(debtId, type);
  if (!debt) return undefined;

  const balance = await calculateDebtBalance(debtId, type);

  return {
    ...debt,
    current_balance_cents: balance,
  } as DebtWithBalance | InternalDebtWithBalance;
}

/**
 * List debts with filters
 */
export async function listDebts(
  householdId: string,
  type: "external" | "internal",
  filters?: {
    status?: DebtStatus;
    limit?: number;
    offset?: number;
  }
): Promise<Array<Debt | InternalDebt>> {
  const table = type === "external" ? db.debts : db.internalDebts;

  let query = table.where("household_id").equals(householdId);

  // Filter by status if provided
  if (filters?.status) {
    const allDebts = await query.toArray();
    const filtered = allDebts.filter((d) => d.status === filters.status);

    // Sort by updated_at DESC
    filtered.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    // Apply pagination
    const offset = filters.offset || 0;
    const limit = filters.limit || filtered.length;
    return filtered.slice(offset, offset + limit);
  }

  // No status filter - sort by updated_at DESC
  const debts = await query.reverse().sortBy("updated_at");

  // Apply pagination
  const offset = filters?.offset || 0;
  const limit = filters?.limit || debts.length;
  return debts.slice(offset, offset + limit);
}

/**
 * Search debts by name (fuzzy, case-insensitive)
 */
export async function searchDebtsByName(
  householdId: string,
  type: "external" | "internal",
  searchTerm: string
): Promise<Array<Debt | InternalDebt>> {
  const table = type === "external" ? db.debts : db.internalDebts;

  const allDebts = await table.where("household_id").equals(householdId).toArray();

  const term = searchTerm.toLowerCase();

  return allDebts.filter((debt) => debt.name.toLowerCase().includes(term));
}

// =====================================================
// UPDATE Operations
// =====================================================

/**
 * Update debt name
 */
export async function updateDebtName(
  debtId: string,
  type: "external" | "internal",
  newName: string
): Promise<void> {
  const table = type === "external" ? db.debts : db.internalDebts;
  const debt = await table.get(debtId);

  if (!debt) {
    throw new Error("Debt not found");
  }

  // Validate new name
  const validation = await validateDebtName(
    newName,
    debt.household_id,
    type,
    debtId // Exclude self
  );

  if (!validation.valid) {
    throw new Error(validation.errors.join(", "));
  }

  // Prepare updated debt
  const updatedDebt = {
    ...debt,
    name: newName.trim(),
    updated_at: new Date().toISOString(),
  };

  await table.update(debtId, {
    name: newName.trim(),
    updated_at: updatedDebt.updated_at,
  });

  // Calculate delta and create update event
  const delta = calculateDelta(debt, updatedDebt);

  if (type === "external") {
    await createDebtEvent(updatedDebt as Debt, "update", delta);
  } else {
    await createInternalDebtEvent(updatedDebt as InternalDebt, "update", delta);
  }

  console.log("[Debt Updated]", `"${debt.name}" → "${newName.trim()}"`);
}

/**
 * Archive debt (sets status to archived)
 */
export async function archiveDebt(debtId: string, type: "external" | "internal"): Promise<void> {
  const table = type === "external" ? db.debts : db.internalDebts;
  const debt = await table.get(debtId);

  if (!debt) {
    throw new Error("Debt not found");
  }

  if (debt.status === "archived") {
    console.log("[Archive] Debt already archived");
    return;
  }

  // Prepare updated debt
  const closedAt = new Date().toISOString();
  const updatedDebt = {
    ...debt,
    status: "archived" as const,
    closed_at: closedAt,
    updated_at: closedAt,
  };

  await table.update(debtId, {
    status: "archived",
    closed_at: closedAt,
    updated_at: closedAt,
  });

  // Calculate delta and create update event (NOT delete event)
  const delta = calculateDelta(debt, updatedDebt);

  if (type === "external") {
    await createDebtEvent(updatedDebt as Debt, "update", delta);
  } else {
    await createInternalDebtEvent(updatedDebt as InternalDebt, "update", delta);
  }

  console.log("[Debt Archived]", debt.name);
}

/**
 * Unarchive debt (reactivate)
 * NOTE: This is a manual operation, not automatic
 */
export async function unarchiveDebt(debtId: string, type: "external" | "internal"): Promise<void> {
  const table = type === "external" ? db.debts : db.internalDebts;
  const debt = await table.get(debtId);

  if (!debt) {
    throw new Error("Debt not found");
  }

  if (debt.status !== "archived") {
    console.log("[Unarchive] Debt not archived");
    return;
  }

  // Determine status based on current balance
  const balance = await calculateDebtBalance(debtId, type);
  const newStatus: DebtStatus = balance <= 0 ? "paid_off" : "active";
  const updatedAt = new Date().toISOString();

  // Prepare updated debt
  const updatedDebt = {
    ...debt,
    status: newStatus,
    closed_at: newStatus === "paid_off" ? debt.closed_at : (null as string | undefined),
    updated_at: updatedAt,
  };

  await table.update(debtId, {
    status: newStatus,
    closed_at: newStatus === "paid_off" ? debt.closed_at : null,
    updated_at: updatedAt,
  });

  // Calculate delta and create update event
  const delta = calculateDelta(debt, updatedDebt);

  if (type === "external") {
    await createDebtEvent(updatedDebt as Debt, "update", delta);
  } else {
    await createInternalDebtEvent(updatedDebt as InternalDebt, "update", delta);
  }

  console.log("[Debt Unarchived]", debt.name, `(status: ${newStatus})`);
}

// =====================================================
// DELETE Operations
// =====================================================

/**
 * Delete debt (hard delete)
 * Only allowed if no payment history exists
 */
export async function deleteDebt(debtId: string, type: "external" | "internal"): Promise<void> {
  // 1. Validate deletion
  const validation = await validateDebtDeletion(debtId, type);
  if (!validation.valid) {
    throw new Error(validation.errors.join(", "));
  }

  // 2. Get debt for logging
  const debt = await getDebt(debtId, type);
  if (!debt) {
    throw new Error("Debt not found");
  }

  // 3. Delete
  const table = type === "external" ? db.debts : db.internalDebts;
  await table.delete(debtId);

  console.log("[Debt Deleted]", debt.name);
}

// =====================================================
// Bulk Operations
// =====================================================

/**
 * Get debts with balances (batch operation)
 */
export async function getDebtsWithBalances(
  householdId: string,
  type: "external" | "internal",
  filters?: { status?: DebtStatus }
): Promise<Array<DebtWithBalance | InternalDebtWithBalance>> {
  const debts = await listDebts(householdId, type, filters);

  const withBalances = await Promise.all(
    debts.map(async (debt) => {
      const balance = await calculateDebtBalance(debt.id, type);
      return {
        ...debt,
        current_balance_cents: balance,
      };
    })
  );

  return withBalances as Array<DebtWithBalance | InternalDebtWithBalance>;
}
