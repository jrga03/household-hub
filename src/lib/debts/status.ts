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
import { commitDebtWriteSet, prepareDebtUpdate } from "./outbox";
import type { Debt, InternalDebt, DebtStatus } from "@/types/debt";

// =====================================================
// Status Transition Functions
// =====================================================

/** The auto transition for this balance, or null when the status stays (archived never moves). */
export function nextDebtStatus<T extends Debt | InternalDebt>(
  debt: T,
  balance: number,
  now: string
): T | null {
  if (debt.status === "archived") return null;
  if (balance <= 0 && debt.status === "active") {
    return { ...debt, status: "paid_off", closed_at: now, updated_at: now };
  }
  if (balance > 0 && debt.status === "paid_off") {
    return { ...debt, status: "active", closed_at: undefined, updated_at: now };
  }
  return null;
}

/**
 * Update debt status based on current balance, queueing the change through
 * the outbox.
 *
 * @param precomputedBalance - Balance the caller already calculated for this
 *        exact payment state; avoids re-reading every payment row (review DEBT-07)
 * @returns True if status changed
 */
export async function updateDebtStatusFromBalance(
  debtId: string,
  type: "external" | "internal",
  userId: string,
  precomputedBalance?: number
): Promise<boolean> {
  const balance = precomputedBalance ?? (await calculateDebtBalance(debtId, type));
  const debt =
    type === "external" ? await db.debts.get(debtId) : await db.internalDebts.get(debtId);
  if (!debt) {
    console.warn(`[Status] Debt not found: ${debtId}`);
    return false;
  }

  const updated = nextDebtStatus(debt, balance, new Date().toISOString());
  if (!updated) return false;

  await commitDebtWriteSet(await prepareDebtUpdate(debt, updated, userId));
  console.log(`[Status] ${debt.name}: ${debt.status} → ${updated.status} (balance: ${balance})`);
  return true;
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
  type: "external" | "internal",
  userId: string
): Promise<number> {
  let updateCount = 0;

  for (const debtId of debtIds) {
    const updated = await updateDebtStatusFromBalance(debtId, type, userId);
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
export async function recoverInvalidDebtStates(
  type: "external" | "internal",
  userId: string
): Promise<number> {
  console.log(`[Recovery] Scanning ${type} debts for invalid states`);

  const table = type === "external" ? db.debts : db.internalDebts;
  const debts = await table.toArray();

  let fixedCount = 0;

  for (const debt of debts) {
    // Skip archived debts (terminal state)
    if (debt.status === "archived") continue;

    const balance = await calculateDebtBalance(debt.id, type);

    // Route through the single evented transition path so recovery fixes
    // are synced/audited like any other status change (review DEBT-04)
    const fixed = await updateDebtStatusFromBalance(debt.id, type, userId, balance);
    if (fixed) {
      console.warn(`[Recovery] Fixed ${debt.name}: status corrected for balance=${balance}`);
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
