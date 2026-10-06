import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, type LocalAccount } from "@/lib/dexie/db";
import { createExternalDebt, createInternalDebt, deleteDebt, updateDebtName } from "../crud";
import { cents } from "@/test/cents";

const USER_ID = "12345678-1234-5678-1234-567812345678";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function account(id: string): LocalAccount {
  const now = "2026-10-01T00:00:00.000Z";
  return {
    id,
    household_id: "household-1",
    name: id,
    type: "bank",
    initial_balance_cents: cents(0),
    currency_code: "PHP",
    visibility: "household",
    color: "#3B82F6",
    icon: "wallet",
    sort_order: 0,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
}

describe("debt CRUD outbox writes", () => {
  beforeEach(async () => {
    await Promise.all([
      db.debts.clear(),
      db.internalDebts.clear(),
      db.debtPayments.clear(),
      db.events.clear(),
      db.syncQueue.clear(),
      db.accounts.clear(),
    ]);
  });
  afterEach(() => vi.restoreAllMocks());

  const input = {
    name: "Car Loan",
    original_amount_cents: cents(500000),
    household_id: "household-1",
  };

  it("creates an external debt with a UUID, one event and one create item", async () => {
    const debt = await createExternalDebt(input, USER_ID);
    expect(debt.id).toMatch(UUID);
    const [item] = await db.syncQueue.toArray();
    expect(item).toMatchObject({ entity_type: "debt", entity_id: debt.id, user_id: USER_ID });
    expect(item?.operation.op).toBe("create");
    expect(await db.events.where("entity_id").equals(debt.id).count()).toBe(1);
  });

  it("creates an internal debt atomically", async () => {
    await db.accounts.bulkAdd([account("acc-from"), account("acc-to")]);
    const debt = await createInternalDebt(
      { ...input, from_type: "account", from_id: "acc-from", to_type: "account", to_id: "acc-to" },
      USER_ID
    );
    expect(debt.id).toMatch(UUID);
    expect((await db.syncQueue.toArray()).map((i) => i.entity_type)).toEqual(["internal_debt"]);
  });

  it("leaves nothing behind when the create transaction throws", async () => {
    vi.spyOn(db.syncQueue, "bulkAdd").mockRejectedValueOnce(new Error("boom"));
    await expect(createExternalDebt(input, USER_ID)).rejects.toThrow("boom");
    expect(await db.debts.count()).toBe(0);
    expect(await db.events.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it("queues an update with the changed columns only", async () => {
    const debt = await createExternalDebt(input, USER_ID);
    await db.syncQueue.clear();
    await updateDebtName(debt.id, "external", "Truck Loan", USER_ID);
    const [item] = await db.syncQueue.toArray();
    expect(item?.operation.op).toBe("update");
    expect(Object.keys(item?.operation.payload ?? {}).sort()).toEqual(["name", "updated_at"]);
    expect((await db.debts.get(debt.id))?.name).toBe("Truck Loan");
  });

  it("queues a delete and removes the row", async () => {
    const debt = await createExternalDebt(input, USER_ID);
    await db.syncQueue.clear();
    await deleteDebt(debt.id, "external", USER_ID);
    expect(await db.debts.get(debt.id)).toBeUndefined();
    expect((await db.syncQueue.toArray())[0]?.operation).toMatchObject({
      op: "delete",
      payload: { id: debt.id },
    });
  });
});
