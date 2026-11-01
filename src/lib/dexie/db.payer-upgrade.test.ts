/**
 * Out-of-pocket payers arrive in version 13. Seed a version 12 store first, then
 * import the app's db so it upgrades that store.
 */

import { describe, it, expect, beforeAll } from "vitest";
import Dexie from "dexie";
import { loggedEvent } from "@/test/events";

const VERSION_12_STORES = {
  events: "id, [pushState+hlc], entityId",
  accounts: "id",
  meta: "key",
  categoryGroups: "id",
  categories: "id",
  transactions: "id, [date+recordedHlc]",
  allocations: "id, [date+recordedHlc]",
  transfers: "id, [date+recordedHlc]",
  budgets: "id",
  imports: "id",
  drafts: "id, importId",
  balanceCorrections: "id, [date+recordedHlc]",
  assistantChats: "userId",
};

const BANK = "aaaaaaaa-0000-4000-8000-000000000001";

const version12Row = {
  id: "t-old",
  householdId: "household-a",
  date: "2026-10-01",
  type: "expense",
  amountCents: 25000,
  accountId: BANK,
  categoryId: null,
  payingAccountId: null,
  description: "Lunch",
  notes: "",
  visibility: "household",
  ownerUserId: null,
  status: "pending",
  removed: false,
  recordedHlc: "0000000001000-0000-device-a",
  importKey: null,
};

describe("upgrading a store from before out-of-pocket payers", () => {
  beforeAll(async () => {
    const before = new Dexie("household-hub");
    before.version(12).stores(VERSION_12_STORES);
    await before.open();
    await before.table("transactions").add(version12Row);
    before.close();
  });

  it("gives existing transactions no payer and leaves them out of what is owed", async () => {
    const { openLocalDatabase, db } = await import("./db");
    const { readOwed } = await import("@/lib/review/count");
    await openLocalDatabase();

    expect(await db.transactions.get("t-old")).toEqual({ ...version12Row, paidByUserId: null });
    expect(await db.transactions.where("paidByUserId").equals("user-ana").count()).toBe(0);
    expect((await readOwed()).size).toBe(0);
  });

  it("finds an out-of-pocket expense recorded after the upgrade through the payer index", async () => {
    const { db } = await import("./db");
    const { receiveEvents } = await import("@/lib/events/log");
    const { readOwed } = await import("@/lib/review/count");

    await receiveEvents(
      [
        loggedEvent({
          id: "e-1",
          entityType: "transaction",
          entityId: "t-new",
          eventType: "transaction.created",
          millis: 2000,
          payload: {
            date: "2026-10-12",
            type: "expense",
            amountCents: 30000,
            accountId: BANK,
            categoryId: null,
            payingAccountId: null,
            description: "Groceries",
            notes: "",
            status: "pending",
            importKey: null,
            paidByUserId: "user-ana",
          },
          eventVersion: 4,
        }),
      ],
      0
    );

    expect(
      (await db.transactions.where("paidByUserId").equals("user-ana").toArray()).map(
        (row) => row.id
      )
    ).toEqual(["t-new"]);
    expect(await readOwed()).toEqual(new Map([["user-ana", { totalCents: 30000, count: 1 }]]));
  });
});
