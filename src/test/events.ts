import type { LoggedEvent } from "@/lib/events/log";

export const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";

export const hlcAt = (millis: number, device = "device-b") =>
  `${String(millis).padStart(15, "0")}-000000-${device}`;

interface EventFields {
  id: string;
  entityType: string;
  entityId: string;
  eventType: string;
  millis: number;
  payload?: Record<string, unknown>;
  eventVersion?: number;
  device?: string;
}

/** A household event recorded by `device` at `millis`, as another device would receive it. */
export function loggedEvent({
  id,
  entityType,
  entityId,
  eventType,
  millis,
  payload = {},
  eventVersion = 1,
  device = "device-b",
}: EventFields): LoggedEvent {
  return {
    id,
    householdId: HOUSEHOLD,
    visibility: "household",
    ownerUserId: null,
    entityType,
    entityId,
    eventType,
    eventVersion,
    hlc: hlcAt(millis, device),
    deviceId: device,
    actorUserId: "user-b",
    payload,
  };
}
