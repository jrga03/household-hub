import { appendEvent } from "@/lib/events/log";
import { currentVersion, type EventVersions } from "@/lib/events/versions";
import type { Ownership } from "@/lib/accounts/paying-account";
import type { Actor } from "./accounts";

/** Binds an entity's type and version table, so its events can't be stamped from another's. */
export function appenderFor<Versions extends EventVersions>(
  entityType: string,
  versions: Versions
) {
  return (
    actor: Actor,
    owner: Ownership,
    entityId: string,
    eventType: keyof Versions & string,
    payload: Record<string, unknown>
  ) =>
    appendEvent({
      householdId: actor.householdId,
      visibility: owner.visibility,
      ownerUserId: owner.ownerUserId,
      entityType,
      entityId,
      eventType,
      eventVersion: currentVersion(versions, eventType),
      actorUserId: actor.userId,
      payload,
    });
}
