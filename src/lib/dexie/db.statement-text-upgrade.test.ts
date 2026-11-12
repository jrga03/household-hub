/**
 * Statement Text and pins arrive in version 14. Seed a version 13 store first, then
 * import the app's db so it upgrades that store.
 */

import { describe, it, expect, beforeAll } from "vitest";
import Dexie from "dexie";

const VERSION_13_STORES = {
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
};

const version13Row = {
  id: "t-old",
  householdId: "household-a",
  date: "2026-10-01",
  type: "expense",
  amountCents: 25000,
  accountId: "aaaaaaaa-0000-4000-8000-000000000001",
  categoryId: null,
  payingAccountId: null,
  description: "Lunch",
  notes: "",
  visibility: "household",
  ownerUserId: null,
  status: "cleared",
  removed: false,
  recordedHlc: "0000000001000-0000-device-a",
  importKey: null,
  paidByUserId: null,
};

describe("upgrading a store from before Statement Text", () => {
  beforeAll(async () => {
    const before = new Dexie("household-hub");
    before.version(13).stores(VERSION_13_STORES);
    await before.open();
    await before.table("transactions").add(version13Row);
    before.close();
  });

  it("gives existing transactions no Statement Text and no pin", async () => {
    const { openLocalDatabase, db } = await import("./db");
    await openLocalDatabase();

    expect(await db.transactions.get("t-old")).toEqual({
      ...version13Row,
      statementText: null,
      pinned: false,
    });
  });
});
