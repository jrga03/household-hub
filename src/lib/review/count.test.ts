import { beforeEach, describe, expect, it } from "vitest";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents, type LoggedEvent } from "@/lib/events/log";
import { countReviewItems } from "./count";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const BANK = "aaaaaaaa-0000-4000-8000-000000000001";
const GROCERIES = "cccccccc-0000-4000-8000-000000000001";

let eventCount = 0;

function transactionEvent(
  entityId: string,
  eventType: string,
  payload: Record<string, unknown> = {}
): LoggedEvent {
  eventCount += 1;
  return {
    id: `e-${eventCount}`,
    householdId: HOUSEHOLD,
    visibility: "household",
    ownerUserId: null,
    entityType: "transaction",
    entityId,
    eventType,
    eventVersion: 1,
    hlc: `${String(1000 + eventCount).padStart(15, "0")}-000000-device-b`,
    deviceId: "device-b",
    actorUserId: "user-b",
    payload,
  };
}

const created = (
  entityId: string,
  details: { type: "expense" | "income"; categoryId: string | null }
) =>
  transactionEvent(entityId, "transaction.created", {
    date: "2026-10-12",
    amountCents: 25000,
    accountId: BANK,
    description: "Lunch",
    notes: "",
    status: "cleared",
    ...details,
  });

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("countReviewItems", () => {
  it("is zero with nothing recorded", async () => {
    expect(await countReviewItems()).toBe(0);
  });

  it("counts expenses with no category", async () => {
    await receiveEvents(
      [
        created("t-1", { type: "expense", categoryId: null }),
        created("t-2", { type: "expense", categoryId: null }),
        created("t-3", { type: "expense", categoryId: GROCERIES }),
        created("t-4", { type: "income", categoryId: null }),
      ],
      0
    );

    expect(await countReviewItems()).toBe(2);
  });

  it("leaves out removed expenses", async () => {
    await receiveEvents(
      [
        created("t-1", { type: "expense", categoryId: null }),
        transactionEvent("t-1", "transaction.removed"),
      ],
      0
    );

    expect(await countReviewItems()).toBe(0);
  });
});
