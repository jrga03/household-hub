import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, type LocalTransaction } from "@/lib/dexie/db";
import { DEFAULT_HOUSEHOLD_ID } from "@/lib/household";
import type { SyncQueueItem } from "@/types/sync";
import { DEBT_ID_REPAIR_KEY, repairLegacyDebtIds } from "../repair";
import { createTestDebt, createTestInternalDebt, createTestPayment } from "./test-utils";
import { cents } from "@/test/cents";

const USER_ID = "12345678-1234-5678-1234-567812345678";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TX_ID = "8b5f8e0e-1111-4e5a-9a4e-0000000000aa";
const INTERNAL_TX_ID = "8b5f8e0e-2222-4e5a-9a4e-0000000000bb";
const OLD = "2026-09-01T00:00:00.000Z";

function queueItem(overrides: Partial<SyncQueueItem>): SyncQueueItem {
  return {
    id: crypto.randomUUID(),
    household_id: DEFAULT_HOUSEHOLD_ID,
    entity_type: "debt",
    entity_id: "legacy-debt",
    operation: { op: "create", payload: {}, idempotencyKey: "legacy-key", lamportClock: 1 },
    device_id: "device-1",
    user_id: USER_ID,
    status: "failed",
    retry_count: 0,
    max_retries: 3,
    error_message: "invalid input syntax for type uuid",
    created_at: OLD,
    updated_at: OLD,
    synced_at: null,
    next_retry_at: null,
    ...overrides,
  };
}

function linkedTransaction(): LocalTransaction {
  return {
    id: TX_ID,
    date: "2026-09-01",
    description: "Loan payment",
    amount_cents: cents(2500),
    type: "expense",
    status: "cleared",
    visibility: "household",
    tagged_user_ids: [],
    debt_id: "legacy-debt",
    household_id: DEFAULT_HOUSEHOLD_ID,
    currency_code: "PHP",
    created_by_user_id: USER_ID,
    device_id: "device-1",
    created_at: OLD,
    updated_at: OLD,
  };
}

async function seedLegacy() {
  await db.debts.add(createTestDebt({ id: "legacy-debt", household_id: DEFAULT_HOUSEHOLD_ID }));
  await db.debtPayments.bulkAdd([
    createTestPayment({
      id: "legacy-pay",
      debt_id: "legacy-debt",
      transaction_id: TX_ID,
      created_at: OLD,
    }),
    createTestPayment({
      id: "legacy-rev",
      debt_id: "legacy-debt",
      transaction_id: TX_ID,
      is_reversal: true,
      reverses_payment_id: "legacy-pay",
      created_at: "2026-09-02T00:00:00.000Z",
    }),
  ]);
  await db.internalDebts.add(
    createTestInternalDebt({ id: "legacy-idebt", household_id: DEFAULT_HOUSEHOLD_ID })
  );
  await db.debtPayments.add(
    createTestPayment({
      id: "legacy-ipay",
      debt_id: undefined,
      internal_debt_id: "legacy-idebt",
      created_at: "2026-09-03T00:00:00.000Z",
    })
  );
  await db.transactions.bulkAdd([
    linkedTransaction(),
    {
      ...linkedTransaction(),
      id: INTERNAL_TX_ID,
      debt_id: undefined,
      internal_debt_id: "legacy-idebt",
    },
  ]);
  await db.events.add({
    id: crypto.randomUUID(),
    household_id: DEFAULT_HOUSEHOLD_ID,
    entity_type: "debt",
    entity_id: "legacy-debt",
    op: "create",
    payload: {},
    idempotency_key: "legacy-key",
    event_version: 1,
    actor_user_id: USER_ID,
    device_id: "device-1",
    lamport_clock: 1,
    vector_clock: {},
    timestamp: OLD,
  });
  await db.syncQueue.bulkAdd([
    queueItem({}),
    queueItem({
      entity_type: "transaction",
      entity_id: TX_ID,
      operation: {
        op: "create",
        payload: { id: TX_ID, debt_id: "legacy-debt" },
        idempotencyKey: "tx-key",
        lamportClock: 1,
      },
      created_at: "2026-09-01T00:00:01.000Z",
    }),
    queueItem({
      entity_type: "transaction",
      entity_id: INTERNAL_TX_ID,
      status: "syncing",
      operation: {
        op: "create",
        payload: { id: INTERNAL_TX_ID, internal_debt_id: "legacy-idebt" },
        idempotencyKey: "itx-key",
        lamportClock: 1,
      },
      created_at: "2026-09-01T00:00:02.000Z",
    }),
  ]);
}

