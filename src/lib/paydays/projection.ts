import type { Portion } from "@/lib/budgets/events";
import { hasPortionOn } from "@/lib/budgets/inForce";
import { db } from "@/lib/dexie/db";
import type { LoggedEvent } from "@/lib/events/log";
import type { Visibility } from "@/lib/events/ownership";
import type { EntityProjection } from "@/lib/events/projector";
import {
  decodePaydayName,
  decodePaydayPosition,
  decodePaydayRetirement,
  describePaydayEvent,
  PAYDAY_CREATED,
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
  /** Left out of the pickers and kept under Retired; a deleted payday is retired too. */
  retired: boolean;
  /** Hidden unless a budget has a portion on it, which brings it back retired. */
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
    retired: false,
    deleted: false,
  };
}

/** Each field takes its latest event, since events fold in HLC order. */
function applyPaydayEvent(row: PaydayRow | null, event: LoggedEvent): PaydayRow | null {
  if (!row) return event.eventType === PAYDAY_CREATED ? create(event) : null;
  if (event.eventType === PAYDAY_CREATED) return row;
  const retirement = decodePaydayRetirement(event);
  if (retirement) return { ...row, ...retirement };
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

/**
 * The household's paydays in their order, retired ones included. A deleted
 * one is left out until a budget recorded on another device has a portion on it.
 */
export async function readPaydays(): Promise<PaydayRow[]> {
  const [paydays, budgets] = await Promise.all([db.paydays.toArray(), db.budgets.toArray()]);
  return paydays
    .filter(
      (payday) => !payday.deleted || budgets.some((budget) => hasPortionOn(budget, payday.id))
    )
    .sort(byPosition);
}

/** Paydays in use, plus retired ones these budgets still have a portion on. */
export const paydaysNamedOrInUse = (paydays: PaydayRow[], budgets: { portions: Portion[] }[]) =>
  paydays.filter(
    (payday) => !payday.retired || budgets.some((budget) => hasPortionOn(budget, payday.id))
  );
