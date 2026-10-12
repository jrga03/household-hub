import { db } from "@/lib/dexie/db";
import { sameOwnership, type LoggedEvent, type Ownership } from "@/lib/events/log";
import type { EntityProjection } from "@/lib/events/projector";
import type { TransactionStatus } from "@/lib/transactions/events";
import {
  decodeTransferDetails,
  decodeTransferRemoval,
  decodeTransferStatus,
  describeTransferEvent,
  TRANSFER_CREATED,
  TRANSFER_ENTITY,
  TRANSFER_VERSIONS,
  type TransferDetails,
} from "./events";

export interface TransferRow extends TransferDetails, Ownership {
  id: string;
  householdId: string;
  /** One status for both legs. */
  status: TransactionStatus;
  /** Kept so a restore brings back the latest details and status; left out of every read. */
  removed: boolean;
  /** The create's HLC: the order transfers were recorded in, within a day. */
  recordedHlc: string;
}

/**
 * Details, status and removal each follow their own latest event, like a
 * transaction's. One record holds both legs, so they can't disagree (ADR 0006).
 */
function applyTransferEvent(transfer: TransferRow | null, event: LoggedEvent): TransferRow | null {
  const details = decodeTransferDetails(event);
  const status = decodeTransferStatus(event);
  if (!transfer) {
    if (event.eventType !== TRANSFER_CREATED || !details || !status) return null;
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
  if (!sameOwnership(event, transfer) || event.eventType === TRANSFER_CREATED) return transfer;
  if (details) return { ...transfer, ...details };
  if (status) return { ...transfer, status };
  const removed = decodeTransferRemoval(event);
  return removed === null ? transfer : { ...transfer, removed };
}

export const transferProjection: EntityProjection<TransferRow> = {
  entityType: TRANSFER_ENTITY,
  table: db.transfers,
  versions: TRANSFER_VERSIONS,
  isCreation: (event) => event.eventType === TRANSFER_CREATED,
  fold: applyTransferEvent,
  describe: describeTransferEvent,
};

export const getTransfer = (id: string) => db.transfers.get(id);

/** Newest date first; within a day, the most recently recorded first. */
export async function listTransfers(): Promise<TransferRow[]> {
  const rows = await db.transfers.orderBy("[date+recordedHlc]").reverse().toArray();
  return rows.filter((transfer) => !transfer.removed);
}
