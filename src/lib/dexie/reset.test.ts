import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { claimLocalData, resetLocalDatabase } from "./reset";
import type { StoredEvent } from "@/lib/events/log";

const event = (overrides: Partial<StoredEvent>): StoredEvent => ({
  id: crypto.randomUUID(),
  householdId: "household-1",
  visibility: "household",
  ownerUserId: null,
  entityType: "account",
  entityId: "account-1",
  eventType: "account.created",
  eventVersion: 1,
  hlc: "0",
  deviceId: "device-1",
  actorUserId: "member-a",
  payload: {},
  pushState: "pushed",
  ...overrides,
});

const keepsData = async () => (await db.meta.get("deviceId"))?.value === "device-1";

describe("claimLocalData", () => {
  beforeEach(async () => {
    await resetLocalDatabase();
    await db.meta.put({ key: "deviceId", value: "device-1" });
  });

  it("keeps a fresh device's data on its first sign-in", async () => {
    await claimLocalData("member-a");

    expect(await keepsData()).toBe(true);
  });

  it("keeps the data when the same member signs in again", async () => {
    await claimLocalData("member-a");
    await claimLocalData("member-a");

    expect(await keepsData()).toBe(true);
  });

  it("wipes the data when a different member signs in", async () => {
    await claimLocalData("member-a");
    await claimLocalData("member-b");

    expect(await keepsData()).toBe(false);
  });

  it("keeps the next member's data after a wipe", async () => {
    await claimLocalData("member-a");
    await claimLocalData("member-b");
    await db.meta.put({ key: "deviceId", value: "device-1" });
    await claimLocalData("member-b");

    expect(await keepsData()).toBe(true);
  });

  describe("on a device that holds data from before owners were recorded", () => {
    it("keeps the household's synced changes, whoever made them", async () => {
      await db.events.bulkAdd([
        event({ actorUserId: "member-a" }),
        event({ actorUserId: "member-b" }),
      ]);

      await claimLocalData("member-b");

      expect(await keepsData()).toBe(true);
    });

    it("wipes another member's Personal records", async () => {
      await db.events.add(event({ visibility: "personal", ownerUserId: "member-a" }));

      await claimLocalData("member-b");

      expect(await keepsData()).toBe(false);
    });

    it("wipes another member's unsent changes", async () => {
      await db.events.add(event({ actorUserId: "member-a", pushState: "waiting" }));

      await claimLocalData("member-b");

      expect(await keepsData()).toBe(false);
    });

    it("keeps the member's own unsent changes", async () => {
      await db.events.add(event({ actorUserId: "member-a", pushState: "stuck" }));

      await claimLocalData("member-a");

      expect(await keepsData()).toBe(true);
    });
  });
});