describe("repairLegacyDebtIds", () => {
  beforeEach(async () => {
    await Promise.all([
      db.debts.clear(),
      db.internalDebts.clear(),
      db.debtPayments.clear(),
      db.transactions.clear(),
      db.events.clear(),
      db.syncQueue.clear(),
      db.meta.clear(),
    ]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("with no debt rows only drops stale debt items and sets the flag", async () => {
    await db.syncQueue.add(queueItem({}));
    const result = await repairLegacyDebtIds(USER_ID);
    expect(result).toEqual({ ran: true, rekeyed: 0, queued: 0, rewrittenTransactionItems: 0 });
    expect(await db.syncQueue.count()).toBe(0);
    expect((await db.meta.get(DEBT_ID_REPAIR_KEY))?.value).toBe("done");
  });

  it("re-keys rows and every reference, and rebuilds the debt queue", async () => {
    await seedLegacy();
    const result = await repairLegacyDebtIds(USER_ID);
    expect(result).toMatchObject({
      ran: true,
      rekeyed: 5,
      queued: 5,
      rewrittenTransactionItems: 2,
    });

    const [debt] = await db.debts.toArray();
    expect(debt?.id).toMatch(UUID);
    const payments = await db.debtPayments.toArray();
    const original = payments.find((p) => !p.is_reversal && p.debt_id);
    const reversal = payments.find((p) => p.is_reversal);
    expect(original?.debt_id).toBe(debt?.id);
    expect(reversal?.reverses_payment_id).toBe(original?.id);
    expect((await db.transactions.get(TX_ID))?.debt_id).toBe(debt?.id);
    expect((await db.events.toArray())[0]?.entity_id).toBe(debt?.id);

    const [internalDebt] = await db.internalDebts.toArray();
    expect(internalDebt?.id).toMatch(UUID);
    const internalPayment = payments.find((p) => p.internal_debt_id);
    expect(internalPayment?.internal_debt_id).toBe(internalDebt?.id);
    expect((await db.transactions.get(INTERNAL_TX_ID))?.internal_debt_id).toBe(internalDebt?.id);

    const items = await db.syncQueue.toArray();
    items.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const firstTransactionIndex = items.findIndex((i) => i.entity_type === "transaction");
    const internalDebtIndex = items.findIndex((i) => i.entity_type === "internal_debt");
    expect(items[internalDebtIndex]?.entity_id).toBe(internalDebt?.id);
    expect(internalDebtIndex).toBeLessThan(firstTransactionIndex);
    expect(items.map((i) => i.entity_type)).toEqual([
      "debt",
      "internal_debt",
      "transaction",
      "transaction",
      "debt_payment",
      "debt_payment",
      "debt_payment",
    ]);
    const txItem = items[2];
    expect(txItem).toMatchObject({ status: "queued", retry_count: 0, next_retry_at: null });
    expect(txItem?.operation.payload.debt_id).toBe(debt?.id);
    const syncingItem = items[3];
    expect(syncingItem).toMatchObject({
      status: "queued",
      retry_count: 0,
      next_retry_at: null,
      error_message: null,
    });
    expect(syncingItem?.operation.payload.internal_debt_id).toBe(internalDebt?.id);
    expect(items[5]?.operation.payload.reverses_payment_id).toBe(original?.id);
    expect(items[4]?.operation.payload).not.toHaveProperty("idempotency_key");
  });

  it("concurrent runs share one repair", async () => {
    await seedLegacy();
    await Promise.all([repairLegacyDebtIds(USER_ID), repairLegacyDebtIds(USER_ID)]);
    const debts = await db.debts.toArray();
    expect(debts).toHaveLength(1);
    expect(await db.debtPayments.count()).toBe(3);
    expect((await db.transactions.get(TX_ID))?.debt_id).toBe(debts[0]?.id);
    const debtCreates = await db.syncQueue.where("entity_type").equals("debt").toArray();
    expect(debtCreates).toHaveLength(1);
  });

  it("is a no-op on the second run", async () => {
    await seedLegacy();
    await repairLegacyDebtIds(USER_ID);
    const before = await db.syncQueue.count();
    expect((await repairLegacyDebtIds(USER_ID)).ran).toBe(false);
    expect(await db.syncQueue.count()).toBe(before);
  });

  it("writes nothing and leaves the flag unset when the transaction throws", async () => {
    await seedLegacy();
    vi.spyOn(db.syncQueue, "bulkAdd").mockRejectedValueOnce(new Error("boom"));
    await expect(repairLegacyDebtIds(USER_ID)).rejects.toThrow("boom");
    expect(await db.debts.get("legacy-debt")).toBeDefined();
    expect(await db.meta.get(DEBT_ID_REPAIR_KEY)).toBeUndefined();
    expect(await db.syncQueue.count()).toBe(3);
  });
});
