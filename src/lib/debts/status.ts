/**
 * Status Transition Logic
 *
 * Automatic status management based on balance:
 * - active → paid_off: balance ≤ 0
 * - paid_off → active: balance > 0 (reversal occurred)
 * - archived: terminal state (no auto transitions)
 */

import { db } from "@/lib/dexie/db";
import { calculateDebtBalance } from "./balance";
import type { DebtStatus } from "@/types/debt";

// =====================================================
// Status Transition Functions
// =====================================================

/**
 * Update debt status based on current balance
 *
 * Rules:
 * 1. balance ≤ 0 + status = active → paid_off (set closed_at)
 * 2. balance > 0 + status = paid_off → active (clear closed_at)
 * 3. status = archived → no change (terminal)
 *
 * @param debtId - Debt UUID
 * @param type - 'external' or 'internal'
 * @returns True if status changed
 *
 * @example
 * await updateDebtStatusFromBalance('debt-123', 'external');
 * // If balance = 0, status becomes 'paid_off'
 */
export async function updateDebtStatusFromBalance(
  debtId: string,
  type: "external" | "internal"
): Promise<boolean> {
  // 1. Calculate current balance
  const balance = await calculateDebtBalance(debtId, type);

  // 2. Get current debt record
  const table = type === "external" ? db.debts : db.internalDebts;
  const debt = await table.get(debtId);

  if (!debt) {
    console.warn(`[Status] Debt not found: ${debtId}`);
    return false;
  }

  // 3. Determine target status
  const currentStatus = debt.status;
  let targetStatus: DebtStatus = currentStatus;

  if (currentStatus === "archived") {
    // Terminal state - no automatic transitions
    return false;
  }

  if (balance <= 0 && currentStatus === "active") {
    // Transition: active → paid_off
    targetStatus = "paid_off";
  } else if (balance > 0 && currentStatus === "paid_off") {
    // Transition: paid_off → active (reversal occurred)
    targetStatus = "active";
  }

  // 4. Update status if changed
  if (targetStatus !== currentStatus) {
    const updates: any = {
      status: targetStatus,
      updated_at: new Date().toISOString(),
    };

    // Set closed_at when transitioning to paid_off
    if (targetStatus === "paid_off") {
      updates.closed_at = new Date().toISOString();
    }

    // Clear closed_at when reactivating
    if (targetStatus === "active" && currentStatus === "paid_off") {
      updates.closed_at = null;
    }

    await table.update(debtId, updates);

    console.log(`[Status] ${debt.name}: ${currentStatus} → ${targetStatus} (balance: ${balance})`);

    return true; // Status changed
  }

  return false; // No change needed
}

/**
 * Get expected status based on balance (without updating)
 *
 * @param balance - Current balance in cents
 * @param currentStatus - Current status
 * @returns Expected status based on balance
 */
export function getExpectedStatus(balance: number, currentStatus: DebtStatus): DebtStatus {
  if (currentStatus === "archived") {
    return "archived"; // Terminal state
  }

  if (balance <= 0) {
    return "paid_off";
  }

  return "active";
}

/**
 * Check if status transition is valid
 *
 * @param from - Current status
 * @param to - Target status
 * @returns True if transition is allowed
 */
export function isValidStatusTransition(from: DebtStatus, to: DebtStatus): boolean {
  // Same status - always valid
  if (from === to) return true;

  // From archived - only manual transitions allowed (handled elsewhere)
  if (from === "archived") return false;

  // Automatic transitions
  const validTransitions: Record<DebtStatus, DebtStatus[]> = {
    active: ["paid_off", "archived"],
    paid_off: ["active", "archived"],
    archived: [], // Terminal
  };

  return validTransitions[from]?.includes(to) ?? false;
}

// =====================================================
// Bulk Status Updates
// =====================================================

/**
 * Update status for multiple debts (batch operation)
 *
 * @param debtIds - Array of debt UUIDs
 * @param type - 'external' or 'internal'
 * @returns Number of debts updated
 */
export async function updateMultipleDebtStatuses(
  debtIds: string[],
  type: "external" | "internal"
): Promise<number> {
  let updateCount = 0;

  for (const debtId of debtIds) {
    const updated = await updateDebtStatusFromBalance(debtId, type);
    if (updated) updateCount++;
  }

  return updateCount;
}

// =====================================================
// State Recovery (fix inconsistent states)
// =====================================================

/**
 * Recover invalid debt states (run periodically or on app start)
 *
 * Fixes scenarios:
 * - Balance ≤ 0 but status = active
 * - Balance > 0 but status = paid_off
 *
 * @param type - 'external' or 'internal'
 * @returns Number of debts fixed
 */
export async function recoverInvalidDebtStates(type: "external" | "internal"): Promise<number> {
  console.log(`[Recovery] Scanning ${type} debts for invalid states`);

  const table = type === "external" ? db.debts : db.internalDebts;
  const debts = await table.toArray();

  let fixedCount = 0;

  for (const debt of debts) {
    // Skip archived debts (terminal state)
    if (debt.status === "archived") continue;

    const balance = await calculateDebtBalance(debt.id, type);
    const expectedStatus = getExpectedStatus(balance, debt.status);

    if (expectedStatus !== debt.status) {
      console.warn(
        `[Recovery] Fixing ${debt.name}: status=${debt.status} but balance=${balance} (expected=${expectedStatus})`
      );

      await table.update(debt.id, {
        status: expectedStatus,
        closed_at: expectedStatus === "paid_off" ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      });

      fixedCount++;
    }

    // Log overpayments for visibility
    if (balance < 0) {
      console.info(`[Recovery] Debt ${debt.name} is overpaid by ${Math.abs(balance)} cents`);
    }
  }

  console.log(`[Recovery] Fixed ${fixedCount} inconsistent ${type} debt states`);

  return fixedCount;
}
