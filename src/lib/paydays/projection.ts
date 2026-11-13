import { db } from "@/lib/dexie/db";
import type { LoggedEvent } from "@/lib/events/log";
import type { Visibility } from "@/lib/events/ownership";
import type { EntityProjection } from "@/lib/events/projector";
import {
  decodePaydayName,
  decodePaydayPosition,
  describePaydayEvent,
  PAYDAY_CREATED,
  PAYDAY_DELETED,
  PAYDAY_ENTITY,
  PAYDAY_VERSIONS,
} from "./events";

/** A household-wide named income with a place in the order (ADR 0014). */
export interface PaydayRow {
  id: string;
  householdId: string;
  visibility: Visibility;
  name: string;
  position: number;
  /** Kept so a later event can't bring the payday back. */
  deleted: boolean;
}

function create(event: LoggedEvent): PaydayRow | null {
  const name = decodePaydayName(event);
  const position = decodePaydayPosition(event);
  if (name === null || position === null) return null;
  return {
    id: event.entityId,
    householdId: event.householdId,
    visibility: event.visibility,
    name,
    position,
    deleted: false,
  };
}

/** Each field takes its latest event, since events fold in HLC order. */
function applyPaydayEvent(row: PaydayRow | null, event: LoggedEvent): PaydayRow | null {
  if (!row) return event.eventType === PAYDAY_CREATED ? create(event) : null;
  if (event.eventType === PAYDAY_CREATED) return row;
  if (event.eventType === PAYDAY_DELETED) return { ...row, deleted: true };
  return {
    ...row,
    name: decodePaydayName(event) ?? row.name,
    position: decodePaydayPosition(event) ?? row.position,
  };
}

export const paydayProjection: EntityProjection<PaydayRow> = {
  entityType: PAYDAY_ENTITY,
  table: db.paydays,
  versions: PAYDAY_VERSIONS,
  isCreation: (event) => event.eventType === PAYDAY_CREATED,
  fold: applyPaydayEvent,
  describe: (event, payday) => describePaydayEvent(event, payday?.name),
};

// Two devices can add paydays at the same position; the ID breaks the tie the same way everywhere.
const byPosition = (a: PaydayRow, b: PaydayRow) =>
  a.position - b.position || (a.id < b.id ? -1 : 1);

/** The household's paydays in their order, deleted ones left out. */
export async function readPaydays(): Promise<PaydayRow[]> {
  const paydays = await db.paydays.filter((payday) => !payday.deleted).toArray();
  return paydays.sort(byPosition);
}
