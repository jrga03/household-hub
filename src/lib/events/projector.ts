import { ACCOUNT_ENTITY } from "@/lib/accounts/events";
import { projectAccountEvent } from "@/lib/accounts/projection";
import type { LoggedEvent } from "./log";

/**
 * Applies one event to the local projections. Must give the same result for
 * any arrival order, since devices pull each other's events at different times.
 * Events of an entity or type this version doesn't know stay in the log only.
 */
export async function projectEvent(event: LoggedEvent): Promise<void> {
  if (event.entityType === ACCOUNT_ENTITY) await projectAccountEvent(event);
}
