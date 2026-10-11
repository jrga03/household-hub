import { ACCOUNT_ENTITY, describeAccountEvent } from "@/lib/accounts/events";
import { getAccount, projectAccount } from "@/lib/accounts/projection";
import type { LoggedEvent } from "./log";

/**
 * Rebuilds the projection of the event's entity from its history (every event
 * the device holds for that entity, the new one included). Must give the same
 * result for any arrival order, since devices pull each other's events at
 * different times. Events of an entity or type this version doesn't know stay
 * in the log only.
 */
export async function projectEvent(event: LoggedEvent, history: LoggedEvent[]): Promise<void> {
  if (event.entityType === ACCOUNT_ENTITY) await projectAccount(event.entityId, history);
}

/** A readable line for one change, for showing an event the server refused. */
export async function describeEvent(event: LoggedEvent): Promise<string> {
  if (event.entityType === ACCOUNT_ENTITY) {
    return describeAccountEvent(event, (await getAccount(event.entityId))?.name);
  }
  return `Unknown change (${event.eventType})`;
}
