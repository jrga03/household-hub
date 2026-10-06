/**
 * Debt writes follow the outbox pattern in two phases: prepare (async reads,
 * clocks, idempotency keys; no writes) and apply (one Dexie rw transaction).
 * Callers that also write a transaction row apply both inside their own
 * transaction over debtWriteTables() plus db.transactions.
 */
import { db, type TransactionEvent } from "@/lib/dexie/db";
import { buildSyncQueueItem } from "@/lib/offline/syncQueue";
import type { Debt, DebtPayment, InternalDebt } from "@/types/debt";
import type { EntityType, OperationType, SyncQueueItem } from "@/types/sync";
import { calculateDelta } from "./events";
import { toDebtInsert, toDebtPaymentInsert, toInternalDebtInsert } from "./payloads";

export type DebtKind = "external" | "internal";

export interface DebtWriteSet {
  debtPuts: Debt[];
  internalDebtPuts: InternalDebt[];
  debtDeletes: string[];
  internalDebtDeletes: string[];
  paymentAdds: DebtPayment[];
  events: TransactionEvent[];
  queueItems: SyncQueueItem[];
}

export function emptyWriteSet(): DebtWriteSet {
  return {
    debtPuts: [],
    internalDebtPuts: [],
    debtDeletes: [],
    internalDebtDeletes: [],
    paymentAdds: [],
    events: [],
    queueItems: [],
  };
}

export function mergeWriteSets(...sets: DebtWriteSet[]): DebtWriteSet {
  const merged = emptyWriteSet();
  for (const set of sets) {
    merged.debtPuts.push(...set.debtPuts);
    merged.internalDebtPuts.push(...set.internalDebtPuts);
    merged.debtDeletes.push(...set.debtDeletes);
    merged.internalDebtDeletes.push(...set.internalDebtDeletes);
    merged.paymentAdds.push(...set.paymentAdds);
    merged.events.push(...set.events);
    merged.queueItems.push(...set.queueItems);
  }
  return merged;
}

function isInternalDebt(debt: Debt | InternalDebt): debt is InternalDebt {
  return "from_id" in debt;
}

/** The local audit event reuses the queue item's clock and idempotency key. */
async function outboxEntry(
  entityType: Extract<EntityType, "debt" | "internal_debt" | "debt_payment">,
  entityId: string,
  op: OperationType,
  payload: Record<string, unknown>,
  householdId: string,
  userId: string
): Promise<{ item: SyncQueueItem; event: TransactionEvent }> {
  const item = await buildSyncQueueItem(entityType, entityId, op, payload, userId);
  const event: TransactionEvent = {
    id: crypto.randomUUID(),
    household_id: householdId,
    entity_type: entityType,
    entity_id: entityId,
    op,
    payload,
    idempotency_key: item.operation.idempotencyKey,
    event_version: 1,
    actor_user_id: userId,
    device_id: item.device_id,
    lamport_clock: item.operation.lamportClock,
    vector_clock: { [item.device_id]: item.operation.lamportClock },
    timestamp: item.created_at,
  };
  return { item, event };
}

function withRow(debt: Debt | InternalDebt): DebtWriteSet {
  const set = emptyWriteSet();
  if (isInternalDebt(debt)) set.internalDebtPuts.push(debt);
  else set.debtPuts.push(debt);
  return set;
}

export async function prepareDebtCreate(
  debt: Debt | InternalDebt,
  userId: string
): Promise<DebtWriteSet> {
  const { item, event } = isInternalDebt(debt)
    ? await outboxEntry(
        "internal_debt",
        debt.id,
        "create",
        toInternalDebtInsert(debt),
        debt.household_id,
        userId
      )
    : await outboxEntry("debt", debt.id, "create", toDebtInsert(debt), debt.household_id, userId);
  const set = withRow(debt);
  set.events.push(event);
  set.queueItems.push(item);
  return set;
}

export async function prepareDebtUpdate<T extends Debt | InternalDebt>(
  before: T,
  after: T,
  userId: string
): Promise<DebtWriteSet> {
  // Changed columns only; Debt and InternalDebt keys are all server columns
  // (payloads.test.ts pins that), and a cleared field goes out as null
  const payload: Record<string, unknown> = {
    ...calculateDelta<Debt | InternalDebt>(before, after),
  };
  if (Object.keys(payload).length === 0) return emptyWriteSet();

  const entityType = isInternalDebt(after) ? "internal_debt" : "debt";
  const { item, event } = await outboxEntry(
    entityType,
    after.id,
    "update",
    payload,
    after.household_id,
    userId
  );
  const set = withRow(after);
  set.events.push(event);
  set.queueItems.push(item);
  return set;
}

export async function prepareDebtDelete(
  debt: Debt | InternalDebt,
  userId: string
): Promise<DebtWriteSet> {
  const set = emptyWriteSet();
  const entityType = isInternalDebt(debt) ? "internal_debt" : "debt";
  if (isInternalDebt(debt)) set.internalDebtDeletes.push(debt.id);
  else set.debtDeletes.push(debt.id);
  const { item, event } = await outboxEntry(
    entityType,
    debt.id,
    "delete",
    { id: debt.id },
    debt.household_id,
    userId
  );
  set.events.push(event);
  set.queueItems.push(item);
  return set;
}

export async function preparePaymentAdd(
  payment: DebtPayment,
  userId: string
): Promise<DebtWriteSet> {
  const { item, event } = await outboxEntry(
    "debt_payment",
    payment.id,
    "create",
    toDebtPaymentInsert(payment),
    payment.household_id,
    userId
  );
  const set = emptyWriteSet();
  set.paymentAdds.push(payment);
  set.events.push(event);
  set.queueItems.push(item);
  return set;
}

export function debtWriteTables() {
  return [db.debts, db.internalDebts, db.debtPayments, db.events, db.syncQueue];
}

export async function applyDebtWriteSet(set: DebtWriteSet): Promise<void> {
  if (set.debtPuts.length) await db.debts.bulkPut(set.debtPuts);
  if (set.internalDebtPuts.length) await db.internalDebts.bulkPut(set.internalDebtPuts);
  if (set.debtDeletes.length) await db.debts.bulkDelete(set.debtDeletes);
  if (set.internalDebtDeletes.length) await db.internalDebts.bulkDelete(set.internalDebtDeletes);
  if (set.paymentAdds.length) await db.debtPayments.bulkAdd(set.paymentAdds);
  if (set.events.length) await db.events.bulkAdd(set.events);
  if (set.queueItems.length) await db.syncQueue.bulkAdd(set.queueItems);
}

export async function commitDebtWriteSet(set: DebtWriteSet): Promise<void> {
  await db.transaction("rw", debtWriteTables(), () => applyDebtWriteSet(set));
}
