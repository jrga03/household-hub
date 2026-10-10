/**
 * Account rows projected before retirement existed must still list. Seed a
 * version 2 store first, then import the app's db so it upgrades that store.
 */

import { describe, it, expect, beforeAll } from "vitest";
import Dexie from "dexie";

describe("upgrading a store with accounts projected before retirement", () => {
  beforeAll(async () => {
    const before = new Dexie("household-hub");
    before.version(2).stores({ events: "id, [pushed+hlc]", accounts: "id", meta: "key" });
    await before.open();
    await before.table("accounts").add({
      id: "aaaaaaaa-0000-4000-8000-000000000001",
      householdId: "11111111-1111-4111-8111-111111111111",
      visibility: "household",
      ownerUserId: null,
      name: "Cash",
      type: "cash",
      startingBalanceCents: 0,
      hlc: "000000000001000-000000-device-a",
      createdHlc: "000000000001000-000000-device-a",
    });
    before.close();
  });

  it("keeps them in the main list", async () => {
    const { openLocalDatabase } = await import("./db");
    const { listAccounts, listRetiredAccounts } = await import("@/lib/accounts/projection");
    await openLocalDatabase();

    expect(await listAccounts()).toEqual([
      {
        id: "aaaaaaaa-0000-4000-8000-000000000001",
        householdId: "11111111-1111-4111-8111-111111111111",
        visibility: "household",
        ownerUserId: null,
        name: "Cash",
        type: "cash",
        startingBalanceCents: 0,
        payingAccountId: null,
        retired: false,
      },
    ]);
    expect(await listRetiredAccounts()).toHaveLength(0);
  });
});
