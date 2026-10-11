/**
 * Push, then pull, then project (ADR 0001). The event log is the only thing
 * that syncs; projection happens as pulled events are received.
 */

import {
  listUnpushed,
  markPushed,
  markStuck,
  readPullCursor,
  receiveEvents,
  switchHousehold,
  type LoggedEvent,
} from "@/lib/events/log";

/** The server refused the events and will every time; a transient failure is a plain Error. */
export class EventLogRejected extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "EventLogRejected";
  }
}

export interface PulledEvent extends LoggedEvent {
  sequence: number;
}

export interface RemoteEventLog {
  /** Must ignore events the server already has, and throw EventLogRejected for a refusal that won't change. */
  push(events: LoggedEvent[]): Promise<void>;
  /** Events after `afterSequence`, in sequence order, at most `batchSize`. */
  pull(afterSequence: number, batchSize: number): Promise<PulledEvent[]>;
  /** The household the server says the member belongs to now, or null. */
  currentHouseholdId(): Promise<string | null>;
}

const DEFAULT_BATCH_SIZE = 500;

interface SyncEngineOptions {
  batchSize?: number;
  /** Called for each change the server refused for good. */
  onStuck?: (event: LoggedEvent, rejection: EventLogRejected) => void;
  /** Called when the member turns out to have left, been removed, or joined another household. */
  onHouseholdChanged?: () => void;
}

export function createSyncEngine(
  remote: RemoteEventLog,
  {
    batchSize = DEFAULT_BATCH_SIZE,
    onStuck = () => {},
    onHouseholdChanged = () => {},
  }: SyncEngineOptions = {}
) {
  let halted = false;

  /** Pushes `events`, returning the refusal instead of throwing it; other failures throw. */
  async function tryPush(events: LoggedEvent[]): Promise<EventLogRejected | null> {
    try {
      await remote.push(events);
    } catch (error) {
      if (error instanceof EventLogRejected) return error;
      throw error;
    }
    await markPushed(events.map((event) => event.id));
    return null;
  }

  async function pushAll() {
    for (;;) {
      const unpushed = await listUnpushed(batchSize);
      if (unpushed.length === 0) return;
      if ((await tryPush(unpushed)) === null) continue;
      // The server refuses a batch as a whole: send them one at a time to find which.
      for (const event of unpushed) {
        const rejection = await tryPush([event]);
        if (rejection === null) continue;
        await markStuck(event.id, rejection.message);
        onStuck(event, rejection);
      }
    }
  }

  /**
   * First in every sync: a different household means a different set of
   * events, from the start, and changes made in the old one can't go out.
   * Returns whether the member belongs to a household.
   */
  async function followMembership(): Promise<boolean> {
    const householdId = await remote.currentHouseholdId();
    if (halted) return false;
    if (await switchHousehold(householdId)) onHouseholdChanged();
    return householdId !== null;
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
      const isMember = await followMembership();
      // Without a household the server accepts nothing, so changes wait for the next one.
      // A failed push must not also cut the device off from everyone else's events.
      let pushFailure: unknown = null;
      try {
        if (isMember) await pushAll();
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
