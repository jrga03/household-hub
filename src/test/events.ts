import { formatHlc } from "@/lib/events/hlc";
import type { LoggedEvent } from "@/lib/events/log";

export const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";

export const hlcAt = (millis: number, device = "device-b", counter = 0) =>
  formatHlc({ wallTime: millis, counter, deviceId: device });

export interface EventFields {
  id: string;
  entityType: string;
  entityId: string;
  eventType: string;
  millis: number;
  payload?: Record<string, unknown>;
  eventVersion?: number;
  device?: string;
  counter?: number;
  householdId?: string;
  visibility?: LoggedEvent["visibility"];
  ownerUserId?: LoggedEvent["ownerUserId"];
}

/** An event recorded by `device` at `millis`, as another device would receive it. */
export function loggedEvent({
  id,
  entityType,
  entityId,
  eventType,
  millis,
  payload = {},
  eventVersion = 1,
  device = "device-b",
  counter = 0,
  householdId = HOUSEHOLD,
  visibility = "household",
  ownerUserId = null,
}: EventFields): LoggedEvent {
  return {
    id,
    householdId,
    visibility,
    ownerUserId,
    entityType,
    entityId,
    eventType,
    eventVersion,
    hlc: hlcAt(millis, device, counter),
    deviceId: device,
    actorUserId: "user-b",
    payload,
  };
}
