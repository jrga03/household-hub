/**
 * A device holding the pre-re-architecture database must start from an empty
 * local store. Seed the legacy database first, then import the app's db so its
 * startup runs against it. No static import of db.ts: that would open the new
 * database before the seed exists.
 */

import { describe, it, expect, beforeAll } from "vitest";
import Dexie from "dexie";

const LEGACY_V10_STORES = {
  transactions: "id, date, account_id, category_id, household_id",
  accounts: "id, name, visibility, household_id",
  syncQueue: "id, status, entity_type, entity_id",
  events: "id, entity_id, lamport_clock",
  meta: "key",
};

async function databaseExists(name: string): Promise<boolean> {
  const names = await Dexie.getDatabaseNames();
  return names.includes(name);
}

describe("opening the app over the legacy local database", () => {
  beforeAll(async () => {
    const legacy = new Dexie("HouseholdHubDB");
    legacy.version(10).stores(LEGACY_V10_STORES);
    await legacy.open();
    await legacy.table("accounts").add({ id: "acc-1", name: "Cash" });
    await legacy.table("syncQueue").add({ id: "q-1", status: "queued" });
    legacy.close();
  });

  it("deletes the legacy database and opens an empty store", async () => {
    expect(await databaseExists("HouseholdHubDB")).toBe(true);

    const { openLocalDatabase, db } = await import("./db");
    await openLocalDatabase();

    expect(await databaseExists("HouseholdHubDB")).toBe(false);
    expect(db.isOpen()).toBe(true);
    expect(db.tables).toHaveLength(0);
  });

  it("is safe to run again once the legacy database is gone", async () => {
    const { openLocalDatabase } = await import("./db");

    await expect(openLocalDatabase()).resolves.toBeUndefined();
  });
});
