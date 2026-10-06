/**
 * One-shot repair for debt rows written with nanoid ids, which the uuid
 * columns reject, and for the event-envelope queue items that can never
 * succeed. Runs after sign-in, before auto-sync starts, because building
 * queue items needs the user id and async sync metadata. Guarded by a
 * db.meta flag; the whole rewrite commits in one transaction or not at all.
 * Lamport counters advance before the transaction (harmless, clocks only move
 * forward), and event payloads keep the old ids (local audit log; only
 * entity_id is rewritten).
 */
import { db } from "@/lib/dexie/db";
import { buildSyncQueueItem } from "@/lib/offline/syncQueue";
import type { Debt, DebtPayment, InternalDebt } from "@/types/debt";
import type { SyncQueueItem } from "@/types/sync";
import { toDebtInsert, toDebtPaymentInsert, toInternalDebtInsert } from "./payloads";

export const DEBT_ID_REPAIR_KEY = "debtIdRepair";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEBT_ENTITY_TYPES: ReadonlySet<string> = new Set(["debt", "internal_debt", "debt_payment"]);
const TRANSACTION_DEBT_KEYS = ["debt_id", "internal_debt_id"] as const;

export interface DebtIdRepairResult {
  ran: boolean;
  rekeyed: number;
  queued: number;
  rewrittenTransactionItems: number;
}

/**
 * Debts reference nothing, so their creates may sync ahead of every
 * outstanding item, including transactions whose debt_id points at them.
 */
async function buildDebtItems(
  debts: Debt[],
  internalDebts: InternalDebt[],
  userId: string
): Promise<SyncQueueItem[]> {
  const items: SyncQueueItem[] = [];
  for (const debt of debts) {
    items.push(await buildSyncQueueItem("debt", debt.id, "create", toDebtInsert(debt), userId));
  }
  for (const debt of internalDebts) {
    items.push(
      await buildSyncQueueItem(
        "internal_debt",
        debt.id,
        "create",
        toInternalDebtInsert(debt),
        userId
      )
    );
  }

  const outstanding = await db.syncQueue
    .where("status")
    .anyOf("queued", "syncing", "failed")
    .toArray();
  const earliest = Math.min(Date.now(), ...outstanding.map((item) => Date.parse(item.created_at)));
  return items.map((item, index) => {
    const stamp = new Date(earliest - items.length + index).toISOString();
    return { ...item, created_at: stamp, updated_at: stamp };
  });
}

function rekeyTransactionPayload(
  payload: Record<string, unknown>,
  idMap: ReadonlyMap<string, string>
): Record<string, unknown> | null {
  const next = { ...payload };
  let changed = false;
  for (const key of TRANSACTION_DEBT_KEYS) {
    const value = payload[key];
    const replacement = typeof value === "string" ? idMap.get(value) : undefined;
    if (replacement) {
      next[key] = replacement;
      changed = true;
    }
  }
  return changed ? next : null;
}

const NOT_RUN: DebtIdRepairResult = {
  ran: false,
  rekeyed: 0,
  queued: 0,
  rewrittenTransactionItems: 0,
};

let inFlight: Promise<DebtIdRepairResult> | null = null;

