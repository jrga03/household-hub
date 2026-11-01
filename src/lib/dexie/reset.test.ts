import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { claimLocalData, resetLocalDatabase } from "./reset";

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
});
