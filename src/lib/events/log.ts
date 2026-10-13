/**
 * The device's replica of the event log (ADR 0001). Commands append; the sync
 * engine pushes what is unpushed and receives what it pulls. Every write
 * projects in the same transaction, so screens never see an event without
 * its effect.
 */

import Dexie from "dexie";
import { db, type MetaRow } from "@/lib/dexie/db";
import { forgetAllStatementPasswords } from "@/lib/import/remembered-passwords";
import { reportError } from "@/lib/sentry";
import { formatHlc, initialHlc, isHlc, parseHlc, receiveHlc, tickHlc, type Hlc } from "./hlc";
import {
  byHlc,
  describeEvent,
  isCreation,
  projectEvent,
  projectionTableNames,
  wipeProjections,
} from "./projector";

const VISIBILITIES = ["household", "personal"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  household: "Household",
  personal: "Personal",
};

/** Who sees a record: its visibility, and its owner when Personal. */
export interface Ownership {
  visibility: Visibility;
  ownerUserId: string | null;
}

export const sameOwnership = (a: Ownership, b: Ownership) =>
  a.visibility === b.visibility && a.ownerUserId === b.ownerUserId;

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

const logTables = () => [db.events.name, db.meta.name, ...projectionTableNames()];

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

async function readLeftHouseholdIds(): Promise<string[]> {
  const stored = await readMeta("leftHouseholdIds");
  return Array.isArray(stored) ? stored : [];
}

/**
 * Projects the entity from every event this device holds for it that has a
 * place in time, leaving out Household events of a household it has left.
 */
async function projectEntity(event: LoggedEvent): Promise<void> {
  const left = await readLeftHouseholdIds();
  const stored = await db.events.where("entityId").equals(event.entityId).toArray();
  const history = stored.filter(
    (candidate) =>
      candidate.entityType === event.entityType &&
      isHlc(candidate.hlc) &&
      !(candidate.visibility === "household" && left.includes(candidate.householdId))
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

/**
 * Records several changes as one: commands called inside `append` join its
 * transaction, so either every event is kept or, if any command refuses,
 * none is. Later commands see what earlier ones projected. Only commands call
 * this (lint-enforced).
 */
export function appendTogether<Result>(append: () => Promise<Result>): Promise<Result> {
  return db.transaction("rw", logTables(), append);
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

/** The whole local log as stored, oldest first, for an export. */
export async function listAllEvents(): Promise<StoredEvent[]> {
  const events = await db.events.toArray();
  return events.sort(byHlc);
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
 * no other device holds it. Discarding a create also drops the entity's other
 * unpushed changes, which would otherwise wait on something that never existed.
 */
export function discardStuck(eventId: string): Promise<void> {
  return db.transaction("rw", logTables(), async () => {
    const stored = await db.events.get(eventId);
    if (stored?.pushState !== "stuck") return;
    await db.events.delete(eventId);
    if (isCreation(stored)) {
      await db.events
        .where("entityId")
        .equals(stored.entityId)
        .and((event) => event.entityType === stored.entityType && event.pushState !== "pushed")
        .delete();
    }
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

const LEFT_HOUSEHOLD = "You're no longer a member of the household this change was made in.";

/**
 * Points the device at the household the server says the member belongs to
 * (null for none). Household events and projections of any other household
 * go, Personal ones stay, and the next pull starts from the beginning, since
 * the new household's events may sit below the old cursor. Returns whether
 * the device had recorded a different household.
 */
export function switchHousehold(householdId: string | null): Promise<boolean> {
  return db.transaction("rw", logTables(), async () => {
    const stored = await db.meta.get("householdId");
    if (stored?.value === householdId) return false;
    await db.meta.put({ key: "householdId", value: householdId });

    const isOtherHousehold = (record: { visibility: Visibility; householdId: string }) =>
      record.visibility === "household" && record.householdId !== householdId;
    const leftNow = (await db.events.filter(isOtherHousehold).toArray()).map(
      (event) => event.householdId
    );
    const left = new Set([...(await readLeftHouseholdIds()), ...leftNow]);
    if (typeof stored?.value === "string") left.add(stored.value);
    // Rejoining a household brings its changes back.
    if (householdId) left.delete(householdId);
    await db.meta.put({ key: "leftHouseholdIds", value: [...left] });

    await db.events
      .filter((event) => isOtherHousehold(event) && event.pushState === "pushed")
      .delete();
    // The server refuses them now; they stay for the sign-out export or a discard.
    await db.events
      .filter((event) => isOtherHousehold(event) && event.pushState === "waiting")
      .modify({ pushState: "stuck", stuckReason: LEFT_HOUSEHOLD });
    await wipeProjections(isOtherHousehold);
    await forgetAllStatementPasswords();
    await db.meta.put({ key: "pullCursor", value: 0 });
    return stored !== undefined;
  });
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
