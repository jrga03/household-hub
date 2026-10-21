import { loggedEvent } from "@/test/events";

export const FOOD = "bbbbbbbb-0000-4000-8000-000000000001";
export const BILLS = "bbbbbbbb-0000-4000-8000-000000000002";
export const GROCERIES = "cccccccc-0000-4000-8000-000000000001";

const categoryEvent = (
  eventId: string,
  entityType: "category" | "category_group",
  entityId: string,
  eventType: string,
  millis: number,
  payload: Record<string, unknown> = {}
) => loggedEvent({ id: eventId, entityType, entityId, eventType, millis, payload });

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
