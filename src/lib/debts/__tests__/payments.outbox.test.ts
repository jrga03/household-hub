import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/dexie/db";
import { createExternalDebt } from "../crud";
import { processDebtPayment } from "../payments";
import { handleTransactionEdit, reverseDebtPayment } from "../reversals";
import { cents } from "@/test/cents";

const USER_ID = "12345678-1234-5678-1234-567812345678";

async function newDebt(amount = 10000) {
  const debt = await createExternalDebt(
    {
      name: `Loan ${crypto.randomUUID()}`,
      original_amount_cents: cents(amount),
      household_id: "household-1",
    },
    USER_ID
  );
  await db.syncQueue.clear();
  await db.events.clear();
  return debt;
}

const pay = (debtId: string, amount: number, transactionId = crypto.randomUUID()) =>
  processDebtPayment(
    {
      transaction_id: transactionId,
      amount_cents: cents(amount),
      payment_date: "2026-10-06",
      debt_id: debtId,
      household_id: "household-1",
    },
    USER_ID
  );

async function queuedTypes() {
  const items = await db.syncQueue.toArray();
  items.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return items.map((item) => `${item.entity_type}:${item.operation.op}`);
}

describe("payment and reversal outbox writes", () => {
  beforeEach(async () => {
    await Promise.all([
      db.debts.clear(),
      db.debtPayments.clear(),
      db.events.clear(),
      db.syncQueue.clear(),
    ]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("queues the payment row in server shape", async () => {
    const debt = await newDebt();
    const { payment } = await pay(debt.id, 2500);
    expect(await queuedTypes()).toEqual(["debt_payment:create"]);
    const [item] = await db.syncQueue.toArray();
    expect(item?.operation.payload).not.toHaveProperty("idempotency_key");
    expect(item?.operation.payload).toMatchObject({
      id: payment.id,
      debt_id: debt.id,
      amount_cents: 2500,
    });
  });

  it("queues the status change after the payment that pays a debt off", async () => {
    const debt = await newDebt(2500);
    await pay(debt.id, 2500);
    expect(await queuedTypes()).toEqual(["debt_payment:create", "debt:update"]);
    expect((await db.debts.get(debt.id))?.status).toBe("paid_off");
  });

  it("writes no payment, status or queue item when the transaction throws", async () => {
    const debt = await newDebt(2500);
    vi.spyOn(db.events, "bulkAdd").mockRejectedValueOnce(new Error("boom"));
    await expect(pay(debt.id, 2500)).rejects.toThrow("boom");
    expect(await db.debtPayments.count()).toBe(0);
    expect((await db.debts.get(debt.id))?.status).toBe("active");
    expect(await db.syncQueue.count()).toBe(0);
  });

  it("queues a linked reversal and reactivates a paid-off debt", async () => {
    const debt = await newDebt(2500);
    const { payment } = await pay(debt.id, 2500);
    await db.syncQueue.clear();

    const { reversal } = await reverseDebtPayment(
      { payment_id: payment.id, reason: "test" },
      USER_ID
    );
    expect(reversal.amount_cents).toBe(-2500);
    expect(await queuedTypes()).toEqual(["debt_payment:create", "debt:update"]);
    expect((await db.debts.get(debt.id))?.status).toBe("active");
  });

  it("chains reverse-then-repay against the same working balance", async () => {
    const debt = await newDebt(10000);
    const transactionId = crypto.randomUUID();
    await pay(debt.id, 10000, transactionId); // paid off
    await db.syncQueue.clear();

    await handleTransactionEdit(
      {
        transaction_id: transactionId,
        new_amount_cents: cents(4000),
        new_debt_id: debt.id,
        payment_date: "2026-10-06",
      },
      USER_ID
    );
    // reversal (+10000 back) reactivates, the 4000 re-payment leaves 6000 owed: one net status flip
    expect(await queuedTypes()).toEqual([
      "debt_payment:create",
      "debt:update",
      "debt_payment:create",
    ]);
    expect((await db.debts.get(debt.id))?.status).toBe("active");
  });
});
