import type { LoggedEvent } from "@/lib/events/log";

export const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
export const FOOD = "bbbbbbbb-0000-4000-8000-000000000001";
export const BILLS = "bbbbbbbb-0000-4000-8000-000000000002";
export const GROCERIES = "cccccccc-0000-4000-8000-000000000001";

export const hlcAt = (millis: number, device = "device-b") =>
  `${String(millis).padStart(15, "0")}-000000-${device}`;

function categoryEvent(
  eventId: string,
  entityType: "category" | "category_group",
  entityId: string,
  eventType: string,
  millis: number,
  payload: Record<string, unknown> = {}
): LoggedEvent {
  return {
    id: eventId,
    householdId: HOUSEHOLD,
    visibility: "household",
    ownerUserId: null,
    entityType,
    entityId,
    eventType,
    eventVersion: 1,
    hlc: hlcAt(millis),
    deviceId: "device-b",
    actorUserId: "user-b",
    payload,
  };
}

export const groupEvent = (
  eventId: string,
  groupId: string,
  eventType: string,
  millis: number,
  payload: Record<string, unknown> = {}
) => categoryEvent(eventId, "category_group", groupId, eventType, millis, payload);

export const groceriesEvent = (
  eventId: string,
  eventType: string,
  millis: number,
  payload: Record<string, unknown> = {}
) => categoryEvent(eventId, "category", GROCERIES, eventType, millis, payload);
