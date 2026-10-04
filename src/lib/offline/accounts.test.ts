import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/dexie/db";
import { createOfflineAccount, deactivateOfflineAccount, updateOfflineAccount } from "./accounts";
import { cents } from "@/test/cents";

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
        initial_balance_cents: cents(5000),
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
    expect(queue[0]!.operation.op).toBe("create");
  });

  it("keeps e-wallet on update and queues one update", async () => {
    const created = await createOfflineAccount(
      { name: "Wallet", type: "cash", visibility: "household", initial_balance_cents: cents(0) },
      userId
    );
    await db.syncQueue.clear();

    const result = await updateOfflineAccount(created.data!.id, { type: "e-wallet" }, userId);

    expect(result.success).toBe(true);
    expect((await db.accounts.get(created.data!.id))?.type).toBe("e-wallet");
    const queue = await db.syncQueue.toArray();
    expect(queue).toHaveLength(1);
    expect(queue[0]!.operation.op).toBe("update");
  });

  it("queues a cleared owner_user_id when a personal account becomes household", async () => {
    const created = await createOfflineAccount(
      { name: "Mine", type: "bank", visibility: "personal", initial_balance_cents: cents(0) },
      userId
    );
    await db.syncQueue.clear();

    const result = await updateOfflineAccount(
      created.data!.id,
      { visibility: "household" },
      userId
    );

    expect(result.success).toBe(true);
    const queued = (await db.syncQueue.toArray())[0]!;
    expect(queued.operation.payload).toHaveProperty("owner_user_id", undefined);
    expect(queued.operation.payload.visibility).toBe("household");
  });

  it("deactivates by queueing an update with is_active false", async () => {
    const created = await createOfflineAccount(
      { name: "Old", type: "bank", visibility: "household", initial_balance_cents: cents(0) },
      userId
    );
    await db.syncQueue.clear();

    const result = await deactivateOfflineAccount(created.data!.id, userId);

    expect(result.success).toBe(true);
    expect((await db.accounts.get(created.data!.id))?.is_active).toBe(false);
    expect(await db.syncQueue.count()).toBe(1);
  });

  describe("duplicate names", () => {
    const base = {
      type: "bank" as const,
      visibility: "household" as const,
      initial_balance_cents: cents(0),
    };

    it("rejects a create whose name matches an active account, ignoring case", async () => {
      await createOfflineAccount({ ...base, name: "BDO Savings" }, userId);
      await db.syncQueue.clear();

      const result = await createOfflineAccount({ ...base, name: "  bdo savings " }, userId);

      expect(result).toMatchObject({
        success: false,
        error: 'An account named "bdo savings" already exists',
      });
      expect(await db.accounts.count()).toBe(1);
      expect(await db.syncQueue.count()).toBe(0);
    });

    it("rejects reusing the name of an archived account (the server constraint is not partial)", async () => {
      const old = await createOfflineAccount({ ...base, name: "Cash" }, userId);
      await deactivateOfflineAccount(old.data!.id, userId);
      await db.syncQueue.clear();

      const result = await createOfflineAccount({ ...base, name: "cash" }, userId);

      expect(result).toMatchObject({
        success: false,
        error: 'An archived account named "cash" already exists. Choose another name.',
      });
      expect(await db.syncQueue.count()).toBe(0);
    });

    it("rejects renaming onto an archived account's name", async () => {
      const old = await createOfflineAccount({ ...base, name: "Cash" }, userId);
      await deactivateOfflineAccount(old.data!.id, userId);
      const other = await createOfflineAccount({ ...base, name: "Wallet" }, userId);

      const result = await updateOfflineAccount(other.data!.id, { name: "Cash" }, userId);

      expect(result).toMatchObject({
        success: false,
        error: 'An archived account named "Cash" already exists. Choose another name.',
      });
    });

    it("rejects renaming onto another active account's name", async () => {
      await createOfflineAccount({ ...base, name: "BPI" }, userId);
      const other = await createOfflineAccount({ ...base, name: "Metrobank" }, userId);
      await db.syncQueue.clear();

      const result = await updateOfflineAccount(other.data!.id, { name: "bpi" }, userId);

      expect(result).toMatchObject({
        success: false,
        error: 'An account named "bpi" already exists',
      });
      expect((await db.accounts.get(other.data!.id))?.name).toBe("Metrobank");
      expect(await db.syncQueue.count()).toBe(0);
    });

    it("allows an update that keeps the account's own name", async () => {
      const created = await createOfflineAccount({ ...base, name: "BPI" }, userId);

      const result = await updateOfflineAccount(
        created.data!.id,
        { name: "BPI", color: "#000000" },
        userId
      );

      expect(result.success).toBe(true);
    });
  });
});
