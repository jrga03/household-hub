/**
 * Push, then pull, then project (ADR 0001). The event log is the only thing
 * that syncs; projection happens as pulled events are received.
 */

import {
  listUnpushed,
  markPushed,
  readPullCursor,
  receiveEvents,
  type LoggedEvent,
} from "@/lib/events/log";

export interface PulledEvent extends LoggedEvent {
  sequence: number;
}

export interface RemoteEventLog {
  /** Must ignore events the server already has. */
  push(events: LoggedEvent[]): Promise<void>;
  /** Events after `afterSequence`, in sequence order, at most `batchSize`. */
  pull(afterSequence: number, batchSize: number): Promise<PulledEvent[]>;
}

const DEFAULT_BATCH_SIZE = 500;

export function createSyncEngine(remote: RemoteEventLog, { batchSize = DEFAULT_BATCH_SIZE } = {}) {
  let halted = false;

  async function pushAll() {
    for (;;) {
      const unpushed = await listUnpushed(batchSize);
      if (unpushed.length === 0) return;
      await remote.push(unpushed);
      await markPushed(unpushed.map((event) => event.id));
    }
  }

  async function pullAll() {
    let cursor = await readPullCursor();
    for (;;) {
      const pulled = await remote.pull(cursor, batchSize);
      const last = pulled.at(-1);
      if (!last || halted) return;
      const events = pulled.map(({ sequence: _sequence, ...event }) => event);
      await receiveEvents(events, last.sequence);
      cursor = last.sequence;
      if (pulled.length < batchSize) return;
    }
  }

  let running: Promise<void> | null = null;
  let runAgain = false;

  async function run() {
    do {
      runAgain = false;
      // A refused push must not also cut the device off from everyone else's events.
      let pushFailure: unknown = null;
      try {
        await pushAll();
      } catch (error) {
        pushFailure = error;
      }
      await pullAll();
      if (pushFailure) throw pushFailure;
    } while (runAgain);
  }

  /** One sync at a time; a call during a sync makes it go round once more. */
  function sync(): Promise<void> {
    if (halted) return Promise.resolve();
    if (running) {
      runAgain = true;
      return running;
    }
    running = run().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    sync,
    /** Pushes without pulling, so it is safe while halted. */
    pushPending: pushAll,
    /** Stops syncing, including writing a pull already in flight; for wiping the local store. */
    halt() {
      halted = true;
    },
    resume() {
      halted = false;
    },
    /** Settles once no sync is running, whatever its outcome. */
    async idle() {
      await running?.catch(() => {});
    },
  };
}
