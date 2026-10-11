import type { LoggedEvent } from "./log";

type Payload = Record<string, unknown>;

/**
 * Each event type's current version, and how to lift a payload of version N
 * to N + 1. Events are never rewritten, so old versions are translated on read.
 */
export type EventVersions = Record<
  string,
  { current: number; upcasts: Record<number, (payload: Payload) => Payload> }
>;

export const currentVersion = (versions: EventVersions, eventType: string): number =>
  versions[eventType]?.current ?? 0;

/** The event with its payload in its type's current version, or null for a version this app doesn't know. */
export function upcast(versions: EventVersions, event: LoggedEvent): LoggedEvent | null {
  const version = versions[event.eventType];
  if (!version || event.eventVersion < 1 || event.eventVersion > version.current) return null;
  let payload = event.payload;
  for (let from = event.eventVersion; from < version.current; from++) {
    const lift = version.upcasts[from];
    if (!lift) return null;
    payload = lift(payload);
  }
  return { ...event, eventVersion: version.current, payload };
}
