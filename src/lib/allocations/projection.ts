import { db } from "@/lib/dexie/db";
import type { LoggedEvent } from "@/lib/events/log";
import { sameOwnership, type Ownership } from "@/lib/events/ownership";
import type { EntityProjection } from "@/lib/events/projector";
import {
  ALLOCATION_CREATED,
  ALLOCATION_ENTITY,
  ALLOCATION_VERSIONS,
  decodeAllocationDetails,
  decodeAllocationRemoval,
  describeAllocationEvent,
  type AllocationDetails,
} from "./events";

export interface AllocationRow extends AllocationDetails, Ownership {
  id: string;
  householdId: string;
  /** Kept so a restore brings back the latest details; left out of every read. */
  removed: boolean;
  /** The create's HLC: the order allocations were recorded in, within a day. */
  recordedHlc: string;
}

/** Details and removal each follow their own latest event, like a transaction's. */
function applyAllocationEvent(
  allocation: AllocationRow | null,
  event: LoggedEvent
): AllocationRow | null {
  const details = decodeAllocationDetails(event);
  if (!allocation) {
    if (event.eventType !== ALLOCATION_CREATED || !details) return null;
    // The earliest create fixes visibility, owner and household (ADR 0002).
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
  if (!sameOwnership(event, allocation) || event.eventType === ALLOCATION_CREATED) {
    return allocation;
  }
  if (details) return { ...allocation, ...details };
  const removed = decodeAllocationRemoval(event);
  return removed === null ? allocation : { ...allocation, removed };
}

export const allocationProjection: EntityProjection<AllocationRow> = {
  entityType: ALLOCATION_ENTITY,
  table: db.allocations,
  versions: ALLOCATION_VERSIONS,
  isCreation: (event) => event.eventType === ALLOCATION_CREATED,
  fold: applyAllocationEvent,
  describe: describeAllocationEvent,
};

export const getAllocation = (id: string) => db.allocations.get(id);

/** Newest date first; within a day, the most recently recorded first. */
export async function listAllocations(): Promise<AllocationRow[]> {
  const rows = await db.allocations.orderBy("[date+recordedHlc]").reverse().toArray();
  return rows.filter((allocation) => !allocation.removed);
}
