import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/dexie/db";
import { createExternalDebt } from "@/lib/debts/crud";
import { DEFAULT_HOUSEHOLD_ID } from "@/lib/household";
import {
  createOfflineTransaction,
  deleteOfflineTransaction,
  updateOfflineTransaction,
} from "./transactions";
import { cents } from "@/test/cents";

vi.mock("@/lib/supabase", () => {
  const supabase = {
    from: vi.fn(),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
  };
  return { supabase, untypedSupabase: supabase };
});

const USER_ID = "12345678-1234-5678-1234-567812345678";

async function queuedTypes() {
  const items = await db.syncQueue.toArray();
  items.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return items.map((item) => `${item.entity_type}:${item.operation.op}`);
}

async function linkedTransaction(debtId: string) {
  const result = await createOfflineTransaction(
    {
      date: "2026-10-06",
      description: "Loan payment",
      amount_cents: cents(2500),
      type: "expense",
      status: "cleared",
      visibility: "household",
      debt_id: debtId,
    },
    USER_ID
  );
  if (!result.success || !result.data) throw new Error(result.error);
  return result.data;
}

describe("transaction writes with a debt link", () => {
  let debtId = "";

  beforeEach(async () => {
    await Promise.all([
      db.transactions.clear(),
      db.debts.clear(),
      db.debtPayments.clear(),
      db.events.clear(),
      db.syncQueue.clear(),
    ]);
    const debt = await createExternalDebt(
      { name: "Loan", original_amount_cents: cents(10000), household_id: DEFAULT_HOUSEHOLD_ID },
      USER_ID
    );
    debtId = debt.id;
    await db.syncQueue.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it("queues the transaction before its payment", async () => {
    await linkedTransaction(debtId);
    expect(await queuedTypes()).toEqual(["transaction:create", "debt_payment:create"]);
  });

  it("writes nothing when the debt payment cannot be prepared", async () => {
    const result = await createOfflineTransaction(
      {
        date: "2026-10-06",
        description: "x",
        amount_cents: cents(100),
        type: "expense",
        status: "cleared",
        visibility: "household",
        debt_id: crypto.randomUUID(),
      },
      USER_ID
    );
    expect(result.success).toBe(false);
    expect(await db.transactions.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it("writes nothing when the combined transaction throws", async () => {
    vi.spyOn(db.debtPayments, "bulkAdd").mockRejectedValueOnce(new Error("boom"));
    const result = await createOfflineTransaction(
      {
        date: "2026-10-06",
        description: "x",
        amount_cents: cents(100),
        type: "expense",
        status: "cleared",
        visibility: "household",
        debt_id: debtId,
      },
      USER_ID
    );
    expect(result.success).toBe(false);
    expect(await db.transactions.count()).toBe(0);
    expect(await db.debtPayments.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it("reverses the payment when the debt link is removed", async () => {
    const tx = await linkedTransaction(debtId);
    await db.syncQueue.clear();
    const result = await updateOfflineTransaction(tx.id, { debt_id: null }, USER_ID);
    expect(result.success).toBe(true);
    expect(await queuedTypes()).toEqual(["debt_payment:create", "transaction:update"]);
    const reversal = (await db.debtPayments.toArray()).find((p) => p.is_reversal);
    expect(reversal?.amount_cents).toBe(-2500);
  });

  it("queues the debt items of an amount edit before the transaction update", async () => {
    const tx = await linkedTransaction(debtId);
    await db.syncQueue.clear();
    await updateOfflineTransaction(tx.id, { amount_cents: cents(3000) }, USER_ID);

    const items = await db.syncQueue.toArray();
    const update = items.find((item) => item.entity_type === "transaction");
    const debtItems = items.filter((item) => item.entity_type !== "transaction");
    expect(update).toBeDefined();
    expect(debtItems.length).toBeGreaterThan(0);
    for (const item of debtItems) {
      expect(item.created_at < (update?.created_at ?? "")).toBe(true);
    }
    const edited = await db.transactions.get(tx.id);
    const payments = await db.debtPayments.toArray();
    for (const payment of payments) {
      expect(new Date(payment.created_at).getTime()).toBeLessThanOrEqual(
        new Date(edited?.updated_at ?? 0).getTime()
      );
    }
  });

  it("queues the reversal before the transaction delete", async () => {
    const tx = await linkedTransaction(debtId);
    await db.syncQueue.clear();
    const result = await deleteOfflineTransaction(tx.id, USER_ID);
    expect(result.success).toBe(true);
    expect(await queuedTypes()).toEqual(["debt_payment:create", "transaction:delete"]);
    expect(await db.transactions.get(tx.id)).toBeUndefined();
  });
});
