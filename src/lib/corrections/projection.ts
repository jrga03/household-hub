import { db } from "@/lib/dexie/db";
import type { LoggedEvent } from "@/lib/events/log";
import { sameOwnership, type Ownership } from "@/lib/events/ownership";
import type { EntityProjection } from "@/lib/events/projector";
import {
  BALANCE_CORRECTION_CREATED,
  BALANCE_CORRECTION_ENTITY,
  BALANCE_CORRECTION_VERSIONS,
  decodeCorrectionDetails,
  decodeCorrectionRemoval,
  describeCorrectionEvent,
  type CorrectionDetails,
} from "./events";

export interface BalanceCorrectionRow extends CorrectionDetails, Ownership {
  id: string;
  householdId: string;
  /** Kept so a restore brings it back; left out of every read. */
  removed: boolean;
  /** The create's HLC: the order records were made in, within a day. */
  recordedHlc: string;
}

/** The create fixes every detail; only removal follows its own latest event. */
function applyCorrectionEvent(
  correction: BalanceCorrectionRow | null,
  event: LoggedEvent
): BalanceCorrectionRow | null {
  if (!correction) {
    const details = decodeCorrectionDetails(event);
    if (!details) return null;
    // The earliest create fixes visibility, owner and household, like a transaction's.
    return {
      id: event.entityId,
      householdId: event.householdId,
      visibility: event.visibility,
      ownerUserId: event.ownerUserId,
      ...details,
      removed: false,
      recordedHlc: event.hlc,
    };
  }
  if (!sameOwnership(event, correction)) return correction;
  const removed = decodeCorrectionRemoval(event);
  return removed === null ? correction : { ...correction, removed };
}

async function describe(event: LoggedEvent, correction: BalanceCorrectionRow | undefined) {
  const accountId = decodeCorrectionDetails(event)?.accountId ?? correction?.accountId;
  const account = accountId === undefined ? undefined : await db.accounts.get(accountId);
  return describeCorrectionEvent(event, account?.name);
}

export const balanceCorrectionProjection: EntityProjection<BalanceCorrectionRow> = {
  entityType: BALANCE_CORRECTION_ENTITY,
  table: db.balanceCorrections,
  versions: BALANCE_CORRECTION_VERSIONS,
  isCreation: (event) => event.eventType === BALANCE_CORRECTION_CREATED,
  fold: applyCorrectionEvent,
  describe,
};

export const getBalanceCorrection = (id: string) => db.balanceCorrections.get(id);

/** Newest date first; within a day, the most recently recorded first. */
export async function listBalanceCorrections(): Promise<BalanceCorrectionRow[]> {
  const rows = await db.balanceCorrections.orderBy("[date+recordedHlc]").reverse().toArray();
  return rows.filter((correction) => !correction.removed);
}
