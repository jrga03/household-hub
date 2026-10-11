import { appendEvent, type Ownership } from "@/lib/events/log";
import { currentVersion, type EventVersions } from "@/lib/events/versions";
import type { Actor } from "./accounts";

/** Binds an entity's type and version table, so its events can't be stamped from another's. */
export function appenderFor<Versions extends EventVersions>(
  entityType: string,
  versions: Versions
) {
  return (
    actor: Actor,
    record: Ownership & { id: string },
    eventType: keyof Versions & string,
    payload: Record<string, unknown>
  ) =>
    appendEvent({
      householdId: actor.householdId,
      visibility: record.visibility,
      ownerUserId: record.ownerUserId,
      entityType,
      entityId: record.id,
      eventType,
      eventVersion: currentVersion(versions, eventType),
      actorUserId: actor.userId,
      payload,
    });
}
