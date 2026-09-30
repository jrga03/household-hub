import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/dexie/db";
import { createOfflineAccount, deactivateOfflineAccount, updateOfflineAccount } from "./accounts";

const userId = "12345678-1234-5678-1234-567812345678";

describe("offline accounts", () => {
  beforeEach(async () => {
    await db.accounts.clear();
    await db.syncQueue.clear();
  });

  it("creates an account with its own type and sort order, queued as a create", async () => {
    const result = await createOfflineAccount(
      {
        name: "GCash",
        type: "e-wallet",
        visibility: "household",
        initial_balance_cents: 5000,
        sort_order: 3,
      },
      userId
    );

    expect(result.success).toBe(true);
    const stored = await db.accounts.get(result.data!.id);
    expect(stored).toMatchObject({
      name: "GCash",
      type: "e-wallet",
      sort_order: 3,
      is_active: true,
    });
    const queue = await db.syncQueue.toArray();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ entity_type: "account", entity_id: result.data!.id });
    expect(queue[0].operation.op).toBe("create");
  });

  it("keeps e-wallet on update and queues one update", async () => {
    const created = await createOfflineAccount(
      { name: "Wallet", type: "cash", visibility: "household", initial_balance_cents: 0 },
      userId
    );
    await db.syncQueue.clear();

    const result = await updateOfflineAccount(created.data!.id, { type: "e-wallet" }, userId);

    expect(result.success).toBe(true);
    expect((await db.accounts.get(created.data!.id))?.type).toBe("e-wallet");
    const queue = await db.syncQueue.toArray();
    expect(queue).toHaveLength(1);
    expect(queue[0].operation.op).toBe("update");
  });

  it("deactivates by queueing an update with is_active false", async () => {
    const created = await createOfflineAccount(
      { name: "Old", type: "bank", visibility: "household", initial_balance_cents: 0 },
      userId
    );
    await db.syncQueue.clear();

    const result = await deactivateOfflineAccount(created.data!.id, userId);

    expect(result.success).toBe(true);
    expect((await db.accounts.get(created.data!.id))?.is_active).toBe(false);
    expect(await db.syncQueue.count()).toBe(1);
  });
});
