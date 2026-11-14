import { checkRecordName } from "@/lib/events/names";
import type { LoggedEvent } from "@/lib/events/log";
import { DELETED, RETIRED, UNRETIRED, type Retirement } from "@/lib/events/retirement";
import type { EventVersions } from "@/lib/events/versions";

export const PAYDAY_ENTITY = "payday";
export const PAYDAY_CREATED = "payday.created";
export const PAYDAY_RENAMED = "payday.renamed";
export const PAYDAY_REORDERED = "payday.reordered";
export const PAYDAY_RETIRED = "payday.retired";
export const PAYDAY_UNRETIRED = "payday.unretired";
export const PAYDAY_DELETED = "payday.deleted";

export const PAYDAY_VERSIONS = {
  [PAYDAY_CREATED]: { current: 1, upcasts: {} },
  [PAYDAY_RENAMED]: { current: 1, upcasts: {} },
  [PAYDAY_REORDERED]: { current: 1, upcasts: {} },
  [PAYDAY_RETIRED]: { current: 1, upcasts: {} },
  [PAYDAY_UNRETIRED]: { current: 1, upcasts: {} },
  [PAYDAY_DELETED]: { current: 1, upcasts: {} },
} satisfies EventVersions;

/** The name a create or rename sets, or null for any other event or a broken name. */
export function decodePaydayName(event: LoggedEvent): string | null {
  if (event.eventType !== PAYDAY_CREATED && event.eventType !== PAYDAY_RENAMED) return null;
  return checkRecordName(event.payload.name, "payday").name;
}

/** The place a create or reorder sets, or null for any other event or a broken position. */
export function decodePaydayPosition(event: LoggedEvent): number | null {
  if (event.eventType !== PAYDAY_CREATED && event.eventType !== PAYDAY_REORDERED) return null;
  const { position } = event.payload;
  return typeof position === "number" && Number.isFinite(position) ? position : null;
}

/** Where a retire, unretire or delete leaves the payday, or null for any other event. */
export function decodePaydayRetirement(event: LoggedEvent): Retirement | null {
  switch (event.eventType) {
    case PAYDAY_RETIRED:
      return RETIRED;
    case PAYDAY_UNRETIRED:
      return UNRETIRED;
    case PAYDAY_DELETED:
      return DELETED;
    default:
      return null;
  }
}

const ACTION_LABELS: Record<string, string> = {
  [PAYDAY_CREATED]: "Add payday",
  [PAYDAY_RENAMED]: "Rename payday",
  [PAYDAY_REORDERED]: "Reorder paydays",
  [PAYDAY_RETIRED]: "Retire payday",
  [PAYDAY_UNRETIRED]: "Unretire payday",
  [PAYDAY_DELETED]: "Delete payday",
};

/** What a change was ("Rename payday: 15th salary"), named as the event set it or by the current name. */
export function describePaydayEvent(event: LoggedEvent, currentName: string | undefined): string {
  const action = ACTION_LABELS[event.eventType] ?? "Change payday";
  const name = decodePaydayName(event) ?? currentName;
  return name ? `${action}: ${name}` : action;
}
