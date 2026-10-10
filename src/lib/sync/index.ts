import { reportError } from "@/lib/sentry";
import { createSyncEngine } from "./engine";
import { EventLogRejected, supabaseEventLog } from "./supabase-remote";
import { startSyncTriggers } from "./triggers";

const engine = createSyncEngine(supabaseEventLog);

// Unreachable is normal for an offline-first app; the next trigger retries.
// A refusal means something is wrong with the events or the membership.
function onSyncError(error: unknown) {
  if (error instanceof EventLogRejected) {
    reportError(error, { subsystem: "sync", operation: "sync", extra: { code: error.code } });
  } else {
    console.warn("Sync failed; it will retry on the next trigger.", error);
  }
}

let stopTriggers: (() => void) | null = null;

/** Starts syncing the signed-in member's household. Returns a stop function. */
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

const FINAL_PUSH_TIMEOUT_MS = 5000;

/**
 * Before the local store is wiped (sign-out): stop syncing, so nothing is
 * pulled into the fresh store, and give unpushed events one last push.
 */
export async function stopEventSyncForSignOut(): Promise<void> {
  stopTriggers?.();
  stopTriggers = null;
  engine.halt();
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, FINAL_PUSH_TIMEOUT_MS));
  const finalPush = engine.idle().then(() => engine.pushPending().catch(onSyncError));
  await Promise.race([finalPush, timeout]);
}
