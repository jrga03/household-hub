import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/dexie/db";
import {
  commitDebtWriteSet,
  mergeWriteSets,
  prepareDebtCreate,
  prepareDebtUpdate,
  preparePaymentAdd,
} from "../outbox";
import { toDebtInsert } from "../payloads";
import { createTestDebt, createTestInternalDebt, createTestPayment } from "./test-utils";

const USER_ID = "12345678-1234-5678-1234-567812345678";

describe("debt write sets", () => {
  beforeEach(async () => {
    await Promise.all([
      db.debts.clear(),
      db.internalDebts.clear(),
      db.debtPayments.clear(),
      db.events.clear(),
      db.syncQueue.clear(),
    ]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("prepares a create with a server-shape payload and a matching local event", async () => {
    const debt = createTestDebt({ id: crypto.randomUUID() });
    const set = await prepareDebtCreate(debt, USER_ID);

    expect(set.debtPuts).toEqual([debt]);
    const [item] = set.queueItems;
    expect(item?.entity_type).toBe("debt");
    expect(item?.operation.payload).toEqual(toDebtInsert(debt));
    expect(set.events[0]?.idempotency_key).toBe(item?.operation.idempotencyKey);
    expect(await db.syncQueue.count()).toBe(0); // prepare never writes
  });

  it("routes internal debts by shape", async () => {
    const debt = createTestInternalDebt({ id: crypto.randomUUID() });
    const set = await prepareDebtCreate(debt, USER_ID);
    expect(set.internalDebtPuts).toEqual([debt]);
    expect(set.queueItems[0]?.entity_type).toBe("internal_debt");
  });

  it("queues only the changed columns on update", async () => {
    const before = createTestDebt({ id: crypto.randomUUID() });
    const after = { ...before, name: "Renamed", updated_at: "2026-10-06T01:00:00.000Z" };
    const set = await prepareDebtUpdate(before, after, USER_ID);
    expect(Object.keys(set.queueItems[0]?.operation.payload ?? {}).sort()).toEqual([
      "name",
      "updated_at",
    ]);
  });

  it("commits rows, events and queue items together", async () => {
    const debt = createTestDebt({ id: crypto.randomUUID() });
    const payment = createTestPayment({ id: crypto.randomUUID(), debt_id: debt.id });
    await commitDebtWriteSet(
      mergeWriteSets(
        await prepareDebtCreate(debt, USER_ID),
        await preparePaymentAdd(payment, USER_ID)
      )
    );
    expect(await db.debts.count()).toBe(1);
    expect(await db.debtPayments.count()).toBe(1);
    expect(await db.events.count()).toBe(2);
    expect(await db.syncQueue.count()).toBe(2);
  });

  it("writes nothing when the transaction throws", async () => {
    const debt = createTestDebt({ id: crypto.randomUUID() });
    const set = await prepareDebtCreate(debt, USER_ID);
    vi.spyOn(db.syncQueue, "bulkAdd").mockRejectedValueOnce(new Error("boom"));

    await expect(commitDebtWriteSet(set)).rejects.toThrow("boom");
    expect(await db.debts.count()).toBe(0);
    expect(await db.events.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });
});
