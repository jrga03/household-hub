/**
 * Saved assistant chats arrive in version 12. Seed a version 11 store first, then
 * import the app's db so it upgrades that store.
 */

import { describe, it, expect, beforeAll } from "vitest";
import Dexie from "dexie";
import type { ChatItem } from "@/lib/assistant/conversation";

const VERSION_11_STORES = {
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
};

const chat: ChatItem[] = [{ kind: "user", text: "hi" }];

describe("upgrading a store from before saved assistant chats", () => {
  beforeAll(async () => {
    const before = new Dexie("household-hub");
    before.version(11).stores(VERSION_11_STORES);
    await before.open();
    await before.table("meta").add({ key: "deviceId", value: "device-a" });
    before.close();
  });

  it("keeps the existing rows and saves a member's chat", async () => {
    const { openLocalDatabase, db } = await import("./db");
    const { loadChat, saveChat } = await import("@/lib/assistant/savedChat");
    await openLocalDatabase();

    expect(await db.meta.get("deviceId")).toEqual({ key: "deviceId", value: "device-a" });
    await saveChat("user-a", chat, new Date("2026-10-17T01:00:00Z"));
    expect(await loadChat("user-a")).toEqual({
      items: chat,
      updatedAt: new Date("2026-10-17T01:00:00Z"),
    });
    expect(await loadChat("user-b")).toBeNull();
  });

  it("wipes saved chats on the sign-out reset", async () => {
    const { resetLocalDatabase } = await import("./reset");
    const { loadChat, saveChat } = await import("@/lib/assistant/savedChat");
    await saveChat("user-a", chat, new Date());

    await resetLocalDatabase();

    expect(await loadChat("user-a")).toBeNull();
  });
});
