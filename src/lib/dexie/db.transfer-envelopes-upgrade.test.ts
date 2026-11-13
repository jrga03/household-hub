/**
 * A transfer's arrival envelope arrives in version 15. Seed a version 14 store
 * first, then import the app's db so it upgrades that store.
 */

import { describe, it, expect, beforeAll } from "vitest";
import Dexie from "dexie";

const VERSION_14_STORES = {
  events: "id, [pushState+hlc], entityId",
  accounts: "id",
  meta: "key",
  categoryGroups: "id",
  categories: "id",
  transactions: "id, [date+recordedHlc], paidByUserId",
  allocations: "id, [date+recordedHlc]",
  transfers: "id, [date+recordedHlc]",
  budgets: "id",
  imports: "id",
  drafts: "id, importId",
  balanceCorrections: "id, [date+recordedHlc]",
  assistantChats: "userId",
  discards: "importKey, discardedAt",
};

const groceries = { kind: "category", id: "cccccccc-0000-4000-8000-000000000001" };

/** A version 14 row, less the envelope it held for both sides. */
const version14Fields = {
  id: "f-old",
  householdId: "household-a",
  date: "2026-10-01",
  amountCents: 25000,
  fromAccountId: "aaaaaaaa-0000-4000-8000-000000000001",
  toAccountId: "aaaaaaaa-0000-4000-8000-000000000002",
  description: "",
  notes: "",
  visibility: "household",
  ownerUserId: null,
  status: "cleared",
  removed: false,
  recordedHlc: "0000000001000-0000-device-a",
};

describe("upgrading a store from before a transfer's arrival envelope", () => {
  beforeAll(async () => {
    const before = new Dexie("household-hub");
    before.version(14).stores(VERSION_14_STORES);
    await before.open();
    await before.table("transfers").add({ ...version14Fields, envelope: groceries });
    before.close();
  });

  it("has an existing transfer arrive in the envelope it left", async () => {
    const { openLocalDatabase, db } = await import("./db");
    await openLocalDatabase();

    expect(await db.transfers.get("f-old")).toEqual({
      ...version14Fields,
      fromEnvelope: groceries,
      toEnvelope: groceries,
    });
  });
});
