import { db } from "@/lib/dexie/db";
import { sameOwnership, type LoggedEvent, type Ownership } from "@/lib/events/log";
import type { EntityProjection } from "@/lib/events/projector";
import {
  decodeRemoval,
  decodeTransactionDetails,
  decodeTransactionStatus,
  describeTransactionEvent,
  TRANSACTION_CREATED,
  TRANSACTION_ENTITY,
  TRANSACTION_VERSIONS,
  type TransactionDetails,
  type TransactionStatus,
} from "./events";

export interface TransactionRow extends TransactionDetails, Ownership {
  id: string;
  householdId: string;
  status: TransactionStatus;
  /** Kept so a restore brings back the latest details and status; left out of every read. */
  removed: boolean;
  /** The create's HLC: the order transactions were recorded in, within a day. */
  recordedHlc: string;
}

/**
 * Details, status and removal each follow their own latest event, so a status
 * change on one device survives a detail edit on another.
 */
function applyTransactionEvent(
  transaction: TransactionRow | null,
  event: LoggedEvent
): TransactionRow | null {
  const details = decodeTransactionDetails(event);
  const status = decodeTransactionStatus(event);
  if (!transaction) {
    if (event.eventType !== TRANSACTION_CREATED || !details || !status) return null;
    // The earliest create fixes visibility, owner and household (ADR 0002).
    return {
      id: event.entityId,
      householdId: event.householdId,
      visibility: event.visibility,
      ownerUserId: event.ownerUserId,
      ...details,
      status,
      removed: false,
      recordedHlc: event.hlc,
    };
  }
  // Changes carry the transaction's own visibility and owner; anything else isn't a change to it.
  if (!sameOwnership(event, transaction) || event.eventType === TRANSACTION_CREATED) {
    return transaction;
  }
  if (details) return { ...transaction, ...details };
  if (status) return { ...transaction, status };
  const removed = decodeRemoval(event);
  return removed === null ? transaction : { ...transaction, removed };
}

export const transactionProjection: EntityProjection<TransactionRow> = {
  entityType: TRANSACTION_ENTITY,
  table: db.transactions,
  versions: TRANSACTION_VERSIONS,
  isCreation: (event) => event.eventType === TRANSACTION_CREATED,
  fold: applyTransactionEvent,
  describe: describeTransactionEvent,
};

export const getTransaction = (id: string) => db.transactions.get(id);

/** Newest date first; within a day, the most recently recorded first. */
export async function listTransactions(): Promise<TransactionRow[]> {
  const rows = await db.transactions.orderBy("[date+recordedHlc]").reverse().toArray();
  return rows.filter((transaction) => !transaction.removed);
}
