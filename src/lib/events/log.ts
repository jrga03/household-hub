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
import { describeEvent, projectEvent } from "./projector";

const VISIBILITIES = ["household", "personal"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  household: "Household",
  personal: "Personal",
};

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

/** Waiting to go out; refused by the server and held for the member; or on the server. */
export type PushState = "waiting" | "stuck" | "pushed";

export interface StoredEvent extends LoggedEvent {
  pushState: PushState;
  /** The server's reason, while stuck. */
  stuckReason?: string;
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
    await db.events.add({ ...event, pushState: "waiting" });
    await projectEntity(event);
    return event;
  });
}

const inPushState = (state: PushState) =>
  db.events.where("[pushState+hlc]").between([state, Dexie.minKey], [state, Dexie.maxKey]);

const toLogged = ({ pushState: _pushState, stuckReason: _stuckReason, ...event }: StoredEvent) =>
  event;

/** Oldest first, so the server sequence follows the order things happened here. */
export async function listUnpushed(limit: number): Promise<LoggedEvent[]> {
  const waiting = await inPushState("waiting").limit(limit).toArray();
  return waiting.map(toLogged);
}

/** Local changes not yet sent; stuck ones aren't counted. */
export const countWaiting = () => inPushState("waiting").count();

/** Every local change the server doesn't have, waiting or stuck, for an export before sign-out. */
export async function listEventsNotPushed(): Promise<StoredEvent[]> {
  const [waiting, stuck] = await Promise.all([
    inPushState("waiting").toArray(),
    inPushState("stuck").toArray(),
  ]);
  return [...waiting, ...stuck];
}

export interface StuckEvent {
  id: string;
  description: string;
  reason: string;
}

/** Changes the server refused, oldest first, each waiting for the member to retry or discard it. */
export async function listStuck(): Promise<StuckEvent[]> {
  const stuck = await inPushState("stuck").toArray();
  return Promise.all(
    stuck.map(async (event) => ({
      id: event.id,
      description: await describeEvent(event),
      reason: event.stuckReason ?? "",
    }))
  );
}

/** The server refused it for good: hold it until the member retries or discards it. */
export async function markStuck(eventId: string, reason: string): Promise<void> {
  await db.events.update(eventId, { pushState: "stuck", stuckReason: reason });
}

export async function requeueStuck(eventId: string): Promise<void> {
  await db.events
    .where("id")
    .equals(eventId)
    .and((event) => event.pushState === "stuck")
    .modify({ pushState: "waiting", stuckReason: undefined });
}

/**
 * Deletes a refused change and rebuilds its entity without it, as if it had
 * never been made. Only a stuck event can go: it never reached the server, so
 * no other device holds it.
 */
export function discardStuck(eventId: string): Promise<void> {
  return db.transaction("rw", logTables(), async () => {
    const stored = await db.events.get(eventId);
    if (stored?.pushState !== "stuck") return;
    await db.events.delete(eventId);
    await projectEntity(toLogged(stored));
  });
}

export async function markPushed(eventIds: string[]): Promise<void> {
  await db.events
    .where("id")
    .anyOf(eventIds)
    .modify({ pushState: "pushed", stuckReason: undefined });
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
        if (stored.pushState !== "pushed") await markPushed([event.id]);
        continue;
      }
      await db.events.add({ ...event, pushState: "pushed" });
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
