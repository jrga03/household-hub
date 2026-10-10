/**
 * The device's replica of the event log (ADR 0001). Commands append; the sync
 * engine pushes what is unpushed and receives what it pulls. Every write
 * projects in the same transaction, so screens never see an event without
 * its effect.
 */

import Dexie from "dexie";
import { db, type MetaRow } from "@/lib/dexie/db";
import { reportError } from "@/lib/sentry";
import { formatHlc, initialHlc, isHlc, parseHlc, receiveHlc, tickHlc, type Hlc } from "./hlc";
import { projectEvent } from "./projector";

const VISIBILITIES = ["household", "personal"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const isVisibility = (value: string): value is Visibility =>
  VISIBILITIES.some((visibility) => visibility === value);

export interface LoggedEvent {
  id: string;
  householdId: string;
  visibility: Visibility;
  ownerUserId: string | null;
  entityType: string;
  entityId: string;
  eventType: string;
  eventVersion: number;
  hlc: string;
  deviceId: string;
  actorUserId: string;
  payload: Record<string, unknown>;
}

/** IndexedDB can't index booleans. */
export interface StoredEvent extends LoggedEvent {
  pushed: 0 | 1;
}

export type EventDraft = Omit<LoggedEvent, "id" | "hlc" | "deviceId">;

const logTables = () => [db.events, db.accounts, db.meta];

async function readMeta(key: MetaRow["key"]) {
  return (await db.meta.get(key))?.value;
}

async function deviceId(): Promise<string> {
  const stored = await readMeta("deviceId");
  if (typeof stored === "string") return stored;
  const created = crypto.randomUUID();
  await db.meta.put({ key: "deviceId", value: created });
  return created;
}

async function readClock(): Promise<Hlc> {
  const stored = await readMeta("clock");
  return typeof stored === "string" ? parseHlc(stored) : initialHlc(await deviceId());
}

const writeClock = (clock: Hlc) => db.meta.put({ key: "clock", value: formatHlc(clock) });

/** Projects the entity from every event this device holds for it that has a place in time. */
async function projectEntity(event: LoggedEvent): Promise<void> {
  const stored = await db.events.where("entityId").equals(event.entityId).toArray();
  const history = stored.filter(
    (candidate) => candidate.entityType === event.entityType && isHlc(candidate.hlc)
  );
  await projectEvent(event, history);
}

/** Records a local change and projects it. Only commands call this (lint-enforced). */
export function appendEvent(draft: EventDraft): Promise<LoggedEvent> {
  return db.transaction("rw", logTables(), async () => {
    const clock = tickHlc(await readClock(), Date.now());
    await writeClock(clock);
    const event: LoggedEvent = {
      ...draft,
      id: crypto.randomUUID(),
      hlc: formatHlc(clock),
      deviceId: clock.deviceId,
    };
    await db.events.add({ ...event, pushed: 0 });
    await projectEntity(event);
    return event;
  });
}

/** Oldest first, so the server sequence follows the order things happened here. */
export async function listUnpushed(limit: number): Promise<LoggedEvent[]> {
  const unpushed = await db.events
    .where("[pushed+hlc]")
    .between([0, Dexie.minKey], [0, Dexie.maxKey])
    .limit(limit)
    .toArray();
  return unpushed.map(({ pushed: _pushed, ...event }) => event);
}

export async function markPushed(eventIds: string[]): Promise<void> {
  await db.events.where("id").anyOf(eventIds).modify({ pushed: 1 });
}

export async function readPullCursor(): Promise<number> {
  const stored = await readMeta("pullCursor");
  return typeof stored === "number" ? stored : 0;
}

/**
 * Stores pulled events this device doesn't have, projects them, and moves the
 * pull cursor, in one transaction: a crash never leaves the cursor past an
 * event that wasn't projected.
 */
export function receiveEvents(events: LoggedEvent[], pulledThrough: number): Promise<void> {
  return db.transaction("rw", logTables(), async () => {
    let clock = await readClock();
    for (const event of events) {
      const stored = await db.events.get(event.id);
      if (stored) {
        // Our own event coming back: the push landed even if marking it didn't.
        if (stored.pushed === 0) await db.events.update(event.id, { pushed: 1 });
        continue;
      }
      await db.events.add({ ...event, pushed: 1 });
      try {
        clock = receiveHlc(clock, parseHlc(event.hlc), Date.now());
      } catch (error) {
        // Kept in the log, but its place in time is unknown, so it can't be projected.
        reportError(error, {
          subsystem: "event-log",
          operation: "receive",
          extra: { id: event.id },
        });
        continue;
      }
      await projectEntity(event);
    }
    await writeClock(clock);
    if (pulledThrough > (await readPullCursor())) {
      await db.meta.put({ key: "pullCursor", value: pulledThrough });
    }
  });
}