export function repairLegacyDebtIds(userId: string): Promise<DebtIdRepairResult> {
  inFlight ??= runRepair(userId).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function sameIds(rows: { id: string }[], snapshot: { id: string }[]): boolean {
  const current = new Set(rows.map((row) => row.id));
  return current.size === snapshot.length && snapshot.every((row) => current.has(row.id));
}

async function runRepair(userId: string): Promise<DebtIdRepairResult> {
  const flag = await db.meta.get(DEBT_ID_REPAIR_KEY);
  if (flag?.value === "done") return NOT_RUN;

  const [debts, internalDebts, payments] = await Promise.all([
    db.debts.toArray(),
    db.internalDebts.toArray(),
    db.debtPayments.toArray(),
  ]);

  const idMap = new Map<string, string>();
  for (const row of [...debts, ...internalDebts, ...payments]) {
    if (!UUID_PATTERN.test(row.id)) idMap.set(row.id, crypto.randomUUID());
  }
  const rekey = (id: string) => idMap.get(id) ?? id;
  const rekeyOptional = (id: string | undefined) => (id === undefined ? undefined : rekey(id));

  const repairedDebts = debts.map((debt) => ({ ...debt, id: rekey(debt.id) }));
  const repairedInternalDebts = internalDebts.map((debt) => ({ ...debt, id: rekey(debt.id) }));
  const repairedPayments: DebtPayment[] = payments
    .map((payment) => ({
      ...payment,
      id: rekey(payment.id),
      debt_id: rekeyOptional(payment.debt_id),
      internal_debt_id: rekeyOptional(payment.internal_debt_id),
      reverses_payment_id: rekeyOptional(payment.reverses_payment_id),
    }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const debtItems = await buildDebtItems(repairedDebts, repairedInternalDebts, userId);
  const paymentItems: SyncQueueItem[] = [];
  for (const payment of repairedPayments) {
    paymentItems.push(
      await buildSyncQueueItem(
        "debt_payment",
        payment.id,
        "create",
        toDebtPaymentInsert(payment),
        userId
      )
    );
  }

  let rewrittenTransactionItems = 0;
  const committed = await db.transaction(
    "rw",
    [
      db.debts,
      db.internalDebts,
      db.debtPayments,
      db.transactions,
      db.events,
      db.syncQueue,
      db.meta,
    ],
    async () => {
      // Another tab may have finished or written rows since the snapshot
      if ((await db.meta.get(DEBT_ID_REPAIR_KEY))?.value === "done") return false;
      const [currentDebts, currentInternalDebts, currentPayments] = await Promise.all([
        db.debts.toArray(),
        db.internalDebts.toArray(),
        db.debtPayments.toArray(),
      ]);
      if (
        !sameIds(currentDebts, debts) ||
        !sameIds(currentInternalDebts, internalDebts) ||
        !sameIds(currentPayments, payments)
      ) {
        throw new Error("Debt rows changed during the id repair; it will retry on next start");
      }

      await db.debts.bulkDelete(debts.map((debt) => debt.id));
      await db.debts.bulkPut(repairedDebts);
      await db.internalDebts.bulkDelete(internalDebts.map((debt) => debt.id));
      await db.internalDebts.bulkPut(repairedInternalDebts);
      await db.debtPayments.bulkDelete(payments.map((payment) => payment.id));
      await db.debtPayments.bulkPut(repairedPayments);

      if (idMap.size > 0) {
        await db.transactions
          .filter((tx) => idMap.has(tx.debt_id ?? "") || idMap.has(tx.internal_debt_id ?? ""))
          .modify((tx) => {
            tx.debt_id = rekeyOptional(tx.debt_id);
            tx.internal_debt_id = rekeyOptional(tx.internal_debt_id);
          });
        await db.events
          .where("entity_id")
          .anyOf([...idMap.keys()])
          .modify((event) => {
            event.entity_id = rekey(event.entity_id);
          });
      }

      // Envelope-shaped debt items can never succeed, whatever their status
      const queue = await db.syncQueue.toArray();
      await db.syncQueue.bulkDelete(
        queue.filter((item) => DEBT_ENTITY_TYPES.has(item.entity_type)).map((item) => item.id)
      );

      const now = new Date().toISOString();
      for (const item of queue) {
        if (item.entity_type !== "transaction") continue;
        // A stranded or in-flight "syncing" item would otherwise keep the old id
        if (item.status === "completed") continue;
        const payload = rekeyTransactionPayload(item.operation.payload, idMap);
        if (!payload) continue;
        await db.syncQueue.put({
          ...item,
          operation: { ...item.operation, payload },
          status: "queued",
          retry_count: 0,
          next_retry_at: null,
          error_message: null,
          updated_at: now,
        });
        rewrittenTransactionItems++;
      }

      await db.syncQueue.bulkAdd([...debtItems, ...paymentItems]);
      await db.meta.put({ key: DEBT_ID_REPAIR_KEY, value: "done" });
      return true;
    }
  );

  if (!committed) return NOT_RUN;
  return {
    ran: true,
    rekeyed: idMap.size,
    queued: debtItems.length + paymentItems.length,
    rewrittenTransactionItems,
  };
}
