import { reportError } from "@/lib/sentry";
import { reloadMembership } from "@/lib/households";
import { discardStuck, requeueStuck } from "@/lib/events/log";
import { createSyncEngine, EventLogRejected } from "./engine";
import { supabaseEventLog } from "./supabase-remote";
import { startSyncTriggers } from "./triggers";

// A refusal means something is wrong with the events or the membership.
const engine = createSyncEngine(supabaseEventLog, {
  onStuck: (event, rejection) =>
    reportError(rejection, {
      subsystem: "sync",
      operation: "push",
      extra: { code: rejection.code, eventType: event.eventType },
    }),
  onHouseholdChanged: () => void reloadMembership(),
});

// Unreachable is normal for an offline-first app; it retries with backoff.
function onSyncError(error: unknown) {
  if (error instanceof EventLogRejected) {
    reportError(error, { subsystem: "sync", operation: "pull", extra: { code: error.code } });
  } else {
    console.warn("Sync failed; it will retry.", error);
  }
}

let stopTriggers: (() => void) | null = null;

/** Starts syncing for the signed-in person, member or not, so a lost membership is noticed. Returns a stop function. */
export function startEventSync(): () => void {
  stopTriggers?.();
  engine.resume();
  const stop = startSyncTriggers(engine.sync, { onError: onSyncError });
  stopTriggers = stop;
  return () => {
    stop();
    if (stopTriggers === stop) stopTriggers = null;
  };
}

/** Syncs now, for a step that needs this device's changes on the server first; failures are logged, not thrown. */
export async function syncNow(): Promise<void> {
  await engine.sync().catch(onSyncError);
}

/** Puts a refused change back in the queue and syncs it now; refused again, it is stuck again. */
export async function retryStuckEvent(eventId: string): Promise<void> {
  await requeueStuck(eventId);
  await syncNow();
}

/** Drops a refused change from this device and rebuilds what it touched. */
export const discardStuckEvent = discardStuck;

const FINAL_PUSH_TIMEOUT_MS = 5000;

const pushTimeout = () =>
  new Promise<void>((resolve) => setTimeout(resolve, FINAL_PUSH_TIMEOUT_MS));

/** Sign-out asks first about what is still unpushed, so give it a last chance to go (5 s cap). */
export async function syncBeforeSignOut(): Promise<void> {
  await Promise.race([engine.sync().catch(onSyncError), pushTimeout()]);
}

/**
 * Before the local store is wiped (sign-out): stop syncing, so nothing is
 * pulled into the fresh store, and give unpushed events one last push.
 */
export async function stopEventSyncForSignOut(): Promise<void> {
  stopTriggers?.();
  stopTriggers = null;
  engine.halt();
  const finalPush = engine.idle().then(() => engine.pushPending().catch(onSyncError));
  await Promise.race([finalPush, pushTimeout()]);
}
