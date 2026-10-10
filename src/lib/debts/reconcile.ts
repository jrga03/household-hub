/**
 * Post-pull ledger repair (debts UI spec, gap 2). Two devices can each reverse
 * one payment and add their own replacement. The unique reversal index stops the
 * duplicate reversal; this pass reverses whichever extra payments remain. Every
 * device picks the same keeper, so concurrent runs target the same rows, and the
 * index plus the processor's already-reversed rule absorb the overlap.
 */
import { db } from "@/lib/dexie/db";
import { reportError } from "@/lib/sentry";
import type { DebtPayment } from "@/types/debt";
import { DebtLedgerView } from "./ledgerView";
import { commitDebtWriteSet, mergeWriteSets, type DebtWriteSet } from "./outbox";
import { prepareReversal } from "./reversals";
import { updateMultipleDebtStatuses } from "./status";

export interface PulledDebtChanges {
  transactionIds: string[];
  paymentIds: string[];
}

function debtOf(payment: DebtPayment): string | undefined {
  return payment.debt_id ?? payment.internal_debt_id;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

async function livePayments(rows: DebtPayment[]): Promise<DebtPayment[]> {
  const payments = rows.filter((row) => !row.is_reversal);
  if (payments.length === 0) return [];
  const reversals = await db.debtPayments
    .where("reverses_payment_id")
    .anyOf(payments.map((payment) => payment.id))
    .toArray();
  const reversed = new Set(reversals.map((reversal) => reversal.reverses_payment_id));
  return payments.filter((payment) => !reversed.has(payment.id));
}

async function outstandingEntityIds(): Promise<Set<string>> {
  const items = await db.syncQueue.where("status").anyOf("queued", "syncing").toArray();
  return new Set(items.map((item) => item.entity_id));
}

/** Live payments the transaction's current state does not account for. */
async function extrasForTransaction(
  transactionId: string,
  pending: Set<string>
): Promise<DebtPayment[]> {
  if (pending.has(transactionId)) return [];
  // Missing locally: not pulled yet (Dexie caches transactions on demand), or
  // deleted here, in which case the delete already reversed its payments.
  const transaction = await db.transactions.get(transactionId);
  if (!transaction) return [];
  const rows = await db.debtPayments.where("transaction_id").equals(transactionId).toArray();
  if (rows.some((row) => pending.has(row.id))) return [];

  const live = await livePayments(rows);
  const expectedDebt = transaction.debt_id ?? transaction.internal_debt_id;
  if (!expectedDebt) return live;

  const keeper = live
    .filter((p) => debtOf(p) === expectedDebt && p.amount_cents === transaction.amount_cents)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!keeper) {
    if (live.length > 0) {
      reportError(new Error("Debt ledger does not match its transaction"), {
        subsystem: "debts",
        operation: "reconcile",
        extra: { transactionId, live: live.map((p) => p.id) },
      });
    }
    return [];
  }
  return live.filter((p) => p.id !== keeper.id);
}

/** A live payment pulled with a null link lost its transaction to a delete that raced an edit. */
async function orphans(pulled: DebtPayment[], pending: Set<string>): Promise<DebtPayment[]> {
  return livePayments(pulled.filter((row) => row.transaction_id === null && !pending.has(row.id)));
}

export async function reconcileDebtLedger(
  changes: PulledDebtChanges,
  userId: string
): Promise<{ reversedPaymentIds: string[] }> {
  const pending = await outstandingEntityIds();
  const pulled = (await db.debtPayments.bulkGet(changes.paymentIds)).filter(isDefined);
  const transactionIds = new Set([
    ...changes.transactionIds,
    ...pulled.flatMap((p) => (p.transaction_id ? [p.transaction_id] : [])),
  ]);

  const extras: DebtPayment[] = [];
  for (const transactionId of transactionIds) {
    extras.push(...(await extrasForTransaction(transactionId, pending)));
  }
  extras.push(...(await orphans(pulled, pending)));

  const view = new DebtLedgerView();
  const writeSets: DebtWriteSet[] = [];
  const reversed = new Set<string>();
  for (const payment of extras) {
    if (reversed.has(payment.id)) continue;
    reversed.add(payment.id);
    const { writeSet } = await prepareReversal(
      { payment_id: payment.id, reason: "reconcile" },
      userId,
      view
    );
    writeSets.push(writeSet);
  }
  if (writeSets.length > 0) await commitDebtWriteSet(mergeWriteSets(...writeSets));

  // Gap 4a: statuses follow the balance on every device, not just the payer's
  const touched = [...pulled, ...extras];
  const external = [...new Set(touched.flatMap((p) => (p.debt_id ? [p.debt_id] : [])))];
  const internal = [
    ...new Set(touched.flatMap((p) => (p.internal_debt_id ? [p.internal_debt_id] : []))),
  ];
  if (external.length > 0) await updateMultipleDebtStatuses(external, "external", userId);
  if (internal.length > 0) await updateMultipleDebtStatuses(internal, "internal", userId);

  return { reversedPaymentIds: [...reversed] };
}
